// Simple flashcard app for Ogden’s 850 Basic English words.
// Loads words from words.json, shows one flashcard at a time,
// and tracks user progress in localStorage.

if ("serviceWorker" in navigator) {
	window.addEventListener("load", () => {
		navigator.serviceWorker
			.register("/service-worker.js")
			.catch((err) => console.error("SW registration failed:", err));
	});
}

// -------------------------
// DOM ELEMENT REFERENCES
// -------------------------

const wordEl = document.getElementById("word");
const meaningEl = document.getElementById("meaning");
const btnKnown = document.getElementById("btn-known");
const btnUnknown = document.getElementById("btn-unknown");
const progressEl = document.getElementById("progress");

// -------------------------
// APP STATE
// -------------------------

// All words loaded from words.json
let words = [];

// Index of the current word in the words array
let currentIndex = 0;

// Progress data stored in localStorage
// Structure:
// {
//   seen: { [word]: true },
//   correct: { [word]: true },
//   incorrect: { [word]: true }
// }
let progress = {
	seen: {},
	correct: {},
	incorrect: {},
};

// Key used in localStorage
const STORAGE_KEY = "basic_english_progress_v1";

// -------------------------
// INITIALIZATION
// -------------------------

// Load progress from localStorage (if any)
function loadProgress() {
	const saved = localStorage.getItem(STORAGE_KEY);
	if (!saved) return;

	try {
		const parsed = JSON.parse(saved);
		// Merge with default structure to be safe
		progress = {
			seen: parsed.seen || {},
			correct: parsed.correct || {},
			incorrect: parsed.incorrect || {},
		};
	} catch (e) {
		console.error("Failed to parse saved progress:", e);
	}
}

// Save current progress to localStorage
function saveProgress() {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

// Fetch words from local words.json
async function loadWords() {
	try {
		const response = await fetch("words.json");
		if (!response.ok) {
			throw new Error("Failed to load words.json");
		}
		words = await response.json();

		if (!Array.isArray(words)) {
			throw new Error("words.json should contain an array");
		}

		if (words.length === 0) {
			wordEl.textContent = "No words found.";
			meaningEl.textContent = "";
			return;
		}

		// Start by showing a random word that is not mastered
		showNextWord();
	} catch (err) {
		console.error(err);
		wordEl.textContent = "Error loading words.";
		meaningEl.textContent = "";
	}
}

// -------------------------
// PROGRESS & SELECTION LOGIC
// -------------------------

// Determine if a word is "mastered".
// Simple rule: mastered if the user has marked it "known" at least once
// and has never marked it "unknown". You can adjust this heuristic.
function isMastered(wordObj) {
	const w = wordObj.word;
	return !!progress.correct[w] && !progress.incorrect[w];
}

// Pick a random index from the words array for a word that is not mastered.
// If all words are mastered, we still pick a random word so the app keeps working.
function pickNextIndex() {
	const notMasteredIndices = [];

	words.forEach((w, idx) => {
		if (!isMastered(w)) {
			notMasteredIndices.push(idx);
		}
	});

	if (notMasteredIndices.length === 0) {
		// All words are mastered; pick a random word from all words
		return Math.floor(Math.random() * words.length);
	}

	const randomPos = Math.floor(Math.random() * notMasteredIndices.length);
	return notMasteredIndices[randomPos];
}

// Update the progress element with a percentage and counts
function updateProgressDisplay() {
	const totalWords = words.length;
	if (totalWords === 0) {
		progressEl.textContent = "Progress: 0% (0 / 0)";
		return;
	}

	// Words seen are the union of keys in correct and incorrect and seen
	const seenCount = Object.keys(progress.seen).length;
	const correctCount = Object.keys(progress.correct).length;
	const incorrectCount = Object.keys(progress.incorrect).length;

	// Progress as percentage of words seen that the user has gotten correct at least once
	const percentage =
		totalWords > 0 ? Math.round((correctCount / totalWords) * 100) : 0;

	progressEl.textContent = `Progress: ${percentage}% (Seen: ${seenCount}, Correct: ${correctCount}, Incorrect: ${incorrectCount})`;
}

// -------------------------
// UI UPDATE FUNCTIONS
// -------------------------

// Show the word currently at currentIndex
function showCurrentWord() {
	if (!words.length) return;

	const currentWord = words[currentIndex];
	wordEl.textContent = currentWord.word;
	meaningEl.textContent = currentWord.meaning;
	updateProgressDisplay();
}

// Choose and show the next word (not mastered if possible)
function showNextWord() {
	if (!words.length) return;

	currentIndex = pickNextIndex();
	showCurrentWord();
}

// -------------------------
// EVENT HANDLERS
// -------------------------

// Handle "I knew it"
function handleKnown() {
	if (!words.length) return;
	const currentWordObj = words[currentIndex];
	const w = currentWordObj.word;

	progress.seen[w] = true;
	progress.correct[w] = true;
	// If user knew it, we can optionally clear incorrect mark
	// (depends on desired behavior; here we keep it simple)
	delete progress.incorrect[w];

	saveProgress();
	showNextWord();
}

// Handle "I didn't know"
function handleUnknown() {
	if (!words.length) return;
	const currentWordObj = words[currentIndex];
	const w = currentWordObj.word;

	progress.seen[w] = true;
	progress.incorrect[w] = true;
	// Optionally we can clear correct, or keep both markers.
	// Here we keep correct as is, so a tricky word can have both.
	saveProgress();
	showNextWord();
}

// -------------------------
// WIRE UP EVENTS
// -------------------------

if (btnKnown) {
	btnKnown.addEventListener("click", handleKnown);
}
if (btnUnknown) {
	btnUnknown.addEventListener("click", handleUnknown);
}

// -------------------------
// START APP
// -------------------------

loadProgress();
loadWords();
