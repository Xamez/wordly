<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import type { GamePlayer } from '$lib/server/socket';
	import { getSocketClient, playerData } from '$lib/stores/socket';
	import { onMount } from 'svelte';

	let players: GamePlayer[] = [];
	let roomOwner: string = '';
	let socketClient: ReturnType<typeof getSocketClient>;
	let errorMessage = '';
	let loading = true;

	const roomId = $page.params.roomId;

	async function joinRoom() {
		try {
			loading = true;

			if (!socketClient.connected) {
				console.log('Socket not connected, attempting to connect');
				const result = await socketClient.joinRoom(roomId);

				if (!result.success) {
					errorMessage = 'Failed to join room';
					console.error('Failed to join room');
					return;
				}
			}

			await new Promise((resolve) => setTimeout(resolve, 100));

			const roomData = await socketClient.getRoomPlayers();
			console.log('Room data received:', roomData);
			players = roomData.players;
			roomOwner = roomData.ownerId;
			loading = false;
		} catch (error) {
			console.error('Error joining room:', error);
			errorMessage = 'Error joining room';
			loading = false;
		}
	}

	async function leaveRoom() {
		if (socketClient) {
			await socketClient.leaveRoom();
			goto('/');
		}
	}

	async function startGame() {
		if (socketClient && socketClient.isOwner) {
			try {
				console.log('Attempting to start game');
				const success = await socketClient.startGame();
				console.log('Game start result:', success);

				if (success) {
					console.log('Game started successfully, navigating to game page');
					goto(`/game/${roomId}`);
				} else {
					console.error('Failed to start game');
					errorMessage = 'Failed to start game. Please try again.';
				}
			} catch (error) {
				console.error('Error starting game:', error);
				errorMessage = 'Error starting game';
			}
		} else {
			console.error('Cannot start game: not the room owner');
		}
	}

	onMount(async () => {
		if (!$playerData || !$playerData.name) {
			goto('/');
			return;
		}

		socketClient = getSocketClient($playerData.name);

		socketClient.onRoomPlayersUpdate((updatedPlayers, ownerId) => {
			console.log('Room players update received:', updatedPlayers);
			players = updatedPlayers;
			roomOwner = ownerId;
		});

		socketClient.onGameStarted((data) => {
			console.log('Game started event received:', data);
			goto(`/game/${roomId}`);
		});

		if (socketClient.room === roomId) {
			console.log('Already in room, refreshing players');
			const roomData = await socketClient.getRoomPlayers();
			players = roomData.players;
			roomOwner = roomData.ownerId;
			loading = false;
		} else if (socketClient.room && socketClient.room !== roomId) {
			console.log('In a different room, leaving first');
			await socketClient.leaveRoom();
			await joinRoom();
		} else {
			console.log('Not in any room, joining now');
			await joinRoom();
		}
	});
</script>

<svelte:head>
	<title>Waiting Room - {roomId}</title>
</svelte:head>

<div class="container">
	<div class="waiting-room">
		<header>
			<h1>Waiting Room</h1>
			<div class="room-info">
				<span class="room-id">Room ID: <strong>{roomId}</strong></span>
				{#if socketClient && socketClient.isOwner}
					<span class="owner-badge">Room Owner</span>
				{/if}
			</div>
		</header>

		{#if loading}
			<div class="loading">Loading room data...</div>
		{:else if errorMessage}
			<div class="error-message">{errorMessage}</div>
		{:else}
			<div class="players-section">
				<h2>Players ({players.length})</h2>
				<ul class="players-list">
					{#each players as player}
						<li class="player-item">
							<span class="player-name">{player.name}</span>
							{#if player.id === roomOwner}
								<span class="owner-tag">Owner</span>
							{/if}
						</li>
					{/each}
				</ul>
			</div>

			<div class="actions">
				{#if socketClient && socketClient.isOwner}
					<button class="primary-button" on:click={startGame} disabled={players.length < 2}> Start Game </button>
					{#if players.length < 2}
						<p class="hint">Need at least 2 players to start</p>
					{/if}
				{/if}

				<button class="secondary-button" on:click={leaveRoom}> Leave Room </button>
			</div>
		{/if}
	</div>
</div>

<style>
	.container {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 100vh;
		background-color: #f5f5f5;
		padding: 20px;
	}

	.waiting-room {
		background-color: white;
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
		padding: 30px;
		width: 100%;
		max-width: 600px;
	}

	header {
		margin-bottom: 30px;
		text-align: center;
	}

	h1 {
		color: #333;
		margin-bottom: 10px;
	}

	h2 {
		color: #555;
		font-size: 1.2rem;
		margin-bottom: 15px;
	}

	.room-info {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		margin-top: 10px;
	}

	.room-id {
		font-size: 1.1rem;
		color: #555;
	}

	.owner-badge {
		background-color: #4caf50;
		color: white;
		padding: 4px 10px;
		border-radius: 20px;
		font-size: 0.8rem;
	}

	.players-section {
		margin: 30px 0;
	}

	.players-list {
		list-style: none;
		padding: 0;
		margin: 0;
		border: 1px solid #eee;
		border-radius: 6px;
	}

	.player-item {
		padding: 12px 15px;
		border-bottom: 1px solid #eee;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.player-item:last-child {
		border-bottom: none;
	}

	.player-name {
		font-weight: 500;
	}

	.owner-tag {
		background-color: #4caf50;
		color: white;
		padding: 2px 8px;
		border-radius: 10px;
		font-size: 0.7rem;
	}

	.actions {
		margin-top: 30px;
		display: flex;
		flex-direction: column;
		gap: 15px;
	}

	button {
		width: 100%;
		padding: 12px;
		border: none;
		border-radius: 4px;
		font-size: 16px;
		font-weight: 600;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	button:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}

	.primary-button {
		background-color: #4caf50;
		color: white;
	}

	.primary-button:hover:not(:disabled) {
		background-color: #3d9141;
	}

	.secondary-button {
		background-color: #f44336;
		color: white;
	}

	.secondary-button:hover:not(:disabled) {
		background-color: #d32f2f;
	}

	.text-button {
		background: none;
		color: #2196f3;
		padding: 0;
		font-weight: 500;
		text-decoration: underline;
		width: auto;
	}

	.loading,
	.error-message {
		text-align: center;
		margin: 30px 0;
		color: #555;
	}

	.error-message {
		color: #d32f2f;
	}

	.hint {
		color: #888;
		font-size: 0.9rem;
		text-align: center;
		margin-top: 5px;
	}
</style>
