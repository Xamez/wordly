import type { ServerInit } from '@sveltejs/kit';
import { initializeWordLibrary } from '$lib/server/word';
import { initializeSocketServer } from '$lib/server/socket';

export const init: ServerInit = async () => {
	await Promise.all([initializeSocketServer(), initializeWordLibrary()]);
};
