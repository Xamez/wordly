<script lang="ts">
	import type { GamePlayer } from '$lib/server/socket';
	import { onMount } from 'svelte';

	interface PositionedPlayer extends GamePlayer {
		x: number;
		y: number;
		isCurrentPlayer: boolean;
		isCurrentUser: boolean;
	}

	const {
		players = [],
		currentPlayerId = null,
		currentLetters = null,
		currentUserId
	} = $props<{
		players: GamePlayer[];
		currentPlayerId: string | null;
		currentLetters: string | null;
		currentUserId: string;
	}>();

	// Using Svelte 5 reactive state
	let containerWidth = $state(0);
	let containerHeight = $state(0);
	let positionedPlayers = $state<PositionedPlayer[]>([]);

	function updatePositionedPlayers() {
		if (!players.length) {
			positionedPlayers = [];
			return;
		}

		const radius = Math.min(containerWidth, containerHeight) * 0.4;
		const center = { x: containerWidth / 2, y: containerHeight / 2 };

		positionedPlayers = players.map((player: GamePlayer, index: number) => {
			const angle = (index / players.length) * 2 * Math.PI;
			return {
				...player,
				x: center.x + radius * Math.cos(angle),
				y: center.y + radius * Math.sin(angle),
				isCurrentPlayer: player.id === currentPlayerId,
				isCurrentUser: player.id === currentUserId
			};
		});
	}

	$effect(() => {
		if (containerWidth && containerHeight) {
			updatePositionedPlayers();
		}
	});

	onMount(() => {
		const resizeObserver = new ResizeObserver((entries) => {
			const entry = entries[0];
			containerWidth = entry.contentRect.width;
			containerHeight = entry.contentRect.height;
		});

		const container = document.getElementById('game-container');
		if (container) {
			resizeObserver.observe(container);
			containerWidth = container.clientWidth;
			containerHeight = container.clientHeight;
		}

		return () => {
			if (container) {
				resizeObserver.unobserve(container);
			}
		};
	});
</script>

<div id="game-container" class="relative h-full min-h-[400px] w-full">
	{#if currentLetters}
		<div
			class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transform rounded-lg bg-blue-100 p-4 text-4xl font-bold shadow-lg"
		>
			{currentLetters}
		</div>
	{/if}

	{#each positionedPlayers as player}
		<div
			class="absolute flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 transform items-center justify-center"
			style="left: {player.x}px; top: {player.y}px;"
		>
			<div
				class="flex h-full w-full flex-col items-center justify-center rounded-full p-1 text-center
                      {player.isCurrentPlayer
					? 'border-2 border-yellow-500 bg-yellow-300'
					: player.isCurrentUser
						? 'bg-blue-300'
						: player.isSpectator
							? 'bg-gray-300'
							: 'bg-green-200'} 
                      {player.lives <= 0 ? 'opacity-50' : ''}"
			>
				<span class="w-full truncate text-xs font-semibold">{player.name}</span>
				{#if !player.isSpectator}
					<span class="text-xs">❤️ {player.lives}</span>
				{/if}
			</div>
		</div>
	{/each}
</div>
