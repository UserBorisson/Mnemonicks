const HEATMAP_BINS = {
  level1Max: 5,
  level2Max: 15,
  level3Max: 30
};
const DAY_MS = 864e5;

function toIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseIsoDate(isoDate) {
  const [year, month, day] = String(isoDate).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfDay(date) {
  const out = new Date(date);
  out.setHours(0, 0, 0, 0);
  return out;
}

function startOfWeekMonday(date) {
  const out = startOfDay(date);
  const day = (out.getDay() + 6) % 7; // Monday = 0
  out.setDate(out.getDate() - day);
  return out;
}

function endOfWeekSunday(date) {
  const out = startOfDay(date);
  const day = (out.getDay() + 6) % 7; // Monday = 0
  out.setDate(out.getDate() + (6 - day));
  return out;
}

function toIsoDateUtc(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfDayUtc(date) {
  const out = new Date(date);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

function addDaysUtc(date, days) {
  const out = startOfDayUtc(date);
  out.setUTCDate(out.getUTCDate() + Math.round(days));
  return out;
}

function startOfWeekMondayUtc(date) {
  const out = startOfDayUtc(date);
  const day = (out.getUTCDay() + 6) % 7; // Monday = 0
  out.setUTCDate(out.getUTCDate() - day);
  return out;
}

function endOfWeekSundayUtc(date) {
  const out = startOfDayUtc(date);
  const day = (out.getUTCDay() + 6) % 7; // Monday = 0
  out.setUTCDate(out.getUTCDate() + (6 - day));
  return out;
}

const STORAGE_CARDS = "FSRS_CARDS_V1";
const STORAGE_LOGS = "FSRS_LOGS_V1";
const STORAGE_DECK_PATH = "DECK_PATH_V1";
const STORAGE_RECENT_DECKS = "RECENT_DECKS_V1";
const STORAGE_DECK_DESCRIPTIONS = "DECK_DESCRIPTIONS_V1";
const STORAGE_LOCAL_IMPORTED_DECKS = "LOCAL_IMPORTED_DECKS_V1";
const WEEKLY_GOAL_TARGET = 120;
const HEATMAP_DAYS = 371;
const DEFAULT_REVIEW_SECONDS = 35;
const PROFILE_NAME_KEYS = ["USER_PROFILE_NAME", "PROFILE_NAME_V1", "PROFILE_NAME", "USER_NAME"];
const PROFILE_AVATAR_KEYS = ["USER_PROFILE_AVATAR_URL", "PROFILE_AVATAR_URL", "USER_AVATAR_URL"];
const NON_DECK_JSON_FILENAMES = new Set(["fsrs_params.json", "manifest.json"]);
const HIDDEN_HOME_DECK_KEYS = new Set(["gen:biofyz"]);

let homeData = null;

function safeParseStorageJson(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function normalizeDeckKey(key) {
  return String(key || "default").trim() || "default";
}
function deckBasename(deckKey) {
  const raw = String(deckKey || "")
    .trim()
    .split("#")[0]
    .split("?")[0]
    .replace(/\\/g, "/");
  const parts = raw.split("/").filter(Boolean);
  return String(parts[parts.length - 1] || "").toLowerCase();
}
function isExcludedDeckKey(deckKey) {
  const normalized = normalizeDeckKey(deckKey).toLowerCase();
  if (HIDDEN_HOME_DECK_KEYS.has(normalized)) return true;
  const base = deckBasename(deckKey);
  return !!base && NON_DECK_JSON_FILENAMES.has(base);
}

function normalizeLocalImportedDeckStore(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  Object.entries(raw).forEach(([key, value]) => {
    const normalizedPath = normalizeDeckPathForSave(key);
    if (!normalizedPath || isExcludedDeckKey(normalizedPath)) return;
    let cards = null;
    if (Array.isArray(value)) cards = value;
    else if (value && typeof value === "object" && Array.isArray(value.cards)) cards = value.cards;
    if (!Array.isArray(cards)) return;
    out[normalizedPath] = {
      cards: cards.filter((card) => card && typeof card === "object"),
      updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : new Date().toISOString()
    };
  });
  return out;
}

function loadLocalImportedDeckStore() {
  return normalizeLocalImportedDeckStore(safeParseStorageJson(STORAGE_LOCAL_IMPORTED_DECKS, {}));
}

function saveLocalImportedDeckStore(store) {
  try {
    localStorage.setItem(STORAGE_LOCAL_IMPORTED_DECKS, JSON.stringify(normalizeLocalImportedDeckStore(store)));
    return { ok: true, message: "" };
  } catch (err) {
    return {
      ok: false,
      message: `Could not save imported deck locally (${String(err?.message || err || "storage error")}).`
    };
  }
}

function getLocalImportedDeckEntry(deckPath = "") {
  const normalizedPath = normalizeDeckPathForSave(deckPath);
  if (!normalizedPath) return null;
  const store = loadLocalImportedDeckStore();
  const entry = store[normalizedPath];
  if (!entry || !Array.isArray(entry.cards)) return null;
  return { path: normalizedPath, cards: entry.cards };
}

function listLocalImportedDeckPaths() {
  return Object.keys(loadLocalImportedDeckStore())
    .map((path) => normalizeDeckPathForSave(path))
    .filter((path, index, arr) => path && arr.indexOf(path) === index && !isExcludedDeckKey(path));
}

function persistLocalImportedDeckCreate(deckPath, cards = [], { overwrite = false, allowEmpty = false } = {}) {
  const normalizedPath = normalizeDeckPathForSave(deckPath);
  if (!normalizedPath) return { ok: false, message: "Deck path is not editable.", status: 400 };
  const cleanCards = Array.isArray(cards) ? cards.filter((card) => card && typeof card === "object") : [];
  if (!cleanCards.length && !allowEmpty) return { ok: false, message: "No cards to import.", status: 400 };

  const store = loadLocalImportedDeckStore();
  if (store[normalizedPath] && !overwrite) {
    return {
      ok: false,
      message: "A local imported deck with that name already exists in this browser.",
      status: 409
    };
  }

  let clonedCards = [];
  try {
    clonedCards = JSON.parse(JSON.stringify(cleanCards));
  } catch {
    clonedCards = cleanCards.map((card) => ({ ...(card || {}) }));
  }
  store[normalizedPath] = {
    cards: clonedCards,
    updatedAt: new Date().toISOString()
  };
  const saved = saveLocalImportedDeckStore(store);
  if (!saved.ok) return { ok: false, message: saved.message, status: 507 };

  return {
    ok: true,
    message: "Deck saved in browser local storage (writer unavailable).",
    status: 200,
    localOnly: true
  };
}

function persistLocalImportedDeckUpdate(deckPath, card, { allowCreate = false } = {}) {
  const normalizedPath = normalizeDeckPathForSave(deckPath);
  if (!normalizedPath) return null;
  const store = loadLocalImportedDeckStore();
  const entry = store[normalizedPath];
  if (!entry || !Array.isArray(entry.cards)) return null;
  const cardId = String(card?.id ?? "").trim();
  if (!cardId) return { ok: false, message: "Card is missing an id.", status: 400 };
  const nextCards = entry.cards.slice();
  const idx = nextCards.findIndex((item) => String(item?.id ?? "").trim() === cardId);
  if (idx >= 0) nextCards[idx] = card;
  else if (allowCreate) nextCards.push(card);
  else return { ok: false, message: "Card id not found.", status: 404 };
  store[normalizedPath] = { cards: nextCards, updatedAt: new Date().toISOString() };
  const saved = saveLocalImportedDeckStore(store);
  if (!saved.ok) return { ok: false, message: saved.message, status: 507 };
  return { ok: true, message: "", status: 200, localOnly: true };
}

function persistLocalImportedDeckDelete(deckPath, cardId) {
  const normalizedPath = normalizeDeckPathForSave(deckPath);
  if (!normalizedPath) return null;
  const store = loadLocalImportedDeckStore();
  const entry = store[normalizedPath];
  if (!entry || !Array.isArray(entry.cards)) return null;
  const id = String(cardId ?? "").trim();
  if (!id) return { ok: false, message: "Card id is required.", status: 400 };
  const nextCards = entry.cards.filter((item) => String(item?.id ?? "").trim() !== id);
  if (nextCards.length === entry.cards.length) return { ok: false, message: "Card id not found.", status: 404 };
  store[normalizedPath] = { cards: nextCards, updatedAt: new Date().toISOString() };
  const saved = saveLocalImportedDeckStore(store);
  if (!saved.ok) return { ok: false, message: saved.message, status: 507 };
  return { ok: true, message: "", status: 200, localOnly: true };
}

function persistLocalImportedDeckRename(oldDeckPath, newDeckPath) {
  const oldPath = normalizeDeckPathForSave(oldDeckPath);
  const nextPath = normalizeDeckPathForSave(newDeckPath);
  if (!oldPath || !nextPath) return null;
  const store = loadLocalImportedDeckStore();
  const entry = store[oldPath];
  if (!entry || !Array.isArray(entry.cards)) return null;
  if (oldPath !== nextPath && store[nextPath]) {
    return { ok: false, message: "A local imported deck with that name already exists.", status: 409 };
  }
  store[nextPath] = { cards: entry.cards.slice(), updatedAt: new Date().toISOString() };
  delete store[oldPath];
  const saved = saveLocalImportedDeckStore(store);
  if (!saved.ok) return { ok: false, message: saved.message, status: 507 };
  return { ok: true, message: "", status: 200, localOnly: true };
}

function persistLocalImportedDeckRemove(deckPath) {
  const normalizedPath = normalizeDeckPathForSave(deckPath);
  if (!normalizedPath) return null;
  const store = loadLocalImportedDeckStore();
  if (!store[normalizedPath]) return null;
  delete store[normalizedPath];
  const saved = saveLocalImportedDeckStore(store);
  if (!saved.ok) return { ok: false, message: saved.message, status: 507 };
  return { ok: true, message: "", status: 200, localOnly: true };
}

function tryLocalDeckWriteFallback(route, payload, result) {
  if (result?.ok) return null;
  const status = Number(result?.status) || 0;
  if (status !== 0) return null;

  if (route === "/deck/create") {
    return persistLocalImportedDeckCreate(payload?.deck_path, payload?.cards, {
      overwrite: !!payload?.overwrite
    });
  }

  if (route === "/deck/update") {
    return persistLocalImportedDeckUpdate(payload?.deck_path, payload?.card, {
      allowCreate: !!payload?.allow_create
    });
  }

  if (route === "/deck/delete") {
    return persistLocalImportedDeckDelete(payload?.deck_path, payload?.card_id);
  }

  if (route === "/deck/rename") {
    return persistLocalImportedDeckRename(payload?.old_path, payload?.new_path);
  }

  if (route === "/deck/remove") {
    return persistLocalImportedDeckRemove(payload?.deck_path);
  }

  return null;
}

function loadRecentDeckPaths() {
  const raw = safeParseStorageJson(STORAGE_RECENT_DECKS, []);
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  raw.forEach((entry) => {
    const key = normalizeDeckKey(entry);
    if (!key || isExcludedDeckKey(key) || seen.has(key)) return;
    seen.add(key);
    out.push(key);
  });
  return out;
}

function deckNameFromKey(deckKey) {
  const key = normalizeDeckKey(deckKey);
  if (key.toLowerCase() === "default") return "Default Deck";
  if (key.startsWith("gen:")) return key;
  const tail = key.replace(/\\/g, "/").split("/").pop() || key;
  const noExt = tail.replace(/\.json$/i, "");
  try {
    return decodeURIComponent(noExt);
  } catch {
    return noExt;
  }
}

function normalizeCardsByDeck(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const values = Object.values(raw);
  const looksLegacy = values.some((value) => value && typeof value === "object" && ("due" in value || "stability" in value || "difficulty" in value));
  return looksLegacy ? { default: raw } : raw;
}

function normalizeLogsByDeck(raw) {
  if (!raw) return {};
  if (Array.isArray(raw)) return { default: raw };
  if (typeof raw !== "object") return {};
  return raw;
}

function normalizeDueDate(value, now = new Date()) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    if (Math.abs(value) < 1e11) {
      const out = startOfDay(now);
      out.setDate(out.getDate() + Math.max(0, Math.round(value)));
      return out;
    }
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }
  return new Date(now);
}

function parseReviewTimeMs(log) {
  const raw = log?.review ?? log?.review_time ?? log?.time ?? log?.due ?? null;
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : NaN;
}

function parseReviewRating(log) {
  const rating = Number(log?.review_rating ?? log?.rating ?? 0);
  return Number.isFinite(rating) ? rating : 0;
}

function parseElapsedMs(log) {
  const elapsed = Number(log?.elapsed_ms ?? log?.elapsedMs ?? log?.duration_ms ?? log?.durationMs ?? 0);
  return Number.isFinite(elapsed) && elapsed > 0 ? elapsed : 0;
}

function formatDateLong(date) {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatLastActive(date, now = new Date()) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return "Never";
  const d0 = startOfDay(date).getTime();
  const n0 = startOfDay(now).getTime();
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (d0 === n0) return `Today, ${time}`;
  if (d0 === n0 - 864e5) return `Yesterday, ${time}`;
  return `${formatDateLong(date)}, ${time}`;
}

function formatDateTimeRelative(date, now = new Date()) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return "Not scheduled";
  const d0 = startOfDay(date).getTime();
  const n0 = startOfDay(now).getTime();
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (d0 === n0) return `Today, ${time}`;
  if (d0 === n0 + DAY_MS) return `Tomorrow, ${time}`;
  if (d0 === n0 - DAY_MS) return `Yesterday, ${time}`;
  return `${formatDateLong(date)}, ${time}`;
}

function collectEvents(logsByDeck) {
  const events = [];
  Object.entries(logsByDeck || {}).forEach(([deckKey, logs]) => {
    if (isExcludedDeckKey(deckKey)) return;
    if (!Array.isArray(logs)) return;
    logs.forEach((log) => {
      const timeMs = parseReviewTimeMs(log);
      if (!Number.isFinite(timeMs)) return;
      events.push({
        deckKey: normalizeDeckKey(deckKey),
        timeMs,
        rating: parseReviewRating(log),
        elapsedMs: parseElapsedMs(log)
      });
    });
  });
  events.sort((a, b) => a.timeMs - b.timeMs);
  return events;
}

function buildActivityDailyFromEvents(events, days = HEATMAP_DAYS, now = new Date()) {
  const end = startOfDay(now);
  const start = new Date(end);
  start.setDate(start.getDate() - days + 1);
  const startMs = start.getTime();
  const endMs = end.getTime() + DAY_MS;
  const counts = new Map();

  events.forEach((event) => {
    if (event.timeMs < startMs || event.timeMs >= endMs) return;
    const key = toIsoDate(new Date(event.timeMs));
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  const items = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const iso = toIsoDate(cursor);
    items.push({ date: iso, reviews: counts.get(iso) || 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return items;
}

function buildActivityCountsByUtcDate(events) {
  const counts = new Map();
  events.forEach((event) => {
    if (!Number.isFinite(event?.timeMs)) return;
    const key = toIsoDateUtc(new Date(event.timeMs));
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return counts;
}

function computeRetentionPercent(events, days = 30, now = new Date()) {
  const cutoff = now.getTime() - days * 864e5;
  const sample = events.filter((event) => event.timeMs >= cutoff);
  if (!sample.length) return 0;
  const success = sample.reduce((sum, event) => sum + (event.rating > 1 ? 1 : 0), 0);
  return Math.round((success / sample.length) * 100);
}

function computeStreakDays(activityDaily) {
  const counts = new Map(activityDaily.map((day) => [day.date, Number(day.reviews) || 0]));
  const cursor = startOfDay(new Date());
  let streak = 0;
  while ((counts.get(toIsoDate(cursor)) || 0) > 0) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function computeAverageElapsedMs(events, now = new Date()) {
  const cutoff = now.getTime() - 14 * 864e5;
  const sample = events.filter((event) => event.timeMs >= cutoff && event.elapsedMs > 0);
  if (!sample.length) return DEFAULT_REVIEW_SECONDS * 1000;
  const sum = sample.reduce((total, event) => total + event.elapsedMs, 0);
  return Math.max(5000, sum / sample.length);
}

function toStartOfWeekLabel(offset, date) {
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  return date.toLocaleDateString(undefined, { weekday: "short" });
}

function summarizeDecks(cardsByDeck, deckKeys, now = new Date()) {
  const rows = [];
  const allDueCards = [];
  const nowMs = now.getTime();
  let nextReviewAtMs = Number.POSITIVE_INFINITY;

  deckKeys.forEach((deckKey) => {
    const key = normalizeDeckKey(deckKey);
    if (isExcludedDeckKey(key)) return;
    const cardsObj = cardsByDeck?.[key];
    const cards = cardsObj && typeof cardsObj === "object" ? Object.values(cardsObj) : [];
    let due = 0;
    let learned = 0;

    cards.forEach((card) => {
      if (!card || typeof card !== "object") return;
      if (Number(card.reps || 0) > 0) learned += 1;
      const dueDate = normalizeDueDate(card.due, now);
      const dueMs = dueDate.getTime();
      if (!Number.isFinite(dueMs)) return;
      if (dueMs <= nowMs) {
        due += 1;
        allDueCards.push(card);
      } else if (dueMs < nextReviewAtMs) {
        nextReviewAtMs = dueMs;
      }
    });

    rows.push({
      id: key,
      path: key,
      name: deckNameFromKey(key),
      due,
      learned,
      total: cards.length
    });
  });

  rows.sort((a, b) => (b.due - a.due) || a.name.localeCompare(b.name));
  return {
    rows,
    allDueCards,
    nextReviewAtMs: Number.isFinite(nextReviewAtMs) ? nextReviewAtMs : null
  };
}

function buildRecentActivity(events, maxRows = Number.POSITIVE_INFINITY) {
  const grouped = new Map();
  events.forEach((event) => {
    const dayKey = toIsoDate(new Date(event.timeMs));
    const key = `${dayKey}|${event.deckKey}`;
    let bucket = grouped.get(key);
    if (!bucket) {
      bucket = { dayKey, deckKey: event.deckKey, reviewed: 0, success: 0, elapsedMs: 0, latestMs: 0 };
      grouped.set(key, bucket);
    }
    bucket.reviewed += 1;
    bucket.success += event.rating > 1 ? 1 : 0;
    bucket.elapsedMs += event.elapsedMs;
    bucket.latestMs = Math.max(bucket.latestMs, event.timeMs);
  });

  return [...grouped.values()]
    .sort((a, b) => b.latestMs - a.latestMs)
    .slice(0, Number.isFinite(maxRows) ? Math.max(0, Math.floor(maxRows)) : undefined)
    .map((bucket) => ({
      date: formatDateLong(parseIsoDate(bucket.dayKey)),
      deck: deckNameFromKey(bucket.deckKey),
      reviewed: bucket.reviewed,
      accuracy: bucket.reviewed ? Math.round((bucket.success / bucket.reviewed) * 100) : 0,
      minutes: Math.max(1, Math.round((bucket.elapsedMs || (bucket.reviewed * DEFAULT_REVIEW_SECONDS * 1000)) / 60000))
    }));
}

function buildDueForecast(cardsByDeck, now = new Date()) {
  const today = startOfDay(now);
  const buckets = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    return { label: toStartOfWeekLabel(offset, date), due: 0, date };
  });

  Object.entries(cardsByDeck || {}).forEach(([deckKey, deck]) => {
    if (isExcludedDeckKey(deckKey)) return;
    if (!deck || typeof deck !== "object") return;
    Object.values(deck).forEach((card) => {
      if (!card || typeof card !== "object") return;
      const dueDate = startOfDay(normalizeDueDate(card.due, now));
      const diff = Math.floor((dueDate.getTime() - today.getTime()) / 864e5);
      if (diff < 0 || diff >= buckets.length) return;
      buckets[diff].due += 1;
    });
  });

  return buckets.map(({ label, due }) => ({ label, due }));
}

function buildSuggestions({ dueNow, retention30d, streakDays, weeklyDone }) {
  const out = [];
  if (dueNow >= 80) out.push({ title: "Large due queue", body: "Prioritize reviews on your heaviest deck first to cut the queue quickly." });
  if (retention30d > 0 && retention30d < 80) out.push({ title: "Retention dip", body: "Retention is below 80%. Favor reviews over new cards today." });
  if (weeklyDone < Math.round(WEEKLY_GOAL_TARGET * 0.6)) out.push({ title: "Weekly pace is low", body: "Add one short extra session to stay on target this week." });
  if (streakDays > 0) out.push({ title: "Protect your streak", body: `A short review keeps your ${streakDays}-day streak alive.` });
  if (!out.length) out.push({ title: "Steady cadence", body: "Your pace looks balanced. Keep the same review rhythm." });
  return out.slice(0, 3);
}

function buildHomeData() {
  const now = new Date();
  const cardsByDeck = normalizeCardsByDeck(safeParseStorageJson(STORAGE_CARDS, {}));
  const logsByDeck = normalizeLogsByDeck(safeParseStorageJson(STORAGE_LOGS, {}));
  const currentDeck = normalizeDeckKey(localStorage.getItem(STORAGE_DECK_PATH) || "default");
  const recentDecks = loadRecentDeckPaths();
  const events = collectEvents(logsByDeck);
  const activityDaily = buildActivityDailyFromEvents(events, HEATMAP_DAYS, now);
  const activityUtcCounts = buildActivityCountsByUtcDate(events);
  const todayIso = toIsoDate(now);
  const reviewsToday = activityDaily.find((day) => day.date === todayIso)?.reviews || 0;
  const weeklyDone = events.filter((event) => event.timeMs >= (startOfDay(new Date(now.getTime() - 6 * 864e5)).getTime())).length;
  const retention30d = computeRetentionPercent(events, 30, now);
  const streakDays = computeStreakDays(activityDaily);
  const avgElapsedMs = computeAverageElapsedMs(events, now);
  const todayElapsedMs = events
    .filter((event) => toIsoDate(new Date(event.timeMs)) === todayIso)
    .reduce((sum, event) => sum + event.elapsedMs, 0);

  const deckKeySet = new Set([
    ...Object.keys(cardsByDeck || {}),
    ...Object.keys(logsByDeck || {}),
    ...knownServerDeckPaths,
    currentDeck,
    ...recentDecks
  ].map(normalizeDeckKey).filter((key) => Boolean(key) && !missingDeckKeys.has(key) && !isExcludedDeckKey(key)));
  const { rows: decksDue, allDueCards, nextReviewAtMs } = summarizeDecks(cardsByDeck, [...deckKeySet], now);
  const dueNow = decksDue.reduce((sum, row) => sum + row.due, 0);

  const reviewDue = allDueCards.reduce((sum, card) => sum + (Number(card?.state) === 2 ? 1 : 0), 0);
  const relearnDue = Math.max(0, dueNow - reviewDue);
  const estBaseMin = Math.max(1, Math.round((dueNow * avgElapsedMs) / 60000));
  const estMin = Math.max(1, Math.round(estBaseMin * 0.85));
  const estMax = Math.max(estMin, Math.round(estBaseMin * 1.2));

  const profileName = PROFILE_NAME_KEYS
    .map((key) => String(localStorage.getItem(key) || "").trim())
    .find(Boolean) || "User";
  const avatarUrl = PROFILE_AVATAR_KEYS
    .map((key) => String(localStorage.getItem(key) || "").trim())
    .find(Boolean) || "";
  const firstEventMs = events.length ? events[0].timeMs : NaN;
  const lastEventMs = events.length ? events[events.length - 1].timeMs : NaN;

  return {
    user: {
      name: profileName,
      avatarUrl,
      joinedAt: Number.isFinite(firstEventMs) ? formatDateLong(new Date(firstEventMs)) : "Not available",
      lastActive: Number.isFinite(lastEventMs) ? formatLastActive(new Date(lastEventMs), now) : "Never",
      totalDecks: decksDue.length
    },
    kpis: {
      dueNow,
      reviewsToday,
      retention30d,
      streakDays,
      timeStudiedMin: Math.max(0, Math.round((todayElapsedMs || (reviewsToday * avgElapsedMs)) / 60000))
    },
    today: {
      dueNow,
      estMin,
      estMax,
      nextReviewAtMs,
      breakdown: {
        review: reviewDue,
        relearn: relearnDue
      }
    },
    decksDue,
    recentActivity: buildRecentActivity(events),
    weeklyGoal: {
      done: weeklyDone,
      target: WEEKLY_GOAL_TARGET
    },
    dueForecast: buildDueForecast(cardsByDeck, now),
    suggestions: buildSuggestions({
      dueNow,
      retention30d,
      streakDays,
      weeklyDone
    }),
    activityDaily,
    activityUtcCounts
  };
}

const refs = {
  profileName: document.getElementById("profileName"),
  profileAvatarImage: document.getElementById("profileAvatarImage"),
  profileAvatarFallback: document.getElementById("profileAvatarFallback"),
  profileMetaChips: document.getElementById("profileMetaChips"),
  todayDueLabel: document.getElementById("todayDueLabel"),
  todayEstimate: document.getElementById("todayEstimate"),
  todayBreakdown: document.getElementById("todayBreakdown"),
  nextReviewTracker: document.getElementById("nextReviewTracker"),
  todayStartBtn: document.getElementById("todayStartBtn"),
  customSessionBtn: document.getElementById("customSessionBtn"),
  warmupBtn: document.getElementById("warmupBtn"),
  importDeckBtn: document.getElementById("importDeckBtn"),
  deckPersistenceBar: document.getElementById("deckPersistenceBar"),
  deckPersistenceText: document.getElementById("deckPersistenceText"),
  flushDeckWritesBtn: document.getElementById("flushDeckWritesBtn"),
  decksDueList: document.getElementById("decksDueList"),
  viewAllDecksBtn: document.getElementById("viewAllDecksBtn"),
  recentActivityRows: document.getElementById("recentActivityRows"),
  viewAllActivityBtn: document.getElementById("viewAllActivityBtn"),
  weeklyGoalMeta: document.getElementById("weeklyGoalMeta"),
  weeklyGoalFill: document.getElementById("weeklyGoalFill"),
  weeklyGoalInsight: document.getElementById("weeklyGoalInsight"),
  dueForecastList: document.getElementById("dueForecastList"),
  suggestionsList: document.getElementById("suggestionsList"),
  heatmapShell: document.getElementById("heatmapShell"),
  heatmapMonths: document.getElementById("heatmapMonths"),
  heatmapGrid: document.getElementById("heatmapGrid"),
  heatmapTooltip: document.getElementById("heatmapTooltip"),
  heatmapAvgSummary: document.getElementById("heatmapAvgSummary"),
  heatmapAvgPrimary: document.getElementById("heatmapAvgPrimary"),
  heatmapPrevYearBtn: document.getElementById("heatmapPrevYearBtn"),
  heatmapNextYearBtn: document.getElementById("heatmapNextYearBtn"),
  heatmapYearCarousel: document.getElementById("heatmapYearCarousel"),
  heatmapYearTrack: document.getElementById("heatmapYearTrack"),
  mobileDueLabel: document.getElementById("mobileDueLabel"),
  mobileStartBtn: document.getElementById("mobileStartBtn"),
  homeInputModal: document.getElementById("homeInputModal"),
  homeInputModalTitle: document.getElementById("homeInputModalTitle"),
  homeInputModalMessage: document.getElementById("homeInputModalMessage"),
  homeInputModalLabel: document.getElementById("homeInputModalLabel"),
  homeInputModalField: document.getElementById("homeInputModalField"),
  homeInputModalError: document.getElementById("homeInputModalError"),
  homeInputModalCancel: document.getElementById("homeInputModalCancel"),
  homeInputModalConfirm: document.getElementById("homeInputModalConfirm"),
  deckImportModal: document.getElementById("deckImportModal"),
  deckImportFileBtn: document.getElementById("deckImportFileBtn"),
  deckImportClearBtn: document.getElementById("deckImportClearBtn"),
  deckImportFileIcon: document.getElementById("deckImportFileIcon"),
  deckImportFile: document.getElementById("deckImportFile"),
  deckImportName: document.getElementById("deckImportName"),
  deckImportError: document.getElementById("deckImportError"),
  deckImportMappingPanel: document.getElementById("deckImportMappingPanel"),
  deckImportMetaSummary: document.getElementById("deckImportMetaSummary"),
  deckImportWarnings: document.getElementById("deckImportWarnings"),
  deckImportUseFirstTwoWrap: document.getElementById("deckImportUseFirstTwoWrap"),
  deckImportUseFirstTwo: document.getElementById("deckImportUseFirstTwo"),
  deckImportSaveProfile: document.getElementById("deckImportSaveProfile"),
  deckImportProfileName: document.getElementById("deckImportProfileName"),
  deckImportColumnMap: document.getElementById("deckImportColumnMap"),
  deckImportPreviewRow: document.getElementById("deckImportPreviewRow"),
  deckImportPreviewRaw: document.getElementById("deckImportPreviewRaw"),
  deckImportPreviewJson: document.getElementById("deckImportPreviewJson"),
  deckImportPreviewRenderFront: document.getElementById("deckImportPreviewRenderFront"),
  deckImportPreviewRenderBack: document.getElementById("deckImportPreviewRenderBack"),
  deckImportRejectsDownload: document.getElementById("deckImportRejectsDownload"),
  deckImportCancel: document.getElementById("deckImportCancel"),
  deckImportConfirm: document.getElementById("deckImportConfirm")
};

const numberFormatter = new Intl.NumberFormat();
const heatmapMonthFormatterUtc = new Intl.DateTimeFormat(undefined, { month: "short", timeZone: "UTC" });
const heatmapDateFormatterUtc = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function reviewsToHeatLevel(reviews) {
  if (reviews <= 0) return 0;
  if (reviews <= HEATMAP_BINS.level1Max) return 1;
  if (reviews <= HEATMAP_BINS.level2Max) return 2;
  if (reviews <= HEATMAP_BINS.level3Max) return 3;
  return 4;
}

function formatHeatmapDailyAverage(value) {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  return safe < 10 ? safe.toFixed(1) : String(Math.round(safe));
}

function buildAlignedHeatmap(activityDaily) {
  const sorted = [...activityDaily].sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) {
    return { days: [], weeksCount: 0, monthLabels: [], totalReviews: 0 };
  }

  const firstDate = parseIsoDate(sorted[0].date);
  const lastDate = parseIsoDate(sorted[sorted.length - 1].date);
  const alignedStart = startOfWeekMonday(firstDate);
  const alignedEnd = endOfWeekSunday(lastDate);

  const reviewsMap = new Map(sorted.map((entry) => [entry.date, Number(entry.reviews) || 0]));
  const days = [];
  let cursor = new Date(alignedStart);
  let index = 0;

  while (cursor <= alignedEnd) {
    const iso = toIsoDate(cursor);
    const inRange = cursor >= firstDate && cursor <= lastDate;
    const reviews = inRange ? (reviewsMap.get(iso) || 0) : 0;
    const level = inRange ? reviewsToHeatLevel(reviews) : 0;
    days.push({
      date: new Date(cursor),
      iso,
      inRange,
      reviews,
      level,
      weekIndex: Math.floor(index / 7)
    });
    index += 1;
    cursor.setDate(cursor.getDate() + 1);
  }

  const weeksCount = Math.ceil(days.length / 7);
  const totalReviews = days.reduce((sum, day) => sum + (day.inRange ? day.reviews : 0), 0);

  const monthLabelsRaw = [];
  const firstVisible = days.find((day) => day.inRange);
  if (firstVisible) {
    monthLabelsRaw.push({
      weekIndex: 0,
      text: firstVisible.date.toLocaleDateString(undefined, { month: "short" })
    });
  }

  days.forEach((day) => {
    if (!day.inRange || day.date.getDate() !== 1) return;
    monthLabelsRaw.push({
      weekIndex: day.weekIndex,
      text: day.date.toLocaleDateString(undefined, { month: "short" })
    });
  });

  monthLabelsRaw.sort((a, b) => a.weekIndex - b.weekIndex);
  const monthLabels = [];
  monthLabelsRaw.forEach((label) => {
    const last = monthLabels[monthLabels.length - 1];
    if (!last || label.weekIndex - last.weekIndex >= 2) {
      monthLabels.push(label);
    }
  });

  return { days, weeksCount, monthLabels, totalReviews };
}

function formatPercent(value) {
  return `${Math.round(value)}%`;
}

function accuracyClass(accuracy) {
  if (accuracy >= 85) return "accuracy-good";
  if (accuracy >= 75) return "accuracy-mid";
  return "";
}

function initialsFromName(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "LE";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

const ACTIVITY_ROWS_COLLAPSED = 10;
const MAX_SESSION_CARDS = 500;
const CARD_EDITS_KEY = "CARD_EDITS_V1";
const DECK_WRITE_QUEUE_KEY = "DECK_WRITE_QUEUE_V1";
const TRASH3_FILL_ICON_SRC = "icons/bootstrap/trash3-fill.svg";
const DECK_PREVIEW_ERROR_FALLBACK = "Unable to load this deck preview.";
const uiState = {
  showAllDecks: false,
  showAllActivity: false,
  expandedDeckIds: new Set(),
  inlineDeckCreateChooserOpen: false,
  inlineDeckCreateDraft: null,
  inlineDeckCreateError: "",
  inlineCardTypeDeckId: "",
  inlineCardDraftByDeck: new Map(),
  deckStatusById: new Map(),
  flushingWrites: false,
  heatmapYear: new Date().getUTCFullYear(),
  heatmapYearDrag: null,
  heatmapYearAnimating: false
};
const deckPreviewCache = new Map();
const deckPreviewLoading = new Set();
const missingDeckKeys = new Set();
const knownServerDeckPaths = new Set();
let pruneMissingDecksPromise = null;
let syncDeckPathsPromise = null;
let lastPruneMissingDecksAt = 0;
let reconcileDueDecksPromise = null;
let lastReconcileDueDecksAt = 0;
const RECONCILE_DUE_DECKS_COOLDOWN_MS = 10000;
let diagramModalRefs = null;
let inputModalState = null;
let deckImportModalBound = false;
let deckImportNameManuallyEdited = false;
let deckImportSubmitting = false;
let deckImportSession = null;
let deckImportRejectsDownloadUrl = "";
let activeHomeTooltipTarget = null;
const homeInlineSvgCache = new Map();
const CARD_AUTOSAVE_DEBOUNCE_MS = 650;
const deckCardAutosaveTimers = new Map();
const deckCardAutosaveInFlight = new Set();
const deckCardAutosavePending = new Set();
let deckWriterRemoveSupport = null;
let homeAlertsModulePromise = null;

function safeText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function ensureAlertStyles() {
  if (document.getElementById("alerts-css")) return;
  const link = document.createElement("link");
  link.id = "alerts-css";
  link.rel = "stylesheet";
  link.href = "css/alerts.css";
  document.head.appendChild(link);
}

function loadHomeAlertsModule() {
  if (homeAlertsModulePromise) return homeAlertsModulePromise;
  homeAlertsModulePromise = import("./js/alerts.js").catch(() => null);
  return homeAlertsModulePromise;
}

function showHomeAlert(variant = "info", title = "", desc = "", options = {}) {
  ensureAlertStyles();
  void loadHomeAlertsModule().then((mod) => {
    if (typeof mod?.showAlert === "function") {
      mod.showAlert(variant, title, desc, options);
      return;
    }
    // Fallback when alerts module cannot be loaded.
    const logger = variant === "error" ? console.error : console.warn;
    logger(`[home-alert:${variant}] ${title ? `${title}: ` : ""}${desc}`);
  });
}

function clearDeckImportInlineError() {
  if (refs.deckImportError instanceof HTMLElement) refs.deckImportError.textContent = "";
}

function showHomeError(title = "Error", message = "") {
  showHomeAlert("error", title, String(message || "Unknown error."));
}

function showHomeWarning(title = "Notice", message = "") {
  showHomeAlert("warning", title, String(message || "Please review your input."));
}

function reportDeckImportIssue(message = "", { title = "Import Deck", variant = "warning" } = {}) {
  clearDeckImportInlineError();
  if (variant === "error") showHomeError(title, message);
  else showHomeWarning(title, message);
}

function reportInlineDeckCreateIssue(message = "", { title = "New Deck" } = {}) {
  uiState.inlineDeckCreateError = "";
  showHomeWarning(title, message);
}

async function inlineSvgElement(el) {
  if (!(el instanceof SVGElement)) return;
  const url = safeText(el.getAttribute("data-src"), "");
  if (!url) return;
  try {
    let svgText = homeInlineSvgCache.get(url);
    if (!svgText) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      svgText = await res.text();
      homeInlineSvgCache.set(url, svgText);
    }
    const svg = new DOMParser().parseFromString(svgText, "image/svg+xml").documentElement;
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    const className = safeText(el.getAttribute("class"), "");
    if (className) svg.setAttribute("class", className);
    if (el.hasAttribute("aria-hidden")) svg.setAttribute("aria-hidden", el.getAttribute("aria-hidden") || "true");
    el.replaceWith(svg);
  } catch {
    // Keep the original placeholder if local icon inlining fails.
  }
}

function hydrateInlineIcons(root = document) {
  if (!(root instanceof Document) && !(root instanceof Element)) return;
  const icons = [];
  if (root instanceof SVGElement && root.hasAttribute("data-src")) icons.push(root);
  const found = root.querySelectorAll("svg[data-src]");
  found.forEach((icon) => {
    if (icon instanceof SVGElement) icons.push(icon);
  });
  icons.forEach((icon) => {
    void inlineSvgElement(icon);
  });
}

function encodeDataValue(value) {
  return encodeURIComponent(String(value ?? ""));
}

function decodeDataValue(value) {
  try {
    return decodeURIComponent(String(value ?? ""));
  } catch {
    return String(value ?? "");
  }
}

function deckCardAutosaveKey(deckId, cardId) {
  return `${normalizeDeckKey(deckId)}::${String(cardId ?? "").trim()}`;
}

function readDeckCardIdsFromRow(rowEl) {
  if (!(rowEl instanceof HTMLElement)) return null;
  const deckId = decodeDataValue(rowEl.dataset.deckId || "");
  const cardId = decodeDataValue(rowEl.dataset.cardId || "");
  if (!deckId || !cardId) return null;
  return { deckId, cardId };
}

function findDeckCardRowElement(deckId, cardId) {
  const rows = document.querySelectorAll(".deck-card-row");
  for (const row of rows) {
    const ids = readDeckCardIdsFromRow(row);
    if (!ids) continue;
    if (normalizeDeckKey(ids.deckId) === normalizeDeckKey(deckId) && String(ids.cardId) === String(cardId)) {
      return row;
    }
  }
  return null;
}

async function flushDeckCardAutosave(deckId, cardId, rowEl) {
  const key = deckCardAutosaveKey(deckId, cardId);
  if (!key) return;
  if (deckCardAutosaveInFlight.has(key)) {
    deckCardAutosavePending.add(key);
    return;
  }
  deckCardAutosaveInFlight.add(key);
  try {
    const activeRow = rowEl instanceof HTMLElement && document.body.contains(rowEl)
      ? rowEl
      : findDeckCardRowElement(deckId, cardId);
    if (!activeRow) return;
    await saveDeckCardFromRow(deckId, cardId, activeRow, null, {
      silentNoChange: true,
      autosave: true
    });
  } finally {
    deckCardAutosaveInFlight.delete(key);
    if (deckCardAutosavePending.has(key)) {
      deckCardAutosavePending.delete(key);
      const nextRow = findDeckCardRowElement(deckId, cardId);
      if (nextRow) {
        void flushDeckCardAutosave(deckId, cardId, nextRow);
      }
    }
  }
}

function scheduleDeckCardAutosave(deckId, cardId, rowEl, { immediate = false } = {}) {
  const key = deckCardAutosaveKey(deckId, cardId);
  if (!key) return;
  const priorTimer = deckCardAutosaveTimers.get(key);
  if (priorTimer) window.clearTimeout(priorTimer);
  if (immediate) {
    deckCardAutosaveTimers.delete(key);
    void flushDeckCardAutosave(deckId, cardId, rowEl);
    return;
  }
  const timer = window.setTimeout(() => {
    deckCardAutosaveTimers.delete(key);
    void flushDeckCardAutosave(deckId, cardId, rowEl);
  }, CARD_AUTOSAVE_DEBOUNCE_MS);
  deckCardAutosaveTimers.set(key, timer);
}

function readCardFront(card) {
  const front = card?.front ?? card?.front_text;
  if (front != null) return String(front);
  if (String(card?.type || "") === "diagram") return "Which structure is highlighted?";
  return "";
}

function readCardBack(card) {
  const back = card?.back ?? card?.back_text;
  if (back != null) return String(back);
  if (String(card?.type || "") === "diagram" && Array.isArray(card?.labels) && card.labels.length) {
    return String(card.labels[0]?.name || "");
  }
  return "";
}

function normalizeDeckCardLangCode(value = "", fallback = "") {
  return normalizeImportLangCode(value, fallback || "");
}

function readCardFaceLanguageCode(card, side = "front") {
  if (!card || typeof card !== "object") return "";
  const face = side === "back" ? "back" : "front";
  const lang = card.lang;
  let value = "";
  if (lang && typeof lang === "object" && !Array.isArray(lang)) {
    value = face === "back" ? (lang.back ?? "") : (lang.front ?? "");
  }
  if (!value) {
    value = face === "back" ? (card.langBack ?? card.back_lang ?? "") : (card.langFront ?? card.front_lang ?? "");
  }
  if (!value && typeof lang === "string") value = lang;
  return normalizeDeckCardLangCode(value, "");
}

function buildCardLangObject(frontLang = "", backLang = "") {
  const front = normalizeDeckCardLangCode(frontLang, "");
  const back = normalizeDeckCardLangCode(backLang, "");
  if (!front && !back) return null;
  return { front, back };
}

function applyCardLanguageValues(card, { frontLang, backLang } = {}) {
  const updated = { ...(card || {}) };
  if (frontLang === undefined && backLang === undefined) return updated;

  const priorFront = readCardFaceLanguageCode(updated, "front");
  const priorBack = readCardFaceLanguageCode(updated, "back");
  const nextFront = frontLang === undefined ? priorFront : normalizeDeckCardLangCode(frontLang, "");
  const nextBack = backLang === undefined ? priorBack : normalizeDeckCardLangCode(backLang, "");
  const nextLang = buildCardLangObject(nextFront, nextBack);

  if (nextLang) updated.lang = nextLang;
  else delete updated.lang;
  if ("langFront" in updated) updated.langFront = nextFront;
  if ("langBack" in updated) updated.langBack = nextBack;
  if ("front_lang" in updated) updated.front_lang = nextFront;
  if ("back_lang" in updated) updated.back_lang = nextBack;

  return updated;
}

function applyCardFaceValues(card, front, back, langUpdate = {}) {
  const updated = { ...(card || {}) };
  if ("front" in updated || !("front_text" in updated)) updated.front = front;
  if ("front_text" in updated) updated.front_text = front;
  if ("back" in updated || !("back_text" in updated)) updated.back = back;
  if ("back_text" in updated) updated.back_text = back;
  return applyCardLanguageValues(updated, langUpdate);
}

function buildDraftCardId(deckPath = "", cards = []) {
  const normalizedPath = normalizeDeckPathForSave(deckPath);
  const stem = sanitizeDeckFileStem(deckNameFromKey(normalizedPath) || "card").toLowerCase() || "card";
  const used = new Set(
    (Array.isArray(cards) ? cards : [])
      .map((card) => String(card?.id ?? "").trim())
      .filter(Boolean)
  );
  let id = "";
  do {
    const stamp = Date.now().toString(36);
    const suffix = Math.random().toString(36).slice(2, 8);
    id = `${stem}_${stamp}_${suffix}`;
  } while (!id || used.has(id));
  return id;
}

function loadDeckDescriptionMap() {
  const raw = safeParseStorageJson(STORAGE_DECK_DESCRIPTIONS, {});
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

function saveDeckDescriptionMap(map) {
  try {
    localStorage.setItem(STORAGE_DECK_DESCRIPTIONS, JSON.stringify(map || {}));
  } catch {}
}

function getDeckDescription(deckKey) {
  const key = normalizeDeckKey(deckKey);
  if (!key) return "";
  const map = loadDeckDescriptionMap();
  return safeText(map[key], "");
}

function setDeckDescription(deckKey, description) {
  const key = normalizeDeckKey(deckKey);
  if (!key) return;
  const map = loadDeckDescriptionMap();
  const next = String(description ?? "").trim();
  if (!next) delete map[key];
  else map[key] = next;
  saveDeckDescriptionMap(map);
}

function moveDeckDescriptionKey(oldDeckKey, newDeckKey) {
  const fromKey = normalizeDeckKey(oldDeckKey);
  const toKey = normalizeDeckKey(newDeckKey);
  if (!fromKey || !toKey || fromKey === toKey) return;
  const map = loadDeckDescriptionMap();
  if (!(fromKey in map)) return;
  if (!(toKey in map)) map[toKey] = map[fromKey];
  delete map[fromKey];
  saveDeckDescriptionMap(map);
}

function normalizeCardEditsStore(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { byDeck: {} };
  const byDeck = raw.byDeck;
  if (byDeck && typeof byDeck === "object" && !Array.isArray(byDeck)) return { byDeck };
  return { byDeck: {} };
}

function cardEditsDeckKey(deckPath = "") {
  const normalizedPath = normalizeDeckPathForSave(deckPath);
  if (normalizedPath) return normalizedPath;
  const fallback = normalizeDeckKey(deckPath);
  if (!fallback || fallback.toLowerCase() === "default") return "";
  return fallback;
}

function loadCardEditsOverlayForDeck(deckPath = "") {
  const raw = safeParseStorageJson(CARD_EDITS_KEY, {});
  const store = normalizeCardEditsStore(raw);
  const key = cardEditsDeckKey(deckPath);
  const deckOverlay = key ? store.byDeck[key] : null;
  return deckOverlay && typeof deckOverlay === "object" && !Array.isArray(deckOverlay) ? deckOverlay : {};
}

function saveCardEditsOverlayForDeck(overlay, deckPath = "") {
  const key = cardEditsDeckKey(deckPath);
  if (!key) return;
  const raw = safeParseStorageJson(CARD_EDITS_KEY, {});
  const store = normalizeCardEditsStore(raw);
  const nextOverlay = overlay && typeof overlay === "object" && !Array.isArray(overlay) ? overlay : {};
  if (Object.keys(nextOverlay).length) store.byDeck[key] = nextOverlay;
  else delete store.byDeck[key];
  try {
    localStorage.setItem(CARD_EDITS_KEY, JSON.stringify({ byDeck: store.byDeck }));
  } catch {}
  updateDeckPersistenceUi();
}

function upsertCardEditOverlay(card, deckPath = "") {
  if (!card || card.id == null) return;
  const overlay = loadCardEditsOverlayForDeck(deckPath);
  overlay[String(card.id)] = { ...overlay[String(card.id)], ...card };
  saveCardEditsOverlayForDeck(overlay, deckPath);
}

function removeCardEditOverlay(cardId, deckPath = "") {
  if (cardId == null) return;
  const overlay = loadCardEditsOverlayForDeck(deckPath);
  if (!(String(cardId) in overlay)) return;
  delete overlay[String(cardId)];
  saveCardEditsOverlayForDeck(overlay, deckPath);
}

function applyCardEditsOverlay(cards, deckPath = "") {
  if (!Array.isArray(cards) || !cards.length) return [];
  const overlay = loadCardEditsOverlayForDeck(deckPath);
  if (!overlay || !Object.keys(overlay).length) return cards;
  return cards.map((card) => {
    const patch = overlay[String(card?.id)];
    if (!patch || typeof patch !== "object") return card;
    const merged = { ...card, ...patch };
    if (patch.font && typeof patch.font === "object") {
      merged.font = { ...(card?.font || {}), ...patch.font };
    }
    return merged;
  });
}

function countCardEditsOverlayEntries() {
  const raw = safeParseStorageJson(CARD_EDITS_KEY, {});
  const store = normalizeCardEditsStore(raw);
  let total = 0;
  Object.values(store.byDeck || {}).forEach((deckOverlay) => {
    if (!deckOverlay || typeof deckOverlay !== "object" || Array.isArray(deckOverlay)) return;
    total += Object.keys(deckOverlay).length;
  });
  return total;
}

function normalizeDeckWriteQueue(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const route = String(item.route || "").trim();
      const payload = item.payload && typeof item.payload === "object" && !Array.isArray(item.payload)
        ? item.payload
        : null;
      if (!route || !payload) return null;
      return {
        id: String(item.id || ""),
        route,
        payload,
        fingerprint: String(item.fingerprint || ""),
        queuedAt: Number(item.queuedAt) || Date.now(),
        attempts: Math.max(0, Number(item.attempts) || 0),
        lastError: String(item.lastError || "")
      };
    })
    .filter(Boolean);
}

function loadDeckWriteQueue() {
  const raw = safeParseStorageJson(DECK_WRITE_QUEUE_KEY, []);
  return normalizeDeckWriteQueue(raw);
}

function saveDeckWriteQueue(queue = []) {
  try {
    localStorage.setItem(DECK_WRITE_QUEUE_KEY, JSON.stringify(normalizeDeckWriteQueue(queue)));
  } catch {}
}

function deckWriteFingerprint(route, payload) {
  const r = String(route || "").trim();
  const p = payload && typeof payload === "object" ? payload : {};
  if (r === "/deck/create") return `${r}|${String(p.deck_path || "")}`;
  if (r === "/deck/update") return `${r}|${String(p.deck_path || "")}|${String(p?.card?.id ?? "")}`;
  if (r === "/deck/delete") return `${r}|${String(p.deck_path || "")}|${String(p.card_id ?? "")}`;
  if (r === "/deck/rename") return `${r}|${String(p.old_path || "")}|${String(p.new_path || "")}`;
  if (r === "/deck/remove") return `${r}|${String(p.deck_path || "")}`;
  return `${r}|${JSON.stringify(p)}`;
}

function upsertDeckWriteQueue(route, payload, message = "") {
  const queue = loadDeckWriteQueue();
  const fingerprint = deckWriteFingerprint(route, payload);
  const existingIndex = queue.findIndex((item) => item.fingerprint === fingerprint);
  const nextEntry = {
    id: existingIndex >= 0 ? String(queue[existingIndex].id || fingerprint) : fingerprint,
    route: String(route || "").trim(),
    payload: payload && typeof payload === "object" ? payload : {},
    fingerprint,
    queuedAt: existingIndex >= 0 ? (Number(queue[existingIndex].queuedAt) || Date.now()) : Date.now(),
    attempts: existingIndex >= 0 ? Math.max(0, Number(queue[existingIndex].attempts) || 0) : 0,
    lastError: String(message || "")
  };
  if (existingIndex >= 0) queue[existingIndex] = nextEntry;
  else queue.push(nextEntry);
  saveDeckWriteQueue(queue);
  return queue;
}

function removeDeckWriteQueue(route, payload) {
  const queue = loadDeckWriteQueue();
  const fingerprint = deckWriteFingerprint(route, payload);
  const next = queue.filter((item) => item.fingerprint !== fingerprint);
  if (next.length === queue.length) return queue;
  saveDeckWriteQueue(next);
  return next;
}

function clearDeckWriteQueueForDeckPath(deckPath = "") {
  const targetPath = normalizeDeckPathForSave(deckPath);
  if (!targetPath) return;
  const queue = loadDeckWriteQueue();
  const next = queue.filter((item) => {
    const route = String(item?.route || "").trim();
    const payload = item?.payload && typeof item.payload === "object" ? item.payload : {};
    const pathMatches = (raw) => normalizeDeckPathForSave(raw) === targetPath;
    if (route === "/deck/rename") {
      return !pathMatches(payload.old_path) && !pathMatches(payload.new_path);
    }
    return !pathMatches(payload.deck_path);
  });
  if (next.length === queue.length) return;
  saveDeckWriteQueue(next);
}

function updateDeckPersistenceUi() {
  if (!refs.deckPersistenceBar || !refs.deckPersistenceText) return;
  const queue = loadDeckWriteQueue();
  const pendingWrites = queue.length;
  const overlayCount = countCardEditsOverlayEntries();
  const flushBtn = refs.flushDeckWritesBtn;

  refs.deckPersistenceBar.classList.toggle("is-pending", pendingWrites > 0 || overlayCount > 0);
  if (pendingWrites > 0) {
    refs.deckPersistenceText.textContent = `Save location: local overlay only (${pendingWrites} pending write${pendingWrites === 1 ? "" : "s"}).`;
  } else if (overlayCount > 0) {
    refs.deckPersistenceText.textContent = `Save location: local overlay only (${overlayCount} local edit${overlayCount === 1 ? "" : "s"}).`;
  } else {
    refs.deckPersistenceText.textContent = "Save location: deck file (disk).";
  }

  if (flushBtn) {
    const showFlush = pendingWrites > 0;
    flushBtn.hidden = !showFlush;
    flushBtn.disabled = uiState.flushingWrites || !showFlush;
    flushBtn.textContent = uiState.flushingWrites ? "Flushing..." : "Flush pending writes";
  }
}

function showPersistenceNote(message) {
  if (!refs.deckPersistenceText) return;
  refs.deckPersistenceText.textContent = String(message || "");
  window.setTimeout(() => {
    updateDeckPersistenceUi();
  }, 1600);
}

function parseDeckPayloadCards(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && Array.isArray(payload.cards)) return payload.cards;
  return [];
}

function isDiagramSourceCard(card) {
  return Boolean(card && typeof card === "object" && card.type === "diagram" && card.image && Array.isArray(card.labels));
}

function diagramExpandedId(parentCardId, label, labelIndex) {
  const parent = String(parentCardId ?? "diagram");
  const key = label?.key ?? labelIndex;
  return `${parent}:${key}`;
}

function normalizeDeckPreviewCards(rawCardsInput = [], deckPath = "") {
  const rawCards = Array.isArray(rawCardsInput) ? rawCardsInput : [];
  const rawById = new Map();
  const rows = [];

  rawCards.forEach((sourceCard) => {
    if (!sourceCard || typeof sourceCard !== "object") return;
    const parentId = String(sourceCard.id ?? "");
    if (parentId) rawById.set(parentId, sourceCard);

    if (!isDiagramSourceCard(sourceCard)) {
      rows.push({
        ...sourceCard,
        __homeSource: { kind: "card", parentId }
      });
      return;
    }

    sourceCard.labels.forEach((label, labelIndex) => {
      const rowId = diagramExpandedId(sourceCard.id, label, labelIndex);
      const sourceLang = buildCardLangObject(
        readCardFaceLanguageCode(sourceCard, "front"),
        readCardFaceLanguageCode(sourceCard, "back")
      );
      rows.push({
        id: rowId,
        type: "diagram-label",
        front: String(sourceCard.front ?? sourceCard.front_text ?? "Which structure is highlighted?"),
        back: String(label?.name ?? ""),
        ...(sourceLang ? { lang: sourceLang } : {}),
        __homeSource: {
          kind: "diagram_label",
          parentId,
          labelIndex,
          labelKey: String(label?.key ?? labelIndex)
        }
      });
    });
  });

  return {
    cards: applyCardEditsOverlay(rows, deckPath),
    rawCards,
    rawById
  };
}

function getDiagramPayload(deckId, cardId) {
  const key = normalizeDeckKey(deckId);
  const preview = deckPreviewCache.get(key);
  if (!preview || !Array.isArray(preview.cards)) return null;
  const row = preview.cards.find((item) => String(item?.id) === String(cardId));
  if (!row) return null;
  const source = row?.__homeSource;
  if (!source || source.kind !== "diagram_label") return null;

  const parentId = String(source.parentId || "");
  const parent = preview.rawById instanceof Map
    ? preview.rawById.get(parentId)
    : (Array.isArray(preview.rawCards) ? preview.rawCards.find((item) => String(item?.id) === parentId) : null);
  if (!parent || !Array.isArray(parent.labels)) return null;

  const labels = parent.labels.filter((label) => label && typeof label === "object");
  if (!labels.length) return null;

  let activeIndex = Number(source.labelIndex);
  const activeKey = String(source.labelKey ?? "");
  if (!Number.isInteger(activeIndex) || activeIndex < 0 || activeIndex >= labels.length) {
    activeIndex = labels.findIndex((label, idx) => String(label?.key ?? idx) === activeKey);
  }
  if (!Number.isInteger(activeIndex) || activeIndex < 0 || activeIndex >= labels.length) {
    activeIndex = 0;
  }

  return {
    imageSrc: String(parent.image || ""),
    labels,
    activeIndex,
    parentId
  };
}

function buildDiagramOverlay(svgEl, payload, imageWidth, imageHeight) {
  if (!(svgEl instanceof SVGElement) || !payload) return;
  const width = Number(imageWidth);
  const height = Number(imageHeight);
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return;

  const svgNS = "http://www.w3.org/2000/svg";
  svgEl.innerHTML = "";
  svgEl.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");

  payload.labels.forEach((label, idx) => {
    const region = label?.region;
    if (!region || typeof region !== "object") return;
    const shape = String(region.shape || "").toLowerCase();
    let shapeEl = null;

    if (shape === "rect") {
      const x = Number(region.x);
      const y = Number(region.y);
      const w = Number(region.w);
      const h = Number(region.h);
      if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return;
      const rect = document.createElementNS(svgNS, "rect");
      rect.setAttribute("x", String(x));
      rect.setAttribute("y", String(y));
      rect.setAttribute("width", String(w));
      rect.setAttribute("height", String(h));
      shapeEl = rect;
    } else if (shape === "poly") {
      const pointsRaw = Array.isArray(region.points) ? region.points : [];
      const points = pointsRaw
        .map((pt) => {
          if (Array.isArray(pt) && pt.length >= 2) return [Number(pt[0]), Number(pt[1])];
          if (pt && typeof pt === "object") return [Number(pt.x), Number(pt.y)];
          return [NaN, NaN];
        })
        .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
      if (points.length < 3) return;
      const poly = document.createElementNS(svgNS, "polygon");
      poly.setAttribute("points", points.map(([x, y]) => `${x},${y}`).join(" "));
      shapeEl = poly;
    }

    if (!shapeEl) return;
    shapeEl.setAttribute("class", `diagram-occlusion-box${idx === payload.activeIndex ? " is-active" : ""}`);
    svgEl.appendChild(shapeEl);
  });
}

function hydrateDiagramPreviewOverlays() {
  const nodes = Array.from(document.querySelectorAll(".deck-diagram-preview"));
  nodes.forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    const deckId = decodeDataValue(node.dataset.deckId || "");
    const cardId = decodeDataValue(node.dataset.cardId || "");
    const payload = getDiagramPayload(deckId, cardId);
    if (!payload) return;
    const img = node.querySelector(".deck-diagram-image");
    const svg = node.querySelector(".deck-diagram-overlay-svg");
    if (!(img instanceof HTMLImageElement) || !(svg instanceof SVGElement)) return;

    const draw = () => {
      if (!img.naturalWidth || !img.naturalHeight) return;
      buildDiagramOverlay(svg, payload, img.naturalWidth, img.naturalHeight);
    };

    if (img.complete && img.naturalWidth) {
      draw();
    } else {
      img.addEventListener("load", draw, { once: true });
    }
  });
}

function ensureDiagramModal() {
  if (diagramModalRefs) return diagramModalRefs;
  const modal = document.createElement("div");
  modal.className = "diagram-modal";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="diagram-modal-backdrop" data-action="close-diagram-preview"></div>
    <div class="diagram-modal-panel" role="dialog" aria-modal="true" aria-label="Diagram preview">
      <img class="diagram-modal-image" alt="Diagram preview" />
      <svg class="diagram-modal-overlay-svg" aria-hidden="true"></svg>
    </div>
  `;
  document.body.appendChild(modal);

  const image = modal.querySelector(".diagram-modal-image");
  const overlay = modal.querySelector(".diagram-modal-overlay-svg");
  diagramModalRefs = { modal, image, overlay };
  return diagramModalRefs;
}

function closeDiagramPreview() {
  if (!diagramModalRefs) return;
  diagramModalRefs.modal.classList.remove("show");
  diagramModalRefs.modal.setAttribute("aria-hidden", "true");
  if (diagramModalRefs.image instanceof HTMLImageElement) {
    diagramModalRefs.image.removeAttribute("src");
  }
  if (diagramModalRefs.overlay instanceof SVGElement) {
    diagramModalRefs.overlay.innerHTML = "";
  }
  document.body.classList.remove("diagram-modal-open");
}

function ensureInputModal() {
  if (inputModalState) return true;
  if (!refs.homeInputModal || !refs.homeInputModalField || !refs.homeInputModalConfirm || !refs.homeInputModalCancel) {
    return false;
  }

  inputModalState = {
    resolver: null,
    validator: null,
    previousFocus: null
  };

  refs.homeInputModalCancel.addEventListener("click", () => {
    closeInputModal(null);
  });
  refs.homeInputModalConfirm.addEventListener("click", () => {
    submitInputModal();
  });
  refs.homeInputModal.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset.homeModalClose === "1") {
      closeInputModal(null);
    }
  });
  refs.homeInputModal.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeInputModal(null);
    }
  });
  refs.homeInputModalField.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    submitInputModal();
  });

  return true;
}

function closeInputModal(result = null) {
  if (!ensureInputModal()) return;
  const resolver = inputModalState?.resolver;
  const previousFocus = inputModalState?.previousFocus;
  inputModalState.resolver = null;
  inputModalState.validator = null;
  inputModalState.previousFocus = null;
  refs.homeInputModal.setAttribute("hidden", "");
  refs.homeInputModal.setAttribute("aria-hidden", "true");
  refs.homeInputModalError.textContent = "";
  if (previousFocus instanceof HTMLElement) {
    try {
      previousFocus.focus({ preventScroll: true });
    } catch {
      previousFocus.focus();
    }
  }
  if (typeof resolver === "function") resolver(result);
}

function submitInputModal() {
  if (!ensureInputModal()) return;
  const validate = typeof inputModalState?.validator === "function"
    ? inputModalState.validator
    : null;
  const rawValue = String(refs.homeInputModalField?.value || "");
  const result = validate ? validate(rawValue) : { ok: true, value: rawValue };
  if (!result?.ok) {
    refs.homeInputModalError.textContent = "";
    const title = safeText(refs.homeInputModalTitle?.textContent, "Invalid Input");
    showHomeWarning(title, String(result?.error || "Invalid value."));
    return;
  }
  closeInputModal(result.value);
}

function openInputModal(options = {}) {
  if (!ensureInputModal()) return Promise.resolve(null);

  if (inputModalState?.resolver) closeInputModal(null);
  inputModalState.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  inputModalState.validator = typeof options.validator === "function" ? options.validator : null;

  const {
    title = "Input",
    message = "",
    label = "Value",
    initialValue = "",
    inputType = "text",
    inputMode = "",
    confirmText = "Confirm",
    placeholder = ""
  } = options || {};

  refs.homeInputModalTitle.textContent = String(title || "Input");
  refs.homeInputModalMessage.textContent = String(message || "");
  refs.homeInputModalMessage.hidden = !message;
  refs.homeInputModalLabel.textContent = String(label || "Value");
  refs.homeInputModalField.type = String(inputType || "text");
  if (inputMode) refs.homeInputModalField.setAttribute("inputmode", String(inputMode));
  else refs.homeInputModalField.removeAttribute("inputmode");
  refs.homeInputModalField.value = String(initialValue ?? "");
  refs.homeInputModalField.placeholder = String(placeholder || "");
  refs.homeInputModalConfirm.textContent = String(confirmText || "Confirm");
  refs.homeInputModalError.textContent = "";
  refs.homeInputModal.removeAttribute("hidden");
  refs.homeInputModal.setAttribute("aria-hidden", "false");

  requestAnimationFrame(() => {
    try {
      refs.homeInputModalField.focus({ preventScroll: true });
      refs.homeInputModalField.select();
    } catch {
      refs.homeInputModalField.focus();
    }
  });

  return new Promise((resolve) => {
    inputModalState.resolver = resolve;
  });
}

function setDeckImportModalBusy(busy) {
  deckImportSubmitting = !!busy;
  if (refs.deckImportConfirm instanceof HTMLButtonElement) refs.deckImportConfirm.disabled = deckImportSubmitting;
  if (refs.deckImportCancel instanceof HTMLButtonElement) refs.deckImportCancel.disabled = deckImportSubmitting;
  if (refs.deckImportFileBtn instanceof HTMLButtonElement) refs.deckImportFileBtn.disabled = deckImportSubmitting;
  if (refs.deckImportClearBtn instanceof HTMLButtonElement) refs.deckImportClearBtn.disabled = deckImportSubmitting;
  if (refs.deckImportFile instanceof HTMLInputElement) refs.deckImportFile.disabled = deckImportSubmitting;
  if (refs.deckImportName instanceof HTMLInputElement) refs.deckImportName.disabled = deckImportSubmitting;
  if (refs.deckImportUseFirstTwo instanceof HTMLInputElement) refs.deckImportUseFirstTwo.disabled = deckImportSubmitting;
  if (refs.deckImportSaveProfile instanceof HTMLInputElement) refs.deckImportSaveProfile.disabled = deckImportSubmitting;
  if (refs.deckImportProfileName instanceof HTMLInputElement) refs.deckImportProfileName.disabled = deckImportSubmitting;
  if (refs.deckImportPreviewRow instanceof HTMLInputElement) refs.deckImportPreviewRow.disabled = deckImportSubmitting;
  if (refs.deckImportColumnMap instanceof HTMLElement) {
    refs.deckImportColumnMap.querySelectorAll("select").forEach((node) => {
      if (node instanceof HTMLSelectElement) node.disabled = deckImportSubmitting;
    });
  }
}

const DECK_IMPORT_ICON_BASE_PATH = "icons/bootstrap/filetypes";
const DECK_IMPORT_DEFAULT_ICON = "paperclip";
const DECK_IMPORT_FILETYPE_BY_EXT = Object.freeze({
  aac: "aac",
  ai: "ai",
  bmp: "bmp",
  cs: "cs",
  css: "css",
  csv: "csv",
  doc: "doc",
  docx: "docx",
  exe: "exe",
  gif: "gif",
  heic: "heic",
  html: "html",
  java: "java",
  jpg: "jpg",
  js: "js",
  json: "json",
  jsx: "jsx",
  key: "key",
  m4p: "m4p",
  md: "md",
  mdx: "mdx",
  mov: "mov",
  mp3: "mp3",
  mp4: "mp4",
  otf: "otf",
  pdf: "pdf",
  php: "php",
  png: "png",
  ppt: "ppt",
  pptx: "pptx",
  psd: "psd",
  py: "py",
  raw: "raw",
  rb: "rb",
  sass: "sass",
  scss: "scss",
  sh: "sh",
  sql: "sql",
  svg: "svg",
  tiff: "tiff",
  tsx: "tsx",
  ttf: "ttf",
  txt: "txt",
  wav: "wav",
  woff: "woff",
  xls: "xls",
  xlsx: "xlsx",
  xml: "xml",
  yml: "yml",
  htm: "html",
  jpeg: "jpg",
  yaml: "yml",
  tif: "tiff",
  mjs: "js",
  cjs: "js",
  markdown: "md",
  bash: "sh",
  zsh: "sh",
  fish: "sh",
  jsonl: "json"
});
const DECK_IMPORT_PROFILE_STORAGE_KEY = "DECK_IMPORT_PROFILES_V1";
const DECK_IMPORT_ROLE_OPTIONS = Object.freeze([
  { value: "front", label: "Front" },
  { value: "back", label: "Back" },
  { value: "tags", label: "Tags" },
  { value: "deck", label: "Deck" },
  { value: "notetype", label: "Notetype" },
  { value: "guid", label: "GUID" },
  { value: "extra", label: "Extra" },
  { value: "ignore", label: "Ignore" }
]);
const DECK_IMPORT_ROLE_SET = new Set(DECK_IMPORT_ROLE_OPTIONS.map((item) => item.value));

function deckImportIconPath(iconName) {
  return `${DECK_IMPORT_ICON_BASE_PATH}/${iconName}.svg`;
}

function deckImportFileExt(fileName = "") {
  const normalized = String(fileName || "").trim().toLowerCase();
  if (!normalized) return "";
  const base = normalized.split(/[\\/]/).pop() || "";
  const dotIndex = base.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === base.length - 1) return "";
  return base.slice(dotIndex + 1);
}

function resolveDeckImportIconName(fileName = "") {
  const ext = deckImportFileExt(fileName);
  const iconSuffix = DECK_IMPORT_FILETYPE_BY_EXT[ext];
  if (!iconSuffix) return DECK_IMPORT_DEFAULT_ICON;
  return `filetype-${iconSuffix}`;
}

function setDeckImportFileIcon(fileName = "") {
  if (!(refs.deckImportFileIcon instanceof HTMLElement)) return;
  const iconName = resolveDeckImportIconName(fileName);
  refs.deckImportFileIcon.innerHTML = `<svg class="bi ${iconName === DECK_IMPORT_DEFAULT_ICON ? "bi-paperclip" : `bi-${iconName}`}" data-src="${deckImportIconPath(iconName)}" aria-hidden="true"></svg>`;
  hydrateInlineIcons(refs.deckImportFileIcon);
}

function deckImportCurrentFileFingerprint(file) {
  if (!(file instanceof File)) return "";
  return [file.name, file.size, file.lastModified].join("::");
}

function revokeDeckImportRejectsUrl() {
  if (!deckImportRejectsDownloadUrl) return;
  const stale = deckImportRejectsDownloadUrl;
  deckImportRejectsDownloadUrl = "";
  window.setTimeout(() => {
    try {
      URL.revokeObjectURL(stale);
    } catch {}
  }, 15000);
}

function resetDeckImportRejectsLink() {
  revokeDeckImportRejectsUrl();
  if (!(refs.deckImportRejectsDownload instanceof HTMLAnchorElement)) return;
  refs.deckImportRejectsDownload.hidden = true;
  refs.deckImportRejectsDownload.href = "#";
  refs.deckImportRejectsDownload.download = "rejects.tsv";
}

function resetDeckImportMappingUi() {
  if (refs.deckImportMappingPanel instanceof HTMLElement) refs.deckImportMappingPanel.setAttribute("hidden", "");
  if (refs.deckImportMetaSummary instanceof HTMLElement) refs.deckImportMetaSummary.textContent = "";
  if (refs.deckImportWarnings instanceof HTMLElement) {
    refs.deckImportWarnings.textContent = "";
    refs.deckImportWarnings.setAttribute("hidden", "");
  }
  if (refs.deckImportUseFirstTwoWrap instanceof HTMLElement) refs.deckImportUseFirstTwoWrap.setAttribute("hidden", "");
  if (refs.deckImportUseFirstTwo instanceof HTMLInputElement) refs.deckImportUseFirstTwo.checked = false;
  if (refs.deckImportSaveProfile instanceof HTMLInputElement) refs.deckImportSaveProfile.checked = true;
  if (refs.deckImportProfileName instanceof HTMLInputElement) refs.deckImportProfileName.value = "";
  if (refs.deckImportColumnMap instanceof HTMLElement) refs.deckImportColumnMap.innerHTML = "";
  if (refs.deckImportPreviewRow instanceof HTMLInputElement) refs.deckImportPreviewRow.value = "1";
  if (refs.deckImportPreviewRaw instanceof HTMLElement) refs.deckImportPreviewRaw.textContent = "";
  if (refs.deckImportPreviewJson instanceof HTMLElement) refs.deckImportPreviewJson.textContent = "";
  if (refs.deckImportPreviewRenderFront instanceof HTMLElement) refs.deckImportPreviewRenderFront.textContent = "";
  if (refs.deckImportPreviewRenderBack instanceof HTMLElement) refs.deckImportPreviewRenderBack.textContent = "";
  resetDeckImportRejectsLink();
}

function clearDeckImportSession() {
  deckImportSession = null;
  resetDeckImportMappingUi();
}

function clearDeckImportSelection() {
  if (refs.deckImportFile instanceof HTMLInputElement) refs.deckImportFile.value = "";
  if (refs.deckImportName instanceof HTMLInputElement) refs.deckImportName.value = "";
  setDeckImportFileIcon("");
  clearDeckImportSession();
  deckImportNameManuallyEdited = false;
}

function closeDeckImportModal() {
  if (!(refs.deckImportModal instanceof HTMLElement)) return;
  refs.deckImportModal.setAttribute("hidden", "");
  refs.deckImportModal.setAttribute("aria-hidden", "true");
  clearDeckImportInlineError();
  clearDeckImportSession();
  setDeckImportModalBusy(false);
}

function resetDeckImportModal() {
  clearDeckImportSelection();
  clearDeckImportInlineError();
}

function openDeckImportModal() {
  if (!(refs.deckImportModal instanceof HTMLElement)) return;
  resetDeckImportModal();
  refs.deckImportModal.removeAttribute("hidden");
  refs.deckImportModal.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => {
    try {
      refs.deckImportFileBtn?.focus({ preventScroll: true });
    } catch {
      refs.deckImportFileBtn?.focus();
    }
  });
}

function closeInlineDeckCreate(options = {}) {
  const { render = true, keepDraft = false } = options || {};
  const hadState = uiState.inlineDeckCreateChooserOpen || uiState.inlineDeckCreateDraft || uiState.inlineDeckCreateError;
  uiState.inlineDeckCreateChooserOpen = false;
  if (!keepDraft) uiState.inlineDeckCreateDraft = null;
  uiState.inlineDeckCreateError = "";
  if (render && hadState) renderDecksDue();
}

function toggleInlineDeckCreateChooser() {
  uiState.inlineDeckCreateChooserOpen = !uiState.inlineDeckCreateChooserOpen;
  uiState.inlineDeckCreateError = "";
  renderDecksDue();
}

function selectInlineDeckCreateOption(option = "") {
  const nextOption = String(option || "").trim().toLowerCase();
  if (nextOption === "import") {
    uiState.inlineDeckCreateDraft = null;
    uiState.inlineDeckCreateChooserOpen = false;
    uiState.inlineDeckCreateError = "";
    renderDecksDue();
    openDeckImportModal();
    return;
  }
  if (nextOption === "basic") {
    const prior = normalizeInlineDeckCreateDraft(uiState.inlineDeckCreateDraft);
    uiState.inlineDeckCreateDraft = prior;
    uiState.inlineDeckCreateChooserOpen = false;
    uiState.inlineDeckCreateError = "";
    renderDecksDue();
  }
}

function updateInlineDeckCreateDraftFromField(target) {
  if (!(target instanceof HTMLElement)) return;
  const field = String(target.dataset.field || "").trim().toLowerCase();
  if (field !== "title" && field !== "description") return;
  if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) return;

  const prior = normalizeInlineDeckCreateDraft(uiState.inlineDeckCreateDraft);
  const nextDraft = {
    ...prior,
    title: field === "title" ? String(target.value || "") : prior.title,
    description: field === "description" ? String(target.value || "") : prior.description
  };
  uiState.inlineDeckCreateDraft = nextDraft;
  if (uiState.inlineDeckCreateError) uiState.inlineDeckCreateError = "";
}

function normalizeInlineDeckCreateCard(card = null) {
  if (!card || typeof card !== "object") {
    return {
      front: "",
      back: "",
      frontLang: "",
      backLang: ""
    };
  }
  return {
    front: String(card.front || ""),
    back: String(card.back || ""),
    frontLang: normalizeDeckCardLangCode(card.frontLang || "", ""),
    backLang: normalizeDeckCardLangCode(card.backLang || "", "")
  };
}

function normalizeInlineDeckCreateDraft(draft = null) {
  const source = (draft && typeof draft === "object") ? draft : {};
  const cards = Array.isArray(source.cards)
    ? source.cards.map((card) => normalizeInlineDeckCreateCard(card))
    : [];
  const cardDraft = source.cardDraft && typeof source.cardDraft === "object"
    ? normalizeInlineDeckCreateCard(source.cardDraft)
    : null;
  return {
    title: String(source.title || ""),
    description: String(source.description || ""),
    cards,
    cardDraft
  };
}

function updateInlineDeckCreateCardDraftFromField(target) {
  if (!(target instanceof HTMLElement)) return;
  const field = String(target.dataset.field || "").trim().toLowerCase();
  if (!(target instanceof HTMLTextAreaElement) && !(target instanceof HTMLSelectElement)) return;
  if (!field) return;

  const draft = normalizeInlineDeckCreateDraft(uiState.inlineDeckCreateDraft);
  if (!draft.cardDraft) return;
  const nextCardDraft = { ...draft.cardDraft };
  if (field === "front") nextCardDraft.front = target.value || "";
  else if (field === "back") nextCardDraft.back = target.value || "";
  else if (field === "front-lang") nextCardDraft.frontLang = normalizeDeckCardLangCode(target.value || "", "");
  else if (field === "back-lang") nextCardDraft.backLang = normalizeDeckCardLangCode(target.value || "", "");
  else return;

  draft.cardDraft = nextCardDraft;
  uiState.inlineDeckCreateDraft = draft;
  if (uiState.inlineDeckCreateError) uiState.inlineDeckCreateError = "";
}

function updateInlineDeckCreateStagedCardFromField(target) {
  if (!(target instanceof HTMLElement)) return;
  const cardIndex = Number.parseInt(String(target.dataset.cardIndex || ""), 10);
  if (!Number.isInteger(cardIndex) || cardIndex < 0) return;
  const field = String(target.dataset.field || "").trim().toLowerCase();
  if (!(target instanceof HTMLTextAreaElement) && !(target instanceof HTMLSelectElement)) return;
  if (!field) return;

  const draft = normalizeInlineDeckCreateDraft(uiState.inlineDeckCreateDraft);
  if (cardIndex >= draft.cards.length) return;
  const nextCards = draft.cards.slice();
  const nextCard = { ...nextCards[cardIndex] };
  if (field === "front") nextCard.front = target.value || "";
  else if (field === "back") nextCard.back = target.value || "";
  else if (field === "front-lang") nextCard.frontLang = normalizeDeckCardLangCode(target.value || "", "");
  else if (field === "back-lang") nextCard.backLang = normalizeDeckCardLangCode(target.value || "", "");
  else return;
  nextCards[cardIndex] = nextCard;

  draft.cards = nextCards;
  uiState.inlineDeckCreateDraft = draft;
  if (uiState.inlineDeckCreateError) uiState.inlineDeckCreateError = "";
}

function openInlineDeckCreateCardDraft() {
  const draft = normalizeInlineDeckCreateDraft(uiState.inlineDeckCreateDraft);
  if (draft.cardDraft) return;
  const baseline = draft.cards.length ? draft.cards[draft.cards.length - 1] : null;
  draft.cardDraft = normalizeInlineDeckCreateCard({
    front: "",
    back: "",
    frontLang: baseline?.frontLang || "",
    backLang: baseline?.backLang || ""
  });
  uiState.inlineDeckCreateDraft = draft;
  if (uiState.inlineDeckCreateError) uiState.inlineDeckCreateError = "";
  renderDecksDue();
}

function closeInlineDeckCreateCardDraft() {
  const draft = normalizeInlineDeckCreateDraft(uiState.inlineDeckCreateDraft);
  if (!draft.cardDraft) return;
  draft.cardDraft = null;
  uiState.inlineDeckCreateDraft = draft;
  if (uiState.inlineDeckCreateError) uiState.inlineDeckCreateError = "";
  renderDecksDue();
}

function saveInlineDeckCreateCardDraft() {
  const draft = normalizeInlineDeckCreateDraft(uiState.inlineDeckCreateDraft);
  const cardDraft = draft.cardDraft ? normalizeInlineDeckCreateCard(draft.cardDraft) : null;
  if (!cardDraft) return;

  const front = String(cardDraft.front || "").trim();
  const back = String(cardDraft.back || "").trim();
  if (!front || !back) {
    if (uiState.inlineDeckCreateError) {
      uiState.inlineDeckCreateError = "";
      renderDecksDue();
    }
    reportInlineDeckCreateIssue("Card Front and Back are required.", { title: "Missing Card Fields" });
    return;
  }

  draft.cards = draft.cards.concat([{
    ...cardDraft,
    front,
    back
  }]);
  draft.cardDraft = null;
  uiState.inlineDeckCreateDraft = draft;
  if (uiState.inlineDeckCreateError) uiState.inlineDeckCreateError = "";
  renderDecksDue();
}

function removeInlineDeckCreateStagedCard(cardIndex) {
  const index = Number.parseInt(String(cardIndex || ""), 10);
  if (!Number.isInteger(index) || index < 0) return;
  const draft = normalizeInlineDeckCreateDraft(uiState.inlineDeckCreateDraft);
  if (index >= draft.cards.length) return;
  const nextCards = draft.cards.slice();
  nextCards.splice(index, 1);
  draft.cards = nextCards;
  uiState.inlineDeckCreateDraft = draft;
  if (uiState.inlineDeckCreateError) uiState.inlineDeckCreateError = "";
  renderDecksDue();
}

function closeInlineDeckCardTypePicker(deckId = "", options = {}) {
  const { render = true } = options || {};
  const key = normalizeDeckKey(deckId);
  if (key) {
    if (uiState.inlineCardTypeDeckId !== key) return;
    uiState.inlineCardTypeDeckId = "";
    if (render) renderDecksDue();
    return;
  }
  if (!uiState.inlineCardTypeDeckId) return;
  uiState.inlineCardTypeDeckId = "";
  if (render) renderDecksDue();
}

function toggleInlineDeckCardTypePicker(deckId = "") {
  const key = normalizeDeckKey(deckId);
  if (!key) return;
  uiState.inlineCardTypeDeckId = uiState.inlineCardTypeDeckId === key ? "" : key;
  renderDecksDue();
}

function closeInlineDeckCardDraft(deckId = "", options = {}) {
  const { render = true } = options || {};
  const key = normalizeDeckKey(deckId);
  if (key) {
    if (!uiState.inlineCardDraftByDeck.has(key)) return;
    uiState.inlineCardDraftByDeck.delete(key);
    if (render) renderDecksDue();
    return;
  }
  if (!uiState.inlineCardDraftByDeck.size) return;
  uiState.inlineCardDraftByDeck.clear();
  if (render) renderDecksDue();
}

function buildInlineDeckCardDraft(deckId = "", cardType = "text") {
  const key = normalizeDeckKey(deckId);
  const preview = key ? deckPreviewCache.get(key) : null;
  const cards = Array.isArray(preview?.cards) ? preview.cards : [];
  const baseline = cards.length ? cards[cards.length - 1] : null;
  return {
    type: String(cardType || "").trim().toLowerCase() === "ocr" ? "ocr" : "text",
    front: "",
    back: "",
    frontLang: readCardFaceLanguageCode(baseline, "front"),
    backLang: readCardFaceLanguageCode(baseline, "back")
  };
}

function updateInlineDeckCardDraftFromField(target) {
  if (!(target instanceof HTMLElement)) return;
  const rowEl = target.closest(".deck-card-row");
  if (!(rowEl instanceof HTMLElement)) return;
  const deckId = decodeDataValue(rowEl.dataset.deckId || "");
  const key = normalizeDeckKey(deckId);
  if (!key) return;
  const draft = uiState.inlineCardDraftByDeck.get(key);
  if (!draft || String(draft.type || "").toLowerCase() !== "text") return;

  const field = String(target.dataset.field || "").trim().toLowerCase();
  if (!field) return;

  let value = "";
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement || target instanceof HTMLSelectElement) {
    value = target.value || "";
  }

  const nextDraft = { ...draft };
  if (field === "front") nextDraft.front = value;
  else if (field === "back") nextDraft.back = value;
  else if (field === "front-lang") nextDraft.frontLang = normalizeDeckCardLangCode(value, "");
  else if (field === "back-lang") nextDraft.backLang = normalizeDeckCardLangCode(value, "");
  else return;

  uiState.inlineCardDraftByDeck.set(key, nextDraft);
}

function selectDeckCardType(cardType = "", deckId = "") {
  const nextType = String(cardType || "").trim().toLowerCase();
  const activeDeckId = normalizeDeckKey(deckId) || uiState.inlineCardTypeDeckId;
  uiState.inlineCardTypeDeckId = "";
  if (!activeDeckId) return;

  if (nextType === "text") {
    uiState.inlineCardDraftByDeck.set(activeDeckId, buildInlineDeckCardDraft(activeDeckId, "text"));
    renderDecksDue();
    return;
  }

  const message = nextType === "ocr"
    ? "OCR flashcard creation flow is coming soon."
    : "Basic text flashcard creation flow is coming soon.";
  setDeckStatus(activeDeckId, message, "info");
  renderDecksDue();
}

async function submitDeckImportModal() {
  if (deckImportSubmitting) return;
  const fileInput = refs.deckImportFile;
  const nameInput = refs.deckImportName;
  if (!(fileInput instanceof HTMLInputElement) || !(nameInput instanceof HTMLInputElement)) return;

  const file = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
  if (!file) {
    reportDeckImportIssue("Pick a source file first.");
    return;
  }

  const deckStem = sanitizeDeckFileStem(nameInput.value || "") || deckNameFromFilename(file.name) || `Imported_${Date.now()}`;
  if (!deckStem) {
    reportDeckImportIssue("Enter a valid deck name.");
    return;
  }

  setDeckImportModalBusy(true);
  clearDeckImportInlineError();
  try {
    const fileFingerprint = deckImportCurrentFileFingerprint(file);
    const sessionMatchesCurrentFile = Boolean(
      deckImportSession
      && deckImportSession.fileFingerprint === fileFingerprint
      && deckImportSession.fileName === file.name
    );

    if (!sessionMatchesCurrentFile) {
      clearDeckImportSession();
      const rawText = await file.text();
      deckImportSession = buildDeckImportSession({
        fileName: file.name,
        rawText,
        language: "auto",
        deckName: deckStem
      });
      if (deckImportSession) {
        deckImportSession.fileFingerprint = fileFingerprint;
        deckImportSession.fileName = file.name;
      }
    }

    const session = deckImportSession;
    if (!session || session.error) {
      reportDeckImportIssue(session?.error || "No importable cards were found in this file.");
      return;
    }

    if (session.requiresMapping && !isDeckImportMappingPanelVisible()) {
      renderDeckImportMappingUi(session, deckStem);
      reportDeckImportIssue("Mapping is required for this file. Assign columns, review preview, then confirm import.");
      return;
    }

    const roleByColumn = readDeckImportRoleMapFromUi(session);
    if (session.kind === "delimited") {
      const mappingValidation = validateDeckImportRoleMap(session, roleByColumn);
      if (!mappingValidation.ok) {
        renderDeckImportWarnings(mappingValidation.warnings);
        reportDeckImportIssue(mappingValidation.message || "Invalid import column mapping.");
        return;
      }
    }

    const conversion = buildCardsFromDeckImportSession(session, {
      roleByColumn,
      language: "auto",
      deckName: deckStem,
      fileName: file.name
    });
    if (!conversion.cards.length) {
      reportDeckImportIssue(conversion.message || "No importable cards were found in this file.");
      if (conversion.warnings?.length) renderDeckImportWarnings(conversion.warnings);
      return;
    }

    const deckPath = `decks/${deckStem}.json`;
    const result = await persistDeckCreate(deckPath, conversion.cards);
    if (!result.ok) {
      reportDeckImportIssue(
        result.queued
          ? `Deck create request queued: ${result.message}`
          : `Import failed: ${result.message}`,
        { variant: result.queued ? "warning" : "error" }
      );
      return;
    }

    if (session.kind === "delimited" && session.requiresMapping && refs.deckImportSaveProfile instanceof HTMLInputElement && refs.deckImportSaveProfile.checked) {
      const profileNameRaw = refs.deckImportProfileName instanceof HTMLInputElement ? refs.deckImportProfileName.value : "";
      saveDeckImportProfile(session, roleByColumn, profileNameRaw || session.suggestedProfileName || deckStem);
    }

    const rejected = Number(conversion.report?.rejectedCount || 0);
    if (rejected > 0) {
      presentDeckImportRejectsDownload(conversion.report, deckStem);
    }

    seedImportedDeckFsrs(deckPath, conversion.cards);
    pinImportedDeckAsRecent(deckPath);
    refreshHomeData();
    uiState.showAllDecks = true;
    setDeckStatus(
      deckPath,
      rejected > 0
        ? `Imported ${conversion.cards.length} cards (${rejected} rejected)${result.localOnly ? " to this browser" : ""}.`
        : `Imported ${conversion.cards.length} cards${result.localOnly ? " to this browser" : ""}.`,
      rejected > 0 ? "info" : "success"
    );
    renderHome();
    closeDeckImportModal();
  } catch (err) {
    reportDeckImportIssue(`Import failed: ${String(err?.message || err || "Unknown error")}`, { variant: "error" });
  } finally {
    setDeckImportModalBusy(false);
  }
}

function ensureDeckImportModalBound() {
  if (deckImportModalBound) return;
  deckImportModalBound = true;

  refs.importDeckBtn?.addEventListener("click", () => {
    openDeckImportModal();
  });

  refs.deckImportCancel?.addEventListener("click", () => {
    if (deckImportSubmitting) return;
    closeDeckImportModal();
  });

  refs.deckImportConfirm?.addEventListener("click", () => {
    void submitDeckImportModal();
  });

  refs.deckImportModal?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (deckImportSubmitting) return;
    if (target.dataset.deckImportClose === "1") closeDeckImportModal();
  });

  refs.deckImportModal?.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !deckImportSubmitting) {
      event.preventDefault();
      closeDeckImportModal();
    }
  });

  refs.deckImportFileBtn?.addEventListener("click", () => {
    if (deckImportSubmitting) return;
    refs.deckImportFile?.click();
  });

  refs.deckImportClearBtn?.addEventListener("click", () => {
    if (deckImportSubmitting) return;
    clearDeckImportSelection();
    refs.deckImportName?.focus();
  });

  refs.deckImportFile?.addEventListener("change", () => {
    clearDeckImportSession();
    const file = refs.deckImportFile?.files?.[0] || null;
    if (!file) {
      setDeckImportFileIcon("");
      return;
    }
    setDeckImportFileIcon(file.name);
    if (!(refs.deckImportName instanceof HTMLInputElement)) return;
    if (!deckImportNameManuallyEdited || !refs.deckImportName.value.trim()) {
      const guess = deckNameFromFilename(file.name);
      if (guess) refs.deckImportName.value = guess;
    }
    refs.deckImportName.focus();
    refs.deckImportName.select();
  });

  refs.deckImportName?.addEventListener("input", () => {
    deckImportNameManuallyEdited = true;
  });

  refs.deckImportUseFirstTwo?.addEventListener("change", () => {
    if (!deckImportSession) return;
    renderDeckImportMappingUi(deckImportSession, refs.deckImportName instanceof HTMLInputElement ? refs.deckImportName.value : "");
  });

  refs.deckImportPreviewRow?.addEventListener("input", () => {
    if (!deckImportSession) return;
    renderDeckImportPreview(deckImportSession);
  });
}

function openDiagramPreview(deckId, cardId) {
  const payload = getDiagramPayload(deckId, cardId);
  if (!payload || !payload.imageSrc) return;
  const refs = ensureDiagramModal();
  if (!(refs.image instanceof HTMLImageElement) || !(refs.overlay instanceof SVGElement)) return;

  const draw = () => {
    if (!refs.image.naturalWidth || !refs.image.naturalHeight) return;
    buildDiagramOverlay(refs.overlay, payload, refs.image.naturalWidth, refs.image.naturalHeight);
  };

  refs.image.src = payload.imageSrc;
  if (refs.image.complete && refs.image.naturalWidth) {
    draw();
  } else {
    refs.image.addEventListener("load", draw, { once: true });
  }

  refs.modal.classList.add("show");
  refs.modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("diagram-modal-open");
}

function normalizeDeckPathForSave(input) {
  if (!input) return "";
  let path = String(input).trim();
  if (!path) return "";
  if (path.startsWith("gen:")) return "";
  path = path.split("#")[0].split("?")[0];
  path = path.replace(/\\/g, "/");
  if (/^[a-z]+:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      path = url.pathname.replace(/^\/+/, "");
    } catch {}
  }
  const isAbsWin = /^[a-zA-Z]:\//.test(path);
  const isAbsPosix = path.startsWith("/");
  const isUNC = path.startsWith("//");
  if (!path.includes("/") && !isAbsWin && !isAbsPosix && !isUNC) path = `decks/${path}`;
  if (!/\.json$/i.test(path)) path += ".json";
  if (isExcludedDeckKey(path)) return "";
  return path;
}

function deckWriterBases() {
  const bases = [];
  const override = window.DECK_WRITER_URL || localStorage.getItem("DECK_WRITER_URL");
  if (override) bases.push(String(override).replace(/\/+$/, ""));
  const protocol = window.location.protocol === "https:" ? "https:" : "http:";
  const host = window.location.hostname;
  if (host && host !== "0.0.0.0") bases.push(`${protocol}//${host}:8002`);
  bases.push(`${protocol}//127.0.0.1:8002`);
  bases.push(`${protocol}//localhost:8002`);
  return [...new Set(bases.filter(Boolean))];
}

function deckWriterApiKey() {
  const fromWindow = typeof window.DECK_WRITER_API_KEY === "string" ? window.DECK_WRITER_API_KEY : "";
  const fromStorage = localStorage.getItem("DECK_WRITER_API_KEY") || "";
  return String(fromWindow || fromStorage || "").trim();
}

function deckWriterHeaders() {
  const headers = { "Content-Type": "application/json" };
  const apiKey = deckWriterApiKey();
  if (apiKey) headers["X-API-Key"] = apiKey;
  return headers;
}

async function probeDeckWriterRemoveSupport() {
  if (deckWriterRemoveSupport === true || deckWriterRemoveSupport === false) return deckWriterRemoveSupport;
  const bases = deckWriterBases();
  for (const base of bases) {
    let timeout = null;
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(`${base}/openapi.json`, {
        method: "GET",
        headers: deckWriterHeaders(),
        signal: controller.signal,
        cache: "no-store"
      });
      clearTimeout(timeout);
      timeout = null;
      if (!response.ok) continue;
      const data = await response.json();
      const paths = data?.paths && typeof data.paths === "object" ? data.paths : {};
      if (Object.prototype.hasOwnProperty.call(paths, "/deck/remove")) {
        deckWriterRemoveSupport = true;
        return true;
      }
      if (
        Object.prototype.hasOwnProperty.call(paths, "/deck/update")
        || Object.prototype.hasOwnProperty.call(paths, "/deck/rename")
      ) {
        deckWriterRemoveSupport = false;
        return false;
      }
    } catch {
      // try next base
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
  return null;
}

async function callDeckWriter(route, payload) {
  const bases = deckWriterBases();
  let reachedServer = false;
  let lastMessage = "";
  let lastStatus = 0;

  for (const base of bases) {
    let timeout = null;
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${base}${route}`, {
        method: "POST",
        headers: deckWriterHeaders(),
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeout);
      timeout = null;
      reachedServer = true;
      if (response.ok) return { ok: true, message: "", status: response.status };

      let detail = "";
      try {
        const data = await response.json();
        detail = String(data?.detail || data?.error || "");
      } catch {}
      lastStatus = Number(response.status) || 0;
      lastMessage = detail || `Request failed (${response.status}).`;
      // A concrete 4xx response (except route-not-found) is definitive for this request.
      // Retrying other bases can duplicate writes and noisy console errors.
      if (lastStatus >= 400 && lastStatus < 500 && lastStatus !== 404) {
        return { ok: false, message: lastMessage, status: lastStatus };
      }
    } catch {
      // Try next base.
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  if (!reachedServer) {
    return { ok: false, message: "Could not reach deck writer on port 8002.", status: 0 };
  }
  return { ok: false, message: lastMessage || "Deck writer request failed.", status: lastStatus || 500 };
}

function shouldQueueDeckWriteFailure(route, result) {
  const status = Math.max(0, Number(result?.status) || 0);
  if (status === 0) return true; // network/service unreachable
  if (status === 408 || status === 425 || status === 429) return true;
  if (status >= 500 && status <= 599) return true;
  return false;
}

async function writeDeckViaApi(route, payload, options = {}) {
  const queueOnFailure = options?.queueOnFailure !== false;
  const result = await callDeckWriter(route, payload);
  if (result.ok) {
    removeDeckWriteQueue(route, payload);
    updateDeckPersistenceUi();
    return { ...result, queued: false };
  }
  const localFallback = tryLocalDeckWriteFallback(route, payload, result);
  if (localFallback?.ok) {
    removeDeckWriteQueue(route, payload);
    updateDeckPersistenceUi();
    return { ...localFallback, queued: false };
  }
  if (queueOnFailure && shouldQueueDeckWriteFailure(route, result)) {
    upsertDeckWriteQueue(route, payload, result.message);
    updateDeckPersistenceUi();
    return { ...result, queued: true };
  }
  updateDeckPersistenceUi();
  return { ...result, queued: false };
}

async function flushPendingDeckWrites() {
  if (uiState.flushingWrites) return;
  const initialQueue = loadDeckWriteQueue();
  if (!initialQueue.length) {
    updateDeckPersistenceUi();
    return;
  }

  uiState.flushingWrites = true;
  updateDeckPersistenceUi();
  let successCount = 0;
  let failureCount = 0;
  let droppedUnsupportedCount = 0;
  let droppedPermanentCount = 0;
  const needsRemoveProbe = initialQueue.some((item) => String(item?.route || "").trim() === "/deck/remove");
  let removeSupport = needsRemoveProbe ? await probeDeckWriterRemoveSupport() : deckWriterRemoveSupport;

  for (const queued of initialQueue) {
    const queuedRoute = String(queued?.route || "").trim();
    const queuedPayload = queued?.payload && typeof queued.payload === "object" ? queued.payload : {};
    const queuedAttempts = Math.max(0, Number(queued?.attempts) || 0);
    const queuedLastError = String(queued?.lastError || "");
    const priorNotFound = /\b404\b/i.test(queuedLastError) || /not found/i.test(queuedLastError);
    const queuedDeckPath = queuedRoute === "/deck/remove"
      ? normalizeDeckPathForSave(queuedPayload?.deck_path || "")
      : "";

    if ((queuedRoute === "/deck/remove" || queuedRoute === "/deck/rename") && queuedAttempts > 0 && priorNotFound) {
      removeDeckWriteQueue(queuedRoute, queuedPayload);
      droppedUnsupportedCount += 1;
      continue;
    }

    let attemptRoute = queuedRoute;
    let attemptPayload = queuedPayload;
    let result = null;

    if (queuedRoute === "/deck/remove" && (removeSupport === false || queuedAttempts > 0)) {
      const archivedPath = queuedDeckPath ? buildArchivedDeckPath(queuedDeckPath) : "";
      removeDeckWriteQueue(queuedRoute, queuedPayload);
      if (queuedDeckPath && archivedPath) {
        attemptRoute = "/deck/rename";
        attemptPayload = {
          old_path: queuedDeckPath,
          new_path: archivedPath
        };
        result = await writeDeckViaApi(attemptRoute, attemptPayload, { queueOnFailure: false });
      } else {
        result = { ok: false, message: "Invalid queued remove payload.", status: 400 };
      }
    } else {
      result = await writeDeckViaApi(attemptRoute, attemptPayload, { queueOnFailure: false });
    }

    // Older writer builds can lack /deck/remove. Convert queued deletes to archive-via-rename during flush.
    if (!result.ok && queuedRoute === "/deck/remove" && Number(result.status) === 404) {
      deckWriterRemoveSupport = false;
      removeSupport = false;
      const archivedPath = queuedDeckPath ? buildArchivedDeckPath(queuedDeckPath) : "";
      removeDeckWriteQueue(queuedRoute, queuedPayload);

      if (queuedDeckPath && archivedPath) {
        attemptRoute = "/deck/rename";
        attemptPayload = {
          old_path: queuedDeckPath,
          new_path: archivedPath
        };
        result = await writeDeckViaApi(attemptRoute, attemptPayload, { queueOnFailure: false });
      }
    }

    if (!result.ok && Number(result.status) === 404 && (attemptRoute === "/deck/remove" || attemptRoute === "/deck/rename")) {
      removeDeckWriteQueue(attemptRoute, attemptPayload);
      droppedUnsupportedCount += 1;
      continue;
    }

    if (result.ok) {
      successCount += 1;
      if (queuedRoute === "/deck/update") {
        removeCardEditOverlay(queuedPayload?.card?.id, queuedPayload?.deck_path || "");
      } else if (queuedRoute === "/deck/delete") {
        removeCardEditOverlay(queuedPayload?.card_id, queuedPayload?.deck_path || "");
      } else if (queuedRoute === "/deck/remove") {
        if (queuedDeckPath) {
          pruneDeletedDeckFromStores(queuedDeckPath);
          clearDeckWriteQueueForDeckPath(queuedDeckPath);
        }
      }
      continue;
    }
    if (!shouldQueueDeckWriteFailure(attemptRoute, result)) {
      removeDeckWriteQueue(attemptRoute, attemptPayload);
      droppedPermanentCount += 1;
      continue;
    }
    failureCount += 1;
    const queueNow = loadDeckWriteQueue();
    const fingerprint = deckWriteFingerprint(attemptRoute, attemptPayload);
    const idx = queueNow.findIndex((item) => item.fingerprint === fingerprint);
    if (idx >= 0) {
      queueNow[idx] = {
        ...queueNow[idx],
        attempts: Math.max(0, Number(queueNow[idx].attempts) || 0) + 1,
        lastError: String(result.message || queueNow[idx].lastError || "")
      };
      saveDeckWriteQueue(queueNow);
    } else {
      upsertDeckWriteQueue(attemptRoute, attemptPayload, result.message || "");
    }
  }

  uiState.flushingWrites = false;
  if (successCount > 0) {
    refreshHomeData();
    renderHome();
  } else {
    updateDeckPersistenceUi();
  }

  if (failureCount > 0) {
    showPersistenceNote(`Flush result: ${successCount} saved, ${failureCount} still pending.`);
  } else if (droppedUnsupportedCount > 0 || droppedPermanentCount > 0) {
    const droppedTotal = droppedUnsupportedCount + droppedPermanentCount;
    if (droppedUnsupportedCount > 0 && droppedPermanentCount > 0) {
      showPersistenceNote(
        `Flush complete: ${successCount} saved; ${droppedTotal} dropped (${droppedUnsupportedCount} unsupported, ${droppedPermanentCount} non-retryable).`
      );
    } else if (droppedUnsupportedCount > 0) {
      showPersistenceNote(
        `Flush complete: ${successCount} saved; ${droppedUnsupportedCount} unsupported write${droppedUnsupportedCount === 1 ? "" : "s"} dropped.`
      );
    } else {
      showPersistenceNote(
        `Flush complete: ${successCount} saved; ${droppedPermanentCount} non-retryable write${droppedPermanentCount === 1 ? "" : "s"} dropped.`
      );
    }
  } else {
    showPersistenceNote(`Flush complete: ${successCount} write${successCount === 1 ? "" : "s"} saved.`);
  }
}

async function persistDeckCardUpdate(card, deckPath) {
  const normalizedPath = normalizeDeckPathForSave(deckPath);
  if (!normalizedPath) return { ok: false, message: "Deck path is not editable." };
  return writeDeckViaApi("/deck/update", {
    deck_path: normalizedPath,
    card,
    allow_create: false
  });
}

async function persistDeckCardCreate(card, deckPath) {
  const normalizedPath = normalizeDeckPathForSave(deckPath);
  if (!normalizedPath) return { ok: false, message: "Deck path is not editable." };
  return writeDeckViaApi("/deck/update", {
    deck_path: normalizedPath,
    card,
    allow_create: true
  });
}

async function persistDeckCardDelete(cardId, deckPath) {
  const normalizedPath = normalizeDeckPathForSave(deckPath);
  if (!normalizedPath) return { ok: false, message: "Deck path is not editable." };
  return writeDeckViaApi("/deck/delete", {
    deck_path: normalizedPath,
    card_id: cardId
  });
}

function sanitizeDeckFileStem(name) {
  let stem = String(name || "").trim();
  if (!stem) return "";
  stem = stem.replace(/\.json$/i, "");
  stem = stem.replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ");
  stem = stem.replace(/\s+/g, "_");
  stem = stem.replace(/_+/g, "_");
  stem = stem.replace(/^_+|_+$/g, "");
  stem = stem.replace(/^\.+/, "").replace(/\.+$/, "");
  return stem.slice(0, 120);
}

function deckNameFromFilename(fileName = "") {
  const raw = String(fileName || "").trim();
  if (!raw) return "";
  const noExt = raw.replace(/\.[^.]+$/, "");
  return sanitizeDeckFileStem(noExt);
}

const IMPORT_LANG_SUPPORTED = new Set(["la", "en", "cs", "de", "fr", "es", "it", "tr", "pl"]);
const IMPORT_LANG_ALIASES = Object.freeze({
  latin: "la",
  lat: "la",
  english: "en",
  eng: "en",
  czech: "cs",
  cesky: "cs",
  ceskyjazyk: "cs",
  german: "de",
  deutsch: "de",
  french: "fr",
  francais: "fr",
  spanish: "es",
  espanol: "es",
  italian: "it",
  turkish: "tr",
  turkce: "tr",
  polish: "pl",
  polski: "pl"
});
const IMPORT_LANG_CHAR_RE = {
  la: /[\u0100\u0101\u0112\u0113\u012a\u012b\u014c\u014d\u016a\u016b\u0232\u0233\u00e6\u00c6\u0153\u0152]/i,
  cs: /[\u010d\u010f\u011b\u0148\u0159\u0161\u0165\u016f\u017e\u00e1\u00e9\u00ed\u00f3\u00fa\u00fd]/i,
  de: /[\u00e4\u00f6\u00fc\u00df]/i,
  fr: /[\u00e0\u00e2\u00e6\u00e7\u00e9\u00e8\u00ea\u00eb\u00ee\u00ef\u00f4\u0153\u00f9\u00fb\u00fc\u00ff]/i,
  es: /[\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1\u00fc\u00bf\u00a1]/i,
  it: /[\u00e0\u00e8\u00e9\u00ec\u00ed\u00f2\u00f3\u00f9\u00fa]/i,
  tr: /[\u011f\u0131\u0130\u015f\u00e7\u00f6\u00fc]/i,
  pl: /[\u0105\u0107\u0119\u0142\u0144\u00f3\u015b\u017a\u017c]/i
};
const IMPORT_LANG_STOPWORDS = {
  la: new Set(["et", "in", "ad", "de", "cum", "per", "non", "est", "sunt", "qui", "quae", "quod", "ex", "ab", "pro", "sub"]),
  en: new Set([
    "the", "and", "to", "of", "in", "on", "for", "with", "is", "are", "from", "by", "or", "an", "a",
    "i", "you", "me", "my", "your", "we", "they", "he", "she", "it", "this", "that",
    "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did",
    "not", "at", "as", "if", "so", "but", "can", "could", "will", "would", "should",
    "there", "when", "what", "who", "where", "why", "how", "about"
  ]),
  cs: new Set(["a", "i", "v", "ve", "na", "je", "jsou", "s", "z", "do", "pro", "od", "se", "si"]),
  de: new Set(["der", "die", "das", "und", "zu", "von", "mit", "ist", "sind", "im", "in", "ein", "eine"]),
  fr: new Set(["le", "la", "les", "et", "de", "du", "des", "dans", "est", "sont", "un", "une", "pour"]),
  es: new Set(["el", "la", "los", "las", "y", "de", "del", "en", "es", "son", "un", "una", "para"]),
  it: new Set(["il", "la", "lo", "gli", "le", "e", "di", "del", "in", "con", "un", "una", "sono"]),
  tr: new Set(["ve", "bir", "bu", "icin", "ile", "de", "da", "olan", "olarak", "mi", "mu"]),
  pl: new Set(["i", "w", "na", "z", "do", "jest", "sa", "oraz", "dla", "od", "po"])
};
const IMPORT_LATIN_ENDING_RE = /(us|um|ae|ibus|orum|arum|ium|ntis|ensis)$/i;
const IMPORT_MIN_TOKEN_LEN_FOR_LATIN_ENDING = 4;
const IMPORT_LANG_CANDIDATES = ["la", "en", "cs", "de", "fr", "es", "it", "tr", "pl"];
const IMPORT_FRONT_HEADER_ALIASES = ["front", "question", "term", "prompt", "latin", "source", "word"];
const IMPORT_BACK_HEADER_ALIASES = ["back", "answer", "definition", "target", "translation", "meaning"];
const IMPORT_TAGS_HEADER_ALIASES = ["tags", "tag", "source_tags"];
const IMPORT_DECK_HEADER_ALIASES = ["deck", "deck_name", "source_deck"];
const IMPORT_NOTETYPE_HEADER_ALIASES = ["notetype", "note_type", "model", "source_notetype"];
const IMPORT_GUID_HEADER_ALIASES = ["guid", "note_guid", "source_guid", "id"];
const IMPORT_LANG_HEADER_ALIASES = ["lang", "language", "tts_lang", "ttslang"];
const IMPORT_FRONT_LANG_HEADER_ALIASES = ["front_lang", "lang_front", "source_lang", "question_lang", "lang1"];
const IMPORT_BACK_LANG_HEADER_ALIASES = ["back_lang", "lang_back", "target_lang", "answer_lang", "lang2"];
const ANKI_META_PREFIXES = [
  "#separator:",
  "#html:",
  "#notetype:",
  "#deck:",
  "#columns:",
  "#tags column:",
  "#deck column:",
  "#notetype column:",
  "#guid column:"
];
const ANKI_SEPARATOR_ALIASES = Object.freeze({
  tab: "\t",
  "\\t": "\t",
  tsv: "\t",
  comma: ",",
  csv: ",",
  semicolon: ";",
  ";": ";",
  pipe: "|",
  "|": "|"
});
const IMPORT_LANG_LABELS = {
  la: "Latin",
  en: "English",
  cs: "Czech",
  de: "German",
  fr: "French",
  es: "Spanish",
  it: "Italian",
  tr: "Turkish",
  pl: "Polish"
};
const CARD_LANG_SELECT_CODES = ["", ...IMPORT_LANG_CANDIDATES];

function normalizeImportLangCode(value = "", fallback = "") {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return fallback || "";
  const compactRaw = raw.replace(/\./g, "");
  if (Object.prototype.hasOwnProperty.call(IMPORT_LANG_ALIASES, compactRaw)) {
    return IMPORT_LANG_ALIASES[compactRaw] || fallback || "";
  }
  const code = compactRaw.split(/[-_]/)[0];
  if (code && IMPORT_LANG_SUPPORTED.has(code)) return code;
  const token = compactRaw.split(/[\s/|,;:()]+/)[0];
  if (token && IMPORT_LANG_SUPPORTED.has(token)) return token;
  if (token && Object.prototype.hasOwnProperty.call(IMPORT_LANG_ALIASES, token)) {
    return IMPORT_LANG_ALIASES[token] || fallback || "";
  }
  return fallback || "";
}

function isAutoImportLanguageMode(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  return !raw || raw === "auto";
}

function normalizeImportFallbackLang(value = "", { allowEmpty = false } = {}) {
  const code = normalizeImportLangCode(value, "");
  if (code) return code;
  return allowEmpty ? "" : "la";
}

function tokenizeImportLanguageText(text = "") {
  return String(text || "")
    .toLowerCase()
    .replace(/[\u2019']/g, "")
    .replace(/[\r\n]+/g, " ")
    .split(/[^a-z\u00c0-\u024f\u1e00-\u1eff]+/i)
    .map((token) => token.trim())
    .filter(Boolean);
}

function scoreImportLanguage(text = "", code = "") {
  const sample = String(text || "");
  if (!sample || !code) return 0;
  let score = 0;
  const charRe = IMPORT_LANG_CHAR_RE[code];
  if (charRe && charRe.test(sample)) score += (code === "la" ? 8 : 5);

  const tokens = tokenizeImportLanguageText(sample);
  if (!tokens.length) return score;

  const stopwords = IMPORT_LANG_STOPWORDS[code] || new Set();
  let stopwordScore = 0;
  tokens.forEach((token) => {
    if (!stopwords.has(token)) return;
    stopwordScore += token.length <= 1 ? 0.35 : 1.4;
  });
  if (stopwordScore) score += stopwordScore;
  if (code === "la") {
    tokens.forEach((token) => {
      if (token.length >= (IMPORT_MIN_TOKEN_LEN_FOR_LATIN_ENDING + 1) && IMPORT_LATIN_ENDING_RE.test(token)) score += 0.5;
    });
  }
  return score;
}

function analyzeImportLanguage(text = "", fallback = "la") {
  const normalizedFallback = normalizeImportFallbackLang(fallback, { allowEmpty: true });
  const sample = String(text || "").trim();
  if (!sample) {
    return {
      code: normalizedFallback,
      confident: false,
      bestScore: 0,
      secondScore: 0,
      margin: 0
    };
  }

  const scored = IMPORT_LANG_CANDIDATES.map((code) => ({
    code,
    score: scoreImportLanguage(sample, code)
  })).sort((a, b) => b.score - a.score);

  const best = scored[0];
  const second = scored[1] || { score: 0 };
  const bestScore = Number(best?.score) || 0;
  const secondScore = Number(second?.score) || 0;
  const margin = bestScore - secondScore;
  const confident = bestScore >= 2.2 && (margin >= 1.2 || bestScore >= 5);
  const code = confident ? (best?.code || normalizedFallback) : normalizedFallback;
  return {
    code,
    confident,
    bestScore,
    secondScore,
    margin
  };
}

function detectImportLanguage(text = "", fallback = "la") {
  const normalizedFallback = normalizeImportFallbackLang(fallback);
  const analysis = analyzeImportLanguage(text, normalizedFallback);
  return analysis.code || normalizedFallback;
}

function readImportedExplicitRowLanguage(row = {}, side = "front") {
  const explicitSide = normalizeImportLangCode(
    side === "front"
      ? (row?.frontLang ?? row?.front_lang ?? row?.langFront ?? row?.lang_front ?? row?.question_lang)
      : (row?.backLang ?? row?.back_lang ?? row?.langBack ?? row?.lang_back ?? row?.answer_lang),
    ""
  );
  if (explicitSide) return explicitSide;

  const fromCard = readCardFaceLanguageCode(row, side);
  if (fromCard) return fromCard;

  const flat = normalizeImportLangCode(row?.language ?? row?.tts_lang, "");
  if (flat) return flat;

  return "";
}

function readImportedObjectCardFaceText(card = {}, side = "front") {
  if (side === "back") {
    return String(
      card.back ?? card.BACK ?? card.back_text ?? card.answer ?? card.definition ?? card.translation ?? card.a ?? ""
    ).trim();
  }
  return String(
    card.front ?? card.FRONT ?? card.front_text ?? card.question ?? card.term ?? card.prompt ?? card.q ?? ""
  ).trim();
}

function isImportableObjectCard(card) {
  if (!card || typeof card !== "object" || Array.isArray(card)) return false;
  if (isDiagramSourceCard(card)) return true;
  const front = readImportedObjectCardFaceText(card, "front");
  const back = readImportedObjectCardFaceText(card, "back");
  return Boolean(front && back);
}

function hasImportedCardLang(card = {}) {
  const lang = card?.lang;
  if (typeof lang === "string") return Boolean(normalizeImportLangCode(lang, ""));
  if (!lang || typeof lang !== "object" || Array.isArray(lang)) return false;
  const front = normalizeImportLangCode(lang.front, "");
  const back = normalizeImportLangCode(lang.back, "");
  return Boolean(front || back);
}

function inferImportSideLanguage(rows = [], side = "front", fallback = "la") {
  const normalizedFallback = normalizeImportFallbackLang(fallback);
  if (!Array.isArray(rows) || !rows.length) return normalizedFallback;

  const explicitCounts = new Map();
  const samples = [];
  rows.forEach((row) => {
    const explicit = readImportedExplicitRowLanguage(row, side);
    if (explicit) explicitCounts.set(explicit, (explicitCounts.get(explicit) || 0) + 1);
    const content = String(side === "front" ? row?.front ?? "" : row?.back ?? "").trim();
    if (content) samples.push(content);
  });

  let explicitWinner = "";
  let explicitWinnerCount = 0;
  explicitCounts.forEach((count, code) => {
    if (count > explicitWinnerCount) {
      explicitWinner = code;
      explicitWinnerCount = count;
    }
  });
  if (explicitWinner && explicitWinnerCount >= Math.max(2, Math.ceil(rows.length * 0.2))) return explicitWinner;
  if (!samples.length) return explicitWinner || normalizedFallback;

  const aggregate = analyzeImportLanguage(samples.join(" "), normalizedFallback);
  if (aggregate.confident && aggregate.code) return aggregate.code;

  const weightedVotes = new Map();
  samples.forEach((content) => {
    const analysis = analyzeImportLanguage(content, "");
    if (!analysis.confident || !analysis.code) return;
    const weight = Math.max(0.5, analysis.margin);
    weightedVotes.set(analysis.code, (weightedVotes.get(analysis.code) || 0) + weight);
  });

  let votedCode = "";
  let votedScore = 0;
  weightedVotes.forEach((score, code) => {
    if (score > votedScore) {
      votedCode = code;
      votedScore = score;
    }
  });
  if (votedCode && votedScore >= 2) return votedCode;
  return explicitWinner || aggregate.code || normalizedFallback;
}

function splitDelimitedLine(line, delimiter) {
  const text = String(line ?? "");
  if (!delimiter) return [text];
  const out = [];
  let current = "";
  let quoteMode = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (!quoteMode && (ch === "\"" || ch === "\u201c" || ch === "\u201d" || ch === "\u201e")) {
      quoteMode = ch === "\"" ? "\"" : "\u201c";
      continue;
    }
    if (quoteMode === "\"" && ch === "\"") {
      const next = text[i + 1];
      if (next === "\"") {
        current += "\"";
        i += 1;
        continue;
      }
      quoteMode = "";
      continue;
    }
    if (quoteMode === "\u201c" && (ch === "\u201d" || ch === "\u201c")) {
      quoteMode = "";
      continue;
    }
    if (ch === delimiter && !quoteMode) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out.map((cell) => String(cell ?? "").trim());
}

function inferDelimitedSeparator(lines = []) {
  if (!Array.isArray(lines) || !lines.length) return "";
  if (lines.some((line) => String(line).includes("\t"))) return "\t";
  const candidates = [";", "|", ","];
  let winner = "";
  let winnerScore = 0;
  candidates.forEach((sep) => {
    const score = lines.reduce((sum, line) => sum + (String(line).split(sep).length - 1), 0);
    if (score > winnerScore) {
      winner = sep;
      winnerScore = score;
    }
  });
  return winnerScore > 0 ? winner : "";
}

function parseImportTextMetaAndLines(rawText = "") {
  const rawLines = String(rawText || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/);
  let explicitDelimiter = "";
  let ankiMetaDetected = false;
  const lines = [];

  rawLines.forEach((rawLine) => {
    const line = String(rawLine ?? "").trim();
    if (!line) return;
    const lower = line.toLowerCase();
    if (lower.startsWith("#separator:")) {
      ankiMetaDetected = true;
      const rawSep = lower.slice("#separator:".length).trim();
      explicitDelimiter = ANKI_SEPARATOR_ALIASES[rawSep] || explicitDelimiter;
      return;
    }
    if (ANKI_META_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
      ankiMetaDetected = true;
      return;
    }
    if (ankiMetaDetected && lower.startsWith("#")) return;
    lines.push(line);
  });

  return {
    explicitDelimiter,
    lines
  };
}

function normalizeHeaderToken(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w]/g, "");
}

function headerIndexByAliases(headers = [], aliases = []) {
  const aliasSet = new Set(aliases.map((item) => normalizeHeaderToken(item)));
  return headers.findIndex((header) => aliasSet.has(normalizeHeaderToken(header)));
}

function parsePairLine(line = "") {
  const raw = String(line || "").trim();
  if (!raw) return null;
  const separators = ["\t", "::", "=>", "->", ";", "|"];
  for (const sep of separators) {
    const idx = raw.indexOf(sep);
    if (idx <= 0) continue;
    const front = raw.slice(0, idx).trim();
    const back = raw.slice(idx + sep.length).trim();
    if (front && back) return { front, back };
  }
  const dashMatch = raw.match(/^(.+?)\s[-–—]\s(.+)$/);
  if (dashMatch) {
    const front = String(dashMatch[1] || "").trim();
    const back = String(dashMatch[2] || "").trim();
    if (front && back) return { front, back };
  }
  return null;
}

function parseRowsFromDelimitedText(rawText = "") {
  const parsed = parseImportTextMetaAndLines(rawText);
  const lines = parsed.lines;
  if (!lines.length) return [];

  const delimiter = parsed.explicitDelimiter || inferDelimitedSeparator(lines);
  if (!delimiter) {
    return lines
      .map((line) => parsePairLine(line))
      .filter(Boolean);
  }

  const rows = lines.map((line) => splitDelimitedLine(line, delimiter));
  const header = rows[0] || [];
  const frontIdx = headerIndexByAliases(header, ["front", "question", "term", "prompt", "latin", "source", "word"]);
  const backIdx = headerIndexByAliases(header, ["back", "answer", "definition", "target", "translation", "meaning"]);
  const langIdx = headerIndexByAliases(header, ["lang", "language", "tts_lang", "ttslang"]);
  const frontLangIdx = headerIndexByAliases(header, ["front_lang", "lang_front", "source_lang", "question_lang", "lang1"]);
  const backLangIdx = headerIndexByAliases(header, ["back_lang", "lang_back", "target_lang", "answer_lang", "lang2"]);
  const hasHeader = frontIdx !== -1 || backIdx !== -1;
  const sourceRows = hasHeader ? rows.slice(1) : rows;
  const fallbackFrontIdx = hasHeader && frontIdx !== -1 ? frontIdx : 0;
  const fallbackBackIdx = hasHeader && backIdx !== -1 ? backIdx : 1;

  const out = [];
  sourceRows.forEach((cells) => {
    if (!Array.isArray(cells) || !cells.length) return;
    const front = String(cells[fallbackFrontIdx] ?? "").trim();
    const back = String(cells[fallbackBackIdx] ?? "").trim();
    if (!front || !back) return;
    const lang = langIdx >= 0 ? String(cells[langIdx] ?? "").trim() : "";
    const frontLang = frontLangIdx >= 0 ? String(cells[frontLangIdx] ?? "").trim() : "";
    const backLang = backLangIdx >= 0 ? String(cells[backLangIdx] ?? "").trim() : "";
    out.push({ front, back, lang, frontLang, backLang });
  });
  return out;
}

function normalizeDeckImportRole(role = "") {
  const normalized = String(role || "").trim().toLowerCase();
  if (!normalized) return "ignore";
  return DECK_IMPORT_ROLE_SET.has(normalized) ? normalized : "ignore";
}

function parseAnkiColumnIndex(rawValue = "") {
  const match = String(rawValue || "").match(/-?\d+/);
  if (!match) return -1;
  const raw = Number.parseInt(match[0], 10);
  if (!Number.isFinite(raw)) return -1;
  if (raw > 0) return raw - 1;
  if (raw === 0) return 0;
  return -1;
}

function parseImportColumnsDirective(rawValue = "", delimiterHint = "") {
  const value = String(rawValue || "");
  if (!value.trim()) return [];
  const delimiter = value.includes("\t")
    ? "\t"
    : (delimiterHint && value.includes(delimiterHint) ? delimiterHint : (value.includes(",") ? "," : (value.includes(";") ? ";" : (value.includes("|") ? "|" : ""))));
  if (!delimiter) return value.split(/\s+/).map((token) => token.trim()).filter(Boolean);
  return splitDelimitedLine(value, delimiter);
}

function parseDeckImportMetaAndData(rawText = "") {
  const raw = String(rawText || "").replace(/^\uFEFF/, "");
  const meta = {
    headerLines: [],
    explicitDelimiter: "",
    columns: [],
    htmlEnabled: false,
    defaultDeck: "",
    defaultNotetype: "",
    metaColumnIndexes: {
      tags: -1,
      deck: -1,
      notetype: -1,
      guid: -1
    }
  };

  const rows = [];
  const re = /([^\r\n]*)(\r\n|\n|\r|$)/g;
  let match = null;
  while ((match = re.exec(raw)) !== null) {
    const full = String(match[0] || "");
    if (!full.length && re.lastIndex >= raw.length) break;
    rows.push({
      text: String(match[1] || ""),
      start: match.index,
      end: match.index + full.length
    });
    if (!match[2]) break;
  }

  let dataOffset = 0;
  let seenHeader = false;
  const parseLine = (rawLine) => {
    const line = String(rawLine || "").trim();
    if (!line.startsWith("#")) return false;
    const lower = line.toLowerCase();
    const valueAfter = (prefix) => line.slice(prefix.length).trim();
    meta.headerLines.push(line);
    if (lower.startsWith("#separator:")) {
      const sepRaw = valueAfter("#separator:");
      const sepKey = String(sepRaw).toLowerCase();
      meta.explicitDelimiter = ANKI_SEPARATOR_ALIASES[sepKey] || (String(sepRaw).includes("\t") ? "\t" : meta.explicitDelimiter);
      return true;
    }
    if (lower.startsWith("#columns:")) {
      const columnsRaw = valueAfter("#columns:");
      meta.columns = parseImportColumnsDirective(columnsRaw, meta.explicitDelimiter || "\t");
      return true;
    }
    if (lower.startsWith("#html:")) {
      meta.htmlEnabled = /^(1|true|yes|on)$/i.test(valueAfter("#html:"));
      return true;
    }
    if (lower.startsWith("#deck:")) {
      meta.defaultDeck = valueAfter("#deck:");
      return true;
    }
    if (lower.startsWith("#notetype:")) {
      meta.defaultNotetype = valueAfter("#notetype:");
      return true;
    }
    if (lower.startsWith("#tags column:")) {
      meta.metaColumnIndexes.tags = parseAnkiColumnIndex(valueAfter("#tags column:"));
      return true;
    }
    if (lower.startsWith("#deck column:")) {
      meta.metaColumnIndexes.deck = parseAnkiColumnIndex(valueAfter("#deck column:"));
      return true;
    }
    if (lower.startsWith("#notetype column:")) {
      meta.metaColumnIndexes.notetype = parseAnkiColumnIndex(valueAfter("#notetype column:"));
      return true;
    }
    if (lower.startsWith("#guid column:")) {
      meta.metaColumnIndexes.guid = parseAnkiColumnIndex(valueAfter("#guid column:"));
      return true;
    }
    return ANKI_META_PREFIXES.some((prefix) => lower.startsWith(prefix));
  };

  for (const row of rows) {
    const text = String(row.text || "");
    const trimmedStart = text.trimStart();
    if (!trimmedStart && !seenHeader) {
      dataOffset = row.end;
      continue;
    }
    if (trimmedStart.startsWith("#")) {
      seenHeader = true;
      parseLine(trimmedStart);
      dataOffset = row.end;
      continue;
    }
    if (seenHeader && !trimmedStart) {
      dataOffset = row.end;
      continue;
    }
    break;
  }

  const dataText = raw.slice(dataOffset);
  const dataLines = dataText
    .split(/\r\n|\n|\r/)
    .map((line) => String(line ?? ""))
    .filter((line) => line.trim().length > 0);
  return {
    meta,
    dataText,
    dataLines
  };
}

function countDelimiterOutsideQuotes(line = "", delimiter = ",") {
  const text = String(line || "");
  if (!delimiter || !text) return 0;
  let inQuotes = false;
  let count = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "\"") {
      if (inQuotes && text[i + 1] === "\"") {
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && ch === delimiter) count += 1;
  }
  return count;
}

function inferDeckImportDelimiter(lines = [], dataText = "") {
  const candidates = ["\t", ",", ";", "|"];
  const sample = (Array.isArray(lines) && lines.length
    ? lines
    : String(dataText || "").split(/\r\n|\n|\r/).filter((line) => String(line || "").trim()))
    .slice(0, 80);
  if (!sample.length) return "";
  let winner = "";
  let winnerLineHits = 0;
  let winnerTotal = 0;
  candidates.forEach((sep) => {
    let lineHits = 0;
    let total = 0;
    sample.forEach((line) => {
      const hits = countDelimiterOutsideQuotes(line, sep);
      if (hits > 0) {
        lineHits += 1;
        total += hits;
      }
    });
    if (lineHits > winnerLineHits || (lineHits === winnerLineHits && total > winnerTotal)) {
      winner = sep;
      winnerLineHits = lineHits;
      winnerTotal = total;
    }
  });
  return winnerLineHits > 0 ? winner : "";
}

function parseQuotedDelimitedRows(rawText = "", delimiter = ",") {
  const text = String(rawText || "");
  if (!delimiter) return [];
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  const pushRow = () => {
    row.push(field);
    rows.push(row);
    row = [];
    field = "";
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === "\"") {
        if (text[i + 1] === "\"") {
          field += "\"";
          i += 1;
          continue;
        }
        inQuotes = false;
        continue;
      }
      field += ch;
      continue;
    }

    if (ch === "\"" && !field.length) {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      pushRow();
      continue;
    }
    field += ch;
  }
  row.push(field);
  rows.push(row);

  while (rows.length) {
    const tail = rows[rows.length - 1] || [];
    if (tail.some((cell) => String(cell || "").length > 0)) break;
    rows.pop();
  }
  return rows;
}

function normalizeDeckImportColumnNames(columnNames = [], columnCount = 0) {
  const out = [];
  const total = Math.max(0, Number(columnCount) || 0);
  for (let i = 0; i < total; i += 1) {
    const raw = i < columnNames.length ? String(columnNames[i] ?? "") : "";
    out.push(raw.trim() || `Column ${i + 1}`);
  }
  return out;
}

function inferRoleFromColumnHeader(header = "") {
  const token = normalizeHeaderToken(header);
  if (!token) return "extra";
  if (IMPORT_FRONT_HEADER_ALIASES.map(normalizeHeaderToken).includes(token)) return "front";
  if (IMPORT_BACK_HEADER_ALIASES.map(normalizeHeaderToken).includes(token)) return "back";
  if (IMPORT_TAGS_HEADER_ALIASES.map(normalizeHeaderToken).includes(token)) return "tags";
  if (IMPORT_DECK_HEADER_ALIASES.map(normalizeHeaderToken).includes(token)) return "deck";
  if (IMPORT_NOTETYPE_HEADER_ALIASES.map(normalizeHeaderToken).includes(token)) return "notetype";
  if (IMPORT_GUID_HEADER_ALIASES.map(normalizeHeaderToken).includes(token)) return "guid";
  return "extra";
}

function detectDeckImportHeaderRow(row = []) {
  if (!Array.isArray(row) || !row.length) return false;
  const headers = row.map((cell) => String(cell || "").trim());
  if (!headers.some(Boolean)) return false;
  return [
    headerIndexByAliases(headers, IMPORT_FRONT_HEADER_ALIASES),
    headerIndexByAliases(headers, IMPORT_BACK_HEADER_ALIASES),
    headerIndexByAliases(headers, IMPORT_TAGS_HEADER_ALIASES),
    headerIndexByAliases(headers, IMPORT_DECK_HEADER_ALIASES),
    headerIndexByAliases(headers, IMPORT_NOTETYPE_HEADER_ALIASES),
    headerIndexByAliases(headers, IMPORT_GUID_HEADER_ALIASES),
    headerIndexByAliases(headers, IMPORT_LANG_HEADER_ALIASES),
    headerIndexByAliases(headers, IMPORT_FRONT_LANG_HEADER_ALIASES),
    headerIndexByAliases(headers, IMPORT_BACK_LANG_HEADER_ALIASES)
  ].some((idx) => idx !== -1);
}

function buildDeckImportRoleByColumn({
  columnCount = 0,
  columnNames = [],
  metaColumnIndexes = {}
} = {}) {
  const total = Math.max(0, Number(columnCount) || 0);
  const roleByColumn = {};
  for (let i = 0; i < total; i += 1) roleByColumn[i] = "extra";

  for (let i = 0; i < total; i += 1) {
    const role = inferRoleFromColumnHeader(columnNames[i]);
    if (role && role !== "extra") roleByColumn[i] = role;
  }

  const directiveRoles = [
    { key: "guid", role: "guid" },
    { key: "tags", role: "tags" },
    { key: "deck", role: "deck" },
    { key: "notetype", role: "notetype" }
  ];
  directiveRoles.forEach(({ key, role }) => {
    const idx = Number(metaColumnIndexes?.[key]);
    if (Number.isInteger(idx) && idx >= 0 && idx < total) roleByColumn[idx] = role;
  });

  const ensureSingle = (role) => {
    const matches = [];
    for (let i = 0; i < total; i += 1) if (roleByColumn[i] === role) matches.push(i);
    if (matches.length <= 1) return;
    matches.slice(1).forEach((idx) => {
      roleByColumn[idx] = "extra";
    });
  };

  if (total >= 1 && !Object.values(roleByColumn).includes("front")) roleByColumn[0] = "front";
  if (total >= 2 && !Object.values(roleByColumn).includes("back")) {
    const fallbackBack = roleByColumn[1] === "front" ? 0 : 1;
    roleByColumn[fallbackBack] = "back";
    if (fallbackBack === 0 && total > 1 && roleByColumn[1] === "front") roleByColumn[1] = "extra";
  }

  ensureSingle("front");
  ensureSingle("back");
  ensureSingle("guid");
  ensureSingle("tags");
  ensureSingle("deck");
  ensureSingle("notetype");
  return roleByColumn;
}

function buildDeckImportProfileSignature({
  columnCount = 0,
  columnNames = [],
  delimiter = "",
  metaColumnIndexes = {}
} = {}) {
  const normalizedColumns = normalizeDeckImportColumnNames(columnNames, columnCount)
    .map((name) => normalizeHeaderToken(name))
    .join("|");
  const flags = {
    guid: Number.isInteger(metaColumnIndexes?.guid) && metaColumnIndexes.guid >= 0 ? 1 : 0,
    tags: Number.isInteger(metaColumnIndexes?.tags) && metaColumnIndexes.tags >= 0 ? 1 : 0,
    deck: Number.isInteger(metaColumnIndexes?.deck) && metaColumnIndexes.deck >= 0 ? 1 : 0,
    notetype: Number.isInteger(metaColumnIndexes?.notetype) && metaColumnIndexes.notetype >= 0 ? 1 : 0
  };
  return `cols=${Math.max(0, Number(columnCount) || 0)};sep=${delimiter || "none"};head=${normalizedColumns};meta=${flags.guid}${flags.tags}${flags.deck}${flags.notetype}`;
}

function normalizeDeckImportRoleByColumn(roleByColumn = {}, columnCount = 0) {
  const total = Math.max(0, Number(columnCount) || 0);
  const out = {};
  for (let i = 0; i < total; i += 1) {
    const role = normalizeDeckImportRole(roleByColumn?.[i] ?? roleByColumn?.[String(i)] ?? "ignore");
    out[i] = role;
  }
  return out;
}

function loadDeckImportProfiles() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DECK_IMPORT_PROFILE_STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        name: String(item.name || "").trim(),
        signature: String(item.signature || "").trim(),
        roleByColumn: item.roleByColumn && typeof item.roleByColumn === "object" ? item.roleByColumn : {},
        updatedAt: Number(item.updatedAt) || Date.now()
      }))
      .filter((item) => item.signature);
  } catch {
    return [];
  }
}

function persistDeckImportProfiles(profiles = []) {
  try {
    localStorage.setItem(DECK_IMPORT_PROFILE_STORAGE_KEY, JSON.stringify(profiles));
  } catch {}
}

function findDeckImportProfileBySignature(signature = "") {
  const sig = String(signature || "").trim();
  if (!sig) return null;
  const profiles = loadDeckImportProfiles()
    .filter((item) => item.signature === sig)
    .sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0));
  return profiles[0] || null;
}

function saveDeckImportProfile(session = null, roleByColumn = {}, name = "") {
  if (!session || !session.profileSignature) return;
  const normalizedName = String(name || "").trim() || session.suggestedProfileName || "Import profile";
  const normalizedRoleByColumn = normalizeDeckImportRoleByColumn(roleByColumn, session.columnCount);
  const signature = String(session.profileSignature || "").trim();
  if (!signature) return;
  const profiles = loadDeckImportProfiles();
  const existingIdx = profiles.findIndex((item) => item.signature === signature && item.name === normalizedName);
  const nextEntry = {
    name: normalizedName,
    signature,
    roleByColumn: normalizedRoleByColumn,
    updatedAt: Date.now()
  };
  if (existingIdx >= 0) profiles[existingIdx] = nextEntry;
  else profiles.unshift(nextEntry);
  persistDeckImportProfiles(profiles.slice(0, 150));
}

function analyzeDeckImportDelimitedFile(rawText = "") {
  const parsed = parseDeckImportMetaAndData(rawText);
  const delimiter = parsed.meta.explicitDelimiter || inferDeckImportDelimiter(parsed.dataLines, parsed.dataText);
  if (!delimiter) {
    const pairRows = parsed.dataLines.map((line) => parsePairLine(line)).filter(Boolean);
    return {
      mode: "pair",
      delimiter: "",
      headerLines: parsed.meta.headerLines,
      meta: parsed.meta,
      columnCount: pairRows.length ? 2 : 0,
      columnNames: pairRows.length ? ["Front", "Back"] : [],
      roleByColumn: pairRows.length ? { 0: "front", 1: "back" } : {},
      dataRows: pairRows.map((row) => [row.front, row.back]),
      pairRows,
      profileSignature: "",
      hasHeader: false
    };
  }

  const rawRows = parseQuotedDelimitedRows(parsed.dataText, delimiter);
  const columnCount = rawRows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
  const explicitColumns = Array.isArray(parsed.meta.columns)
    ? parsed.meta.columns.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
  let columnNames = explicitColumns.length ? normalizeDeckImportColumnNames(explicitColumns, columnCount) : [];
  let hasHeader = false;
  let dataRows = rawRows;
  if (!columnNames.length && rawRows.length && detectDeckImportHeaderRow(rawRows[0])) {
    hasHeader = true;
    columnNames = normalizeDeckImportColumnNames(rawRows[0], columnCount);
    dataRows = rawRows.slice(1);
  }
  if (!columnNames.length) columnNames = normalizeDeckImportColumnNames([], columnCount);
  const roleByColumn = buildDeckImportRoleByColumn({
    columnCount,
    columnNames,
    metaColumnIndexes: parsed.meta.metaColumnIndexes
  });
  const profileSignature = buildDeckImportProfileSignature({
    columnCount,
    columnNames,
    delimiter,
    metaColumnIndexes: parsed.meta.metaColumnIndexes
  });
  return {
    mode: "delimited",
    delimiter,
    headerLines: parsed.meta.headerLines,
    meta: parsed.meta,
    columnCount,
    columnNames,
    roleByColumn,
    dataRows,
    pairRows: [],
    profileSignature,
    hasHeader
  };
}

function buildDeckImportSession({ fileName = "", rawText = "", language = "auto", deckName = "" } = {}) {
  const text = String(rawText || "");
  const ext = String(fileName || "").trim().toLowerCase().split(".").pop() || "";
  const autoDetect = isAutoImportLanguageMode(language);
  const fallbackLang = normalizeImportFallbackLang(language);

  if (ext === "json") {
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
    const nativeCards = normalizeImportedJsonObjectCards(parseDeckPayloadCards(payload), {
      deckName,
      fileName,
      autoDetect,
      fallbackLang
    });
    if (nativeCards.length) {
      return {
        kind: "native-json",
        fileName,
        deckName,
        autoDetect,
        fallbackLang,
        cards: nativeCards,
        requiresMapping: false,
        columnCount: 0,
        columnNames: [],
        roleByColumn: {},
        dataRows: [],
        profileSignature: ""
      };
    }
    const extractedRows = extractRowsFromJsonPayload(payload);
    if (!extractedRows.length) {
      return {
        kind: "json-rows",
        fileName,
        deckName,
        autoDetect,
        fallbackLang,
        rows: [],
        requiresMapping: false,
        columnCount: 2,
        columnNames: ["Front", "Back"],
        roleByColumn: { 0: "front", 1: "back" },
        dataRows: [],
        profileSignature: ""
      };
    }
    return {
      kind: "json-rows",
      fileName,
      deckName,
      autoDetect,
      fallbackLang,
      rows: extractedRows,
      requiresMapping: false,
      columnCount: 2,
      columnNames: ["Front", "Back"],
      roleByColumn: { 0: "front", 1: "back" },
      dataRows: extractedRows.map((row) => [row.front, row.back]),
      profileSignature: ""
    };
  }

  const analyzed = analyzeDeckImportDelimitedFile(text);
  if (analyzed.mode === "pair") {
    return {
      kind: "pair",
      fileName,
      deckName,
      autoDetect,
      fallbackLang,
      rows: analyzed.pairRows,
      requiresMapping: false,
      columnCount: analyzed.columnCount,
      columnNames: analyzed.columnNames,
      roleByColumn: analyzed.roleByColumn,
      dataRows: analyzed.dataRows,
      delimiter: "",
      profileSignature: ""
    };
  }

  const profile = findDeckImportProfileBySignature(analyzed.profileSignature);
  const profileRoleByColumn = profile
    ? normalizeDeckImportRoleByColumn(profile.roleByColumn, analyzed.columnCount)
    : null;
  const roleByColumn = profileRoleByColumn || analyzed.roleByColumn;
  let frontCount = 0;
  let backCount = 0;
  for (let i = 0; i < analyzed.columnCount; i += 1) {
    const role = normalizeDeckImportRole(roleByColumn?.[i]);
    if (role === "front") frontCount += 1;
    if (role === "back") backCount += 1;
  }
  const requiresMapping = analyzed.columnCount > 2 && (!profile || frontCount !== 1 || backCount !== 1);
  return {
    kind: "delimited",
    fileName,
    deckName,
    autoDetect,
    fallbackLang,
    delimiter: analyzed.delimiter,
    headerLines: analyzed.headerLines,
    meta: analyzed.meta,
    columnCount: analyzed.columnCount,
    columnNames: analyzed.columnNames,
    roleByColumn,
    roleByColumnDefault: analyzed.roleByColumn,
    dataRows: analyzed.dataRows,
    profileSignature: analyzed.profileSignature,
    profileMatched: profile ? profile.name : "",
    suggestedProfileName: `profile_${sanitizeDeckFileStem(deckName || deckNameFromFilename(fileName) || "import") || "import"}_${analyzed.columnCount}col`,
    requiresMapping
  };
}

function isDeckImportMappingPanelVisible() {
  return refs.deckImportMappingPanel instanceof HTMLElement && !refs.deckImportMappingPanel.hasAttribute("hidden");
}

function buildDeckImportFirstTwoRoleByColumn(columnCount = 0) {
  const total = Math.max(0, Number(columnCount) || 0);
  const roleByColumn = {};
  for (let i = 0; i < total; i += 1) roleByColumn[i] = "ignore";
  if (total >= 1) roleByColumn[0] = "front";
  if (total >= 2) roleByColumn[1] = "back";
  return roleByColumn;
}

function readDeckImportRoleMapFromUi(session = null) {
  if (!session || typeof session !== "object") return {};
  const total = Math.max(0, Number(session.columnCount) || 0);
  let roleByColumn = {};
  const mapEl = refs.deckImportColumnMap;
  if (mapEl instanceof HTMLElement) {
    const selects = Array.from(mapEl.querySelectorAll("select[data-col-index]"));
    if (selects.length) {
      selects.forEach((select) => {
        if (!(select instanceof HTMLSelectElement)) return;
        const idx = Number.parseInt(String(select.dataset.colIndex || ""), 10);
        if (!Number.isInteger(idx) || idx < 0 || idx >= total) return;
        roleByColumn[idx] = normalizeDeckImportRole(select.value || "ignore");
      });
    }
  }

  if (!Object.keys(roleByColumn).length) {
    roleByColumn = normalizeDeckImportRoleByColumn(
      session.roleByColumnCurrent || session.roleByColumn || session.roleByColumnDefault || {},
      total
    );
  } else {
    roleByColumn = normalizeDeckImportRoleByColumn(roleByColumn, total);
  }

  if (refs.deckImportUseFirstTwo instanceof HTMLInputElement && refs.deckImportUseFirstTwo.checked && total > 2) {
    roleByColumn = buildDeckImportFirstTwoRoleByColumn(total);
  }
  session.roleByColumnCurrent = roleByColumn;
  return roleByColumn;
}

function collectDeckImportRoleWarnings(session = null, roleByColumn = {}) {
  const warnings = [];
  if (!session || typeof session !== "object") return warnings;
  const total = Math.max(0, Number(session.columnCount) || 0);
  const looksGuidLike = (value) => {
    const text = String(value || "").trim();
    if (text.length < 8 || /\s/.test(text)) return false;
    if (/^[0-9a-f]{8,}$/i.test(text)) return true;
    if (/^[A-Za-z0-9._:+/=-]{8,}$/.test(text) && /[^A-Za-z]/.test(text) && /[^A-Za-z0-9]/.test(text)) return true;
    return false;
  };
  const colsForRole = (targetRole) => {
    const matches = [];
    for (let i = 0; i < total; i += 1) {
      if (normalizeDeckImportRole(roleByColumn?.[i]) === targetRole) matches.push(i);
    }
    return matches;
  };
  const frontCols = colsForRole("front");
  const backCols = colsForRole("back");
  if (frontCols.length > 1) warnings.push(`Multiple Front columns selected (${frontCols.map((idx) => idx + 1).join(", ")}).`);
  if (backCols.length > 1) warnings.push(`Multiple Back columns selected (${backCols.map((idx) => idx + 1).join(", ")}).`);

  const guidIdx = Number(session?.meta?.metaColumnIndexes?.guid);
  if (Number.isInteger(guidIdx) && guidIdx >= 0 && guidIdx < total && normalizeDeckImportRole(roleByColumn?.[guidIdx]) === "front") {
    warnings.push("Warning: GUID metadata column is currently mapped to Front.");
  }
  if (frontCols.length === 1 && Array.isArray(session.dataRows) && session.dataRows.length) {
    const probe = session.dataRows.slice(0, Math.min(50, session.dataRows.length));
    const candidateIdx = frontCols[0];
    let guidLikeHits = 0;
    probe.forEach((cells) => {
      const value = Array.isArray(cells) ? String(cells[candidateIdx] ?? "") : "";
      if (looksGuidLike(value)) guidLikeHits += 1;
    });
    if (guidLikeHits >= Math.max(3, Math.ceil(probe.length * 0.35))) {
      warnings.push("Warning: Front column looks GUID-like in sampled rows. Re-check mapping.");
    }
  }
  return warnings;
}

function validateDeckImportRoleMap(session = null, roleByColumn = {}) {
  const warnings = collectDeckImportRoleWarnings(session, roleByColumn);
  if (!session || typeof session !== "object") {
    return {
      ok: false,
      message: "Import mapping context is missing.",
      warnings
    };
  }
  const total = Math.max(0, Number(session.columnCount) || 0);
  let frontCount = 0;
  let backCount = 0;
  for (let i = 0; i < total; i += 1) {
    const role = normalizeDeckImportRole(roleByColumn?.[i]);
    if (role === "front") frontCount += 1;
    if (role === "back") backCount += 1;
  }

  if (frontCount !== 1 || backCount !== 1) {
    return {
      ok: false,
      message: "Exactly one Front and one Back column are required.",
      warnings
    };
  }

  if (session.requiresMapping && session.columnCount > 2 && !session.profileMatched) {
    const useFirstTwo = refs.deckImportUseFirstTwo instanceof HTMLInputElement && refs.deckImportUseFirstTwo.checked;
    if (!useFirstTwo) {
      let frontIdx = -1;
      let backIdx = -1;
      let hasMetaRole = false;
      for (let i = 0; i < total; i += 1) {
        const role = normalizeDeckImportRole(roleByColumn?.[i]);
        if (role === "front") frontIdx = i;
        if (role === "back") backIdx = i;
        if (role === "tags" || role === "deck" || role === "notetype" || role === "guid") hasMetaRole = true;
      }
      if (frontIdx === 0 && backIdx === 1 && !hasMetaRole) {
        return {
          ok: false,
          message: "Columns > 2 detected. Either map metadata columns, or explicitly enable \"Use first two columns\".",
          warnings
        };
      }
    }
  }

  return {
    ok: true,
    message: "",
    warnings
  };
}

function renderDeckImportWarnings(warnings = []) {
  if (!(refs.deckImportWarnings instanceof HTMLElement)) return;
  const items = Array.isArray(warnings) ? warnings.filter(Boolean) : [];
  if (!items.length) {
    refs.deckImportWarnings.textContent = "";
    refs.deckImportWarnings.setAttribute("hidden", "");
    return;
  }
  refs.deckImportWarnings.textContent = items.map((item) => `- ${item}`).join("\n");
  refs.deckImportWarnings.removeAttribute("hidden");
}

function mapDeckImportRowToRecord(session = null, cells = [], rowNumber = 0, roleByColumn = {}) {
  const total = Math.max(0, Number(session?.columnCount) || 0);
  let front = "";
  let back = "";
  let sourceTagsRaw = "";
  let sourceDeck = "";
  let sourceNotetype = "";
  let sourceGuid = "";
  const sourceExtras = {};
  const columnNames = Array.isArray(session?.columnNames) ? session.columnNames : [];

  for (let i = 0; i < total; i += 1) {
    const value = String(cells?.[i] ?? "");
    const role = normalizeDeckImportRole(roleByColumn?.[i]);
    const columnName = String(columnNames[i] || `Column ${i + 1}`);
    if (role === "ignore") continue;
    if (role === "front") {
      front = value;
      continue;
    }
    if (role === "back") {
      back = value;
      continue;
    }
    if (role === "tags") {
      sourceTagsRaw = value;
      continue;
    }
    if (role === "deck") {
      sourceDeck = value;
      continue;
    }
    if (role === "notetype") {
      sourceNotetype = value;
      continue;
    }
    if (role === "guid") {
      sourceGuid = value;
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(sourceExtras, columnName)) {
      sourceExtras[columnName] = value;
    } else if (Array.isArray(sourceExtras[columnName])) {
      sourceExtras[columnName].push(value);
    } else {
      sourceExtras[columnName] = [sourceExtras[columnName], value];
    }
  }

  const langIdx = headerIndexByAliases(columnNames, IMPORT_LANG_HEADER_ALIASES);
  const frontLangIdx = headerIndexByAliases(columnNames, IMPORT_FRONT_LANG_HEADER_ALIASES);
  const backLangIdx = headerIndexByAliases(columnNames, IMPORT_BACK_LANG_HEADER_ALIASES);

  return {
    front,
    back,
    lang: langIdx >= 0 ? String(cells?.[langIdx] ?? "").trim() : "",
    frontLang: frontLangIdx >= 0 ? String(cells?.[frontLangIdx] ?? "").trim() : "",
    backLang: backLangIdx >= 0 ? String(cells?.[backLangIdx] ?? "").trim() : "",
    source_guid: sourceGuid || String(session?.meta?.defaultGuid || "").trim(),
    source_deck: sourceDeck || String(session?.meta?.defaultDeck || "").trim(),
    source_notetype: sourceNotetype || String(session?.meta?.defaultNotetype || "").trim(),
    source_tags_raw: sourceTagsRaw,
    source_extras: sourceExtras,
    raw_fields: Array.isArray(cells) ? cells.map((cell) => String(cell ?? "")) : [],
    _source_row_number: rowNumber
  };
}

function buildDeckImportPreviewCardObject(session = null, mappedRow = {}, roleByColumn = {}) {
  if (!session || !mappedRow || typeof mappedRow !== "object") return {};
  const front = String(mappedRow.front ?? "");
  const back = String(mappedRow.back ?? "");
  const preview = {
    front,
    back,
    raw_fields: Array.isArray(mappedRow.raw_fields) ? mappedRow.raw_fields : []
  };
  if (mappedRow.source_guid) preview.source_guid = mappedRow.source_guid;
  if (mappedRow.source_deck) preview.source_deck = mappedRow.source_deck;
  if (mappedRow.source_notetype) preview.source_notetype = mappedRow.source_notetype;
  if (mappedRow.source_tags_raw) preview.source_tags = mappedRow.source_tags_raw;
  if (mappedRow.source_extras && Object.keys(mappedRow.source_extras).length) preview.source_extras = mappedRow.source_extras;
  preview.mapping = roleByColumn;
  return preview;
}

function renderDeckImportPreview(session = null) {
  if (!session || !Array.isArray(session.dataRows)) return;
  const totalRows = session.dataRows.length;
  if (refs.deckImportPreviewRaw instanceof HTMLElement && refs.deckImportPreviewJson instanceof HTMLElement && !totalRows) {
    refs.deckImportPreviewRaw.textContent = "No data rows available.";
    refs.deckImportPreviewJson.textContent = "{}";
    if (refs.deckImportPreviewRenderFront instanceof HTMLElement) refs.deckImportPreviewRenderFront.textContent = "";
    if (refs.deckImportPreviewRenderBack instanceof HTMLElement) refs.deckImportPreviewRenderBack.textContent = "";
    return;
  }

  let previewIndex = 0;
  if (refs.deckImportPreviewRow instanceof HTMLInputElement) {
    const requested = Number.parseInt(String(refs.deckImportPreviewRow.value || "1"), 10);
    previewIndex = Number.isInteger(requested) ? requested - 1 : 0;
    if (previewIndex < 0) previewIndex = 0;
    if (previewIndex >= totalRows) previewIndex = totalRows - 1;
    refs.deckImportPreviewRow.value = String(previewIndex + 1);
    refs.deckImportPreviewRow.min = "1";
    refs.deckImportPreviewRow.max = String(Math.max(1, totalRows));
  }
  const cells = session.dataRows[previewIndex] || [];
  const roleByColumn = readDeckImportRoleMapFromUi(session);
  const mapped = mapDeckImportRowToRecord(session, cells, previewIndex + 1, roleByColumn);
  const rawLines = (session.columnNames || []).map((name, idx) => `${idx + 1}. ${name}: ${String(cells[idx] ?? "")}`);
  if (refs.deckImportPreviewRaw instanceof HTMLElement) refs.deckImportPreviewRaw.textContent = rawLines.join("\n");
  if (refs.deckImportPreviewJson instanceof HTMLElement) {
    refs.deckImportPreviewJson.textContent = JSON.stringify(buildDeckImportPreviewCardObject(session, mapped, roleByColumn), null, 2);
  }
  if (refs.deckImportPreviewRenderFront instanceof HTMLElement) refs.deckImportPreviewRenderFront.textContent = String(mapped.front ?? "");
  if (refs.deckImportPreviewRenderBack instanceof HTMLElement) refs.deckImportPreviewRenderBack.textContent = String(mapped.back ?? "");
}

function renderDeckImportMappingUi(session = null, deckStem = "") {
  if (!session || session.kind !== "delimited") return;
  if (!(refs.deckImportMappingPanel instanceof HTMLElement)) return;
  refs.deckImportMappingPanel.removeAttribute("hidden");

  const delimiterLabel = session.delimiter === "\t"
    ? "tab"
    : (session.delimiter === "," ? "comma" : (session.delimiter === ";" ? "semicolon" : (session.delimiter || "none")));
  if (refs.deckImportMetaSummary instanceof HTMLElement) {
    const profileText = session.profileMatched ? ` Profile: ${session.profileMatched}.` : "";
    refs.deckImportMetaSummary.textContent = `Detected ${session.columnCount} columns using ${delimiterLabel} delimiter. Rows: ${session.dataRows.length}.${profileText}`;
  }

  if (refs.deckImportUseFirstTwoWrap instanceof HTMLElement) {
    if (session.columnCount > 2) refs.deckImportUseFirstTwoWrap.removeAttribute("hidden");
    else refs.deckImportUseFirstTwoWrap.setAttribute("hidden", "");
  }
  if (refs.deckImportUseFirstTwo instanceof HTMLInputElement && session.columnCount <= 2) {
    refs.deckImportUseFirstTwo.checked = false;
  }
  if (refs.deckImportProfileName instanceof HTMLInputElement && !refs.deckImportProfileName.value.trim()) {
    const stem = sanitizeDeckFileStem(deckStem || session.deckName || deckNameFromFilename(session.fileName) || "import");
    refs.deckImportProfileName.value = `${stem || "import"}_${session.columnCount}col`;
  }

  const activeRoleByColumn = readDeckImportRoleMapFromUi(session);
  if (refs.deckImportColumnMap instanceof HTMLElement) {
    refs.deckImportColumnMap.innerHTML = "";
    for (let i = 0; i < session.columnCount; i += 1) {
      const row = document.createElement("div");
      row.className = "deck-import-column-row";

      const label = document.createElement("div");
      label.className = "deck-import-column-name";
      label.textContent = session.columnNames[i] || `Column ${i + 1}`;

      const meta = document.createElement("span");
      meta.textContent = ` (col ${i + 1})`;
      label.appendChild(meta);

      const select = document.createElement("select");
      select.className = "deck-import-select";
      select.dataset.colIndex = String(i);
      DECK_IMPORT_ROLE_OPTIONS.forEach((opt) => {
        const option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.label;
        select.appendChild(option);
      });
      select.value = normalizeDeckImportRole(activeRoleByColumn[i]);
      if (refs.deckImportUseFirstTwo instanceof HTMLInputElement && refs.deckImportUseFirstTwo.checked && session.columnCount > 2) {
        select.disabled = true;
      }
      select.addEventListener("change", () => {
        const roleByColumn = readDeckImportRoleMapFromUi(session);
        const validation = validateDeckImportRoleMap(session, roleByColumn);
        renderDeckImportWarnings(validation.warnings);
        renderDeckImportPreview(session);
      });

      row.appendChild(label);
      row.appendChild(select);
      refs.deckImportColumnMap.appendChild(row);
    }
  }

  const validation = validateDeckImportRoleMap(session, readDeckImportRoleMapFromUi(session));
  renderDeckImportWarnings(validation.warnings);
  renderDeckImportPreview(session);
}

function collectMediaRefsFromText(text = "") {
  const raw = String(text || "");
  const audioRefs = [];
  const imageRefs = [];
  raw.replace(/\[sound:([^\]]+)\]/gi, (_, ref) => {
    const value = String(ref || "").trim();
    if (value && !audioRefs.includes(value)) audioRefs.push(value);
    return _;
  });
  raw.replace(/<img\b[^>]*\bsrc\s*=\s*["']?([^"'>\s]+)["']?[^>]*>/gi, (_, ref) => {
    const value = String(ref || "").trim();
    if (value && !imageRefs.includes(value)) imageRefs.push(value);
    return _;
  });
  return {
    audio_refs: audioRefs,
    image_refs: imageRefs
  };
}

function detectDeckImportClozeMarkers(text = "") {
  const markers = [];
  const raw = String(text || "");
  raw.replace(/\{\{c(\d+)::/gi, (_, n) => {
    const marker = `c${String(n || "").trim()}`;
    if (marker !== "c" && !markers.includes(marker)) markers.push(marker);
    return _;
  });
  return markers;
}

function parseDeckImportTags(raw = "") {
  const text = String(raw || "").trim();
  if (!text) return [];
  return text.split(/\s+/).map((tag) => tag.trim()).filter(Boolean);
}

function buildDeckImportRejectsTsv(report = {}, session = null) {
  const rejects = Array.isArray(report?.rejects) ? report.rejects : [];
  if (!rejects.length) return "";
  const columnNames = Array.isArray(session?.columnNames)
    ? session.columnNames
    : (Array.isArray(report?.columnNames) ? report.columnNames : []);
  const esc = (value) => {
    const text = String(value ?? "");
    if (!/[\t\r\n"]/.test(text)) return text;
    return `"${text.replace(/"/g, "\"\"")}"`;
  };
  const header = ["row_number", "reason"].concat(columnNames.map((name, idx) => String(name || `Column ${idx + 1}`)));
  const lines = [header.map(esc).join("\t")];
  rejects.forEach((entry) => {
    const rowValues = [String(entry?.row_number ?? ""), String(entry?.reason ?? "")];
    const fields = Array.isArray(entry?.raw_fields) ? entry.raw_fields : [];
    for (let i = 0; i < columnNames.length; i += 1) rowValues.push(String(fields[i] ?? ""));
    lines.push(rowValues.map(esc).join("\t"));
  });
  return `${lines.join("\n")}\n`;
}

function presentDeckImportRejectsDownload(report = {}, deckStem = "") {
  const rejects = Array.isArray(report?.rejects) ? report.rejects : [];
  if (!rejects.length) return;
  const tsv = buildDeckImportRejectsTsv(report, deckImportSession);
  if (!tsv) return;
  resetDeckImportRejectsLink();
  if (!(refs.deckImportRejectsDownload instanceof HTMLAnchorElement)) return;
  const blob = new Blob([tsv], { type: "text/tab-separated-values;charset=utf-8" });
  deckImportRejectsDownloadUrl = URL.createObjectURL(blob);
  refs.deckImportRejectsDownload.href = deckImportRejectsDownloadUrl;
  refs.deckImportRejectsDownload.download = `${sanitizeDeckFileStem(deckStem || "import") || "import"}_rejects.tsv`;
  refs.deckImportRejectsDownload.hidden = false;
  try {
    refs.deckImportRejectsDownload.click();
  } catch {}
}

function buildCardsFromRowRecords(rows = [], {
  autoDetect = true,
  fallbackLang = "la",
  deckName = "",
  fileName = ""
} = {}) {
  const normalizedRows = Array.isArray(rows) ? rows.filter((row) => row && typeof row === "object") : [];
  const inferredSideLang = autoDetect
    ? {
      front: inferImportSideLanguage(normalizedRows, "front", fallbackLang),
      back: inferImportSideLanguage(normalizedRows, "back", fallbackLang)
    }
    : {
      front: fallbackLang,
      back: fallbackLang
    };
  const prefixRaw = sanitizeDeckFileStem(deckName) || deckNameFromFilename(fileName) || `import_${Date.now()}`;
  const prefix = prefixRaw.toLowerCase();
  const cards = [];
  const rejects = [];
  const rejectReasons = {};
  let generatedCount = 0;

  normalizedRows.forEach((row) => {
    const front = String(row?.front ?? "");
    const back = String(row?.back ?? "");
    if (!front.trim() || !back.trim()) {
      const reason = !front.trim() && !back.trim()
        ? "missing_front_and_back"
        : (!front.trim() ? "missing_front" : "missing_back");
      rejectReasons[reason] = (rejectReasons[reason] || 0) + 1;
      rejects.push({
        row_number: Number(row?._source_row_number) || 0,
        reason,
        raw_fields: Array.isArray(row?.raw_fields) ? row.raw_fields : []
      });
      return;
    }

    generatedCount += 1;
    const id = `${prefix}_${String(generatedCount).padStart(4, "0")}`;
    const frontLang = resolveImportedRowLanguage(row, "front", { autoDetect, fallback: inferredSideLang.front });
    const backLang = resolveImportedRowLanguage(row, "back", { autoDetect, fallback: inferredSideLang.back });
    const card = {
      id,
      front,
      back,
      correct: [back],
      lang: { front: frontLang, back: backLang },
      raw_fields: Array.isArray(row?.raw_fields) ? row.raw_fields : []
    };

    if (row?.source_guid) card.source_guid = String(row.source_guid);
    if (row?.source_deck) card.source_deck = String(row.source_deck);
    if (row?.source_notetype) card.source_notetype = String(row.source_notetype);
    const sourceTags = parseDeckImportTags(row?.source_tags_raw || row?.source_tags || "");
    if (sourceTags.length) card.source_tags = sourceTags;
    if (row?.source_extras && typeof row.source_extras === "object" && Object.keys(row.source_extras).length) {
      card.source_extras = row.source_extras;
    }

    const media = collectMediaRefsFromText(`${front}\n${back}\n${(row?.raw_fields || []).join("\n")}`);
    if (media.audio_refs.length || media.image_refs.length) card.media = media;
    const clozeMarkers = detectDeckImportClozeMarkers(`${front}\n${back}`);
    if (clozeMarkers.length) card.cloze_markers = clozeMarkers;

    cards.push(card);
  });

  return {
    cards,
    report: {
      importedCount: cards.length,
      rejectedCount: rejects.length,
      rejectReasons,
      rejects
    }
  };
}

function buildCardsFromDeckImportSession(session = null, {
  roleByColumn = {},
  language = "auto",
  deckName = "",
  fileName = ""
} = {}) {
  if (!session || typeof session !== "object") {
    return { cards: [], report: { importedCount: 0, rejectedCount: 0, rejects: [], rejectReasons: {} }, message: "Import session is missing." };
  }
  if (session.kind === "native-json") {
    return {
      cards: Array.isArray(session.cards) ? session.cards : [],
      report: {
        importedCount: Array.isArray(session.cards) ? session.cards.length : 0,
        rejectedCount: 0,
        rejects: [],
        rejectReasons: {}
      },
      message: ""
    };
  }

  if (session.kind === "json-rows" || session.kind === "pair") {
    const autoDetect = isAutoImportLanguageMode(language);
    const fallbackLang = normalizeImportFallbackLang(language);
    const result = buildCardsFromRowRecords(Array.isArray(session.rows) ? session.rows : [], {
      autoDetect,
      fallbackLang,
      deckName: deckName || session.deckName,
      fileName: fileName || session.fileName
    });
    return {
      ...result,
      message: result.cards.length ? "" : "No importable rows found."
    };
  }

  if (session.kind !== "delimited") {
    return { cards: [], report: { importedCount: 0, rejectedCount: 0, rejects: [], rejectReasons: {} }, message: "Unsupported import format." };
  }

  const appliedRoleByColumn = normalizeDeckImportRoleByColumn(
    roleByColumn && Object.keys(roleByColumn).length ? roleByColumn : readDeckImportRoleMapFromUi(session),
    session.columnCount
  );
  const mappedRows = [];
  (session.dataRows || []).forEach((cells, index) => {
    mappedRows.push(mapDeckImportRowToRecord(session, cells, index + 1, appliedRoleByColumn));
  });

  const autoDetect = isAutoImportLanguageMode(language);
  const fallbackLang = normalizeImportFallbackLang(language);
  const conversion = buildCardsFromRowRecords(mappedRows, {
    autoDetect,
    fallbackLang,
    deckName: deckName || session.deckName,
    fileName: fileName || session.fileName
  });

  conversion.report = {
    ...conversion.report,
    rawRowCount: (session.dataRows || []).length,
    delimiter: session.delimiter || "",
    columnCount: session.columnCount || 0,
    columnNames: session.columnNames || []
  };
  return {
    ...conversion,
    warnings: collectDeckImportRoleWarnings(session, appliedRoleByColumn),
    message: conversion.cards.length ? "" : "No importable rows found after mapping."
  };
}

function extractRowsFromJsonPayload(payload) {
  const deckArray = Array.isArray(payload)
    ? payload
    : (payload && typeof payload === "object" && Array.isArray(payload.cards) ? payload.cards : []);
  if (!Array.isArray(deckArray) || !deckArray.length) return [];

  const rows = [];
  deckArray.forEach((entry) => {
    if (entry == null) return;
    if (Array.isArray(entry) && entry.length >= 2) {
      const front = String(entry[0] ?? "").trim();
      const back = String(entry[1] ?? "").trim();
      if (front && back) rows.push({ front, back });
      return;
    }
    if (typeof entry === "string") {
      const pair = parsePairLine(entry);
      if (pair) rows.push(pair);
      return;
    }
    if (typeof entry === "object") {
      const obj = entry;
      const front = readImportedObjectCardFaceText(obj, "front");
      const back = readImportedObjectCardFaceText(obj, "back");
      const lang = obj.lang ?? obj.language ?? obj.tts_lang ?? "";
      const frontLang = obj.front_lang ?? obj.frontLang ?? obj.lang_front ?? obj.question_lang ?? obj.langFront ?? "";
      const backLang = obj.back_lang ?? obj.backLang ?? obj.lang_back ?? obj.answer_lang ?? obj.langBack ?? "";
      if (front && back) rows.push({ front, back, lang, frontLang, backLang });
    }
  });
  return rows;
}

function normalizeImportedJsonObjectCards(rawCards = [], {
  deckName = "",
  fileName = "",
  autoDetect = true,
  fallbackLang = "la"
} = {}) {
  if (!Array.isArray(rawCards) || !rawCards.length) return [];
  const sourceCards = rawCards.filter((card) => card != null);
  if (!sourceCards.length) return [];
  if (!sourceCards.every((card) => isImportableObjectCard(card))) return [];

  const normalizedFallback = normalizeImportFallbackLang(fallbackLang);
  const rowsForInference = sourceCards
    .map((card) => {
      const front = readImportedObjectCardFaceText(card, "front");
      const back = readImportedObjectCardFaceText(card, "back");
      const frontLang = readImportedExplicitRowLanguage({ ...card, front, back }, "front");
      const backLang = readImportedExplicitRowLanguage({ ...card, front, back }, "back");
      return { front, back, frontLang, backLang, lang: card?.lang ?? "" };
    })
    .filter((row) => row.front || row.back);

  const inferredSideLang = autoDetect
    ? {
      front: inferImportSideLanguage(rowsForInference, "front", normalizedFallback),
      back: inferImportSideLanguage(rowsForInference, "back", normalizedFallback)
    }
    : {
      front: normalizedFallback,
      back: normalizedFallback
    };

  const prefixRaw = sanitizeDeckFileStem(deckName) || deckNameFromFilename(fileName) || `import_${Date.now()}`;
  const prefix = prefixRaw.toLowerCase();
  const usedIds = new Set();
  let generatedCount = 0;

  const nextGeneratedId = () => {
    let id = "";
    do {
      generatedCount += 1;
      id = `${prefix}_${String(generatedCount).padStart(4, "0")}`;
    } while (usedIds.has(id));
    usedIds.add(id);
    return id;
  };

  return sourceCards.map((card) => {
    const cloned = { ...card };
    const front = readImportedObjectCardFaceText(cloned, "front");
    const back = readImportedObjectCardFaceText(cloned, "back");

    if (front && (cloned.front == null || !String(cloned.front).trim())) cloned.front = front;
    if (back && (cloned.back == null || !String(cloned.back).trim())) cloned.back = back;

    let id = String(cloned.id ?? "").trim();
    if (!id || usedIds.has(id)) id = nextGeneratedId();
    else usedIds.add(id);
    cloned.id = id;

    if (cloned.correct == null && back) cloned.correct = [back];

    if (!hasImportedCardLang(cloned)) {
      const frontLang = resolveImportedRowLanguage({ ...cloned, front, back }, "front", {
        autoDetect,
        fallback: inferredSideLang.front
      });
      const backLang = resolveImportedRowLanguage({ ...cloned, front, back }, "back", {
        autoDetect,
        fallback: inferredSideLang.back
      });
      const lang = buildCardLangObject(frontLang, backLang);
      if (lang) cloned.lang = lang;
    }

    return cloned;
  });
}

function resolveImportedRowLanguage(row = {}, side = "front", { autoDetect = true, fallback = "la" } = {}) {
  const normalizedFallback = normalizeImportFallbackLang(fallback);
  const explicit = readImportedExplicitRowLanguage(row, side);
  if (explicit) return explicit;

  const content = side === "front" ? row?.front : row?.back;
  if (autoDetect) return detectImportLanguage(content, normalizedFallback);
  return normalizedFallback;
}

function convertImportedFileToCards({ fileName = "", rawText = "", language = "auto", deckName = "" } = {}) {
  const session = buildDeckImportSession({
    fileName,
    rawText,
    language,
    deckName
  });
  const conversion = buildCardsFromDeckImportSession(session, {
    roleByColumn: session?.roleByColumn || {},
    language,
    deckName,
    fileName
  });
  return Array.isArray(conversion?.cards) ? conversion.cards : [];
}

function seedImportedDeckFsrs(deckPath, cards = []) {
  const deckKey = normalizeDeckKey(deckPath);
  if (!deckKey || !Array.isArray(cards) || !cards.length) return;
  const cardsByDeck = normalizeCardsByDeck(safeParseStorageJson(STORAGE_CARDS, {}));
  const deckStore = cardsByDeck[deckKey] && typeof cardsByDeck[deckKey] === "object" ? cardsByDeck[deckKey] : {};
  const nowIso = new Date().toISOString();

  cards.forEach((card) => {
    const id = String(card?.id ?? "").trim();
    if (!id || deckStore[id]) return;
    deckStore[id] = {
      due: nowIso,
      stability: 0,
      difficulty: 0,
      reps: 0,
      lapses: 0,
      state: 0,
      learning_steps: 0,
      scheduled_days: 0,
      elapsed_days: 0,
      last_review: null
    };
  });

  cardsByDeck[deckKey] = deckStore;
  try {
    localStorage.setItem(STORAGE_CARDS, JSON.stringify(cardsByDeck));
  } catch {}
}

function pinImportedDeckAsRecent(deckPath) {
  const deckKey = normalizeDeckKey(deckPath);
  if (!deckKey || deckKey.toLowerCase() === "default") return;
  const recent = loadRecentDeckPaths().filter((entry) => normalizeDeckKey(entry) !== deckKey);
  const next = [deckKey].concat(recent).slice(0, 12);
  try {
    localStorage.setItem(STORAGE_RECENT_DECKS, JSON.stringify(next));
    localStorage.setItem(STORAGE_DECK_PATH, deckKey);
  } catch {}
}

function buildRenamedDeckPath(oldDeckPath, newDeckName) {
  const oldPath = normalizeDeckPathForSave(oldDeckPath);
  if (!oldPath) return "";
  const slash = oldPath.lastIndexOf("/");
  const dir = slash >= 0 ? oldPath.slice(0, slash + 1) : "";
  const oldBase = slash >= 0 ? oldPath.slice(slash + 1) : oldPath;
  const oldStem = oldBase.replace(/\.json$/i, "");
  const nextStem = sanitizeDeckFileStem(newDeckName) || oldStem;
  return `${dir}${nextStem}.json`;
}

async function persistDeckRename(oldDeckPath, newDeckPath) {
  const oldPath = normalizeDeckPathForSave(oldDeckPath);
  const nextPath = normalizeDeckPathForSave(newDeckPath);
  if (!oldPath || !nextPath) return { ok: false, message: "Deck path is not editable." };
  return writeDeckViaApi("/deck/rename", {
    old_path: oldPath,
    new_path: nextPath
  });
}

function buildArchivedDeckPath(deckPath) {
  const normalizedPath = normalizeDeckPathForSave(deckPath);
  if (!normalizedPath) return "";
  const tail = String(normalizedPath).replace(/\\/g, "/").split("/").pop() || "deck.json";
  const stem = tail.replace(/\.json$/i, "");
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const archiveStem = sanitizeDeckFileStem(`${stem}_${stamp}`) || `deck_${stamp}`;
  return `decks/_deleted/${archiveStem}.json`;
}

async function persistDeckRemove(deckPath) {
  const normalizedPath = normalizeDeckPathForSave(deckPath);
  if (!normalizedPath) return { ok: false, message: "Deck path is not editable." };
  const archiveViaRename = async () => {
    const archivedPath = buildArchivedDeckPath(normalizedPath);
    if (!archivedPath) return { ok: false, message: "Deck path is not editable." };
    const renameResult = await persistDeckRename(normalizedPath, archivedPath);
    if (renameResult.ok) {
      return {
        ...renameResult,
        archived: true,
        archived_path: archivedPath,
        message: ""
      };
    }
    return renameResult;
  };

  const removeSupported = await probeDeckWriterRemoveSupport();
  if (removeSupported === false) return archiveViaRename();

  const removeResult = await writeDeckViaApi("/deck/remove", {
    deck_path: normalizedPath
  }, { queueOnFailure: false });
  if (removeResult.ok) {
    deckWriterRemoveSupport = true;
    return removeResult;
  }

  if (Number(removeResult.status) === 404) {
    deckWriterRemoveSupport = false;
    const archivedResult = await archiveViaRename();
    if (archivedResult.ok) return archivedResult;
    return {
      ...archivedResult,
      message: archivedResult.message || removeResult.message || "Delete failed."
    };
  }

  if (!removeResult.ok) {
    return writeDeckViaApi("/deck/remove", {
      deck_path: normalizedPath
    });
  }
  return removeResult;
}

async function persistDeckCreate(deckPath, cards = [], { overwrite = false, allowEmpty = false } = {}) {
  const normalizedPath = normalizeDeckPathForSave(deckPath);
  if (!normalizedPath) return { ok: false, message: "Deck path is not editable." };
  const cleanCards = Array.isArray(cards) ? cards.filter((card) => card && typeof card === "object") : [];
  if (!cleanCards.length && !allowEmpty) return { ok: false, message: "No cards to import." };
  return writeDeckViaApi("/deck/create", {
    deck_path: normalizedPath,
    cards: cleanCards,
    overwrite: !!overwrite
  });
}

function moveDeckKeyInStores(oldDeckKey, newDeckKey, newDeckPath) {
  const fromKey = normalizeDeckKey(oldDeckKey);
  const toKey = normalizeDeckKey(newDeckKey);
  if (!fromKey || !toKey || fromKey === toKey) return;

  const cardsByDeck = normalizeCardsByDeck(safeParseStorageJson(STORAGE_CARDS, {}));
  if (cardsByDeck?.[fromKey] && typeof cardsByDeck[fromKey] === "object") {
    cardsByDeck[toKey] = { ...(cardsByDeck[toKey] || {}), ...(cardsByDeck[fromKey] || {}) };
    delete cardsByDeck[fromKey];
    try {
      localStorage.setItem(STORAGE_CARDS, JSON.stringify(cardsByDeck));
    } catch {}
  }

  const logsByDeck = normalizeLogsByDeck(safeParseStorageJson(STORAGE_LOGS, {}));
  if (Array.isArray(logsByDeck?.[fromKey])) {
    const merged = []
      .concat(Array.isArray(logsByDeck[toKey]) ? logsByDeck[toKey] : [])
      .concat(logsByDeck[fromKey]);
    logsByDeck[toKey] = merged;
    delete logsByDeck[fromKey];
    try {
      localStorage.setItem(STORAGE_LOGS, JSON.stringify(logsByDeck));
    } catch {}
  }

  const recent = loadRecentDeckPaths();
  const nextRecent = [];
  const seen = new Set();
  recent.forEach((entry) => {
    const normalized = normalizeDeckKey(entry) === fromKey ? toKey : normalizeDeckKey(entry);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    nextRecent.push(normalized);
  });
  if (!seen.has(toKey)) nextRecent.unshift(toKey);
  try {
    localStorage.setItem(STORAGE_RECENT_DECKS, JSON.stringify(nextRecent));
  } catch {}

  const currentDeck = normalizeDeckKey(localStorage.getItem(STORAGE_DECK_PATH) || "");
  if (currentDeck === fromKey) {
    localStorage.setItem(STORAGE_DECK_PATH, normalizeDeckKey(newDeckPath || toKey));
  }

  if (deckPreviewCache.has(fromKey)) {
    const cached = deckPreviewCache.get(fromKey);
    deckPreviewCache.set(toKey, { ...(cached || {}), deckPath: normalizeDeckKey(newDeckPath || toKey) });
    deckPreviewCache.delete(fromKey);
  }
  if (deckPreviewLoading.has(fromKey)) {
    deckPreviewLoading.delete(fromKey);
    deckPreviewLoading.add(toKey);
  }

  if (uiState.expandedDeckIds.has(fromKey)) {
    uiState.expandedDeckIds.delete(fromKey);
    uiState.expandedDeckIds.add(toKey);
  }
  if (uiState.inlineCardTypeDeckId === fromKey) {
    uiState.inlineCardTypeDeckId = toKey;
  }
  if (uiState.inlineCardDraftByDeck.has(fromKey)) {
    const draft = uiState.inlineCardDraftByDeck.get(fromKey);
    uiState.inlineCardDraftByDeck.delete(fromKey);
    uiState.inlineCardDraftByDeck.set(toKey, draft);
  }
  if (uiState.deckStatusById.has(fromKey)) {
    uiState.deckStatusById.set(toKey, uiState.deckStatusById.get(fromKey));
    uiState.deckStatusById.delete(fromKey);
  }
  moveDeckDescriptionKey(fromKey, toKey);

  missingDeckKeys.delete(fromKey);
  missingDeckKeys.delete(toKey);
}

function resolveDeckPathForDeck(deck) {
  const deckKey = normalizeDeckKey(deck?.path || deck?.id || "");
  if (!deckKey) return "";
  if (deckKey.startsWith("gen:")) return "";
  if (deckKey.toLowerCase() === "default") {
    const currentDeck = normalizeDeckKey(localStorage.getItem(STORAGE_DECK_PATH) || "");
    return currentDeck && currentDeck.toLowerCase() !== "default" ? currentDeck : "";
  }
  return deckKey;
}

function getDeckById(deckId) {
  const key = normalizeDeckKey(deckId);
  return (homeData?.decksDue || []).find((deck) => normalizeDeckKey(deck.id) === key) || null;
}

function setDeckStatus(deckId, text, tone = "info") {
  const key = normalizeDeckKey(deckId);
  if (!text) {
    uiState.deckStatusById.delete(key);
    return;
  }
  // Keep errors in the global alerts system rather than inline row prompts.
  if (tone === "error") {
    uiState.deckStatusById.delete(key);
    const message = String(text || "");
    if (/\bqueued\b/i.test(message)) showHomeWarning("Deck Write Queued", message);
    else showHomeError("Deck Action Failed", message);
    return;
  }
  if (tone === "warning") {
    uiState.deckStatusById.delete(key);
    showHomeWarning("Deck Notice", text);
    return;
  }
  uiState.deckStatusById.set(key, { text: String(text), tone });
}

function removeCardFromFsrsStores(cardId, deckCandidates = []) {
  const cardKey = String(cardId);
  const deckKeys = [...new Set(
    deckCandidates
      .map((key) => normalizeDeckKey(key))
      .filter(Boolean)
      .concat(["default"])
  )];

  const cardsByDeck = normalizeCardsByDeck(safeParseStorageJson(STORAGE_CARDS, {}));
  deckKeys.forEach((deckKey) => {
    const deck = cardsByDeck?.[deckKey];
    if (!deck || typeof deck !== "object") return;
    if (cardKey in deck) delete deck[cardKey];
  });
  try {
    localStorage.setItem(STORAGE_CARDS, JSON.stringify(cardsByDeck));
  } catch {}

  const logsByDeck = normalizeLogsByDeck(safeParseStorageJson(STORAGE_LOGS, {}));
  deckKeys.forEach((deckKey) => {
    const logs = logsByDeck?.[deckKey];
    if (!Array.isArray(logs)) return;
    logsByDeck[deckKey] = logs.filter((log) => {
      const candidate = log?.card_id ?? log?.id ?? log?.cardId ?? log?.card ?? null;
      return String(candidate) !== cardKey;
    });
  });
  try {
    localStorage.setItem(STORAGE_LOGS, JSON.stringify(logsByDeck));
  } catch {}
}

function fsrsLogCardId(log) {
  const candidate = log?.card_id ?? log?.id ?? log?.cardId ?? log?.card ?? null;
  if (candidate == null) return "";
  return String(candidate);
}

function canonicalDeckPathForStorageKey(deckKey) {
  const key = normalizeDeckKey(deckKey);
  if (!key || key.toLowerCase() === "default" || key.startsWith("gen:")) return "";
  return normalizeDeckPathForSave(key) || key;
}

function canonicalDeckPathLower(deckKey) {
  const canonical = canonicalDeckPathForStorageKey(deckKey);
  return canonical ? String(canonical).toLowerCase() : "";
}

function findDeckStorageKeyByCanonicalPath(store, canonicalPath) {
  if (!store || typeof store !== "object") return "";
  const target = String(canonicalPath || "").toLowerCase();
  if (!target) return "";
  const keys = Object.keys(store);
  for (const key of keys) {
    if (canonicalDeckPathLower(key) === target) return key;
  }
  return "";
}

function collectPreviewCardIds(previewData) {
  const ids = new Set();
  const cards = Array.isArray(previewData?.cards) ? previewData.cards : [];
  cards.forEach((card) => {
    const id = String(card?.id ?? "").trim();
    if (id) ids.add(id);
  });
  return ids;
}

async function loadDeckPreviewData(deckKey, deckPath) {
  const key = normalizeDeckKey(deckKey);
  const normalizedPath = normalizeDeckPathForSave(deckPath);
  const cached = deckPreviewCache.get(key);
  if (cached && Array.isArray(cached.cards)) {
    const cachedPath = normalizeDeckPathForSave(cached.deckPath || "");
    if (!normalizedPath || !cachedPath || cachedPath === normalizedPath) {
      return cached;
    }
  }
  const previewData = await loadDeckCardsForPreview(deckPath);
  const payload = {
    deckPath,
    cards: Array.isArray(previewData?.cards) ? previewData.cards : [],
    rawCards: Array.isArray(previewData?.rawCards) ? previewData.rawCards : [],
    rawById: previewData?.rawById instanceof Map ? previewData.rawById : new Map(),
    error: ""
  };
  deckPreviewCache.set(key, payload);
  return payload;
}

function pruneDeletedDeckFromStores(deckKey) {
  const key = normalizeDeckKey(deckKey);
  if (!key || key.toLowerCase() === "default" || key.startsWith("gen:")) return;

  const cardsByDeck = normalizeCardsByDeck(safeParseStorageJson(STORAGE_CARDS, {}));
  if (cardsByDeck && typeof cardsByDeck === "object" && key in cardsByDeck) {
    delete cardsByDeck[key];
    try {
      localStorage.setItem(STORAGE_CARDS, JSON.stringify(cardsByDeck));
    } catch {}
  }

  const logsByDeck = normalizeLogsByDeck(safeParseStorageJson(STORAGE_LOGS, {}));
  if (logsByDeck && typeof logsByDeck === "object" && key in logsByDeck) {
    delete logsByDeck[key];
    try {
      localStorage.setItem(STORAGE_LOGS, JSON.stringify(logsByDeck));
    } catch {}
  }

  const recent = loadRecentDeckPaths().filter((path) => normalizeDeckKey(path) !== key);
  try {
    localStorage.setItem(STORAGE_RECENT_DECKS, JSON.stringify(recent));
  } catch {}

  const currentDeck = normalizeDeckKey(localStorage.getItem(STORAGE_DECK_PATH) || "");
  if (currentDeck === key) {
    if (recent.length) localStorage.setItem(STORAGE_DECK_PATH, recent[0]);
    else localStorage.removeItem(STORAGE_DECK_PATH);
  }

  setDeckDescription(key, "");

  missingDeckKeys.add(key);
  deckPreviewCache.delete(key);
  deckPreviewLoading.delete(key);
  uiState.expandedDeckIds.delete(key);
  if (uiState.inlineCardTypeDeckId === key) uiState.inlineCardTypeDeckId = "";
  if (uiState.inlineCardDraftByDeck.has(key)) uiState.inlineCardDraftByDeck.delete(key);
  uiState.deckStatusById.delete(key);
}

async function loadDeckCardsForPreview(deckPath) {
  const localEntry = getLocalImportedDeckEntry(deckPath);
  if (localEntry) {
    return normalizeDeckPreviewCards(parseDeckPayloadCards(localEntry.cards), localEntry.path);
  }
  const response = await fetch(deckPath, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load deck (${response.status}).`);
  }
  const payload = await response.json();
  return normalizeDeckPreviewCards(parseDeckPayloadCards(payload), deckPath);
}

async function listDeckPathsFromServer() {
  const localPaths = listLocalImportedDeckPaths();
  try {
    const response = await fetch("decks/manifest.json", { cache: "no-store" });
    if (response.ok) {
      const data = await response.json();
      const rawList = Array.isArray(data)
        ? data
        : (Array.isArray(data?.decks) ? data.decks : []);
      const paths = rawList
        .map((entry) => {
          if (typeof entry === "string") return entry;
          if (entry && typeof entry === "object") return String(entry.path || entry.name || "").trim();
          return "";
        })
        .map((href) => normalizeDeckPathForSave(href.includes("/") ? href : `decks/${href}`))
        .filter((href) => href && /\.json$/i.test(href) && !isExcludedDeckKey(href));
      const seen = new Set();
      const unique = [];
      paths.forEach((path) => {
        const key = String(path).toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        unique.push(path);
      });
      localPaths.forEach((path) => {
        const key = String(path).toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        unique.push(path);
      });
      return new Set(unique);
    }
  } catch {
  }
  try {
    const response = await fetch("decks/", { cache: "no-store" });
    if (!response.ok) return null;
    const text = await response.text();
    const doc = new DOMParser().parseFromString(text, "text/html");
    const anchors = Array.from(doc.querySelectorAll("a"));
    const paths = anchors
      .map((a) => a.getAttribute("href") || "")
      .map((href) => decodeURIComponent(href).trim())
      .filter((href) => href && !href.endsWith("/") && !href.startsWith("?") && /\.json$/i.test(href) && !isExcludedDeckKey(href))
      .map((href) => normalizeDeckPathForSave(href.includes("/") ? href : `decks/${href}`))
      .filter(Boolean);
    const seen = new Set();
    const unique = [];
    paths.forEach((path) => {
      const key = String(path).toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      unique.push(path);
    });
    localPaths.forEach((path) => {
      const key = String(path).toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      unique.push(path);
    });
    return new Set(unique);
  } catch {
    if (localPaths.length) return new Set(localPaths);
    return null;
  }
}

function replaceKnownServerDeckPaths(paths) {
  if (!(paths instanceof Set)) return false;

  const nextByLower = new Map();
  paths.forEach((path) => {
    const normalized = normalizeDeckPathForSave(path);
    if (!normalized || isExcludedDeckKey(normalized)) return;
    const key = String(normalized).toLowerCase();
    if (!nextByLower.has(key)) nextByLower.set(key, normalized);
  });

  const currentByLower = new Map();
  knownServerDeckPaths.forEach((path) => {
    currentByLower.set(String(path).toLowerCase(), path);
  });

  let changed = false;
  if (currentByLower.size !== nextByLower.size) {
    changed = true;
  } else {
    for (const [key, value] of nextByLower.entries()) {
      if (currentByLower.get(key) !== value) {
        changed = true;
        break;
      }
    }
  }

  if (changed) {
    knownServerDeckPaths.clear();
    nextByLower.forEach((path) => knownServerDeckPaths.add(path));
  }

  for (const missing of [...missingDeckKeys]) {
    if (nextByLower.has(String(missing).toLowerCase())) {
      missingDeckKeys.delete(missing);
      changed = true;
    }
  }

  return changed;
}

async function syncDeckPathsFromServer(options = {}) {
  const rerender = options?.rerender !== false;
  if (syncDeckPathsPromise) return syncDeckPathsPromise;

  syncDeckPathsPromise = (async () => {
    const available = await listDeckPathsFromServer();
    if (!(available instanceof Set)) return false;
    const changed = replaceKnownServerDeckPaths(available);
    if (changed && rerender) {
      refreshHomeData();
      renderHome();
    }
    return changed;
  })().finally(() => {
    syncDeckPathsPromise = null;
  });

  return syncDeckPathsPromise;
}

async function reconcileDueDecksWithSource(force = false) {
  const now = Date.now();
  if (!force && now - lastReconcileDueDecksAt < RECONCILE_DUE_DECKS_COOLDOWN_MS) return false;
  if (reconcileDueDecksPromise) return reconcileDueDecksPromise;

  reconcileDueDecksPromise = (async () => {
    const candidateDecks = Array.isArray(homeData?.decksDue) ? homeData.decksDue : [];
    if (!candidateDecks.length) {
      lastReconcileDueDecksAt = Date.now();
      return false;
    }

    const cardsByDeck = normalizeCardsByDeck(safeParseStorageJson(STORAGE_CARDS, {}));
    const logsByDeck = normalizeLogsByDeck(safeParseStorageJson(STORAGE_LOGS, {}));
    const cardKeys = Object.keys(cardsByDeck || {});
    const logKeys = Object.keys(logsByDeck || {});
    const nowIso = new Date().toISOString();
    let cardsChanged = false;
    let logsChanged = false;
    let storesPruned = false;

    for (const deck of candidateDecks) {
      const deckKey = normalizeDeckKey(deck?.id || deck?.path || "");
      if (!deckKey || deckKey.toLowerCase() === "default" || deckKey.startsWith("gen:") || isExcludedDeckKey(deckKey)) continue;

      const resolved = resolveDeckPathForDeck(deck);
      const canonicalPathRaw = normalizeDeckPathForSave(resolved || deckKey);
      if (!canonicalPathRaw) continue;
      const canonicalPathLower = String(canonicalPathRaw).toLowerCase();
      const canonicalCardsKey = findDeckStorageKeyByCanonicalPath(cardsByDeck, canonicalPathRaw);
      const canonicalLogsKey = findDeckStorageKeyByCanonicalPath(logsByDeck, canonicalPathRaw);
      const canonicalStorageKey = canonicalCardsKey || canonicalLogsKey || canonicalPathRaw;

      let previewData = null;
      try {
        previewData = await loadDeckPreviewData(deckKey, canonicalPathRaw);
      } catch (error) {
        const message = safeText(error?.message, "");
        if (/404|not found/i.test(message)) {
          pruneDeletedDeckFromStores(deckKey);
          storesPruned = true;
        }
        continue;
      }

      const liveIds = collectPreviewCardIds(previewData);
      if (!liveIds.size) continue;

      const candidateDeckKeys = new Set([deckKey, canonicalPathRaw, canonicalStorageKey]);
      cardKeys.forEach((key) => {
        if (canonicalDeckPathLower(key) === canonicalPathLower) {
          candidateDeckKeys.add(normalizeDeckKey(key));
        }
      });
      logKeys.forEach((key) => {
        if (canonicalDeckPathLower(key) === canonicalPathLower) {
          candidateDeckKeys.add(normalizeDeckKey(key));
        }
      });

      const canonicalDeck = (cardsByDeck?.[canonicalStorageKey] && typeof cardsByDeck[canonicalStorageKey] === "object")
        ? { ...cardsByDeck[canonicalStorageKey] }
        : {};
      candidateDeckKeys.forEach((key) => {
        const source = cardsByDeck?.[key];
        if (!source || typeof source !== "object") return;
        Object.entries(source).forEach(([id, state]) => {
          if (!(id in canonicalDeck)) canonicalDeck[id] = state;
        });
        if (key !== canonicalStorageKey && key in cardsByDeck) {
          delete cardsByDeck[key];
          cardsChanged = true;
        }
      });

      let removedAnyCards = false;
      liveIds.forEach((id) => {
        const cardId = String(id || "").trim();
        if (!cardId || cardId in canonicalDeck) return;
        canonicalDeck[cardId] = {
          due: nowIso,
          stability: 0,
          difficulty: 0,
          reps: 0,
          lapses: 0,
          state: 0,
          learning_steps: 0,
          scheduled_days: 0,
          elapsed_days: 0,
          last_review: null
        };
        cardsChanged = true;
      });
      Object.keys(canonicalDeck).forEach((id) => {
        if (!liveIds.has(String(id))) {
          delete canonicalDeck[id];
          removedAnyCards = true;
        }
      });
      if (removedAnyCards) cardsChanged = true;
      cardsByDeck[canonicalStorageKey] = canonicalDeck;

      let canonicalLogs = Array.isArray(logsByDeck?.[canonicalStorageKey]) ? logsByDeck[canonicalStorageKey].slice() : [];
      candidateDeckKeys.forEach((key) => {
        if (key === canonicalStorageKey) return;
        const sourceLogs = logsByDeck?.[key];
        if (Array.isArray(sourceLogs) && sourceLogs.length) {
          canonicalLogs = canonicalLogs.concat(sourceLogs);
          logsChanged = true;
        }
        if (key in logsByDeck) {
          delete logsByDeck[key];
          logsChanged = true;
        }
      });

      if (canonicalLogs.length) {
        const filteredLogs = canonicalLogs.filter((log) => {
          const cardId = fsrsLogCardId(log);
          return !cardId || liveIds.has(cardId);
        });
        if (filteredLogs.length !== canonicalLogs.length) logsChanged = true;
        logsByDeck[canonicalStorageKey] = filteredLogs;
      } else if (!(canonicalStorageKey in logsByDeck)) {
        logsByDeck[canonicalStorageKey] = [];
      }
    }

    if (cardsChanged) {
      try {
        localStorage.setItem(STORAGE_CARDS, JSON.stringify(cardsByDeck));
      } catch {}
    }
    if (logsChanged) {
      try {
        localStorage.setItem(STORAGE_LOGS, JSON.stringify(logsByDeck));
      } catch {}
    }

    if (cardsChanged || logsChanged || storesPruned) {
      refreshHomeData();
      renderHome();
    }

    lastReconcileDueDecksAt = Date.now();
    return cardsChanged || logsChanged || storesPruned;
  })().finally(() => {
    reconcileDueDecksPromise = null;
  });

  return reconcileDueDecksPromise;
}

async function pruneMissingDecks(force = false) {
  const now = Date.now();
  if (!force && now - lastPruneMissingDecksAt < 8000) return;
  if (pruneMissingDecksPromise) return pruneMissingDecksPromise;

  pruneMissingDecksPromise = (async () => {
    const rows = Array.isArray(homeData?.decksDue) ? homeData.decksDue : [];
    const candidates = rows
      .map((deck) => ({
        key: normalizeDeckKey(deck.id),
        path: normalizeDeckPathForSave(resolveDeckPathForDeck(deck))
      }))
      .filter((item) => item.path && !missingDeckKeys.has(item.key));
    if (!candidates.length) {
      lastPruneMissingDecksAt = Date.now();
      return;
    }

    const available = await listDeckPathsFromServer();
    if (!(available instanceof Set) || !available.size) {
      lastPruneMissingDecksAt = Date.now();
      return;
    }
    const availableLower = new Set(
      [...available].map((path) => String(path).toLowerCase())
    );

    const missing = candidates
      .filter((item) => !availableLower.has(String(item.path).toLowerCase()))
      .map((item) => item.key);
    if (missing.length) {
      missing.forEach((deckKey) => pruneDeletedDeckFromStores(deckKey));
      refreshHomeData();
      renderHome();
    }
    lastPruneMissingDecksAt = Date.now();
  })().finally(() => {
    pruneMissingDecksPromise = null;
  });

  return pruneMissingDecksPromise;
}

async function ensureDeckPreviewLoaded(deckId) {
  const key = normalizeDeckKey(deckId);
  if (deckPreviewCache.has(key) || deckPreviewLoading.has(key)) return;
  const deck = getDeckById(key);
  if (!deck) return;

  const deckPath = normalizeDeckPathForSave(resolveDeckPathForDeck(deck));
  if (!deckPath) {
    deckPreviewCache.set(key, {
      deckPath: "",
      cards: [],
      rawCards: [],
      rawById: new Map(),
      error: ""
    });
    showHomeWarning("Deck Preview", "Preview is unavailable for this deck.");
    renderDecksDue();
    return;
  }

  deckPreviewLoading.add(key);
  renderDecksDue();
  try {
    const previewData = await loadDeckCardsForPreview(deckPath);
    deckPreviewCache.set(key, {
      deckPath,
      cards: Array.isArray(previewData?.cards) ? previewData.cards : [],
      rawCards: Array.isArray(previewData?.rawCards) ? previewData.rawCards : [],
      rawById: previewData?.rawById instanceof Map ? previewData.rawById : new Map(),
      error: ""
    });
  } catch (error) {
    const message = safeText(error?.message, DECK_PREVIEW_ERROR_FALLBACK);
    if (/404|not found/i.test(message)) {
      pruneDeletedDeckFromStores(key);
      refreshHomeData();
      renderHome();
      return;
    }
    showHomeError("Deck Preview Failed", message);
    deckPreviewCache.set(key, {
      deckPath,
      cards: [],
      rawCards: [],
      rawById: new Map(),
      error: ""
    });
  } finally {
    deckPreviewLoading.delete(key);
    renderDecksDue();
  }
}

function renderDeckLanguageOptions(selectedCode = "") {
  const selected = normalizeDeckCardLangCode(selectedCode, "");
  return CARD_LANG_SELECT_CODES
    .map((code) => {
      const label = code ? (`${code} - ${IMPORT_LANG_LABELS[code] || code.toUpperCase()}`) : "Auto";
      const isSelected = code === selected ? " selected" : "";
      return `<option value="${escapeHtml(code)}"${isSelected}>${escapeHtml(label)}</option>`;
    })
    .join("");
}

function renderDeckCreatePhantomRow(chooserOpen = false) {
  if (chooserOpen) {
    return `
      <article class="deck-row deck-row-phantom is-split" aria-label="Choose deck creation mode">
        <div class="deck-row-phantom-chooser" role="group" aria-label="Choose deck creation mode">
          <button class="deck-row-phantom-choice" type="button" data-action="choose-new-deck-type" data-deck-create-type="basic" aria-label="Create basic deck">
            <svg class="bi bi-fonts" data-src="icons/bootstrap/fonts.svg" aria-hidden="true"></svg>
            <span class="deck-row-phantom-label">BASIC</span>
          </button>
          <button class="deck-row-phantom-choice" type="button" data-action="choose-new-deck-type" data-deck-create-type="import" aria-label="Import deck">
            <svg class="bi bi-paperclip" data-src="icons/bootstrap/filetypes/paperclip.svg" aria-hidden="true"></svg>
            <span class="deck-row-phantom-label">IMPORT</span>
          </button>
        </div>
      </article>
    `;
  }
  return `
    <button class="deck-row deck-row-phantom" type="button" data-action="toggle-new-deck-chooser" aria-label="Create new deck">
      <span class="deck-row-phantom-icon" aria-hidden="true">
        <svg class="bi bi-plus-circle-dotted" data-src="icons/bootstrap/plus-circle-dotted.svg" aria-hidden="true"></svg>
      </span>
    </button>
  `;
}

function renderInlineDeckCreatePanel() {
  const source = uiState.inlineDeckCreateDraft;
  if (!source || typeof source !== "object") return "";
  const draft = normalizeInlineDeckCreateDraft(source);
  const title = draft.title;
  const description = draft.description;
  const stagedRows = draft.cards
    .map((card, index) => {
      const front = String(card.front || "");
      const back = String(card.back || "");
      const frontLang = normalizeDeckCardLangCode(card.frontLang || "", "");
      const backLang = normalizeDeckCardLangCode(card.backLang || "", "");
      return `
        <article class="deck-card-row deck-new-deck-staged-card" data-card-index="${index}">
          <header class="deck-card-head">
            <span class="deck-card-index">${index + 1}</span>
            <div class="deck-card-head-actions">
              <button class="deck-card-delete-btn" type="button" data-action="delete-new-deck-staged-card" data-card-index="${index}" aria-label="Delete staged card" title="Delete staged card">
                <svg class="bi bi-trash3-fill" data-src="${TRASH3_FILL_ICON_SRC}" aria-hidden="true"></svg>
              </button>
            </div>
          </header>
          <div class="deck-card-grid">
            <section class="deck-face-col">
              <div class="deck-face-topline">
                <p class="deck-face-label">Front</p>
                <select class="deck-lang-select deck-new-staged-card-lang" data-field="front-lang" data-card-index="${index}" aria-label="Front language code">
                  ${renderDeckLanguageOptions(frontLang)}
                </select>
              </div>
              <textarea class="deck-card-input deck-new-staged-card-input" data-field="front" data-card-index="${index}" rows="4">${escapeHtml(front)}</textarea>
            </section>
            <section class="deck-face-col">
              <div class="deck-face-topline">
                <p class="deck-face-label">Back</p>
                <select class="deck-lang-select deck-new-staged-card-lang" data-field="back-lang" data-card-index="${index}" aria-label="Back language code">
                  ${renderDeckLanguageOptions(backLang)}
                </select>
              </div>
              <textarea class="deck-card-input deck-new-staged-card-input" data-field="back" data-card-index="${index}" rows="4">${escapeHtml(back)}</textarea>
            </section>
          </div>
        </article>
      `;
    })
    .join("");
  const draftCard = draft.cardDraft ? normalizeInlineDeckCreateCard(draft.cardDraft) : null;
  const pendingDraftRow = draftCard
    ? `
      <article class="deck-card-row deck-card-draft" data-draft-owner="new-deck">
        <header class="deck-card-head">
          <span class="deck-card-index">${draft.cards.length + 1}</span>
          <div class="deck-card-head-actions">
            <button class="deck-card-save-btn" type="button" data-action="save-new-deck-draft-card" aria-label="Save staged card" title="Save staged card">
              <svg class="bi bi-check-lg" data-src="icons/bootstrap/check-lg.svg" aria-hidden="true"></svg>
            </button>
            <button class="deck-card-delete-btn" type="button" data-action="cancel-new-deck-draft-card" aria-label="Cancel staged card" title="Cancel staged card">
              <svg class="bi bi-x-lg" data-src="icons/bootstrap/x-lg.svg" aria-hidden="true"></svg>
            </button>
          </div>
        </header>
        <div class="deck-card-grid">
          <section class="deck-face-col">
            <div class="deck-face-topline">
              <p class="deck-face-label">Front</p>
              <select class="deck-lang-select deck-new-card-draft-lang" data-field="front-lang" aria-label="Front language code">
                ${renderDeckLanguageOptions(draftCard.frontLang)}
              </select>
            </div>
            <textarea class="deck-card-input deck-new-card-draft-input" data-field="front" rows="4">${escapeHtml(draftCard.front)}</textarea>
          </section>
          <section class="deck-face-col">
            <div class="deck-face-topline">
              <p class="deck-face-label">Back</p>
              <select class="deck-lang-select deck-new-card-draft-lang" data-field="back-lang" aria-label="Back language code">
                ${renderDeckLanguageOptions(draftCard.backLang)}
              </select>
            </div>
            <textarea class="deck-card-input deck-new-card-draft-input" data-field="back" rows="4">${escapeHtml(draftCard.back)}</textarea>
          </section>
        </div>
      </article>
    `
    : "";
  const addCardPhantom = draftCard
    ? ""
    : `
      <button class="deck-card-row deck-card-phantom" type="button" data-action="open-new-deck-draft-card" aria-label="Add card to new deck">
        <span class="deck-card-phantom-icon" aria-hidden="true">
          <svg class="bi bi-plus-circle-dotted" data-src="icons/bootstrap/plus-circle-dotted.svg" aria-hidden="true"></svg>
        </span>
      </button>
    `;
  return `
    <div class="deck-item deck-item-new-draft">
      <section class="deck-preview-panel deck-preview-panel-new">
        <header class="deck-card-head deck-new-draft-head">
          <span class="deck-card-index">New Deck</span>
          <div class="deck-card-head-actions">
            <button class="deck-card-save-btn" type="button" data-action="save-new-deck-basic" aria-label="Create deck" title="Create deck">
              <svg class="bi bi-check-lg" data-src="icons/bootstrap/check-lg.svg" aria-hidden="true"></svg>
            </button>
            <button class="deck-card-delete-btn" type="button" data-action="cancel-new-deck-basic" aria-label="Cancel deck creation" title="Cancel deck creation">
              <svg class="bi bi-x-lg" data-src="icons/bootstrap/x-lg.svg" aria-hidden="true"></svg>
            </button>
          </div>
        </header>
        <div class="deck-meta-editor">
          <div class="deck-meta-field">
            <label class="deck-meta-label">Title</label>
            <input class="deck-meta-title-input deck-new-deck-title-input" type="text" data-field="title" value="${escapeHtml(title)}" placeholder="Deck title" />
          </div>
          <div class="deck-meta-field">
            <label class="deck-meta-label">Description</label>
            <textarea class="deck-meta-description-input deck-new-deck-description-input" rows="2" data-field="description" placeholder="Description">${escapeHtml(description)}</textarea>
          </div>
        </div>
        <div class="deck-card-list">
          ${pendingDraftRow}
          ${stagedRows}
          ${addCardPhantom}
        </div>
      </section>
    </div>
  `;
}

function renderDeckPhantomCardRow(encodedDeckId, { chooserOpen = false, draft = null, nextIndex = 1 } = {}) {
  if (draft && String(draft.type || "").toLowerCase() === "text") {
    const front = String(draft.front ?? "");
    const back = String(draft.back ?? "");
    const frontLang = normalizeDeckCardLangCode(draft.frontLang || "", "");
    const backLang = normalizeDeckCardLangCode(draft.backLang || "", "");
    return `
      <article class="deck-card-row deck-card-draft" data-deck-id="${encodedDeckId}" data-draft-type="text">
        <header class="deck-card-head">
          <span class="deck-card-index">${escapeHtml(String(Math.max(1, Number(nextIndex) || 1)))}</span>
          <div class="deck-card-head-actions">
            <button class="deck-card-save-btn" type="button" data-action="save-new-deck-card" data-deck-id="${encodedDeckId}" aria-label="Save new card" title="Save new card">
              <svg class="bi bi-check-lg" data-src="icons/bootstrap/check-lg.svg" aria-hidden="true"></svg>
            </button>
            <button class="deck-card-delete-btn" type="button" data-action="cancel-new-deck-card" data-deck-id="${encodedDeckId}" aria-label="Cancel new card" title="Cancel new card">
              <svg class="bi bi-x-lg" data-src="icons/bootstrap/x-lg.svg" aria-hidden="true"></svg>
            </button>
          </div>
        </header>
        <div class="deck-card-grid">
          <section class="deck-face-col">
            <div class="deck-face-topline">
              <p class="deck-face-label">Front</p>
              <select class="deck-lang-select deck-card-draft-lang" data-field="front-lang" aria-label="Front language code">
                ${renderDeckLanguageOptions(frontLang)}
              </select>
            </div>
            <textarea class="deck-card-input deck-card-draft-input" data-field="front" rows="4">${escapeHtml(front)}</textarea>
          </section>
          <section class="deck-face-col">
            <div class="deck-face-topline">
              <p class="deck-face-label">Back</p>
              <select class="deck-lang-select deck-card-draft-lang" data-field="back-lang" aria-label="Back language code">
                ${renderDeckLanguageOptions(backLang)}
              </select>
            </div>
            <textarea class="deck-card-input deck-card-draft-input" data-field="back" rows="4">${escapeHtml(back)}</textarea>
          </section>
        </div>
      </article>
    `;
  }

  if (chooserOpen) {
    return `
      <article class="deck-card-row deck-card-phantom is-split" data-action="open-new-deck-card" data-deck-id="${encodedDeckId}" aria-label="Toggle card type choices">
        <div class="deck-card-phantom-chooser" role="group" aria-label="Choose card type">
          <button class="deck-card-type-tile" type="button" data-action="choose-new-card-type" data-card-type="text" data-deck-id="${encodedDeckId}" aria-label="Choose basic flashcard">
            <svg class="bi bi-fonts" data-src="icons/bootstrap/fonts.svg" aria-hidden="true"></svg>
            <span class="deck-card-type-label">BASIC</span>
          </button>
          <button class="deck-card-type-tile" type="button" data-action="choose-new-card-type" data-card-type="ocr" data-deck-id="${encodedDeckId}" aria-label="Choose OCR flashcard">
            <svg class="bi bi-image" data-src="icons/bootstrap/image.svg" aria-hidden="true"></svg>
            <span class="deck-card-type-label">OCR</span>
          </button>
        </div>
      </article>
    `;
  }
  return `
    <button
      class="deck-card-row deck-card-phantom"
      type="button"
      data-action="open-new-deck-card"
      data-deck-id="${encodedDeckId}"
      aria-label="Add new card"
    >
      <span class="deck-card-phantom-icon" aria-hidden="true">
        <svg class="bi bi-plus-circle-dotted" data-src="icons/bootstrap/plus-circle-dotted.svg" aria-hidden="true"></svg>
      </span>
    </button>
  `;
}

function renderDeckPreviewPanel(deck) {
  const key = normalizeDeckKey(deck.id);
  if (!uiState.expandedDeckIds.has(key)) return "";

  const encodedDeckId = encodeDataValue(key);
  const deckPath = normalizeDeckPathForSave(resolveDeckPathForDeck(deck)) || key;
  const deckDescription = getDeckDescription(deckPath);
  const status = uiState.deckStatusById.get(key);
  const isLoading = deckPreviewLoading.has(key);
  const preview = deckPreviewCache.get(key);
  const cards = Array.isArray(preview?.cards) ? preview.cards : [];
  const inlineDraft = uiState.inlineCardDraftByDeck.get(key) || null;
  const phantomRow = renderDeckPhantomCardRow(encodedDeckId, {
    chooserOpen: uiState.inlineCardTypeDeckId === key,
    draft: inlineDraft,
    nextIndex: cards.length + 1
  });

  let body = "";
  if (isLoading) {
    body = "<p class='widget-note'>Loading cards...</p>";
  } else {
    const rows = cards
      .map((card, index) => {
        const cardId = String(card?.id ?? "");
        const encodedCardId = encodeDataValue(cardId);
        const missingId = !cardId;
        const diagramPayload = getDiagramPayload(key, cardId);
        const frontLang = readCardFaceLanguageCode(card, "front");
        const backLang = readCardFaceLanguageCode(card, "back");
        const frontFieldMarkup = `<textarea class="deck-card-input" data-field="front" rows="4">${escapeHtml(readCardFront(card))}</textarea>`;
        const imageButtonMarkup = (diagramPayload && diagramPayload.imageSrc)
          ? `
              <section class="deck-image-col">
                <button class="deck-diagram-preview" type="button" data-action="open-diagram-preview" data-deck-id="${encodedDeckId}" data-card-id="${encodedCardId}" aria-label="Open diagram preview">
                  <img class="deck-diagram-image" src="${escapeHtml(diagramPayload.imageSrc)}" alt="" loading="lazy" />
                </button>
              </section>
            `
          : "";
        return `
          <article class="deck-card-row" data-deck-id="${encodedDeckId}" data-card-id="${encodedCardId}">
            <header class="deck-card-head">
              <span class="deck-card-index">${index + 1}</span>
              <div class="deck-card-head-actions">
                <button class="deck-card-delete-btn" type="button" data-action="delete-deck-card" data-deck-id="${encodedDeckId}" data-card-id="${encodedCardId}" aria-label="Delete card" title="Delete card" ${missingId ? "disabled" : ""}>
                  <svg class="bi bi-trash3-fill" data-src="${TRASH3_FILL_ICON_SRC}" aria-hidden="true"></svg>
                </button>
              </div>
            </header>
            <div class="deck-card-grid${imageButtonMarkup ? " has-image-slot" : ""}">
              <section class="deck-face-col">
                <div class="deck-face-topline">
                  <p class="deck-face-label">Front</p>
                  <select class="deck-lang-select" data-field="front-lang" aria-label="Front language code">
                    ${renderDeckLanguageOptions(frontLang)}
                  </select>
                </div>
                ${frontFieldMarkup}
              </section>
              <section class="deck-face-col">
                <div class="deck-face-topline">
                  <p class="deck-face-label">Back</p>
                  <select class="deck-lang-select" data-field="back-lang" aria-label="Back language code">
                    ${renderDeckLanguageOptions(backLang)}
                  </select>
                </div>
                <textarea class="deck-card-input" data-field="back" rows="4">${escapeHtml(readCardBack(card))}</textarea>
              </section>
              ${imageButtonMarkup}
            </div>
          </article>
        `;
      })
      .join("");

    body = `
      <div class="deck-card-list">
        ${phantomRow}
        ${rows}
        ${cards.length || inlineDraft ? "" : "<p class='widget-note deck-card-list-empty'>No cards found in this deck.</p>"}
      </div>
    `;
  }

  const statusHtml = status
    ? `<p class="deck-preview-status deck-preview-status-${escapeHtml(status.tone)}">${escapeHtml(status.text)}</p>`
    : "";

  return `
    <section class="deck-preview-panel">
      <div class="deck-meta-editor">
        <div class="deck-meta-field">
          <label class="deck-meta-label">Title</label>
          <input class="deck-meta-title-input" type="text" value="${escapeHtml(deck.name)}" data-deck-id="${encodedDeckId}" />
        </div>
        <div class="deck-meta-field">
          <label class="deck-meta-label">Description</label>
          <textarea class="deck-meta-description-input" rows="2" data-deck-id="${encodedDeckId}">${escapeHtml(deckDescription)}</textarea>
        </div>
      </div>
      ${statusHtml}
      ${body}
    </section>
  `;
}

function renderProfileBanner() {
  const { user, kpis } = homeData;
  refs.profileName.textContent = "User";
  refs.profileAvatarFallback.textContent = initialsFromName("User");

  if (refs.profileAvatarImage && refs.profileAvatarFallback) {
    if (user.avatarUrl) {
      refs.profileAvatarImage.src = user.avatarUrl;
      refs.profileAvatarImage.alt = "User avatar";
      refs.profileAvatarImage.classList.remove("hidden");
      refs.profileAvatarFallback.classList.add("hidden");
    } else {
      refs.profileAvatarImage.removeAttribute("src");
      refs.profileAvatarImage.classList.add("hidden");
      refs.profileAvatarFallback.classList.remove("hidden");
    }
  }

  refs.profileMetaChips.innerHTML = [
    `Joined: ${user.joinedAt}`,
    `Total decks: ${user.totalDecks}`,
    `Last active: ${user.lastActive}`
  ]
    .map((text) => `<li class="chip-item">${text}</li>`)
    .join("");

  refs.mobileDueLabel.textContent = `Due ${kpis.dueNow}`;
}

function renderTodayHero() {
  const { dueNow, estMin, estMax, nextReviewAtMs, breakdown } = homeData.today;
  refs.todayDueLabel.textContent = `${dueNow} Cards Due`;
  refs.todayEstimate.textContent = `Estimated time: ${estMin}-${estMax} min`;
  refs.todayBreakdown.textContent = `${breakdown.review} review + ${breakdown.relearn} relearn`;
  if (refs.nextReviewTracker) {
    const now = new Date();
    let nextReviewText = "Not scheduled";
    if (dueNow > 0) {
      nextReviewText = formatDateTimeRelative(now, now);
    } else if (typeof nextReviewAtMs === "number" && Number.isFinite(nextReviewAtMs)) {
      nextReviewText = formatDateTimeRelative(new Date(nextReviewAtMs), now);
    }
    refs.nextReviewTracker.textContent = `Next review: ${nextReviewText}`;
  }
  refs.todayStartBtn.textContent = `Start Review - ${dueNow}`;
}

function renderDecksDue() {
  const allRows = [...homeData.decksDue]
    .sort((a, b) => (b.due - a.due) || a.name.localeCompare(b.name));
  const dueRows = allRows.filter((deck) => deck.due > 0);
  const visible = uiState.showAllDecks ? allRows : dueRows;
  const hasInlineDeckDraft = Boolean(uiState.inlineDeckCreateDraft && typeof uiState.inlineDeckCreateDraft === "object");
  const createDeckPhantomRow = hasInlineDeckDraft ? "" : renderDeckCreatePhantomRow(uiState.inlineDeckCreateChooserOpen);
  const inlineDeckDraftPanel = renderInlineDeckCreatePanel();

  if (!visible.length) {
    if (uiState.showAllDecks) {
      refs.decksDueList.innerHTML = `
        ${createDeckPhantomRow}
        ${inlineDeckDraftPanel}
        <p class='widget-note'>No decks found.</p>
      `;
    } else if (allRows.length) {
      refs.decksDueList.innerHTML = `
        ${createDeckPhantomRow}
        ${inlineDeckDraftPanel}
        <p class='widget-note'>No decks are due right now. Click 'View all decks' to browse every deck.</p>
      `;
    } else {
      refs.decksDueList.innerHTML = `
        ${createDeckPhantomRow}
        ${inlineDeckDraftPanel}
        <p class='widget-note'>No decks found.</p>
      `;
    }
    if (refs.viewAllDecksBtn) {
      refs.viewAllDecksBtn.disabled = allRows.length === 0;
      refs.viewAllDecksBtn.textContent = uiState.showAllDecks ? "Show due only" : "View all decks";
    }
    hydrateInlineIcons(refs.decksDueList);
    refreshHomeTooltips(refs.decksDueList);
    return;
  }

  refs.decksDueList.innerHTML = createDeckPhantomRow + inlineDeckDraftPanel + visible
    .map((deck) => {
      const deckKey = normalizeDeckKey(deck.id);
      const deckPath = normalizeDeckPathForSave(resolveDeckPathForDeck(deck)) || deckKey;
      const deckDescription = getDeckDescription(deckPath);
      const encodedDeckId = encodeDataValue(deckKey);
      const expanded = uiState.expandedDeckIds.has(deckKey);
      const canDeleteDeck = Boolean(normalizeDeckPathForSave(resolveDeckPathForDeck(deck)));
      return `
        <div class="deck-item ${expanded ? "is-expanded" : ""}">
          <article class="deck-row deck-row-expandable ${expanded ? "is-expanded" : ""}">
            <button class="deck-expand-btn" type="button" data-action="toggle-deck-preview" data-deck-id="${encodedDeckId}" aria-expanded="${expanded ? "true" : "false"}">
              <p class="deck-title">${escapeHtml(deck.name)}</p>
              <p class="deck-meta">${escapeHtml(deckDescription)}</p>
            </button>
            <span class="due-pill">${deck.due} due</span>
            <div class="deck-row-actions">
              <button class="btn btn-secondary deck-start-btn" type="button" data-action="start-deck" data-deck-id="${encodedDeckId}">Start</button>
              <button class="deck-delete-btn" type="button" data-action="delete-deck" data-deck-id="${encodedDeckId}" aria-label="Delete deck" title="Delete deck" ${canDeleteDeck ? "" : "disabled"}>
                <svg class="bi bi-trash3-fill" data-src="${TRASH3_FILL_ICON_SRC}" aria-hidden="true"></svg>
              </button>
            </div>
          </article>
          ${renderDeckPreviewPanel(deck)}
        </div>
      `;
    })
    .join("");
  hydrateDiagramPreviewOverlays();
  hydrateInlineIcons(refs.decksDueList);
  refreshHomeTooltips(refs.decksDueList);

  if (refs.viewAllDecksBtn) {
    refs.viewAllDecksBtn.disabled = allRows.length === 0;
    refs.viewAllDecksBtn.textContent = uiState.showAllDecks ? "Show due only" : "View all decks";
  }
}

function toggleDeckPreview(deckId) {
  const key = normalizeDeckKey(deckId);
  setDeckStatus(key, "");
  if (uiState.expandedDeckIds.has(key)) {
    uiState.expandedDeckIds.delete(key);
    if (uiState.inlineCardTypeDeckId === key) uiState.inlineCardTypeDeckId = "";
    if (uiState.inlineCardDraftByDeck.has(key)) uiState.inlineCardDraftByDeck.delete(key);
    renderDecksDue();
    return;
  }
  uiState.expandedDeckIds.add(key);
  renderDecksDue();
  void ensureDeckPreviewLoaded(key);
}

async function renameDeck(deckId, explicitName = null) {
  const key = normalizeDeckKey(deckId);
  const deck = getDeckById(key);
  if (!deck) return;
  const oldPath = resolveDeckPathForDeck(deck);
  const oldNormalized = normalizeDeckPathForSave(oldPath);
  if (!oldNormalized) {
    setDeckStatus(key, "This deck cannot be renamed.", "error");
    renderDecksDue();
    return;
  }

  const currentName = deckNameFromKey(oldNormalized);
  const raw = explicitName == null
    ? await openInputModal({
      title: "Rename deck",
      message: "Choose a new deck filename (without .json).",
      label: "Deck name",
      initialValue: currentName,
      confirmText: "Rename",
      validator: (value) => {
        const next = String(value || "").trim();
        if (!next) return { ok: false, error: "Deck name cannot be empty." };
        if (!sanitizeDeckFileStem(next)) return { ok: false, error: "Use letters/numbers and avoid invalid filename characters." };
        return { ok: true, value: next };
      }
    })
    : String(explicitName);
  if (raw == null) return;
  const nextName = String(raw).trim();
  if (!nextName) return;
  const newPath = buildRenamedDeckPath(oldNormalized, nextName);
  if (!newPath) {
    setDeckStatus(key, "Invalid deck name.", "error");
    renderDecksDue();
    return;
  }
  const oldKey = normalizeDeckKey(oldNormalized);
  const newKey = normalizeDeckKey(newPath);
  if (oldKey.toLowerCase() === newKey.toLowerCase()) {
    setDeckStatus(key, "Name is unchanged.", "info");
    renderDecksDue();
    return;
  }

  setDeckStatus(key, "Renaming deck...", "info");
  renderDecksDue();

  const result = await persistDeckRename(oldNormalized, newPath);
  if (!result.ok) {
    setDeckStatus(
      key,
      result.queued
        ? `Rename queued (pending writer): ${result.message}`
        : `Rename failed: ${result.message}`,
      "error"
    );
    updateDeckPersistenceUi();
    renderDecksDue();
    return;
  }

  moveDeckKeyInStores(oldKey, newKey, newPath);
  refreshHomeData();
  setDeckStatus(newKey, "Deck renamed.", "success");
  renderHome();
}

async function deleteDeck(deckId) {
  const key = normalizeDeckKey(deckId);
  const deck = getDeckById(key);
  if (!deck) return;
  const deckPath = resolveDeckPathForDeck(deck);
  const normalizedPath = normalizeDeckPathForSave(deckPath);
  if (!normalizedPath) {
    setDeckStatus(key, "This deck cannot be deleted.", "error");
    renderDecksDue();
    return;
  }

  const confirmed = window.confirm(`Delete deck "${deck.name}"?\n\nThis permanently removes ${normalizedPath} from disk.`);
  if (!confirmed) return;

  setDeckStatus(key, "Deleting deck...", "info");
  renderDecksDue();

  const result = await persistDeckRemove(normalizedPath);
  if (!result.ok) {
    setDeckStatus(
      key,
      result.queued
        ? `Delete queued (pending writer): ${result.message}`
        : `Delete failed: ${result.message}`,
      "error"
    );
    updateDeckPersistenceUi();
    renderDecksDue();
    return;
  }

  if (result.archived) {
    showPersistenceNote("Deck removed from list (archived under decks/_deleted because the running writer lacks /deck/remove).");
  }
  pruneDeletedDeckFromStores(key);
  clearDeckWriteQueueForDeckPath(normalizedPath);
  refreshHomeData();
  renderHome();
}

async function saveDeckCardFromRow(deckId, cardId, rowEl, buttonEl, options = {}) {
  const silentNoChange = !!options?.silentNoChange;
  const autosave = !!options?.autosave;
  const key = normalizeDeckKey(deckId);
  const preview = deckPreviewCache.get(key);
  if (!preview || !Array.isArray(preview.cards)) return;
  const idx = preview.cards.findIndex((card) => String(card?.id) === String(cardId));
  if (idx < 0) return;
  const card = preview.cards[idx];
  const frontInput = rowEl?.querySelector("[data-field='front']");
  const backInput = rowEl?.querySelector("[data-field='back']");
  const frontLangInput = rowEl?.querySelector("[data-field='front-lang']");
  const backLangInput = rowEl?.querySelector("[data-field='back-lang']");
  if (
    !(backInput instanceof HTMLTextAreaElement)
    || !(frontLangInput instanceof HTMLSelectElement)
    || !(backLangInput instanceof HTMLSelectElement)
  ) {
    return;
  }

  const nextFront = frontInput instanceof HTMLTextAreaElement ? frontInput.value : readCardFront(card);
  const nextBack = backInput.value;
  const nextFrontLang = normalizeDeckCardLangCode(frontLangInput.value, "");
  const nextBackLang = normalizeDeckCardLangCode(backLangInput.value, "");
  const prevFront = readCardFront(card);
  const prevBack = readCardBack(card);
  const prevFrontLang = readCardFaceLanguageCode(card, "front");
  const prevBackLang = readCardFaceLanguageCode(card, "back");
  if (
    nextFront === prevFront
    && nextBack === prevBack
    && nextFrontLang === prevFrontLang
    && nextBackLang === prevBackLang
  ) {
    if (!silentNoChange) {
      setDeckStatus(key, "No changes to save.", "info");
      renderDecksDue();
    }
    return;
  }

  const source = card?.__homeSource || { kind: "card", parentId: String(card?.id ?? "") };
  let result = { ok: false, message: "Unable to save card." };
  let updatedOverlayCard = null;

  if (buttonEl instanceof HTMLButtonElement) buttonEl.disabled = true;
  try {
    if (source.kind === "diagram_label") {
      const parentId = String(source.parentId || "");
      const labelIndex = Number(source.labelIndex);
      const parentCardIndex = Array.isArray(preview.rawCards)
        ? preview.rawCards.findIndex((item) => String(item?.id) === parentId)
        : -1;
      const parentCard = parentCardIndex >= 0 ? preview.rawCards[parentCardIndex] : null;
      if (!parentCard || !Array.isArray(parentCard.labels) || !Number.isInteger(labelIndex) || labelIndex < 0 || labelIndex >= parentCard.labels.length) {
        result = { ok: false, message: "Diagram source mapping is unavailable." };
      } else {
        const updatedParent = applyCardLanguageValues(parentCard, {
          frontLang: nextFrontLang,
          backLang: nextBackLang
        });
        updatedParent.front = nextFront;
        if ("front_text" in updatedParent) updatedParent.front_text = nextFront;
        const label = updatedParent.labels[labelIndex];
        if (label && typeof label === "object") label.name = nextBack;
        result = await persistDeckCardUpdate(updatedParent, preview.deckPath);
        if (parentCardIndex >= 0) preview.rawCards[parentCardIndex] = updatedParent;
        preview.cards[idx] = applyCardFaceValues(card, nextFront, nextBack, {
          frontLang: nextFrontLang,
          backLang: nextBackLang
        });
        updatedOverlayCard = preview.cards[idx];
      }
    } else {
      const updatedCard = applyCardFaceValues(card, nextFront, nextBack, {
        frontLang: nextFrontLang,
        backLang: nextBackLang
      });
      result = await persistDeckCardUpdate(updatedCard, preview.deckPath);
      preview.cards[idx] = updatedCard;
      updatedOverlayCard = updatedCard;
    }
  } finally {
    if (buttonEl instanceof HTMLButtonElement) buttonEl.disabled = false;
  }

  deckPreviewCache.set(key, preview);
  if (!result.ok) {
    if (updatedOverlayCard) upsertCardEditOverlay(updatedOverlayCard, preview.deckPath);
    setDeckStatus(
      key,
      result.queued
        ? `Saved locally only and queued for disk write: ${result.message}`
        : `Saved locally only: ${result.message}`,
      "error"
    );
    renderDecksDue();
  } else {
    removeCardEditOverlay(cardId, preview.deckPath);
    if (!autosave) {
      setDeckStatus(key, "Card saved to deck file.", "success");
      renderDecksDue();
    }
  }
  updateDeckPersistenceUi();
}

async function saveInlineDeckCreateDraft(buttonEl) {
  const source = uiState.inlineDeckCreateDraft;
  if (!source || typeof source !== "object") return;
  const draft = normalizeInlineDeckCreateDraft(source);

  const rawTitle = String(draft.title || "").trim();
  if (!rawTitle) {
    reportInlineDeckCreateIssue("Deck title is required.");
    return;
  }

  const stem = sanitizeDeckFileStem(rawTitle);
  if (!stem) {
    reportInlineDeckCreateIssue("Use letters/numbers and avoid invalid filename characters.");
    return;
  }

  const deckPath = `decks/${stem}.json`;
  if (draft.cardDraft) {
    reportInlineDeckCreateIssue("Save or cancel the in-progress card first.");
    return;
  }

  const payloadCards = [];
  for (let i = 0; i < draft.cards.length; i += 1) {
    const card = normalizeInlineDeckCreateCard(draft.cards[i]);
    const front = String(card.front || "").trim();
    const back = String(card.back || "").trim();
    if (!front || !back) {
      reportInlineDeckCreateIssue(`Card #${i + 1} needs both Front and Back.`);
      return;
    }
    const nextCard = {
      id: buildDraftCardId(deckPath, payloadCards),
      front,
      back,
      correct: [back]
    };
    const nextLang = buildCardLangObject(card.frontLang || "", card.backLang || "");
    if (nextLang) nextCard.lang = nextLang;
    payloadCards.push(nextCard);
  }

  if (buttonEl instanceof HTMLButtonElement) buttonEl.disabled = true;
  uiState.inlineDeckCreateError = "";
  let result = { ok: false, message: "Create failed." };
  try {
    result = await persistDeckCreate(deckPath, payloadCards, { allowEmpty: true });
  } finally {
    if (buttonEl instanceof HTMLButtonElement) buttonEl.disabled = false;
  }

  if (!result.ok) {
    reportInlineDeckCreateIssue(
      result.queued
        ? `Create queued (pending writer): ${result.message}`
        : `Create failed: ${result.message}`,
      { title: result.queued ? "New Deck Queued" : "New Deck Failed" }
    );
    updateDeckPersistenceUi();
    return;
  }

  const description = String(draft.description || "");
  if (description) setDeckDescription(deckPath, description);
  if (payloadCards.length) seedImportedDeckFsrs(deckPath, payloadCards);
  pinImportedDeckAsRecent(deckPath);

  uiState.inlineDeckCreateDraft = null;
  uiState.inlineDeckCreateChooserOpen = false;
  uiState.inlineDeckCreateError = "";
  uiState.showAllDecks = true;

  refreshHomeData();
  const deckKey = normalizeDeckKey(deckPath);
  uiState.expandedDeckIds.add(deckKey);
  setDeckStatus(
    deckKey,
    payloadCards.length
      ? `Deck created with ${payloadCards.length} card${payloadCards.length === 1 ? "" : "s"}.`
      : "Deck created.",
    "success"
  );
  renderHome();
  void ensureDeckPreviewLoaded(deckKey);
  updateDeckPersistenceUi();
}

async function saveNewDeckCardFromDraft(deckId, buttonEl) {
  const key = normalizeDeckKey(deckId);
  const preview = deckPreviewCache.get(key);
  const draft = uiState.inlineCardDraftByDeck.get(key);
  if (!preview || !Array.isArray(preview.cards) || !draft || String(draft.type || "").toLowerCase() !== "text") return;

  const front = String(draft.front ?? "").trim();
  const back = String(draft.back ?? "").trim();
  if (!front || !back) {
    setDeckStatus(key, "Front and Back are required.", "error");
    renderDecksDue();
    return;
  }

  const frontLang = normalizeDeckCardLangCode(draft.frontLang || "", "");
  const backLang = normalizeDeckCardLangCode(draft.backLang || "", "");
  const nextCard = {
    id: buildDraftCardId(preview.deckPath, preview.cards),
    front,
    back,
    correct: [back]
  };
  const nextLang = buildCardLangObject(frontLang, backLang);
  if (nextLang) nextCard.lang = nextLang;

  if (buttonEl instanceof HTMLButtonElement) buttonEl.disabled = true;
  let result = { ok: false, message: "Unable to save card." };
  try {
    result = await persistDeckCardCreate(nextCard, preview.deckPath);
  } finally {
    if (buttonEl instanceof HTMLButtonElement) buttonEl.disabled = false;
  }

  preview.cards.push(nextCard);
  if (Array.isArray(preview.rawCards)) preview.rawCards.push(nextCard);
  if (preview.rawById instanceof Map) preview.rawById.set(String(nextCard.id), nextCard);
  deckPreviewCache.set(key, preview);
  seedImportedDeckFsrs(preview.deckPath, [nextCard]);

  uiState.inlineCardDraftByDeck.delete(key);
  uiState.inlineCardTypeDeckId = "";

  const cardNumber = preview.cards.length;
  if (!result.ok) {
    setDeckStatus(
      key,
      result.queued
        ? `Card #${cardNumber} added locally and queued for disk write: ${result.message}`
        : `Card #${cardNumber} added locally only: ${result.message}`,
      "error"
    );
  } else {
    setDeckStatus(key, `Card #${cardNumber} added to deck.`, "success");
  }
  refreshHomeData();
  renderHome();
  updateDeckPersistenceUi();
}

async function deleteDeckCardFromRow(deckId, cardId, buttonEl) {
  const key = normalizeDeckKey(deckId);
  const deck = getDeckById(key);
  if (!deck) return;
  const preview = deckPreviewCache.get(key);
  if (!preview || !Array.isArray(preview.cards)) return;

  const idx = preview.cards.findIndex((card) => String(card?.id) === String(cardId));
  if (idx < 0) return;
  const row = preview.cards[idx];
  const source = row?.__homeSource || { kind: "card", parentId: String(row?.id ?? "") };
  const confirmDelete = window.confirm(`Delete card ${cardId} from ${deck.name}?`);
  if (!confirmDelete) return;

  if (buttonEl instanceof HTMLButtonElement) buttonEl.disabled = true;
  let result = { ok: false, message: "Delete failed." };
  try {
    if (source.kind === "diagram_label") {
      const parentId = String(source.parentId || "");
      const labelIndex = Number(source.labelIndex);
      const parentCard = Array.isArray(preview.rawCards)
        ? preview.rawCards.find((item) => String(item?.id) === parentId)
        : null;
      if (!parentCard || !Array.isArray(parentCard.labels) || !Number.isInteger(labelIndex) || labelIndex < 0 || labelIndex >= parentCard.labels.length) {
        result = { ok: false, message: "Diagram source mapping is unavailable." };
      } else {
        parentCard.labels.splice(labelIndex, 1);
        result = await persistDeckCardUpdate(parentCard, preview.deckPath);
      }
    } else {
      result = await persistDeckCardDelete(cardId, preview.deckPath);
    }
  } finally {
    if (buttonEl instanceof HTMLButtonElement) buttonEl.disabled = false;
  }

  if (!result.ok) {
    setDeckStatus(
      key,
      result.queued
        ? `Delete queued (pending writer): ${result.message}`
        : `Delete failed: ${result.message}`,
      "error"
    );
    updateDeckPersistenceUi();
    renderDecksDue();
    return;
  }

  preview.cards.splice(idx, 1);
  if (source.kind === "diagram_label") {
    const parentId = String(source.parentId || "");
    const parentCard = Array.isArray(preview.rawCards)
      ? preview.rawCards.find((item) => String(item?.id) === parentId)
      : null;
    if (parentCard && Array.isArray(parentCard.labels)) {
      const rebuiltRows = normalizeDeckPreviewCards(preview.rawCards, preview.deckPath).cards;
      preview.cards = rebuiltRows;
    }
  }
  deckPreviewCache.set(key, preview);
  removeCardEditOverlay(cardId, preview.deckPath);
  removeCardFromFsrsStores(cardId, [key, preview.deckPath, localStorage.getItem(STORAGE_DECK_PATH) || ""]);
  setDeckStatus(key, "Card deleted.", "success");

  refreshHomeData();
  renderHome();
}

function renderRecentActivity() {
  const rows = Array.isArray(homeData.recentActivity) ? homeData.recentActivity : [];
  if (!rows.length) {
    refs.recentActivityRows.innerHTML = "<tr><td colspan='5' class='widget-note'>No completed reviews yet.</td></tr>";
    if (refs.viewAllActivityBtn) {
      refs.viewAllActivityBtn.disabled = true;
      refs.viewAllActivityBtn.textContent = "View all";
    }
    return;
  }

  const visible = uiState.showAllActivity ? rows : rows.slice(0, ACTIVITY_ROWS_COLLAPSED);
  refs.recentActivityRows.innerHTML = visible
    .map((row) => {
      const className = accuracyClass(row.accuracy);
      return `
        <tr>
          <td>${row.date}</td>
          <td>${row.deck}</td>
          <td>${row.reviewed}</td>
          <td class="${className}">${row.accuracy}%</td>
          <td>${row.minutes} min</td>
        </tr>
      `;
    })
    .join("");

  if (refs.viewAllActivityBtn) {
    refs.viewAllActivityBtn.disabled = rows.length <= ACTIVITY_ROWS_COLLAPSED;
    refs.viewAllActivityBtn.textContent = uiState.showAllActivity ? "Show less" : "View all";
  }
}

function renderWeeklyGoal() {
  const { done, target } = homeData.weeklyGoal;
  const pct = target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;
  const remaining = Math.max(0, target - done);

  refs.weeklyGoalMeta.textContent = `${done} / ${target}`;
  refs.weeklyGoalFill.style.width = `${pct}%`;
  refs.weeklyGoalInsight.textContent =
    remaining > 0
      ? `${remaining} reviews left to hit this week's target.`
      : "Weekly target reached. Excellent consistency.";
}

function renderForecast() {
  const rows = Array.isArray(homeData.dueForecast) ? homeData.dueForecast : [];
  if (!rows.length) {
    refs.dueForecastList.innerHTML = "<li class='widget-note'>No forecast available.</li>";
    return;
  }
  refs.dueForecastList.innerHTML = rows
    .map(
      (item) => `
        <li class="forecast-row">
          <span>${item.label}</span>
          <strong>${item.due} due</strong>
        </li>
      `
    )
    .join("");
}

function renderSuggestions() {
  const rows = Array.isArray(homeData.suggestions) ? homeData.suggestions : [];
  if (!rows.length) {
    refs.suggestionsList.innerHTML = "<li class='widget-note'>No suggestions right now.</li>";
    return;
  }
  refs.suggestionsList.innerHTML = rows
    .slice(0, 3)
    .map(
      (item) => `
        <li class="suggestion-row">
          <strong>${item.title}</strong>
          <p>${item.body}</p>
        </li>
      `
    )
    .join("");
}

function positionHeatmapTooltip(clientX, clientY) {
  const tt = refs.heatmapTooltip;
  const width = tt.offsetWidth;
  const viewportPadding = 12;
  const safeX = Math.max(viewportPadding + width / 2, Math.min(window.innerWidth - viewportPadding - width / 2, clientX));
  const safeY = Math.max(32, clientY - 12);
  tt.style.left = `${safeX}px`;
  tt.style.top = `${safeY}px`;
}

function showHeatmapTooltip(cell, text, focusMode = false) {
  refs.heatmapTooltip.textContent = text;
  refs.heatmapTooltip.classList.add("show");
  if (focusMode) {
    const rect = cell.getBoundingClientRect();
    positionHeatmapTooltip(rect.left + rect.width / 2, rect.top);
  }
}

function hideHeatmapTooltip() {
  activeHomeTooltipTarget = null;
  refs.heatmapTooltip.classList.remove("show");
}

function isHomeTooltipTargetDisabled(target) {
  if (!(target instanceof HTMLElement)) return true;
  if ("disabled" in target && target.disabled) return true;
  return target.getAttribute("aria-disabled") === "true";
}

function bindHomeTooltipTarget(target) {
  if (!(target instanceof HTMLElement)) return;
  if (target.dataset.homeTooltipBound === "1") return;
  target.dataset.homeTooltipBound = "1";

  target.addEventListener("mouseenter", (event) => {
    if (isHomeTooltipTargetDisabled(target)) return;
    const text = safeText(target.dataset.homeTooltip, "");
    if (!text) return;
    activeHomeTooltipTarget = target;
    showHeatmapTooltip(target, text, false);
    positionHeatmapTooltip(event.clientX, event.clientY);
  });

  target.addEventListener("mousemove", (event) => {
    if (activeHomeTooltipTarget !== target) return;
    positionHeatmapTooltip(event.clientX, event.clientY);
  });

  target.addEventListener("mouseleave", () => {
    if (activeHomeTooltipTarget !== target) return;
    activeHomeTooltipTarget = null;
    hideHeatmapTooltip();
  });

  target.addEventListener("focus", () => {
    if (isHomeTooltipTargetDisabled(target)) return;
    const text = safeText(target.dataset.homeTooltip, "");
    if (!text) return;
    activeHomeTooltipTarget = target;
    showHeatmapTooltip(target, text, true);
  });

  target.addEventListener("blur", () => {
    if (activeHomeTooltipTarget !== target) return;
    activeHomeTooltipTarget = null;
    hideHeatmapTooltip();
  });
}

function setHomeTooltipText(target, text) {
  if (!(target instanceof HTMLElement)) return;
  const normalized = safeText(text, "");
  if (normalized) {
    target.dataset.homeTooltip = normalized;
    bindHomeTooltipTarget(target);
  } else {
    delete target.dataset.homeTooltip;
  }
  if (target.hasAttribute("title")) target.removeAttribute("title");
}

function refreshHomeTooltips(root = document) {
  if (!(root instanceof Document) && !(root instanceof Element)) return;
  if (root instanceof HTMLElement && root.hasAttribute("title")) {
    const titleText = safeText(root.getAttribute("title"), "");
    if (titleText) root.dataset.homeTooltip = titleText;
    root.removeAttribute("title");
  }

  const titled = root.querySelectorAll("[title]");
  titled.forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    const titleText = safeText(el.getAttribute("title"), "");
    if (titleText) el.dataset.homeTooltip = titleText;
    el.removeAttribute("title");
  });

  const tooltipTargets = root.querySelectorAll("[data-home-tooltip]");
  tooltipTargets.forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    const text = safeText(el.dataset.homeTooltip, "");
    if (!text) return;
    bindHomeTooltipTarget(el);
  });
}

function getHeatmapYearWindowUtc(year) {
  const safeYear = Number.isFinite(year) ? Math.round(year) : new Date().getUTCFullYear();
  const rangeStart = new Date(Date.UTC(safeYear, 0, 1));
  const rangeEnd = new Date(Date.UTC(safeYear, 11, 31));
  const gridStart = startOfWeekMondayUtc(rangeStart);
  const gridEnd = endOfWeekSundayUtc(rangeEnd);
  return { year: safeYear, rangeStart, rangeEnd, gridStart, gridEnd };
}

function getActiveHeatmapYear() {
  const raw = Number(uiState.heatmapYear);
  if (Number.isFinite(raw)) return Math.round(raw);
  const fallback = new Date().getUTCFullYear();
  uiState.heatmapYear = fallback;
  return fallback;
}

function getHeatmapYearSlotWidth() {
  const carousel = refs.heatmapYearCarousel;
  if (!carousel) return 74;
  return Math.max(56, Math.round(carousel.clientWidth || 74));
}

function recenterHeatmapYearTrack() {
  const track = refs.heatmapYearTrack;
  if (!track) return;
  const slotWidth = getHeatmapYearSlotWidth();
  track.style.transition = "none";
  track.style.transform = `translateX(${-slotWidth}px)`;
}

function syncHeatmapYearLabel() {
  const track = refs.heatmapYearTrack;
  if (!track) return;
  const year = getActiveHeatmapYear();
  const slots = track.querySelectorAll(".heatmap-year-slot");
  if (slots[0]) slots[0].textContent = String(year - 1);
  if (slots[1]) slots[1].textContent = String(year);
  if (slots[2]) slots[2].textContent = String(year + 1);
  if (!uiState.heatmapYearDrag?.active) recenterHeatmapYearTrack();
}

function animateHeatmapYearTrack(transformValue, onDone = null) {
  const track = refs.heatmapYearTrack;
  if (!track) {
    if (typeof onDone === "function") onDone();
    return;
  }
  const targetTransform = `translateX(${transformValue}px)`;
  if (track.style.transform === targetTransform) {
    if (typeof onDone === "function") onDone();
    return;
  }
  let settled = false;
  let fallbackTimer = null;
  const done = () => {
    if (settled) return;
    settled = true;
    track.removeEventListener("transitionend", done);
    if (fallbackTimer != null) {
      window.clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    if (typeof onDone === "function") onDone();
  };
  track.addEventListener("transitionend", done, { once: true });
  track.style.transition = "transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1)";
  track.style.transform = targetTransform;
  fallbackTimer = window.setTimeout(done, 320);
}

function setHeatmapYear(nextYear) {
  const parsed = Math.round(Number(nextYear));
  if (!Number.isFinite(parsed)) return;
  if (parsed === getActiveHeatmapYear()) return;
  uiState.heatmapYear = parsed;
  syncHeatmapYearLabel();
  renderHeatmap();
}

function reelHeatmapYear(direction) {
  const step = direction < 0 ? -1 : 1;
  if (uiState.heatmapYearAnimating) return;
  const slotWidth = getHeatmapYearSlotWidth();
  const targetTransform = step > 0 ? -(slotWidth * 2) : 0;
  uiState.heatmapYearAnimating = true;
  animateHeatmapYearTrack(targetTransform, () => {
    setHeatmapYear(getActiveHeatmapYear() + step);
    recenterHeatmapYearTrack();
    uiState.heatmapYearAnimating = false;
  });
}

function resetHeatmapYearDrag() {
  const carousel = refs.heatmapYearCarousel;
  if (carousel) carousel.classList.remove("is-dragging");
  uiState.heatmapYearDrag = null;
  uiState.heatmapYearAnimating = false;
  recenterHeatmapYearTrack();
}

function fitHeatmapToPanel(weeksCount) {
  if (!refs.heatmapShell || !Number.isFinite(weeksCount) || weeksCount <= 0) return;
  const rootStyles = getComputedStyle(document.documentElement);
  const gap = Number.parseFloat(rootStyles.getPropertyValue("--heat-cell-gap")) || 3;
  const weekdayCol = Number.parseFloat(rootStyles.getPropertyValue("--heat-weekday-col")) || 34;
  const weekdayGap = Number.parseFloat(rootStyles.getPropertyValue("--heat-weekday-gap")) || 8;
  const reservedWidth = weekdayCol + weekdayGap;
  const shellWidth = refs.heatmapShell.clientWidth || 0;
  const availableWidth = Math.max(0, shellWidth - reservedWidth);
  const rawSize = (availableWidth - ((weeksCount - 1) * gap)) / weeksCount;
  const size = Math.max(7, Math.min(13, rawSize));
  refs.heatmapShell.style.setProperty("--heat-cell-size", `${size.toFixed(2)}px`);
}

function renderHeatmap() {
  if (!refs.heatmapGrid || !refs.heatmapMonths || !refs.heatmapTooltip) return;
  const activeYear = getActiveHeatmapYear();
  const { rangeStart, rangeEnd, gridStart, gridEnd } = getHeatmapYearWindowUtc(activeYear);
  const reviewsMap = homeData?.activityUtcCounts instanceof Map
    ? homeData.activityUtcCounts
    : new Map((homeData?.activityDaily || []).map((entry) => [entry.date, Number(entry.reviews) || 0]));
  const visibleDays = [];
  const totalDays = Math.floor((gridEnd.getTime() - gridStart.getTime()) / DAY_MS) + 1;

  for (let index = 0; index < totalDays; index += 1) {
    const cursor = addDaysUtc(gridStart, index);
    const iso = toIsoDateUtc(cursor);
    const inSelectedRange = cursor >= rangeStart && cursor <= rangeEnd;
    const reviews = inSelectedRange ? (reviewsMap.get(iso) || 0) : 0;
    visibleDays.push({
      date: cursor,
      inRange: inSelectedRange,
      reviews,
      level: inSelectedRange ? reviewsToHeatLevel(reviews) : 0,
      weekIndex: Math.floor(index / 7)
    });
  }

  if (!visibleDays.length) {
    refs.heatmapMonths.innerHTML = "";
    refs.heatmapGrid.innerHTML = "";
    if (refs.heatmapAvgPrimary) refs.heatmapAvgPrimary.textContent = "Avg 0.0/day";
    if (refs.heatmapAvgSummary) setHomeTooltipText(refs.heatmapAvgSummary, "");
    return;
  }

  const daysInRange = Math.floor((rangeEnd.getTime() - rangeStart.getTime()) / DAY_MS) + 1;
  const totalReviews = visibleDays.reduce((sum, day) => sum + (day.inRange ? day.reviews : 0), 0);
  const activeDays = visibleDays.reduce((sum, day) => sum + (day.inRange && day.reviews > 0 ? 1 : 0), 0);
  const calendarAvg = daysInRange > 0 ? (totalReviews / daysInRange) : 0;
  const activeDayAvg = activeDays > 0 ? (totalReviews / activeDays) : 0;

  if (refs.heatmapAvgPrimary) {
    refs.heatmapAvgPrimary.textContent = `Avg ${formatHeatmapDailyAverage(activeDayAvg)}/day`;
  }
  if (refs.heatmapAvgSummary) {
    if (activeDays > 0) {
      setHomeTooltipText(
        refs.heatmapAvgSummary,
        `Calendar avg ${formatHeatmapDailyAverage(calendarAvg)}/day across ${numberFormatter.format(daysInRange)} day${daysInRange === 1 ? "" : "s"} (${numberFormatter.format(activeDays)} active)`
      );
    } else {
      setHomeTooltipText(refs.heatmapAvgSummary, "No active days yet in this view.");
    }
  }

  const weeksCount = (visibleDays[visibleDays.length - 1]?.weekIndex || 0) + 1;
  fitHeatmapToPanel(weeksCount);

  refs.heatmapMonths.style.setProperty("--weeks-count", String(weeksCount));
  refs.heatmapGrid.style.setProperty("--weeks-count", String(weeksCount));

  const monthLabels = Array.from({ length: 12 }, (_, monthIndex) => {
    const monthStart = new Date(Date.UTC(activeYear, monthIndex, 1));
    const weekIndex = Math.floor((monthStart.getTime() - gridStart.getTime()) / DAY_MS / 7);
    return {
      weekIndex,
      text: heatmapMonthFormatterUtc.format(monthStart)
    };
  });

  refs.heatmapMonths.innerHTML = monthLabels
    .map((month) => `<span class="heatmap-month" style="grid-column:${month.weekIndex + 1} / span 1;">${month.text}</span>`)
    .join("");

  refs.heatmapGrid.innerHTML = "";

  visibleDays.forEach((day) => {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "heatmap-cell";
    cell.dataset.level = String(day.level);

    if (!day.inRange) {
      cell.classList.add("is-padding");
      cell.disabled = true;
      cell.tabIndex = -1;
      cell.setAttribute("aria-hidden", "true");
      refs.heatmapGrid.appendChild(cell);
      return;
    }

    const label = `${numberFormatter.format(day.reviews)} review${day.reviews === 1 ? "" : "s"} on ${heatmapDateFormatterUtc.format(day.date)}`;

    cell.setAttribute("aria-label", label);

    cell.addEventListener("mouseenter", () => showHeatmapTooltip(cell, label, false));
    cell.addEventListener("mousemove", (event) => positionHeatmapTooltip(event.clientX, event.clientY));
    cell.addEventListener("mouseleave", hideHeatmapTooltip);
    cell.addEventListener("focus", () => showHeatmapTooltip(cell, label, true));
    cell.addEventListener("blur", hideHeatmapTooltip);

    refs.heatmapGrid.appendChild(cell);
  });
  refs.heatmapGrid.setAttribute("aria-label", `Daily review activity for ${activeYear}`);
  syncHeatmapYearLabel();
}

function pickDefaultDeckPath() {
  const currentDeck = safeText(localStorage.getItem(STORAGE_DECK_PATH), "");
  if (currentDeck && !isExcludedDeckKey(currentDeck)) return normalizeDeckKey(currentDeck);
  const dueDeck = (homeData?.decksDue || []).find((deck) => Number(deck?.due) > 0);
  if (dueDeck?.path && !isExcludedDeckKey(dueDeck.path)) return normalizeDeckKey(dueDeck.path);
  const firstDeck = homeData?.decksDue?.[0];
  if (firstDeck?.path && !isExcludedDeckKey(firstDeck.path)) return normalizeDeckKey(firstDeck.path);
  return "";
}

function navigateToStudy({ deckPath = "", sessionLimit = 0 } = {}) {
  const params = new URLSearchParams();
  const normalizedDeck = normalizeDeckKey(deckPath || pickDefaultDeckPath());
  if (normalizedDeck && normalizedDeck.toLowerCase() !== "default") {
    params.set("deck", normalizedDeck);
  }
  if (Number.isFinite(sessionLimit) && sessionLimit > 0) {
    const capped = Math.max(1, Math.min(MAX_SESSION_CARDS, Math.round(sessionLimit)));
    params.set("session", String(capped));
  }
  const query = params.toString();
  window.location.assign(query ? `index.html?${query}` : "index.html");
}

function startReview(deck, options = {}) {
  const deckPath = safeText(deck?.path || deck?.id, "");
  navigateToStudy({
    deckPath,
    sessionLimit: Number(options.sessionLimit) || 0
  });
}

async function startCustomSession() {
  const dueNow = Math.max(0, Number(homeData?.today?.dueNow) || 0);
  const suggested = Math.max(5, Math.min(60, dueNow > 0 ? Math.round(dueNow * 0.35) : 20));
  const raw = await openInputModal({
    title: "Custom session size",
    message: `Set how many cards to include (1-${MAX_SESSION_CARDS}).`,
    label: "Card count",
    initialValue: String(suggested),
    inputType: "number",
    inputMode: "numeric",
    confirmText: "Start",
    validator: (value) => {
      const count = Math.round(Number(value));
      if (!Number.isFinite(count) || count <= 0) {
        return { ok: false, error: "Enter a number greater than zero." };
      }
      const capped = Math.max(1, Math.min(MAX_SESSION_CARDS, count));
      return { ok: true, value: String(capped) };
    }
  });
  if (raw == null) return;
  const count = Math.round(Number(raw));
  if (!Number.isFinite(count) || count <= 0) return;
  startReview(null, { sessionLimit: count });
}

function startWarmupSession() {
  startReview(null, { sessionLimit: 5 });
}

function refreshHomeData() {
  homeData = buildHomeData();
}

function renderHome() {
  if (!homeData) return;
  renderProfileBanner();
  renderTodayHero();
  renderDecksDue();
  renderRecentActivity();
  renderWeeklyGoal();
  renderForecast();
  renderSuggestions();
  renderHeatmap();
  updateDeckPersistenceUi();
  hydrateInlineIcons(document);
  refreshHomeTooltips(document);
}

function wireActions() {
  ensureDeckImportModalBound();
  refs.todayStartBtn?.addEventListener("click", () => startReview(null));
  refs.mobileStartBtn?.addEventListener("click", () => startReview(null));
  refs.heatmapPrevYearBtn?.addEventListener("click", () => {
    if (uiState.heatmapYearDrag?.active) return;
    reelHeatmapYear(-1);
  });
  refs.heatmapNextYearBtn?.addEventListener("click", () => {
    if (uiState.heatmapYearDrag?.active) return;
    reelHeatmapYear(1);
  });
  refs.heatmapYearCarousel?.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (uiState.heatmapYearAnimating) return;
    const carousel = refs.heatmapYearCarousel;
    const track = refs.heatmapYearTrack;
    if (!carousel || !track) return;
    event.preventDefault();
    uiState.heatmapYearDrag = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      deltaX: 0
    };
    carousel.classList.add("is-dragging");
    const slotWidth = getHeatmapYearSlotWidth();
    track.style.transition = "none";
    track.style.transform = `translateX(${-slotWidth}px)`;
    carousel.setPointerCapture(event.pointerId);
  });
  refs.heatmapYearCarousel?.addEventListener("pointermove", (event) => {
    const drag = uiState.heatmapYearDrag;
    const track = refs.heatmapYearTrack;
    if (!drag?.active || drag.pointerId !== event.pointerId || !track) return;
    const slotWidth = getHeatmapYearSlotWidth();
    const maxDrag = slotWidth;
    const delta = Math.max(-maxDrag, Math.min(maxDrag, event.clientX - drag.startX));
    drag.deltaX = delta;
    track.style.transform = `translateX(${-slotWidth + delta}px)`;
  });
  const finishHeatmapYearDrag = (event) => {
    const drag = uiState.heatmapYearDrag;
    const carousel = refs.heatmapYearCarousel;
    const track = refs.heatmapYearTrack;
    if (!drag?.active || drag.pointerId !== event.pointerId || !carousel || !track) return;
    if (carousel.hasPointerCapture(event.pointerId)) carousel.releasePointerCapture(event.pointerId);
    carousel.classList.remove("is-dragging");
    const delta = Number(drag.deltaX) || 0;
    uiState.heatmapYearDrag = null;
    const slotWidth = getHeatmapYearSlotWidth();
    const threshold = Math.max(18, Math.round(slotWidth * 0.35));
    if (Math.abs(delta) < threshold) {
      animateHeatmapYearTrack(-slotWidth);
      return;
    }
    const direction = delta < 0 ? 1 : -1;
    reelHeatmapYear(direction);
  };
  refs.heatmapYearCarousel?.addEventListener("pointerup", finishHeatmapYearDrag);
  refs.heatmapYearCarousel?.addEventListener("pointercancel", finishHeatmapYearDrag);
  refs.heatmapYearCarousel?.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setHeatmapYear(getActiveHeatmapYear() - 1);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setHeatmapYear(getActiveHeatmapYear() + 1);
    }
  });

  refs.customSessionBtn?.addEventListener("click", () => {
    void startCustomSession();
  });

  refs.warmupBtn?.addEventListener("click", () => {
    startWarmupSession();
  });

  refs.viewAllDecksBtn?.addEventListener("click", () => {
    uiState.showAllDecks = !uiState.showAllDecks;
    renderDecksDue();
  });

  refs.flushDeckWritesBtn?.addEventListener("click", () => {
    void flushPendingDeckWrites();
  });

  refs.viewAllActivityBtn?.addEventListener("click", () => {
    uiState.showAllActivity = !uiState.showAllActivity;
    renderRecentActivity();
  });

  document.addEventListener("click", (event) => {
    const actionEl = event.target.closest("[data-action]");
    if (!actionEl) return;
    const action = String(actionEl.dataset.action || "");
    const deckId = decodeDataValue(actionEl.dataset.deckId || "");
    const cardId = decodeDataValue(actionEl.dataset.cardId || "");

    if (action === "start-deck") {
      const deck = getDeckById(deckId);
      if (!deck) return;
      startReview(deck);
      return;
    }
    if (action === "open-diagram-preview") {
      openDiagramPreview(deckId, cardId);
      return;
    }
    if (action === "close-diagram-preview") {
      closeDiagramPreview();
      return;
    }
    if (action === "rename-deck") {
      void renameDeck(deckId);
      return;
    }
    if (action === "toggle-deck-preview") {
      toggleDeckPreview(deckId);
      return;
    }
    if (action === "toggle-new-deck-chooser") {
      toggleInlineDeckCreateChooser();
      return;
    }
    if (action === "choose-new-deck-type") {
      selectInlineDeckCreateOption(actionEl.dataset.deckCreateType || "");
      return;
    }
    if (action === "save-new-deck-basic") {
      void saveInlineDeckCreateDraft(actionEl);
      return;
    }
    if (action === "cancel-new-deck-basic") {
      closeInlineDeckCreate();
      return;
    }
    if (action === "open-new-deck-draft-card") {
      openInlineDeckCreateCardDraft();
      return;
    }
    if (action === "save-new-deck-draft-card") {
      saveInlineDeckCreateCardDraft();
      return;
    }
    if (action === "cancel-new-deck-draft-card") {
      closeInlineDeckCreateCardDraft();
      return;
    }
    if (action === "delete-new-deck-staged-card") {
      removeInlineDeckCreateStagedCard(actionEl.dataset.cardIndex || "");
      return;
    }
    if (action === "delete-deck") {
      void deleteDeck(deckId);
      return;
    }
    if (action === "delete-deck-card") {
      void deleteDeckCardFromRow(deckId, cardId, actionEl);
      return;
    }
    if (action === "open-new-deck-card") {
      toggleInlineDeckCardTypePicker(deckId);
      return;
    }
    if (action === "choose-new-card-type") {
      selectDeckCardType(actionEl.dataset.cardType || "", deckId);
      return;
    }
    if (action === "save-new-deck-card") {
      void saveNewDeckCardFromDraft(deckId, actionEl);
      return;
    }
    if (action === "cancel-new-deck-card") {
      closeInlineDeckCardDraft(deckId);
      return;
    }
  });

  document.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.classList.contains("deck-new-deck-title-input") || target.classList.contains("deck-new-deck-description-input")) {
      updateInlineDeckCreateDraftFromField(target);
      return;
    }
    if (target.classList.contains("deck-new-card-draft-input")) {
      updateInlineDeckCreateCardDraftFromField(target);
      return;
    }
    if (target.classList.contains("deck-new-staged-card-input")) {
      updateInlineDeckCreateStagedCardFromField(target);
      return;
    }
    if (target.classList.contains("deck-card-draft-input")) {
      updateInlineDeckCardDraftFromField(target);
      return;
    }
    if (!target.classList.contains("deck-card-input")) return;
    const rowEl = target.closest(".deck-card-row");
    const ids = readDeckCardIdsFromRow(rowEl);
    if (!ids) return;
    scheduleDeckCardAutosave(ids.deckId, ids.cardId, rowEl);
  });

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.classList.contains("deck-new-card-draft-lang")) {
      updateInlineDeckCreateCardDraftFromField(target);
      return;
    }
    if (target.classList.contains("deck-new-staged-card-lang")) {
      updateInlineDeckCreateStagedCardFromField(target);
      return;
    }

    if (target.classList.contains("deck-card-draft-lang")) {
      updateInlineDeckCardDraftFromField(target);
      return;
    }

    if (target.classList.contains("deck-lang-select")) {
      const rowEl = target.closest(".deck-card-row");
      const ids = readDeckCardIdsFromRow(rowEl);
      if (!ids) return;
      scheduleDeckCardAutosave(ids.deckId, ids.cardId, rowEl, { immediate: true });
      return;
    }

    if (target.classList.contains("deck-card-input")) {
      const rowEl = target.closest(".deck-card-row");
      const ids = readDeckCardIdsFromRow(rowEl);
      if (!ids) return;
      scheduleDeckCardAutosave(ids.deckId, ids.cardId, rowEl, { immediate: true });
      return;
    }

    if (target.classList.contains("deck-meta-title-input")) {
      const input = target;
      const deckId = decodeDataValue(input.dataset.deckId || "");
      const deck = getDeckById(deckId);
      if (!deck) return;
      const next = String(input.value || "").trim();
      if (!next || next === deck.name) return;
      void renameDeck(deckId, next);
      return;
    }

    if (target.classList.contains("deck-meta-description-input")) {
      const input = target;
      const deckId = decodeDataValue(input.dataset.deckId || "");
      const deck = getDeckById(deckId);
      if (!deck) return;
      const deckPath = normalizeDeckPathForSave(resolveDeckPathForDeck(deck)) || normalizeDeckKey(deck.id);
      setDeckDescription(deckPath, input.value || "");
      setDeckStatus(deckId, "Description saved.", "success");
      renderDecksDue();
    }
  });

  window.addEventListener("scroll", hideHeatmapTooltip, true);
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    resetHeatmapYearDrag();
    closeDiagramPreview();
    closeInlineDeckCreate();
    closeInlineDeckCardTypePicker();
    closeInlineDeckCardDraft();
  });
  window.addEventListener("resize", () => {
    hideHeatmapTooltip();
    renderHeatmap();
  });
  window.addEventListener("focus", () => {
    closeDiagramPreview();
    closeInlineDeckCreate({ render:false });
    closeInlineDeckCardTypePicker("", { render:false });
    closeInlineDeckCardDraft("", { render:false });
    refreshHomeData();
    renderHome();
    void syncDeckPathsFromServer();
    void pruneMissingDecks(false);
    void reconcileDueDecksWithSource(false);
  });
  window.addEventListener("pageshow", () => {
    closeDiagramPreview();
    closeInlineDeckCreate({ render:false });
    closeInlineDeckCardTypePicker("", { render:false });
    closeInlineDeckCardDraft("", { render:false });
    refreshHomeData();
    renderHome();
    void syncDeckPathsFromServer();
    void pruneMissingDecks(false);
    void reconcileDueDecksWithSource(false);
  });
}

function initHome() {
  ensureAlertStyles();
  void loadHomeAlertsModule();
  refreshHomeData();
  renderHome();
  void syncDeckPathsFromServer();
  void pruneMissingDecks(true);
  void reconcileDueDecksWithSource(true);
  wireActions();
}

function initTouchRailInteraction() {
  const rail = document.querySelector(".left-hover-menu");
  if (!rail || typeof window.matchMedia !== "function") return;

  const mq = window.matchMedia("(max-width: 900px), (hover: none), (pointer: coarse)");
  const isTouchUi = () => !!mq.matches;

  const setOpen = (open) => {
    if (!isTouchUi()) {
      rail.classList.remove("touch-open");
      return;
    }
    rail.classList.toggle("touch-open", !!open);
  };

  const blurRailFocus = () => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && rail.contains(active)) {
      try { active.blur(); } catch {}
    }
  };

  const handleOutside = (event) => {
    if (!isTouchUi()) return;
    const target = event?.target;
    if (target instanceof Node && rail.contains(target)) return;
    setOpen(false);
    blurRailFocus();
  };

  const handleRailClickCapture = (event) => {
    if (!isTouchUi()) return;
    const target = event?.target;
    if (!(target instanceof Element)) return;
    const trigger = target.closest(".mode-trigger, .deck-trigger");
    if (!(trigger instanceof HTMLElement) || !rail.contains(trigger)) return;
    if (rail.classList.contains("touch-open")) return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(true);
    try { trigger.focus({ preventScroll: true }); }
    catch { trigger.focus(); }
  };

  rail.addEventListener("click", handleRailClickCapture, true);
  document.addEventListener("pointerdown", handleOutside, true);
  document.addEventListener("touchstart", handleOutside, { capture: true, passive: true });

  const handleMqChange = () => {
    if (!isTouchUi()) rail.classList.remove("touch-open");
  };
  if (typeof mq.addEventListener === "function") mq.addEventListener("change", handleMqChange);
  else if (typeof mq.addListener === "function") mq.addListener(handleMqChange);
}

initTouchRailInteraction();
initHome();
