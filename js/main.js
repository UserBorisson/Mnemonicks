import { renderCard } from './flashcard.js';
import * as MCQ from './mcq.js';
import { normalize as normalizeAnswer } from './answers.js';
import { setupFillIn, renderFillIn, refreshFillInSizing } from './fillin.js';
import { animateOut, animateIn } from './animations.js';
import { initTTS, retryTTSNow, speak, stop, setVoice } from './audio.js'; // â¬…ï¸ import stop; no MCQ reading
import handleReview from './scheduler.js';
import { loadCards } from './cards.js';
import { isGeneratorPath, inferBiofyzTtsTermMapForCard } from './practice-generators.js?v=20260211';
import { showAlert } from './alerts.js';
import { initEditModal, openEditor, openNewEditor } from './edit-modal.js';
import { escapeHtml, sanitizeDeckHtml } from './sanitize-html.js';
import {
  applyForcedRetryDecision,
  evaluateReviewAttempt,
  includeForcedRetryCards as includeForcedRetryCardsCore,
  nextDueIndexAfterRebuild
} from './review-loop-core.js';

const isEditorActive = () => document.body?.classList.contains('editor-active');

/* Inline local SVG placeholders (`svg[data-src]`) so icons inherit currentColor. */
async function inlineSvg(el) {
  if (!el) return;
  const url = el.getAttribute('data-src');
  if (!url) return;
  try {
    const res = await fetch(url);
    const txt = await res.text();
    const svg = new DOMParser().parseFromString(txt, 'image/svg+xml').documentElement;

    // Let CSS control size; keep viewBox/paths
    svg.removeAttribute('width');
    svg.removeAttribute('height');

    // Preserve classes/ARIA
    svg.setAttribute('class', el.getAttribute('class') || '');
    if (el.hasAttribute('aria-hidden')) svg.setAttribute('aria-hidden', el.getAttribute('aria-hidden'));

    el.replaceWith(svg);
  } catch (e) {
    console.error('Failed to inline SVG:', url, e);
  }
}
async function loadTopRightIcons() {
  const icons = Array.from(document.querySelectorAll('svg[data-src]'));
  await Promise.all(icons.map(icon => inlineSvg(icon)));
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Persistence keys â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const SESSION_KEY        = 'FLASH_SESSION_V1';
const LEARN_KEY          = 'LEARN_STARS_V1';
const LEARN_ACTIVE_GROUP = 'LEARN_ACTIVE_GROUP';
const TTS_KEY            = 'TTS_ENABLED_V1';
const TTS_FACE_PREFS_KEY = 'TTS_FACE_PREFS_V1';
const TTS_VOICE_FRONT_KEY = 'TTS_VOICE_FRONT_V1';
const TTS_VOICE_BACK_KEY  = 'TTS_VOICE_BACK_V1';
const MCQ_ANSWERS_ON_CARD_KEY = 'MCQ_ANSWERS_ON_CARD_V1';
const COMBO_BEST_KEY     = 'COMBO_BEST_V1';
const STAR_CFG_KEY       = 'STAR_CFG_V1';
const DECK_PATH_KEY      = 'DECK_PATH_V1';
const RECENT_DECKS_KEY   = 'RECENT_DECKS_V1';
const RECENT_DECK_LIMIT  = 3;
const NON_DECK_JSON_FILENAMES = new Set(['fsrs_params.json', 'manifest.json']);
const FSRS_PARAMS_URLS = [
  'config/fsrs_params.json',
  'decks/fsrs_params.json'
];
const STATIC_DECK_FALLBACKS = [
  'cards_4.json',
  'unified_decks_compact.json',
  'deck_1.json',
  'latin_drill_mode.json'
];
const GENERATOR_DECKS = [
  { name: 'Biofyz Practice (generated)', path: 'gen:biofyz' }
];
const SAMPLE_DECK = [
  {
    id: 'sample-1',
    front: 'Flashcards are loaded via fetch(). Start a local server.',
    back: 'Run "python -m http.server" from the project root, then open http://localhost:8000/.'
  }
];
const DEFAULT_MCQ_CAP    = 4;
const DEFAULT_MCQ_ANSWERS_ON_CARD = true;
const LATIN_PREFS_KEY    = 'LATIN_DRILL_PREFS_V1';
const BIOFYZ_PREFS_KEY   = 'BIOFYZ_GENERATOR_PREFS_V1';
const DEFAULT_LATIN_LEVEL = 3;
const DRILL_LEVEL = {
  SINGLE: 1,
  PAIR: 2,
  PHRASE: 3,
  EXTENDED: 4,
  SENTENCE: 5
};
const DRILL_LEVEL_LABELS = {
  1: 'Single word',
  2: 'Pair',
  3: 'Phrase',
  4: 'Extended',
  5: 'Sentence'
};
const DEFAULT_LATIN_PREFS = {
  level: DEFAULT_LATIN_LEVEL,
  declensions: { I: true, II: true, III: true, IV: true, V: true }
};
const DEFAULT_BIOFYZ_PREFS = {
  reynolds: true,
  nernst: true,
  osmotic_pi: true,
  osmotic_isotonic: true,
  molarity_c: true,
  molarity_dilution: true,
  arterial: true,
  arterial_mean_bp: true,
  arterial_aneurysm: true,
  arterial_pulmonary_speed: true,
  photon_lambda: true,
  photon_energy: true,
  photoelectric: true,
  xray_emax: true,
  sound: true,
  sound_loudspeaker_pressure: true,
  acoustic_impedance: true,
  eye: true,
  microscope: true,
  microscope_magnification: true,
  nearpoint: true,
  farpoint: true,
  debroglie: true,
  decay_lambda: true,
  decay_half_life: true,
  ear: true,
  ultrasound_transmission_pct: true,
  ultrasound_transmitted_intensity: true,
  shielding_intensity: true,
  shielding_dual_board: true,
  dose_equivalent_mixed: true,
  ct: true,
  median: true,
  quartile: true,
  iqr: true,
  cv: true,
  ciupper: true,
  tstat: true,
  relfreq: true,
  condprob_cond: true,
  condprob_neither: true,
  hypotest_alpha: true,
  hypotest_power: true,
  negpred_npv: true,
  negpred_ppv: true,
  sensneg: true,
  cardiac_output: true,
  ecg_avf_zero: true,
  ecg_avl_zero: true,
  ecgprac_axis: true,
  ecgprac_rate: true,
  ef_esv_decrease: true,
  ef_from_sv_esv: true
};
const DECLENSION_TO_ROMAN = new Map([
  ['1', 'I'],
  ['I', 'I'],
  ['2', 'II'],
  ['2m_us', 'II'],
  ['2m_er', 'II'],
  ['2n', 'II'],
  ['II', 'II'],
  ['3', 'III'],
  ['3mf', 'III'],
  ['3mf_i', 'III'],
  ['3n', 'III'],
  ['3n_i', 'III'],
  ['III', 'III'],
  ['4', 'IV'],
  ['4m', 'IV'],
  ['4n', 'IV'],
  ['IV', 'IV'],
  ['5', 'V'],
  ['V', 'V']
]);


function getSavedDeckPath(){ try { return localStorage.getItem(DECK_PATH_KEY) || ''; } catch { return ''; } }
function saveDeckPath(p){ try { localStorage.setItem(DECK_PATH_KEY, String(p||'')); } catch {} }
function loadRecentDeckPaths() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_DECKS_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    const out = [];
    raw.forEach(value => {
      const normalized = normalizeDeckPath(value);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      out.push(normalized);
    });
    return out.slice(0, RECENT_DECK_LIMIT);
  } catch {
    return [];
  }
}
function saveRecentDeckPaths(paths = []) {
  const seen = new Set();
  const clean = [];
  paths.forEach(value => {
    const normalized = normalizeDeckPath(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    clean.push(normalized);
  });
  try {
    localStorage.setItem(RECENT_DECKS_KEY, JSON.stringify(clean.slice(0, RECENT_DECK_LIMIT)));
  } catch {}
}
function rememberRecentDeckPath(path) {
  const normalized = normalizeDeckPath(path);
  if (!normalized) return loadRecentDeckPaths();
  const existing = loadRecentDeckPaths().filter(p => p !== normalized);
  const next = [normalized].concat(existing).slice(0, RECENT_DECK_LIMIT);
  saveRecentDeckPaths(next);
  return next;
}
function basenameOfPath(input = '') {
  const raw = String(input || '')
    .trim()
    .split('#')[0]
    .split('?')[0]
    .replace(/\\/g, '/');
  const parts = raw.split('/').filter(Boolean);
  return String(parts[parts.length - 1] || '').toLowerCase();
}
function isExcludedDeckPath(input = '') {
  const base = basenameOfPath(input);
  return !!base && NON_DECK_JSON_FILENAMES.has(base);
}
function normalizeDeckPath(input){
  if (!input) return '';
  let p = String(input).trim();
  if (!p) return '';
  if (p.toLowerCase().startsWith('gen:reynolds')) {
    p = `gen:biofyz${p.slice('gen:reynolds'.length)}`;
  }
  if (isGeneratorPath(p)) return p;
  // Leave full URLs untouched for loading.
  if (/^[a-z]+:\/\//i.test(p)) return p;
  p = p.replace(/\\/g, '/');
  const isAbsWin = /^[a-zA-Z]:\//.test(p);
  const isAbsPosix = p.startsWith('/');
  const isUNC = p.startsWith('//');
  // Allow absolute/relative paths; if plain name, assume under decks/
  if (!p.includes('/') && !isAbsWin && !isAbsPosix && !isUNC) p = `decks/${p}`;
  if (!/\.json$/i.test(p)) p += '.json';
  if (isExcludedDeckPath(p)) return '';
  return p;
}

function isBiofyzGeneratorPath(path) {
  if (!isGeneratorPath(path)) return false;
  const normalized = String(path || '').trim().toLowerCase();
  return normalized.startsWith('gen:biofyz') || normalized.startsWith('gen:bio');
}

function buildBiofyzTypesParam() {
  const enabled = Object.keys(DEFAULT_BIOFYZ_PREFS)
    .filter(key => (biofyzPrefs?.[key] !== false));
  if (!enabled.length) return Object.keys(DEFAULT_BIOFYZ_PREFS).join(',');
  return enabled.join(',');
}

function resolveBiofyzPathForLoad(path) {
  if (!isBiofyzGeneratorPath(path)) return path;
  const raw = String(path || '').trim();
  const [base, query = ''] = raw.split('?');
  const params = new URLSearchParams(query);
  const types = buildBiofyzTypesParam();
  if (types) params.set('types', types);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

function normalizeDeckPathForSave(input) {
  if (!input) return '';
  let p = String(input).trim();
  if (!p) return '';
  if (isGeneratorPath(p)) return '';
  // Strip query/hash to keep file path stable.
  p = p.split('#')[0].split('?')[0];
  p = p.replace(/\\/g, '/');
  // If a URL was provided, extract just the pathname.
  if (/^[a-z]+:\/\//i.test(p)) {
    try {
      const url = new URL(p);
      p = url.pathname.replace(/^\/+/, '');
    } catch {}
  }
  const isAbsWin = /^[a-zA-Z]:\//.test(p);
  const isAbsPosix = p.startsWith('/');
  const isUNC = p.startsWith('//');
  if (!p.includes('/') && !isAbsWin && !isAbsPosix && !isUNC) p = `decks/${p}`;
  if (!/\.json$/i.test(p)) p += '.json';
  if (isExcludedDeckPath(p)) return '';
  return p;
}

function deckWriterBases() {
  const bases = [];
  const override = window.DECK_WRITER_URL || localStorage.getItem('DECK_WRITER_URL');
  if (override) bases.push(String(override).replace(/\/+$/, ''));
  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  const host = window.location.hostname;
  if (host && host !== '0.0.0.0') bases.push(`${protocol}//${host}:8002`);
  bases.push(`${protocol}//127.0.0.1:8002`);
  bases.push(`${protocol}//localhost:8002`);
  return Array.from(new Set(bases.filter(Boolean)));
}

function deckWriterApiKey() {
  const fromWindow = typeof window.DECK_WRITER_API_KEY === 'string' ? window.DECK_WRITER_API_KEY : '';
  const fromStorage = localStorage.getItem('DECK_WRITER_API_KEY') || '';
  return String(fromWindow || fromStorage || '').trim();
}

function deckWriterHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const apiKey = deckWriterApiKey();
  if (apiKey) headers['X-API-Key'] = apiKey;
  return headers;
}

async function listDecksFromServer(){
  try {
    const res = await fetch('decks/manifest.json', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      const rawList = Array.isArray(data)
        ? data
        : (Array.isArray(data?.decks) ? data.decks : []);
      const items = rawList
        .map(entry => {
          if (typeof entry === 'string') {
            const name = entry.split('/').pop() || entry;
            return { name, path: entry.includes('/') ? entry : `decks/${entry}` };
          }
          if (entry && typeof entry === 'object') {
            const rawPath = String(entry.path || entry.name || '').trim();
            const rawName = String(entry.name || rawPath.split('/').pop() || '').trim();
            if (!rawPath && !rawName) return null;
            return {
              name: rawName || (rawPath.split('/').pop() || ''),
              path: rawPath.includes('/') ? rawPath : `decks/${rawPath || rawName}`
            };
          }
          return null;
        })
        .filter(item => item && item.name && item.path)
        .filter(item => /\.json$/i.test(item.path) && !isExcludedDeckPath(item.path));
      const seen = new Set();
      return items.filter(o => (seen.has(o.path.toLowerCase()) ? false : seen.add(o.path.toLowerCase())));
    }
  } catch {}
  try {
    const res = await fetch('decks/');
    const txt = await res.text();
    const doc = new DOMParser().parseFromString(txt, 'text/html');
    const anchors = Array.from(doc.querySelectorAll('a'));
    const names = anchors
      .map(a => a.getAttribute('href') || '')
      .filter(href => href && !href.endsWith('/') && href.toLowerCase().endsWith('.json') && !href.startsWith('?') && !isExcludedDeckPath(href))
      .map(name => ({ name, path: `decks/${decodeURIComponent(name)}` }));
    // Deduplicate by name
    const seen = new Set();
    return names.filter(o => (seen.has(o.name)?false:seen.add(o.name)));
  } catch {
    return [];
  }
}

async function determineInitialDeckPath(){
  // 1) URL param wins
  try {
    const q = new URLSearchParams(location.search).get('deck');
    if (q) {
      const p = normalizeDeckPath(q);
      if (p) {
        saveDeckPath(p);
        return p;
      }
    }
  } catch {}
  // 2) Saved choice
  const saved = getSavedDeckPath();
  if (saved) {
    const normalizedSaved = normalizeDeckPath(saved);
    if (normalizedSaved) return normalizedSaved;
  }
  // 3) First deck listed under /decks
  const list = await listDecksFromServer();
  if (list.length) {
    const preferred = list.find(d => d.name.toLowerCase() === 'cards.json');
    return normalizeDeckPath((preferred?.path) || list[0].path);
  }
  // 4) Fallback to a bundled deck
  return normalizeDeckPath(STATIC_DECK_FALLBACKS[0] || 'cards.json');
}

function cloneLatinDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_LATIN_PREFS));
}

function cloneBiofyzDefaults() {
  return { ...DEFAULT_BIOFYZ_PREFS };
}

function clampLatinLevel(value) {
  const num = Math.round(Number(value));
  if (!Number.isFinite(num)) return DEFAULT_LATIN_LEVEL;
  return Math.max(1, Math.min(5, num));
}

function loadLatinDrillPrefs() {
  const defaults = cloneLatinDefaults();
  try {
    const saved = JSON.parse(localStorage.getItem(LATIN_PREFS_KEY) || 'null');
    if (!saved) return defaults;
    let derivedLevel = saved.level;
    if (derivedLevel == null && saved.styles) {
      derivedLevel = saved.styles.sentence ? 5 :
        saved.styles.phrase ? 4 :
        saved.styles.noun_adj ? 3 :
        saved.styles.single ? 1 :
        defaults.level;
    }
    const level = clampLatinLevel(derivedLevel ?? defaults.level);
    return {
      level,
      declensions: { ...defaults.declensions, ...(saved.declensions || {}) }
    };
  } catch {
    return defaults;
  }
}

function persistLatinDrillPrefs(prefs = latinDrillPrefs) {
  try {
    localStorage.setItem(LATIN_PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}

function loadBiofyzPrefs() {
  const defaults = cloneBiofyzDefaults();
  try {
    const raw = localStorage.getItem(BIOFYZ_PREFS_KEY) || 'null';
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object') return defaults;
    const merged = { ...defaults };
    Object.keys(defaults).forEach(key => {
      if (Object.prototype.hasOwnProperty.call(saved, key)) {
        merged[key] = saved[key] !== false;
      }
    });
    const legacyGroups = {
      osmotic: ['osmotic_pi', 'osmotic_isotonic'],
      molarity: ['molarity_c', 'molarity_dilution'],
      arterial: ['arterial', 'arterial_mean_bp', 'arterial_aneurysm', 'arterial_pulmonary_speed'],
      photon: ['photon_lambda', 'photon_energy'],
      sound: ['sound', 'sound_loudspeaker_pressure'],
      nearpoint: ['nearpoint', 'farpoint'],
      decay: ['decay_lambda', 'decay_half_life'],
      ultrasound: ['ultrasound_transmission_pct', 'ultrasound_transmitted_intensity'],
      shielding: ['shielding_intensity', 'shielding_dual_board'],
      condprob: ['condprob_cond', 'condprob_neither'],
      hypotest: ['hypotest_alpha', 'hypotest_power'],
      negpred: ['negpred_npv', 'negpred_ppv'],
      ecg: ['ecg_avf_zero', 'ecg_avl_zero'],
      ecgprac: ['ecgprac_axis', 'ecgprac_rate'],
      ef: ['ef_esv_decrease', 'ef_from_sv_esv']
    };
    Object.entries(legacyGroups).forEach(([legacyKey, splitKeys]) => {
      if (!Object.prototype.hasOwnProperty.call(saved, legacyKey)) return;
      const legacyEnabled = saved[legacyKey] !== false;
      splitKeys.forEach(splitKey => {
        if (!Object.prototype.hasOwnProperty.call(saved, splitKey) && Object.prototype.hasOwnProperty.call(merged, splitKey)) {
          merged[splitKey] = legacyEnabled;
        }
      });
    });
    if (Object.prototype.hasOwnProperty.call(saved, 'alpha') && !Object.prototype.hasOwnProperty.call(saved, 'hypotest_alpha')) {
      merged.hypotest_alpha = saved.alpha !== false;
    }
    if (Object.prototype.hasOwnProperty.call(saved, 'power') && !Object.prototype.hasOwnProperty.call(saved, 'hypotest_power')) {
      merged.hypotest_power = saved.power !== false;
    }
    return merged;
  } catch {
    return defaults;
  }
}

function persistBiofyzPrefs(prefs = biofyzPrefs) {
  try {
    localStorage.setItem(BIOFYZ_PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}

function syncBiofyzPrefsGlobal() {
  try {
    window.__biofyzPrefs = { ...biofyzPrefs };
  } catch {}
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Star targets (easy to tweak & persist) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const MIN_STAR_TARGET = 0;
const MAX_STAR_TARGET = 10;
const LEGACY_DEFAULT_STAR_TARGET = 5;
const STAR_CFG_VERSION = 4;
const DEFAULT_STAR_TARGETS = { diagram: 0, text: 0 };

const normalizeStarTarget = (value, fallback = MIN_STAR_TARGET) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const rounded = Math.round(num);
  return Math.max(MIN_STAR_TARGET, Math.min(MAX_STAR_TARGET, rounded));
};

function persistStarTargets(targets = starTargets) {
  try {
    const payload = {
      diagram: normalizeStarTarget(targets.diagram, DEFAULT_STAR_TARGETS.diagram),
      text: normalizeStarTarget(targets.text, DEFAULT_STAR_TARGETS.text),
      version: STAR_CFG_VERSION
    };
    localStorage.setItem(STAR_CFG_KEY, JSON.stringify(payload));
  } catch {}
}

function loadStarTargets() {
  const fallback = { ...DEFAULT_STAR_TARGETS };
  try {
    const saved = JSON.parse(localStorage.getItem(STAR_CFG_KEY) || 'null');
    if (!saved) return { targets: fallback, persist: true };

    const version = Number(saved.version ?? 0);
    if (!version) {
      const diagram = normalizeStarTarget(saved.diagram, LEGACY_DEFAULT_STAR_TARGET);
      const text = normalizeStarTarget(saved.text, LEGACY_DEFAULT_STAR_TARGET);
      const looksLegacyDefault = diagram === LEGACY_DEFAULT_STAR_TARGET && text === LEGACY_DEFAULT_STAR_TARGET;
      const migrated = looksLegacyDefault ? fallback : { diagram, text };
      return { targets: migrated, persist: true };
    }

    if (version < STAR_CFG_VERSION) {
      return { targets: { ...fallback }, persist: true };
    }

    const targets = {
      diagram: normalizeStarTarget(saved.diagram, fallback.diagram),
      text: normalizeStarTarget(saved.text, fallback.text)
    };
    return { targets, persist: false };
  } catch {
    return { targets: fallback, persist: true };
  }
}

const { targets: initialStarTargets, persist: shouldPersistTargets } = loadStarTargets();
let starTargets = initialStarTargets;
if (shouldPersistTargets) persistStarTargets();

/**
 * Change learning star targets at runtime (for testing).
 * Example: setStarTargets(3, 1) â†’ diagram=3â˜…, text=1â˜…
 */
function setStarTargets(diagram, text, opts = { persist: true, rebuild: true }) {
  if (Number.isFinite(+diagram)) starTargets.diagram = normalizeStarTarget(diagram, starTargets.diagram);
  if (Number.isFinite(+text))    starTargets.text    = normalizeStarTarget(text, starTargets.text);
  if (opts.persist) persistStarTargets();
  if (opts.rebuild && allCards.length) {
    rebuildDueList();
    renderDue(false);
  }
}
window.setStarTargets = setStarTargets;

function applyStarsFromURL() {
  try {
    const q = new URLSearchParams(location.search).get('stars'); // formats: "5,1" or "2x1"
    if (!q) return;
    const parts = q.split(/[x,;|]/).map(s => Number(s.trim())).filter(n => Number.isFinite(n));
    if (parts.length === 2) setStarTargets(parts[0], parts[1], { persist: true, rebuild: false });
    else if (parts.length === 1) setStarTargets(parts[0], parts[0], { persist: true, rebuild: false });
  } catch {}
}

const SESSION_LIMIT_MIN = 1;
const SESSION_LIMIT_MAX = 500;
let sessionCardLimit = 0;

function parseSessionLimitFromURL() {
  try {
    const params = new URLSearchParams(location.search);
    const raw = params.get('session') ?? params.get('limit');
    if (raw == null || raw === '') return 0;
    const parsed = Math.round(Number(raw));
    if (!Number.isFinite(parsed) || parsed < SESSION_LIMIT_MIN) return 0;
    return Math.min(SESSION_LIMIT_MAX, parsed);
  } catch {
    return 0;
  }
}

function applySessionLimitFromURL() {
  sessionCardLimit = parseSessionLimitFromURL();
}

function enforceSessionLimit() {
  if (!Array.isArray(dueArr) || !dueArr.length || sessionCardLimit <= 0) return;
  if (dueArr.length <= sessionCardLimit) return;
  dueArr = dueArr.slice(0, sessionCardLimit);
}

/* Diagram detector + targetStars resolver */
const isDiagramCard = (c) =>
  !!(c?.diagramId || c?.mask || c?.image || c?.imageFront || (Array.isArray(c?.occlusions) && c.occlusions.length) || c?.type === 'diagram');

const targetStars = (c) => (isDiagramCard(c) ? starTargets.diagram : starTargets.text);
const zeroStarsMode = () => (starTargets.diagram === 0 && starTargets.text === 0);

const DEFAULT_TTS_FACE_PREFS = { front: false, back: true };
const DEFAULT_TTS_VOICE = 'tr-TR-AhmetNeural';
const DEFAULT_LATIN_TTS_VOICE = 'it-IT-GiuseppeNeural';
const CZECH_TTS_VOICE_PREFERRED = 'cs-CZ-VlastaNeural';
const LATIN_TTS_VOICE_CANDIDATES = [
  DEFAULT_LATIN_TTS_VOICE,
  'it-IT-DiegoNeural',
  'it-IT-EnricoNeural'
];
function normalizeTtsFacePrefs(src = {}) {
  return {
    front: src.front === undefined ? DEFAULT_TTS_FACE_PREFS.front : !!src.front,
    back:  src.back === undefined  ? DEFAULT_TTS_FACE_PREFS.back  : !!src.back
  };
}

let ttsFacePrefs = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(TTS_FACE_PREFS_KEY) || '{}');
    return normalizeTtsFacePrefs(saved);
  } catch {
    return { ...DEFAULT_TTS_FACE_PREFS };
  }
})();

function normalizeTtsVoiceValue(value, fallback = DEFAULT_TTS_VOICE) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

let ttsVoicePrefs = (() => {
  try {
    const front = normalizeTtsVoiceValue(localStorage.getItem(TTS_VOICE_FRONT_KEY));
    const back = normalizeTtsVoiceValue(localStorage.getItem(TTS_VOICE_BACK_KEY));
    return { front, back };
  } catch {
    return { front: DEFAULT_TTS_VOICE, back: DEFAULT_TTS_VOICE };
  }
})();

function persistTtsVoicePrefs() {
  try {
    localStorage.setItem(TTS_VOICE_FRONT_KEY, ttsVoicePrefs.front);
    localStorage.setItem(TTS_VOICE_BACK_KEY, ttsVoicePrefs.back);
  } catch {}
}

const LANGUAGE_NAME_TO_CODE = {
  english: 'en',
  turkish: 'tr',
  spanish: 'es',
  french: 'fr',
  german: 'de',
  italian: 'it',
  portuguese: 'pt',
  russian: 'ru',
  japanese: 'ja',
  chinese: 'zh',
  korean: 'ko',
  greek: 'el',
  polish: 'pl',
  latin: 'la'
};

function normalizeLangValue(value) {
  if (!value) return '';
  return String(value).trim();
}

function normalizeLangCode(value) {
  const raw = normalizeLangValue(value);
  if (!raw) return '';
  const lower = raw.toLowerCase();
  const mapped = LANGUAGE_NAME_TO_CODE[lower] || lower;
  return mapped.split(/[-_]/)[0];
}

function getCardFaceLanguage(card, isBack) {
  if (!card) return '';
  const faceKey = isBack ? 'back' : 'front';
  const lang = card.lang;
  let value = '';
  if (lang && typeof lang === 'object' && !Array.isArray(lang)) {
    value = lang[faceKey] ?? '';
  }
  if (!value) {
    value = isBack ? (card.langBack ?? '') : (card.langFront ?? '');
  }
  if (!value && typeof lang === 'string') value = lang;
  return normalizeLangValue(value);
}

function getCardFaceTermMap(card, isBack, faceText = '') {
  if (!card || typeof card !== 'object') return null;
  const tts = (card.tts && typeof card.tts === 'object') ? card.tts : null;
  if (tts) {
    const explicit = isBack
      ? (tts.backTermMap || tts.termMapBack || tts.termMap || null)
      : (tts.frontTermMap || tts.termMapFront || null);
    if (explicit) return explicit;
  }
  if (String(card.archetype || '').toLowerCase() !== 'maths') return null;
  try {
    return inferBiofyzTtsTermMapForCard(card, { text: faceText }) || null;
  } catch {
    return null;
  }
}

function voiceMatchesLang(voice, langCode) {
  const normalizedLang = normalizeLangCode(langCode);
  if (!voice || !normalizedLang) return false;
  const lower = String(voice).toLowerCase();
  return lower.startsWith(`${normalizedLang}-`) || lower.startsWith(`${normalizedLang}_`);
}

function pickLatinVoice() {
  const options = Array.isArray(window.__ttsVoiceOptions) ? window.__ttsVoiceOptions : [];
  for (const name of LATIN_TTS_VOICE_CANDIDATES) {
    if (options.includes(name)) return name;
  }
  const fallback = options.find(name => /^it-IT-/i.test(name));
  return fallback || DEFAULT_LATIN_TTS_VOICE;
}

function pickCzechVoice() {
  const options = Array.isArray(window.__ttsVoiceOptions) ? window.__ttsVoiceOptions : [];
  if (options.includes(CZECH_TTS_VOICE_PREFERRED)) return CZECH_TTS_VOICE_PREFERRED;
  const vlasta = options.find(name => /^cs[-_]/i.test(name) && /vlasta/i.test(name));
  return vlasta || CZECH_TTS_VOICE_PREFERRED;
}

function pickVoiceForLanguage(langCode) {
  const normalizedLang = normalizeLangCode(langCode);
  if (!normalizedLang) return '';
  if (normalizedLang === 'cs') return pickCzechVoice();
  if (normalizedLang === 'la') {
    const latinVoice = pickLatinVoice();
    if (latinVoice) return latinVoice;
  }
  const frontVoice = normalizeTtsVoiceValue(ttsVoicePrefs.front);
  if (voiceMatchesLang(frontVoice, normalizedLang)) return frontVoice;
  const backVoice = normalizeTtsVoiceValue(ttsVoicePrefs.back);
  if (voiceMatchesLang(backVoice, normalizedLang)) return backVoice;
  return '';
}

let activeTtsVoice = '';

function ensureTtsVoiceForFace(isBack) {
  let card = null;
  if (typeof window.__getCardById === 'function') {
    const id = currentCardId();
    if (id != null) card = window.__getCardById(id);
  }
  const faceLang = getCardFaceLanguage(card, isBack);
  const langVoice = faceLang ? pickVoiceForLanguage(faceLang) : '';
  const desired = langVoice || normalizeTtsVoiceValue(isBack ? ttsVoicePrefs.back : ttsVoicePrefs.front);
  if (!desired || desired === activeTtsVoice) return;
  activeTtsVoice = desired;
  setVoice(desired);
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Learning state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
let learnMap = (() => { try { return JSON.parse(localStorage.getItem(LEARN_KEY) || '{}'); } catch { return {}; } })();
const saveLearn  = () => { try { localStorage.setItem(LEARN_KEY, JSON.stringify(learnMap)); } catch {} };
const getProg    = id => Math.max(0, Math.min(MAX_STAR_TARGET, Number(learnMap[String(id)] ?? 0)));
const setProg    = (id, v) => {
  const quantized = Math.round(v * 2) / 2;
  learnMap[String(id)] = Math.max(0, Math.min(MAX_STAR_TARGET, quantized));
  saveLearn();
};
let activeGroup  = localStorage.getItem(LEARN_ACTIVE_GROUP) || '';

/* Per-card session flags */
let penalizedThisCard = false;
let awardedThisCard   = false;
let hintUsedThisCard  = false;

/* Combo counter (gamified streak) */
const COMBO_THRESHOLDS = [4, 10, 20, 30];
const OVERHEAT_THRESHOLD = 3;
let comboCount = 0;
let bestCombo  = (() => { try { return Math.max(0, Number(localStorage.getItem(COMBO_BEST_KEY) || 0)); } catch { return 0; } })();
const comboTimers = new Map();
const comboEls = { host: null, count: null, best: null };
const streakEls = { flame: null, fire: null, digit: null, maskDigit: null, lottie: null };
let comboDisplay = 0;
const comboReelQueue = [];
let comboReelTimer = null;
let lastFlameScale = 1;
let streakPositionRaf = null;
let streakPositionTimeout = null;
let streakCardObserver = null;
let streakPositioned = false;

// --- Streak flame helpers ---
function ensureStreakFlame() {
  if (streakEls.flame?.isConnected) return streakEls;
  const flame = document.getElementById('streak-flame');
  if (!flame) return null;
  streakEls.flame = flame;
  streakEls.fire = document.getElementById('fire-player');
  streakEls.digit = document.getElementById('digit-main');
  streakEls.maskDigit = document.getElementById('digit-clip-text');

  if (streakEls.fire && !streakEls.lottie && window.lottie) {
    streakEls.lottie = lottie.loadAnimation({
      container: streakEls.fire,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      path: 'fire.json'
    });
  }
  const card = document.querySelector('.flashcard');
  if (card && !streakCardObserver && window.ResizeObserver) {
    streakCardObserver = new ResizeObserver(() => settleStreakPosition());
    streakCardObserver.observe(card);
  }
  return streakEls;
}

function positionStreakFlame() {
  if (streakPositionRaf) return;
  streakPositionRaf = requestAnimationFrame(() => {
    streakPositionRaf = null;
    const els = ensureStreakFlame();
    if (!els || !els.flame) return;
    const meter = els.flame.closest('.combo-meter');
    if (!meter) return;
    // Let CSS positioning pin it inline with the toolbar; just ensure it's visible and reset any inline offsets.
    meter.style.position = '';
    meter.style.left = '';
    meter.style.top = '';
    meter.style.right = '';
    meter.style.bottom = '';
    meter.style.opacity = '1';
    meter.style.visibility = 'visible';
    streakPositioned = true;
  });
}

function settleStreakPosition() {
  positionStreakFlame();
  clearTimeout(streakPositionTimeout);
  streakPositionTimeout = setTimeout(() => positionStreakFlame(), 60);
}

function renderStreakFlame(val = 0) {
  const els = ensureStreakFlame();
  if (!els || !els.flame) return;
  const text = String(Math.max(0, Math.floor(val)));
  if (els.digit) els.digit.textContent = text;
  if (els.maskDigit) els.maskDigit.textContent = text;

  // Keep badge fully sharp: disable transform scaling for flame and digit layers.
  if (els.fire) els.fire.style.transform = '';
  els.flame.style.transform = '';
  lastFlameScale = 1;

  // Lock glyph metrics so rendering stays stable at every combo value.
  if (els.digit) {
    els.digit.setAttribute('font-size', '60');
    els.digit.setAttribute('stroke-width', '4');
  }
  if (els.maskDigit) {
    els.maskDigit.setAttribute('font-size', '60');
  }

  els.flame.style.setProperty('--flame-shadow-blur', '4px');

  positionStreakFlame();
}

// Reel the displayed combo through intermediate numbers for a slot-machine feel.
function applyComboDisplay(val = 0) {
  const displayVal = Math.max(0, Math.floor(val));
  const host = ensureComboMeter();
  const text = String(displayVal);
  if (comboEls.count && comboEls.count.textContent !== text) {
    comboEls.count.textContent = text;
  }
  renderStreakFlame(displayVal);
  comboDisplay = displayVal;
}
function getComboReelDelay() {
  const maxMs = 90;
  const minMs = 8;
  const span = 1; // renderStreakFlame clamps scale between 1 and 2
  const t = Math.min(1, Math.max(0, (lastFlameScale - 1) / span));
  return Math.round(maxMs - t * (maxMs - minMs));
}
function pumpComboReel() {
  if (!comboReelQueue.length) {
    comboReelTimer = null;
    return;
  }
  const nextVal = comboReelQueue.shift();
  applyComboDisplay(nextVal);
  comboReelTimer = setTimeout(pumpComboReel, getComboReelDelay());
}
function reelComboTo(target, { immediate = false } = {}) {
  const safeTarget = Math.max(0, Math.floor(target || 0));
  if (comboReelTimer) {
    clearTimeout(comboReelTimer);
    comboReelTimer = null;
  }
  comboReelQueue.length = 0;
  const start = comboDisplay;
  if (immediate || safeTarget === start) {
    applyComboDisplay(safeTarget);
    return;
  }
  const step = safeTarget > start ? 1 : -1;
  for (let v = start + step; ; v += step) {
    comboReelQueue.push(v);
    if (v === safeTarget) break;
  }
  pumpComboReel();
}

window.addEventListener('DOMContentLoaded', () => {
  reelComboTo(comboCount, { immediate: true });
  settleStreakPosition();
  window.addEventListener('load', () => {
    requestAnimationFrame(settleStreakPosition);
    setTimeout(settleStreakPosition, 50);
  });
  window.addEventListener('resize', settleStreakPosition);
  window.addEventListener('scroll', settleStreakPosition, { passive: true });
  document.addEventListener('fullscreenchange', settleStreakPosition);
});

function persistBestCombo(v) { try { localStorage.setItem(COMBO_BEST_KEY, String(v)); } catch {} }
function comboTier(v = comboCount) {
  let tier = 0;
  for (const t of COMBO_THRESHOLDS) { if (v >= t) tier = t; }
  return tier;
}
function ensureComboMeter() {
  if (comboEls.host?.isConnected) return comboEls.host;
  const existing = document.querySelector('.combo-meter');
  if (!existing) return null;
  comboEls.host = existing;
  comboEls.count = existing.querySelector('#digit-main') || existing.querySelector('.combo-count');
  comboEls.best = null;
  return existing;
}
function pulseComboClass(cls, ms = 420) {
  const host = ensureComboMeter();
  if (!host) return;
  host.classList.add(cls);
  clearTimeout(comboTimers.get(cls));
  const timer = setTimeout(() => host.classList.remove(cls), ms);
  comboTimers.set(cls, timer);
}
function renderCombo({ pop = false, broken = false, threshold = false, newBest = false } = {}) {
  const host = ensureComboMeter();
  if (!host) return;
  reelComboTo(comboCount);

  const tier = comboTier();
  if (tier) host.dataset.comboTier = String(tier);
  else delete host.dataset.comboTier;

  // Keep the badge stationary (no jitter/scale from CSS variables)
  host.style.setProperty('--combo-scale', '1');
  host.style.setProperty('--combo-jx', '0px');
  host.style.setProperty('--combo-jy', '0px');

  // Overheat state for low-but-hot threshold (arcade feel)
  host.classList.toggle('combo-overheat', comboCount >= OVERHEAT_THRESHOLD);

  // Keep visible even at 0
  host.classList.add('is-active');

  if (pop)       pulseComboClass('combo-pop', 220);
  if (threshold) pulseComboClass('combo-threshold', 750);
  if (broken)    pulseComboClass('combo-broken', 800);
  if (newBest)   pulseComboClass('combo-newbest', 1100);
}
function setCombo(next, opts = {}) {
  comboCount = Math.max(0, Math.floor(next || 0));
  const gotNewBest = comboCount > bestCombo;
  if (gotNewBest) { bestCombo = comboCount; persistBestCombo(bestCombo); }
  renderCombo({ ...opts, newBest: opts.newBest || gotNewBest });
}
function breakCombo() {
  if (!comboCount) return;
  setCombo(0, { broken: true });
}
function bumpCombo({ attempts = 1, hintUsed = false } = {}) {
  if (hintUsed) return breakCombo();
  if (attempts > 1) return; // don't penalize multi-select correctness
  const prevTier = comboTier(comboCount);
  const nextVal  = comboCount + 1;
  const nextTier = comboTier(nextVal);
  setCombo(nextVal, { pop: true, threshold: nextTier > prevTier });
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ MCQ display prefs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
let mcqAnswersOnCard = (() => {
  try {
    const raw = localStorage.getItem(MCQ_ANSWERS_ON_CARD_KEY);
    if (raw == null) return DEFAULT_MCQ_ANSWERS_ON_CARD;
    return raw === '1' || raw === 'true';
  } catch {
    return DEFAULT_MCQ_ANSWERS_ON_CARD;
  }
})();
MCQ.setMCQAnswersOnCard?.(mcqAnswersOnCard);

function persistMcqAnswersOnCard() {
  try { localStorage.setItem(MCQ_ANSWERS_ON_CARD_KEY, mcqAnswersOnCard ? '1' : '0'); } catch {}
}

function setMcqAnswersOnCard(next, { rerender = true } = {}) {
  const desired = !!next;
  if (mcqAnswersOnCard === desired) return;
  mcqAnswersOnCard = desired;
  persistMcqAnswersOnCard();
  MCQ.setMCQAnswersOnCard?.(mcqAnswersOnCard);
  updateMcqSettingsChip?.({});
  if (!rerender) return;
  const id = currentCardId();
  if (id != null) renderById(id);
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ TTS state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
let ttsOn = (() => { try { return localStorage.getItem(TTS_KEY) === '1'; } catch { return false; } })();
let ttsEndpoint = '';
let syncingFaceFromSpeaker = false;
let syncingSpeakerFromFace = false;
let syncTtsPrefControls = () => {};
let updateLatinSettingsChip = () => {};
let closeLatinSettingsPanel = () => {};
let updateBiofyzSettingsChip = () => {};
let closeBiofyzSettingsPanel = () => {};
let updateMcqSettingsChip = () => {};
let closeMcqSettingsPanel = () => {};
let visibleCardId = null;

function persistTtsFacePrefs() {
  try { localStorage.setItem(TTS_FACE_PREFS_KEY, JSON.stringify(ttsFacePrefs)); } catch {}
}

if (!ttsOn && (ttsFacePrefs.front || ttsFacePrefs.back)) {
  ttsFacePrefs.front = false;
  ttsFacePrefs.back = false;
  persistTtsFacePrefs();
} else if (ttsOn && !ttsFacePrefs.front && !ttsFacePrefs.back) {
  ttsFacePrefs.front = true;
  ttsFacePrefs.back = true;
  persistTtsFacePrefs();
}

// Point to the TTS server on the same host as the page (works over LAN)
const initVoice = normalizeTtsVoiceValue(ttsVoicePrefs.back);
try {
  const proto = window.location.protocol;
  const host  = window.location.hostname || 'localhost';
  ttsEndpoint = `${proto}//${host}:8001`;
  initTTS({ endpoint: ttsEndpoint, voice: initVoice });
  activeTtsVoice = initVoice;
} catch {
  ttsEndpoint = 'http://127.0.0.1:8001';
  initTTS({ endpoint: ttsEndpoint, voice: initVoice });
  activeTtsVoice = initVoice;
}

const ttsLoadingEl = document.getElementById('ttsLoading');
const ttsLoadingTextEl = document.getElementById('ttsLoadingText') || ttsLoadingEl?.querySelector('.tts-loading-text');
const ttsRetryBtn = document.getElementById('ttsRetryBtn');
let ttsUnavailable = false;
function setTtsLoadingUi(active) {
  if (!ttsLoadingEl) return;
  if (!!active) {
    ttsUnavailable = false;
    ttsLoadingEl.classList.remove('unavailable');
    if (ttsRetryBtn) ttsRetryBtn.hidden = true;
    if (ttsLoadingTextEl) ttsLoadingTextEl.textContent = 'Loading';
  }
  ttsLoadingEl.classList.toggle('active', !!active);
  ttsLoadingEl.setAttribute('aria-hidden', (active || ttsUnavailable) ? 'false' : 'true');
}
function setTtsUnavailableUi(active, retryAt = 0) {
  if (!ttsLoadingEl) return;
  ttsUnavailable = !!active;
  ttsLoadingEl.classList.toggle('active', !!active);
  ttsLoadingEl.classList.toggle('unavailable', !!active);
  ttsLoadingEl.setAttribute('aria-hidden', active ? 'false' : 'true');
  if (ttsRetryBtn) ttsRetryBtn.hidden = !active;
  if (ttsLoadingTextEl) {
    if (!active) ttsLoadingTextEl.textContent = 'Loading';
    else if (Number.isFinite(retryAt) && retryAt > Date.now()) ttsLoadingTextEl.textContent = 'TTS unavailable';
    else ttsLoadingTextEl.textContent = 'TTS retry ready';
  }
}
window.addEventListener('tts-loading', (event) => {
  setTtsLoadingUi(!!event?.detail?.active);
});
window.addEventListener('tts-status', (event) => {
  const state = String(event?.detail?.state || '');
  const retryAt = Number(event?.detail?.retryAt || 0);
  if (state === 'cooldown') {
    setTtsUnavailableUi(true, retryAt);
    return;
  }
  if (state === 'retry-ready') {
    setTtsUnavailableUi(true, 0);
    return;
  }
  setTtsUnavailableUi(false, 0);
});
ttsRetryBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  retryTTSNow();
  setTtsUnavailableUi(false, 0);
  requestSpeakVisibleFace({ forceImmediate: true });
});

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â€œLatest-onlyâ€ speak scheduler + de-dupe + immediate kill â”€â”€â”€ */
let lastSpokenKey = '';          // `${cardId}|${face}|${text}`
let pendingSpeakTimer = null;    // debounce handle
let speakEpoch = 0;              // increments to invalidate stale timers
const SPEAK_DEBOUNCE_MS = 140;   // limits edge_tts calls when cycling fast

// Suppress auto-TTS during live editing/preview
let __suppressTTS = false;
window.setSuppressTTS = function(on){
  __suppressTTS = !!on;
  if (__suppressTTS) { clearPendingSpeak(); stop(); }
};

function setVisibleCardId(id) {
  visibleCardId = id == null ? null : id;
}
function currentCardId() {
  return visibleCardId ?? (dueArr[dueIndex]?.id) ?? (history[histPos] ?? null);
}
function getVisibleFaceIsBack() {
  const cardEl = document.querySelector('.flashcard');
  if (!cardEl) return false;
  // When a new card renders we briefly keep the old `flipped` class but hide the back via data-hide-back.
  // Treat that state as "front showing" so we don't read the back text prematurely.
  const backTemporarilyHidden = cardEl.getAttribute('data-hide-back') === '1' || cardEl.hasAttribute('data-hide-back');
  if (backTemporarilyHidden) return false;
  return cardEl.classList.contains('flipped');
}

const CLOZE_TTS_RE = /{{\s*c[^:}]*::([\s\S]*?)(?:::(?:[\s\S]*?))?\s*}}/gi;
function replaceClozeForTts(text, { keepValue = true } = {}) {
  const raw = String(text ?? '');
  if (!raw) return '';
  return raw.replace(CLOZE_TTS_RE, (_match, value) => {
    if (!keepValue) return ' ';
    const val = value == null ? '' : String(value);
    return (val.split('|')[0] ?? '').trim();
  });
}

/** Get current face text; if back face has no visible text, fall back to hidden data-tts. */
function currentFaceTextFromDOM() {
  const cardEl = document.querySelector('.flashcard');
  if (!cardEl) return '';
  const isBack = getVisibleFaceIsBack();
  const sel = isBack ? '.flashcard__back' : '.flashcard__front';
  const el = cardEl.querySelector(sel);
  const hidden = typeof el?.dataset?.tts === 'string' ? el.dataset.tts.trim() : '';
  let txt = hidden || (el?.innerText || '').trim();

  let card = null;
  if (typeof window.__getCardById === 'function') {
    const id = currentCardId();
    if (id != null) card = window.__getCardById(id);
  }
  if (!hidden && card) {
    const rawFace = isBack
      ? (card.back_text ?? card.back ?? '')
      : (card.front_text ?? card.front ?? '');
    if (rawFace) txt = String(rawFace).trim();
  }
  if (txt) {
    const raw = txt.replace(/\r\n/g, '\n');
    const hasHtml = /<[^>]+>/.test(raw);
    if (hasHtml) {
      txt = raw
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{2,}/g, '\n')
        .trim();
    } else {
      txt = raw
        .split(/\n+/)
        .map(line => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join('\n');
    }
  }

  const allowedByGlobal = isBack ? !!ttsFacePrefs.back : !!ttsFacePrefs.front;
  if (!allowedByGlobal) return '';

  let speakAllowed = true;
  const ttsCfg = (card && card.tts && typeof card.tts === 'object') ? card.tts : null;
  const isDiagramCard = !!(card && (card.type === 'diagram' || (card.mask && Array.isArray(card.mask.regions)) || card.maskRegion));

  if (isBack) {
    if (ttsCfg && ttsCfg.readBack !== undefined) {
      speakAllowed = !!ttsCfg.readBack;
    }
  } else {
    if (ttsCfg && ttsCfg.readFront !== undefined) {
      speakAllowed = !!ttsCfg.readFront;
    } else if (isDiagramCard) {
      speakAllowed = false;
    }
  }

  if (!speakAllowed) return '';

  if (txt && card && typeof window.__stripSilentText === 'function') {
    const cleaned = window.__stripSilentText(card, txt, { keepClozeValue: isBack, trimLatinLemma: !isBack });
    if (typeof cleaned === 'string') txt = cleaned;
  }
  if (txt) {
    txt = txt.replace(/\[\s*\.\.\.\s*\]/g, ' ');
    txt = replaceClozeForTts(txt, { keepValue: isBack });
    txt = txt
      .split(/\n+/)
      .map(line => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n');
  }

  txt = typeof txt === 'string' ? txt.trim() : '';
  if (!txt) return '';

  return txt;
}

/** Schedule a speak for the current face. */
function requestSpeakVisibleFace({ forceImmediate = false } = {}) {
  if (!ttsOn || __suppressTTS) return;

  const text = currentFaceTextFromDOM();
  if (!text) return;

  const isBack = getVisibleFaceIsBack();
  const face = isBack ? 'B' : 'F';
  const id   = currentCardId();
  const key  = `${id}|${face}|${text}`;
  let card = null;
  if (typeof window.__getCardById === 'function' && id != null) {
    card = window.__getCardById(id);
  }
  const faceLang = getCardFaceLanguage(card, isBack);
  const faceTermMap = getCardFaceTermMap(card, isBack, text);

  // If not forced and identical face/text â†’ skip
  if (!forceImmediate && key === lastSpokenKey) return;

  // Always cancel anything currently playing/fetching
  stop();

  // De-bounce fetch to minimize edge_tts calls when user is scrolling
  clearTimeout(pendingSpeakTimer);
  const myEpoch = speakEpoch; // capture epoch at schedule time
  const run = () => {
    if (myEpoch !== speakEpoch) return;   // stale: card/face changed â†’ skip
    lastSpokenKey = key;                  // mark before starting so rapid repeats still collapse
    ensureTtsVoiceForFace(isBack);
    speak(text, { lang: faceLang, termMap: faceTermMap }).catch(()=>{});            // errors are non-fatal for UX
  };

  if (forceImmediate) {
    run(); // used when toggling ON â†’ speak *now* on the shown face
  } else {
    pendingSpeakTimer = setTimeout(run, SPEAK_DEBOUNCE_MS);
  }
}

function clearPendingSpeak() {
  clearTimeout(pendingSpeakTimer);
  pendingSpeakTimer = null;
}

function bumpSpeakEpoch() {
  speakEpoch++;
  clearPendingSpeak();
}

function updateSpeakerFromFacePrefs({ suppressSpeak = true } = {}) {
  if (syncingFaceFromSpeaker) return;
  const anyEnabled = !!(ttsFacePrefs.front || ttsFacePrefs.back);
  if (anyEnabled && !ttsOn) {
    syncingSpeakerFromFace = true;
    setTTS(true, { syncFacePrefs: false, suppressSpeak });
    syncingSpeakerFromFace = false;
  } else if (!anyEnabled && ttsOn) {
    syncingSpeakerFromFace = true;
    setTTS(false, { syncFacePrefs: false });
    syncingSpeakerFromFace = false;
  }
}

function handleTtsFacePrefChanged(face, enabled) {
  if (face !== 'front' && face !== 'back') return;
  bumpSpeakEpoch();

  if (!syncingFaceFromSpeaker) {
    updateSpeakerFromFacePrefs({ suppressSpeak: true });
  }

  updateAudioIcon();

  if (!ttsOn) return;

  const visibleIsBack = getVisibleFaceIsBack();
  const affectsVisible = (face === 'back' && visibleIsBack) || (face === 'front' && !visibleIsBack);

  if (!enabled) {
    if (affectsVisible) stop();
    return;
  }

  if (affectsVisible) {
    lastSpokenKey = '';
    requestSpeakVisibleFace({ forceImmediate: true });
  }
}

function handleTtsVoicePrefChanged(face) {
  if (face !== 'front' && face !== 'back') return;
  if (!ttsOn) return;
  const visibleIsBack = getVisibleFaceIsBack();
  const affectsVisible = (face === 'back' && visibleIsBack) || (face === 'front' && !visibleIsBack);
  if (!affectsVisible) return;
  lastSpokenKey = '';
  requestSpeakVisibleFace({ forceImmediate: true });
}

/* Toggle + icon sync + hard kill */
function setTTS(on, { syncFacePrefs = false, suppressSpeak = false } = {}) {
  const prev = ttsOn;
  ttsOn = !!on;
  try { localStorage.setItem(TTS_KEY, ttsOn ? '1' : '0'); } catch {}

  if (!ttsOn && prev) { // turning OFF
    clearPendingSpeak();
    stop();                 // kill fetch + audio instantly
    setTtsLoadingUi(false);
  }
  if (ttsOn && !prev && !suppressSpeak && !syncingSpeakerFromFace) {    // turning ON: read the currently visible face immediately
    // Reset de-dupe so current face speaks even if same as last time
    lastSpokenKey = '';
    requestSpeakVisibleFace({ forceImmediate: true });
  }

  if (syncFacePrefs) {
    const desired = !!ttsOn;
    const prevFront = ttsFacePrefs.front;
    const prevBack = ttsFacePrefs.back;
    syncingFaceFromSpeaker = true;
    ttsFacePrefs.front = desired;
    ttsFacePrefs.back = desired;
    persistTtsFacePrefs();
    syncTtsPrefControls();
    if (prevFront !== desired) handleTtsFacePrefChanged('front', desired);
    if (prevBack !== desired) handleTtsFacePrefChanged('back', desired);
    syncingFaceFromSpeaker = false;
  }

  updateAudioIcon();
}
function toggleTTS() { setTTS(!ttsOn, { syncFacePrefs: true }); }

function updateAudioIcon() {
  const btn = document.querySelector('.audio-btn');
  if (!btn) return;
  const anyEnabled = !!(ttsFacePrefs.front || ttsFacePrefs.back);
  btn.dataset.tts = anyEnabled ? 'on' : 'off';
  btn.setAttribute('aria-pressed', String(anyEnabled));
  btn.setAttribute('aria-label', anyEnabled ? 'Turn TTS off' : 'Turn TTS on');
  btn.querySelector('.icon-on')?.toggleAttribute('hidden', !anyEnabled);
  btn.querySelector('.icon-off')?.toggleAttribute('hidden',  anyEnabled);
}


/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ NEW: Zoom mode state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
let calculatorAppOn = false;
let calculatorBusy = false;

function getCalculatorApiBase() {
  return (ttsEndpoint || 'http://127.0.0.1:8001').replace(/\/+$/, '');
}

function updateCalculatorButtonState(on = calculatorAppOn) {
  const btn = document.querySelector('.calc-btn');
  if (!btn) return;
  const active = !!on;
  btn.dataset.calc = active ? 'on' : 'off';
  btn.setAttribute('aria-pressed', String(active));
  btn.setAttribute('aria-label', active ? 'Close local calculator' : 'Open local calculator');
  btn.title = active ? 'Close local calculator' : 'Open local calculator';
  btn.disabled = !!calculatorBusy;
}

async function callCalculatorApi(path, { method = 'GET', body } = {}) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${getCalculatorApiBase()}${path}`, init);
  let data = null;
  try { data = await res.json(); } catch {}
  return { res, data };
}

function buildCalculatorStartPayload() {
  const executable = (typeof window.__LOCAL_CALCULATOR_EXE === 'string')
    ? window.__LOCAL_CALCULATOR_EXE.trim()
    : '';
  const model = (typeof window.__LOCAL_CALCULATOR_MODEL === 'string')
    ? window.__LOCAL_CALCULATOR_MODEL.trim()
    : '';
  const cwd = (typeof window.__LOCAL_CALCULATOR_CWD === 'string')
    ? window.__LOCAL_CALCULATOR_CWD.trim()
    : '';
  if (!executable && !model && !cwd) return undefined;
  const payload = { focus: true };
  if (executable) payload.executable = executable;
  if (model) payload.model = model;
  if (cwd) payload.cwd = cwd;
  return payload;
}

async function syncCalculatorState({ quiet = true } = {}) {
  try {
    const { res, data } = await callCalculatorApi('/api/local-calc/status');
    if (!res.ok) throw new Error(data?.error || `status ${res.status}`);
    calculatorAppOn = !!data?.running;
    updateCalculatorButtonState(calculatorAppOn);
    return true;
  } catch {
    calculatorAppOn = false;
    updateCalculatorButtonState(false);
    if (!quiet) {
      showAlert('warning', 'Calculator Offline', 'Could not reach local calculator API on port 8001.');
    }
    return false;
  }
}

async function setCalculatorApp(on) {
  if (calculatorBusy) return;
  calculatorBusy = true;
  updateCalculatorButtonState(calculatorAppOn);
  const desired = !!on;
  try {
    const route = desired ? '/api/local-calc/start' : '/api/local-calc/stop';
    const payload = desired ? buildCalculatorStartPayload() : undefined;
    const { res, data } = await callCalculatorApi(route, { method: 'POST', body: payload });
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || `request failed (${res.status})`);
    }
    calculatorAppOn = !!data.running;
    updateCalculatorButtonState(calculatorAppOn);
    if (desired && !calculatorAppOn) {
      showAlert('warning', 'Calculator Not Running', 'The local calculator did not start.');
    }
  } catch (err) {
    calculatorAppOn = false;
    updateCalculatorButtonState(false);
    const message = String(err?.message || '').trim()
      || 'No local calculator executable was found. Set LOCAL_CALCULATOR_EXE and restart the 8001 server.';
    showAlert('warning', 'Calculator Error', message);
  } finally {
    calculatorBusy = false;
    updateCalculatorButtonState(calculatorAppOn);
  }
}

let zoomMode = false;          // OFF by default
let lens = null;               // .magnifier-lens (mounted in document.body)
let lensContent = null;        // .magnifier-content
const MAG_SCALE = 2.0;         // reasonable default magnification
const LENS_SIZE = 240;         // matches CSS diameter

function setZoomMode(on) {
  zoomMode = !!on;
  const btn = document.querySelector('.zoom-btn');
  if (btn) {
    btn.dataset.zoom = zoomMode ? 'on' : 'off';
    btn.setAttribute('aria-pressed', String(zoomMode));
  }
}
/** Copy any <canvas> pixels when cloning faces so diagrams show inside lens. */
function copyCanvasBitmaps(srcRoot, dstRoot) {
  const src = Array.from(srcRoot.querySelectorAll('canvas'));
  const dst = Array.from(dstRoot.querySelectorAll('canvas'));
  for (let i = 0; i < Math.min(src.length, dst.length); i++) {
    const s = src[i], d = dst[i];
    try {
      d.width = s.width; d.height = s.height;
      const ctx = d.getContext('2d');
      ctx.drawImage(s, 0, 0);
    } catch {}
  }
}

function createLens(cardEl) {
  destroyLens(); // ensure single instance

  lens = document.createElement('div');
  lens.className = 'magnifier-lens';
  // mount OUTSIDE the card to avoid its 3D flip context
  lens.style.position = 'fixed';
  lens.style.width = `${LENS_SIZE}px`;
  lens.style.height = `${LENS_SIZE}px`;
  lens.style.zIndex = '9999';

  lensContent = document.createElement('div');
  lensContent.className = 'magnifier-content';
  lensContent.style.willChange = 'transform';

  // Clone the visible face and neutralize back-face rotation
  const faceSel = cardEl.classList.contains('flipped') ? '.flashcard__back' : '.flashcard__front';
  const face = cardEl.querySelector(faceSel);
  if (face) {
    const clone = face.cloneNode(true);
    clone.style.pointerEvents = 'none';
    if (clone.classList.contains('flashcard__back')) {
      clone.style.transform = 'none'; // neutralize 180Â° so movement isnâ€™t inverted
    }
    clone.style.width = `${cardEl.clientWidth}px`;
    clone.style.height = `${cardEl.clientHeight}px`;

    // Ensure images fit in clone as in the card
    clone.querySelectorAll('img,canvas').forEach(el => {
      el.style.width = '100%';
      el.style.height = '100%';
      el.style.objectFit = 'contain';
      el.style.borderRadius = 'inherit';
    });

    copyCanvasBitmaps(face, clone);
    lensContent.appendChild(clone);
  }

  lens.appendChild(lensContent);
  document.body.appendChild(lens);
}

function destroyLens() {
  if (lens && lens.parentNode) lens.parentNode.removeChild(lens);
  lens = null;
  lensContent = null;
}

function updateLensPosition(cardEl, e) {
  if (!lens || !lensContent) return;

  // Keep the lens centered on the pointer (viewport coords)
  lens.style.left = `${e.clientX - LENS_SIZE / 2}px`;
  lens.style.top  = `${e.clientY - LENS_SIZE / 2}px`;

  // Compute pointer relative to the card for translating the cloned face
  const rect = cardEl.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  // No Y inversion even on back; we neutralized rotation on the clone.
  lensContent.style.transform =
    `translate(${-x * MAG_SCALE + LENS_SIZE / 2}px, ${-y * MAG_SCALE + LENS_SIZE / 2}px) scale(${MAG_SCALE})`;
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Session persistence â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && typeof s === 'object'
      ? { lastId: s.lastId ?? null, history: Array.isArray(s.history) ? s.history : null, histPos: Number.isInteger(s.histPos) ? s.histPos : null }
      : null;
  } catch { return null; }
}
const saveSession = (() => {
  let t = null;
  return function () {
    clearTimeout(t);
    t = setTimeout(() => {
      try {
        const lastId = history[histPos] ?? (dueArr[dueIndex]?.id ?? null);
        localStorage.setItem(SESSION_KEY, JSON.stringify({ lastId, history, histPos }));
      } catch {}
    }, 80);
  };
})();

/* Dev reset */
const FSRS_KEYS = { cards: 'FSRS_CARDS_V1', logs: 'FSRS_LOGS_V1', params: 'FSRS_PARAMS_V1' };

function loadStoredFsrs() {
  try {
    return JSON.parse(localStorage.getItem(FSRS_KEYS.cards) || '{}');
  } catch {
    return {};
  }
}

function persistStoredFsrs(data) {
  try {
    localStorage.setItem(FSRS_KEYS.cards, JSON.stringify(data));
  } catch {}
}

window.resetProgress = function () {
  const deckKey = normalizeDeckPath(currentDeckPath || '');
  if (!deckKey) return;
  const all = loadStoredFsrs();
  const changed = { ...all };
  delete changed[deckKey];
  persistStoredFsrs(changed);
  if (window.fsrs?.resetDeck) {
    window.fsrs.resetDeck(deckKey);
  }
  showAlert('info','Deck Progress Cleared',`FSRS history reset for ${deckKey.replace(/^.*\//,'')}.`);
};

window.resetAllProgress = function () {
  [FSRS_KEYS.cards, FSRS_KEYS.logs, FSRS_KEYS.params, SESSION_KEY, LEARN_KEY, LEARN_ACTIVE_GROUP, TTS_KEY, STAR_CFG_KEY].forEach(k => {
    try { localStorage.removeItem(k); } catch {}
  });
  showAlert('info','All Progress Cleared','FSRS history, session, learning stars, TTS, and star overrides reset for all decks.');
};

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ UI/alerts helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function ensureAlertStyles() {
  if (document.getElementById('alerts-css')) return;
  const link = document.createElement('link');
  link.id = 'alerts-css';
  link.rel = 'stylesheet';
  // Use relative path to work under file:// and http(s)://
  link.href = 'css/alerts.css';
  document.head.appendChild(link);
}

let currentHintEl = null;
let lastHintAnswer = '';

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Deck & due state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
let allCards = [];
let dueArr   = [];
let dueIndex = 0;
let sessionSkipTail = [];
let forcedRetryIds = new Set();
let history  = [];
let histPos  = -1;

function resetSessionSkipTail() { sessionSkipTail = []; }
function markSessionSkipped(ids = []) {
  if (!Array.isArray(ids) || !ids.length) return;
  const next = sessionSkipTail.filter(id => !ids.some(x => String(x) === String(id)));
  ids.forEach(id => { const s = String(id); if (s) next.push(s); });
  const cap = Math.max(50, dueArr.length || 0); // avoid unbounded growth
  sessionSkipTail = cap ? next.slice(-cap) : next;
}
function applySessionSkipOrdering() {
  if (!dueArr.length || !sessionSkipTail.length) return;
  const currentId = currentCardId();
  const skipOrder = sessionSkipTail.filter(Boolean);
  const skipSet = new Set(skipOrder);

  const remaining = [];
  const skipped = new Map();
  for (const c of dueArr) {
    const cid = String(c.id);
    if (skipSet.has(cid)) skipped.set(cid, c);
    else remaining.push(c);
  }

  const orderedSkipped = [];
  for (const id of skipOrder) {
    const card = skipped.get(id);
    if (card && !orderedSkipped.includes(card)) orderedSkipped.push(card);
  }
  sessionSkipTail = skipOrder.filter(id => skipped.has(id)); // prune stale ids
  if (!orderedSkipped.length) return;

  dueArr = remaining.concat(orderedSkipped);
  const idx = dueArr.findIndex(c => String(c.id) === String(currentId));
  if (idx !== -1) dueIndex = idx;
  else dueIndex = Math.max(0, Math.min(dueIndex, Math.max(0, dueArr.length - 1)));
}
function isSessionSkippedId(id) {
  const sid = String(id);
  return sessionSkipTail.some(x => String(x) === sid);
}
function firstNonSkippedIndex(startIdx = 0) {
  if (!dueArr.length) return -1;
  const n = dueArr.length;
  for (let step = 0; step < n; step++) {
    const idx = (startIdx + step) % n;
    const id = dueArr[idx]?.id;
    if (!isSessionSkippedId(id)) return idx;
  }
  return -1;
}
function nextNonSkippedIndex(afterIdx = -1) {
  if (!dueArr.length) return -1;
  const start = Number.isInteger(afterIdx) ? afterIdx : -1;
  const n = dueArr.length;
  for (let step = 1; step <= n; step++) {
    const idx = (start + step) % n;
    const id = dueArr[idx]?.id;
    if (!isSessionSkippedId(id)) return idx;
  }
  return -1;
}
function ensureDueIndexOnUnskipped() {
  if (!dueArr.length) return;
  if (!isSessionSkippedId(dueArr[dueIndex]?.id)) return;
  const idx = firstNonSkippedIndex(dueIndex);
  if (idx !== -1) dueIndex = idx;
}

function markForcedRetryId(id) {
  if (id == null) return;
  forcedRetryIds.add(String(id));
}
function clearForcedRetryId(id) {
  if (id == null) return;
  forcedRetryIds.delete(String(id));
}
function clearForcedRetries() {
  forcedRetryIds.clear();
}
function pruneForcedRetryIds() {
  if (!forcedRetryIds.size) return;
  const live = new Set((allCards || []).map(c => String(c.id)));
  const next = new Set();
  forcedRetryIds.forEach(id => { if (live.has(id)) next.add(id); });
  forcedRetryIds = next;
}
function includeForcedRetryCards(list = []) {
  return includeForcedRetryCardsCore({
    baseDue: Array.isArray(list) ? list : [],
    allCards: Array.isArray(allCards) ? allCards : [],
    forcedRetryIds,
    sortCards: sortByDue
  });
}

const MAX_SWIPE_UNDOS = 20;
let swipeUndoStack = [];
const clearSwipeUndoStack = () => { swipeUndoStack.length = 0; };
let swipeAnimating = false;
const SWIPE_ANIM_TIMEOUT = 700;
const isAnimating = () => swipeAnimating;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* Due counter */
const deckCounterRefs = { root: null, due: null, current: null, total: null };
function ensureDeckCounterRefs() {
  if (!deckCounterRefs.root) {
    deckCounterRefs.root = document.querySelector('.deck-counter');
    deckCounterRefs.due = deckCounterRefs.root?.querySelector('[data-counter-due]') || null;
    deckCounterRefs.current = deckCounterRefs.root?.querySelector('[data-counter-current]') || null;
    deckCounterRefs.total = deckCounterRefs.root?.querySelector('[data-counter-total]') || null;
  }
  return deckCounterRefs;
}
function updateDeckCounter() {
  const { root, due, current, total } = ensureDeckCounterRefs();
  if (!root) return;
  const dueCount = Array.isArray(dueArr) ? dueArr.length : 0;
  if (due) due.textContent = dueCount;
  const totalCount = Array.isArray(allCards) ? allCards.length : 0;
  const seenCount = new Set(history.filter(id => id != null).map(id => String(id))).size;
  const clampedSeen = Math.min(seenCount, totalCount);
  if (current) current.textContent = clampedSeen;
  if (total) total.textContent = totalCount;
  if (due) root.setAttribute('aria-label', `Due cards: ${dueCount}`);
  else root.setAttribute('aria-label', `Deck progress: ${clampedSeen} of ${totalCount}`);
}

/* Sort mode for tie-breaks within same-due cards (does not change FSRS times) */
const SORT_MODE_KEY = 'CARD_SORT_MODE_V1';
const SortMode = Object.freeze({ JSON: 'json', ALPHA: 'alpha', RANDOM: 'random' });
let sortMode = (() => {
  const v = localStorage.getItem(SORT_MODE_KEY);
  return (v === SortMode.ALPHA || v === SortMode.RANDOM) ? v : SortMode.JSON;
})();

function normalizeDueDate(value, now = new Date()) {
  let parsed = null;
  if (value instanceof Date) {
    parsed = new Date(value);
  } else if (typeof value === 'string') {
    const d = new Date(value);
    parsed = Number.isFinite(d.getTime()) ? d : null;
  } else if (typeof value === 'number') {
    if (Number.isFinite(value)) {
      if (Math.abs(value) < 1e11) {
        const base = startOfToday(now);
        const days = Math.max(0, Math.round(value));
        base.setDate(base.getDate() + days);
        parsed = base;
      } else {
        parsed = new Date(value);
      }
    }
  }
  if (!parsed || !Number.isFinite(parsed.getTime())) parsed = new Date(now);
  const minDue = startOfToday(now);
  return parsed < minDue ? minDue : parsed;
}

function formatLocalDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) return 'n/a';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const CLOZE_RE = /\s*{{c\d+::(.*?)(?:::(.*?))?}}/gi;

function extractClozeAnswers(text) {
  const raw = String(text ?? '');
  if (!/{{c\d+::/i.test(raw)) return [];
  const out = [];
  raw.replace(CLOZE_RE, (_, answer) => {
    const value = String(answer ?? '').replace(/[\u00A0\u202F\u2007\u2060\uFEFF]/g, ' ').trim();
    if (value) out.push(value);
    return '';
  });
  return out;
}

function ensureClozeAnswers(card) {
  if (!card) return;
  const hasCorrect = Array.isArray(card.correct) && card.correct.length > 0;
  if (hasCorrect) return;
  const front = card.front ?? '';
  const back = card.back ?? '';
  let answers = extractClozeAnswers(front);
  if (!answers.length) answers = extractClozeAnswers(back);
  if (!answers.length) return;
  const seen = new Set();
  const unique = [];
  answers.forEach(ans => {
    const key = normalizeAnswer(ans);
    if (!key || seen.has(key)) return;
    seen.add(key);
    unique.push(ans);
  });
  if (unique.length) card.correct = unique;
}

function normalizeCardMeta(cards = [], now = new Date()) {
  if (!Array.isArray(cards)) return [];
  cards.forEach((c, idx) => {
    if (!Number.isFinite(c.__loadIndex)) c.__loadIndex = idx;
    if (!Number.isFinite(c.__rand)) c.__rand = Math.random();
    c.due            = normalizeDueDate(c.due, now);
    c.lastReviewed   = c.lastReviewed ? new Date(c.lastReviewed) : now;
    c.state          = c.state ?? 'New';
    c.reps           = Number.isFinite(c.reps) ? c.reps : 0;
    c.lapses         = Number.isFinite(c.lapses) ? c.lapses : 0;
    c.learning_steps = Number.isFinite(c.learning_steps) ? c.learning_steps : 0;
    c.scheduled_days = Number.isFinite(c.scheduled_days) ? c.scheduled_days : 0;
    c.elapsed_days   = Number.isFinite(c.elapsed_days) ? c.elapsed_days : 0;
    c.stability      = Number.isFinite(c.stability) ? c.stability : 1;
    c.difficulty     = Number.isFinite(c.difficulty) ? c.difficulty : 4;
    ensureClozeAnswers(c);
  });
  return cards;
}

function seedDeckIntegrations(cards, now = new Date()) {
  MCQ.seedMCQPool?.(cards);
  configureDeckSettings(cards);
  if (!isGeneratorPath(currentDeckPath)) {
    window.fsrs?.seedDeck(cards, now, currentDeckPath);
  }
}

function setSortMode(mode = 'json') {
  const m = String(mode).toLowerCase();
  if (![SortMode.JSON, SortMode.ALPHA, SortMode.RANDOM].includes(m)) return;
  sortMode = m;
  try { localStorage.setItem(SORT_MODE_KEY, sortMode); } catch {}
  rebuildDueList();
  renderDue(false);
}
window.setSortMode = setSortMode;

/* Group (diagram) key */
function groupKey(card) {
  if (card.diagramId) return String(card.diagramId);
  const id = String(card.id ?? '');
  const i  = id.indexOf(':');
  if (i > -1) return id.slice(0, i);
  return card.image || card.imageFront || card.imageBack || `card:${id}`;
}

/* Stars bar (visual only) */
function renderStarsUI(card) {
  const bar = document.querySelector('.top-left-controls');
  if (!bar || !card) return;

  const prog = getProg(card.id);
  const cap = targetStars(card);
  const required = normalizeStarTarget(cap, 0);

  if (required <= 0) {
    bar.innerHTML = '';
    bar.style.display = 'none';
    return;
  }

  const currentStars = bar.querySelectorAll('svg.star').length;
  if (currentStars !== required) {
    bar.innerHTML = '';
    for (let i = 0; i < required; i += 1) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'star');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', '#i-star-empty');
      svg.appendChild(use);
      bar.appendChild(svg);
    }
  }

  bar.style.display = 'flex';

  const clampedProg = Math.max(0, Math.min(required, prog));
  const full = Math.floor(clampedProg);
  const half = (clampedProg - full) >= 0.5 ? 1 : 0;
  const uses = bar.querySelectorAll('use');
  uses.forEach((u, i) => {
    if (i < full) u.setAttribute('href', '#i-star-fill');
    else if (i === full && half) u.setAttribute('href', '#i-star-half');
    else u.setAttribute('href', '#i-star-empty');
  });
}

/* Sort helper that respects FSRS-mirrored Date fields */
function sortByDue(list) {
  const now = new Date();
  const alphaKey = (c) => String(
    c.back_text ?? c.back ?? c.front_text ?? c.front ?? c.id
  ).toLowerCase();
  const groupIdx = (c) => Number.isFinite(c?.mask?.activeIndex) ? c.mask.activeIndex : Number.isFinite(c?.__loadIndex) ? c.__loadIndex : 0;
  return list.slice().sort((a, b) => {
    const ad = +normalizeDueDate(a?.due, now);
    const bd = +normalizeDueDate(b?.due, now);
    if (ad !== bd) return ad - bd; // FSRS order preserved

    const ag = groupKey(a), bg = groupKey(b);
    if (ag === bg) {
      // same group & same due: apply chosen tie-breaker
      if (sortMode === SortMode.ALPHA) {
        const ak = alphaKey(a), bk = alphaKey(b);
        if (ak !== bk) return ak.localeCompare(bk);
      } else if (sortMode === SortMode.RANDOM) {
        const ar = a.__rand ?? 0, br = b.__rand ?? 0;
        if (ar !== br) return ar - br;
      } else { // JSON/original
        const ai = groupIdx(a), bi = groupIdx(b);
        if (ai !== bi) return ai - bi;
      }
    }
    // Final stable tie-break
    const ai = Number.isFinite(a?.__loadIndex) ? a.__loadIndex : 0;
    const bi = Number.isFinite(b?.__loadIndex) ? b.__loadIndex : 0;
    if (ai !== bi) return ai - bi;
    return String(a.id).localeCompare(String(b.id));
  });
}

/* Intra-group ordering that ignores due times entirely.
 * Used for diagram learning groups so we can honor the selected sort mode
 * (original/json, alphabetical, or random) without affecting FSRS scheduling.
 */
function sortWithinGroup(list) {
  const alphaKey = (c) => String(
    c.back_text ?? c.back ?? c.front_text ?? c.front ?? c.id
  ).toLowerCase();
  const groupIdx = (c) => Number.isFinite(c?.mask?.activeIndex) ? c.mask.activeIndex : Number.isFinite(c?.__loadIndex) ? c.__loadIndex : 0;

  if (sortMode === SortMode.RANDOM) {
    return list.slice().sort((a, b) => (a.__rand ?? 0) - (b.__rand ?? 0));
  }
  if (sortMode === SortMode.ALPHA) {
    return list.slice().sort((a, b) => {
      const ak = alphaKey(a), bk = alphaKey(b);
      if (ak !== bk) return ak.localeCompare(bk);
      const ai = groupIdx(a), bi = groupIdx(b);
      if (ai !== bi) return ai - bi;
      return String(a.id).localeCompare(String(b.id));
    });
  }
  // JSON/original
  return list.slice().sort((a, b) => {
    const ai = groupIdx(a), bi = groupIdx(b);
    if (ai !== bi) return ai - bi;
    return String(a.id).localeCompare(String(b.id));
  });
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
function dueBeforeCutoff(due, cutoff, fallbackNow) {
  const dueDate = normalizeDueDate(due, fallbackNow);
  return Number.isFinite(dueDate.getTime()) ? dueDate <= cutoff : true;
}

function fsrsDueList(now = new Date()) {
  if (window.fsrs?.dueNow) {
    return window.fsrs.dueNow(allCards, now, currentDeckPath);
  }
  const cutoff = now;
  const dueNow = allCards.filter(c => {
    try {
      return dueBeforeCutoff(c.due, cutoff, now);
    } catch {
      return true;
    }
  });
  return sortByDue(dueNow);
}

function setDueIndexAfterRebuild({ currentId = null, previousIndex = null, advance = false } = {}) {
  dueIndex = nextDueIndexAfterRebuild({
    dueArr,
    currentId,
    previousIndex,
    advance
  });
}

/* Learn-first due list with diagram group lock */
function rebuildDueList(options = {}) {
  clearSwipeUndoStack();
  const now = new Date();
  const cutoff = now;
  const finalize = () => {
    pruneForcedRetryIds();
    dueArr = includeForcedRetryCards(dueArr);
    enforceSessionLimit();
    setDueIndexAfterRebuild(options);
    applySessionSkipOrdering();
    ensureDueIndexOnUnskipped();
  };
  if (isGeneratorPath(currentDeckPath)) {
    dueArr = Array.isArray(allCards)
      ? allCards.slice().sort((a, b) => (a.__rand ?? 0) - (b.__rand ?? 0))
      : [];
    finalize();
    return;
  }
  // --- Zero-stars test mode: ignore learning; show strictly FSRS due-only ---
  if (zeroStarsMode()) {
    dueArr = fsrsDueList(now);
    finalize();
    return;
  }
  
  // 1) Build learning pool with per-type targets
  const learning = allCards.filter(c => getProg(c.id) < targetStars(c));
  const learningDue = learning.filter(c => {
    try {
      return dueBeforeCutoff(c.due, cutoff, now);
    } catch {
      return true;
    }
  });

  // 2) If any diagram cards are still learning  lock to the active diagram group (finish diagram first)
  const learnDiagrams = learningDue.filter(isDiagramCard);
  if (learnDiagrams.length) {
    if (!learnDiagrams.some(c => groupKey(c) === activeGroup)) {
      const next = learnDiagrams[0];
      activeGroup = next ? groupKey(next) : '';
      if (activeGroup) localStorage.setItem(LEARN_ACTIVE_GROUP, activeGroup);
    }
    const groupCards = learnDiagrams.filter(c => groupKey(c) === activeGroup);
    const diagActiveSorted = sortWithinGroup(groupCards);
    dueArr = diagActiveSorted;
    finalize();
    return; // diagrams have priority while any are in learning
  } else {
    // No diagram learning  clear group lock and rotate ALL text learning (sorted by due)
    activeGroup = '';
    localStorage.removeItem(LEARN_ACTIVE_GROUP);
    const learnText = learningDue.filter(c => !isDiagramCard(c));
    if (learnText.length) {
      dueArr = sortByDue(learnText);
      finalize();
      return;
    }
  }

  // 3) No learning left  pure FSRS phase
  dueArr = fsrsDueList(now);
  finalize();
}


/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Bootstrap â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
async function loadDeckWithFallbacks(preferredPath) {
  const candidates = [];
  const first = normalizeDeckPath(preferredPath);
  if (first) candidates.push(first);

  try {
    const listed = await listDecksFromServer();
    listed.forEach(d => {
      if (d?.path) candidates.push(normalizeDeckPath(d.path));
    });
  } catch {}

  STATIC_DECK_FALLBACKS.forEach(name => candidates.push(normalizeDeckPath(name)));

  const seen = new Set();
  for (const cand of candidates) {
    const path = normalizeDeckPath(cand);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    try {
      const deckPath = resolveBiofyzPathForLoad(path);
      const deck = await loadCards({ shuffleAnswers: true, deckPath });
      return { deck, path };
    } catch (err) {
      console.warn('Deck failed to load', path, err);
    }
  }
  // Last-resort sample when running from file:// where fetch is blocked
  if (typeof window !== 'undefined' && window.location?.protocol === 'file:') {
    console.warn('Falling back to sample deck because fetch is blocked under file://');
    return { deck: SAMPLE_DECK, path: 'sample-deck' };
  }
  return null;
}

function showDeckLoadError(path) {
  const message = `Could not load a deck. Add a JSON deck under /decks (tried ${path || 'default'}) or run a local server (e.g. "python -m http.server").`;
  ensureAlertStyles();
  showAlert('error', 'Deck not found', message);
  primeCardShell(message);
}

async function loadFsrsParamsForDeck(deckPath) {
  if (isGeneratorPath(deckPath)) return false;
  if (!window.fsrs?.setParameters) return false;
  for (const url of FSRS_PARAMS_URLS) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;
      const data = await res.json();
      window.fsrs.setParameters(data, deckPath);
      console.info('FSRS params loaded from', url);
      return true;
    } catch {}
  }
  return false;
}

const FSRS_OPT_URL_KEY = 'FSRS_OPTIMIZER_URL';
const FSRS_OPT_LAST_PREFIX = 'FSRS_OPTIMIZED_AT_';
const FSRS_OPT_MIN_LOGS = 50;
const FSRS_OPT_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6h
const FSRS_OPT_DEFAULT = 'http://localhost:8002/optimize';

async function maybeOptimizeFsrs(deckPath) {
  if (isGeneratorPath(deckPath)) return false;
  const url =
    window.FSRS_OPTIMIZER_URL ||
    localStorage.getItem(FSRS_OPT_URL_KEY) ||
    FSRS_OPT_DEFAULT;
  if (!url || !window.fsrs?.getLogs || !window.fsrs?.setParameters) return false;
  const logs = window.fsrs.getLogs(deckPath);
  if (!Array.isArray(logs) || logs.length < FSRS_OPT_MIN_LOGS) return false;
  const lastKey = `${FSRS_OPT_LAST_PREFIX}${deckPath}`;
  const last = Number(localStorage.getItem(lastKey) || 0);
  if (Date.now() - last < FSRS_OPT_COOLDOWN_MS) return false;

  try {
    const reviewLogs = logs.map(log => {
      const card_id = log.card_id ?? log.id ?? log.cardId ?? log.card ?? null;
      const review_time_raw = log.review ?? log.review_time ?? log.time ?? log.due ?? Date.now();
      const review_time = (review_time_raw instanceof Date ? review_time_raw.getTime() : new Date(review_time_raw).getTime());
      const review_rating = Number(log.review_rating ?? log.rating ?? 0);
      const review_state = Number.isFinite(log.state) ? log.state : undefined;
      return { card_id, review_time, review_rating, review_state, review_duration: undefined };
    }).filter(r => r.card_id != null && Number.isFinite(r.review_time) && Number.isFinite(r.review_rating) && r.review_rating > 0);
    if (!reviewLogs.length) {
      console.warn('FSRS optimizer skipped: no usable review logs');
      return false;
    }
    const tz = Intl?.DateTimeFormat?.().resolvedOptions?.().timeZone || 'UTC';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ deck: deckPath, review_logs: reviewLogs, timezone: tz, day_start: 0 })
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.warn('FSRS optimizer responded with status', res.status, detail);
      return false;
    }
    const params = await res.json();
    window.fsrs.setParameters(params, deckPath);
    localStorage.setItem(lastKey, String(Date.now()));
    console.info('FSRS params optimized from', url);
    return true;
  } catch (e) {
    console.warn('FSRS optimizer failed', e);
    return false;
  }
}

function primeCardShell(text = '') {
  const front = document.querySelector('.flashcard__front');
  const back = document.querySelector('.flashcard__back');
  if (front) front.innerHTML = `<div class="flashcard-text">${escapeHtml(text || 'Loading...')}</div>`;
  if (back) back.innerHTML = '<div class="flashcard-text"></div>';
}

let currentDeckPath = '';
let deckBaseCards = [];
let currentDeckIsLatin = false;
let latinDrillPrefs = loadLatinDrillPrefs();
let biofyzPrefs = loadBiofyzPrefs();
syncBiofyzPrefsGlobal();
let generatorReloading = false;
let refreshDeckSelectionUi = () => {};

async function runApp() {
  primeCardShell('Loading deck...');
  ensureAlertStyles();
  const initialPath = await determineInitialDeckPath();
  const loadedResult = await loadDeckWithFallbacks(initialPath);
  if (!loadedResult) {
    showDeckLoadError(normalizeDeckPath(initialPath));
    return;
  }

  currentDeckPath = loadedResult.path;
  saveDeckPath(currentDeckPath);
  rememberRecentDeckPath(currentDeckPath);

  await loadFsrsParamsForDeck(currentDeckPath);
  await maybeOptimizeFsrs(currentDeckPath);

  const now = new Date();
  const rawDeck = applyLocalEdits(loadedResult.deck, loadedResult.path);
  deckBaseCards = normalizeCardMeta(applyBiofyzFilters(rawDeck, currentDeckPath), now);

  allCards = applyLatinDrillFilters(deckBaseCards.slice());
  currentDeckIsLatin = deckContainsLatin(allCards);
  clearForcedRetries();
  seedDeckIntegrations(allCards, now);

  // Apply overrides from URL before building the queue (does not rebuild immediately)
  applyStarsFromURL();
  applySessionLimitFromURL();

  const sess = loadSession();
  rebuildDueList();
  const hasDue = Array.isArray(dueArr) && dueArr.length > 0;
  if (!hasDue) {
    history = [];
    histPos = -1;
    renderDue(true);
  } else if (sess?.lastId && allCards.some(c => String(c.id) === String(sess.lastId))) {
    history = Array.isArray(sess.history) && sess.history.length ? sess.history : [sess.lastId];
    histPos = Number.isInteger(sess.histPos) ? Math.max(0, Math.min(sess.histPos, history.length - 1))
                                             : history.length - 1;
    renderById(sess.lastId);
  } else {
    renderDue(true);
  }
  setupUI();
  refreshDeckSelectionUi();
  updateLatinSettingsChip();
  updateBiofyzSettingsChip();
  updateMcqSettingsChip();
}

async function reloadDeck(newPath){
  const deckPath = normalizeDeckPath(newPath);
  try {
    bumpSpeakEpoch();
    stop();
    const now = new Date();

    const deckPathForLoad = resolveBiofyzPathForLoad(deckPath);
    let cards = await loadCards({ shuffleAnswers: true, deckPath: deckPathForLoad });
    const rawDeck = applyLocalEdits(cards, deckPath);
    deckBaseCards = normalizeCardMeta(applyBiofyzFilters(rawDeck, deckPath), now);
    allCards = applyLatinDrillFilters(deckBaseCards.slice());
    currentDeckIsLatin = deckContainsLatin(allCards);
    currentDeckPath = deckPath;
    saveDeckPath(deckPath);
    rememberRecentDeckPath(deckPath);

    await loadFsrsParamsForDeck(currentDeckPath);
    await maybeOptimizeFsrs(currentDeckPath);

    seedDeckIntegrations(allCards, now);

    // Reset queues/session to start deck fresh
    history = [];
    histPos = -1;
    dueArr = [];
    dueIndex = 0;
    resetSessionSkipTail();
    rebuildDueList();
    renderDue(true);
    showAlert('success','Deck Loaded', deckPath.replace(/^.*\//,''));
    refreshDeckSelectionUi();
    updateLatinSettingsChip();
    updateBiofyzSettingsChip();
    updateMcqSettingsChip();
  } catch (e) {
    console.error('Failed to reload deck', e);
    showAlert('error','Failed to load deck', String(e?.message||e));
  }
}

async function regenerateGeneratorDeck() {
  if (generatorReloading) return;
  generatorReloading = true;
  try {
    bumpSpeakEpoch();
    stop();
    const now = new Date();
    const deckPath = currentDeckPath;
    const deckPathForLoad = resolveBiofyzPathForLoad(deckPath);
    const cards = await loadCards({ shuffleAnswers: true, deckPath: deckPathForLoad });
    const rawDeck = applyLocalEdits(cards, deckPath);
    deckBaseCards = normalizeCardMeta(applyBiofyzFilters(rawDeck, deckPath), now);
    allCards = applyLatinDrillFilters(deckBaseCards.slice());
    currentDeckIsLatin = deckContainsLatin(allCards);

    if (window.fsrs?.resetDeck) window.fsrs.resetDeck(deckPath);
    seedDeckIntegrations(allCards, now);

    history = [];
    histPos = -1;
    dueArr = [];
    dueIndex = 0;
    clearForcedRetries();
    resetSessionSkipTail();
    rebuildDueList();
    renderDue(true);
  } catch (e) {
    console.error('Failed to regenerate generator deck', e);
    showAlert('error', 'Failed to regenerate deck', String(e?.message||e));
  } finally {
    generatorReloading = false;
  }
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Render helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function configureDeckSettings(cards) {
  const isLatinDeck = deckContainsLatin(cards); // retained for other deck config
  const baseCap = DEFAULT_MCQ_CAP;
  const userCap = MCQ.getMCQDummyCap?.();
  const cap = Number.isFinite(userCap) ? userCap : baseCap;
  MCQ.setMCQMaxChoices?.(cap);
}

function deckContainsLatin(cards) {
  return Array.isArray(cards) && cards.some(isLatinCard);
}

function isLatinCard(card) {
  return typeof card?.type === 'string' && card.type.startsWith('latin');
}

function applyLatinDrillFilters(cards = []) {
  if (!deckContainsLatin(cards)) return cards;
  return cards.filter(card => {
    if (!isLatinCard(card)) return true;
    return levelFilterAllows(card) && declensionFilterAllows(card);
  });
}

function detectBiofyzType(card) {
  const id = String(card?.id || '').toLowerCase();
  if (!id) return '';
  const parts = id.split(':');
  const head = parts[0] || '';
  const variant = parts[2] || '';
  if (id.startsWith('reynolds:')) return 'reynolds';
  if (id.startsWith('nernst:')) return 'nernst';
  if (head === 'osmotic') return variant === 'isotonic' ? 'osmotic_isotonic' : 'osmotic_pi';
  if (head === 'molarity') return variant === 'dilution' ? 'molarity_dilution' : 'molarity_c';
  if (head === 'arterial') {
    if (variant === 'mean_bp') return 'arterial_mean_bp';
    if (variant === 'aneurysm') return 'arterial_aneurysm';
    if (variant === 'pulmonary_speed') return 'arterial_pulmonary_speed';
    return 'arterial';
  }
  if (head === 'photon') return variant === 'energy' ? 'photon_energy' : 'photon_lambda';
  if (id.startsWith('photoelectric:')) return 'photoelectric';
  if (id.startsWith('xray:')) return 'xray_emax';
  if (head === 'sound') return variant === 'loudspeaker_pressure' ? 'sound_loudspeaker_pressure' : 'sound';
  if (id.startsWith('eye:')) return 'eye';
  if (id.startsWith('microscope:')) return variant === 'magnification' ? 'microscope_magnification' : 'microscope';
  if (id.startsWith('nearpoint:')) return 'nearpoint';
  if (id.startsWith('farpoint:')) return 'farpoint';
  if (id.startsWith('debroglie:')) return 'debroglie';
  if (head === 'decay') return variant === 'half_life' ? 'decay_half_life' : 'decay_lambda';
  if (id.startsWith('ear:')) return 'ear';
  if (head === 'ultrasound') return variant === 'intensity' ? 'ultrasound_transmitted_intensity' : 'ultrasound_transmission_pct';
  if (head === 'shielding') return variant === 'dual_board' ? 'shielding_dual_board' : 'shielding_intensity';
  if (head === 'dosimetry') return 'dose_equivalent_mixed';
  if (id.startsWith('ct:')) return 'ct';
  if (id.startsWith('median:')) return 'median';
  if (id.startsWith('quartile:')) return 'quartile';
  if (id.startsWith('iqr:')) return 'iqr';
  if (id.startsWith('cv:')) return 'cv';
  if (id.startsWith('ciupper:')) return 'ciupper';
  if (id.startsWith('tstat:')) return 'tstat';
  if (id.startsWith('relfreq:')) return 'relfreq';
  if (head === 'condprob') return variant === 'neither' ? 'condprob_neither' : 'condprob_cond';
  if (head === 'hypotest') return variant === 'power' ? 'hypotest_power' : 'hypotest_alpha';
  if (id.startsWith('alpha:')) return 'hypotest_alpha';
  if (id.startsWith('power:')) return 'hypotest_power';
  if (head === 'negpred') return variant === 'ppv' ? 'negpred_ppv' : 'negpred_npv';
  if (id.startsWith('sensneg:')) return 'sensneg';
  if (head === 'cardiac') return 'cardiac_output';
  if (head === 'ecg') return variant === 'avl_zero' ? 'ecg_avl_zero' : 'ecg_avf_zero';
  if (head === 'ecgprac') return variant === 'rate' ? 'ecgprac_rate' : 'ecgprac_axis';
  if (head === 'ef') return variant === 'from_sv_esv' ? 'ef_from_sv_esv' : 'ef_esv_decrease';
  return '';
}

function applyBiofyzFilters(cards = [], deckPath = currentDeckPath) {
  if (!Array.isArray(cards)) return [];
  if (!isBiofyzGeneratorPath(deckPath)) return cards;
  const enabled = { ...DEFAULT_BIOFYZ_PREFS, ...(biofyzPrefs || {}) };
  const anyEnabled = Object.keys(DEFAULT_BIOFYZ_PREFS).some(key => enabled[key]);
  if (!anyEnabled) return cards;
  return cards.filter(card => {
    const type = detectBiofyzType(card);
    if (!type) return true;
    return enabled[type] !== false;
  });
}

function levelFilterAllows(card) {
  const target = clampLatinLevel(latinDrillPrefs?.level ?? DEFAULT_LATIN_LEVEL);
  const cardLevel = Number(card?.drillLevel);
  const normalized = Number.isFinite(cardLevel) ? cardLevel : DRILL_LEVEL.SINGLE;
  return normalized === target;
}

function declensionFilterAllows(card) {
  const decls = getCardDeclensions(card);
  if (!decls.length) return true;
  return decls.every(dec => {
    const roman = DECLENSION_TO_ROMAN.get(dec);
    if (!roman) return true;
    const pref = latinDrillPrefs?.declensions?.[roman];
    if (pref === undefined) return true;
    return !!pref;
  });
}

function getCardDeclensions(card) {
  if (Array.isArray(card?.nounDeclensions) && card.nounDeclensions.length) {
    return card.nounDeclensions.filter(Boolean);
  }
  if (typeof card?.declension === 'string') return [card.declension];
  return [];
}

function reapplyLatinDrillFilters() {
  if (!Array.isArray(deckBaseCards) || !deckBaseCards.length) {
    updateLatinSettingsChip();
    return;
  }
  const now = new Date();
  allCards = applyLatinDrillFilters(deckBaseCards.slice());
  currentDeckIsLatin = deckContainsLatin(allCards);
  seedDeckIntegrations(allCards, now);

    history = [];
    histPos = -1;
    dueArr = [];
    dueIndex = 0;
    clearForcedRetries();
    resetSessionSkipTail();
    rebuildDueList();
  renderDue(true);
  updateLatinSettingsChip();
}

function recordCardId(id) {
  if (histPos < history.length - 1) history = history.slice(0, histPos + 1);
  history.push(id);
  histPos = history.length - 1;
  saveSession();
}

function renderDebugOverlay(card) {
  const existing = document.getElementById('fsrs-debug');
  if (!card) {
    if (existing) existing.remove();
    return;
  }
  let dbg = existing;
  if (!dbg) {
    dbg = document.createElement('div');
    dbg.id = 'fsrs-debug';
    Object.assign(dbg.style, {
      position:'absolute',bottom:'1rem',left:'1rem',padding:'0.5rem 1rem',
      background:'rgba(0,0,0,0.6)',color:'#fff',fontSize:'0.75rem',
      borderRadius:'4px',pointerEvents:'none',zIndex:50
    });
    document.body.appendChild(dbg);
  }
  const now = new Date();
  const due = normalizeDueDate(card.due, now);
  const daysUntilRaw = Math.round((startOfToday(due) - startOfToday(now)) / 864e5);
  const daysUntil = Math.max(0, daysUntilRaw);
  const params = window.fsrs?.params || {};
  const retention = params.request_retention ?? params.desired_retention ?? '?';
  const wPreview = Array.isArray(params.w) ? params.w.slice(0, 4).map(v => Number(v).toFixed(2)).join(',') : '';
  dbg.innerHTML = [
    `ID:${card.id} state:${card.state} reps:${card.reps} lapses:${card.lapses}`,
    `due:${formatLocalDate(due)} (${daysUntil}d) ivl:${card.scheduled_days ?? '-'} steps:${card.learning_steps ?? '-'} stab:${(card.stability??0).toFixed(2)} diff:${(card.difficulty??0).toFixed(2)}`,
    `ret:${retention} max:${params.maximum_interval ?? '?'} fuzz:${params.enable_fuzz ? 'on' : 'off'} short-term:${params.enable_short_term ? (params.learning_steps || []).join(',') : 'off'}`,
    wPreview ? `w[0..3]: ${wPreview}` : ''
  ].filter(Boolean).join('<br>');
}


function resetPerCardFlags() {
  penalizedThisCard = false;
  awardedThisCard   = false;
  hintUsedThisCard  = false;
}

function getNextDueCard(current) {
  const idx = dueArr.findIndex(c => String(c.id) === String(current?.id));
  if (idx === -1 || dueArr.length <= 1) return null;
  return dueArr[(idx + 1) % dueArr.length];
}

function getActiveReviewMode() {
  if (document.body.classList.contains('mode-fillin')) return 'fillin';
  if (document.body.classList.contains('mode-mcq')) return 'mcq';
  return 'flashcard';
}

function renderById(id) {
  const card = allCards.find(c => String(c.id) === String(id));
  if (!card) return;
  setVisibleCardId(card.id);
  resetPerCardFlags();

  const cardEl = document.querySelector('.flashcard');
  // Keep flip animation but suppress during DOM swap
  cardEl?.classList.add('flip-transition');
  cardEl?.classList.add('no-transition');
  cardEl?.setAttribute('data-hide-back', '1');

  renderCard(card);
  MCQ.renderMCQ?.(card);
  renderFillIn(card);
  window.dispatchEvent(new Event('card:bounds-changed'));
  renderStarsUI(card);
  updateDeckCounter();
  renderDebugOverlay(card);
  if (cardEl) {
    requestAnimationFrame(() => {
      cardEl.classList.remove('no-transition');
      cardEl.classList.remove('flipped'); // animate back to front if we were on back
    });
  }

  // kill any pending/stale speak from previous card, then schedule speak
  bumpSpeakEpoch();
  stop();

  window.startReview?.(card, currentDeckPath);
}

function renderDue(record = false) {
  // Invalidate any pending speak scheduled right before we switch (prevents replay of previous back)
  bumpSpeakEpoch();

  const card = dueArr[dueIndex];
  const cardEl   = document.querySelector('.flashcard');
  const frontEl  = document.querySelector('.flashcard__front');
  const mcqEl    = document.getElementById('options');
  const fillinEl = document.getElementById('fillin');

  if (!card) {
    setVisibleCardId(null);
    cardEl.classList.remove('flipped');
    const hasDeck = Array.isArray(allCards) && allCards.length > 0;
    const msg = hasDeck ? 'No more cards' : 'No cards in this deck yet. Click Edit to add one.';
    if (frontEl)  frontEl.innerHTML  = `<div class="done-msg">${msg}</div>`;
    if (mcqEl) mcqEl.innerHTML = '';
    if (fillinEl) {
      const input = fillinEl.querySelector('.answer-input');
      if (input) {
        input.value = '';
        input.classList.remove('correct', 'incorrect');
      }
    }
    updateDeckCounter();
    stop(); // nothing to say
    return;
  }

  setVisibleCardId(card.id);
  resetPerCardFlags();
  cardEl?.classList.add('flip-transition');
  cardEl?.classList.add('no-transition');
  // Ensure new card starts on front and hides its back until user reveals
  cardEl.setAttribute('data-hide-back', '1');

  renderCard(card);
  MCQ.renderMCQ?.(card);
  renderFillIn(card);
  window.dispatchEvent(new Event('card:bounds-changed'));
  renderStarsUI(card);
  renderDebugOverlay(card);
  if (cardEl) {
    requestAnimationFrame(() => {
      cardEl.classList.remove('no-transition');
      cardEl.classList.remove('flipped'); // animate back-to-front when arriving from back face
    });
  }

  if (record) recordCardId(card.id);
  updateDeckCounter();

  stop();
  // On a new card, only speak what is visible (front). For diagrams, front has no text â†’ no TTS (desired).
  requestSpeakVisibleFace();

  window.startReview?.(card, currentDeckPath);
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Hint utils (unchanged) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const LETTER_RE = /\p{L}/u;
const SEP3 = '\u00A0\u00A0\u00A0';
const SEP1 = '\u00A0';
function isAbbrevToken(tok){ return /^[\p{L}]{1,3}\.$/u.test(tok); }
function formatTokenSpaced(token, mode){
  if (!token) return '';
  if (isAbbrevToken(token)) return token;
  let seenLetter=false, out='', lastGlyph=false;
  for (const ch of Array.from(token)) {
    if (LETTER_RE.test(ch)) {
      const glyph = (mode==='reveal'||!seenLetter)? ch : '_';
      if (lastGlyph) out+=' ';
      out+=glyph; lastGlyph=true; seenLetter=true;
    } else { out+=ch; lastGlyph=false; }
  }
  return out;
}
function buildHintString(ans){ const t=String(ans||'').trim(); if(!t) return ''; const a=t.split(/\s+/);
  return a.map((x,i)=>formatTokenSpaced(x,'hint')+(i<a.length-1?(isAbbrevToken(x)?SEP1:SEP3):'')).join(''); }
function buildRevealString(ans){ const t=String(ans||'').trim(); if(!t) return ''; const a=t.split(/\s+/);
  return a.map((x,i)=>formatTokenSpaced(x,'reveal')+(i<a.length-1?(isAbbrevToken(x)?SEP1:SEP3):'')).join(''); }
function extractFormulaFromCard(card) {
  const pickFromHtml = (html) => {
    const raw = String(html || '');
    if (!raw) return '';
    const re = /<div class="math-step([^"]*)">([\s\S]*?)<\/div>/g;
    let match;
    while ((match = re.exec(raw))) {
      const classes = match[1] || '';
      if (classes.includes('prompt-line') || classes.includes('given-list')) continue;
      const content = String(match[2] || '').trim();
      if (content) return content;
    }
    return '';
  };
  const fromBack = pickFromHtml(card?.back);
  if (fromBack) return fromBack;
  return pickFromHtml(card?.front);
}
function getAllAnswers(card){
  if (!card) return [];
  // 1) Explicit accept list (strings)
  if (Array.isArray(card.accept) && card.accept.length) {
    return card.accept.map(s => String(s).trim()).filter(Boolean);
  }
  // 2) MCQ shapes
  if (Array.isArray(card.answers) && card.answers.length) {
    // Object form: [{ text, correct }]
    if (typeof card.answers[0] === 'object' && card.answers[0] !== null) {
      return card.answers
        .filter(o => o && o.correct)
        .map(o => String(o.text ?? '').trim())
        .filter(Boolean);
    }
    // Strings form + correct_indices
    if (Array.isArray(card.correct_indices)) {
      const idxSet = new Set(card.correct_indices);
      return card.answers
        .map((t, i) => ({ t: String(t ?? '').trim(), ok: idxSet.has(i) }))
        .filter(o => o.ok && o.t)
        .map(o => o.t);
    }
  }
  // 3) Fallback to back/answer text
  const fallback = [card.answer, card.back_text, card.back, card.front_text]
    .map(s => (s==null?'':String(s).trim())).filter(Boolean);
  return fallback.length ? [fallback[0]] : [];
}

// Expose minimal read helper for editor
window.__getCardById = (id) => allCards.find(c => String(c.id) === String(id));
window.__getCurrentCardId = () => currentCardId();

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Grading (learning uses targetStars) â”€â”€â”€ */
function advance(isCorrect, responseTimeMs = 0, attempts = 1, hintUsed = false) {
  if (isEditorActive()) return;
  if (!dueArr.length) return;
  const current = dueArr[dueIndex];
  const id = current.id;
  const prevIndex = dueIndex;
  const usedHint = !!hintUsed || hintUsedThisCard;
  const reviewMode = getActiveReviewMode();
  const reviewAttempt = evaluateReviewAttempt({ isCorrect, attempts, hintUsed: usedHint });
  const fullyCorrect = reviewAttempt.fullyCorrect;
  forcedRetryIds = applyForcedRetryDecision(forcedRetryIds, id, reviewAttempt);
  if (reviewAttempt.penalized) penalizedThisCard = true;

  if (isCorrect) bumpCombo({ attempts, hintUsed: usedHint });
  else breakCombo();

  if (isCorrect && currentHintEl) {
    const answers = getAllAnswers(current);
    const reveal = answers.map(a => buildRevealString(a)).join(', ');
    const descEl = currentHintEl.querySelector('.desc');
    if (descEl) descEl.textContent = reveal || '-';
  }

  const cap = targetStars(current);
  const inLearning = getProg(id) < cap;

  if (inLearning) {
    if (isCorrect && !penalizedThisCard && !usedHint && !awardedThisCard) {
      awardedThisCard = true;
      setProg(id, getProg(id) + 1);
      renderStarsUI(current);
      if (getProg(id) >= cap) {
        showAlert('success', 'Learned âœ“', 'This card finished the learning phase.');
        rebuildDueList();
      }
    }

    handleReview(current, isCorrect, responseTimeMs, attempts, usedHint, new Date(), currentDeckPath, { reviewMode });
    rebuildDueList({ currentId: id, previousIndex: prevIndex, advance: true });
    renderDue(false);
    renderDebugOverlay(current);
    return;
  }

  const updated = handleReview(current, isCorrect, responseTimeMs, attempts, usedHint, new Date(), currentDeckPath, { reviewMode });
  const idx     = allCards.findIndex(c => c.id === current.id);
  if (idx !== -1) allCards[idx] = updated;

  rebuildDueList();
  renderDebugOverlay(updated);
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Navigation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function closeHintIfOpen() {
  if (currentHintEl) {
    currentHintEl.querySelector('.alert-close')?.click();
    currentHintEl = null; lastHintAnswer = '';
  }
}

function runSwipeAnimation(direction, swapFn) {
  const cardEl = document.querySelector('.flashcard');
  if (!cardEl || swipeAnimating) return;

  const swipingBack = cardEl.classList.contains('flipped');
  if (swipingBack) cardEl.classList.add('swipe-keep-back');

  swipeAnimating = true;
  const outClass = direction === 'left' ? 'swipe-out-left' : 'swipe-out-right';
  const inClass  = direction === 'left' ? 'swipe-in-left'  : 'swipe-in-right';

  let finished = false;
  let startedIn = false;
  const cleanup = () => {
    cardEl.classList.remove('transitioning', outClass, inClass, 'swipe-keep-back');
    resetCardDragStyle({ animate: false });
    swipeAnimating = false;
  };

  const startIn = () => {
    if (startedIn) return;
    startedIn = true;
    if (swipingBack) cardEl.classList.remove('swipe-keep-back');
    swapFn?.();
    requestAnimationFrame(() => {
      cardEl.classList.add(inClass);
      const onInEnd = () => {
        finished = true;
        cardEl.removeEventListener('animationend', onInEnd);
        cleanup();
      };
      cardEl.addEventListener('animationend', onInEnd, { once: true });
      setTimeout(() => {
        if (!finished) {
          cardEl.removeEventListener('animationend', onInEnd);
          cleanup();
        }
      }, SWIPE_ANIM_TIMEOUT);
    });
  };

  const onOutEnd = () => {
    cardEl.removeEventListener('animationend', onOutEnd);
    startIn();
  };

  cardEl.classList.add('transitioning', outClass);
  cardEl.addEventListener('animationend', onOutEnd, { once: true });
  setTimeout(() => {
    if (!finished && !startedIn && cardEl.classList.contains(outClass)) {
      cardEl.removeEventListener('animationend', onOutEnd);
      startIn();
    }
  }, SWIPE_ANIM_TIMEOUT);
}

const DRAG_MAX_X = 30;
const DRAG_MAX_Y = 0;
function applyToolbarFollowShift(x = 0, y = 0, { dragging = false, snapBack = false } = {}) {
  const rowEl = document.querySelector('.flashcard-toolbar-row');
  if (!rowEl) return;
  rowEl.style.setProperty('--toolbar-shift-x', `${x}px`);
  rowEl.style.setProperty('--toolbar-shift-y', `${y}px`);
  rowEl.classList.toggle('dragging', !!dragging);
  rowEl.classList.toggle('snap-back', !!snapBack);
}
function setCardDragStyle(dx = 0, dy = 0) {
  const cardEl = document.querySelector('.flashcard');
  if (!cardEl) return;
  const cx = clamp(dx, -DRAG_MAX_X, DRAG_MAX_X);
  const cy = 0;
  const tiltY = clamp(-cx * 0.08, -10, 10);
  const tiltZ = clamp(cx * 0.05, -7, 7);
  const lift = clamp(-Math.abs(cx) * 0.04, -10, 0);
  cardEl.style.setProperty('--card-shift-x', `${cx}px`);
  cardEl.style.setProperty('--card-shift-y', `${cy + lift}px`);
  cardEl.style.setProperty('--card-tilt-y', `${tiltY}deg`);
  cardEl.style.setProperty('--card-tilt-z', `${tiltZ}deg`);
  cardEl.style.setProperty('--card-scale', '1'); // keep scale stable to avoid pop when animation starts
  applyToolbarFollowShift(cx, cy + lift, { dragging: true, snapBack: false });
}
function resetCardDragStyle({ animate = false } = {}) {
  const cardEl = document.querySelector('.flashcard');
  if (!cardEl) return;
  if (animate) cardEl.classList.add('snap-back');
  cardEl.style.setProperty('--card-shift-x', '0px');
  cardEl.style.setProperty('--card-shift-y', '0px');
  cardEl.style.setProperty('--card-tilt-y', '0deg');
  cardEl.style.setProperty('--card-tilt-z', '0deg');
  cardEl.style.setProperty('--card-scale', '1');
  applyToolbarFollowShift(0, 0, { dragging: false, snapBack: animate });
  const done = () => {
    cardEl.classList.remove('snap-back', 'dragging');
    applyToolbarFollowShift(0, 0, { dragging: false, snapBack: false });
    cardEl.removeEventListener('transitionend', done);
  };
  if (animate) {
    cardEl.addEventListener('transitionend', done, { once: true });
    setTimeout(done, 300);
  } else {
    done();
  }
}

function pushCurrentCardToBottomAndAdvance() {
  if (isAnimating()) return;
  if (isEditorActive()) return;
  closeHintIfOpen();
  bumpSpeakEpoch();
  if (!dueArr.length) return;
  const currentId = currentCardId();
  const currentIdx = currentId == null ? -1 : dueArr.findIndex(c => String(c.id) === String(currentId));
  const activeIdx = currentIdx >= 0 ? currentIdx : dueIndex;
  const current = dueArr[activeIdx];
  if (!current) return;

  // Move the current card to the end of this session's queue; for diagrams move the whole diagram group.
  const moveSet = new Set(
    isDiagramCard(current)
      ? dueArr.filter(c => groupKey(c) === groupKey(current)).map(c => String(c.id))
      : [String(current.id)]
  );

  // Nothing else to show (all cards belong to the same group) -> just advance normally
  if (moveSet.size === dueArr.length) { dueIndex = activeIdx; navNext(); return; }

  const snapshot = {
    dueArr: dueArr.slice(),
    dueIndex: activeIdx,
    history: history.slice(),
    histPos,
    skipTail: sessionSkipTail.slice()
  };

  const remaining = [];
  const moved = [];
  for (const card of dueArr) {
    if (moveSet.has(String(card.id))) moved.push(card);
    else remaining.push(card);
  }

  const movedIds = moved.map(c => c.id);
  if (movedIds.length) markSessionSkipped(movedIds);

  let targetId = null;
  for (let step = 1; step <= dueArr.length; step++) {
    const idx = (activeIdx + step) % dueArr.length;
    const candidate = dueArr[idx];
    if (candidate && !moveSet.has(String(candidate.id))) {
      targetId = candidate.id;
      break;
    }
  }

  const reordered = remaining.concat(moved);
  const nextIdx = targetId && reordered.length
    ? reordered.findIndex(c => String(c.id) === String(targetId))
    : -1;
  const resolvedIndex = nextIdx === -1 ? 0 : nextIdx;

  runSwipeAnimation('left', () => {
    dueArr = reordered;
    dueIndex = resolvedIndex;

    swipeUndoStack.push(snapshot);
    if (swipeUndoStack.length > MAX_SWIPE_UNDOS) swipeUndoStack.shift();

    saveSession();
    renderDue(true);
  });
}

function undoSwipeReorder() {
  if (isAnimating()) return;
  if (isEditorActive()) return;
  if (!swipeUndoStack.length) {
    navPrev();
    return;
  }
  closeHintIfOpen();
  bumpSpeakEpoch();

  const prev = swipeUndoStack.pop();
  if (Array.isArray(prev?.dueArr)) dueArr = prev.dueArr.slice();
  if (Number.isInteger(prev?.dueIndex)) {
    dueIndex = Math.max(0, Math.min(prev.dueIndex, Math.max(0, dueArr.length - 1)));
  }
  if (Array.isArray(prev?.history)) history = prev.history.slice();
  if (Number.isInteger(prev?.histPos)) {
    histPos = Math.max(-1, Math.min(prev.histPos, Math.max(-1, history.length - 1)));
  }
  sessionSkipTail = Array.isArray(prev?.skipTail) ? prev.skipTail.slice() : [];
  saveSession();

  runSwipeAnimation('right', () => {
    if (histPos >= 0 && history[histPos] != null) {
      renderById(history[histPos]);
    } else {
      renderDue(false);
    }
  });
}

function navNext() {
  if (isAnimating()) return;
  if (isEditorActive()) return;
  closeHintIfOpen();
  bumpSpeakEpoch(); // invalidate any pending speak before changing card
  const el = document.querySelector('.flashcard');
  el.classList.add('transitioning');

  if (histPos >= 0 && histPos < history.length - 1) {
    histPos++;
    requestAnimationFrame(() => { renderById(history[histPos]); requestAnimationFrame(() => el.classList.remove('transitioning')); });
  } else {
    if (!dueArr.length) { el.classList.remove('transitioning'); return; }
    if (isGeneratorPath(currentDeckPath)) {
      regenerateGeneratorDeck()
        .finally(() => { el.classList.remove('transitioning'); });
      return;
    }
    const prevIndex = dueIndex;
    const nextIdx = nextNonSkippedIndex(dueIndex);
    if (nextIdx !== -1) dueIndex = nextIdx;
    else dueIndex = (dueIndex + 1) % dueArr.length;
    const wrapped = dueArr.length && dueIndex <= prevIndex;
    if (wrapped && isGeneratorPath(currentDeckPath)) {
      regenerateGeneratorDeck()
        .finally(() => { el.classList.remove('transitioning'); });
      return;
    }
    requestAnimationFrame(() => { renderDue(true); requestAnimationFrame(() => el.classList.remove('transitioning')); });
  }
}
function navPrev() {
  if (isAnimating()) return;
  if (isEditorActive()) return;
  closeHintIfOpen();
  bumpSpeakEpoch(); // invalidate any pending speak before changing card
  if (histPos <= 0) return;
  const el = document.querySelector('.flashcard');
  el.classList.add('transitioning');
  histPos--;
  requestAnimationFrame(() => { renderById(history[histPos]); requestAnimationFrame(() => el.classList.remove('transitioning')); });
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ UI wiring â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function setupUI() {
  loadTopRightIcons();
  if (typeof initEditModal === 'function') initEditModal();
  ensureComboMeter();
  renderCombo();
  updateCalculatorButtonState(calculatorAppOn);
  void syncCalculatorState({ quiet: true });
  window.onWrongAttempt = () => { penalizedThisCard = true; breakCombo(); };
  // Clear any stray animation classes to avoid initial flicker
  document.getElementById('options')?.classList.remove('animating-in','animating-out');
  document.getElementById('fillin')?.classList.remove('animating-in','animating-out');

  window.advance = advance;
  window.navNext = navNext;
  window.navPrev = navPrev;

  const cardEl = document.querySelector('.flashcard');
  const toolbarEl = document.querySelector('.flashcard-toolbar');
  let swallowClickAfterSwipe = false;
  const SWIPE_PICKUP_PX = 12;
  const SWIPE_TRIGGER_PX = 24;
  let swipeState = null;
  const shouldSwallowClick = (state) => !(state?.pointerType === 'mouse' && state?.button === 2);

  document.querySelector('.fullscreen-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    cardEl.classList.add('no-transition');
    void cardEl.offsetWidth;
    const frame = document.getElementById('flashcard-frame');
    const preRect = cardEl.getBoundingClientRect();
    const isFullscreen = cardEl.classList.toggle('fullscreen');
    cardEl.dataset.flipping = '1';
    cardEl.style.height = '';
    if (!isFullscreen) cardEl.style.width = '';
    if (toolbarEl) toolbarEl.classList.toggle('fullscreen', isFullscreen);
    if (frame) {
      if (isFullscreen && preRect.width) {
        frame.style.setProperty('--fullscreen-card-max', `${Math.round(preRect.width * 1.5)}px`);
      } else {
        frame.style.removeProperty('--fullscreen-card-max');
      }
    }
    // Precompute fullscreen split/stack layout immediately so the card
    // does not flash in an outdated position for a frame.
    window.dispatchEvent(new Event('card:bounds-changed'));
    requestAnimationFrame(() => {
      cardEl.classList.remove('no-transition');
      delete cardEl.dataset.flipping;
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('card:bounds-changed'));
    });
  });

  /* NEW: Zoom button toggle */
  document.querySelector('.zoom-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    setZoomMode(!zoomMode);
  });

  document.querySelector('.calc-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    void setCalculatorApp(!calculatorAppOn);
  });

  // Edit button â†’ open editor for the current card
  document.querySelector('.edit-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    const id = currentCardId();
    if (id != null && typeof openEditor === 'function') openEditor(id);
    else if (typeof openNewEditor === 'function') openNewEditor();
  });
  // Fallback: delegate in case button is re-rendered
  document.querySelector('.top-right-controls')?.addEventListener('click', e => {
    const btn = e.target.closest?.('.edit-btn');
    if (!btn) return;
    e.stopPropagation();
    const id = currentCardId();
    if (id != null && typeof openEditor === 'function') openEditor(id);
    else if (typeof openNewEditor === 'function') openNewEditor();
  });

  // Drag-to-swipe navigation (left: push to bottom, right: undo)
  cardEl.addEventListener('pointerdown', e => {
    if (isAnimating()) return;
    if (isEditorActive()) return;
    if (zoomMode) return; // reserved for zoom lens
    const isMouse = e.pointerType === 'mouse';
    const isRightButton = isMouse && e.button === 2;
    if (isMouse && !isRightButton) return;
    if (e.target.closest('.top-right-controls') || e.target.closest('.flashcard-toolbar')) return;
    swipeState = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      started: isRightButton,
      pendingDx: 0,
      pendingDy: 0,
      pointerType: e.pointerType,
      button: e.button
    };
    swallowClickAfterSwipe = swipeState.started && shouldSwallowClick(swipeState);
    cardEl.classList.remove('snap-back');
    cardEl.setPointerCapture?.(e.pointerId);
    if (isRightButton) {
      cardEl.classList.add('dragging');
      setCardDragStyle(0, 0);
      e.preventDefault(); // keep context menu from stealing focus while swiping
    }
  });
  cardEl.addEventListener('pointermove', e => {
    if (!swipeState || (swipeState.id != null && e.pointerId !== swipeState.id)) return;
    const dx = e.clientX - swipeState.x;
    const dy = e.clientY - swipeState.y;
    swipeState.pendingDx = dx;
    swipeState.pendingDy = dy;
    if (!swipeState.started) {
      if (Math.abs(dx) < SWIPE_PICKUP_PX && Math.abs(dy) < SWIPE_PICKUP_PX) return;
      swipeState.started = true;
      swallowClickAfterSwipe = shouldSwallowClick(swipeState);
      cardEl.classList.add('dragging');
    }
    setCardDragStyle(dx, dy);
    e.preventDefault();
    if (Math.abs(dx) >= SWIPE_TRIGGER_PX) {
      const dir = dx < 0 ? 'left' : 'right';
      swipeState = null;
      cardEl.releasePointerCapture?.(e.pointerId);
      if (dir === 'left') pushCurrentCardToBottomAndAdvance();
      else undoSwipeReorder();
    }
  });
  const finishSwipe = (direction) => {
    if (direction === 'left') pushCurrentCardToBottomAndAdvance();
    else if (direction === 'right') undoSwipeReorder();
  };
  const cancelSwipe = (e) => {
    if (!swipeState) return;
    const start = swipeState;
    swipeState = null;
    cardEl.releasePointerCapture?.(start.id);
    swallowClickAfterSwipe = !!start.started && shouldSwallowClick(start);
    const dx = e ? (e.clientX - start.x) : 0;
    const dy = e ? (e.clientY - start.y) : 0;
    if (start.started && Math.abs(dx) >= SWIPE_TRIGGER_PX) {
      finishSwipe(dx < 0 ? 'left' : 'right');
    } else if (start.started) {
      setCardDragStyle(dx, dy);
      resetCardDragStyle({ animate: true });
      cardEl.classList.remove('dragging');
    } else {
      resetCardDragStyle({ animate: false });
    }
  };
  cardEl.addEventListener('pointerup', cancelSwipe);
  cardEl.addEventListener('pointercancel', cancelSwipe);
  cardEl.addEventListener('mouseleave', cancelSwipe);
  cardEl.addEventListener('contextmenu', e => {
    e.preventDefault(); // keep right-click reserved for swipe pickup
  });

  // â”€â”€ Zoom lens interactions (only active in zoom mode)
  let holdActive = false;
  cardEl.addEventListener('mousedown', e => {
    if (!zoomMode) return;
    if (e.button !== 0) return; // left only
    if (e.target.closest('.top-right-controls')) return; // don't start lens over controls
    holdActive = true;
    cardEl.classList.add('zooming'); // hides cursor via CSS
    createLens(cardEl);
    updateLensPosition(cardEl, e);
    e.preventDefault();
  });
  cardEl.addEventListener('mousemove', e => {
    if (zoomMode && holdActive) updateLensPosition(cardEl, e);
  });
  cardEl.addEventListener('mouseup', e => {
    if (!zoomMode || e.button !== 0) return;
    if (!holdActive) return;
    holdActive = false;
    cardEl.classList.remove('zooming');
    destroyLens();
  });
  cardEl.addEventListener('mouseleave', () => {
    if (!zoomMode || !holdActive) return;
    holdActive = false;
    cardEl.classList.remove('zooming');
    destroyLens();
  });

  // Flip behavior:
  // - Normal mode: single click flips
  // - Zoom mode:   double click flips (single click is reserved for zoom hold)
  let flipSafetyTimer = null;
  const clearFlipSafetyTimer = () => {
    if (!flipSafetyTimer) return;
    clearTimeout(flipSafetyTimer);
    flipSafetyTimer = null;
  };
  const markFlipping = (on) => {
    if (on) {
      cardEl.dataset.flipping = '1';
      clearFlipSafetyTimer();
      flipSafetyTimer = setTimeout(() => {
        flipSafetyTimer = null;
        if (cardEl.dataset.flipping === '1') {
          delete cardEl.dataset.flipping;
          window.dispatchEvent(new Event('card:bounds-changed'));
        }
      }, 650);
      return;
    }
    clearFlipSafetyTimer();
    if (cardEl.dataset.flipping === '1') delete cardEl.dataset.flipping;
  };
  const flipCard = () => {
    markFlipping(true);
    cardEl.classList.add('flip-transition');
    cardEl.classList.remove('no-transition');
    cardEl.classList.toggle('flipped');
    if (cardEl.classList.contains('flipped')) cardEl.removeAttribute('data-hide-back');
    stop(); // let the observer schedule speaking for the new face
  };
  cardEl.addEventListener('click', e => {
    if (swallowClickAfterSwipe) { swallowClickAfterSwipe = false; return; }
    if (zoomMode) return; // ignore single clicks while zoom mode ON
    if (isEditorActive() && e.target.closest('.flashcard-edit-input, textarea, input, [contenteditable="true"]')) return;
    if (e.target.closest('.fullscreen-btn') || e.target.closest('.zoom-btn')) return;
    flipCard();
  });
  cardEl.addEventListener('dblclick', e => {
    if (swallowClickAfterSwipe) { swallowClickAfterSwipe = false; return; }
    if (!zoomMode) return;
    if (isEditorActive() && e.target.closest('.flashcard-edit-input, textarea, input, [contenteditable="true"]')) return;
    if (e.target.closest('.fullscreen-btn') || e.target.closest('.zoom-btn')) return;
    flipCard(); // observer will handle speaking
  });

  // Observe ONLY actual flip transitions â†’ speak once per flip.
  let lastFlip = cardEl.classList.contains('flipped');
  const flipObserver = new MutationObserver(muts => {
    if (!ttsOn) return;
    for (const m of muts) {
      if (m.type === 'attributes' && m.attributeName === 'class') {
        const wasFlipped = m.oldValue ? m.oldValue.split(/\s+/).includes('flipped') : lastFlip;
        const isFlipped  = cardEl.classList.contains('flipped');
        lastFlip = isFlipped;
        if (wasFlipped !== isFlipped) {
          stop();
          requestSpeakVisibleFace();
        }
      }
    }
  });
  flipObserver.observe(cardEl, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });

  cardEl.addEventListener('transitionstart', (e) => {
    if (e.target !== cardEl || e.propertyName !== 'transform') return;
    markFlipping(true);
  });
  cardEl.addEventListener('transitionend', (e) => {
    if (e.target !== cardEl || e.propertyName !== 'transform') return;
    markFlipping(false);
    window.dispatchEvent(new Event('card:bounds-changed'));
  });
  cardEl.addEventListener('transitioncancel', (e) => {
    if (e.target !== cardEl || e.propertyName !== 'transform') return;
    markFlipping(false);
    window.dispatchEvent(new Event('card:bounds-changed'));
  });

  document.getElementById('nextBtn')?.addEventListener('click', navNext);
  document.getElementById('prevBtn')?.addEventListener('click', navPrev);
  const isEditableHotkeyTarget = (target) => {
    if (!(target instanceof Element)) return false;
    if (target.isContentEditable) return true;
    return !!target.closest('.flashcard-edit-input, input, textarea, select, [contenteditable=""], [contenteditable="true"]');
  };
  const isInteractiveHotkeyTarget = (target) => {
    if (!(target instanceof Element)) return false;
    return !!target.closest('button, a, summary, [role="button"], [role="menuitem"], [role="menuitemradio"]');
  };
  document.addEventListener('keydown', e => {
    if (isEditorActive()) return;
    if (isAnimating()) return;
    if (e.defaultPrevented) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (document.getElementById('settingsPanel')?.classList.contains('open')) return;
    if (document.querySelector('.mode-dropdown.open') || document.querySelector('.deck-dropdown.open')) return;
    if (isEditableHotkeyTarget(e.target)) return;

    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      navNext();
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      navPrev();
      return;
    }
    const isSpace = e.key === ' ' || e.key === 'Spacebar' || e.code === 'Space';
    if (isSpace) {
      if (e.repeat) return;
      if (isInteractiveHotkeyTarget(e.target)) return;
      e.preventDefault();
      flipCard();
    }
  });

  (function () {
    const COOLDOWN = 220;
    const THRESHOLD = 30;
    const TRACKPAD_IDLE = 140;
    let acc = 0;
    let locked = false;
    let trackpadTimer = null;

    function normDeltaY(e) {
      let dy = 0;
      if ('deltaY' in e) dy = e.deltaY;
      else if ('wheelDelta' in e) dy = -e.wheelDelta;
      else if ('detail' in e) dy = e.detail * 40;

      if (e.deltaMode === 1) dy *= 16;
      else if (e.deltaMode === 2) dy *= window.innerHeight;

      return dy;
    }

    function isLikelyTrackpad(e, dy) {
      return e.deltaMode === 0 && Math.abs(dy) < 80;
    }

    // Trackpads emit smooth pixel deltas with inertia; lock until the gesture ends.
    function scheduleTrackpadIdleReset() {
      clearTimeout(trackpadTimer);
      trackpadTimer = setTimeout(() => {
        locked = false;
        acc = 0;
      }, TRACKPAD_IDLE);
    }

    function onWheel(e){
      if (isEditorActive()) return;
      if (isAnimating()) return;
      e.preventDefault();

      const dy = normDeltaY(e);
      const trackpad = isLikelyTrackpad(e, dy);
      if (trackpad) scheduleTrackpadIdleReset();
      if (locked) return;

      acc += dy;
      if (acc <= -THRESHOLD) {
        locked = true;
        acc = 0;
        navNext();
        if (!trackpad) setTimeout(() => { locked = false; }, COOLDOWN);
      } else if (acc >= THRESHOLD) {
        locked = true;
        acc = 0;
        navPrev();
        if (!trackpad) setTimeout(() => { locked = false; }, COOLDOWN);
      }
    }
    window.addEventListener('wheel', onWheel, { passive:false });
    window.addEventListener('mousewheel', onWheel, { passive:false });
    window.addEventListener('DOMMouseScroll', onWheel, { passive:false });
  })();

  MCQ.setupMCQ?.(window.advance);
  setupFillIn(window.advance);

  // Toggle
  document.querySelector('.audio-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    toggleTTS();
  });

  // Hint button (unchanged)
  document.querySelector('.hint-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    if (currentHintEl && document.body.contains(currentHintEl) && getComputedStyle(currentHintEl).display !== 'none') return;
    breakCombo();

    // Use the actually displayed card (supports history view and transition frames)
    const curId = currentCardId();
    const card = allCards.find(c => String(c.id) === String(curId)) ?? dueArr[dueIndex];

    const answers = getAllAnswers(card);
    const formulaHint = extractFormulaFromCard(card);
    if (!answers.length && !formulaHint) return;
    hintUsedThisCard = true;
    penalizedThisCard = true;
    lastHintAnswer = answers[0];

    const hintText = formulaHint || answers.map(a => buildHintString(a)).join(', ');
    currentHintEl = showAlert('info', 'Hint', hintText, { timeout: 0 });
    if (currentHintEl) {
      // Let alerts.css drive colors/hover for consistency with other variants
      const desc = currentHintEl.querySelector('.desc');
      if (desc) {
        if (formulaHint) {
          desc.style.whiteSpace = 'normal';
          const fn = window.renderMathInElement;
          if (typeof fn === 'function') {
            try { fn(desc, window.__mathRenderConfig || {}); } catch {}
          }
        } else {
          desc.style.whiteSpace = 'nowrap';
        }
      }
    }
  });

  // Settings panel toggle
  const settingsBtn = document.querySelector('.settings-btn');
  const settingsPanel = document.getElementById('settingsPanel');
  const scrollContainer = settingsPanel?.querySelector('.scroll-list-container');
  const scrollList = settingsPanel?.querySelector('.scroll-list');
  function renderMathInSettings(rootEl = settingsPanel) {
    if (!rootEl || rootEl.dataset.mathRendered === '1') return;
    const fn = window.renderMathInElement;
    if (typeof fn !== 'function') return;
    const cfg = window.__mathRenderConfig || {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\\\[', right: '\\\\]', display: true },
        { left: '\\\\(', right: '\\\\)', display: false },
        { left: '$', right: '$', display: false }
      ],
      throwOnError: false,
      strict: 'ignore'
    };
    try {
      fn(rootEl, cfg);
      rootEl.dataset.mathRendered = '1';
    } catch {}
  }

  if (settingsPanel && !settingsPanel.classList.contains('open')) {
    settingsPanel.setAttribute('inert', '');
    settingsPanel.setAttribute('aria-hidden', 'true');
  }

  if (scrollContainer) {
    scrollContainer.dataset.shadowTop = 'false';
    scrollContainer.dataset.shadowBottom = 'false';
  }

  function updateScrollShadows() {
    if (!scrollContainer || !scrollList) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollList;
    const maxScroll = Math.max(0, scrollHeight - clientHeight);
    const epsilon = 1;
    const hasTopShadow = scrollTop > epsilon;
    const hasBottomShadow = scrollTop < (maxScroll - epsilon);
    scrollContainer.dataset.shadowTop = hasTopShadow ? 'true' : 'false';
    scrollContainer.dataset.shadowBottom = hasBottomShadow ? 'true' : 'false';
  }

  scrollList?.addEventListener('scroll', updateScrollShadows, { passive: true });
  function closeSettings() {
    if (settingsPanel) {
      settingsPanel.classList.remove('open');
      settingsPanel.setAttribute('aria-hidden', 'true');
      settingsPanel.setAttribute('inert', '');
    }
    closeTtsSettings();
    closeLatinSettingsPanel();
    closeBiofyzSettingsPanel();
    closeMcqSettingsPanel();
    if (scrollContainer) {
      scrollContainer.dataset.shadowTop = 'false';
      scrollContainer.dataset.shadowBottom = 'false';
    }
    if (settingsBtn) {
      try { settingsBtn.focus({ preventScroll: true }); }
      catch { settingsBtn.focus(); }
    }
  }

  function openSettings() {
    if (!settingsPanel) return;
    settingsPanel.classList.add('open');
    settingsPanel.removeAttribute('inert');
    settingsPanel.setAttribute('aria-hidden', 'false');
    renderMathInSettings(settingsPanel);
    requestAnimationFrame(() => updateScrollShadows());
  }
  settingsBtn?.addEventListener('click', e => {
    e.stopPropagation();
    if (!settingsPanel) return;
    const open = settingsPanel.classList.contains('open');
    open ? closeSettings() : openSettings();
    const backdrop = document.getElementById('backdrop');
    if (backdrop) backdrop.classList.toggle('open', !open);
  });
  // Click outside closes the panel
  document.addEventListener('mousedown', e => {
    if (!settingsPanel || !settingsPanel.classList.contains('open')) return;
    if (e.target.closest('#settingsPanel') || e.target.closest('.settings-btn')) return;
    closeSettings();
    const backdrop = document.getElementById('backdrop'); if (backdrop) backdrop.classList.remove('open');
  });

  // Deck chooser wiring
  const loadDeckBtn = document.getElementById('btnLoadDeck');
  const deckChooser = document.getElementById('deckChooser');
  const deckListEl  = document.getElementById('deckList');
  const deckSearch  = document.getElementById('deckSearch');
  const railDeckDropdown = document.querySelector('.deck-dropdown');
  const railDeckTrigger = document.getElementById('railDeckTrigger');
  const railDeckMenu = document.getElementById('railDeckMenu');
  const railDeckRecents = document.getElementById('railDeckRecents');
  const railDeckSearch = document.getElementById('railDeckSearch');
  const railDeckGhost = document.getElementById('railDeckGhost');
  const leftHoverMenu = document.querySelector('.left-hover-menu');
  const leftHoverPanel = leftHoverMenu?.querySelector('.left-hover-panel') || null;
  const railHomeBtn = document.getElementById('railHomeBtn');
  let deckIndex = [];

  function canonicalDeckPath(path = '') {
    return normalizeDeckPath(path);
  }

  function deckNameFromPath(path = '') {
    const normalized = canonicalDeckPath(path);
    if (!normalized) return '';
    const mapped = GENERATOR_DECKS.find(deck => canonicalDeckPath(deck.path) === normalized);
    if (mapped?.name) return mapped.name;
    if (isGeneratorPath(normalized)) return normalized;
    const tail = normalized.split('/').pop() || normalized;
    try { return decodeURIComponent(tail); } catch { return tail; }
  }

  function ensureDeckInIndex(path = '', name = '') {
    const normalized = canonicalDeckPath(path);
    if (!normalized) return;
    const exists = deckIndex.some(deck => canonicalDeckPath(deck.path) === normalized);
    if (exists) return;
    deckIndex.push({
      name: String(name || deckNameFromPath(normalized) || normalized),
      path: normalized
    });
  }

  function findDeckByPath(path = '') {
    const normalized = canonicalDeckPath(path);
    if (!normalized) return null;
    return deckIndex.find(deck => canonicalDeckPath(deck.path) === normalized) || null;
  }

  function deckDisplayName(entryOrPath) {
    if (!entryOrPath) return '';
    if (typeof entryOrPath === 'string') return deckNameFromPath(entryOrPath);
    return String(entryOrPath.name || deckNameFromPath(entryOrPath.path) || '');
  }

  function prefixDeckSuggestion(query = '') {
    const q = String(query || '').toLowerCase();
    if (!q) return '';
    const match = deckIndex.find(deck => deckDisplayName(deck).toLowerCase().startsWith(q));
    return match ? deckDisplayName(match) : '';
  }

  function resolveDeckFromInput(input = '') {
    const q = String(input || '').trim().toLowerCase();
    if (!q) return null;
    const tests = [
      deck => deckDisplayName(deck).toLowerCase() === q,
      deck => canonicalDeckPath(deck.path).toLowerCase() === q,
      deck => deckDisplayName(deck).toLowerCase().startsWith(q),
      deck => canonicalDeckPath(deck.path).toLowerCase().startsWith(q),
      deck => deckDisplayName(deck).toLowerCase().includes(q),
      deck => canonicalDeckPath(deck.path).toLowerCase().includes(q)
    ];
    for (const test of tests) {
      const found = deckIndex.find(test);
      if (found) return found;
    }
    return null;
  }

  function syncRailDeckGhost() {
    if (!railDeckGhost || !railDeckSearch) return;
    railDeckGhost.textContent = '';
    const typed = String(railDeckSearch.value || '');
    if (!typed) return;
    const suggestion = prefixDeckSuggestion(typed);
    if (!suggestion || suggestion.length <= typed.length) return;
    const prefix = document.createElement('span');
    prefix.className = 'deck-menu-search-ghost-prefix';
    prefix.textContent = typed;
    railDeckGhost.append(prefix, document.createTextNode(suggestion.slice(typed.length)));
  }

  function renderRailRecentDecks() {
    if (!railDeckRecents) return;
    railDeckRecents.innerHTML = '';
    const recent = loadRecentDeckPaths().slice(0, RECENT_DECK_LIMIT);
    recent.forEach(path => ensureDeckInIndex(path));
    if (!recent.length) {
      const none = document.createElement('div');
      none.className = 'deck-recent-empty';
      none.textContent = 'No recent decks yet';
      railDeckRecents.appendChild(none);
      return;
    }
    recent.forEach(path => {
      const entry = findDeckByPath(path) || { name: deckNameFromPath(path), path };
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'deck-recent-item';
      if (canonicalDeckPath(path) === canonicalDeckPath(currentDeckPath)) btn.classList.add('active');
      btn.textContent = deckDisplayName(entry);
      btn.dataset.path = entry.path;
      btn.title = entry.path;
      btn.addEventListener('click', async () => {
        await reloadDeck(entry.path);
        setRailDeckMenuOpen(false);
      });
      railDeckRecents.appendChild(btn);
    });
  }

  async function populateDecks(){
    const listed = await listDecksFromServer();
    deckIndex = GENERATOR_DECKS.concat(listed).map(deck => ({
      name: String(deck?.name || deckNameFromPath(deck?.path)),
      path: canonicalDeckPath(deck?.path || deck?.name || '')
    })).filter(deck => deck.path);
    const seenDecks = new Set();
    deckIndex = deckIndex.filter(deck => {
      if (seenDecks.has(deck.path)) return false;
      seenDecks.add(deck.path);
      return true;
    });
    ensureDeckInIndex(currentDeckPath);
    loadRecentDeckPaths().forEach(path => ensureDeckInIndex(path));
    renderDeckList(deckSearch?.value || '');
    renderRailRecentDecks();
    syncRailDeckGhost();
  }

  function renderDeckList(filter=''){
    if (!deckListEl) return;
    const q = String(filter||'').toLowerCase();
    deckListEl.innerHTML = '';
    const items = (!q
      ? deckIndex
      : deckIndex.filter(d => deckDisplayName(d).toLowerCase().includes(q) || canonicalDeckPath(d.path).toLowerCase().includes(q)));
    if (!items.length) {
      const none = document.createElement('div');
      none.className = 'settings-item settings-card deck-item';
      none.textContent = 'No decks found';
      none.setAttribute('aria-disabled','true');
      deckListEl.appendChild(none);
      updateScrollShadows();
      return;
    }
    items.forEach(d => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'settings-item settings-card deck-item';
      btn.textContent = deckDisplayName(d);
      btn.dataset.path = d.path;
      btn.title = d.path;
      btn.addEventListener('dblclick', async () => {
        await reloadDeck(d.path);
        deckChooser?.setAttribute('hidden','');
        closeSettings();
        const backdrop = document.getElementById('backdrop'); if (backdrop) backdrop.classList.remove('open');
      });
      deckListEl.appendChild(btn);
    });
    updateScrollShadows();
  }
  loadDeckBtn?.addEventListener('click', async () => {
    if (!deckChooser) return;
    deckChooser.toggleAttribute('hidden');
    requestAnimationFrame(updateScrollShadows);
    if (!deckChooser.hasAttribute('hidden')) {
      await populateDecks();
      deckSearch?.focus();
    }
  });
  deckSearch?.addEventListener('input', () => renderDeckList(deckSearch.value));

  function setRailDeckMenuOpen(open) {
    if (!railDeckDropdown || !railDeckTrigger || !railDeckMenu) return;
    const next = !!open;
    railDeckDropdown.classList.toggle('open', next);
    railDeckTrigger.setAttribute('aria-expanded', next ? 'true' : 'false');
    railDeckMenu.setAttribute('aria-hidden', next ? 'false' : 'true');
    if (next) {
      railDeckMenu.removeAttribute('hidden');
      document.addEventListener('mousedown', handleRailDeckOutsideClick);
      document.addEventListener('keydown', handleRailDeckEscape);
    } else {
      railDeckMenu.setAttribute('hidden', '');
      document.removeEventListener('mousedown', handleRailDeckOutsideClick);
      document.removeEventListener('keydown', handleRailDeckEscape);
    }
  }

  function handleRailDeckOutsideClick(e) {
    if (!railDeckDropdown || railDeckDropdown.contains(e.target)) return;
    setRailDeckMenuOpen(false);
  }

  function handleRailDeckEscape(e) {
    if (e.key !== 'Escape') return;
    setRailDeckMenuOpen(false);
    try { railDeckTrigger?.focus({ preventScroll: true }); }
    catch { railDeckTrigger?.focus(); }
  }

  railDeckTrigger?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const opening = !railDeckDropdown?.classList.contains('open');
    setRailDeckMenuOpen(opening);
    if (!opening) return;
    await populateDecks();
    try { railDeckSearch?.focus({ preventScroll: true }); }
    catch { railDeckSearch?.focus(); }
  });

  railDeckSearch?.addEventListener('input', () => {
    syncRailDeckGhost();
  });

  railDeckSearch?.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const target = resolveDeckFromInput(railDeckSearch.value);
    if (!target?.path) return;
    await reloadDeck(target.path);
    railDeckSearch.value = '';
    syncRailDeckGhost();
    setRailDeckMenuOpen(false);
  });

  refreshDeckSelectionUi = () => {
    ensureDeckInIndex(currentDeckPath);
    loadRecentDeckPaths().forEach(path => ensureDeckInIndex(path));
    renderDeckList(deckSearch?.value || '');
    renderRailRecentDecks();
    syncRailDeckGhost();
  };

  void populateDecks();
  refreshDeckSelectionUi();

  const latinSettingsBtn = document.getElementById('btnLatinSettings');
  const latinSettingsPanel = document.getElementById('latinSettings');
  const latinDrillSlider = document.getElementById('latinDrillLevel');
  const latinDrillValue = document.getElementById('latinDrillLevelValue');
  const latinDeclInputs = document.querySelectorAll('[data-latin-decl]');

  function syncLatinSettingsControlsDom() {
    if (latinDrillSlider) latinDrillSlider.value = String(clampLatinLevel(latinDrillPrefs.level));
    updateLatinSliderLabel();
    latinDeclInputs.forEach(input => {
      const key = input?.dataset?.latinDecl;
      if (!key) return;
      const pref = latinDrillPrefs?.declensions?.[key];
      input.checked = pref !== false;
    });
  }

  function handleLatinPrefChange() {
    persistLatinDrillPrefs();
    if (deckContainsLatin(deckBaseCards)) {
      reapplyLatinDrillFilters();
    } else {
      updateLatinSettingsChip();
    }
  }

  function describeLatinLevel(level) {
    return DRILL_LEVEL_LABELS[level] || DRILL_LEVEL_LABELS[DEFAULT_LATIN_LEVEL];
  }

  latinDeclInputs.forEach(input => {
    input.addEventListener('change', () => {
      const key = input?.dataset?.latinDecl;
      if (!key) return;
      latinDrillPrefs.declensions[key] = !!input.checked;
      handleLatinPrefChange();
    });
  });

  function updateLatinSliderLabel() {
    if (!latinDrillValue) return;
    const level = clampLatinLevel(latinDrillPrefs.level);
    latinDrillValue.textContent = `Level ${level} - ${describeLatinLevel(level)}`;
  }

  latinDrillSlider?.addEventListener('input', () => {
    const level = clampLatinLevel(latinDrillSlider.value);
    latinDrillPrefs.level = level;
    updateLatinSliderLabel();
    persistLatinDrillPrefs();
    reapplyLatinDrillFilters();
  });
  updateLatinSliderLabel();

  function openLatinSettings({ focus = false } = {}) {
    if (!latinSettingsPanel) return;
    syncLatinSettingsControlsDom();
    latinSettingsPanel.removeAttribute('hidden');
    latinSettingsPanel.setAttribute('aria-hidden', 'false');
    latinSettingsBtn?.setAttribute('aria-expanded', 'true');
    updateLatinSettingsChip({ panelOpen: true });
    requestAnimationFrame(updateScrollShadows);
    if (focus) {
      const first = latinSettingsPanel.querySelector('input[type="checkbox"]');
      if (first) {
        try { first.focus({ preventScroll: true }); }
        catch { first.focus(); }
      }
    }
  }

  function closeLatinSettings() {
    if (!latinSettingsPanel || latinSettingsPanel.hasAttribute('hidden')) return;
    latinSettingsPanel.setAttribute('hidden', '');
    latinSettingsPanel.setAttribute('aria-hidden', 'true');
    latinSettingsBtn?.setAttribute('aria-expanded', 'false');
    updateLatinSettingsChip({ panelOpen: false });
    requestAnimationFrame(updateScrollShadows);
  }

  latinSettingsBtn?.addEventListener('click', () => {
    if (!latinSettingsPanel) return;
    const open = !latinSettingsPanel.hasAttribute('hidden');
    open ? closeLatinSettings() : openLatinSettings({ focus: true });
  });

  updateLatinSettingsChip = function updateLatinChipDom({ panelOpen } = {}) {
    if (!latinSettingsBtn) return;
    const chip = latinSettingsBtn.querySelector('.settings-chip');
    if (!chip) return;
    const panelIsOpen = panelOpen ?? (latinSettingsPanel ? !latinSettingsPanel.hasAttribute('hidden') : false);
    if (panelIsOpen) {
      chip.dataset.state = 'open';
      chip.textContent = 'Open';
      return;
    }
    const deckHasLatin = deckContainsLatin(deckBaseCards);
    if (!deckHasLatin) {
      chip.dataset.state = 'na';
      chip.textContent = 'N/A';
      return;
    }
    const level = clampLatinLevel(latinDrillPrefs.level);
    chip.dataset.state = 'level';
    chip.textContent = `Level ${level} - ${describeLatinLevel(level)}`;
  };
  closeLatinSettingsPanel = closeLatinSettings;
  updateLatinSettingsChip();

  const biofyzSettingsBtn = document.getElementById('btnBiofyzSettings');
  const biofyzSettingsPanel = document.getElementById('biofyzSettings');
  const biofyzTypeInputs = Array.from(document.querySelectorAll('[data-biofyz-type]'));
  const biofyzSearchInput = document.getElementById('biofyzTypeSearch');
  const biofyzSearchEmpty = document.getElementById('biofyzSearchEmpty');
  const biofyzTopicSections = biofyzSettingsPanel
    ? Array.from(biofyzSettingsPanel.querySelectorAll('[data-biofyz-topic]'))
    : [];
  const biofyzTypeRows = biofyzTypeInputs
    .map(input => {
      const row = input?.closest('.settings-toggle-row');
      if (!row) return null;
      const topic = row.closest('[data-biofyz-topic]');
      const title = row.querySelector('.settings-toggle-title')?.textContent || '';
      const desc = row.querySelector('.settings-toggle-description')?.textContent || '';
      const key = input?.dataset?.biofyzType || '';
      const searchable = `${key} ${title} ${desc}`.trim().toLowerCase().replace(/\s+/g, ' ');
      return { row, topic, searchable };
    })
    .filter(Boolean);
  let biofyzSearchActive = false;

  function normalizeBiofyzSearchQuery(value = '') {
    return String(value || '').toLowerCase().trim().replace(/\s+/g, ' ');
  }

  function applyBiofyzSearchFilter() {
    if (!biofyzSettingsPanel) return;
    const query = normalizeBiofyzSearchQuery(biofyzSearchInput?.value);
    const isActive = query.length > 0;

    if (isActive && !biofyzSearchActive) {
      biofyzTopicSections.forEach(section => {
        section.dataset.prevOpen = section.open ? '1' : '0';
      });
    }

    const topicHasVisibleRows = new Map(biofyzTopicSections.map(section => [section, false]));
    let visibleCount = 0;

    biofyzTypeRows.forEach(({ row, topic, searchable }) => {
      const isVisible = !isActive || searchable.includes(query);
      row.hidden = !isVisible;
      if (isVisible) {
        visibleCount += 1;
        if (topicHasVisibleRows.has(topic)) topicHasVisibleRows.set(topic, true);
      }
    });

    biofyzTopicSections.forEach(section => {
      const hasVisibleRows = topicHasVisibleRows.get(section) === true;
      section.hidden = !hasVisibleRows;
      if (isActive) {
        section.open = hasVisibleRows;
      } else if (biofyzSearchActive) {
        section.open = section.dataset.prevOpen !== '0';
        delete section.dataset.prevOpen;
      }
    });

    if (biofyzSearchEmpty) biofyzSearchEmpty.hidden = visibleCount > 0;
    biofyzSearchActive = isActive;
    requestAnimationFrame(updateScrollShadows);
  }

  function resetBiofyzSearchFilter() {
    if (!biofyzSearchInput) return;
    if (!biofyzSearchInput.value && !biofyzSearchActive) return;
    biofyzSearchInput.value = '';
    applyBiofyzSearchFilter();
  }

  function countBiofyzEnabled() {
    return Object.keys(DEFAULT_BIOFYZ_PREFS)
      .filter(key => biofyzPrefs[key])
      .length;
  }

  function syncBiofyzSettingsControlsDom() {
    if (!biofyzTypeInputs.length) return;
    biofyzTypeInputs.forEach(input => {
      const key = input?.dataset?.biofyzType;
      if (!key) return;
      input.checked = biofyzPrefs[key] !== false;
    });
  }

  function handleBiofyzPrefChange(changedKey) {
    if (!countBiofyzEnabled()) {
      biofyzPrefs[changedKey] = true;
      const input = biofyzTypeInputs.find(el => el?.dataset?.biofyzType === changedKey);
      if (input) input.checked = true;
      showAlert('warning', 'Biofyz Generator', 'Enable at least one question type.');
    }
    persistBiofyzPrefs();
    syncBiofyzPrefsGlobal();
    updateBiofyzSettingsChip();
    if (isBiofyzGeneratorPath(currentDeckPath)) {
      regenerateGeneratorDeck();
    }
  }

  biofyzTypeInputs.forEach(input => {
    input.addEventListener('change', () => {
      const key = input?.dataset?.biofyzType;
      if (!key) return;
      biofyzPrefs[key] = !!input.checked;
      handleBiofyzPrefChange(key);
    });
    input.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const key = input?.dataset?.biofyzType;
      if (!key) return;
      biofyzTypeInputs.forEach(el => {
        const k = el?.dataset?.biofyzType;
        if (!k) return;
        const isTarget = k === key;
        biofyzPrefs[k] = isTarget;
        el.checked = isTarget;
      });
      handleBiofyzPrefChange(key);
    });
  });

  biofyzTopicSections.forEach(section => {
    section.addEventListener('toggle', () => {
      if (biofyzSearchActive) return;
      requestAnimationFrame(updateScrollShadows);
    });
  });

  biofyzSearchInput?.addEventListener('input', applyBiofyzSearchFilter);
  biofyzSearchInput?.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!biofyzSearchInput.value) return;
    event.preventDefault();
    resetBiofyzSearchFilter();
  });

  function openBiofyzSettings({ focus = false } = {}) {
    if (!biofyzSettingsPanel) return;
    syncBiofyzSettingsControlsDom();
    biofyzSettingsPanel.removeAttribute('hidden');
    biofyzSettingsPanel.setAttribute('aria-hidden', 'false');
    renderMathInSettings(biofyzSettingsPanel);
    applyBiofyzSearchFilter();
    biofyzSettingsBtn?.setAttribute('aria-expanded', 'true');
    updateBiofyzSettingsChip({ panelOpen: true });
    requestAnimationFrame(updateScrollShadows);
    if (focus) {
      if (biofyzSearchInput) {
        try { biofyzSearchInput.focus({ preventScroll: true }); }
        catch { biofyzSearchInput.focus(); }
      } else {
        const first = biofyzSettingsPanel.querySelector('input[type="checkbox"]');
        if (first) {
          try { first.focus({ preventScroll: true }); }
          catch { first.focus(); }
        }
      }
    }
  }

  function closeBiofyzSettings() {
    if (!biofyzSettingsPanel || biofyzSettingsPanel.hasAttribute('hidden')) return;
    biofyzSettingsPanel.setAttribute('hidden', '');
    biofyzSettingsPanel.setAttribute('aria-hidden', 'true');
    resetBiofyzSearchFilter();
    biofyzSettingsBtn?.setAttribute('aria-expanded', 'false');
    updateBiofyzSettingsChip({ panelOpen: false });
    requestAnimationFrame(updateScrollShadows);
  }

  biofyzSettingsBtn?.addEventListener('click', () => {
    if (!biofyzSettingsPanel) return;
    const open = !biofyzSettingsPanel.hasAttribute('hidden');
    open ? closeBiofyzSettings() : openBiofyzSettings({ focus: true });
  });

  updateBiofyzSettingsChip = function updateBiofyzChipDom({ panelOpen } = {}) {
    if (!biofyzSettingsBtn) return;
    const chip = biofyzSettingsBtn.querySelector('.settings-chip');
    if (!chip) return;
    const panelIsOpen = panelOpen ?? (biofyzSettingsPanel ? !biofyzSettingsPanel.hasAttribute('hidden') : false);
    if (panelIsOpen) {
      chip.dataset.state = 'open';
      chip.textContent = 'Open';
      return;
    }
    if (!isBiofyzGeneratorPath(currentDeckPath)) {
      chip.dataset.state = 'na';
      chip.textContent = 'N/A';
      return;
    }
    const enabled = countBiofyzEnabled();
    const total = Object.keys(DEFAULT_BIOFYZ_PREFS).length;
    chip.dataset.state = 'on';
    chip.textContent = enabled === total ? 'All' : 'Custom';
  };
  closeBiofyzSettingsPanel = closeBiofyzSettings;
  updateBiofyzSettingsChip();

  const mcqSettingsBtn = document.getElementById('btnMcqSettings');
  const mcqSettingsPanel = document.getElementById('mcqSettings');
  const mcqAnswersToggle = document.getElementById('mcqAnswersOnCard');

  function syncMcqSettingsControlsDom() {
    if (mcqAnswersToggle) mcqAnswersToggle.checked = !!mcqAnswersOnCard;
  }

  function openMcqSettings({ focus = false } = {}) {
    if (!mcqSettingsPanel) return;
    syncMcqSettingsControlsDom();
    mcqSettingsPanel.removeAttribute('hidden');
    mcqSettingsPanel.setAttribute('aria-hidden', 'false');
    mcqSettingsBtn?.setAttribute('aria-expanded', 'true');
    updateMcqSettingsChip({ panelOpen: true });
    requestAnimationFrame(updateScrollShadows);
    if (focus && mcqAnswersToggle) {
      try { mcqAnswersToggle.focus({ preventScroll: true }); }
      catch { mcqAnswersToggle.focus(); }
    }
  }

  function closeMcqSettings() {
    if (!mcqSettingsPanel || mcqSettingsPanel.hasAttribute('hidden')) return;
    mcqSettingsPanel.setAttribute('hidden', '');
    mcqSettingsPanel.setAttribute('aria-hidden', 'true');
    mcqSettingsBtn?.setAttribute('aria-expanded', 'false');
    updateMcqSettingsChip({ panelOpen: false });
    requestAnimationFrame(updateScrollShadows);
  }

  mcqSettingsBtn?.addEventListener('click', () => {
    if (!mcqSettingsPanel) return;
    const open = !mcqSettingsPanel.hasAttribute('hidden');
    open ? closeMcqSettings() : openMcqSettings({ focus: true });
  });

  mcqAnswersToggle?.addEventListener('change', () => {
    const next = !!mcqAnswersToggle.checked;
    setMcqAnswersOnCard(next);
    syncMcqSettingsControlsDom();
  });

  updateMcqSettingsChip = function updateMcqChipDom({ panelOpen } = {}) {
    if (!mcqSettingsBtn) return;
    const chip = mcqSettingsBtn.querySelector('.settings-chip');
    if (!chip) return;
    const panelIsOpen = panelOpen ?? (mcqSettingsPanel ? !mcqSettingsPanel.hasAttribute('hidden') : false);
    if (panelIsOpen) {
      chip.dataset.state = 'open';
      chip.textContent = 'Open';
      return;
    }
    chip.dataset.state = mcqAnswersOnCard ? 'on' : 'closed';
    chip.textContent = mcqAnswersOnCard ? 'Card' : 'Buttons';
  };
  closeMcqSettingsPanel = closeMcqSettings;
  updateMcqSettingsChip();

  const frontPrefToggle = document.getElementById('ttsPrefFront');
  const backPrefToggle = document.getElementById('ttsPrefBack');
  const ttsSettingsBtn = document.getElementById('btnTtsSettings');
  const ttsSettingsPanel = document.getElementById('ttsSettings');
  const ttsVoiceFrontBtn = document.getElementById('ttsVoiceFrontBtn');
  const ttsVoiceBackBtn = document.getElementById('ttsVoiceBackBtn');
  const ttsVoiceFrontMenu = document.getElementById('ttsVoiceFrontMenu');
  const ttsVoiceBackMenu = document.getElementById('ttsVoiceBackMenu');
  const ttsVoiceFrontSearch = document.getElementById('ttsVoiceFrontSearch');
  const ttsVoiceBackSearch = document.getElementById('ttsVoiceBackSearch');
  const ttsVoiceFrontList = document.getElementById('ttsVoiceFrontList');
  const ttsVoiceBackList = document.getElementById('ttsVoiceBackList');
  const ttsVoiceHint = document.getElementById('ttsVoiceHint');
  let ttsVoiceOptions = [];
  let ttsVoicesLoaded = false;
  let ttsVoicesLoading = false;

  function updateTtsVoiceHint(msg = '') {
    if (!ttsVoiceHint) return;
    const text = String(msg || '').trim();
    ttsVoiceHint.textContent = text;
    ttsVoiceHint.hidden = !text;
  }

  function buildTtsVoiceList() {
    const base = Array.isArray(ttsVoiceOptions) ? ttsVoiceOptions.slice() : [];
    const extras = [ttsVoicePrefs.front, ttsVoicePrefs.back, DEFAULT_TTS_VOICE].filter(Boolean);
    const seen = new Set();
    const out = [];
    extras.forEach(name => {
      if (seen.has(name)) return;
      seen.add(name);
      out.push(name);
    });
    base.forEach(name => {
      if (seen.has(name)) return;
      seen.add(name);
      out.push(name);
    });
    return out;
  }

  function normalizeVoiceQuery(value = '') {
    return String(value || '').trim().toLowerCase();
  }

  function getTtsVoiceQuery(face) {
    const el = face === 'front' ? ttsVoiceFrontSearch : ttsVoiceBackSearch;
    return normalizeVoiceQuery(el?.value);
  }

  function getFilteredTtsVoiceList(face) {
    const list = buildTtsVoiceList();
    const query = getTtsVoiceQuery(face);
    if (!query) return list;
    return list.filter(name => name.toLowerCase().includes(query));
  }

  function renderTtsVoiceMenu(face) {
    const listEl = face === 'front' ? ttsVoiceFrontList : ttsVoiceBackList;
    if (!listEl) return;
    const current = face === 'front' ? ttsVoicePrefs.front : ttsVoicePrefs.back;
    const list = getFilteredTtsVoiceList(face);
    listEl.innerHTML = '';
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'settings-select-empty';
      empty.textContent = 'No matches.';
      listEl.appendChild(empty);
      return;
    }
    list.forEach(name => {
      const opt = document.createElement('button');
      opt.type = 'button';
      opt.className = 'settings-select-option';
      opt.textContent = name;
      opt.setAttribute('role', 'option');
      opt.setAttribute('aria-selected', name === current ? 'true' : 'false');
      opt.addEventListener('click', () => {
        applyTtsVoicePref(face, name, { closeMenu: true });
      });
      listEl.appendChild(opt);
    });
  }

  function renderTtsVoiceMenus() {
    renderTtsVoiceMenu('front');
    renderTtsVoiceMenu('back');
  }

  async function loadTtsVoiceOptions({ force = false } = {}) {
    if (ttsVoicesLoading) return;
    if (ttsVoicesLoaded && !force) {
      renderTtsVoiceMenus();
      return;
    }
    ttsVoicesLoading = true;
    updateTtsVoiceHint('Loading voices...');
    try {
      const endpoint = ttsEndpoint || 'http://127.0.0.1:8001';
      const res = await fetch(`${endpoint}/api/voices`);
      if (!res.ok) throw new Error(`voices ${res.status}`);
      const data = await res.json();
      const names = Array.isArray(data)
        ? data.map(v => (v && (v.ShortName || v.Name)) || '').filter(Boolean)
        : [];
      names.sort((a, b) => a.localeCompare(b));
      ttsVoiceOptions = names;
      window.__ttsVoiceOptions = names;
      ttsVoicesLoaded = true;
      updateTtsVoiceHint(names.length ? `${names.length} voices available.` : 'Voice list empty.');
    } catch {
      updateTtsVoiceHint('Voice list unavailable.');
    } finally {
      ttsVoicesLoading = false;
      renderTtsVoiceMenus();
    }
  }

  function updateTtsChip({ panelOpen } = {}) {
    if (!ttsSettingsBtn) return;
    const chip = ttsSettingsBtn.querySelector('.settings-chip');
    if (!chip) return;
    const panelIsOpen = panelOpen ?? (ttsSettingsPanel ? !ttsSettingsPanel.hasAttribute('hidden') : false);
    const anyPrefEnabled = !!(ttsFacePrefs.front || ttsFacePrefs.back);
    if (panelIsOpen) {
      chip.dataset.state = 'open';
      chip.textContent = 'Open';
      return;
    }
    if (anyPrefEnabled) {
      chip.dataset.state = 'on';
      chip.textContent = 'On';
    } else {
      chip.dataset.state = 'closed';
      chip.textContent = 'Off';
    }
  }

  syncTtsPrefControls = function syncTtsPrefControlsDom() {
    if (frontPrefToggle) frontPrefToggle.checked = !!ttsFacePrefs.front;
    if (backPrefToggle) backPrefToggle.checked = !!ttsFacePrefs.back;
    if (ttsVoiceFrontBtn) ttsVoiceFrontBtn.textContent = ttsVoicePrefs.front;
    if (ttsVoiceBackBtn) ttsVoiceBackBtn.textContent = ttsVoicePrefs.back;
    renderTtsVoiceMenus();
    updateTtsChip({});
  };
  syncTtsPrefControls();

  function openTtsSettings({ focus = false } = {}) {
    if (!ttsSettingsPanel) return;
    syncTtsPrefControls();
    loadTtsVoiceOptions();
    ttsSettingsPanel.removeAttribute('hidden');
    ttsSettingsPanel.setAttribute('aria-hidden', 'false');
    ttsSettingsBtn?.setAttribute('aria-expanded', 'true');
    updateTtsChip({ panelOpen: true });
    requestAnimationFrame(updateScrollShadows);
    if (focus && frontPrefToggle) {
      try { frontPrefToggle.focus({ preventScroll: true }); }
      catch { frontPrefToggle.focus(); }
    }
  }
  function closeTtsSettings() {
    if (!ttsSettingsPanel || ttsSettingsPanel.hasAttribute('hidden')) return;
    ttsSettingsPanel.setAttribute('hidden', '');
    ttsSettingsPanel.setAttribute('aria-hidden', 'true');
    ttsSettingsBtn?.setAttribute('aria-expanded', 'false');
    updateTtsChip({ panelOpen: false });
    requestAnimationFrame(updateScrollShadows);
    closeVoiceMenu('front');
    closeVoiceMenu('back');
  }

  let activeVoiceMenu = '';

  function closeVoiceMenu(face, { restoreFocus = false } = {}) {
    const menu = face === 'front' ? ttsVoiceFrontMenu : ttsVoiceBackMenu;
    const btn = face === 'front' ? ttsVoiceFrontBtn : ttsVoiceBackBtn;
    const search = face === 'front' ? ttsVoiceFrontSearch : ttsVoiceBackSearch;
    if (!menu || menu.hasAttribute('hidden')) return;
    menu.setAttribute('hidden', '');
    btn?.setAttribute('aria-expanded', 'false');
    if (search) search.value = '';
    renderTtsVoiceMenu(face);
    if (restoreFocus && btn) {
      try { btn.focus({ preventScroll: true }); } catch { btn.focus(); }
    }
    if (activeVoiceMenu === face) activeVoiceMenu = '';
    if (!activeVoiceMenu) {
      document.removeEventListener('click', handleVoiceMenuOutside, true);
      document.removeEventListener('keydown', handleVoiceMenuEscape, true);
    }
  }

  function openVoiceMenu(face) {
    const menu = face === 'front' ? ttsVoiceFrontMenu : ttsVoiceBackMenu;
    const btn = face === 'front' ? ttsVoiceFrontBtn : ttsVoiceBackBtn;
    const search = face === 'front' ? ttsVoiceFrontSearch : ttsVoiceBackSearch;
    if (!menu || !btn) return;
    const other = face === 'front' ? 'back' : 'front';
    closeVoiceMenu(other);
    if (!menu.hasAttribute('hidden')) return;
    menu.removeAttribute('hidden');
    btn.setAttribute('aria-expanded', 'true');
    activeVoiceMenu = face;
    renderTtsVoiceMenu(face);
    loadTtsVoiceOptions();
    if (search) {
      try { search.focus({ preventScroll: true }); } catch { search.focus(); }
      search.select();
    }
    document.addEventListener('click', handleVoiceMenuOutside, true);
    document.addEventListener('keydown', handleVoiceMenuEscape, true);
  }

  function handleVoiceMenuOutside(e) {
    if (!activeVoiceMenu) return;
    const menu = activeVoiceMenu === 'front' ? ttsVoiceFrontMenu : ttsVoiceBackMenu;
    const btn = activeVoiceMenu === 'front' ? ttsVoiceFrontBtn : ttsVoiceBackBtn;
    if (menu?.contains(e.target) || btn?.contains(e.target)) return;
    closeVoiceMenu(activeVoiceMenu);
  }

  function handleVoiceMenuEscape(e) {
    if (e.key !== 'Escape') return;
    if (!activeVoiceMenu) return;
    e.preventDefault();
    closeVoiceMenu(activeVoiceMenu, { restoreFocus: true });
  }

  ttsSettingsBtn?.addEventListener('click', () => {
    if (!ttsSettingsPanel) return;
    if (ttsSettingsPanel.hasAttribute('hidden')) {
      openTtsSettings({ focus: true });
    } else {
      closeTtsSettings();
    }
  });
  closeTtsSettings();

  function applyTtsVoicePref(face, rawValue, { closeMenu = false } = {}) {
    const next = normalizeTtsVoiceValue(rawValue);
    if (face === 'front') {
      if (ttsVoicePrefs.front !== next) {
        ttsVoicePrefs.front = next;
        persistTtsVoicePrefs();
        syncTtsPrefControls();
        handleTtsVoicePrefChanged('front');
      } else {
        syncTtsPrefControls();
      }
      if (closeMenu) closeVoiceMenu('front', { restoreFocus: true });
      return;
    }
    if (face === 'back') {
      if (ttsVoicePrefs.back !== next) {
        ttsVoicePrefs.back = next;
        persistTtsVoicePrefs();
        syncTtsPrefControls();
        handleTtsVoicePrefChanged('back');
      } else {
        syncTtsPrefControls();
      }
      if (closeMenu) closeVoiceMenu('back', { restoreFocus: true });
    }
  }

  ttsVoiceFrontBtn?.addEventListener('click', () => {
    if (!ttsVoiceFrontMenu) return;
    if (ttsVoiceFrontMenu.hasAttribute('hidden')) openVoiceMenu('front');
    else closeVoiceMenu('front', { restoreFocus: true });
  });
  ttsVoiceBackBtn?.addEventListener('click', () => {
    if (!ttsVoiceBackMenu) return;
    if (ttsVoiceBackMenu.hasAttribute('hidden')) openVoiceMenu('back');
    else closeVoiceMenu('back', { restoreFocus: true });
  });

  ttsVoiceFrontSearch?.addEventListener('input', () => renderTtsVoiceMenu('front'));
  ttsVoiceBackSearch?.addEventListener('input', () => renderTtsVoiceMenu('back'));
  ttsVoiceFrontSearch?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const list = getFilteredTtsVoiceList('front');
    if (list.length) applyTtsVoicePref('front', list[0], { closeMenu: true });
  });
  ttsVoiceBackSearch?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const list = getFilteredTtsVoiceList('back');
    if (list.length) applyTtsVoicePref('back', list[0], { closeMenu: true });
  });

  frontPrefToggle?.addEventListener('change', (e) => {
    const next = !!e.target.checked;
    if (ttsFacePrefs.front !== next) {
      ttsFacePrefs.front = next;
      persistTtsFacePrefs();
      syncTtsPrefControls();
      handleTtsFacePrefChanged('front', next);
    } else {
      syncTtsPrefControls();
    }
  });
  backPrefToggle?.addEventListener('change', (e) => {
    const next = !!e.target.checked;
    if (ttsFacePrefs.back !== next) {
      ttsFacePrefs.back = next;
      persistTtsFacePrefs();
      syncTtsPrefControls();
      handleTtsFacePrefChanged('back', next);
    } else {
      syncTtsPrefControls();
    }
  });

  // Tabs (dropdown)
  const tabsNav = document.querySelector('.mode-dropdown');
  const modeMenu = tabsNav?.querySelector('.mode-menu');
  const modeTrigger = tabsNav?.querySelector('.mode-trigger');
  const triggerIcon = tabsNav?.querySelector('.mode-trigger-icon');
  const triggerLabel = tabsNav?.querySelector('.mode-trigger-label');
  const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));
  tabButtons.forEach(btn => {
    if (btn.dataset.accent) btn.style.setProperty('--accent', btn.dataset.accent);
  });
  if (modeMenu) {
    modeMenu.removeAttribute('hidden');
    modeMenu.setAttribute('aria-hidden', 'true');
  }

  function measureTabWidth(btn) {
    if (!btn) return 0;
    const wasHidden = btn.hidden;
    const prevAria = btn.getAttribute('aria-hidden');
    const prevStyle = { position: btn.style.position, visibility: btn.style.visibility, pointerEvents: btn.style.pointerEvents };
    if (wasHidden) {
      btn.hidden = false;
      btn.setAttribute('aria-hidden', 'false');
      btn.style.position = 'absolute';
      btn.style.visibility = 'hidden';
      btn.style.pointerEvents = 'none';
    }
    const w = btn.getBoundingClientRect().width || btn.offsetWidth || 0;
    if (wasHidden) {
      btn.hidden = true;
      if (prevAria !== null) btn.setAttribute('aria-hidden', prevAria); else btn.removeAttribute('aria-hidden');
      btn.style.position = prevStyle.position;
      btn.style.visibility = prevStyle.visibility;
      btn.style.pointerEvents = prevStyle.pointerEvents;
    }
    return w;
  }

  const syncMenuWidth = () => {};

  const mcqPanel = document.getElementById('options');
  const fillinPanel = document.getElementById('fillin');

  let currentTab = tabButtons.find(b => b.classList.contains('active'))?.dataset.tab
    || tabButtons[0]?.dataset.tab
    || 'flashcard';
  const hidePanel = p => (p && p.classList.contains('visible')) ? animateOut(p) : Promise.resolve();
  const showPanel = p => (p && !p.classList.contains('visible')) ? animateIn(p) : Promise.resolve();

  function refreshMenuVisibility(activeTabId) {
    tabButtons.forEach(btn => {
      const isActive = (btn.dataset.tab || '') === activeTabId;
      btn.hidden = isActive;
      btn.setAttribute('aria-hidden', isActive ? 'true' : 'false');
      btn.tabIndex = isActive ? -1 : 0;
    });
  }

  function setMenuOpen(open) {
    if (!tabsNav || !modeTrigger || !modeMenu) return;
    const next = !!open;
    tabsNav.classList.toggle('open', next);
    modeTrigger.setAttribute('aria-expanded', next ? 'true' : 'false');
    modeMenu.setAttribute('aria-hidden', next ? 'false' : 'true');
    if (next) {
      document.addEventListener('click', handleOutsideClick);
      document.addEventListener('keydown', handleEscape);
    } else {
      document.removeEventListener('click', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    }
  }
  function handleOutsideClick(e) {
    if (tabsNav && !tabsNav.contains(e.target)) setMenuOpen(false);
  }
  function handleEscape(e) {
    if (e.key === 'Escape') {
      setMenuOpen(false);
      modeTrigger?.focus();
    }
  }

  railHomeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    setMenuOpen(false);
    setRailDeckMenuOpen(false);
    window.location.assign('home.html');
  });

  function isPointerInsideLeftRailRange(clientX, clientY) {
    if (!leftHoverPanel) return false;
    const rect = leftHoverPanel.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  function forceCollapseLeftRailIfPointerOutside(e) {
    if (!leftHoverPanel) return;
    if (e.pointerType && e.pointerType !== 'mouse') return;
    if (!Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return;
    if (isPointerInsideLeftRailRange(e.clientX, e.clientY)) return;

    const active = document.activeElement;
    const hasRailFocus = active instanceof HTMLElement && leftHoverMenu?.contains(active);
    const modeOpen = !!tabsNav?.classList.contains('open');
    const deckOpen = !!railDeckDropdown?.classList.contains('open');
    if (!hasRailFocus && !modeOpen && !deckOpen) return;

    setMenuOpen(false);
    setRailDeckMenuOpen(false);
    if (hasRailFocus && active instanceof HTMLElement) active.blur();
  }

  document.addEventListener('pointermove', forceCollapseLeftRailIfPointerOutside, { passive: true });

  function updateActiveMode(btn){
    if (!btn) return;
    const accent = btn.dataset.accent || '';
    tabButtons.forEach(b => {
      const isActive = b === btn;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-checked', isActive ? 'true' : 'false');
    });
    if (accent && tabsNav) {
      tabsNav.style.setProperty('--mode-accent', accent);
    }
    if (triggerLabel) {
      triggerLabel.textContent = btn.dataset.label || btn.textContent.trim();
    }
    if (triggerIcon) {
      const svg = btn.querySelector('.tab-icon svg');
      if (svg) {
        triggerIcon.innerHTML = '';
        triggerIcon.appendChild(svg.cloneNode(true));
      }
      const tabId = btn.dataset.tab || '';
      if (tabId) triggerIcon.dataset.tab = tabId;
      else delete triggerIcon.dataset.tab;
      triggerIcon.style.color = accent || '';
    }
    refreshMenuVisibility(btn.dataset.tab || '');
    syncMenuWidth();
  }

  modeTrigger?.addEventListener('click', () => {
    const isOpen = tabsNav?.classList.contains('open');
    setMenuOpen(!isOpen);
  });

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab || currentTab;
      updateActiveMode(btn);
      setMenuOpen(false);
      if (target === currentTab) return;
      document.body.classList.remove('mode-flashcard','mode-mcq','mode-fillin');
      document.body.classList.add(`mode-${target}`);
      // In fullscreen, precompute split layout before panel animations so
      // MCQ/fillin animate from the right instead of briefly fading in centered.
      window.dispatchEvent(new Event('card:bounds-changed'));
      const cur = currentTab==='mcq'?mcqPanel:currentTab==='fillin'?fillinPanel:null;
      const nxt = target==='mcq'?mcqPanel:target==='fillin'?fillinPanel:null;
      hidePanel(cur)
        .then(() => showPanel(nxt))
        .then(() => {
          if (target==='fillin') refreshFillInSizing();
          currentTab = target;
          window.dispatchEvent(new Event('card:bounds-changed'));
        });
    });
  });
  document.body.classList.remove('mode-flashcard','mode-mcq','mode-fillin');
  document.body.classList.add(`mode-${currentTab}`);
  const initialBtn = tabButtons.find(b => b.dataset.tab === currentTab) || tabButtons[0];
  updateActiveMode(initialBtn);
  refreshMenuVisibility(currentTab);

  // Reflect persisted TTS state
  updateAudioIcon();
}

// Live preview: render a provided working-copy card without mutating queues
window.addEventListener('card:preview', (e) => {
  const d = e?.detail || {};
  const id = currentCardId();
  const p = d.patch;
  if (p && String(p.id) === String(id)) { applyPreviewPatch(p); return; }
  const wc = d.card;
  if (wc && String(wc.id) === String(id)) {
    const patch = { id, front: wc.front, back: wc.back, font: wc.font || wc.typography };
    applyPreviewPatch(patch);
  }
});

function applyPreviewPatch(patch){
  const cardEl = document.querySelector('.flashcard'); if (!cardEl) return;
  // Apply font via CSS vars
  if (patch.font) {
    const f = patch.font;
    // Hard-disable custom font family in preview as well
    if (f.family!=null) { cardEl.style.removeProperty('--card-font-family'); }
    if (f.weight!=null) cardEl.style.setProperty('--card-font-weight', String(f.weight));
    if (f.size!=null) cardEl.style.setProperty('--card-font-size', String(f.size));
    if (f.letterSpacing!=null) cardEl.style.setProperty('--card-letter-spacing', String(f.letterSpacing));
    if (f.lineHeight!=null) cardEl.style.setProperty('--card-line-height', String(f.lineHeight));
    if (f.textTransform!=null) cardEl.style.setProperty('--card-text-transform', String(f.textTransform));
    // also set on faces to increase specificity in case of overrides
    const faces = document.querySelectorAll('.flashcard__face');
    faces.forEach(face => {
      if (f.family!=null) face.style.removeProperty('--card-font-family');
      if (f.weight!=null) face.style.setProperty('--card-font-weight', String(f.weight));
      if (f.size!=null) face.style.setProperty('--card-font-size', String(f.size));
      if (f.letterSpacing!=null) face.style.setProperty('--card-letter-spacing', String(f.letterSpacing));
      if (f.lineHeight!=null) face.style.setProperty('--card-line-height', String(f.lineHeight));
      if (f.textTransform!=null) face.style.setProperty('--card-text-transform', String(f.textTransform));
    });
  }
  // Update text faces (only for text cards)
  function frontClozeHTML(txt){
    const raw = String(txt||'').replace(/[\u00A0\u202F\u2007\u2060\uFEFF]/g, ' ');
    if (!/{{c\d+::/i.test(raw)) return raw;
    let idx = 0;
    return raw.replace(/(\s*){{c\d+::(.*?)(?:::(.*?))?}}/gi, (m, ws, answer, hint, offset) => {
      const gap = ws || (offset > 0 ? ' ' : '');
      return `${gap}<span class="cloze" data-cloze-idx="${idx++}">[...]</span>`;
    });
  }
  function backClozeHTML(txt){
    const raw = String(txt||'').replace(/[\u00A0\u202F\u2007\u2060\uFEFF]/g, ' ');
    return raw.replace(/(\s*){{c\d+::(.*?)(?:::(.*?))?}}/gi, (m, ws, answer, hint, offset) => {
      const gap = ws || (offset > 0 ? ' ' : '');
      return `${gap}<span class="cloze">${answer}</span>`;
    });
  }
  function renderMathMaybe(el){
    if (!el || typeof window === 'undefined') return;
    const fn = window.renderMathInElement;
    if (typeof fn !== 'function') return;
    const cfg = window.__mathRenderConfig || { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '\\\\[', right: '\\\\]', display: true }, { left: '\\\\(', right: '\\\\)', display: false }, { left: '$', right: '$', display: false }], throwOnError: false, strict: 'ignore' };
    try { fn(el, cfg); } catch {}
  }
  if (patch.front != null) {
    let fEl = document.querySelector('.flashcard__front .flashcard-text');
    const frontFace = document.querySelector('.flashcard__front');
    const isTextCard = frontFace && !frontFace.querySelector('canvas');
    if (!fEl && isTextCard && frontFace) {
      frontFace.innerHTML = '<div class="flashcard-text"></div>';
      fEl = frontFace.querySelector('.flashcard-text');
    }
    if (fEl) {
      fEl.innerHTML = sanitizeDeckHtml(frontClozeHTML(patch.front));
      renderMathMaybe(fEl);
    }
  }
  if (patch.back != null) {
    let bEl = document.querySelector('.flashcard__back .flashcard-text');
    const backFace = document.querySelector('.flashcard__back');
    const isTextCardB = backFace && !backFace.querySelector('canvas');
    if (!bEl && isTextCardB && backFace) {
      backFace.innerHTML = '<div class="flashcard-text"></div>';
      bEl = backFace.querySelector('.flashcard-text');
    }
    if (bEl) {
      bEl.innerHTML = sanitizeDeckHtml(backClozeHTML(patch.back));
      renderMathMaybe(bEl);
    }
  }
  // If answers changed and MCQ panel is visible, refresh only MCQ
  if (patch.answersObj) {
    const cur = window.__getCardById?.(currentCardId());
    if (cur) { const wc = { ...cur, answers: patch.answersObj.map(o=>({ text:o.text, correct:o.correct }))}; MCQ.renderMCQ?.(wc); }
  }
  if (Array.isArray(patch.correct)) {
    const cur = window.__getCardById?.(currentCardId());
    if (cur) { const wc = { ...cur, correct: patch.correct.slice() }; MCQ.renderMCQ?.(wc); }
  }
}

function normalizeEditsOverlayStore(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { byDeck: {} };
  const byDeck = raw.byDeck;
  if (byDeck && typeof byDeck === 'object' && !Array.isArray(byDeck)) return { byDeck };
  return { byDeck: {} };
}
function editsOverlayDeckKey(deckPath = currentDeckPath) {
  const normalizedPath = normalizeDeckPathForSave(deckPath);
  if (normalizedPath) return normalizedPath;
  const fallback = normalizeDeckPath(deckPath);
  if (!fallback || isGeneratorPath(fallback)) return '';
  return fallback;
}
function persistEditsOverlay(edits, deckPath = currentDeckPath){
  const key = editsOverlayDeckKey(deckPath);
  if (!key) return;
  const raw = (() => {
    try { return JSON.parse(localStorage.getItem('CARD_EDITS_V1') || '{}'); } catch { return {}; }
  })();
  const store = normalizeEditsOverlayStore(raw);
  const nextEdits = edits && typeof edits === 'object' && !Array.isArray(edits) ? edits : {};
  if (Object.keys(nextEdits).length) store.byDeck[key] = nextEdits;
  else delete store.byDeck[key];
  try { localStorage.setItem('CARD_EDITS_V1', JSON.stringify({ byDeck: store.byDeck })); } catch {}
}
function loadEditsOverlay(deckPath = currentDeckPath){
  const key = editsOverlayDeckKey(deckPath);
  if (!key) return {};
  const raw = (() => {
    try { return JSON.parse(localStorage.getItem('CARD_EDITS_V1')||'{}'); } catch { return {}; }
  })();
  const store = normalizeEditsOverlayStore(raw);
  const overlay = store.byDeck[key];
  return overlay && typeof overlay === 'object' && !Array.isArray(overlay) ? overlay : {};
}
window.clearCardEditsOverlay = async function ({ reload = true } = {}) {
  try { localStorage.removeItem('CARD_EDITS_V1'); } catch {}
  if (!reload || !currentDeckPath) {
    showAlert('success', 'Card Edits Cleared', 'Local card edit overlay has been removed.');
    return;
  }
  await reloadDeck(currentDeckPath);
  showAlert('success', 'Card Edits Cleared', 'Local card edit overlay has been removed and deck reloaded.');
};
const TTS_SILENT_MARKER_RE = /<<![\s\S]*?!>>|&lt;&lt;![\s\S]*?!&gt;&gt;/i;
function hasTtsSilentMarkers(value) {
  return typeof value === 'string' && TTS_SILENT_MARKER_RE.test(value);
}
function unwrapTtsSilentMarkers(value) {
  if (typeof value !== 'string' || !value) return value;
  return String(value)
    .replace(/<<!([\s\S]*?)!>>/g, '$1')
    .replace(/&lt;&lt;!([\s\S]*?)!&gt;&gt;/gi, '$1');
}
function cardHasTtsSilentMarkers(card) {
  if (!card || typeof card !== 'object') return false;
  return hasTtsSilentMarkers(card.front) ||
    hasTtsSilentMarkers(card.front_text) ||
    hasTtsSilentMarkers(card.back) ||
    hasTtsSilentMarkers(card.back_text);
}
function sanitizeCardForSave(card) {
  if (!card || typeof card !== 'object') return card;
  const out = { ...card };
  // Runtime-only MCQ fields (rendered per session).
  delete out._mcqOptions;
  if (Array.isArray(out.correct) && out.correct.length) {
    delete out.answers;
    delete out.correct_indices;
  }
  return out;
}

async function persistDeckCardToServer(card, deckPath = currentDeckPath, { allowCreate = false } = {}) {
  if (!card || !deckPath) return;
  const normalizedPath = normalizeDeckPathForSave(deckPath);
  if (!normalizedPath) return;

  const payloadCard = sanitizeCardForSave(card);
  const bases = deckWriterBases();
  let reachedServer = false;
  for (const base of bases) {
    try {
      const res = await fetch(`${base}/deck/update`, {
        method: 'POST',
        headers: deckWriterHeaders(),
        body: JSON.stringify({ deck_path: normalizedPath, card: payloadCard, allow_create: !!allowCreate })
      });
      reachedServer = true;
      if (res.ok) return;
      const status = res.status;
      let detail = '';
      try {
        const data = await res.json();
        detail = data?.detail || data?.error || '';
      } catch {}
      if (allowCreate && (status === 404 || /card id not found/i.test(detail))) {
        // Try next base (e.g., updated server) when adding new cards
        continue;
      }
      const msg = detail ? `Deck update failed: ${detail}` : 'Deck update failed. Ensure the optimizer API is running on :8002.';
      showAlert('warning', 'Deck Save Failed', msg);
      return;
    } catch {
      // try next base (e.g., localhost fallback)
    }
  }
  if (!reachedServer) {
    showAlert('warning', 'Deck Save Failed', 'Could not reach the deck writer. Ensure the optimizer API is running on :8002.');
    return;
  }
  if (allowCreate) {
    showAlert('warning', 'Deck Save Failed', 'New cards require an updated optimizer API. Restart the server on :8002.');
  }
}
function applyLocalEdits(cards, deckPath = currentDeckPath){
  const overlay = loadEditsOverlay(deckPath);
  if (!overlay || !Object.keys(overlay).length) return cards;
  // If the base deck has no marker wrappers, stale overlay wrappers should not keep showing.
  const stripOverlayMarkers = !cards.some(cardHasTtsSilentMarkers);
  return cards.map(c => {
    const o = overlay[String(c.id)];
    if (!o) return c;
    const patch = { ...o };
    if (stripOverlayMarkers) {
      ['front', 'front_text', 'back', 'back_text'].forEach((field) => {
        if (typeof patch[field] === 'string' && hasTtsSilentMarkers(patch[field])) {
          patch[field] = unwrapTtsSilentMarkers(patch[field]);
        }
      });
    }
    const merged = { ...c, ...patch };
    if (patch.font) merged.font = { ...(c.font||{}), ...patch.font };
    return merged;
  });
}

window.addEventListener('card:save', (e) => {
  const wc = e?.detail?.card; // final merged card
  const showToast = !!e?.detail?.toast;
  const isNew = !!e?.detail?.isNew;
  if (!wc) return;
  const idx = allCards.findIndex(c => String(c.id) === String(wc.id));
  const baseIdx = deckBaseCards.findIndex(c => String(c.id) === String(wc.id));
  if (idx !== -1 || baseIdx !== -1) {
    const merged = {
      ...(idx !== -1 ? allCards[idx] : {}),
      ...(baseIdx !== -1 ? deckBaseCards[baseIdx] : {}),
      ...wc
    };
    if (idx !== -1) allCards[idx] = merged;
    if (baseIdx !== -1) deckBaseCards[baseIdx] = merged;
  } else if (isNew) {
    const now = new Date();
    const nextLoadIndex = deckBaseCards.reduce((max, c) => {
      const v = Number.isFinite(c?.__loadIndex) ? c.__loadIndex : -1;
      return Math.max(max, v);
    }, -1) + 1;
    if (!Number.isFinite(wc.__loadIndex)) wc.__loadIndex = nextLoadIndex;
    if (!Number.isFinite(wc.__rand)) wc.__rand = Math.random();
    normalizeCardMeta([wc], now);
    deckBaseCards.push(wc);
    allCards.push(wc);
    currentDeckIsLatin = deckContainsLatin(allCards);
    seedDeckIntegrations(allCards, now);
    rebuildDueList();
    const newIdx = dueArr.findIndex(c => String(c.id) === String(wc.id));
    if (newIdx !== -1) dueIndex = newIdx;
    recordCardId(wc.id);
  } else {
    return;
  }
  const overlay = loadEditsOverlay(currentDeckPath);
  overlay[String(wc.id)] = { ...overlay[String(wc.id)], ...wc };
  persistEditsOverlay(overlay, currentDeckPath);
  if (!isNew) MCQ.seedMCQPool?.(allCards);
  if (isGeneratorPath(currentDeckPath)) {
    if (isNew) {
      showAlert('warning', 'Generated Deck', 'New cards added to generated decks are session-only.');
    }
  } else {
    persistDeckCardToServer(wc, currentDeckPath, { allowCreate: isNew });
  }
  renderById(wc.id);
  if (showToast) showAlert('success', 'Saved', 'Your changes were saved.');
});

window.addEventListener('card:revert', (e) => {
  const id = e?.detail?.id;
  if (id == null) return;
  MCQ.seedMCQPool?.(allCards);
  renderById(id);
});

window.addEventListener('card:discard', (e) => {
  const previousId = e?.detail?.previousId;
  if (previousId != null) {
    renderById(previousId);
  } else {
    renderDue(false);
  }
});

runApp();

