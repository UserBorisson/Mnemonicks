// scheduler.js — FSRS v5/6 controller (browser ESM)
// Complete overhaul: centralized scheduler with persistence, timing, and grade mapping.
// Works with any UI mode via existing window.advance and optional window.startReview.
//
// Storage: FSRS state & logs in localStorage keys: FSRS_CARDS_V1, FSRS_LOGS_V1.

import { fsrs, generatorParameters, Rating, State, createEmptyCard } from 'https://cdn.jsdelivr.net/npm/ts-fsrs@5.2.1/dist/index.mjs';

/** @typedef {import('https://cdn.jsdelivr.net/npm/ts-fsrs@5.2.1/dist/index.d.ts').Card} FSRSCard */

const STORAGE_CARDS = 'FSRS_CARDS_V1';
const STORAGE_LOGS  = 'FSRS_LOGS_V1';
const STORAGE_PARAMS = 'FSRS_PARAMS_V1';

/** revive Date fields */
function revive(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const [k,v] of Object.entries(obj)) {
    if (typeof v === 'string' && /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) out[k] = new Date(v);
    else if (v && typeof v === 'object') out[k] = revive(v);
    else out[k] = v;
  }
  return out;
}
function loadJSON(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? revive(JSON.parse(raw)) : fallback; }
  catch { return fallback; }
}
function saveJSON(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }

const DEFAULT_PARAM_INPUT = {
  request_retention: 0.98,
  maximum_interval: 36500,
  enable_fuzz: true,
  enable_short_term: true,
};

// Failed recalls should not reappear instantly; require a short cooldown.
const WRONG_RETRY_DELAY_MINUTES = 8;
const AIDED_RETRY_DELAY_MINUTES = 3;
const MIN_REPS_FOR_EASY_FLASHCARD = 5;
const MIN_REPS_FOR_EASY_FILLIN = 2;
const MIN_REPS_FOR_EASY_MCQ = 8;

const REVIEW_MODE_FLASHCARD = 'flashcard';
const REVIEW_MODE_MCQ = 'mcq';
const REVIEW_MODE_FILLIN = 'fillin';

function normalizeDeckKey(key) {
  const k = key ?? 'default';
  return String(k || 'default');
}

function normalizeReviewMode(mode) {
  const value = String(mode || '').trim().toLowerCase();
  if (value === REVIEW_MODE_MCQ) return REVIEW_MODE_MCQ;
  if (value === REVIEW_MODE_FILLIN) return REVIEW_MODE_FILLIN;
  return REVIEW_MODE_FLASHCARD;
}

function modeEvidenceOffset(reviewMode, elapsedMs, aidedRecall) {
  if (aidedRecall) return 0;
  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  const mode = normalizeReviewMode(reviewMode);

  // Recognition in MCQ is weaker evidence than free recall.
  if (mode === REVIEW_MODE_MCQ) {
    if (elapsed <= 7000) return -0.95;
    if (elapsed <= 20000) return -0.55;
    return -0.2;
  }
  if (mode === REVIEW_MODE_FILLIN) {
    if (elapsed <= 7000) return 0.55;
    if (elapsed <= 20000) return 0.25;
    return 0.05;
  }
  return 0;
}

function minRepsForEasyReview(reviewMode) {
  const mode = normalizeReviewMode(reviewMode);
  if (mode === REVIEW_MODE_FILLIN) return MIN_REPS_FOR_EASY_FILLIN;
  if (mode === REVIEW_MODE_MCQ) return MIN_REPS_FOR_EASY_MCQ;
  return MIN_REPS_FOR_EASY_FLASHCARD;
}

function migrateCardsShape(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const vals = Object.values(data);
  if (!vals.length) return {};
  // Legacy shape was a flat map of id -> card. Detect by seeing a card-like object.
  const looksLegacy = vals.some(v => v && typeof v === 'object' && ('due' in v || 'stability' in v || 'difficulty' in v));
  if (looksLegacy) return { default: data };
  return data;
}

function migrateLogsShape(data) {
  if (!data) return {};
  if (Array.isArray(data)) return { default: data };
  if (typeof data !== 'object') return {};
  return data;
}

function loadParamsMap() {
  const stored = loadJSON(STORAGE_PARAMS, null);
  return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
}

function defaultParams() {
  return generatorParameters(DEFAULT_PARAM_INPUT);
}

function normalizeParamShape(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out = { ...input };
  // Back-compat for older payloads/files that used desired_retention.
  if (Number.isFinite(out.desired_retention) && !Number.isFinite(out.request_retention)) {
    out.request_retention = out.desired_retention;
  }
  delete out.desired_retention;
  return out;
}

function startOfToday(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}
function startOfTomorrow(now = new Date()) {
  const d = startOfToday(now);
  d.setDate(d.getDate() + 1);
  return d;
}

function normalizeFsrsDate(input, now = new Date()) {
  if (input instanceof Date) return new Date(input);
  if (typeof input === 'string') {
    const parsed = new Date(input);
    if (Number.isFinite(parsed.getTime())) return parsed;
    return new Date(now);
  }
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return new Date(now);
    // If it's a small magnitude number, treat as day offset from today (legacy shape).
    if (Math.abs(input) < 1e11) {
      const base = startOfToday(now);
      const days = Math.max(0, Math.round(input));
      base.setDate(base.getDate() + days);
      return base;
    }
    return new Date(input);
  }
  return new Date(now);
}

function normalizeFsrsCard(card, now = new Date()) {
  if (!card || typeof card !== 'object') return false;
  let changed = false;
  const due = normalizeFsrsDate(card.due, now);
  const minDue = startOfToday(now);
  const clampedDue = due < minDue ? minDue : due;
  if (!(card.due instanceof Date) || card.due.getTime() !== clampedDue.getTime()) {
    card.due = clampedDue;
    changed = true;
  }
  if (card.last_review != null) {
    const last = normalizeFsrsDate(card.last_review, now);
    if (!(card.last_review instanceof Date) || card.last_review.getTime() !== last.getTime()) {
      card.last_review = last;
      changed = true;
    }
  }
  return changed;
}

function normalizeFsrsDecks(cardsByDeck, now = new Date()) {
  if (!cardsByDeck || typeof cardsByDeck !== 'object') return false;
  let changed = false;
  for (const deck of Object.values(cardsByDeck)) {
    if (!deck || typeof deck !== 'object') continue;
    for (const card of Object.values(deck)) {
      if (normalizeFsrsCard(card, now)) changed = true;
    }
  }
  return changed;
}

function minDueWithDelay(now, minutes) {
  const mins = Math.max(0, Number(minutes) || 0);
  return new Date(now.getTime() + mins * 60 * 1000);
}

class FSRSController {
  constructor() {
    this.cardsByDeck = migrateCardsShape(loadJSON(STORAGE_CARDS, {}));
    this.logsByDeck = migrateLogsShape(loadJSON(STORAGE_LOGS, {}));
    this.activeDeckKey = 'default';
    this.currentId = null;
    this.startedAt = 0;
    this.paramsByDeck = loadParamsMap();
    this.engineByDeck = new Map();
    this.params = defaultParams(); // updated whenever engine is retrieved/set
    if (normalizeFsrsDecks(this.cardsByDeck, new Date())) {
      this.persist();
    }
  }

  getDeckCards(deckKey = this.activeDeckKey) {
    const key = normalizeDeckKey(deckKey);
    if (!this.cardsByDeck[key]) this.cardsByDeck[key] = {};
    return this.cardsByDeck[key];
  }

  getDeckLogs(deckKey = this.activeDeckKey) {
    const key = normalizeDeckKey(deckKey);
    if (!this.logsByDeck[key]) this.logsByDeck[key] = [];
    return this.logsByDeck[key];
  }

  getParams(deckKey = this.activeDeckKey) {
    const key = normalizeDeckKey(deckKey);
    const base = defaultParams();
    const stored = normalizeParamShape(this.paramsByDeck[key]);
    if (!stored) return base;
    return {
      ...base,
      ...stored,
      w: Array.isArray(stored.w) ? stored.w : base.w
    };
  }

  getEngine(deckKey = this.activeDeckKey) {
    const key = normalizeDeckKey(deckKey);
    if (!this.engineByDeck.has(key)) {
      const params = this.getParams(key);
      this.params = params;
      this.engineByDeck.set(key, fsrs(params)); // fsrs().repeat/next API per docs. :contentReference[oaicite:1]{index=1}
    }
    return this.engineByDeck.get(key);
  }

  /** Ensure FSRS state for every card; mirrors fields for UI/debug */
  seedDeck(deck, now = new Date(), deckKey = this.activeDeckKey) {
    this.activeDeckKey = normalizeDeckKey(deckKey);
    this.params = this.getParams(this.activeDeckKey);
    const deckCards = this.getDeckCards(this.activeDeckKey);
    deck.forEach(c => {
      if (c && (c.id ?? c.id === 0)) {
        const id = c.id;
        const key = String(id);
        let fs = deckCards[key];
        if (!fs) {
          fs = createEmptyCard(now);
          deckCards[key] = fs;
        }
        normalizeFsrsCard(fs, now);
        this.mirror(fs, c);
      }
    });
    this.persist();
    return deck;
  }

  getFSRS(id, deckKey = this.activeDeckKey) {
    const deckCards = this.getDeckCards(deckKey);
    const fs = deckCards[String(id)];
    if (!fs) throw new Error('FSRS state missing for id=' + id);
    if (normalizeFsrsCard(fs, new Date())) this.persist();
    return fs;
  }

  start(card, deckKey = this.activeDeckKey) {
    this.activeDeckKey = normalizeDeckKey(deckKey);
    if (!card || (card.id ?? card.id === 0) === false) return;
    this.currentId = card.id;
    this.startedAt = performance.now();
  }

  estimateRetrievability(engine, card, now = new Date()) {
    if (!engine?.get_retrievability || !card) return 0;
    try {
      const v = Number(engine.get_retrievability(card, now, false));
      return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
    } catch {
      return 0;
    }
  }

  computeRating({ correct, attempts = 1, hintUsed = false, elapsedMs = 0, override, card, engine, now = new Date(), reviewMode = REVIEW_MODE_FLASHCARD }) {
    if (override) return Rating[override];     // 'Good' | 'Easy' | 'Hard' | 'Again'
    if (!correct) return Rating.Again;
    const state = Number.isFinite(card?.state) ? card.state : State.New;
    const isReview = state === State.Review;
    const aidedRecall = attempts > 1 || hintUsed;
    const elapsed = Math.max(0, Number(elapsedMs) || 0);
    const scheduledDays = Math.max(0, Number(card?.scheduled_days) || 0);
    const elapsedDays = Math.max(0, Number(card?.elapsed_days) || 0);
    const retrievability = this.estimateRetrievability(engine, card, now);
    const reps = Math.max(0, Number(card?.reps) || 0);

    let score = 2.4;

    // Aided or multi-attempt recall is weaker evidence than a clean first-pass recall.
    if (aidedRecall) score -= 1.45 + Math.min(0.8, Math.max(0, attempts - 1) * 0.4);

    if (elapsed <= 2500) score += 0.95;
    else if (elapsed <= 7000) score += 0.25;
    else if (elapsed <= 20000) score -= 0.45;
    else if (elapsed <= 60000) score -= 1.1;
    else score -= 2.0;
    score += modeEvidenceOffset(reviewMode, elapsed, aidedRecall);

    if (isReview) {
      const lateness = elapsedDays / Math.max(1, scheduledDays);
      if (lateness >= 3) score += 1.0;
      else if (lateness >= 1.3) score += 0.6;
      else if (lateness < 0.6) score -= 0.25;

      // Correct recall when predicted retrievability was low is stronger evidence.
      if (retrievability <= 0.45) score += 0.55;
      else if (retrievability >= 0.9) score -= 0.35;
    }

    let rating;
    if (score < 0.25) rating = Rating.Hard;
    else if (score < 2.5) rating = Rating.Good;
    else rating = Rating.Easy;

    // Keep short-term states conservative to avoid interval runaway.
    if (state !== State.Review && rating === Rating.Easy) rating = Rating.Good;
    // Prevent early runaway intervals before we have enough recall evidence.
    if (state === State.Review && reps < minRepsForEasyReview(reviewMode) && rating === Rating.Easy) rating = Rating.Good;
    if (state !== State.Review && aidedRecall) return Rating.Again;
    if (state === State.Review && aidedRecall && rating === Rating.Easy) rating = Rating.Hard;
    return rating;
  }

  submit(payload = {}) {
    const id = payload.id ?? this.currentId;
    if (id == null) throw new Error('submit() with no active card');
    const deckKey = normalizeDeckKey(payload.deckKey ?? this.activeDeckKey);
    const fsCard = this.getFSRS(id, deckKey);
    const now = new Date();
    const engine = this.getEngine(deckKey);
    const elapsedMs = payload.elapsedMs ?? Math.max(0, performance.now() - (this.startedAt || performance.now()));
    const reviewMode = normalizeReviewMode(payload.reviewMode);
    const rating = this.computeRating({ ...payload, elapsedMs, card: fsCard, engine, now, reviewMode });
    const attempts = Math.max(1, Number(payload.attempts) || 1);
    const hadWrongAttempts = attempts > 1;
    const failed = payload.correct === false;
    const usedHint = !!payload.hintUsed;
    const aidedRecall = hadWrongAttempts || usedHint;
    // Keep minute-level forced retries for true misses and hinted answers.
    // Multi-attempt but ultimately correct answers are already down-rated in computeRating().
    const penalize = failed || usedHint;

    const { card: newFsCard, log } = engine.next(fsCard, now, rating); // per docs. :contentReference[oaicite:2]{index=2}
    if (penalize && newFsCard) {
      const retryMinutes = failed ? WRONG_RETRY_DELAY_MINUTES : AIDED_RETRY_DELAY_MINUTES;
      // Force penalized cards back into a short retry window instead of keeping long review intervals.
      newFsCard.due = minDueWithDelay(now, retryMinutes);
    }
    if (newFsCard) normalizeFsrsCard(newFsCard, now);
    const deckCards = this.getDeckCards(deckKey);
    deckCards[String(id)] = newFsCard;
    this.getDeckLogs(deckKey).push({ id, review_mode: reviewMode, ...log });
    this.persist();
    return { newCard: newFsCard, log, rating };
  }

  mirror(fsCard, appCard) {
    if (!fsCard || !appCard) return;
    appCard.due = fsCard.due;
    appCard.stability = fsCard.stability;
    appCard.difficulty = fsCard.difficulty;
    appCard.state = fsCard.state;
    appCard.reps = fsCard.reps;
    appCard.lapses = fsCard.lapses;
    appCard.learning_steps = fsCard.learning_steps;
    appCard.last_review = fsCard.last_review;
  }

  dueNow(deck, now = new Date(), deckKey = this.activeDeckKey) {
    const key = normalizeDeckKey(deckKey);
    return deck
      .filter(c => {
        try {
          const due = this.getFSRS(c.id, key).due;
          const dueDate = due instanceof Date ? due : new Date(due);
          if (!Number.isFinite(dueDate.getTime())) return true;
          return dueDate <= now;
        } catch {
          return true;
        }
      })
      .sort((a, b) => +this.getFSRS(a.id, key).due - +this.getFSRS(b.id, key).due);
  }

  persist() {
    saveJSON(STORAGE_CARDS, this.cardsByDeck);
    saveJSON(STORAGE_LOGS, this.logsByDeck);
  }

  resetDeck(deckKey = this.activeDeckKey) {
    const key = normalizeDeckKey(deckKey);
    delete this.cardsByDeck[key];
    delete this.logsByDeck[key];
    this.engineByDeck.delete(key);
    if (this.activeDeckKey === key) this.currentId = null;
    this.persist();
  }

  setParameters(params = {}, deckKey = this.activeDeckKey) {
    const key = normalizeDeckKey(deckKey);
    const normalized = normalizeParamShape(params);
    const merged = {
      ...this.getParams(key),
      ...normalized,
      w: Array.isArray(normalized?.w) ? normalized.w : this.getParams(key).w
    };
    this.paramsByDeck[key] = merged;
    this.engineByDeck.delete(key); // rebuild on next access
    this.params = merged;
    saveJSON(STORAGE_PARAMS, this.paramsByDeck);
  }

  getLogs(deckKey = this.activeDeckKey) {
    const logs = this.getDeckLogs(deckKey);
    return Array.isArray(logs) ? logs.slice() : [];
  }
}

// Singleton + optional globals
const controller = new FSRSController();
window.fsrs = controller;
window.startReview = (card, deckKey) => controller.start(card, deckKey);

// Back-compat default export your main.js already uses:
// handleReview(card, isCorrect, responseTimeMs=0, attempts=1, hintUsed=false, now=new Date(), deckKey?)
export default function handleReview(appCard, isCorrect, responseTimeMs = 0, attempts = 1, hintUsed = false, now = new Date(), deckKey = controller.activeDeckKey, options = {}) {
  if (!appCard || appCard.id == null) return appCard;
  controller.seedDeck([appCard], now, deckKey);
  const elapsed = responseTimeMs > 0 ? responseTimeMs
    : Math.max(0, performance.now() - (controller.startedAt || performance.now()));
  const { newCard } = controller.submit({
    id: appCard.id,
    deckKey,
    correct: !!isCorrect,
    attempts: attempts ?? 1,
    hintUsed: !!hintUsed,
    elapsedMs: elapsed,
    reviewMode: normalizeReviewMode(options?.reviewMode)
  });
  controller.mirror(newCard, appCard);
  return appCard;
}

// Optional named export if you want to poke internals later.
export { controller as FSRS };
