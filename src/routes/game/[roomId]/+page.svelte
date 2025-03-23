<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { getSocketClient } from '$lib/stores/socket';
	import type { GamePlayer } from '$lib/server/socket';
	import GameCircle from '../../../components/GameCircle.svelte';

	const roomId = $page.params.roomId;
	let socketClient: ReturnType<typeof getSocketClient>;

	let players: GamePlayer[] = [];
	let currentPlayerId: string | null = null;
	let currentLetters: string | null = null;
	let wordInput = '';
	let feedback = '';
	let isMyTurn = false;
	let gameStarted = false;
	let gameEnded = false;
	let winner: string | undefined;
	let scores: Record<string, number> = {};
	let loading = true;
	let error = '';

	let timeRemaining = 5;
	let timerInterval: ReturnType<typeof setInterval> | null = null;

	let currentPlayerInput = '';
	let currentPlayerTimeRemaining = 0;

	function startTimer() {
		if (timerInterval) clearInterval(timerInterval);

		timeRemaining = 5;

		timerInterval = setInterval(() => {
			timeRemaining--;

			if (isMyTurn && gameStarted) {
				socketClient.shareTypingUpdate(wordInput, isMyTurn, timeRemaining);
			}

			if (timeRemaining <= 0) {
				if (timerInterval !== null) clearInterval(timerInterval);
				timerInterval = null;

				if (isMyTurn && gameStarted) {
					submitTimeUp();
				}
			}
		}, 1000);
	}

	function stopTimer() {
		if (timerInterval) {
			clearInterval(timerInterval);
			timerInterval = null;
		}
	}

	async function submitTimeUp() {
		feedback = "Time's up!";
		const result = await socketClient.submitWord(wordInput.trim(), 0);
		feedback = result.feedback || 'You ran out of time!';
	}

	function validateRoom() {
		if (!socketClient || !socketClient.connected) {
			goto('/');
			return false;
		}

		if (socketClient.room !== roomId) {
			console.log('Not in the correct room. Redirecting...');
			goto('/');
			return false;
		}

		return true;
	}

	async function submitWord() {
		if (!wordInput.trim() || !isMyTurn || !gameStarted) return;

		feedback = 'Submitting...';
		const result = await socketClient.submitWord(wordInput.trim(), timeRemaining);

		feedback = result.feedback || '';

		wordInput = '';
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' && isMyTurn && gameStarted) {
			submitWord();
		}
	}

	function startGame() {
		if (socketClient && socketClient.isOwner && !gameStarted) {
			socketClient.startGame();
		}        
	}

	function leaveGame() {
		if (socketClient) {
			stopTimer();
			socketClient.leaveRoom();
			goto('/');
		}
	}

	function playAgain() {
		if (socketClient && socketClient.isOwner && gameEnded) {
			startGame();
		}
	}

	onMount(async () => {
		socketClient = getSocketClient();

		if (!validateRoom()) return;

		loading = false;

		socketClient.onRoomPlayersUpdate((updatedPlayers, _) => {
			players = updatedPlayers;
            
		});

		socketClient.onGameStarted((data) => {
			gameStarted = true;
			gameEnded = false;
			players = data.players;
			currentPlayerId = data.currentPlayer;
			currentLetters = data.currentLetters;
			isMyTurn = currentPlayerId === socketClient.id;
			feedback = '';

			if (isMyTurn) {
				startTimer();
			}
		});

		socketClient.onGameEnded((data) => {
			gameStarted = false;
			gameEnded = true;
			winner = data.winner;
			scores = data.scores;
			currentPlayerId = null;
			feedback = '';
			stopTimer();
		});

		socketClient.onNextTurn((data) => {

            console.log("Next turn called", data);
            
			currentPlayerId = data.currentPlayer;
			currentLetters = data.currentLetters;
			isMyTurn = currentPlayerId === socketClient.id;
			feedback = '';

			if (isMyTurn) {
				startTimer();
			}
		});

		socketClient.onPlayerEliminated((playerId) => {
			if (playerId === socketClient.id) {
				feedback = 'You have been eliminated! You are now a spectator.';
				stopTimer();
			}
		});

		socketClient.onPlayerLostLife((playerId, livesLeft) => {
			if (playerId === socketClient.id) {
				feedback = `Wrong word! You have ${livesLeft} ${livesLeft === 1 ? 'life' : 'lives'} left.`;
			}
            players = players.map((player) => {
                if (player.id === playerId) {
                    return {
                        ...player,
                        lives: livesLeft
                    };
                }
                return player;
            });
		});

		socketClient.onPlayerTyping((playerId, input, timeRemaining) => {
			if (playerId === currentPlayerId) {
				currentPlayerInput = input;
				currentPlayerTimeRemaining = timeRemaining;
			}
		});
	});

	onDestroy(() => {
		stopTimer();
	});

	function handleTyping() {
		if (isMyTurn && gameStarted) {
			socketClient.shareTypingUpdate(wordInput, isMyTurn, timeRemaining);
		}
	}
</script>

<svelte:head>
	<title>Wordly - Game {roomId}</title>
</svelte:head>

<svelte:window on:keydown={handleKeyDown} />

<div class="game-container">
	{#if loading}
		<div class="loading">Loading game...</div>
	{:else if error}
		<div class="error">{error}</div>
	{:else}
		<header class="game-header">
			<div class="room-info">
				<span class="room-id">Room: <strong>{roomId}</strong></span>
				{#if socketClient && socketClient.isOwner}
					<span class="owner-badge">Room Owner</span>
				{/if}
			</div>
			<button class="leave-button" on:click={leaveGame}>Leave Game</button>
		</header>

		<div class="game-content">
			<div class="game-circle-container">
				<GameCircle {players} {currentPlayerId} {currentLetters} currentUserId={socketClient?.id || ''} />
			</div>

			<div class="game-controls">
				{#if !gameStarted && !gameEnded && socketClient?.isOwner}
					<button class="start-button" on:click={startGame}>Start Game</button>
				{:else if !gameStarted && gameEnded}
					<div class="game-results">
						<h2>Game Over!</h2>
						{#if winner}
							<p>
								Winner: {players.find((p) => p.id === winner)?.name || 'Unknown'}
							</p>
						{:else}
							<p>It's a tie!</p>
						{/if}

						<h3>Final Scores:</h3>
						<ul class="scores-list">
							{#each Object.entries(scores).sort((a, b) => b[1] - a[1]) as [playerId, score]}
								<li>
									{players.find((p) => p.id === playerId)?.name || 'Unknown'}: {score}
									{#if playerId === winner}
										 👑
									{/if}
								</li>
							{/each}
						</ul>

						{#if socketClient?.isOwner}
							<button class="play-again-button" on:click={playAgain}>Play Again</button>
						{/if}
					</div>
				{:else if gameStarted}
					<div class="game-action">
						{#if isMyTurn}
							<div class="my-turn">
								<div class="timer-container">
									<div class="timer-bar" style="width: {(timeRemaining / 5) * 100}%"></div>
									<span class="timer-text">{timeRemaining}s</span>
								</div>
								<p class="turn-indicator">Your turn!</p>
								<p class="letter-challenge">
									Find a word containing: <strong>{currentLetters}</strong>
								</p>
								<div class="word-submission">
									<input
										type="text"
										bind:value={wordInput}
										on:input={handleTyping}
										placeholder="Enter a word..."
										class="word-input"
										disabled={!isMyTurn}
									/>
									<button class="submit-button" on:click={submitWord} disabled={!wordInput.trim() || !isMyTurn}>
										Submit
									</button>
								</div>
							</div>
						{:else}
							<p class="turn-indicator">
								Waiting for {players.find((p) => p.id === currentPlayerId)?.name || 'opponent'} to play...
							</p>
							<p class="letter-challenge">
								Current challenge: <strong>{currentLetters}</strong>
							</p>
							{#if !isMyTurn && gameStarted && currentPlayerId}
								<div class="opponent-typing">
									<p>
										{players.find((p) => p.id === currentPlayerId)?.name || 'Player'} is typing:
										{currentPlayerInput ? currentPlayerInput : '...'}
									</p>
									<div class="timer-container">
										<div class="timer-bar" style="width: {(currentPlayerTimeRemaining / 5) * 100}%"></div>
										<span class="timer-text">{currentPlayerTimeRemaining}s</span>
									</div>
								</div>
							{/if}
						{/if}

						{#if feedback}
							<div class="feedback-message">
								{feedback}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.game-container {
		display: flex;
		flex-direction: column;
		height: 100vh;
		padding: 1rem;
		max-width: 1200px;
		margin: 0 auto;
	}

	.game-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-bottom: 1rem;
		border-bottom: 1px solid #e5e5e5;
		margin-bottom: 1rem;
	}

	.room-info {
		display: flex;
		gap: 1rem;
		align-items: center;
	}

	.room-id {
		font-size: 1.2rem;
	}

	.owner-badge {
		background-color: #ffd700;
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
		font-size: 0.8rem;
		font-weight: bold;
	}

	.leave-button {
		background-color: #f44336;
		color: white;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 0.25rem;
		cursor: pointer;
	}

	.game-content {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		gap: 2rem;
	}

	.game-circle-container {
		flex-grow: 1;
		min-height: 400px;
	}

	.game-controls {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 1rem;
		background-color: #f5f5f5;
		border-radius: 0.5rem;
	}

	.start-button,
	.play-again-button {
		background-color: #4caf50;
		color: white;
		border: none;
		padding: 0.75rem 1.5rem;
		border-radius: 0.25rem;
		font-size: 1.2rem;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.start-button:hover,
	.play-again-button:hover {
		background-color: #45a049;
	}

	.game-action {
		width: 100%;
		max-width: 600px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.my-turn {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
	}

	.turn-indicator {
		font-size: 1.2rem;
		font-weight: bold;
	}

	.letter-challenge {
		font-size: 1.5rem;
		margin-bottom: 1rem;
	}

	.word-submission {
		display: flex;
		width: 100%;
		gap: 0.5rem;
	}

	.word-input {
		flex-grow: 1;
		padding: 0.75rem;
		border: 1px solid #ccc;
		border-radius: 0.25rem;
		font-size: 1rem;
	}

	.submit-button {
		background-color: #2196f3;
		color: white;
		border: none;
		padding: 0.75rem 1.5rem;
		border-radius: 0.25rem;
		cursor: pointer;
	}

	.submit-button:disabled {
		background-color: #cccccc;
		cursor: not-allowed;
	}

	.feedback-message {
		margin-top: 1rem;
		padding: 0.75rem;
		border-radius: 0.25rem;
		background-color: #fff3cd;
		border: 1px solid #ffeeba;
		width: 100%;
		text-align: center;
	}

	.game-results {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		width: 100%;
	}

	.scores-list {
		list-style: none;
		padding: 0;
		width: 100%;
		max-width: 300px;
	}

	.scores-list li {
		display: flex;
		justify-content: space-between;
		padding: 0.5rem;
		border-bottom: 1px solid #eee;
	}

	.loading,
	.error {
		display: flex;
		justify-content: center;
		align-items: center;
		height: 100%;
		font-size: 1.5rem;
	}

	.error {
		color: #f44336;
	}

	.timer-container {
		width: 100%;
		height: 20px;
		background-color: #e0e0e0;
		border-radius: 10px;
		margin-bottom: 10px;
		position: relative;
		overflow: hidden;
	}

	.timer-bar {
		height: 100%;
		background-color: #ff9800;
		transition: width 1s linear;
		border-radius: 10px;
	}

	.timer-text {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #333;
		font-weight: bold;
	}

	.timer-bar:global(.critical) {
		background-color: #f44336;
	}
</style>
