import { Server } from 'socket.io';

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
}

interface ClientToServerEvents {
	'join-room': (roomId: string, playerName: string, callback: (success: boolean, isOwner: boolean) => void) => void;
	'leave-room': (roomId: string, callback: (success: boolean) => void) => void;
	'start-game': (roomId: string, callback: (success: boolean) => void) => void;
	'end-game': (roomId: string, callback: (success: boolean) => void) => void;
	'submit-word': (data: { roomId: string; word: string }, callback: (result: WordResultData) => void) => void;
	'get-room-players': (roomId: string, callback: (players: GamePlayer[], ownerId: string) => void) => void;
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
	activePlayers?: Set<string>;
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

	function updateActivePlayersList(roomId: string) {
		if (!rooms[roomId]) return;

		if (!rooms[roomId].activePlayers) {
			rooms[roomId].activePlayers = new Set();
		}

		rooms[roomId].activePlayers.clear();

		for (const [id, gamePlayer] of rooms[roomId].players.entries()) {
			if (!gamePlayer.isSpectator) {
				rooms[roomId].activePlayers.add(id);
			}
		}
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

					if (rooms[previousRoomId].activePlayers) {
						rooms[previousRoomId].activePlayers.delete(socket.id);
					}

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
					activePlayers: new Set()
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

			if (!rooms[roomId].activePlayers) {
				rooms[roomId].activePlayers = new Set();
			}
			rooms[roomId].activePlayers.add(socket.id);

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

				if (rooms[roomId].activePlayers) {
					rooms[roomId].activePlayers.delete(socket.id);
				}

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
			if (rooms[roomId] && rooms[roomId].players.has(socket.id) && rooms[roomId].owner === socket.id) {
				rooms[roomId].players.forEach((player) => {
					player.lives = DEFAULT_LIVES;
					player.isSpectator = false;
				});

				updateActivePlayersList(roomId);

				const gameData: GameStartData = {
					roomId,
					players: Array.from(rooms[roomId].players.values()),
					startTime: Date.now()
				};

				io.to(roomId).emit('game-started', gameData);
				emitRoomPlayersUpdate(roomId);
				callback(true);
			} else {
				callback(false);
			}
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
			const { roomId, word } = data;
			if (rooms[roomId] && rooms[roomId].players.has(socket.id)) {
				const gamePlayer = rooms[roomId].players.get(socket.id)!;

				if (gamePlayer.isSpectator) {
					callback({
						correct: false,
						feedback: 'You are a spectator and cannot submit words',
						livesLeft: 0,
						isEliminated: true
					});
					return;
				}

				const isCorrect = word.length >= 3;

				if (!isCorrect && gamePlayer.lives > 0) {
					gamePlayer.lives--;

					io.to(roomId).emit('player-lost-life', socket.id, gamePlayer.lives);

					if (gamePlayer.lives <= 0) {
						gamePlayer.isSpectator = true;
						io.to(roomId).emit('player-eliminated', socket.id);

						if (rooms[roomId].activePlayers) {
							rooms[roomId].activePlayers.delete(socket.id);
						}
					}

					rooms[roomId].players.set(socket.id, gamePlayer);
					emitRoomPlayersUpdate(roomId);
				}

				const result: WordResultData = {
					correct: isCorrect,
					score: isCorrect ? word.length : 0,
					livesLeft: gamePlayer.lives,
					isEliminated: gamePlayer.lives <= 0
				};

				callback(result);
			} else {
				callback({
					correct: false,
					feedback: 'Not in room'
				});
			}
		});

		socket.on('disconnect', () => {
			console.log(`User disconnected: ${socket.id}`);

			if (socket.data.activeRoom) {
				const roomId = socket.data.activeRoom;
				if (rooms[roomId]) {
					rooms[roomId].players.delete(socket.id);

					if (rooms[roomId].activePlayers) {
						rooms[roomId].activePlayers.delete(socket.id);
					}

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
