import io from 'socket.io-client';
import { writable } from 'svelte/store';
import GameSocketClient from '$lib/client/socketClient';

export const socket = io('http://localhost:3001');

export interface PlayerData {
	name: string;
	roomId: string | null;
	isOwner: boolean;
}

export const playerData = writable<PlayerData | null>(null);

let socketClientInstance: GameSocketClient | null = null;

export function getSocketClient(playerName?: string): GameSocketClient {
	if (!socketClientInstance && playerName) {
		socketClientInstance = new GameSocketClient(playerName);
	} else if (socketClientInstance && playerName && playerName !== socketClientInstance.getPlayerName) {
		socketClientInstance.updatePlayerName(playerName);
	} else if (!socketClientInstance) {
		socketClientInstance = new GameSocketClient('Guest');
	}
	return socketClientInstance;
}

export function resetSocketClient() {
	if (socketClientInstance) {
		socketClientInstance.disconnect();
		socketClientInstance = null;
	}
}
