// Simple flashcard app for Ogden’s 850 Basic English words.
// Loads words from words.json, shows one flashcard at a time,
// and tracks user progress in localStorage.

if ("serviceWorker" in navigator) {
	window.addEventListener("load", () => {
		navigator.serviceWorker
			.register("/basic-english/service-worker.js")
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
const btnReset = document.getElementById("btn-reset");
const progressMainEl = document.getElementById("progress-main");
const progressSrsEl = document.getElementById("progress-srs");
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
	// spaced repetition state
	srs: {
		// [word]: { strength: number, lastSeen: number }
	},
	// daily stats: [YYYY-MM-DD]: { correct: number, incorrect: number }
	daily: {},
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
			srs: parsed.srs || {},
			daily: parsed.daily || {},
		};
	} catch (e) {
		console.error("Failed to parse saved progress:", e);
	}
}

function saveProgress() {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function resetProgress() {
	progress = {
		seen: {},
		correct: {},
		incorrect: {},
		srs: {},
		daily: {},
	};
	localStorage.removeItem(STORAGE_KEY);
	updateProgressDisplay();
	// optional: choose a new word
	showNextWord();
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
// Auxiliary SRS Functions
// -------------------------
const NOW = () => Date.now();

// standard values for new words
const DEFAULT_STRENGTH = 0;
const MIN_STRENGTH = -3;
const MAX_STRENGTH = 10;

// works like: the higher the strength, the longer the target interval (in ms)
function targetIntervalFromStrength(strength) {
	// simple: 0 => 0 min, 1 => 5min, 2 => 30min, 3 => 2h, 4 => 1d, 5 => 3d, ...
	const minutes = [0, 5, 30, 120, 1440, 4320, 10080]; // increasing
	const idx = Math.max(0, Math.min(minutes.length - 1, strength));
	return minutes[idx] * 60 * 1000;
}

function getSrsState(word) {
	if (!progress.srs[word]) {
		progress.srs[word] = {
			strength: DEFAULT_STRENGTH,
			lastSeen: 0,
		};
	}
	return progress.srs[word];
}

function updateSrsOnKnown(word) {
	const state = getSrsState(word);
	state.strength = Math.min(MAX_STRENGTH, state.strength + 1);
	state.lastSeen = NOW();
}

function updateSrsOnUnknown(word) {
	const state = getSrsState(word);
	state.strength = Math.max(MIN_STRENGTH, state.strength - 1);
	state.lastSeen = NOW();
}

// -------------------------
// DAILY STATS
// -------------------------

function getTodayKey() {
	// YYYY-MM-DD in local timezone
	const d = new Date();
	const yyyy = d.getFullYear();
	const mm = String(d.getMonth() + 1).padStart(2, "0");
	const dd = String(d.getDate()).padStart(2, "0");
	return `${yyyy}-${mm}-${dd}`;
}

function updateDailyStats(isCorrect) {
	const dayKey = getTodayKey();
	if (!progress.daily[dayKey]) {
		progress.daily[dayKey] = { correct: 0, incorrect: 0 };
	}
	if (isCorrect) {
		progress.daily[dayKey].correct += 1;
	} else {
		progress.daily[dayKey].incorrect += 1;
	}
}

function accuracyToBlue(accuracy) {
	// accuracy: 0..1

	// Let's define:
	// 0% => dark blue (#003366)
	// 50% => medium blue (#3366cc)
	// 100% => light blue (#99ccff)

	const stops = [
		{ a: 0.0, color: [0, 51, 102] }, // 0%
		{ a: 0.5, color: [51, 102, 204] }, // 50%
		{ a: 1.0, color: [153, 204, 255] }, // 100%
	];

	// if unable to map (for safety), return medium blue
	if (isNaN(accuracy)) accuracy = 0;
	accuracy = Math.max(0, Math.min(1, accuracy));

	// find interval
	for (let i = 0; i < stops.length - 1; i++) {
		const s1 = stops[i];
		const s2 = stops[i + 1];
		if (accuracy >= s1.a && accuracy <= s2.a) {
			const t = (accuracy - s1.a) / (s2.a - s1.a);
			const r = Math.round(s1.color[0] + t * (s2.color[0] - s1.color[0]));
			const g = Math.round(s1.color[1] + t * (s2.color[1] - s1.color[1]));
			const b = Math.round(s1.color[2] + t * (s2.color[2] - s1.color[2]));
			return `rgb(${r}, ${g}, ${b})`;
		}
	}
	return "rgb(51, 102, 204)";
}

// -------------------------
// PROGRESS & SELECTION LOGIC
// -------------------------

function isMastered(wordObj) {
	const w = wordObj.word;
	return !!progress.correct[w] && !progress.incorrect[w];
}

function pickNextIndex() {
	if (!words.length) return 0;

	const now = NOW();

	// we calculate a "priorityScore" for each word:
	// the lower the score, the more urgent it is to review.
	let bestIdx = 0;
	let bestScore = Infinity;

	words.forEach((wordObj, idx) => {
		const w = wordObj.word;
		const state = getSrsState(w);
		const elapsed = now - (state.lastSeen || 0);
		const targetInterval = targetIntervalFromStrength(state.strength);

		// The higher the elapsed/targetInterval, the more overdue it is;
		// we use the inverse as a "score" to prioritize those that are overdue
		// and with low strength.
		const overdueRatio = targetInterval > 0 ? elapsed / targetInterval : 1;
		// low strength => more urgent review
		const strengthPenalty = Math.max(0, -state.strength); // if negative, penalize

		const score = 1 / (1 + overdueRatio) + strengthPenalty;

		// We give a small bonus to never-seen words
		if (!progress.seen[w]) {
			// force it to appear earlier
			const virginScore = -10;
			if (virginScore < bestScore) {
				bestScore = virginScore;
				bestIdx = idx;
				return;
			}
		}

		if (score < bestScore) {
			bestScore = score;
			bestIdx = idx;
		}
	});

	return bestIdx;
}

function updateProgressDisplay() {
	const totalWords = words.length;
	if (totalWords === 0) {
		if (progressMainEl) {
			progressMainEl.textContent =
				"Mastered: 0% • Seen: 0/0 • Accuracy: 0% (0✓ / 0✗)";
		}
		if (progressSrsEl) {
			progressSrsEl.textContent =
				"Levels: Beginner 0 • Intermediate 0 • Advanced 0 • Hard: 0";
		}
		return;
	}

	const seenCount = Object.keys(progress.seen).length;
	const correctCount = Object.keys(progress.correct).length;
	const incorrectCount = Object.keys(progress.incorrect).length;
	const totalAnswers = correctCount + incorrectCount;

	// mastered: once answered correctly at least once and never marked as incorrect
	const masteredCount = words.filter(isMastered).length;
	const masteredPercent = Math.round((masteredCount / totalWords) * 100);

	// accuracy global
	const accuracy =
		totalAnswers > 0 ? Math.round((correctCount / totalAnswers) * 100) : 0;

	// Distribution by level (SRS)
	let beginner = 0; // strength <= 0
	let intermediate = 0; // 1..3
	let advanced = 0; // >= 4
	let hard = 0; // strength <= -1

	words.forEach((wordObj) => {
		const w = wordObj.word;
		const state = getSrsState(w);
		const s = state.strength;

		if (s <= 0) beginner += 1;
		else if (s <= 3) intermediate += 1;
		else advanced += 1;

		if (s <= -1) hard += 1;
	});

	if (progressMainEl) {
		progressMainEl.textContent =
			`Mastered: ${masteredPercent}% ` +
			`• Seen: ${seenCount}/${totalWords} ` +
			`• Accuracy: ${accuracy}% (${correctCount}✓ / ${incorrectCount}✗)`;
	}

	if (progressSrsEl) {
		progressSrsEl.textContent =
			`Levels: Beginner ${beginner} • Intermediate ${intermediate} • Advanced ${advanced} ` +
			`• Hard: ${hard}`;
	}

	renderDailyGraph();
}

function renderDailyGraph() {
	const container = document.getElementById("daily-graph");
	if (!container) return;

	container.innerHTML = "";

	const daysToShow = 30;
	const now = new Date();

	for (let i = daysToShow - 1; i >= 0; i--) {
		const d = new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate() - i,
		);
		const yyyy = d.getFullYear();
		const mm = String(d.getMonth() + 1).padStart(2, "0");
		const dd = String(d.getDate()).padStart(2, "0");
		const key = `${yyyy}-${mm}-${dd}`;

		const cell = document.createElement("div");
		cell.className = "daily-cell";

		const stats = progress.daily[key];
		if (stats && (stats.correct > 0 || stats.incorrect > 0)) {
			const total = stats.correct + stats.incorrect;
			const acc = stats.correct / total;
			cell.style.backgroundColor = accuracyToBlue(acc);
			cell.title = `${key}\nCorrect: ${stats.correct}\nIncorrect: ${stats.incorrect}\nAccuracy: ${Math.round(
				acc * 100,
			)}%`;
		} else {
			// gray (default no CSS) + tooltip
			cell.title = `${key}\nNo study`;
		}

		container.appendChild(cell);
	}
}

// -------------------------
// UI UPDATE FUNCTIONS
// -------------------------

function showCurrentWord() {
	if (!words.length) return;

	const currentWord = words[currentIndex];
	// Front and back show the same word
	wordFrontEl.textContent = currentWord.word;
	wordBackEl.textContent = currentWord.word;
	meaningEl.textContent = currentWord.meaning;

	// Always start by showing the front
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

	// SRS: reinforce and record the time
	updateSrsOnKnown(w);

	// Daily stats
	updateDailyStats(true);

	saveProgress();
	showNextWord();
}

function handleUnknown() {
	if (!words.length) return;
	const currentWordObj = words[currentIndex];
	const w = currentWordObj.word;

	progress.seen[w] = true;
	progress.incorrect[w] = true;

	// SRS: weaken and record the time
	updateSrsOnUnknown(w);

	// Daily stats
	updateDailyStats(false);

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
if (btnReset) {
	btnReset.addEventListener("click", resetProgress);
}

// -------------------------
// START APP
// -------------------------

loadProgress();
loadWords();
