import { normalize as norm, buildDeckAnswerPool, mulberry32, choicesFromPoolForCard } from './answers.js';
import { resolveMcqOptions, resolveMcqCorrect } from './mcq-utils.js';

// Total choice cap (includes correct answers; we never drop correct ones)
let MCQ_DUMMY_CAP = 4;
let MCQ_ANSWERS_ON_CARD = true;
let onAdvance = null;
let deckPool = { global: new Map(), byLexeme: new Map() };
let seededRng = null;         // optional deterministic RNG
let equalizeRaf = 0;
let equalizeTimeout = 0;
let equalizeObserver = null;

export function setMCQMaxChoices(n) { // legacy name kept; sets total cap
  const v = Number(n);
  if (Number.isFinite(v) && v >= 0) MCQ_DUMMY_CAP = Math.floor(v);
}
export function setMCQDummyCap(n) { setMCQMaxChoices(n); }
export function getMCQDummyCap() { return MCQ_DUMMY_CAP; }
export function setMCQAnswersOnCard(on) { MCQ_ANSWERS_ON_CARD = !!on; }
export function getMCQAnswersOnCard() { return MCQ_ANSWERS_ON_CARD; }
export function setupMCQ(cb) { onAdvance = typeof cb === 'function' ? cb : null; }
export function seedMCQPool(cards) { deckPool = buildDeckAnswerPool(cards || []); }
export function setMCQSeed(seed) { seededRng = Number.isFinite(+seed) ? mulberry32(+seed) : null; }

const MCQ_STATE_CLASSES = ['state-neutral', 'state-correct', 'state-wrong'];
const CLOZE_RE = /\s*{{c\d+::(.*?)(?:::(.*?))?}}/gi;
const CLOZE_TTS_RE = /{{\s*c[^:}]*::([\s\S]*?)(?:::(?:[\s\S]*?))?\s*}}/gi;
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const MCQ_TTS_LINE_RE = /^\s*[A-H]\s*[\)\.\:]\s*.+$/i;
const MCQ_TTS_INLINE_RE = /\b[A-H]\s*[\)\.\:]\s*/i;
const NBSP_RE = /[\u00A0\u202F\u2007\u2060\uFEFF]/g;

function stripClozeForFrontTts(text) {
  const raw = String(text ?? '');
  if (!raw) return '';
  return raw.replace(CLOZE_TTS_RE, ' ');
}

function stripMcqLinesForTts(text) {
  const raw = String(text ?? '').replace(NBSP_RE, ' ');
  if (!raw) return '';
  const lines = raw.split(/\r?\n/);
  const filtered = lines.filter(line => !MCQ_TTS_LINE_RE.test(line));
  const cleaned = filtered
    .map(line => {
      const idx = line.search(MCQ_TTS_INLINE_RE);
      if (idx === -1) return line;
      return line.slice(0, idx).trimEnd();
    })
    .filter(Boolean);
  return cleaned.join('\n').trim();
}

function buildMcqTtsOptions(choices, { includeLetters = true } = {}) {
  if (!Array.isArray(choices) || !choices.length) return '';
  return choices
    .map((choice, idx) => {
      const key = choice.displayKey || choice.key || LETTERS[idx] || String(idx + 1);
      const text = String(choice.text ?? '').trim();
      const useKey = includeLetters ? key : '';
      if (!text && !useKey) return '';
      if (!text) return useKey ? `${useKey})` : '';
      return useKey ? `${useKey}) ${text}` : text;
    })
    .filter(Boolean)
    .join('\n');
}

function setFrontMcqTts(card, choices, { includeLetters = true } = {}) {
  const frontEl = document.querySelector('.flashcard__front');
  if (!frontEl) return;
  const question = stripClozeForFrontTts(stripMcqLinesForTts(card?.front_text ?? card?.front ?? ''));
  const options = buildMcqTtsOptions(choices, { includeLetters });
  const combined = [question, options].filter(Boolean).join('\n');
  if (combined) frontEl.dataset.tts = combined;
  else delete frontEl.dataset.tts;
}
function setFrontMcqTtsQuestionOnly(card) {
  const frontEl = document.querySelector('.flashcard__front');
  if (!frontEl) return;
  const question = stripClozeForFrontTts(stripMcqLinesForTts(card?.front_text ?? card?.front ?? ''));
  if (question) frontEl.dataset.tts = question;
  else delete frontEl.dataset.tts;
}

function clearMcqOptionList() {
  document.querySelectorAll('.mcq-option-list').forEach(el => el.remove());
}

function wrapWordsForHover(rootEl) {
  if (!rootEl) return;
  const fn = (typeof window !== 'undefined') ? window.__wrapWordsInElement : null;
  if (typeof fn === 'function') {
    fn(rootEl);
    return;
  }
  // Fallback: simple word wrapping (letters/digits + apostrophes)
  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node?.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest('.flashcard-word, .flashcard-edit-input, [contenteditable=\"true\"], textarea, input, .katex, .katex-display, .katex-mathml, .katex-html')) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  const wordRe = /([\\p{L}\\p{M}\\p{N}][\\p{L}\\p{M}\\p{N}\\u2019'\\-]*)/gu;
  nodes.forEach(node => {
    const text = node.nodeValue;
    if (!text || !wordRe.test(text)) return;
    wordRe.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0;
    let match;
    while ((match = wordRe.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (start > last) frag.appendChild(document.createTextNode(text.slice(last, start)));
      const span = document.createElement('span');
      span.className = 'flashcard-word';
      span.textContent = match[0];
      span.dataset.word = match[0].toLowerCase();
      frag.appendChild(span);
      last = end;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.replaceWith(frag);
  });
}

function renderMcqOptionList(choices) {
  const frontEl = document.querySelector('.flashcard__front');
  if (!frontEl) return;
  if (!choices || !choices.length) return;
  if (frontEl.querySelector('.flashcard-edit-input, textarea, input')) return;
  const textBlock = frontEl.querySelector('.flashcard-text');
  if (!textBlock) return;

  let list = frontEl.querySelector('.mcq-option-list');
  if (!list) {
    list = document.createElement('div');
    list.className = 'mcq-option-list';
    textBlock.insertAdjacentElement('afterend', list);
  }
  list.innerHTML = '';

  choices.forEach(choice => {
    const key = choice.displayKey || choice.key || '';
    const row = document.createElement('div');
    row.className = 'mcq-option-item';

    const keyEl = document.createElement('span');
    keyEl.className = 'mcq-option-key';
    keyEl.textContent = key ? `${key})` : '';

    const textEl = document.createElement('span');
    textEl.className = 'mcq-option-text';
    textEl.textContent = choice.text || '';

    row.appendChild(keyEl);
    row.appendChild(textEl);
    list.appendChild(row);
  });
  try {
    const fn = (typeof window !== 'undefined') ? window.renderMathInElement : null;
    if (typeof fn === 'function') {
      const cfg = window.__mathRenderConfig || { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '\\\\[', right: '\\\\]', display: true }, { left: '\\\\(', right: '\\\\)', display: false }, { left: '$', right: '$', display: false }], throwOnError: false, strict: 'ignore' };
      fn(list, cfg);
    }
  } catch {}
  return list;
}

function setButtonVisualState(btn, state = 'neutral') {
  if (!btn) return;
  btn.classList.remove(...MCQ_STATE_CLASSES);
  const cls = state === 'correct'
    ? 'state-correct'
    : state === 'wrong'
      ? 'state-wrong'
      : 'state-neutral';
  btn.classList.add(cls);
}

function attachPressAnimation(btn) {
  if (!btn) return;
  let pressStart = 0;
  const release = () => {
    const elapsed = performance.now() - pressStart;
    const minPressMs = 140;
    const delay = Math.max(0, minPressMs - elapsed);
    if (delay > 0) {
      setTimeout(() => btn.classList.remove('pressing'), delay);
    } else {
      btn.classList.remove('pressing');
    }
  };
  btn.addEventListener('pointerdown', () => {
    pressStart = performance.now();
    btn.classList.add('pressing');
  });
  ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach(evt => {
    btn.addEventListener(evt, release);
  });
}

// Normalize all MCQ option heights to the tallest rendered button so the grid is uniform.
function equalizeOptionHeights(host) {
  if (!host) return;
  const faces = Array.from(host.querySelectorAll('.btn-face'));
  const buttons = Array.from(host.querySelectorAll('.option-btn'));
  if (!faces.length || !buttons.length) return;

  // Clear any previous inline sizing before measuring
  faces.forEach(f => { f.style.minHeight = ''; });
  buttons.forEach(b => { b.style.minHeight = ''; b.style.height = ''; });
  host.style.removeProperty('--mcq-row-height');

  // Measure tallest button
  const maxBtn = Math.max(...buttons.map(b => b.getBoundingClientRect().height || 0));
  if (!Number.isFinite(maxBtn) || maxBtn <= 0) return;

  // Compute depth once (they all share the same CSS var)
  const depth = parseFloat(getComputedStyle(buttons[0]).getPropertyValue('--mcq-btn-depth')) || 10;
  const faceHeight = Math.max(0, maxBtn - depth);

  // Apply uniform height to faces and buttons and update grid row height
  faces.forEach(f => { f.style.minHeight = `${faceHeight}px`; });
  buttons.forEach(btn => {
    btn.style.minHeight = `${maxBtn}px`;
    btn.style.height = `${maxBtn}px`;
  });
  host.style.setProperty('--mcq-row-height', `${maxBtn}px`);
  if (typeof window !== 'undefined') {
    const isStableVisible = host.classList.contains('visible')
      && !host.classList.contains('animating-in')
      && !host.classList.contains('animating-out');
    if (isStableVisible) {
      requestAnimationFrame(() => window.dispatchEvent(new Event('card:bounds-changed')));
    }
  }

  // Keep uniform sizing on viewport changes
  if (!host._mcqResizeAttached) {
    host._mcqResizeAttached = true;
    const handler = () => scheduleEqualize(host);
    window.addEventListener('resize', handler, { passive: true });
    window.addEventListener('orientationchange', handler, { passive: true });
  }

  // Re-equalize whenever any option resizes (e.g., late font load/wrapping)
  if (equalizeObserver) equalizeObserver.disconnect();
  equalizeObserver = new ResizeObserver(() => scheduleEqualize(host));
  buttons.forEach(btn => equalizeObserver.observe(btn));
}

function scheduleEqualize(host) {
  if (!host) return;
  if (equalizeRaf) cancelAnimationFrame(equalizeRaf);
  if (equalizeTimeout) clearTimeout(equalizeTimeout);
  equalizeRaf = requestAnimationFrame(() => {
    equalizeOptionHeights(host);
    // Run again after paint to catch late font/layout changes
    equalizeTimeout = setTimeout(() => equalizeOptionHeights(host), 60);
  });
}

function buildOptionButton(text, fallbackIdx, ariaLabel) {
  const btn = document.createElement('button');
  btn.className = 'option-btn';
  btn.type = 'button';
  btn.setAttribute('aria-pressed', 'false');
  if (ariaLabel) btn.setAttribute('aria-label', ariaLabel);
  setButtonVisualState(btn, 'neutral');

  const face = document.createElement('div');
  face.className = 'btn-face';
  face.textContent = text || `(Option ${fallbackIdx})`;
  btn.appendChild(face);

  attachPressAnimation(btn);
  return { btn, face };
}

/* utils */
function shuffle(a, rng = Math.random) {
  for (let i=a.length-1;i>0;i--) { const j=Math.floor((rng||Math.random)()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}

function buildClozeRevealState(card) {
  const front = String(card?.front ?? '').replace(/[\u00A0\u202F\u2007\u2060\uFEFF]/g, ' ');
  if (!/{{c\d+::/i.test(front)) return null;
  const items = [];
  let idx = 0;
  front.replace(CLOZE_RE, (_, answer) => {
    const value = String(answer ?? '').replace(/[\u00A0\u202F\u2007\u2060\uFEFF]/g, ' ').trim();
    const normalized = norm(value);
    if (normalized) items.push({ idx, value, norm: normalized });
    idx += 1;
    return '';
  });
  if (!items.length) return null;

  const map = new Map();
  const remaining = new Set();
  const itemByIdx = new Map();
  items.forEach(item => {
    remaining.add(item.idx);
    itemByIdx.set(item.idx, item);
    const list = map.get(item.norm) || [];
    list.push(item.idx);
    map.set(item.norm, list);
  });

  const nodes = new Map();
  const frontEl = document.querySelector('.flashcard__front');
  if (frontEl) {
    frontEl.querySelectorAll('.cloze[data-cloze-idx]').forEach(node => {
      const id = Number(node.dataset.clozeIdx);
      if (Number.isFinite(id)) nodes.set(id, node);
    });
  }

  function revealForAnswer(text) {
    const key = norm(text);
    if (!key) return false;
    const list = map.get(key);
    if (!list || !list.length) return false;
    list.forEach(id => {
      if (!remaining.has(id)) return;
      remaining.delete(id);
      const node = nodes.get(id);
      const item = itemByIdx.get(id);
      if (node && item) {
        node.textContent = item.value;
        node.classList.add('cloze-revealed');
        node.dataset.clozeRevealed = '1';
      }
    });
    map.delete(key);
    return true;
  }

  return { revealForAnswer };
}

// Relaxed key for detecting duplicate/similar labels (punctuation/spacing agnostic)
function choiceKey(text) {
  const base = norm(text);
  if (!base) return '';
  const collapsed = base.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  return collapsed || base;
}

/* Collapse similar/duplicate choice labels while preferring any correct variant. */
function dedupeChoiceStrings(choices, normCorrectSet) {
  const correctSet = normCorrectSet || new Set();
  const byKey = new Map();
  const out = [];
  for (const raw of choices) {
    const text = String(raw ?? '');
    const key = choiceKey(text);
    if (!key) continue;
    const normText = norm(text);
    const isCorrect = correctSet.has(normText);
    const existing = byKey.get(key);
    if (!existing) {
      const entry = { text, normText, isCorrect };
      byKey.set(key, entry);
      out.push(entry);
      continue;
    }
    if (isCorrect && !existing.isCorrect) {
      existing.isCorrect = true;
      existing.text = text;
      existing.normText = normText;
    }
  }
  return out;
}

/* build options for both shapes */
function buildUniqueOptions(card) {
  const raw = Array.isArray(card.answers) ? card.answers : [];
  let options = [];
  if (raw.length && typeof raw[0] === 'object' && raw[0] !== null) {
    options = raw.map(o => ({ text: String(o.text ?? ''), correct: !!o.correct }));
  } else {
    const idx = new Set(Array.isArray(card.correct_indices) ? card.correct_indices : []);
    options = raw.map((t, i) => ({ text: String(t ?? ''), correct: idx.has(i) }));
  }
  const byText = new Map();
  for (const o of options) {
    const k = choiceKey(o.text); if (!k) continue;
    const prev = byText.get(k);
    if (!prev) byText.set(k, { text: o.text, correct: !!o.correct });
    else if (o.correct && !prev.correct) byText.set(k, { text: o.text, correct: true });
  }
  return [...byText.values()];
}

function pickWithCap(unique) {
  const correct = unique.filter(o => o.correct);
  const wrong   = unique.filter(o => !o.correct);
  const cap     = Math.max(MCQ_DUMMY_CAP, correct.length);
  shuffle(wrong);
  const picked = correct.concat(wrong.slice(0, Math.max(0, cap - correct.length)));
  return { choices: shuffle(picked), correctCount: correct.length };
}

export function renderMCQ(card) {
  const host = document.getElementById('options');
  if (!host) return;
  host.innerHTML = '';
  clearMcqOptionList();
  const startedAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const clozeReveal = buildClozeRevealState(card);

  const hasStructuredOptions = !!(card?.mcqOptions || card?.mcq?.options);
  const archetype = String(card?.archetype ?? card?.type ?? '').toLowerCase();
  const isMcqArchetype = archetype === 'mcq';
  const isMathsArchetype = archetype === 'maths';
  const showAnswersOnCard = isMcqArchetype && hasStructuredOptions && MCQ_ANSWERS_ON_CARD;
  const answersInButtons = isMcqArchetype && (!hasStructuredOptions || !MCQ_ANSWERS_ON_CARD);
  const showLetterOnly = showAnswersOnCard;
  const hasImage = !!(card?.image || card?.imageFront || card?.imageBack);
  const hasMask = !!(card?.mask && Array.isArray(card?.mask?.regions));
  const hasLegacyMask = !!card?.maskRegion;
  const hasLabels = Array.isArray(card?.labels) && card.labels.length > 0;
  const hasOcclusions = Array.isArray(card?.occlusions) && card.occlusions.length > 0;
  const hasDiagramId = !!card?.diagramId;
  let domImageCard = false;
  if (typeof document !== 'undefined') {
    const cardEl = document.querySelector('.flashcard');
    domImageCard = !!(cardEl && (cardEl.classList.contains('image-card') || cardEl.querySelector('.card-canvas, .flashcard-image, img')));
  }
  const isDiagramCard = hasImage || hasMask || hasLegacyMask || hasLabels || hasOcclusions || hasDiagramId || card?.type === 'diagram' || domImageCard;
  const hideLetters = !!(
    !isMcqArchetype ||
    isMathsArchetype ||
    isDiagramCard ||
    answersInButtons ||
    card?.mcqHideLetters ||
    card?.mcq?.hideLabels ||
    card?.mcq?.hideLetters
  );
  const explicitOptions = resolveMcqOptions(card);
  if (explicitOptions.length) {
    const { correctKeys, correctTextSet } = resolveMcqCorrect(card, explicitOptions);
    const baseChoices = explicitOptions.map(opt => ({
      key: opt.key,
      text: opt.text,
      correct: correctKeys.has(opt.key) || correctTextSet.has(norm(opt.text))
    }));
    const rng = seededRng || Math.random;
    const shuffled = hasStructuredOptions ? shuffle(baseChoices.slice(), rng) : baseChoices;
    const choices = shuffled.map((choice, idx) => ({
      ...choice,
      displayKey: hasStructuredOptions
        ? (LETTERS[idx] || String(idx + 1))
        : (choice.key || LETTERS[idx] || String(idx + 1))
    }));

    if (showLetterOnly) {
      const list = renderMcqOptionList(choices);
      if (list) wrapWordsForHover(list);
    }
    if (showAnswersOnCard) {
      setFrontMcqTts(card, choices, { includeLetters: !hideLetters });
    } else if (answersInButtons) {
      setFrontMcqTtsQuestionOnly(card);
    }

    const correctTargetCount = choices.filter(c => c.correct).length;
    if (!correctTargetCount) {
      console.warn('MCQ: options found but no correct answers matched.', { id: card?.id });
    }

    let correctChosen = new Set();
    let wrongClicks = 0;
    let completed = false;

    // Expose the explicit MCQ set for grids/inspectors (non-persistent) and mirror into legacy fields.
    try {
      const mapped = choices.map((c, idx) => ({
        text: c.text,
        correct: !!c.correct,
        index: idx,
        key: c.key,
        displayKey: c.displayKey
      }));
      card._mcqOptions = mapped;
      card.answers = mapped.map(m => m.text);
      card.correct_indices = mapped
        .map((m, i) => (m.correct ? i : null))
        .filter(i => i !== null);
    } catch {}

    const frag = document.createDocumentFragment();
    choices.forEach((choice, idx) => {
      const key = choice.displayKey || choice.key || '';
      const display = hideLetters ? choice.text
        : showLetterOnly ? key
        : (key ? `${key}) ${choice.text}` : choice.text);
      const aria = hideLetters ? choice.text : (key ? `${key}) ${choice.text}` : choice.text);
      const { btn, face } = buildOptionButton(display, idx + 1, aria);

      btn.addEventListener('click', () => {
        if (btn._fired || completed) return;
        btn._fired = true;
        btn.setAttribute('aria-pressed', 'true');

        const isCorrect = !!choice.correct;
        if (isCorrect) {
          face.classList.add('correct');
          setButtonVisualState(btn, 'correct');
          if (clozeReveal) clozeReveal.revealForAnswer(choice.text);
          const hit = key || choice.key || norm(choice.text);
          if (hit) correctChosen.add(hit);
          if (correctChosen.size === correctTargetCount) finish();
        } else {
          face.classList.add('incorrect');
          setButtonVisualState(btn, 'wrong');
          wrongClicks++;
          if (typeof window.onWrongAttempt === 'function') window.onWrongAttempt();
        }
      });

      frag.appendChild(btn);
    });
    host.appendChild(frag);
    try {
      const fn = (typeof window !== 'undefined') ? window.renderMathInElement : null;
      if (typeof fn === 'function') {
        const cfg = window.__mathRenderConfig || { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '\\\\[', right: '\\\\]', display: true }, { left: '\\\\(', right: '\\\\)', display: false }, { left: '$', right: '$', display: false }], throwOnError: false, strict: 'ignore' };
        fn(host, cfg);
      }
    } catch {}
    scheduleEqualize(host);

    function finish() {
      if (completed) return;
      completed = true;
      if (!clozeReveal) {
        const el = document.querySelector('.flashcard');
        if (el) {
          el.classList.add('flip-transition');
          el.classList.remove('no-transition');
          el.classList.add('flipped');
          el.removeAttribute('data-hide-back');
        }
      }
      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      const responseTimeMs = Math.max(0, Math.round(now - startedAt));
      const attempts = Math.max(1, 1 + wrongClicks); // only wrong clicks count as extra attempts
      const hintUsed = false;
      const solvedClean = wrongClicks === 0;
      if (typeof onAdvance === 'function') onAdvance(solvedClean, responseTimeMs, attempts, hintUsed);
    }
    return;
  }

  const isNewSchema = Array.isArray(card.correct) && card.correct.length > 0;

  if (isNewSchema) {
    // New schema: build options from deck pool (no per-card dummies stored)
    const normCorrectOriginal = new Set(card.correct.map(norm).filter(Boolean));
    const rng = seededRng || Math.random;
    const baseChoices = Array.isArray(card.mcqVariants) && card.mcqVariants.length
      ? card.mcqVariants.slice()
      : choicesFromPoolForCard(card, deckPool, MCQ_DUMMY_CAP, rng);
    const dedupedChoices = dedupeChoiceStrings(baseChoices, normCorrectOriginal);
    const correctEntries = dedupedChoices.filter(c => c.isCorrect);
    const normCorrect = new Set(
      correctEntries.map(c => c.normText).filter(Boolean)
    );
    const wrongEntries = dedupedChoices.filter(c => !c.isCorrect);
    const totalCap = Math.max(MCQ_DUMMY_CAP, correctEntries.length);
    const cappedChoices = correctEntries.concat(
      shuffle(wrongEntries.slice(), rng).slice(0, Math.max(0, totalCap - correctEntries.length))
    );
    const finalChoices = shuffle(cappedChoices, rng);
    // Expose the generated MCQ set on the card for grids/inspectors (non-persistent) and
    // also mirror into legacy answers/correct_indices so any MCQ grid renderer can show them.
    try {
      const mapped = finalChoices.map((c, idx) => ({
        text: c.text,
        correct: normCorrect.has(c.normText),
        index: idx,
        displayKey: LETTERS[idx] || String(idx + 1)
      }));
      card._mcqOptions = mapped;
      card.answers = mapped.map(m => m.text);
      card.correct_indices = mapped
        .map((m, i) => (m.correct ? i : null))
        .filter(i => i !== null);
    } catch {}
    if (answersInButtons) {
      setFrontMcqTtsQuestionOnly(card);
    }
    const correctTargetCount = correctEntries.length;

    let correctChosen = new Set();
    let wrongClicks = 0;
    let completed = false;

    const frag = document.createDocumentFragment();
    finalChoices.forEach((choice, idx) => {
      const key = LETTERS[idx] || String(idx + 1);
      const display = hideLetters ? choice.text : `${key}) ${choice.text}`;
      const aria = hideLetters ? choice.text : display;
      const { btn, face } = buildOptionButton(display, idx + 1, aria);

      btn.addEventListener('click', () => {
        if (btn._fired || completed) return;
        btn._fired = true;
        btn.setAttribute('aria-pressed', 'true');

          const normKey = choice.normText || norm(choice.text);
          const isCorrect = normCorrect.has(normKey);
          if (isCorrect) {
            face.classList.add('correct');
            setButtonVisualState(btn, 'correct');
            if (clozeReveal) clozeReveal.revealForAnswer(choice.text);
            correctChosen.add(key);
            if (correctChosen.size === correctTargetCount) finish();
          } else {
          face.classList.add('incorrect');
          setButtonVisualState(btn, 'wrong');
          wrongClicks++;
          if (typeof window.onWrongAttempt === 'function') window.onWrongAttempt();
        }
      });

      frag.appendChild(btn);
    });
    host.appendChild(frag);
    try {
      const fn = (typeof window !== 'undefined') ? window.renderMathInElement : null;
      if (typeof fn === 'function') {
        const cfg = window.__mathRenderConfig || { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '\\\\[', right: '\\\\]', display: true }, { left: '\\\\(', right: '\\\\)', display: false }, { left: '$', right: '$', display: false }], throwOnError: false, strict: 'ignore' };
        fn(host, cfg);
      }
    } catch {}
    scheduleEqualize(host);

    function finish() {
      if (completed) return;
      completed = true;
      if (!clozeReveal) {
        const el = document.querySelector('.flashcard');
        if (el) {
          el.classList.add('flip-transition');
          el.classList.remove('no-transition');
          el.classList.add('flipped');
          el.removeAttribute('data-hide-back');
        }
      }
      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      const responseTimeMs = Math.max(0, Math.round(now - startedAt));
      const attempts = Math.max(1, 1 + wrongClicks); // only wrong clicks count as extra attempts
      const hintUsed = false;
      const solvedClean = wrongClicks === 0;
      if (typeof onAdvance === 'function') onAdvance(solvedClean, responseTimeMs, attempts, hintUsed);
    }
    return;
  }

  // Legacy MCQ paths (answers[] with optional correct_indices or objects)
  const hasStringsForm = Array.isArray(card.answers) && card.answers.length &&
                         (Array.isArray(card.correct_indices) ? card.correct_indices.length : true);
  const hasObjectForm  = Array.isArray(card.answers) && card.answers.length &&
                         typeof card.answers[0] === 'object';
  if (!hasStringsForm && !hasObjectForm) return;

  const unique = buildUniqueOptions(card);
  const { choices, correctCount } = pickWithCap(unique);
  const mappedLegacy = choices.map((c, idx) => ({
    text: c.text,
    correct: !!c.correct,
    index: idx,
    displayKey: LETTERS[idx] || String(idx + 1)
  }));
  try { card._mcqOptions = mappedLegacy; } catch {}
  if (answersInButtons) {
    setFrontMcqTtsQuestionOnly(card);
  } else {
    setFrontMcqTts(card, choices, { includeLetters: !hideLetters });
  }

  let correctChosen = 0;
  let wrongClicks = 0;
  let completed = false;

  const frag = document.createDocumentFragment();
  choices.forEach((choice, idx) => {
    const key = LETTERS[idx] || String(idx + 1);
    const display = hideLetters ? choice.text : `${key}) ${choice.text}`;
    const aria = hideLetters ? choice.text : display;
    const { btn, face } = buildOptionButton(display, idx + 1, aria);
    face.dataset.correct = String(!!choice.correct);

    btn.addEventListener('click', () => {
      if (btn._fired || completed) return;
      btn._fired = true;
      btn.setAttribute('aria-pressed', 'true');

      const isCorrect = face.dataset.correct === 'true';
      if (isCorrect) {
        face.classList.add('correct');
        setButtonVisualState(btn, 'correct');
        if (clozeReveal) clozeReveal.revealForAnswer(choice.text);
        correctChosen++;
        if (correctChosen === correctCount) finish();
      } else {
        face.classList.add('incorrect');
        setButtonVisualState(btn, 'wrong');
        wrongClicks++;
        if (typeof window.onWrongAttempt === 'function') window.onWrongAttempt(); // main.js clamps to once
      }
    });

    frag.appendChild(btn);
  });
  host.appendChild(frag);
  try {
    const fn = (typeof window !== 'undefined') ? window.renderMathInElement : null;
    if (typeof fn === 'function') {
      const cfg = window.__mathRenderConfig || { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '\\\\[', right: '\\\\]', display: true }, { left: '\\\\(', right: '\\\\)', display: false }, { left: '$', right: '$', display: false }], throwOnError: false, strict: 'ignore' };
      fn(host, cfg);
    }
  } catch {}
  scheduleEqualize(host);

  function finish() {
    if (completed) return;
    completed = true;
    if (!clozeReveal) {
      const el = document.querySelector('.flashcard');
      if (el) {
        el.classList.add('flip-transition');
        el.classList.remove('no-transition');
        el.classList.add('flipped');
        el.removeAttribute('data-hide-back');
      }
    }

    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const responseTimeMs = Math.max(0, Math.round(now - startedAt));
    const attempts = Math.max(1, 1 + wrongClicks); // only wrong clicks count as extra attempts
    const hintUsed = false;
    const solvedClean = wrongClicks === 0;
    if (typeof onAdvance === 'function') onAdvance(solvedClean, responseTimeMs, attempts, hintUsed);
  }
}
