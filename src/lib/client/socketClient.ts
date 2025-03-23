import type { GamePlayer } from '$lib/server/socket';
import { socket } from '$lib/stores/socket';

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
	'player-eliminated': (playerId: string) => void;
}

interface ClientToServerEvents {
	'join-room': (roomId: string, playerName: string, callback: (success: boolean, isOwner: boolean) => void) => void;
	'leave-room': (roomId: string, callback: (success: boolean) => void) => void;
	'start-game': (roomId: string, callback: (success: boolean) => void) => void;
	'end-game': (roomId: string, callback: (success: boolean) => void) => void;
	'submit-word': (data: { roomId: string; word: string }, callback: (result: WordResultData) => void) => void;
	'get-room-players': (roomId: string, callback: (players: GamePlayer[], ownerId: string) => void) => void;
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

class GameSocketClient {
	private socket: Socket<ServerToClientEvents, ClientToServerEvents>;
	private currentRoom: string | null = null;
	private isRoomOwner: boolean = false;
	private roomPlayers: GamePlayer[] = [];
	private roomOwnerId: string = '';
	private playerName: string;
	private isSpectator: boolean = false;

	constructor(playerName: string = 'Player') {
		this.socket = socket;
		this.playerName = playerName;

		// Check if socket is already connected
		if (this.socket.connected) {
			console.log('Using existing socket connection:', this.socket.id);
		} else {
			this.socket.connect();

			this.socket.on('connect', () => {
				console.log('Connected to server with ID:', this.socket.id);
			});
		}

		this.socket.on('disconnect', () => {
			console.log('Disconnected from server');
			// Don't reset room data on disconnects - we might reconnect
		});

		this.setupEventHandlers();
	}

	private setupEventHandlers() {
		this.socket.on('room-players', (players: GamePlayer[], ownerId: string) => {
			console.log('Received room-players event:', players, ownerId);
			this.roomPlayers = players;
			this.roomOwnerId = ownerId;
			this.isRoomOwner = this.socket.id === ownerId;

			const currentPlayer = players.find((p) => p.id === this.socket.id);
			if (currentPlayer) {
				this.isSpectator = currentPlayer.isSpectator;
			}
		});

		this.socket.on('player-eliminated', (playerId: string) => {
			if (playerId === this.socket.id) {
				this.isSpectator = true;
			}
		});

		this.socket.on('room-joined', (roomId: string, isOwner: boolean) => {
			console.log('Room joined:', roomId, 'Is owner:', isOwner);
			this.currentRoom = roomId;
			this.isRoomOwner = isOwner;
		});
	}

	public joinRoom(roomId: string): Promise<{ success: boolean; isOwner: boolean }> {
		console.log(`Attempting to join room ${roomId} with player ${this.playerName}`);

		return new Promise((resolve) => {
			if (!this.socket.connected) {
				console.log('Socket not connected, connecting first...');
				this.socket.connect();
			}

			this.socket.emit('join-room', roomId, this.playerName, (success: boolean, isOwner: boolean) => {
				console.log(`Join room result: success=${success}, isOwner=${isOwner}`);
				if (success) {
					this.currentRoom = roomId;
					this.isRoomOwner = isOwner;
					this.isSpectator = false;

					// Get latest room players after joining
					this.getRoomPlayers().catch((err) => console.error('Error getting room players:', err));
				}
				resolve({ success, isOwner });
			});
		});
	}

	public leaveRoom(): Promise<boolean> {
		if (!this.currentRoom) {
			return Promise.resolve(false);
		}

		return new Promise((resolve) => {
			this.socket.emit('leave-room', this.currentRoom, (success: boolean) => {
				if (success) {
					this.currentRoom = null;
					this.isRoomOwner = false;
					this.roomPlayers = [];
					this.roomOwnerId = '';
					this.isSpectator = false;
				}
				resolve(success);
			});
		});
	}

	public getRoomPlayers(): Promise<{ players: GamePlayer[]; ownerId: string }> {
		if (!this.currentRoom) {
			return Promise.resolve({ players: [], ownerId: '' });
		}

		return new Promise((resolve) => {
			this.socket.emit('get-room-players', this.currentRoom, (players: GamePlayer[], ownerId: string) => {
				this.roomPlayers = players;
				this.roomOwnerId = ownerId;

				const currentPlayer = players.find((p) => p.id === this.socket.id);
				if (currentPlayer) {
					this.isSpectator = currentPlayer.isSpectator;
				}

				resolve({ players, ownerId });
			});
		});
	}

	public startGame(): Promise<boolean> {
		if (!this.currentRoom || !this.isRoomOwner) {
			return Promise.resolve(false);
		}

		return new Promise((resolve) => {
			this.socket.emit('start-game', this.currentRoom, resolve);
		});
	}

	public endGame(): Promise<boolean> {
		if (!this.currentRoom || !this.isRoomOwner) {
			return Promise.resolve(false);
		}

		return new Promise((resolve) => {
			this.socket.emit('end-game', this.currentRoom, resolve);
		});
	}

	public submitWord(word: string): Promise<WordResultData> {
		if (!this.currentRoom) {
			return Promise.resolve({
				correct: false,
				feedback: 'Not in a room'
			});
		}

		if (this.isSpectator) {
			return Promise.resolve({
				correct: false,
				feedback: 'You are a spectator and cannot submit words',
				livesLeft: 0,
				isEliminated: true
			});
		}

		return new Promise((resolve) => {
			this.socket.emit(
				'submit-word',
				{
					roomId: this.currentRoom,
					word
				},
				(result: WordResultData) => {
					if (result.isEliminated) {
						this.isSpectator = true;
					}
					resolve(result);
				}
			);
		});
	}

	public onRoomJoined(callback: (roomId: string, isOwner: boolean) => void): void {
		this.socket.on('room-joined', callback);
	}

	public onRoomLeft(callback: (roomId: string) => void): void {
		this.socket.on('room-left', callback);
	}

	public onGameStarted(callback: (data: GameStartData) => void): void {
		this.socket.on('game-started', callback);
	}

	public onGameEnded(callback: (data: GameEndData) => void): void {
		this.socket.on('game-ended', callback);
	}

	public onPlayerJoined(callback: (playerId: string) => void): void {
		this.socket.on('player-joined', callback);
	}

	public onPlayerLeft(callback: (playerId: string) => void): void {
		this.socket.on('player-left', callback);
	}

	public onRoomPlayersUpdate(callback: (players: GamePlayer[], ownerId: string) => void): void {
		this.socket.on('room-players', callback);
	}

	public onPlayerLostLife(callback: (playerId: string, livesLeft: number) => void): void {
		this.socket.on('player-lost-life', callback);
	}

	public onPlayerEliminated(callback: (playerId: string) => void): void {
		this.socket.on('player-eliminated', callback);
	}

	public disconnect(): void {
		this.socket.disconnect();
	}

	public get id(): string | null {
		return this.socket.id;
	}

	public get connected(): boolean {
		return this.socket.connected;
	}

	public get room(): string | null {
		return this.currentRoom;
	}

	public get isOwner(): boolean {
		return this.isRoomOwner;
	}

	public get players(): GamePlayer[] {
		return [...this.roomPlayers];
	}

	public get activePlayers(): GamePlayer[] {
		return this.roomPlayers.filter((p) => !p.isSpectator);
	}

	public get spectators(): GamePlayer[] {
		return this.roomPlayers.filter((p) => p.isSpectator);
	}

	public get ownerId(): string {
		return this.roomOwnerId;
	}

	public get getPlayerName(): string {
		return this.playerName;
	}

	public updatePlayerName(newName: string): void {
		this.playerName = newName;
	}

	public getPlayerLives(playerId: string): number {
		const player = this.roomPlayers.find((p) => p.id === playerId);
		return player ? player.lives : 0;
	}

	public isPlayerSpectator(playerId: string): boolean {
		const player = this.roomPlayers.find((p) => p.id === playerId);
		return player ? player.isSpectator : false;
	}

	public getCurrentPlayer(): GamePlayer | undefined {
		return this.roomPlayers.find((p) => p.id === this.socket.id);
	}

	public get isCurrentPlayerSpectator(): boolean {
		return this.isSpectator;
	}
}

export default GameSocketClient;
