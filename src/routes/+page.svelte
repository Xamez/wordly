<script lang="ts">
	import { goto } from '$app/navigation';
	import { getSocketClient, playerData } from '$lib/stores/socket';
	import { onMount } from 'svelte';

	let playerName = '';
	let roomId = '';
	let errorMessage = '';
	let isJoining = false;

	onMount(() => {
		if ($playerData) {
			playerName = $playerData.name;
		}
	});

	async function createRoom() {
		if (!playerName.trim()) {
			errorMessage = 'Please enter your name';
			return;
		}

		// Generate a random room ID
		const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
		await joinRoom(newRoomId);
	}

	async function joinRoom(roomIdToJoin: string = roomId) {
		if (!playerName.trim()) {
			errorMessage = 'Please enter your name';
			return;
		}

		if (!roomIdToJoin.trim()) {
			errorMessage = 'Please enter a room ID';
			return;
		}

		isJoining = true;
		errorMessage = '';

		try {
			const socketClient = getSocketClient(playerName);

			const result = await socketClient.joinRoom(roomIdToJoin);

			if (result.success) {
				$playerData = {
					name: playerName,
					roomId: roomIdToJoin,
					isOwner: result.isOwner
				};

				goto(`/room/${roomIdToJoin}`);
			} else {
				errorMessage = 'Failed to join room';
			}
		} catch (error) {
			console.error('Error joining room:', error);
			errorMessage = 'Error connecting to server';
		} finally {
			isJoining = false;
		}
	}
</script>

<svelte:head>
	<title>Wordly - Join or Create a Game</title>
</svelte:head>

<div class="container">
	<div class="welcome-card">
		<h1>Welcome to Wordly</h1>
		<p>A multiplayer word game where players take turns</p>

		<div class="input-group">
			<label for="player-name">Your Name</label>
			<input id="player-name" type="text" bind:value={playerName} placeholder="Enter your name" maxlength="15" />
		</div>

		<div class="actions">
			<button class="primary-button" on:click={createRoom} disabled={isJoining}> Create New Room </button>

			<div class="divider">OR</div>

			<div class="input-group">
				<label for="room-id">Room ID</label>
				<input id="room-id" type="text" bind:value={roomId} placeholder="Enter room ID" maxlength="6" />
			</div>

			<button class="secondary-button" on:click={() => joinRoom()} disabled={isJoining}> Join Room </button>
		</div>

		{#if errorMessage}
			<div class="error-message">
				{errorMessage}
			</div>
		{/if}

		{#if isJoining}
			<div class="loading">Connecting...</div>
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

	.welcome-card {
		background-color: white;
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
		padding: 30px;
		width: 100%;
		max-width: 480px;
		text-align: center;
	}

	h1 {
		color: #333;
		margin-bottom: 10px;
	}

	.input-group {
		margin: 20px 0;
		text-align: left;
	}

	label {
		display: block;
		margin-bottom: 5px;
		font-weight: 500;
		color: #555;
	}

	input {
		width: 100%;
		padding: 12px;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-size: 16px;
	}

	.actions {
		margin-top: 20px;
	}

	.divider {
		margin: 20px 0;
		color: #888;
		position: relative;
	}

	.divider::before,
	.divider::after {
		content: '';
		position: absolute;
		top: 50%;
		width: 30%;
		height: 1px;
		background-color: #ddd;
	}

	.divider::before {
		left: 0;
	}

	.divider::after {
		right: 0;
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
		background-color: #2196f3;
		color: white;
	}

	.secondary-button:hover:not(:disabled) {
		background-color: #0d8bed;
	}

	.error-message {
		margin-top: 20px;
		color: #d32f2f;
		font-weight: 500;
	}

	.loading {
		margin-top: 20px;
		color: #555;
		font-style: italic;
	}
</style>
