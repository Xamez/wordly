<script lang="ts">
	import { socket } from '$lib/stores/socket';
	import { toasts } from '$lib/stores/toast';
	import { onMount } from 'svelte';

	onMount(() => {
		socket.on('toast', (data: { type: 'info' | 'success' | 'warning' | 'error'; message: string }) => {
			if (data.type === 'info') toasts.info(data.message);
			if (data.type === 'success') toasts.success(data.message);
			if (data.type === 'warning') toasts.warning(data.message);
			if (data.type === 'error') toasts.error(data.message);
		});

		return () => {
			socket.off('toast');
		};
	});
</script>

<div class="toast-container">
	{#each $toasts as toast (toast.id)}
		<div class="toast toast-{toast.type}" role="alert">
			<div class="toast-content">
				<p>{toast.message}</p>
			</div>
			<button class="toast-close" aria-label="Close" onclick={() => toasts.remove(toast.id)}> × </button>
		</div>
	{/each}
</div>

<style>
	.toast-container {
		position: fixed;
		top: 1rem;
		right: 1rem;
		z-index: 50;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-width: 24rem;
	}

	.toast {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		border-radius: 0.375rem;
		box-shadow:
			0 4px 6px -1px rgba(0, 0, 0, 0.1),
			0 2px 4px -1px rgba(0, 0, 0, 0.06);
		animation: slide-in 0.2s ease-out;
	}

	.toast-info {
		background-color: #e0f2fe;
		border-left: 4px solid #0ea5e9;
	}

	.toast-success {
		background-color: #dcfce7;
		border-left: 4px solid #22c55e;
	}

	.toast-warning {
		background-color: #fef9c3;
		border-left: 4px solid #eab308;
	}

	.toast-error {
		background-color: #fee2e2;
		border-left: 4px solid #ef4444;
	}

	.toast-content {
		flex: 1;
	}

	.toast-close {
		background: none;
		border: none;
		font-size: 1.25rem;
		line-height: 1;
		cursor: pointer;
		padding: 0.25rem;
	}

	@keyframes slide-in {
		from {
			transform: translateX(100%);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}
</style>
