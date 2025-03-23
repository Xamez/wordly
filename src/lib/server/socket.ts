import { Server } from 'socket.io';
import { containsSequence, generateLetters, isValidWord } from './word';

interface ServerToClientEvents {
    'room-joined': (roomId: string, isOwner: boolean) => void;
    'room-left': (roomId: string) => void;
    'game-started': (data: GameStartData) => void;
    'game-ended': (data: GameEndData) => void;
    'word-result': (data: WordResultData) => void;
    'player-joined': (playerId: string) => void;
    'player-left': (playerId: string) => void;
    'room-players': (players: GamePlayer[], ownerId: string) => void;
    'player-lost-life': (playerId: string, livesLeft: number) => void;
    'player-eliminated': (playerId: string) => void; // New event for elimination
    'player-typing-update': (playerId: string, input: string, timeRemaining: number) => void;
}

interface ClientToServerEvents {
    'join-room': (roomId: string, playerName: string, callback: (success: boolean, isOwner: boolean) => void) => void;
    'leave-room': (roomId: string, callback: (success: boolean) => void) => void;
    'start-game': (roomId: string, callback: (success: boolean) => void) => void;
    'end-game': (roomId: string, callback: (success: boolean) => void) => void;
    'submit-word': (data: { roomId: string; word: string; timeRemaining: number }, callback: (result: WordResultData) => void) => void;
    'get-room-players': (roomId: string, callback: (players: GamePlayer[], ownerId: string) => void) => void;
    'player-typing': (data: { roomId: string; input: string; timeRemaining: number }) => void;
}

interface SocketData {
    userId: string;
    activeRoom?: string;
    playerName?: string;
}

interface GameStartData {
    roomId: string;
    players: GamePlayer[];
    startTime: number;
}

interface GameEndData {
    roomId: string;
    winner?: string;
    scores: Record<string, number>;
}

interface WordResultData {
    correct: boolean;
    score?: number;
    feedback?: string;
    livesLeft?: number;
    isEliminated?: boolean;
}

export interface GamePlayer {
    id: string;
    name: string;
    lives: number;
    isSpectator: boolean;
}

interface Room {
    players: Map<string, GamePlayer>;
    owner: string;
    currentLetters?: string;
    currentPlayerIndex?: number;
    playerOrder?: string[];
    usedWords?: Set<string>;
}

const DEFAULT_LIVES = 2;

export async function initializeSocketServer() {
    const io = new Server<ClientToServerEvents, ServerToClientEvents, SocketData>(3001, {
        cors: { origin: '*' }
    });

    const rooms: Record<string, Room> = {};

    function emitRoomPlayersUpdate(roomId: string) {
        if (rooms[roomId]) {
            const players = Array.from(rooms[roomId].players.values());
            const ownerId = rooms[roomId].owner;
            console.log('Emitting room players update', players, ownerId);
            io.to(roomId).emit('room-players', players, ownerId);
        }
    }

    function reassignRoomOwner(roomId: string, currentOwnerId: string) {
        if (rooms[roomId] && rooms[roomId].owner === currentOwnerId && rooms[roomId].players.size > 0) {
            let nextOwner = '';

            for (const [id, gamePlayer] of rooms[roomId].players.entries()) {
                if (!gamePlayer.isSpectator) {
                    nextOwner = id;
                    break;
                }
            }

            if (!nextOwner && rooms[roomId].players.size > 0) {
                nextOwner = Array.from(rooms[roomId].players.keys())[0];
            }

            if (nextOwner) {
                rooms[roomId].owner = nextOwner;
                io.to(nextOwner).emit('room-joined', roomId, true);

                emitRoomPlayersUpdate(roomId);
                return true;
            }
        }
        return false;
    }

    function startGame(io: Server, room: Room, roomId: string) {
        room.usedWords = new Set();

        if (room.players.size < 2) {
            io.to(roomId).emit('game-error', 'Need at least 2 players to start the game');
            return;
        }

        room.playerOrder = Array.from(room.players.keys());
        room.currentPlayerIndex = Math.floor(Math.random() * room.playerOrder.length);

        room.currentLetters = generateLetters();

        const playersList = Array.from(room.players.values());

        io.to(roomId).emit('game-started', {
            roomId,
            players: playersList,
            startTime: Date.now(),
            currentPlayer: room.playerOrder[room.currentPlayerIndex],
            currentLetters: room.currentLetters
        });
    }

    function nextTurn(io: Server, room: Room, roomId: string) {
        if (!room.playerOrder || room.currentPlayerIndex === undefined) {
            console.log('Game not properly initialized');
            return;
        }

        const alivePlayers = room.playerOrder.filter(
            (playerId) => room.players.get(playerId) && room.players.get(playerId)!.lives > 0
        );

        if (alivePlayers.length <= 1) {
            const winner = alivePlayers.length === 1 ? alivePlayers[0] : undefined;
            const scores: Record<string, number> = {};

            room.players.forEach((player, id) => {
                scores[id] = player.lives;
            });

            io.to(roomId).emit('game-ended', {
                roomId,
                winner,
                scores
            });

            room.currentLetters = undefined;
            room.currentPlayerIndex = undefined;
            room.playerOrder = undefined;
            room.usedWords = undefined;

            return;
        }

        do {
            room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.playerOrder.length;
        } while (room.players.get(room.playerOrder[room.currentPlayerIndex])!.lives <= 0);

        if (!room.currentLetters) {
            room.currentLetters = generateLetters();
        }

        io.to(roomId).emit('next-turn', {
            currentPlayer: room.playerOrder[room.currentPlayerIndex],
            currentLetters: room.currentLetters
        });
    }

    io.on('connection', (socket) => {
        console.log(`User connected: ${socket.id}`);
        socket.data.userId = socket.id;

        socket.on('join-room', (roomId, playerName, callback) => {
            let isOwner = false;
            socket.data.playerName = playerName || `Player ${socket.id.substring(0, 4)}`;

            if (socket.data.activeRoom && socket.data.activeRoom !== roomId) {
                const previousRoomId = socket.data.activeRoom;

                if (rooms[previousRoomId] && rooms[previousRoomId].players.has(socket.id)) {
                    console.log(`Player ${socket.id} leaving previous room ${previousRoomId} before joining ${roomId}`);

                    rooms[previousRoomId].players.delete(socket.id);

                    socket.leave(previousRoomId);

                    reassignRoomOwner(previousRoomId, socket.id);

                    if (rooms[previousRoomId].players.size === 0) {
                        delete rooms[previousRoomId];
                    } else {
                        socket.to(previousRoomId).emit('player-left', socket.id);
                        emitRoomPlayersUpdate(previousRoomId);
                    }

                    socket.emit('room-left', previousRoomId);
                }
            }

            if (!rooms[roomId]) {
                console.log('Creating new room', roomId);

                rooms[roomId] = {
                    players: new Map(),
                    owner: socket.id,
                };
                isOwner = true;
            } else {
                console.log(`Player ${socket.id} joining existing room ${roomId}`);

                if (rooms[roomId].players.has(socket.id)) {
                    console.log(`Player ${socket.id} already in room ${roomId}, updating information`);
                    const existingPlayer = rooms[roomId].players.get(socket.id)!;
                    existingPlayer.name = socket.data.playerName;
                    rooms[roomId].players.set(socket.id, existingPlayer);
                }
            }

            const gamePlayer: GamePlayer = {
                id: socket.id,
                name: socket.data.playerName,
                lives: DEFAULT_LIVES,
                isSpectator: false
            };

            rooms[roomId].players.set(socket.id, gamePlayer);

            socket.join(roomId);
            socket.data.activeRoom = roomId;

            socket.to(roomId).emit('player-joined', socket.id);
            socket.emit('room-joined', roomId, isOwner || rooms[roomId].owner === socket.id);

            emitRoomPlayersUpdate(roomId);

            callback(true, isOwner || rooms[roomId].owner === socket.id);
        });

        socket.on('get-room-players', (roomId, callback) => {
            if (rooms[roomId]) {
                const players = Array.from(rooms[roomId].players.values());
                callback(players, rooms[roomId].owner);
            } else {
                callback([], '');
            }
        });

        socket.on('leave-room', (roomId, callback) => {
            if (rooms[roomId] && rooms[roomId].players.has(socket.id)) {
                rooms[roomId].players.delete(socket.id);

                socket.leave(roomId);

                reassignRoomOwner(roomId, socket.id);

                if (rooms[roomId].players.size === 0) {
                    delete rooms[roomId];
                } else {
                    emitRoomPlayersUpdate(roomId);
                }

                socket.data.activeRoom = undefined;
                socket.to(roomId).emit('player-left', socket.id);
                socket.emit('room-left', roomId);
                callback(true);
            } else {
                callback(false);
            }
        });

        socket.on('start-game', (roomId, callback) => {
            const room = rooms[roomId];
            if (!room) {
                callback(false);
                return;
            }

            if (room.owner !== socket.id) {
                callback(false);
                return;
            }

            for (const player of room.players.values()) {
                player.lives = DEFAULT_LIVES;
                player.isSpectator = false;
            }

            startGame(io, room, roomId);
            callback(true);
        });

        socket.on('end-game', (roomId, callback) => {
            if (rooms[roomId] && rooms[roomId].players.has(socket.id) && rooms[roomId].owner === socket.id) {
                const scores: Record<string, number> = {};
                rooms[roomId].players.forEach((player, id) => {
                    scores[id] = player.lives;
                });

                let winner = '';
                let maxLives = -1;

                rooms[roomId].players.forEach((player, id) => {
                    if (player.lives > maxLives) {
                        maxLives = player.lives;
                        winner = id;
                    }
                });

                const gameData: GameEndData = {
                    roomId,
                    winner,
                    scores
                };

                io.to(roomId).emit('game-ended', gameData);
                callback(true);
            } else {
                callback(false);
            }
        });

        socket.on('submit-word', (data, callback) => {
            const { roomId, word, timeRemaining } = data;
            const room = rooms[roomId];
            if (!room) {
                callback({
                    correct: false,
                    feedback: 'Room not found'
                });
                return;
            }

            const player = room.players.get(socket.id);
            if (!player) {
                callback({
                    correct: false,
                    feedback: 'Player not found in room'
                });
                return;
            }

            const isTimeUp = timeRemaining <= 0;

            if (isTimeUp) {
                player.lives--;
            }

            if (isTimeUp) {

                let feedback = 'Time is up';

                if (player.lives <= 0) {
                    console.log('Player eliminated', socket.id);
                    io.to(roomId).emit('player-eliminated', socket.id);
                    feedback = 'You have been eliminated';
                } else {
                    console.log('Player lost life', socket.id, player.lives);
                    io.to(roomId).emit('player-lost-life', socket.id, player.lives);
                }

                callback({
                    correct: false,
                    feedback,
                    livesLeft: player.lives
                });
                nextTurn(io, room, roomId);
                return;
            }

            if (player.isSpectator) {
                callback({
                    correct: false,
                    feedback: 'You are a spectator and cannot submit words',
                    isEliminated: true
                });
                return;
            }

            if (!room.playerOrder || room.currentPlayerIndex === undefined) {
                callback({
                    correct: false,
                    feedback: 'Game not properly initialized'
                });
                return;
            }

            if (room.playerOrder[room.currentPlayerIndex] !== socket.id) {
                callback({
                    correct: false,
                    feedback: 'Not your turn'
                });
                return;
            }

            if (!isValidWord(word)) {
                callback({
                    correct: false,
                    feedback: 'Not a valid word'
                });
                return;
            }

            if (!room.usedWords) {
                room.usedWords = new Set();
            }

            if (room.usedWords.has(word.toLowerCase())) {
                callback({
                    correct: false,
                    feedback: 'This word has already been used'
                });
                return;
            }

            if (!room.currentLetters || !containsSequence(word, room.currentLetters)) {

                callback({
                    correct: false,
                    feedback: `Word does not contain "${room.currentLetters || ''}"`,
                    livesLeft: player.lives
                });

            } else {

                room.usedWords.add(word.toLowerCase());

                callback({
                    correct: true,
                    feedback: 'Correct!',
                    livesLeft: player.lives
                });

                nextTurn(io, room, roomId);

            }
        });

        socket.on('player-typing', (data) => {
            const { roomId, input, timeRemaining } = data;

            if (!rooms[roomId]) return;

            if (
                rooms[roomId].playerOrder &&
                rooms[roomId].currentPlayerIndex !== undefined &&
                rooms[roomId].playerOrder[rooms[roomId].currentPlayerIndex] === socket.id
            ) {
                socket.to(roomId).emit('player-typing-update', socket.id, input, timeRemaining);
            }
        });

        socket.on('disconnect', () => {
            console.log(`User disconnected: ${socket.id}`);

            if (socket.data.activeRoom) {
                const roomId = socket.data.activeRoom;
                if (rooms[roomId]) {
                    rooms[roomId].players.delete(socket.id);

                    reassignRoomOwner(roomId, socket.id);

                    if (rooms[roomId].players.size === 0) {
                        delete rooms[roomId];
                    } else {
                        socket.to(roomId).emit('player-left', socket.id);
                        emitRoomPlayersUpdate(roomId);
                    }
                }
            }
        });
    });

    console.log('Socket.IO server initialized on port 3001');
    return io;
}
