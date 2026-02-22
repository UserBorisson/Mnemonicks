import { normalize as norm } from './answers.js';
import { getMcqCorrectAliases } from './mcq-utils.js';

let inputEl = null, minWidthPx = 0;
let currentCard = null;
let accepted = [];
let onGrade = null;

let cardIsFlipped = false;
let graded        = false;
let attempts      = 0;
let wrongAttempts = 0;
let t0            = 0;
let feedbackTimer = 0;

const HARD_MULTIPLIER = 1.0;
const FEEDBACK_DURATION_MS = 1400;
const CLOZE_RE = /\s*{{c\d+::(.*?)(?:::(.*?))?}}/gi;

let clozeMode = false;
let clozeItems = [];
let clozeRemaining = new Set();
let clozeMap = new Map();
let clozeNodes = new Map();

export function setupFillIn(cb) {
  onGrade = typeof cb === 'function' ? cb : null;
  inputEl = document.querySelector('.answer-input');
  if (!inputEl) return;

  const formEl = inputEl.closest('form');
  if (formEl && !formEl.__noSubmit) {
    formEl.__noSubmit = true;
    formEl.noValidate = true;
    formEl.addEventListener('submit', e => { e.preventDefault(); e.stopPropagation(); return false; });
  }

  inputEl.addEventListener('input', grow);
  window.addEventListener('resize', () => { minWidthPx = 0; ensureMinW(); grow(); });

  // Recalculate after web fonts load (ensures width fits letter-spacing/metrics)
  if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
    document.fonts.ready.then(() => { minWidthPx = 0; ensureMinW(); grow(); });
  }

  document.addEventListener('keydown', e => {
    if (document.body?.classList.contains('editor-active')) return;
    if (e.key === 'Enter') { e.preventDefault(); gradeOrNavigate(); }
  });
}

function ensureMinW() {
  if (!inputEl || minWidthPx) return;
  const parentW = inputEl.parentElement?.clientWidth ?? 0;
  minWidthPx = parentW * 0.4;
  inputEl.style.minWidth = `${minWidthPx}px`;
}
function grow() {
  if (!inputEl) return;
  ensureMinW();
  inputEl.style.width = `${minWidthPx}px`;
  const need = inputEl.scrollWidth;
  const max  = inputEl.parentElement?.clientWidth ?? need;
  inputEl.style.width = `${Math.max(minWidthPx, Math.min(need, max))}px`;
}
export function refreshFillInSizing() { minWidthPx = 0; ensureMinW(); grow(); }

function setClass(ok, { persist = false } = {})  {
  if (!inputEl) return;
  if (feedbackTimer) {
    clearTimeout(feedbackTimer);
    feedbackTimer = 0;
  }
  clearClass();
  // Force reflow so repeated answers retrigger the animation
  void inputEl.offsetWidth;
  if (ok && persist) {
    inputEl.classList.add('correct-final');
    return;
  }
  inputEl.classList.add(ok ? 'correct' : 'incorrect');
  feedbackTimer = setTimeout(() => {
    clearClass();
    feedbackTimer = 0;
  }, FEEDBACK_DURATION_MS);
}
function clearClass()  { inputEl?.classList.remove('correct', 'incorrect', 'correct-final'); }

function resetClozeState() {
  clozeMode = false;
  clozeItems = [];
  clozeRemaining = new Set();
  clozeMap = new Map();
  clozeNodes = new Map();
}

function extractClozeItems(text) {
  const raw = String(text ?? '').replace(/[\u00A0\u202F\u2007\u2060\uFEFF]/g, ' ');
  if (!/{{c\d+::/i.test(raw)) return [];
  const out = [];
  let idx = 0;
  raw.replace(CLOZE_RE, (_, answer) => {
    const value = String(answer ?? '').replace(/[\u00A0\u202F\u2007\u2060\uFEFF]/g, ' ').trim();
    const normalized = norm(value);
    if (normalized) out.push({ idx, value, norm: normalized });
    idx += 1;
    return '';
  });
  return out;
}

function buildClozeState(card) {
  const front = String(card?.front ?? '');
  const back = String(card?.back ?? '');
  let items = extractClozeItems(front);
  if (!items.length) items = extractClozeItems(back);
  clozeItems = items;
  clozeMode = items.length > 0;
  clozeRemaining = new Set(items.map(item => item.idx));
  clozeMap = new Map();
  items.forEach(item => {
    if (!item.norm) return;
    const list = clozeMap.get(item.norm);
    if (list) list.push(item.idx);
    else clozeMap.set(item.norm, [item.idx]);
  });
}

function hydrateClozeNodes() {
  clozeNodes = new Map();
  const front = document.querySelector('.flashcard__front');
  if (!front) return;
  const nodes = front.querySelectorAll('.cloze[data-cloze-idx]');
  nodes.forEach(node => {
    const idx = Number(node.dataset.clozeIdx);
    if (Number.isFinite(idx)) clozeNodes.set(idx, node);
  });
}

function takeMatchingClozeIdx(normalized) {
  const list = clozeMap.get(normalized);
  if (!list || !list.length) return null;
  const idx = list.find(id => clozeRemaining.has(id));
  if (!Number.isFinite(idx)) return null;
  const pos = list.indexOf(idx);
  if (pos >= 0) list.splice(pos, 1);
  if (!list.length) clozeMap.delete(normalized);
  return idx;
}

function revealCloze(idx) {
  const item = clozeItems.find(it => it.idx === idx);
  if (!item) return false;
  if (!clozeNodes.size) hydrateClozeNodes();
  const node = clozeNodes.get(idx);
  if (node) {
    node.textContent = item.value;
    node.classList.add('cloze-revealed');
    node.dataset.clozeRevealed = '1';
  }
  return true;
}

function gradeOrNavigate() {
  if (document.body?.classList.contains('editor-active')) return;
  if (!currentCard || !inputEl) return;
  if (graded) {
    if (typeof window.navNext === 'function') window.navNext();
    return;
  }

  const val = norm(inputEl.value);
  if (!val) return;

  if (clozeMode) {
    const idx = takeMatchingClozeIdx(val);
    if (Number.isFinite(idx)) {
      revealCloze(idx);
      clozeRemaining.delete(idx);
      const isFinal = clozeRemaining.size === 0;
      setClass(true, { persist: isFinal });
      inputEl.value = '';
      if (isFinal) {
        graded = true;
        const rt = Math.max(0, Math.round((performance.now() - t0) * HARD_MULTIPLIER));
        const totalAttempts = Math.max(1, 1 + wrongAttempts);
        const solvedClean = wrongAttempts === 0;
        if (typeof onGrade === 'function') onGrade(solvedClean, rt, totalAttempts, false);
      }
    } else {
      wrongAttempts += 1;
      setClass(false);
      if (typeof window.onWrongAttempt === 'function') window.onWrongAttempt();
    }
    return;
  }

  const ok = accepted.includes(val);

  if (!cardIsFlipped) {
    cardIsFlipped = true;
    attempts = 1;
    setClass(ok, { persist: ok });
    const el = document.querySelector('.flashcard');
    if (el) { el.classList.add('flipped'); el.removeAttribute('data-hide-back'); }

    if (ok) {
      graded = true;
      const rt = Math.max(0, Math.round((performance.now() - t0) * HARD_MULTIPLIER));
      const solvedClean = attempts <= 1;
      if (typeof onGrade === 'function') onGrade(solvedClean, rt, Math.max(1, attempts), false);
    } else {
      if (typeof window.onWrongAttempt === 'function') window.onWrongAttempt(); // main.js clamps to once
    }
    return;
  }

  if (!graded) {
    attempts++;
    clearClass(); setClass(ok, { persist: ok });
    if (ok) {
      graded = true;
      const rt = Math.max(0, Math.round((performance.now() - t0) * HARD_MULTIPLIER));
      const solvedClean = attempts <= 1;
      if (typeof onGrade === 'function') onGrade(solvedClean, rt, Math.max(1, attempts), false);
    } else {
      if (typeof window.onWrongAttempt === 'function') window.onWrongAttempt(); // still clamped to once
    }
    return;
  }
}

export function renderFillIn(card) {
  currentCard   = card;
  cardIsFlipped = false;
  graded        = false;
  attempts      = 0;
  wrongAttempts = 0;
  t0            = performance.now();
  accepted      = [];
  resetClozeState();
  buildClozeState(card);
  if (clozeMode) hydrateClozeNodes();

  function explode(list) {
    const out = [];
    if (!Array.isArray(list)) return out;
    for (const s of list) {
      if (typeof s !== 'string') continue;
      const trimmed = s.trim();
      if (!trimmed) continue;
      out.push(trimmed);
      // Tolerate comma/semicolon/pipe/slash separated variants inside a single item
      const parts = trimmed.split(/[;,|/]/);
      for (const p of parts) { const t = p.trim(); if (t) out.push(t); }
    }
    return out;
  }

  if (!clozeMode) {
    if (Array.isArray(card.accept) && card.accept.length) {
      const variants = explode(card.accept);
      const dedup = new Set(variants.map(a => norm(a)));
      accepted = Array.from(dedup);
    } else if (Array.isArray(card.correct) && card.correct.length) {
      // For correctness, 'correct' should already be canonical answers; still split defensively
      const variants = explode(card.correct);
      const list = variants.length ? variants : card.correct;
      const dedup = new Set(list.map(a => norm(a)));
      accepted = Array.from(dedup);
    } else if (Array.isArray(card.answers) && Array.isArray(card.correct_indices)) {
      const idxSet = new Set(card.correct_indices);
      accepted = card.answers
        .map((txt, i) => ({ txt, ok: idxSet.has(i) }))
        .filter(o => o.ok)
        .map(o => norm(o.txt));
    } else if (card.back) {
      accepted = [norm(card.back)];
    }

    const mcqAliases = getMcqCorrectAliases(card);
    if (mcqAliases.length) {
      const dedup = new Set(accepted);
      mcqAliases.forEach(alias => {
        const key = norm(alias);
        if (key) dedup.add(key);
      });
      accepted = Array.from(dedup);
    }
  }

  if (inputEl) { inputEl.value = ''; clearClass(); }
  if (feedbackTimer) {
    clearTimeout(feedbackTimer);
    feedbackTimer = 0;
  }
  minWidthPx = 0; ensureMinW(); grow();
  if (typeof window !== 'undefined') {
    requestAnimationFrame(() => window.dispatchEvent(new Event('card:bounds-changed')));
  }
}
