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

const wordFrontEl = document.getElementById("word");
const wordBackEl = document.getElementById("word-back");
const meaningEl = document.getElementById("meaning");
const btnShowMeaning = document.getElementById("btn-show-meaning");
const btnKnown = document.getElementById("btn-known");
const btnUnknown = document.getElementById("btn-unknown");
const progressEl = document.getElementById("progress");
const flashcardContainer = document.getElementById("flashcard");

// -------------------------
// APP STATE
// -------------------------

let words = [];
let currentIndex = 0;

let progress = {
	seen: {},
	correct: {},
	incorrect: {},
};

const STORAGE_KEY = "basic_english_progress_v1";

// -------------------------
// INITIALIZATION
// -------------------------

function loadProgress() {
	const saved = localStorage.getItem(STORAGE_KEY);
	if (!saved) return;

	try {
		const parsed = JSON.parse(saved);
		progress = {
			seen: parsed.seen || {},
			correct: parsed.correct || {},
			incorrect: parsed.incorrect || {},
		};
	} catch (e) {
		console.error("Failed to parse saved progress:", e);
	}
}

function saveProgress() {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

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
			wordFrontEl.textContent = "No words found.";
			wordBackEl.textContent = "No words found.";
			meaningEl.textContent = "";
			return;
		}

		showNextWord();
	} catch (err) {
		console.error(err);
		wordFrontEl.textContent = "Error loading words.";
		wordBackEl.textContent = "Error loading words.";
		meaningEl.textContent = "";
	}
}

// -------------------------
// PROGRESS & SELECTION LOGIC
// -------------------------

function isMastered(wordObj) {
	const w = wordObj.word;
	return !!progress.correct[w] && !progress.incorrect[w];
}

function pickNextIndex() {
	const notMasteredIndices = [];

	words.forEach((w, idx) => {
		if (!isMastered(w)) {
			notMasteredIndices.push(idx);
		}
	});

	if (notMasteredIndices.length === 0) {
		return Math.floor(Math.random() * words.length);
	}

	const randomPos = Math.floor(Math.random() * notMasteredIndices.length);
	return notMasteredIndices[randomPos];
}

function updateProgressDisplay() {
	const totalWords = words.length;
	if (totalWords === 0) {
		progressEl.textContent =
			"Progress: 0% (Seen: 0, Correct: 0, Incorrect: 0)";
		return;
	}

	const seenCount = Object.keys(progress.seen).length;
	const correctCount = Object.keys(progress.correct).length;
	const incorrectCount = Object.keys(progress.incorrect).length;

	const percentage =
		totalWords > 0 ? Math.round((correctCount / totalWords) * 100) : 0;

	progressEl.textContent = `Progress: ${percentage}% (Seen: ${seenCount}, Correct: ${correctCount}, Incorrect: ${incorrectCount})`;
}

// -------------------------
// UI UPDATE FUNCTIONS
// -------------------------

function showCurrentWord() {
	if (!words.length) return;

	const currentWord = words[currentIndex];
	// Frente e verso mostram a mesma palavra
	wordFrontEl.textContent = currentWord.word;
	wordBackEl.textContent = currentWord.word;
	meaningEl.textContent = currentWord.meaning;

	// Sempre começar mostrando a frente
	if (flashcardContainer) {
		flashcardContainer.classList.remove("flipped");
	}

	updateProgressDisplay();
}

function showNextWord() {
	if (!words.length) return;
	currentIndex = pickNextIndex();
	showCurrentWord();
}

// -------------------------
// EVENT HANDLERS
// -------------------------

function handleShowMeaning() {
	if (!words.length) return;
	if (flashcardContainer) {
		flashcardContainer.classList.add("flipped");
	}
}

function handleKnown() {
	if (!words.length) return;
	const currentWordObj = words[currentIndex];
	const w = currentWordObj.word;

	progress.seen[w] = true;
	progress.correct[w] = true;
	delete progress.incorrect[w];

	saveProgress();
	showNextWord();
}

function handleUnknown() {
	if (!words.length) return;
	const currentWordObj = words[currentIndex];
	const w = currentWordObj.word;

	progress.seen[w] = true;
	progress.incorrect[w] = true;
	saveProgress();
	showNextWord();
}

// -------------------------
// WIRE UP EVENTS
// -------------------------

if (btnShowMeaning) {
	btnShowMeaning.addEventListener("click", handleShowMeaning);
}
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
