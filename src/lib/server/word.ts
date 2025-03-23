import fs from 'fs';

let validSequences: string[] = [];
let validWords: string[] = [];

export async function initializeWordLibrary() {
	const words = fs
		.readFileSync('static/words.txt', 'utf8')
		.split('\n')
		.map((w) => w.trim().toLowerCase());
	const sequenceCounts: Record<string, number> = {};

	validWords = words;
	console.log(`Loaded ${validWords.length} valid words`);

	words.forEach((word) => {
		for (let i = 0; i < word.length - 1; i++) {
			const seq2 = word.substring(i, i + 2);
			const seq3 = word.substring(i, i + 3);

			if (seq2.length === 2) sequenceCounts[seq2] = (sequenceCounts[seq2] || 0) + 1;
			if (seq3.length === 3) sequenceCounts[seq3] = (sequenceCounts[seq3] || 0) + 1;
		}
	});

	validSequences = Object.keys(sequenceCounts).filter((seq) => sequenceCounts[seq] > 5);
	console.log(`Loaded ${validSequences.length} valid sequences`);
}

export function generateLetters(): string {
	return validSequences[Math.floor(Math.random() * validSequences.length)];
}

export function isValidWord(word: string): boolean {
	return validWords.includes(word.toLowerCase());
}

export function containsSequence(word: string, sequence: string): boolean {
	return word.toLowerCase().includes(sequence.toLowerCase());
}
