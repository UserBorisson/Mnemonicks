/**
 * inline editor
 *
 * - openEditor(id) enables inline editing for the current card.
 * - Front/back text edits happen directly on the card faces.
 * - Side panel shows the opposite-face preview plus correct-answer editing.
 */

let panel;
let previewLabel;
let previewBody;
let correctList;
let correctInput;
let correctAddBtn;
let acceptDetails;
let acceptInput;
let metaDetails;
let archetypeInput;
let langFrontInput;
let langBackInput;
let saveBtn;
let cancelBtn;
let newBtn;

let frontInput = null;
let backInput = null;
let working = null;
let original = null;
let answersShape = 'none';
let answerMode = 'correct';
let editorActive = false;
let flipObserver = null;
let positionRaf = 0;
let cardResizeObserver = null;

const onViewportChange = () => schedulePanelPosition();

export function initEditModal() {
  panel = document.querySelector('.flashcard-editor-panel');
  if (!panel) return;
  if (panel.parentElement !== document.body) {
    document.body.appendChild(panel);
  }

  previewLabel = panel.querySelector('[data-editor-preview-label]');
  previewBody = panel.querySelector('[data-editor-preview-body]');
  correctList = panel.querySelector('#editorCorrectList');
  correctInput = panel.querySelector('#editorCorrectInput');
  correctAddBtn = panel.querySelector('#editorCorrectAdd');
  acceptDetails = panel.querySelector('[data-editor-accept-details]');
  acceptInput = panel.querySelector('#editorAccept');
  metaDetails = panel.querySelector('[data-editor-meta]');
  archetypeInput = panel.querySelector('#editorArchetype');
  langFrontInput = panel.querySelector('#editorLangFront');
  langBackInput = panel.querySelector('#editorLangBack');
  saveBtn = panel.querySelector('[data-editor-save]');
  cancelBtn = panel.querySelector('[data-editor-cancel]');
  newBtn = panel.querySelector('[data-editor-new]');

  panel.addEventListener('click', onPanelClick);
  correctAddBtn?.addEventListener('click', () => addCorrectAnswer(correctInput?.value));
  correctInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCorrectAnswer(correctInput?.value);
    }
  });
  acceptInput?.addEventListener('input', () => {
    if (!working) return;
    working.acceptText = acceptInput.value;
  });
  archetypeInput?.addEventListener('input', () => {
    if (!working) return;
    working.archetype = archetypeInput.value;
  });
  langFrontInput?.addEventListener('input', () => {
    if (!working) return;
    working.langFront = langFrontInput.value;
  });
  langBackInput?.addEventListener('input', () => {
    if (!working) return;
    working.langBack = langBackInput.value;
  });
  saveBtn?.addEventListener('click', onSave);
  cancelBtn?.addEventListener('click', onCancel);
  newBtn?.addEventListener('click', onNew);

  const cardEl = document.querySelector('.flashcard');
  if (cardEl && !flipObserver) {
    flipObserver = new MutationObserver(() => {
      if (editorActive) updatePreview();
    });
    flipObserver.observe(cardEl, { attributes: true, attributeFilter: ['class'] });
  }
  if (window.ResizeObserver && cardEl && !cardResizeObserver) {
    cardResizeObserver = new ResizeObserver(() => {
      if (editorActive) schedulePanelPosition();
    });
    cardResizeObserver.observe(cardEl);
  }
}

export function openEditor(cardId) {
  if (!panel) initEditModal();
  if (!panel) return;
  const get = window.__getCardById;
  if (typeof get !== 'function') return;
  const card = get(cardId);
  if (!card) return;

  if (editorActive && working && String(working.id) === String(card.id)) {
    const isBack = document.querySelector('.flashcard')?.classList.contains('flipped');
    if (isBack) backInput?.input?.focus();
    else frontInput?.input?.focus();
    return;
  }

  startEditor(card);
}

export function openNewEditor() {
  if (!panel) initEditModal();
  if (!panel) return;
  const previousId = typeof window.__getCurrentCardId === 'function'
    ? window.__getCurrentCardId()
    : null;
  const card = buildBlankCard(previousId);
  prepareTextCardSurface();
  startEditor(card);
}

function onNew() {
  openNewEditor();
}

function startEditor(card) {
  original = deepClone(card);
  working = deepClone(cardToWorking(card));

  setEditorActive(true);
  setupFaceEditors();
  syncAnswersUI();
  updatePreview();
  if (metaDetails) {
    metaDetails.open = !!original?.__isNew;
  }
  const isBack = document.querySelector('.flashcard')?.classList.contains('flipped');
  if (isBack) backInput?.input?.focus();
  else frontInput?.input?.focus();
  try { window.setSuppressTTS?.(true); } catch {}
}

function prepareTextCardSurface() {
  const cardEl = document.querySelector('.flashcard');
  if (!cardEl) return;
  cardEl.classList.remove('image-card');
  cardEl.style.width = '';
  cardEl.style.height = '';
  cardEl.classList.remove('flipped');
  cardEl.removeAttribute('data-hide-back');
  const frontEl = cardEl.querySelector('.flashcard__front');
  const backEl = cardEl.querySelector('.flashcard__back');
  if (frontEl) frontEl.innerHTML = '';
  if (backEl) backEl.innerHTML = '';
  window.dispatchEvent(new Event('card:bounds-changed'));
}

function buildBlankCard(previousId) {
  const card = {
    id: generateNewCardId(),
    front: '',
    back: '',
    correct: [],
    accept: []
  };
  card.__isNew = true;
  if (previousId != null) card.__previousId = previousId;
  return card;
}

function generateNewCardId() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const id = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join('');
  return id;
}

function setEditorActive(on) {
  editorActive = !!on;
  document.body.classList.toggle('editor-active', editorActive);
  const cardEl = document.querySelector('.flashcard');
  cardEl?.classList.toggle('editing', editorActive);
  if (panel) {
    panel.hidden = !editorActive;
    panel.setAttribute('aria-hidden', editorActive ? 'false' : 'true');
    panel.scrollTop = 0;
  }
  if (editorActive) {
    attachViewportListeners();
    schedulePanelPosition();
  } else {
    detachViewportListeners();
  }
  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.classList.toggle('active', editorActive);
    btn.setAttribute('aria-pressed', editorActive ? 'true' : 'false');
  });
}

function attachViewportListeners() {
  window.addEventListener('resize', onViewportChange);
  window.addEventListener('scroll', onViewportChange, { passive: true });
  window.addEventListener('card:bounds-changed', onViewportChange);
}

function detachViewportListeners() {
  window.removeEventListener('resize', onViewportChange);
  window.removeEventListener('scroll', onViewportChange);
  window.removeEventListener('card:bounds-changed', onViewportChange);
  if (positionRaf) {
    cancelAnimationFrame(positionRaf);
    positionRaf = 0;
  }
}

function schedulePanelPosition() {
  if (!editorActive || !panel) return;
  if (positionRaf) cancelAnimationFrame(positionRaf);
  positionRaf = requestAnimationFrame(() => {
    positionRaf = 0;
    positionPanel();
  });
}

function positionPanel() {
  if (!editorActive || !panel) return;
  const cardEl = document.querySelector('.flashcard');
  if (!cardEl) return;

  const cardRect = cardEl.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const gap = 16;
  const safe = 8;
  const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;

  const panelW = panelRect.width || panel.offsetWidth || 0;
  const panelH = panelRect.height || panel.offsetHeight || 0;
  if (!panelW || !panelH) return;

  let left = cardRect.right + gap;
  let top = cardRect.top;

  if (left + panelW > viewportW - safe) {
    left = viewportW - panelW - safe;
  }
  left = Math.max(safe, left);
  top = Math.max(safe, Math.min(top, viewportH - panelH - safe));

  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
}

function setupFaceEditors() {
  frontInput = null;
  backInput = null;

  const cardEl = document.querySelector('.flashcard');
  const frontEl = cardEl?.querySelector('.flashcard__front');
  const backEl = cardEl?.querySelector('.flashcard__back');
  if (!cardEl || !frontEl || !backEl) return;

  const isImageCard = cardEl.classList.contains('image-card');
  if (isImageCard) return;

  frontEl.innerHTML = '';
  backEl.innerHTML = '';

  frontInput = buildEditorInput('front', working?.front ?? '', 'Front side text...');
  backInput = buildEditorInput('back', working?.back ?? '', 'Back side text...');

  frontEl.appendChild(frontInput.wrap);
  backEl.appendChild(backInput.wrap);
}

function buildEditorInput(face, value, placeholder) {
  const wrap = document.createElement('div');
  wrap.className = 'flashcard-edit-surface';
  const input = document.createElement('textarea');
  input.className = 'flashcard-edit-input';
  input.dataset.face = face;
  input.placeholder = placeholder;
  input.value = String(value ?? '');
  input.setAttribute('aria-label', face === 'front' ? 'Front text' : 'Back text');

  input.addEventListener('input', () => {
    if (!working) return;
    working[face] = input.value;
    updatePreview();
  });
  input.addEventListener('pointerdown', (e) => e.stopPropagation());
  input.addEventListener('click', (e) => e.stopPropagation());

  wrap.appendChild(input);
  return { wrap, input };
}

function syncAnswersUI() {
  if (!working || !panel) return;
  syncMetaUI();
  renderCorrectChips();
  if (correctInput) correctInput.value = '';

  if (acceptDetails) acceptDetails.hidden = answerMode === 'legacy';
  if (acceptInput) acceptInput.value = answerMode === 'legacy' ? '' : String(working.acceptText ?? '');
  if (acceptDetails) acceptDetails.open = !!String(working.acceptText ?? '').trim();
  schedulePanelPosition();
}

function syncMetaUI() {
  if (!working) return;
  if (archetypeInput) archetypeInput.value = String(working.archetype ?? '');
  if (langFrontInput) langFrontInput.value = String(working.langFront ?? '');
  if (langBackInput) langBackInput.value = String(working.langBack ?? '');
}

function updatePreview() {
  if (!working || !previewBody) return;
  const cardEl = document.querySelector('.flashcard');
  const isBack = !!cardEl?.classList.contains('flipped');
  const face = isBack ? 'front' : 'back';

  if (previewLabel) {
    previewLabel.textContent = face === 'front' ? 'Front preview' : 'Back preview';
  }

  const raw = face === 'front' ? working.front : working.back;
  previewBody.innerHTML = face === 'front' ? frontPreviewHTML(raw) : backPreviewHTML(raw);
}

function onPanelClick(e) {
  if (!working) return;
  const del = e.target.closest('button.answer-remove');
  if (del) {
    const i = Number(del.dataset.idx);
    if (Number.isFinite(i)) {
      working.correctAnswers.splice(i, 1);
      renderCorrectChips();
    }
  }
}

function addCorrectAnswer(text) {
  if (!working) return;
  const v = normalizeAnswer(text);
  if (!v) return;
  working.correctAnswers = Array.isArray(working.correctAnswers) ? working.correctAnswers : [];
  const key = normalizeKey(v);
  if (!working.correctAnswers.some(a => normalizeKey(a) === key)) {
    working.correctAnswers.push(v);
  }
  renderCorrectChips();
  if (correctInput) correctInput.value = '';
}

function renderCorrectChips() {
  if (!correctList) return;
  correctList.innerHTML = '';
  const list = Array.isArray(working?.correctAnswers) ? working.correctAnswers : [];
  list.forEach((text, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'answer-chip-wrap';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'answer-chip selected';
    btn.setAttribute('aria-pressed', 'true');
    btn.dataset.idx = String(i);
    btn.textContent = text || `(Answer ${i + 1})`;

    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'answer-remove';
    x.dataset.idx = String(i);
    x.setAttribute('aria-label', 'Remove');
    x.textContent = 'x';

    wrap.appendChild(btn);
    wrap.appendChild(x);
    correctList.appendChild(wrap);
  });
  schedulePanelPosition();
}

function onSave() {
  if (!working || !original) return;
  const emptyText = !(String(working.front || '').trim() || String(working.back || '').trim());
  const emptyImage = !String(working.image || '').trim();
  if (emptyText && emptyImage) return;

  const final = workingToCard(working);
  const isNew = !!original?.__isNew;
  const previousId = original?.__previousId ?? null;
  dispatchEvent('card:save', { card: final, toast: true, isNew, previousId });
  closeEditor();
}

function onCancel() {
  if (original?.__isNew) {
    const previousId = original?.__previousId ?? null;
    dispatchEvent('card:discard', { id: original.id, previousId });
    closeEditor();
    return;
  }
  if (!original) {
    closeEditor();
    return;
  }
  dispatchEvent('card:revert', { id: original.id });
  closeEditor();
}

function closeEditor() {
  setEditorActive(false);
  working = null;
  original = null;
  frontInput = null;
  backInput = null;
  try { window.setSuppressTTS?.(false); } catch {}
}

function frontPreviewHTML(txt) {
  const raw = String(txt ?? '').replace(/[\u00A0\u202F\u2007\u2060\uFEFF]/g, ' ');
  return raw
    .replace(/(\s*){{c\d+::[^}]+}}/g, (m, ws, offset) => {
      const gap = ws || (offset > 0 ? ' ' : '');
      return `${gap}<span class="cloze">[...]</span>`;
    })
    .replace(/\n/g, '<br>');
}
function backPreviewHTML(txt) {
  const raw = String(txt ?? '').replace(/[\u00A0\u202F\u2007\u2060\uFEFF]/g, ' ');
  return raw
    .replace(/(\s*){{c\d+::([^}]+)}}/g, (m, ws, answer, offset) => {
      const gap = ws || (offset > 0 ? ' ' : '');
      return `${gap}<span class="cloze">${answer}</span>`;
    })
    .replace(/\n/g, '<br>');
}

function normalizeArchetypeValue(value) {
  if (!value) return '';
  return String(value).trim();
}

function normalizeLangValue(value) {
  if (!value) return '';
  return String(value).trim();
}

function resolveWorkingLang(card) {
  const lang = card?.lang;
  const objLang = (lang && typeof lang === 'object' && !Array.isArray(lang)) ? lang : null;
  const front = normalizeLangValue(objLang?.front ?? card?.langFront ?? '');
  const back = normalizeLangValue(objLang?.back ?? card?.langBack ?? '');
  if (front || back) return { front, back };
  if (typeof lang === 'string') {
    const shared = normalizeLangValue(lang);
    return { front: shared, back: shared };
  }
  return { front: '', back: '' };
}

function applyWorkingLang(out, w) {
  const front = normalizeLangValue(w.langFront);
  const back = normalizeLangValue(w.langBack);
  if (!front && !back) {
    delete out.lang;
    delete out.langFront;
    delete out.langBack;
    return;
  }
  if (front && back && front === back) {
    out.lang = front;
  } else {
    const next = {};
    if (front) next.front = front;
    if (back) next.back = back;
    out.lang = next;
  }
  delete out.langFront;
  delete out.langBack;
}

function cardToWorking(card) {
  const w = deepClone(card);
  answerMode = 'correct';
  answersShape = 'none';

  if (Array.isArray(card.answers)) {
    if (typeof card.answers[0] === 'object' && card.answers[0] !== null) {
      answersShape = 'objects';
      w.answersObj = card.answers.map(o => ({ text: String(o.text ?? ''), correct: !!o.correct }));
    } else {
      answersShape = 'strings';
      const idx = new Set(Array.isArray(card.correct_indices) ? card.correct_indices : []);
      w.answersObj = card.answers.map((t, i) => ({ text: String(t ?? ''), correct: idx.has(i) }));
    }
  } else {
    w.answersObj = [];
  }

  const correctFromCard = Array.isArray(card.correct) ? card.correct : [];
  if (correctFromCard.length) {
    answerMode = 'correct';
    w.correctAnswers = normalizeAnswerList(correctFromCard);
  } else if (answersShape !== 'none') {
    answerMode = 'legacy';
    w.correctAnswers = normalizeAnswerList(
      (w.answersObj || []).filter(o => o.correct).map(o => o.text)
    );
  } else {
    answerMode = 'correct';
    const fallback = [card.back_text, card.back, card.answer]
      .map(v => normalizeAnswer(v))
      .filter(Boolean);
    w.correctAnswers = normalizeAnswerList(fallback);
  }

  w.front = String(w.front ?? '');
  w.back = String(w.back ?? '');
  w.acceptText = Array.isArray(card.accept) ? card.accept.join(', ') : '';
  w.archetype = normalizeArchetypeValue(card?.archetype ?? '');
  const lang = resolveWorkingLang(card);
  w.langFront = lang.front;
  w.langBack = lang.back;
  return w;
}

function workingToCard(w) {
  const out = deepClone(w);
  const correctAnswers = normalizeAnswerList(w.correctAnswers);

  if (answerMode === 'legacy' && answersShape !== 'none') {
    applyLegacyCorrectAnswers(out, correctAnswers);
  } else {
    out.correct = correctAnswers;
    const acceptList = parseCSV(w.acceptText);
    if (acceptList.length) out.accept = acceptList;
    else delete out.accept;
    delete out.answers;
    delete out.correct_indices;
    delete out._mcqOptions;
  }

  if (!('front' in out)) out.front = '';
  if (!('back' in out)) out.back = '';
  if (typeof out.image !== 'string') out.image = '';

  delete out.answersObj;
  delete out.correctAnswers;
  delete out.acceptText;
  delete out.__isNew;
  delete out.__previousId;

  const archetype = normalizeArchetypeValue(w.archetype);
  if (archetype) out.archetype = archetype;
  else delete out.archetype;

  applyWorkingLang(out, w);
  return out;
}

function applyLegacyCorrectAnswers(out, correctAnswers) {
  const normSet = new Set(correctAnswers.map(normalizeKey));
  if (answersShape === 'objects') {
    const answers = Array.isArray(out.answers)
      ? out.answers.map(o => ({ ...o, text: String(o?.text ?? '') }))
      : [];
    const seen = new Set();
    answers.forEach(a => {
      const key = normalizeKey(a.text);
      if (key) seen.add(key);
      a.correct = normSet.has(key);
    });
    correctAnswers.forEach(text => {
      const key = normalizeKey(text);
      if (!key || seen.has(key)) return;
      answers.push({ text, correct: true });
      seen.add(key);
    });
    out.answers = answers;
    delete out.correct_indices;
    return;
  }

  if (answersShape === 'strings') {
    let answers = Array.isArray(out.answers) ? out.answers.map(a => String(a ?? '')) : [];
    const indexByKey = new Map();
    answers.forEach((text, i) => {
      const key = normalizeKey(text);
      if (key && !indexByKey.has(key)) indexByKey.set(key, i);
    });
    const correctIdx = new Set();
    correctAnswers.forEach(text => {
      const key = normalizeKey(text);
      if (!key) return;
      let idx = indexByKey.get(key);
      if (idx == null) {
        answers.push(text);
        idx = answers.length - 1;
        indexByKey.set(key, idx);
      }
      correctIdx.add(idx);
    });
    out.answers = answers;
    out.correct_indices = Array.from(correctIdx);
  }
}

function normalizeAnswer(value) {
  if (value == null) return '';
  const trimmed = String(value).trim();
  return trimmed;
}
function normalizeKey(value) {
  return normalizeAnswer(value).toLowerCase();
}
function normalizeAnswerList(list) {
  const out = [];
  const seen = new Set();
  (Array.isArray(list) ? list : []).forEach(item => {
    const text = normalizeAnswer(item);
    if (!text) return;
    const key = normalizeKey(text);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(text);
  });
  return out;
}

function dispatchEvent(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}
function deepClone(o) {
  return JSON.parse(JSON.stringify(o || {}));
}
function parseCSV(s) {
  return String(s || '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i);
}
