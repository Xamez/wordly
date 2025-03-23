import { writable } from 'svelte/store';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
	id: string;
	message: string;
	type: ToastType;
	timeout?: number;
}

function createToastStore() {
	const { subscribe, update } = writable<Toast[]>([]);

	function addToast(message: string, type: ToastType = 'info', timeout = 5000) {
		console.log('[TOAST] ' + message);

		const id = crypto.randomUUID();

		update((toasts) => [...toasts, { id, message, type, timeout }]);

		if (timeout) {
			setTimeout(() => {
				removeToast(id);
			}, timeout);
		}

		return id;
	}

	function removeToast(id: string) {
		update((toasts) => toasts.filter((toast) => toast.id !== id));
	}

	return {
		subscribe,
		info: (message: string, timeout?: number) => addToast(message, 'info', timeout),
		success: (message: string, timeout?: number) => addToast(message, 'success', timeout),
		warning: (message: string, timeout?: number) => addToast(message, 'warning', timeout),
		error: (message: string, timeout?: number) => addToast(message, 'error', timeout),
		remove: removeToast
	};
}

export const toasts = createToastStore();
