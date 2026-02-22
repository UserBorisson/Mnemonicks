// flashcard.js
// Pure rendering/navigation module; deck is provided by main.js

import { stripLatexSyntax } from './tts-normalize.js';
import { getMCQAnswersOnCard } from './mcq.js';
import { resolveMcqOptions, resolveMcqCorrect } from './mcq-utils.js';
import { normalize as normalizeAnswer } from './answers.js';
import { showAlert } from './alerts.js';
import { sanitizeDeckHtml } from './sanitize-html.js';

let deck = [];
let currentCard = null;
let idx = 0;

const GAP_PX = 16; // vertical space below card for option/fillin panels
const GAP_SCALE_FACTOR = 1.5;
const FULLSCREEN_BOTTOM_MARGIN = 24;
const PANEL_STACK_GAP_PX = 12;
const FULLSCREEN_STACK_MAX_VW = 88;
const FULLSCREEN_SPLIT_CARD_MAX_VW = 50;
const FULLSCREEN_SPLIT_CARD_MAX_PX = 900;
const MIN_STACK_CARD_HEIGHT = 300;
const DEFAULT_OPTIONS_PANEL_HEIGHT = 210;
const DEFAULT_FILLIN_PANEL_HEIGHT = 92;
let layoutRaf = null;
let lastPanelTop = null;
const splitPanelTopById = new Map();
const splitPanelHeightCache = new Map();
let lastCentreY = null;
let lastPerspectiveOrigin = '';
let lastToolbarBaseShiftX = null;
let lastToolbarWidth = null;
let baselineCardWidth = 0;
const REFERENCE_CARD_WIDTH = 820;
const REFERENCE_CARD_HEIGHT = 320;
const BASE_PERSPECTIVE = 2600;
const MIN_CARD_PERSPECTIVE = 2200;
const MAX_CARD_PERSPECTIVE = 5200;
const PERSPECTIVE_HEIGHT_WEIGHT = 0.72;
const PERSPECTIVE_WIDTH_WEIGHT = 1 - PERSPECTIVE_HEIGHT_WEIGHT;
const WORD_LOOKUP_DELAY_MS = 450;
const WORD_LOOKUP_HIDE_MS = 160;
const LOOKUP_TIMEOUT_MS = 2200;
const LOOKUP_RETRIES = 2;
const LOOKUP_BACKOFF_MS = 250;
const LOOKUP_ALERT_COOLDOWN_MS = 15000;
const wordLookupCache = new Map();
const wordLookupPending = new Map();
let wordLookupReady = false;
let wordHoverTimer = null;
let wordHideTimer = null;
let wordHovering = false;
let popupHovering = false;
let activeWordEl = null;
let popupEl = null;
let popupWordEl = null;
let popupIpaEl = null;
let popupPosEl = null;
let popupLoadingEl = null;
let popupStatusEl = null;
let popupDefEl = null;
let lookupRequestId = 0;
let lastLookupAlertAt = 0;
const wordSegmenter = (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function')
  ? new Intl.Segmenter(undefined, { granularity: 'word' })
  : null;
const MATH_RENDER_CONFIG = {
  delimiters: [
    { left: '$$', right: '$$', display: true },
    { left: '\\[', right: '\\]', display: true },
    { left: '\\(', right: '\\)', display: false },
    { left: '$', right: '$', display: false }
  ],
  throwOnError: false,
  strict: 'ignore'
};
if (typeof window !== 'undefined') {
  window.__mathRenderConfig = MATH_RENDER_CONFIG;
}

function adjustLayout(opts = {}) {
  const immediate = opts === true || (opts && typeof opts === 'object' && opts.immediate === true);
  const runPass = () => {
    const card  = document.querySelector('.flashcard');
    if (!card) return;

    const scrollY   = window.scrollY || window.pageYOffset || 0;
    const frame = document.getElementById('flashcard-frame');
    const frameRect = frame ? frame.getBoundingClientRect() : null;
    const cardRect  = card.getBoundingClientRect();
    const isFullscreen = card.classList.contains('fullscreen');
    const isFlipping = card.dataset.flipping === '1';
    const cardTop   = frameRect ? (cardRect.top - frameRect.top) : (cardRect.top + scrollY);
    const cardH     = card.offsetHeight || card.getBoundingClientRect().height || 0;
    const cardBottom = cardTop + cardH;
    const viewportH = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0);

    const centreY  = Math.round(cardTop + cardH / 2);
    const centreYViewport = Math.round(viewportH / 2);

    // Keep perspective origin pinned to card center, but freeze while flipping
    // so the 3D flip does not retarget perspective mid-transition.
    if (!isFlipping && frame && frameRect && cardRect) {
      const originX = Math.round((cardRect.left - frameRect.left) + (cardRect.width / 2));
      const originY = Math.round((cardRect.top - frameRect.top) + (cardRect.height / 2));
      const nextOrigin = `${originX}px ${originY}px`;
      if (nextOrigin !== lastPerspectiveOrigin) {
        frame.style.setProperty('--frame-perspective-origin', nextOrigin);
        lastPerspectiveOrigin = nextOrigin;
      }
    }

    const isSplit = frame?.classList.contains('fullscreen-split');
    if (isSplit) {
      if (!isFlipping) {
        ['options', 'fillin'].forEach(id => {
          const el = document.getElementById(id);
          if (!el) return;
          const panelH = el.offsetHeight || el.getBoundingClientRect().height || 0;
          const minTop = 12;
          const maxTop = viewportH - panelH - FULLSCREEN_BOTTOM_MARGIN;
          const targetTop = Math.max(minTop, Math.min(maxTop, Math.round(centreYViewport - panelH / 2)));
          if (splitPanelTopById.get(id) !== targetTop) {
            el.style.top = `${targetTop}px`;
            splitPanelTopById.set(id, targetTop);
          }
        });
      }
      lastPanelTop = null;
    } else {
      splitPanelTopById.clear();
      if (!isFlipping) {
        const gap = Math.round(GAP_PX * (isFullscreen ? GAP_SCALE_FACTOR : 1));
        const panelTop = Math.round(cardBottom + gap);
        if (panelTop !== lastPanelTop) {
          ['options', 'fillin'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.top = `${panelTop}px`;
          });
          lastPanelTop = panelTop;
        }
      }
    }

    const toolbarRow = document.querySelector('.flashcard-toolbar-row');
    if (!isFlipping && toolbarRow && frameRect && cardRect) {
      const frameCenterX = frameRect.width / 2;
      const cardCenterX = (cardRect.left - frameRect.left) + (cardRect.width / 2);
      const baseShiftX = Math.round(cardCenterX - frameCenterX);
      const toolbarWidth = Math.max(1, Math.round(cardRect.width));
      if (baseShiftX !== lastToolbarBaseShiftX) {
        toolbarRow.style.setProperty('--toolbar-base-shift-x', `${baseShiftX}px`);
        lastToolbarBaseShiftX = baseShiftX;
      }
      if (toolbarWidth !== lastToolbarWidth) {
        toolbarRow.style.setProperty('--toolbar-target-width', `${toolbarWidth}px`);
        lastToolbarWidth = toolbarWidth;
      }
    }

    if (!isFlipping && centreY !== lastCentreY) {
      ['prevBtn', 'nextBtn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.style.top = `${centreY}px`;
      });
      lastCentreY = centreY;
    }

    if (!isFlipping) {
      updateFullscreenFontScale(card, cardRect);
      updateCardPerspective(card, cardRect);
    }

    const layoutChanged = !isFlipping && updateFullscreenLayout(card);
    if (layoutChanged) {
      scheduleFullscreenRefit(card, { immediate: true });
      adjustLayout({ immediate: true });
    }
  };

  if (layoutRaf) cancelAnimationFrame(layoutRaf);
  if (immediate) {
    layoutRaf = null;
    runPass();
    return;
  }
  layoutRaf = requestAnimationFrame(() => {
    layoutRaf = null;
    runPass();
  });
}

window.addEventListener('resize', adjustLayout);

function updateFullscreenFontScale(cardEl, cardRect) {
  if (!cardEl || !cardRect) return;
  const isFullscreen = cardEl.classList.contains('fullscreen');
  if (!isFullscreen) {
    if (cardRect.width) baselineCardWidth = cardRect.width;
    cardEl.style.setProperty('--card-font-scale', '1');
    return;
  }
  const base = baselineCardWidth || cardRect.width || 1;
  const ratio = base ? (cardRect.width / base) : 1;
  const scaled = 1 + (ratio - 1) * 0.5;
  const clamped = Math.max(1, Math.min(scaled, 1.45));
  cardEl.style.setProperty('--card-font-scale', clamped.toFixed(3));
}

function computeCardPerspective(cardEl, cardRect) {
  const width = Math.max(
    1,
    Math.round(cardRect?.width || 0),
    cardEl?.offsetWidth || 0
  );
  const height = Math.max(
    1,
    Math.round(cardRect?.height || 0),
    cardEl?.offsetHeight || 0
  );
  const widthScale = width / REFERENCE_CARD_WIDTH;
  const heightScale = height / REFERENCE_CARD_HEIGHT;
  const weightedScale = (
    heightScale * PERSPECTIVE_HEIGHT_WEIGHT +
    widthScale * PERSPECTIVE_WIDTH_WEIGHT
  );
  const rawPerspective = BASE_PERSPECTIVE * weightedScale;
  return Math.round(Math.max(MIN_CARD_PERSPECTIVE, Math.min(MAX_CARD_PERSPECTIVE, rawPerspective)));
}

function updateCardPerspective(cardEl, cardRect) {
  if (!cardEl || !cardRect) return;
  const perspective = computeCardPerspective(cardEl, cardRect);
  cardEl.style.setProperty('--card-perspective', `${perspective}px`);
  const frame = document.getElementById('flashcard-frame');
  if (frame) frame.style.setProperty('--frame-perspective', `${perspective}px`);
}

function readLivePanelHeight(id) {
  const el = document.getElementById(id);
  if (!el) return 0;
  const rect = el.getBoundingClientRect();
  const h = rect.height || el.offsetHeight || 0;
  if (h > 0) splitPanelHeightCache.set(id, h);
  return h;
}

function getStackPanelWidth(viewportW) {
  const frame = document.getElementById('flashcard-frame');
  const frameStyle = frame ? getComputedStyle(frame) : null;
  const layoutMax = frameStyle ? parseFloat(frameStyle.getPropertyValue('--layout-card-max')) : NaN;
  const layoutCap = Number.isFinite(layoutMax) && layoutMax > 0 ? layoutMax : 820;
  return Math.max(220, Math.min(layoutCap, viewportW * 0.92));
}

function resetMcqCloneSizing(clone) {
  if (!clone) return;
  clone.style.removeProperty('--mcq-row-height');
  clone.querySelectorAll('.option-btn').forEach(btn => {
    btn.style.removeProperty('min-height');
    btn.style.removeProperty('height');
  });
  clone.querySelectorAll('.btn-face').forEach(face => {
    face.style.removeProperty('min-height');
  });
}

function equalizeMcqCloneSizing(clone) {
  if (!clone) return;
  const buttons = Array.from(clone.querySelectorAll('.option-btn'));
  const faces = Array.from(clone.querySelectorAll('.btn-face'));
  if (!buttons.length || !faces.length) return;
  const maxBtn = Math.max(...buttons.map(btn => btn.getBoundingClientRect().height || 0));
  if (!Number.isFinite(maxBtn) || maxBtn <= 0) return;
  const depth = parseFloat(getComputedStyle(buttons[0]).getPropertyValue('--mcq-btn-depth')) || 10;
  const faceHeight = Math.max(0, maxBtn - depth);
  faces.forEach(face => { face.style.minHeight = `${faceHeight}px`; });
  buttons.forEach(btn => {
    btn.style.minHeight = `${maxBtn}px`;
    btn.style.height = `${maxBtn}px`;
  });
  clone.style.setProperty('--mcq-row-height', `${maxBtn}px`);
}

function measureHiddenPanelHeight(id, viewportW) {
  const el = document.getElementById(id);
  if (!el) return 0;

  const clone = el.cloneNode(true);
  if (!clone) return 0;
  clone.removeAttribute('id');
  clone.classList.add('visible');
  clone.classList.remove('animating-in', 'animating-out');
  clone.style.position = 'fixed';
  clone.style.left = '-100000px';
  clone.style.top = '0';
  clone.style.transform = 'none';
  clone.style.visibility = 'hidden';
  // Force real layout for off-screen probe nodes; otherwise
  // content-visibility/contain-intrinsic-size can return fallback heights.
  clone.style.contentVisibility = 'visible';
  clone.style.contain = 'none';
  clone.style.containIntrinsicSize = 'auto';
  clone.style.pointerEvents = 'none';
  clone.style.zIndex = '-1';
  clone.style.maxWidth = 'none';
  clone.style.width = `${Math.round(getStackPanelWidth(viewportW))}px`;
  if (id === 'options') resetMcqCloneSizing(clone);

  let height = 0;
  try {
    document.body.appendChild(clone);
    if (id === 'options') equalizeMcqCloneSizing(clone);
    const rect = clone.getBoundingClientRect();
    height = rect.height || clone.offsetHeight || 0;
  } catch {}
  try { clone.remove(); } catch {}

  if (height > 0) splitPanelHeightCache.set(id, height);
  return height;
}

function estimateHiddenOptionsHeight(el, viewportW) {
  if (!el) return DEFAULT_OPTIONS_PANEL_HEIGHT;
  const count = el.querySelectorAll('.option-btn').length;
  if (!count) return DEFAULT_OPTIONS_PANEL_HEIGHT;
  const cs = getComputedStyle(el);
  const rowVar = parseFloat(cs.getPropertyValue('--mcq-row-height'));
  const btnH = parseFloat(cs.getPropertyValue('--mcq-btn-height')) || 68;
  const btnDepth = parseFloat(cs.getPropertyValue('--mcq-btn-depth')) || 10;
  const rowH = Number.isFinite(rowVar) && rowVar > 0 ? rowVar : (btnH + btnDepth);
  const cols = viewportW <= 540 ? 1 : 2;
  const rows = Math.max(1, Math.ceil(count / cols));
  const gap = rows > 1 ? 18 * (rows - 1) : 0;
  const pad = 14 + (14 + btnDepth);
  return Math.round(rows * rowH + gap + pad);
}

function getPanelHeightForSplit(id, viewportW) {
  const frame = document.getElementById('flashcard-frame');
  const isSplit = !!frame?.classList?.contains('fullscreen-split');
  if (isSplit) {
    // Decide split using a stacked-width probe, not the currently split panel box.
    const stackMeasured = measureHiddenPanelHeight(id, viewportW);
    if (stackMeasured > 0) return stackMeasured;
  }
  const live = readLivePanelHeight(id);
  if (live > 0) return live;
  const hiddenMeasured = measureHiddenPanelHeight(id, viewportW);
  if (hiddenMeasured > 0) return hiddenMeasured;
  const cached = splitPanelHeightCache.get(id) || 0;
  if (cached > 0) return cached;
  if (id === 'options') {
    const el = document.getElementById('options');
    return estimateHiddenOptionsHeight(el, viewportW);
  }
  return DEFAULT_FILLIN_PANEL_HEIGHT;
}

function getFullscreenTopSafe(offsetPx = 12, floorPx = 12) {
  const toolbarRow = document.querySelector('.flashcard-toolbar-row');
  const toolbarBottom = toolbarRow?.getBoundingClientRect?.().bottom || 0;
  return Math.max(toolbarBottom + offsetPx, floorPx);
}

function applyStackModeCardHeightCap(cardEl, panelHeights) {
  if (!cardEl) return;
  if (cardEl.classList.contains('image-card') || !panelHeights?.length) {
    cardEl.style.removeProperty('--fullscreen-stack-max-height');
    return;
  }

  const viewportH = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0);
  const topSafe = getFullscreenTopSafe(12, 12);
  const bottomSafe = FULLSCREEN_BOTTOM_MARGIN;
  const gap = Math.round(GAP_PX * GAP_SCALE_FACTOR);

  let panelTotal = 0;
  panelHeights.forEach((height, idx) => {
    panelTotal += Math.max(0, Number(height) || 0);
    if (idx > 0) panelTotal += PANEL_STACK_GAP_PX;
  });

  const centerY = viewportH / 2;
  const up = Math.max(0, centerY - topSafe);
  const down = Math.max(0, (viewportH - bottomSafe) - centerY);
  const centeredSpan = 2 * Math.min(up, down);
  const maxCardHeight = Math.floor(centeredSpan - gap - panelTotal);

  if (maxCardHeight >= MIN_STACK_CARD_HEIGHT) {
    cardEl.style.setProperty('--fullscreen-stack-max-height', `${maxCardHeight}px`);
  } else {
    cardEl.style.removeProperty('--fullscreen-stack-max-height');
  }
}

function updateFullscreenLayout(cardEl) {
  const frame = document.getElementById('flashcard-frame');
  if (!frame || !cardEl) return false;

  const wasActive = frame.classList.contains('fullscreen-active');
  const isFullscreen = cardEl.classList.contains('fullscreen');
  frame.classList.toggle('fullscreen-active', isFullscreen);

  const hadSplit = frame.classList.contains('fullscreen-split');
  if (!isFullscreen) {
    cardEl.style.removeProperty('--fullscreen-stack-max-height');
    if (hadSplit) frame.classList.remove('fullscreen-split');
    return wasActive !== isFullscreen || hadSplit;
  }

  // When the UI mode is flashcard, never keep split active, even if
  // MCQ/fillin panels are still fading out with `visible animating-out`.
  if (document.body?.classList?.contains('mode-flashcard')) {
    cardEl.style.removeProperty('--fullscreen-stack-max-height');
    if (hadSplit) frame.classList.remove('fullscreen-split');
    return wasActive !== isFullscreen || hadSplit;
  }

  const viewportW = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
  const body = document.body;
  const panelHeights = [];
  if (body?.classList?.contains('mode-mcq')) {
    const h = getPanelHeightForSplit('options', viewportW);
    if (h > 0) panelHeights.push(h);
  } else if (body?.classList?.contains('mode-fillin')) {
    const h = getPanelHeightForSplit('fillin', viewportW);
    if (h > 0) panelHeights.push(h);
  } else {
    ['options', 'fillin'].forEach(id => {
      const el = document.getElementById(id);
      if (el && el.classList.contains('visible')) {
        const h = getPanelHeightForSplit(id, viewportW);
        if (h > 0) panelHeights.push(h);
      }
    });
  }

  if (!panelHeights.length) {
    cardEl.style.removeProperty('--fullscreen-stack-max-height');
    if (hadSplit) frame.classList.remove('fullscreen-split');
    return wasActive !== isFullscreen || hadSplit;
  }

  applyStackModeCardHeightCap(cardEl, panelHeights);

  let shouldSplit = shouldSplitFullscreen(cardEl, panelHeights);

  if (hadSplit && !shouldSplit) {
    // Re-check once in true stacked geometry before collapsing split; this
    // avoids being tricked by split-sized card bounds.
    frame.classList.remove('fullscreen-split');
    shouldSplit = shouldSplitFullscreen(cardEl, panelHeights);
  }

  if (shouldSplit) {
    if (!frame.classList.contains('fullscreen-split')) frame.classList.add('fullscreen-split');
    cardEl.style.removeProperty('--fullscreen-stack-max-height');
  } else if (frame.classList.contains('fullscreen-split')) {
    frame.classList.remove('fullscreen-split');
  }

  return (wasActive !== isFullscreen) || (shouldSplit !== hadSplit);
}

function shouldSplitFullscreen(cardEl, panelHeights) {
  if (!cardEl || !panelHeights?.length) return false;
  const viewportH = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0);
  const topSafe = getFullscreenTopSafe(12, 12);
  const bottomSafe = FULLSCREEN_BOTTOM_MARGIN;
  const cardRect = cardEl.getBoundingClientRect();
  const cardHeight = Math.max(
    0,
    cardEl.offsetHeight || 0,
    parseFloat(getComputedStyle(cardEl).height) || 0,
    cardRect.height || 0
  );
  const gap = Math.round(GAP_PX * GAP_SCALE_FACTOR);

  let panelTotal = 0;
  panelHeights.forEach((height, idx) => {
    panelTotal += Math.max(0, Number(height) || 0);
    if (idx > 0) panelTotal += PANEL_STACK_GAP_PX;
  });

  // Use a centered stack-fit test: only split when card + panel stack
  // cannot fit vertically around the viewport center within safe margins.
  // Use layout height (offset/computed) instead of transformed bounds so
  // mouse-driven tilt/translation does not force a false split decision.
  const stackHeight = cardHeight + gap + panelTotal;
  const centerY = viewportH / 2;
  const stackTop = centerY - (stackHeight / 2);
  const stackBottom = centerY + (stackHeight / 2);
  const fitsCentered = stackTop >= topSafe && stackBottom <= (viewportH - bottomSafe);
  return !fitsCentered;
}

// --- Image sizing helpers (regular vs fullscreen) ---
const _sizeWatchers = new WeakMap();
const _fullscreenRafs = new WeakMap();

function applySizingFromWatcher(cardEl) {
  const entry = _sizeWatchers.get(cardEl);
  if (!entry?.frontEl || !entry?.measureCanvas) return;
  applyImageSizing(cardEl, entry.frontEl, entry.measureCanvas);
}

function computeFullscreenBounds(cardEl, padX = 0, padY = 0) {
  const viewportW = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
  const viewportH = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0);
  const frame = document.getElementById('flashcard-frame');
  const isSplit = !!frame?.classList.contains('fullscreen-split');
  const frameStyle = frame ? getComputedStyle(frame) : null;
  const fsMaxRaw = frameStyle ? parseFloat(frameStyle.getPropertyValue('--fullscreen-card-max')) : NaN;
  const layoutMaxRaw = frameStyle ? parseFloat(frameStyle.getPropertyValue('--layout-card-max')) : NaN;
  const stackMaxPx = Number.isFinite(fsMaxRaw) && fsMaxRaw > 0
    ? fsMaxRaw
    : (Number.isFinite(layoutMaxRaw) && layoutMaxRaw > 0 ? layoutMaxRaw : 1200);

  const topMargin = getFullscreenTopSafe(16, 32);
  const bottomMargin = 40;
  const cardRect = cardEl?.getBoundingClientRect?.() || null;
  const cardTop = Number.isFinite(cardRect?.top) ? cardRect.top : topMargin;
  const effectiveTop = Math.max(topMargin, cardTop);
  // Fullscreen image sizing must be independent from answer panels below;
  // otherwise toggling MCQ/fillin shrinks tall diagrams.
  const maxInnerHeight = Math.max(160, Math.floor(viewportH - effectiveTop - bottomMargin - padY));

  const stackMax = Math.min(viewportW * (FULLSCREEN_STACK_MAX_VW / 100), stackMaxPx);
  const splitMax = Math.min(viewportW * (FULLSCREEN_SPLIT_CARD_MAX_VW / 100), FULLSCREEN_SPLIT_CARD_MAX_PX);
  const frameRect = frame?.getBoundingClientRect?.() || null;
  const framePadLeft = frameStyle ? (parseFloat(frameStyle.paddingLeft) || 0) : 0;
  const framePadRight = frameStyle ? (parseFloat(frameStyle.paddingRight) || 0) : 0;
  const frameWidthCap = Math.max(220, (Number.isFinite(frameRect?.width) ? frameRect.width : viewportW) - framePadLeft - framePadRight);
  const viewportWidthCap = Math.max(220, viewportW - 16); // keep a tiny gutter for borders/shadows
  const maxInnerWidth = Math.max(220, Math.min((isSplit ? splitMax : stackMax) - padX, frameWidthCap - padX, viewportWidthCap - padX));

  return {
    maxInnerWidth: Math.max(220, maxInnerWidth),
    maxInnerHeight
  };
}

function computeRegularBounds(padY = 0) {
  const viewportH = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0);
  const frame = document.getElementById('flashcard-frame');
  const frameRect = frame ? frame.getBoundingClientRect() : null;
  const topOffset = frameRect ? frameRect.top : 120; // distance from viewport top

  // Account for visible panels so the card scales to fit above them
  let panelH = 0;
  const panel = document.querySelector('.options.visible, .fillin.visible');
  if (panel) {
    const rect = panel.getBoundingClientRect();
    panelH = (rect.height || 0) + 32; // add breathing room
  } else {
    panelH = 280; // fallback allowance when panel is hidden
  }

  const reserved = panelH + 180; // extra breathing room for controls/debug
  const available = viewportH - topOffset - reserved - padY;
  const maxInnerHeight = Math.max(200, available);
  return { maxInnerHeight };
}

function clearSizingState(cardEl) {
  if (!cardEl) return;
  const existing = _sizeWatchers.get(cardEl);
  if (existing) {
    existing.ro?.disconnect();
    existing.mo?.disconnect();
    _sizeWatchers.delete(cardEl);
  }
  const raf = _fullscreenRafs.get(cardEl);
  if (raf) {
    cancelAnimationFrame(raf);
    _fullscreenRafs.delete(cardEl);
  }
}

function scheduleFullscreenRefit(cardEl, { immediate = false } = {}) {
  if (!cardEl) return;
  const entry = _sizeWatchers.get(cardEl);
  if (!entry?.measureCanvas || !entry?.frontEl) return;
  if (cardEl.dataset.flipping === '1' && !immediate) return;
  if (!cardEl.classList.contains('fullscreen') && !immediate) return;

  const runSizing = () => applySizingFromWatcher(cardEl);

  if (immediate) {
    runSizing();
    return;
  }

  const prev = _fullscreenRafs.get(cardEl);
  if (prev) cancelAnimationFrame(prev);

  const raf = requestAnimationFrame(() => {
    runSizing();
    _fullscreenRafs.delete(cardEl);
  });
  _fullscreenRafs.set(cardEl, raf);
}

if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    const fsCard = document.querySelector('.flashcard.fullscreen');
    if (fsCard) scheduleFullscreenRefit(fsCard);
  });
  window.addEventListener('card:bounds-changed', () => {
    const cardEl = document.querySelector('.flashcard');
    if (!cardEl) return;
    if (cardEl.dataset.flipping !== '1') {
      scheduleFullscreenRefit(cardEl, { immediate: true });
    }
    adjustLayout({ immediate: true });
  });
}

/**
 * Contain the image (canvas) inside the flashcard.
 * - Regular mode: height is derived from card width (CSS controls width).
 * - Fullscreen:   width/height are chosen from live viewport bounds so the full card stays visible.
 *
 * Accepts any canvas with valid intrinsic dimensions (front or back).
 */
function applyImageSizing(cardEl, frontEl, measureCanvas) {
  if (!cardEl || !frontEl || !measureCanvas) return;

  const w = measureCanvas.width;
  const h = measureCanvas.height;
  if (!w || !h) return;

  const ratio = h / w;
  // Keep image cards locked to the source image ratio (prevents fallback fullscreen aspect clipping).
  cardEl.style.aspectRatio = `${w} / ${h}`;

  // paddings of the FRONT face (content box for the canvas)
  const fcs   = getComputedStyle(frontEl);
  const padX  = parseFloat(fcs.paddingLeft) + parseFloat(fcs.paddingRight) || 0;
  const padY  = parseFloat(fcs.paddingTop)  + parseFloat(fcs.paddingBottom) || 0;

  if (cardEl.classList.contains('fullscreen')) {
    const bounds = computeFullscreenBounds(cardEl, padX, padY);
    let innerW = Math.max(1, bounds.maxInnerWidth || w || frontEl.clientWidth - padX || 1);
    let innerH = Math.max(1, Math.round(innerW * ratio));

    if (Number.isFinite(bounds.maxInnerHeight) && bounds.maxInnerHeight > 0 && innerH > bounds.maxInnerHeight) {
      innerH = bounds.maxInnerHeight;
      innerW = Math.max(1, Math.round(innerH / ratio));
    }
    if (Number.isFinite(bounds.maxInnerWidth) && bounds.maxInnerWidth > 0 && innerW > bounds.maxInnerWidth) {
      innerW = bounds.maxInnerWidth;
      innerH = Math.max(1, Math.round(innerW * ratio));
    }

    const commitSize = () => {
      cardEl.style.width = `${Math.max(1, Math.round(innerW + padX))}px`;
      cardEl.style.height = `${Math.max(1, Math.round(innerH + padY))}px`;
    };

    commitSize();

    // Final viewport safety pass: if any edge still overflows, shrink once more.
    const viewportW = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
    const viewportH = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0);
    const topSafe = getFullscreenTopSafe(8, 8);
    const bottomSafe = FULLSCREEN_BOTTOM_MARGIN;
    const sideSafe = 8;

    const fitOverflow = () => {
      const rect = cardEl.getBoundingClientRect();
      const overflowBottom = Math.max(0, rect.bottom - (viewportH - bottomSafe));
      const overflowTop = Math.max(0, topSafe - rect.top);
      const overflowRight = Math.max(0, rect.right - (viewportW - sideSafe));
      const overflowLeft = Math.max(0, sideSafe - rect.left);
      const overflowH = overflowBottom + overflowTop;
      const overflowW = overflowRight + overflowLeft;
      if (overflowH <= 0 && overflowW <= 0) return false;

      const outerW = Math.max(1, Math.round(innerW + padX));
      const outerH = Math.max(1, Math.round(innerH + padY));
      const scaleH = overflowH > 0 ? Math.max(0.1, (outerH - overflowH - 2) / outerH) : 1;
      const scaleW = overflowW > 0 ? Math.max(0.1, (outerW - overflowW - 2) / outerW) : 1;
      const scale = Math.min(scaleH, scaleW, 1);
      if (scale >= 1) return false;

      innerW = Math.max(1, Math.floor(innerW * scale));
      innerH = Math.max(1, Math.round(innerW * ratio));
      if (Number.isFinite(bounds.maxInnerHeight) && bounds.maxInnerHeight > 0 && innerH > bounds.maxInnerHeight) {
        innerH = bounds.maxInnerHeight;
        innerW = Math.max(1, Math.round(innerH / ratio));
      }
      if (Number.isFinite(bounds.maxInnerWidth) && bounds.maxInnerWidth > 0 && innerW > bounds.maxInnerWidth) {
        innerW = bounds.maxInnerWidth;
        innerH = Math.max(1, Math.round(innerW * ratio));
      }
      commitSize();
      return true;
    };

    // Two passes are enough for rounding/layout jitter.
    if (fitOverflow()) fitOverflow();
  } else {
    let innerW = Math.max(0, frontEl.clientWidth - padX);
    if (!innerW) {
      const cardWidth = cardEl.clientWidth || 0;
      if (cardWidth) innerW = Math.max(0, cardWidth - padX);
    }
    if (!innerW) innerW = Math.max(1, Math.min(w, (window.innerWidth || 0) - padX - 64));

    let innerH = Math.max(1, Math.round(innerW * ratio));
    cardEl.style.width  = ''; // respect CSS clamp
    cardEl.style.height = `${innerH + padY}px`;
  }

  adjustLayout();
}

function watchCardSizing(cardEl, frontEl, measureCanvas) {
  // clean previous watchers
  clearSizingState(cardEl);

  const rerun = () => applyImageSizing(cardEl, frontEl, measureCanvas);
  const ro = new ResizeObserver(rerun);
  ro.observe(cardEl);
  ro.observe(frontEl);

  const mo = new MutationObserver((muts) => {
    if (cardEl.dataset.flipping === '1') return;
    const IGNORE_CLASSES = new Set([
      'flipped',
      'flip-transition',
      'transitioning',
      'swipe-keep-back',
      'dragging',
      'snap-back'
    ]);
    const hasGeometryClassChange = muts.some(m => {
      if (m.type !== 'attributes' || m.attributeName !== 'class') return false;
      const before = new Set(String(m.oldValue || '').split(/\s+/).filter(Boolean));
      const after = new Set(Array.from(cardEl.classList));
      for (const cls of before) {
        if (!after.has(cls) && !IGNORE_CLASSES.has(cls)) return true;
      }
      for (const cls of after) {
        if (!before.has(cls) && !IGNORE_CLASSES.has(cls)) return true;
      }
      return false;
    });
    if (!hasGeometryClassChange && cardEl.classList.contains('fullscreen')) return;
    if (cardEl.classList.contains('fullscreen')) {
      scheduleFullscreenRefit(cardEl);
    } else {
      rerun();
    }
  });
  mo.observe(cardEl, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });

  _sizeWatchers.set(cardEl, { ro, mo, frontEl, measureCanvas });

  if (cardEl.classList.contains('fullscreen')) scheduleFullscreenRefit(cardEl);
}

// Helpers for cloze rendering
const NONBREAKING_SPACE_RE = /[\u00A0\u202F\u2007\u2060\uFEFF]/g;
function normalizeNbsp(text) {
  return String(text ?? '').replace(NONBREAKING_SPACE_RE, ' ');
}

const MCQ_LINE_RE = /^\s*[A-H]\s*[\)\.\:]\s*.+$/i;
const MCQ_INLINE_RE = /\b[A-H]\s*[\)\.\:]\s*/i;
function stripMcqOptionLines(raw) {
  const lines = String(raw ?? '').split(/\r?\n/);
  const filtered = lines.filter(line => !MCQ_LINE_RE.test(line));
  return stripInlineMcqOptions(filtered.join('\n'));
}
function stripInlineMcqOptions(raw) {
  if (!raw) return '';
  const lines = String(raw ?? '').split(/\r?\n/);
  const out = [];
  lines.forEach(line => {
    if (!line) return;
    if (MCQ_LINE_RE.test(line)) return;
    const idx = line.search(MCQ_INLINE_RE);
    if (idx === -1) {
      if (line.trim()) out.push(line);
      return;
    }
    const prefix = line.slice(0, idx).trimEnd();
    if (prefix) out.push(prefix);
  });
  return out.join('\n').trim();
}
function shouldStripMcqLines(card) {
  if (!card) return false;
  const archetype = String(card.archetype ?? card.type ?? '').toLowerCase();
  if (archetype !== 'mcq') return false;
  return true;
}

function isMcqArchetype(card) {
  return String(card?.archetype ?? card?.type ?? '').toLowerCase() === 'mcq';
}

function mcqAnswersInButtons(card) {
  if (!isMcqArchetype(card)) return false;
  const hasStructured = !!(card?.mcqOptions || card?.mcq?.options);
  if (hasStructured) {
    const pref = typeof getMCQAnswersOnCard === 'function' ? getMCQAnswersOnCard() : true;
    return !pref;
  }
  return true;
}

function getMcqQuestionText(card) {
  const raw = normalizeNbsp(card?.front_text ?? card?.front ?? '');
  if (!raw) return '';
  const stripped = stripMcqOptionLines(raw);
  return stripped || raw.trim();
}

function getMcqAnswerText(card) {
  if (!card) return '';
  if (Array.isArray(card.correct) && card.correct.length) {
    const ok = card.correct.map(s => String(s ?? '').trim()).filter(Boolean);
    if (ok.length) return ok.join(', ');
  }
  const options = resolveMcqOptions(card);
  if (!options.length) return '';
  const { correctKeys, correctTextSet, byKey } = resolveMcqCorrect(card, options);
  if (!correctKeys.size && !correctTextSet.size) return '';
  const normToText = new Map();
  options.forEach(opt => {
    const normText = normalizeAnswer(opt.text);
    if (normText && !normToText.has(normText)) normToText.set(normText, opt.text);
  });
  const out = [];
  const push = (text) => {
    const t = String(text ?? '').trim();
    if (!t || out.includes(t)) return;
    out.push(t);
  };
  correctKeys.forEach(key => {
    const opt = byKey.get(key);
    if (opt?.text) push(opt.text);
  });
  correctTextSet.forEach(normText => {
    const raw = normToText.get(normText);
    if (raw) push(raw);
  });
  return out.join(', ');
}

function getMcqBackText(card) {
  const q = getMcqQuestionText(card);
  const a = getMcqAnswerText(card);
  if (!q && !a) return '';
  if (!q) return a;
  if (!a) return q;
  return `${q}\n${a}`;
}

function applyTtsSilentMarkup(text) {
  if (text == null || text === '') return '';
  return String(text)
    .replace(/&lt;&lt;!([\s\S]*?)!&gt;&gt;/gi, '<span data-tts="off">$1</span>')
    .replace(/<<!([\s\S]*?)!>>/g, '<span data-tts="off">$1</span>');
}

function frontHTML(txt, card) {
  let raw = normalizeNbsp(txt);
  if (shouldStripMcqLines(card)) raw = stripMcqOptionLines(raw);
  raw = applyTtsSilentMarkup(raw);
  if (!/{{c\d+::/.test(raw)) return sanitizeDeckHtml(raw);
  let idx = 0;
  const rendered = raw.replace(/(\s*){{c\d+::(.*?)(?:::(.*?))?}}/gi, (m, ws, answer, hint, offset) => {
    const id = idx++;
    const gap = ws || (offset > 0 ? ' ' : '');
    return `${gap}<span class="cloze" data-cloze-idx="${id}">[...]</span>`;
  });
  return sanitizeDeckHtml(rendered);
}
function backHTML(card) {
  const archetype = String(card?.archetype ?? card?.type ?? '').toLowerCase();
  if (archetype === 'mcq') {
    const mcqBack = getMcqBackText(card);
    if (mcqBack) return sanitizeDeckHtml(applyTtsSilentMarkup(mcqBack));
  }
  const raw = applyTtsSilentMarkup(normalizeNbsp(card?.back ?? ''));
  if (/{{c\d+::/.test(raw)) {
    const rendered = raw.replace(/(\s*){{c\d+::(.*?)(?:::(.*?))?}}/gi, (m, ws, answer, hint, offset) => {
      const gap = ws || (offset > 0 ? ' ' : '');
      return `${gap}<span class="cloze">${answer}</span>`;
    });
    return sanitizeDeckHtml(rendered);
  }
  return sanitizeDeckHtml(raw);
}

function normalizeLookupWord(word) {
  if (!word) return '';
  return String(word)
    .trim()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .replace(/^['\u2019]+|['\u2019]+$/g, '');
}

const MACRON_RE = /[\u0100\u0101\u0112\u0113\u012a\u012b\u014c\u014d\u016a\u016b\u0232\u0233\u0304]/;

function stripMacrons(text) {
  if (!text) return '';
  const normalized = String(text).normalize('NFD');
  const stripped = normalized.replace(/[\u0300-\u036f]/g, '');
  return stripped.normalize('NFC');
}

function hasMacron(text) {
  return MACRON_RE.test(String(text || ''));
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

const WIKTIONARY_LANG_NAME = {
  en: 'English',
  tr: 'Turkish',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  ru: 'Russian',
  ja: 'Japanese',
  zh: 'Chinese',
  'zh-cn': 'Chinese',
  ko: 'Korean',
  el: 'Greek',
  pl: 'Polish',
  la: 'Latin'
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

function resolveWiktionaryLanguageName(value) {
  const raw = normalizeLangValue(value);
  if (!raw) return '';
  const lower = raw.toLowerCase();
  const mapped = LANGUAGE_NAME_TO_CODE[lower] || lower;
  if (WIKTIONARY_LANG_NAME[mapped]) return WIKTIONARY_LANG_NAME[mapped];
  const base = mapped.split(/[-_]/)[0];
  if (WIKTIONARY_LANG_NAME[base]) return WIKTIONARY_LANG_NAME[base];
  if (typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function') {
    try {
      const display = new Intl.DisplayNames(['en'], { type: 'language' });
      const named = display.of(mapped) || display.of(base);
      if (named) return named;
    } catch {}
  }
  return raw;
}

function getCardFaceLanguage(card, face) {
  if (!card) return '';
  const faceKey = face === 'back' ? 'back' : 'front';
  const lang = card.lang;
  let value = '';
  if (lang && typeof lang === 'object' && !Array.isArray(lang)) {
    value = lang[faceKey] ?? '';
  }
  if (!value) {
    value = face === 'back' ? (card.langBack ?? '') : (card.langFront ?? '');
  }
  if (!value && typeof lang === 'string') value = lang;
  return normalizeLangValue(value);
}

function applyFaceLanguageData(frontEl, backEl, card) {
  if (!frontEl || !backEl) return;
  const frontLang = getCardFaceLanguage(card, 'front');
  const backLang = getCardFaceLanguage(card, 'back');
  if (frontLang) frontEl.dataset.lang = frontLang;
  else delete frontEl.dataset.lang;
  if (backLang) backEl.dataset.lang = backLang;
  else delete backEl.dataset.lang;
}

const INFLECTION_DEFINITION_RE = /^(plural|plural form|plural of)\b/i;

function isInflectionDefinition(text) {
  if (!text) return false;
  return INFLECTION_DEFINITION_RE.test(String(text).trim());
}

function singularizeWord(word, langCode) {
  const lower = String(word || '').toLowerCase();
  if (!lower || lower.length < 3) return [];
  const out = [];
  const add = (value) => {
    if (!value || value === lower) return;
    if (!out.includes(value)) out.push(value);
  };

  if (langCode === 'tr') {
    if (lower.endsWith('lar') || lower.endsWith('ler')) {
      add(lower.slice(0, -3));
    }
    return out;
  }

  if (!/[a-z]/.test(lower)) return out;

  const irregular = {
    men: 'man',
    women: 'woman',
    children: 'child',
    people: 'person',
    teeth: 'tooth',
    feet: 'foot',
    geese: 'goose',
    mice: 'mouse',
    lice: 'louse',
    oxen: 'ox'
  };
  if (irregular[lower]) {
    add(irregular[lower]);
    return out;
  }

  const exceptions = new Set([
    'series', 'species', 'news', 'physics', 'mathematics', 'economics', 'linguistics', 'means'
  ]);
  if (exceptions.has(lower)) return out;

  if (lower.endsWith('ies') && lower.length > 4) {
    const stem = lower.slice(0, -3);
    add(`${stem}ie`);
    add(`${stem}y`);
  }
  if (lower.endsWith('ves') && lower.length > 4) {
    const stem = lower.slice(0, -3);
    add(`${stem}f`);
    add(`${stem}fe`);
  }
  if (/(ses|xes|zes|ches|shes|oes)$/.test(lower) && lower.length > 4) {
    add(lower.slice(0, -2));
  }
  if (
    lower.endsWith('s')
    && !lower.endsWith('ss')
    && !lower.endsWith('us')
    && !lower.endsWith('is')
    && lower.length > 3
  ) {
    add(lower.slice(0, -1));
  }
  return out;
}

function condenseText(text, maxLen = 120) {
  if (!text) return '';
  const cleaned = String(text).replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLen) return cleaned;
  const trimmed = cleaned.slice(0, Math.max(0, maxLen - 3));
  const minCut = Math.max(40, Math.floor(maxLen * 0.6));
  const cut = trimmed.lastIndexOf(' ');
  const finalText = cut > minCut ? trimmed.slice(0, cut) : trimmed;
  return `${finalText}...`;
}

function cleanDefinitionOutput(text) {
  if (!text) return '';
  return String(text)
    .replace(/^definition\s*[:\-]\s*/i, '')
    .replace(/^[-–•\d.]+\s*/g, '')
    .replace(/["“”]/g, '')
    .replace(/\.mw-parser-output\b[^{}]*\{[^}]*\}/g, ' ')
    .replace(/\bmw-parser-output\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanIpaOutput(text) {
  if (!text) return '';
  return String(text)
    .replace(/\s+/g, ' ')
    .trim();
}

function getDefinitionContext(wordEl, rawWord) {
  const word = String(rawWord || wordEl?.textContent || '').trim();
  const front = stripHtml(currentCard?.front ?? currentCard?.front_text ?? '').trim();
  const back = stripHtml(
    currentCard?.back_text
    ?? currentCard?.back
    ?? currentCard?.answer
    ?? (Array.isArray(currentCard?.correct) ? currentCard.correct[0] : '')
    ?? ''
  ).trim();
  const hint = stripHtml(currentCard?.hint ?? currentCard?.note ?? currentCard?.notes ?? '').trim();
  const face = wordEl?.closest?.('.flashcard__back') ? 'back' : 'front';
  const faceLang = getCardFaceLanguage(currentCard, face);
  return {
    word,
    front,
    back,
    hint,
    face,
    faceLang,
    cardId: String(currentCard?.id ?? '')
  };
}

function looksEnglishText(text) {
  if (!text) return false;
  const cleaned = String(text).trim();
  if (!cleaned) return false;
  if (/[^\x00-\x7F]/.test(cleaned)) return false;
  return /[A-Za-z]/.test(cleaned);
}

function normalizeSynonyms(list, originalWord = '') {
  const seen = new Set();
  const original = String(originalWord || '').toLowerCase();
  const out = [];
  (Array.isArray(list) ? list : []).forEach(item => {
    const raw = String(item || '').trim();
    if (!raw) return;
    const lower = raw.toLowerCase();
    if (lower === original) return;
    if (seen.has(lower)) return;
    seen.add(lower);
    out.push(raw);
  });
  return out;
}

function formatSynonyms(list, originalWord = '') {
  const normalized = normalizeSynonyms(list, originalWord);
  if (!normalized.length) return '';
  const limited = normalized.slice(0, 3);
  const formatted = limited.map(item => condenseText(item, 32));
  return formatted.join('\n');
}

function stripHtml(text) {
  if (!text) return '';
  return String(text).replace(/<[^>]+>/g, ' ');
}

function sanitizeTranslation(text) {
  if (!text) return '';
  return String(text)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function primaryTranslationChunk(text) {
  const cleaned = sanitizeTranslation(text);
  if (!cleaned) return '';
  const slashSplit = cleaned.split(/[\/|]/)[0] || '';
  const commaSplit = slashSplit.split(/[;,]/)[0] || '';
  return commaSplit.trim();
}

function headwordFromPhrase(text) {
  const cleaned = primaryTranslationChunk(text);
  if (!cleaned) return '';
  const [first] = cleaned.split(/\s+/);
  return first ? first.trim() : '';
}

function getDeckLanguageHint() {
  const id = String(currentCard?.id || '').toLowerCase();
  if (/^tr[_-]/.test(id)) return 'tr';
  let deckPath = '';
  try {
    deckPath = String(localStorage.getItem('DECK_PATH_V1') || '').toLowerCase();
  } catch {}
  if (!deckPath) return '';
  if (deckPath.includes('turkish')) return 'tr';
  if (/(^|[\\/._-])tr([\\/._-]|$)/.test(deckPath)) return 'tr';
  return '';
}

function getDeckSynonymSeed(word) {
  if (!currentCard) return '';
  const raw = normalizeLookupWord(word).toLowerCase();
  if (!raw) return '';
  const frontRaw = stripHtml(currentCard.front || '').trim();
  const backRaw = stripHtml(
    currentCard.back_text
    ?? currentCard.back
    ?? currentCard.answer
    ?? (Array.isArray(currentCard.correct) ? currentCard.correct[0] : '')
    ?? ''
  ).trim();
  if (!backRaw) return '';
  const backClean = primaryTranslationChunk(backRaw) || backRaw;
  const frontNorm = normalizeLookupWord(frontRaw).toLowerCase();
  const backNorm = normalizeLookupWord(backClean).toLowerCase();
  const deckLang = getDeckLanguageHint();
  const preferBack = deckLang === 'tr' || looksEnglishText(backClean);
  if (raw && backNorm && raw === backNorm) return backClean;
  if (preferBack && frontNorm && raw === frontNorm) return backClean;
  if (preferBack && frontRaw) {
    const frontTokens = frontRaw
      .split(/\s+/)
      .map(token => normalizeLookupWord(token).toLowerCase())
      .filter(Boolean);
    if (frontTokens.includes(raw)) return backClean;
  }
  return '';
}

function detectLanguageFromScript(word) {
  if (!word) return '';
  if (/[ぁ-ゟ゠-ヿ]/.test(word)) return 'ja';
  if (/[一-龯]/.test(word)) return 'zh-CN';
  if (/[가-힣]/.test(word)) return 'ko';
  if (/[А-Яа-яЁё]/.test(word)) return 'ru';
  if (/[Α-Ωα-ω]/.test(word)) return 'el';
  if (/[çğıöşüÇĞİÖŞÜ]/.test(word)) return 'tr';
  if (/[ąęłńóśźżĄĘŁŃÓŚŹŻ]/.test(word)) return 'pl';
  return '';
}

function getCardTranslationHint(word) {
  if (!currentCard) return '';
  const raw = normalizeLookupWord(word).toLowerCase();
  if (!raw) return '';
  const frontRaw = stripHtml(currentCard.front || '').trim();
  if (!frontRaw) return '';
  const backRaw = stripHtml(
    currentCard.back_text
    ?? currentCard.back
    ?? currentCard.answer
    ?? (Array.isArray(currentCard.correct) ? currentCard.correct[0] : '')
    ?? ''
  ).trim();
  if (!backRaw) return '';
  const frontNorm = normalizeLookupWord(frontRaw).toLowerCase();
  if (frontNorm && frontNorm === raw) return primaryTranslationChunk(backRaw);
  const frontTokens = frontRaw
    .split(/\s+/)
    .map(token => normalizeLookupWord(token).toLowerCase())
    .filter(Boolean);
  if (frontTokens.length && frontTokens.length <= 3 && frontTokens.includes(raw)) {
    return primaryTranslationChunk(backRaw);
  }
  return '';
}

function splitWordSegments(text) {
  if (!text) return [];
  if (wordSegmenter) {
    return Array.from(wordSegmenter.segment(text), seg => ({
      text: seg.segment,
      isWord: !!seg.isWordLike
    }));
  }
  const segments = [];
  const re = /(\p{L}[\p{L}\p{M}\p{N}\u2019'-]*)/gu;
  re.lastIndex = 0;
  let lastIndex = 0;
  let match;
  while ((match = re.exec(text)) !== null) {
    const start = match.index;
    if (start > lastIndex) {
      segments.push({ text: text.slice(lastIndex, start), isWord: false });
    }
    segments.push({ text: match[0], isWord: true });
    lastIndex = start + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), isWord: false });
  }
  return segments;
}

function wrapWordNodes(rootEl) {
  if (!rootEl) return;
  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node?.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest('.flashcard-word, .flashcard-edit-input, [contenteditable="true"], textarea, input')) {
        return NodeFilter.FILTER_REJECT;
      }
      if (parent.closest('.katex, .katex-display, .katex-mathml, .katex-html')) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(node => wrapTextNode(node));
}

function renderMathIn(rootEl) {
  if (!rootEl || typeof window === 'undefined') return;
  const fn = window.renderMathInElement;
  if (typeof fn !== 'function') return;
  const cfg = window.__mathRenderConfig || MATH_RENDER_CONFIG;
  try { fn(rootEl, cfg); } catch {}
}

function wrapTextNode(node) {
  const text = node.nodeValue;
  const segments = splitWordSegments(text);
  if (!segments.some(seg => seg.isWord)) return;
  const frag = document.createDocumentFragment();
  segments.forEach(seg => {
    if (!seg.text) return;
    if (!seg.isWord) {
      frag.appendChild(document.createTextNode(seg.text));
      return;
    }
    const cleaned = normalizeLookupWord(seg.text);
    if (!cleaned) {
      frag.appendChild(document.createTextNode(seg.text));
      return;
    }
    const span = document.createElement('span');
    span.className = 'flashcard-word';
    span.textContent = seg.text;
    span.dataset.word = cleaned;
    frag.appendChild(span);
  });
  node.replaceWith(frag);
}

function initWordLookupUI() {
  if (wordLookupReady || typeof document === 'undefined') return;
  wordLookupReady = true;
  ensureWordPopup();
  document.addEventListener('pointerover', handleWordPointerOver);
  document.addEventListener('pointerout', handleWordPointerOut);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') hideWordPopup();
  });
  document.addEventListener('scroll', () => hideWordPopup(), { capture: true, passive: true });
  window.addEventListener('resize', () => {
    if (popupEl?.classList.contains('visible') && activeWordEl) {
      positionWordPopup(activeWordEl);
    }
  });
}

export function wrapWordsInElement(rootEl) {
  if (!rootEl) return;
  initWordLookupUI();
  wrapWordNodes(rootEl);
}
if (typeof window !== 'undefined') {
  window.__wrapWordsInElement = wrapWordsInElement;
}

function ensureWordPopup() {
  if (popupEl || typeof document === 'undefined') return;
  const el = document.createElement('div');
  el.className = 'word-popup';
  el.setAttribute('role', 'tooltip');
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = [
    '<div class="word-popup-head">',
    '  <div class="word-popup-word" data-word-title></div>',
    '  <div class="word-popup-ipa" data-word-ipa></div>',
    '  <div class="word-popup-pos" data-word-pos></div>',
    '</div>',
    '<div class="tts-loading word-popup-loading" data-word-loading aria-hidden="true">',
    '  <span class="tts-loading-text">Loading</span>',
    '</div>',
    '<div class="word-popup-definition" data-word-definition></div>',
    '<div class="word-popup-status" data-word-status></div>'
  ].join('');
  document.body.appendChild(el);
  popupEl = el;
  popupWordEl = el.querySelector('[data-word-title]');
  popupIpaEl = el.querySelector('[data-word-ipa]');
  popupPosEl = el.querySelector('[data-word-pos]');
  popupLoadingEl = el.querySelector('[data-word-loading]');
  popupStatusEl = el.querySelector('[data-word-status]');
  popupDefEl = el.querySelector('[data-word-definition]');
  el.addEventListener('pointerenter', () => {
    popupHovering = true;
    clearTimeout(wordHideTimer);
  });
  el.addEventListener('pointerleave', () => {
    popupHovering = false;
    scheduleWordHide();
  });
}

function setActiveWord(wordEl) {
  if (activeWordEl && activeWordEl !== wordEl) {
    activeWordEl.classList.remove('is-active');
  }
  activeWordEl = wordEl;
  if (activeWordEl) activeWordEl.classList.add('is-active');
}

function clearActiveWord() {
  if (activeWordEl) activeWordEl.classList.remove('is-active');
  activeWordEl = null;
}

function handleWordPointerOver(event) {
  const wordEl = event.target?.closest?.('.flashcard-word');
  if (!wordEl) return;
  if (event.pointerType === 'touch') return;
  if (document.body?.classList.contains('editor-active')) return;
  const cardEl = wordEl.closest('.flashcard');
  if (cardEl?.classList.contains('dragging')) return;
  if (activeWordEl && activeWordEl !== wordEl) hideWordPopup({ immediate: true });
  wordHovering = true;
  setActiveWord(wordEl);
  clearTimeout(wordHideTimer);
  scheduleWordShow(wordEl);
}

function handleWordPointerOut(event) {
  const wordEl = event.target?.closest?.('.flashcard-word');
  if (!wordEl) return;
  if (wordEl.contains(event.relatedTarget)) return;
  wordHovering = false;
  clearTimeout(wordHoverTimer);
  if (!popupEl?.classList.contains('visible') && activeWordEl === wordEl) {
    clearActiveWord();
  }
  scheduleWordHide();
}

function scheduleWordShow(wordEl) {
  clearTimeout(wordHoverTimer);
  wordHoverTimer = setTimeout(() => {
    if (!wordHovering || wordEl !== activeWordEl) return;
    showWordPopup(wordEl);
  }, WORD_LOOKUP_DELAY_MS);
}

function scheduleWordHide() {
  clearTimeout(wordHideTimer);
  wordHideTimer = setTimeout(() => {
    if (wordHovering || popupHovering) return;
    hideWordPopup();
  }, WORD_LOOKUP_HIDE_MS);
}

function hideWordPopup({ immediate = false } = {}) {
  clearTimeout(wordHoverTimer);
  clearTimeout(wordHideTimer);
  wordHovering = false;
  popupHovering = false;
  clearActiveWord();
  lookupRequestId += 1;
  if (!popupEl) return;
  popupEl.classList.remove('visible');
  popupEl.setAttribute('aria-hidden', 'true');
  if (immediate) {
    popupEl.style.left = '-9999px';
    popupEl.style.top = '-9999px';
  }
}

async function showWordPopup(wordEl) {
  const raw = wordEl?.dataset?.word || '';
  if (!raw) return;
  ensureWordPopup();
  if (!popupEl) return;
  const displayWord = String(wordEl.textContent || raw).trim();
  setActiveWord(wordEl);
  popupWordEl.textContent = displayWord || raw;
  popupIpaEl.textContent = '';
  popupPosEl.textContent = '';
  if (popupLoadingEl) {
    popupLoadingEl.classList.add('active');
    popupLoadingEl.setAttribute('aria-hidden', 'false');
  }
  popupStatusEl.textContent = '';
  popupDefEl.textContent = '';
  popupEl.classList.remove('visible');
  popupEl.setAttribute('aria-hidden', 'true');
  positionWordPopup(wordEl, { anchor: 'left' });
  requestAnimationFrame(() => {
    if (activeWordEl !== wordEl) return;
    popupEl.classList.add('visible');
    popupEl.setAttribute('aria-hidden', 'false');
  });
  const requestId = ++lookupRequestId;
  const ctx = getDefinitionContext(wordEl, raw);
  const result = await lookupDefinition(ctx);
  if (requestId !== lookupRequestId || activeWordEl !== wordEl) return;
  if (result?.definition) {
    popupIpaEl.textContent = result.ipa ? String(result.ipa) : '';
    popupPosEl.textContent = result.partOfSpeech ? String(result.partOfSpeech) : '';
    if (popupLoadingEl) {
      popupLoadingEl.classList.remove('active');
      popupLoadingEl.setAttribute('aria-hidden', 'true');
    }
    popupStatusEl.textContent = '';
    popupDefEl.textContent = result.definition;
  } else {
    popupIpaEl.textContent = '';
    popupPosEl.textContent = '';
    if (popupLoadingEl) {
      popupLoadingEl.classList.remove('active');
      popupLoadingEl.setAttribute('aria-hidden', 'true');
    }
    popupStatusEl.textContent = 'No definition found.';
    popupDefEl.textContent = '';
  }

  requestAnimationFrame(() => {
    if (!popupEl?.classList.contains('visible') || activeWordEl !== wordEl) return;
    positionWordPopup(wordEl);
  });
}

function positionWordPopup(wordEl, { anchor = 'left' } = {}) {
  if (!popupEl || !wordEl) return;
  const wasVisible = popupEl.classList.contains('visible');
  if (!wasVisible) popupEl.style.visibility = 'hidden';
  const rect = wordEl.getBoundingClientRect();
  const cardEl = document.querySelector('.flashcard');
  const anchorRect = cardEl?.getBoundingClientRect?.() || rect;
  const popupRect = popupEl.getBoundingClientRect();
  const popupW = popupEl.offsetWidth || popupRect.width;
  const popupH = popupEl.offsetHeight || popupRect.height;
  const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
  const gap = 16;
  const safe = 8;
  let left = anchorRect.left - popupW - gap;
  let top = anchorRect.top;

  if (anchor === 'left' && left < safe) {
    left = anchorRect.right + gap;
  }

  if (left + popupW > viewportW - safe) {
    left = anchorRect.left + (anchorRect.width - popupW) / 2;
    top = anchorRect.bottom + gap;
  }

  left = Math.max(safe, Math.min(left, viewportW - popupW - safe));
  top = Math.max(safe, Math.min(top, viewportH - popupH - safe));

  popupEl.style.left = `${Math.round(left)}px`;
  popupEl.style.top = `${Math.round(top)}px`;
  // Keep the entry animation stable to avoid sideways drift.
  popupEl.style.setProperty('--word-popup-dx', '0px');
  popupEl.style.setProperty('--word-popup-dy', '0px');
  if (!wasVisible) popupEl.style.visibility = 'visible';
}

async function lookupDefinition(ctx) {
    const key = [
      'def',
      String(ctx?.cardId || ''),
      String(ctx?.face || ''),
      String(ctx?.faceLang || '').toLowerCase(),
      String(ctx?.word || '').trim().toLowerCase(),
      String(ctx?.front || '').trim().toLowerCase(),
      String(ctx?.back || '').trim().toLowerCase()
    ].join('|');
  if (!key) return null;
  if (wordLookupCache.has(key)) return wordLookupCache.get(key);
  if (wordLookupPending.has(key)) return wordLookupPending.get(key);
    const pending = (async () => {
      const wiki = await fetchWiktionaryDefinition(ctx);
      if (wiki?.definition) {
        const cleaned = cleanDefinitionOutput(wiki.definition);
        if (cleaned) {
          const result = {
            definition: cleaned,
            partOfSpeech: wiki.partOfSpeech || '',
            ipa: cleanIpaOutput(wiki.ipa)
          };
          wordLookupCache.set(key, result);
          wordLookupPending.delete(key);
          return result;
        }
      }
      wordLookupCache.set(key, null);
      wordLookupPending.delete(key);
      return null;
    })();
  wordLookupPending.set(key, pending);
  return pending;
}

function buildWiktionaryLookupCandidates(rawWord, faceLang) {
  const base = normalizeLookupWord(rawWord);
  if (!base) return [];
  const seen = new Set();
  const candidates = [];
  const langCode = normalizeLangCode(faceLang);
  const add = (value) => {
    if (!value) return;
    if (seen.has(value)) return;
    seen.add(value);
    candidates.push(value);
  };
  const addVariants = (value) => {
    const cleaned = normalizeLookupWord(value);
    if (!cleaned) return;
    const lower = cleaned.toLowerCase();
    add(lower);
    if (lower !== cleaned) add(cleaned);
  };
  const addSingularVariants = (value) => {
    const singulars = singularizeWord(value, langCode);
    singulars.forEach(entry => addVariants(entry));
  };
  const addMacronFallbacks = (value) => {
    const cleaned = normalizeLookupWord(value);
    if (!cleaned) return;
    const needsFallback = langCode === 'la' || hasMacron(cleaned);
    if (!needsFallback) return;
    const stripped = stripMacrons(cleaned);
    if (stripped && stripped !== cleaned) {
      addVariants(stripped);
      addSingularVariants(stripped);
    }
  };

  addVariants(base);
  addSingularVariants(base);
  addMacronFallbacks(base);
  if (base.includes('/') || base.includes('|')) {
    base.split(/[\/|]/)
      .map(part => part.trim())
      .filter(Boolean)
      .forEach(part => {
        addVariants(part);
        addSingularVariants(part);
        addMacronFallbacks(part);
      });
  }
  return candidates;
}

async function fetchWiktionaryDefinition(ctx) {
  const candidates = buildWiktionaryLookupCandidates(ctx?.word, ctx?.faceLang);
  let inflectionFallback = null;
  const faceLang = ctx?.faceLang || '';
  for (const candidate of candidates) {
    const result = await fetchWiktionaryDefinitionForWord(candidate, faceLang);
    if (!result?.definition) continue;
    if (isInflectionDefinition(result.definition)) {
      if (!inflectionFallback) inflectionFallback = result;
      continue;
    }
    return result;
  }
  return inflectionFallback;
}

async function fetchWiktionaryDefinitionForWord(word, faceLang) {
  const cleaned = String(word || '').trim();
  if (!cleaned) return null;
  const html = await fetchWiktionaryHtml(cleaned);
  if (!html) return null;
  const root = getWiktionaryRoot(html);
  if (!root) return null;
  const languageName = resolveWiktionaryLanguageName(faceLang);
  if (languageName) {
    const heading = findWiktionaryLanguageHeading(root, languageName);
    if (heading) {
      const definition = findDefinitionInSection(heading);
      if (definition?.definition) return definition;
    }
  }
  return parseWiktionaryTopDefinition(root);
}

function waitMs(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function notifyLookupUnavailable() {
  const now = Date.now();
  if (now - lastLookupAlertAt < LOOKUP_ALERT_COOLDOWN_MS) return;
  lastLookupAlertAt = now;
  try {
    showAlert(
      'warning',
      'Lookup Unavailable',
      'External dictionary services are temporarily unreachable. Study flow will continue.'
    );
  } catch {}
}

async function fetchJsonWithRetry(url, { timeoutMs = LOOKUP_TIMEOUT_MS, retries = LOOKUP_RETRIES } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        const backoff = LOOKUP_BACKOFF_MS * (2 ** attempt);
        await waitMs(backoff);
      }
    } finally {
      clearTimeout(timer);
    }
  }
  if (lastError) notifyLookupUnavailable();
  return null;
}

async function fetchWiktionaryHtml(word) {
  const encoded = encodeURIComponent(word);
  const url = `https://en.wiktionary.org/w/api.php?action=parse&page=${encoded}&prop=text&format=json&origin=*`;
  const data = await fetchJsonWithRetry(url);
  return data?.parse?.text?.['*'] || '';
}

async function fetchSynonymsFromApis(word, deckSeed = '') {
  const seed = String(deckSeed || '').trim();
  if (seed) {
    const seedSyns = await fetchSynonymsForEnglish(seed);
    if (seedSyns) return seedSyns;
  }

  const direct = await fetchSynonymsForEnglish(word);
  if (direct) return direct;

  const hint = getCardTranslationHint(word);
  const translated = hint || await translateToEnglish(word);
  if (!translated) return null;
  const phrase = primaryTranslationChunk(translated);
  if (phrase) {
    const byPhrase = await fetchSynonymsForEnglish(phrase);
    if (byPhrase) return byPhrase;
  }
  const head = headwordFromPhrase(translated);
  if (head && head !== phrase) {
    const byHead = await fetchSynonymsForEnglish(head);
    if (byHead) return byHead;
  }
  return null;
}

async function fetchSynonymsForEnglish(word) {
  if (!word) return null;
  const wiki = await fetchWiktionarySynonyms(word, 'English');
  if (wiki?.synonyms?.length) return wiki;
  const thesaurus = await fetchWiktionaryThesaurusSynonyms(word, 'English');
  if (thesaurus?.synonyms?.length) return thesaurus;
  if (/\s/.test(word)) {
    const head = headwordFromPhrase(word);
    if (head && head !== word) {
      const headWiki = await fetchWiktionarySynonyms(head, 'English');
      if (headWiki?.synonyms?.length) return headWiki;
      const headThesaurus = await fetchWiktionaryThesaurusSynonyms(head, 'English');
      if (headThesaurus?.synonyms?.length) return headThesaurus;
    }
  }
  return null;
}

async function fetchWiktionarySynonyms(word, languageName = 'English') {
  if (!word) return null;
  const encoded = encodeURIComponent(word);
  const url = `https://en.wiktionary.org/w/api.php?action=parse&page=${encoded}&prop=text&format=json&origin=*`;
  const data = await fetchJsonWithRetry(url);
  const html = data?.parse?.text?.['*'] || '';
  if (!html) return null;
  return parseWiktionarySynonyms(html, languageName);
}

async function fetchWiktionaryThesaurusSynonyms(word, languageName = 'English') {
  if (!word) return null;
  const encoded = encodeURIComponent(word);
  const url = `https://en.wiktionary.org/w/api.php?action=parse&page=Thesaurus:${encoded}&prop=text&format=json&origin=*`;
  const data = await fetchJsonWithRetry(url);
  const html = data?.parse?.text?.['*'] || '';
  if (!html) return null;
  return parseWiktionarySynonyms(html, languageName) || parseWiktionarySynonyms(html, '');
}

async function translateToEnglish(word) {
  if (!word) return '';
  const trimmed = String(word).trim();
  if (!trimmed) return '';
  const auto = await translateViaGoogle(trimmed, 'auto');
  const cleanedAuto = primaryTranslationChunk(auto);
  if (cleanedAuto && cleanedAuto.toLowerCase() !== trimmed.toLowerCase()) return cleanedAuto;

  const candidates = new Set();
  const scriptLang = detectLanguageFromScript(trimmed);
  if (scriptLang) candidates.add(scriptLang);
  const deckLang = getDeckLanguageHint();
  if (deckLang) candidates.add(deckLang);
  ['tr', 'es', 'fr', 'de', 'it', 'pt'].forEach(lang => candidates.add(lang));

  for (const lang of candidates) {
    if (lang === 'auto') continue;
    const attempt = await translateViaGoogle(trimmed, lang);
    const cleaned = primaryTranslationChunk(attempt);
    if (!cleaned) continue;
    if (cleaned.toLowerCase() === trimmed.toLowerCase()) continue;
    return cleaned;
  }
  return '';
}

async function translateViaGoogle(text, sourceLang = 'auto') {
  if (!text) return '';
  const encoded = encodeURIComponent(text);
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sourceLang)}&tl=en&dt=t&q=${encoded}`;
  const data = await fetchJsonWithRetry(url);
  const translated = Array.isArray(data?.[0])
    ? data[0].map(part => String(part?.[0] || '')).join('')
    : '';
  const cleaned = String(translated || '').trim();
  if (!cleaned) return '';
  if (cleaned.toLowerCase().includes('invalid source language')) return '';
  return cleaned;
}

function findWiktionaryLanguageHeading(root, languageName) {
  if (!root || !languageName) return null;
  const target = String(languageName || '').trim();
  if (!target) return null;
  const targetLower = target.toLowerCase();
  const h2s = Array.from(root.querySelectorAll('h2'));
  return h2s.find(h2 => {
    const normalized = normalizeWiktionaryHeading(h2);
    if (normalized === target || normalized.toLowerCase() === targetLower) return true;
    const headline = h2.querySelector('.mw-headline');
    if (!headline) return false;
    const headlineText = normalizeWiktionaryHeading(headline);
    if (headlineText === target || headlineText.toLowerCase() === targetLower) return true;
    const headlineId = String(headline.id || '').toLowerCase();
    return headlineId === targetLower;
  }) || null;
}

function getWiktionaryRoot(html) {
  if (!html) return null;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.querySelector('.mw-parser-output') || doc.body;
}

function getWiktionaryLanguageNameFromHeading(h2) {
  if (!h2) return '';
  const headline = h2.querySelector('.mw-headline');
  return normalizeWiktionaryHeading(headline || h2);
}

function parseWiktionaryTopDefinition(root) {
  if (!root) return null;
  const h2s = Array.from(root.querySelectorAll('h2'));
  if (h2s.length) {
    for (const h2 of h2s) {
      const name = getWiktionaryLanguageNameFromHeading(h2);
      if (!name) continue;
      if (name.toLowerCase() === 'translingual') continue;
      const def = findDefinitionInSection(h2);
      if (def) return def;
    }
    for (const h2 of h2s) {
      const def = findDefinitionInSection(h2);
      if (def) return def;
    }
  }
  const def = findDefinitionInNodes(root.firstElementChild, false);
  if (!def) return null;
  if (!def.ipa) {
    const ipa = findFirstIpaInNodes(root.firstElementChild, false);
    if (ipa) def.ipa = ipa;
  }
  return def;
}

function parseWiktionarySynonyms(html, languageName = 'English') {
  if (!html) return null;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.querySelector('.mw-parser-output') || doc.body;
  if (!root) return null;

  let startNode = null;
  if (languageName) {
    const match = findWiktionaryLanguageHeading(root, languageName);
    if (match) startNode = match.closest('.mw-heading') || match;
    if (!startNode) return null;
  }
  let node = startNode ? startNode.nextElementSibling : root.firstElementChild;
  const stopAtH2 = !!startNode;
  let currentPos = '';
  while (node) {
    const headingEl = getHeadingElement(node);
    if (stopAtH2 && headingEl && headingEl.tagName === 'H2') break;
    if (headingEl) {
      const headingText = normalizeWiktionaryHeading(headingEl);
      const level = Number(headingEl.tagName[1] || 0);
      if (level === 3 && headingText && !/^synonyms$/i.test(headingText)) {
        currentPos = headingText;
      }
      if (headingText && /^synonyms$/i.test(headingText)) {
        const synonyms = collectWiktionarySynonyms(headingEl);
        if (synonyms.length) {
          return {
            synonyms,
            partOfSpeech: currentPos ? currentPos.toLowerCase() : ''
          };
        }
      }
    }
    node = node.nextElementSibling;
  }
  return null;
}

function getHeadingElement(node) {
  if (!node) return null;
  if (/^H[2-6]$/.test(node.tagName)) return node;
  return node.querySelector(':scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6');
}

function normalizeWiktionaryHeading(node) {
  if (!node) return '';
  const raw = (node.textContent || '').replace(/\[edit\]/i, '').trim();
  return raw.replace(/\s+/g, ' ').trim();
}

function extractIpaFromNode(node) {
  if (!node) return '';
  const ipaEl = node.matches?.('.IPA') ? node : node.querySelector?.('.IPA');
  if (!ipaEl) return '';
  const text = (ipaEl.textContent || '').replace(/\s+/g, ' ').trim();
  return cleanIpaOutput(text);
}

function findFirstIpaInNodes(startNode, stopAtH2) {
  let node = startNode;
  while (node) {
    const headingEl = getHeadingElement(node);
    if (stopAtH2 && headingEl && headingEl.tagName === 'H2') break;
    const ipa = extractIpaFromNode(node);
    if (ipa) return ipa;
    node = node.nextElementSibling;
  }
  return '';
}

function findDefinitionInSection(startHeading) {
  const start = startHeading?.closest?.('.mw-heading') || startHeading;
  if (!start) return null;
  const ipa = findFirstIpaInNodes(start.nextElementSibling, true);
  const definition = findDefinitionInNodes(start.nextElementSibling, true);
  if (!definition) return null;
  if (ipa) definition.ipa = ipa;
  return definition;
}

function findDefinitionInNodes(startNode, stopAtH2) {
  let node = startNode;
  let currentPos = '';
  while (node) {
    const headingEl = getHeadingElement(node);
    if (stopAtH2 && headingEl && headingEl.tagName === 'H2') break;
    if (headingEl) {
      const headingText = normalizeWiktionaryHeading(headingEl);
      const level = Number(headingEl.tagName[1] || 0);
      if (level === 2) {
        currentPos = '';
      }
      if (level >= 3) {
        const pos = normalizePartOfSpeech(headingText);
        if (pos) {
          currentPos = pos;
        } else if (level === 3) {
          currentPos = '';
        }
      }
    }
    if (currentPos) {
      const ol = node.tagName === 'OL' ? node : node.querySelector(':scope > ol');
      if (ol) {
        const defs = extractDefinitionList(ol);
        if (defs.length) {
          return { definition: defs[0], partOfSpeech: currentPos };
        }
      }
    }
    node = node.nextElementSibling;
  }
  return null;
}

function collectWiktionarySynonyms(headingEl) {
  const synonyms = [];
  if (!headingEl) return synonyms;
  const start = headingEl.closest('.mw-heading') || headingEl;
  const stopLevel = Number(headingEl.tagName[1] || 6);
  let node = start.nextElementSibling;
  while (node) {
    const heading = getHeadingElement(node);
    if (heading) {
      const level = Number(heading.tagName[1] || 0);
      if (level && level <= stopLevel) break;
    }
    const items = node.querySelectorAll('li');
    items.forEach(li => {
      li.querySelectorAll('a').forEach(a => {
        const text = String(a.textContent || '').trim();
        if (!text) return;
        if (text.includes(':')) return;
        if (text.length > 40) return;
        synonyms.push(text);
      });
    });
    node = node.nextElementSibling;
  }
  return normalizeSynonyms(synonyms);
}

function normalizePartOfSpeech(text = '') {
  const lower = String(text || '').toLowerCase().trim();
  if (!lower) return '';
  if (/\bproper noun\b/.test(lower)) return 'proper noun';
  if (/\bauxiliary verb\b/.test(lower)) return 'auxiliary verb';
  if (/\bpronoun\b/.test(lower)) return 'pronoun';
  if (/\badverb\b/.test(lower)) return 'adverb';
  if (/\bverb\b/.test(lower)) return 'verb';
  if (/\badjective\b/.test(lower)) return 'adjective';
  if (/\bnoun\b/.test(lower)) return 'noun';
  if (/\bpreposition\b/.test(lower)) return 'preposition';
  if (/\bpostposition\b/.test(lower)) return 'postposition';
  if (/\bconjunction\b/.test(lower)) return 'conjunction';
  if (/\binterjection\b/.test(lower)) return 'interjection';
  if (/\bdeterminer\b/.test(lower)) return 'determiner';
  if (/\bnumeral\b/.test(lower)) return 'numeral';
  if (/\bparticle\b/.test(lower)) return 'particle';
  if (/\barticle\b/.test(lower)) return 'article';
  if (/\bphrase\b/.test(lower)) return 'phrase';
  if (/\bproverb\b/.test(lower)) return 'proverb';
  if (/\bidiom\b/.test(lower)) return 'idiom';
  if (/\bprefix\b/.test(lower)) return 'prefix';
  if (/\bsuffix\b/.test(lower)) return 'suffix';
  if (/\binitialism\b/.test(lower)) return 'initialism';
  if (/\babbreviation\b/.test(lower)) return 'abbreviation';
  if (/\bsymbol\b/.test(lower)) return 'symbol';
  return '';
}

function extractDefinitionList(ol) {
  const defs = [];
  if (!ol) return defs;
  const items = ol.querySelectorAll(':scope > li');
  items.forEach(li => {
    const text = extractDefinitionText(li);
    if (text) defs.push(text);
  });
  return defs;
}

function extractDefinitionText(li) {
  if (!li) return '';
  const clone = li.cloneNode(true);
  clone.querySelectorAll(
    'ul, ol, dl, table, div.quotations, span.reference, span.ref, style, script, span.defdate'
  ).forEach(el => el.remove());
  let text = clone.textContent || '';
  text = text.replace(/\[[^\]]+\]/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  return cleanDefinitionOutput(text);
}

function toSilentList(card) {
  const raw = card?.silent;
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map(item => (item == null ? '' : String(item)))
      .filter(str => str !== '');
  }
  if (typeof raw === 'string' && raw !== '') {
    return [raw];
  }
  return [];
}

const CLOZE_TTS_RE = /{{\s*c[^:}]*::([\s\S]*?)(?:::(?:[\s\S]*?))?\s*}}/gi;
const TTS_SILENT_MARKER_RE = /<<![\s\S]*?!>>/g;
const TTS_SILENT_MARKER_HTML_RE = /&lt;&lt;![\s\S]*?!&gt;&gt;/gi;

function isLatinCard(card) {
  if (!card) return false;
  if (typeof card.type === 'string' && card.type.toLowerCase().startsWith('latin')) return true;
  if (Array.isArray(card.tags) && card.tags.some(tag => String(tag).toLowerCase() === 'latin')) return true;
  return false;
}

const LATIN_MORPH_TOKENS = new Set([
  'ae', 'a', 'am', 'arum', 'is', 'as', 'um', 'i', 'orum', 'us', 'er', 'tra', 'trum', 'o', 'e',
  'ei', 'ibus', 'es', 'en', 'on', 'al', 'ar', 'ix', 'ex', 'm', 'f', 'n', 'sg', 'pl'
]);
function normalizeDiacritics(str = '') {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
function isLatinMorphToken(word = '') {
  const normalized = normalizeDiacritics(word)
    .replace(/\./g, '')
    .toLowerCase()
    .trim();
  return LATIN_MORPH_TOKENS.has(normalized);
}

function stripLatexStyling(text) {
  return stripLatexSyntax(text);
}

function stripDictionarySuffix(line) {
  if (!line) return '';
  const idx = line.indexOf(',');
  return idx === -1 ? line : line.slice(0, idx);
}

function replaceClozeForTts(text, { keepValue = true } = {}) {
  const raw = String(text ?? '');
  if (!raw) return '';
  return raw.replace(CLOZE_TTS_RE, (_match, value) => {
    if (!keepValue) return ' ';
    const val = value == null ? '' : String(value);
    return (val.split('|')[0] ?? '').trim();
  });
}

function stripSilentText(text, card, opts = {}) {
  const { keepClozeValue = true, trimLatinLemma = true } = opts ?? {};
  let result = text == null ? '' : String(text);
  if (!result) return '';
  result = result.replace(/<span[^>]*data-tts="off"[^>]*>.*?<\/span>/gis, ' ');
  result = result.replace(TTS_SILENT_MARKER_RE, ' ');
  result = result.replace(TTS_SILENT_MARKER_HTML_RE, ' ');
  result = result.replace(/<br\s*\/?>/gi, '\n');
  result = stripLatexStyling(result);
  result = result
    .split(/\n+/)
    .map(line => {
      const isLatin = trimLatinLemma && isLatinCard(card);
      const stripped = isLatin ? stripDictionarySuffix(line) : line;
      if (!isLatin) return stripped;
      // For Latin cards, keep only the first non-morph token from each comma/semicolon chunk.
      const chunks = stripped.replace(/;/g, ',').split(',').map(c => c.trim()).filter(Boolean);
      const cleanedWords = [];
      chunks.forEach(chunk => {
        const words = chunk.split(/\s+/).filter(Boolean);
        const firstKeep = words.find(w => !isLatinMorphToken(normalizeDiacritics(w)));
        if (firstKeep) cleanedWords.push(firstKeep);
      });
      return cleanedWords.length ? cleanedWords.join(' ') : stripped;
    })
    .join('\n');
  const silentParts = toSilentList(card);
  if (silentParts.length) {
    for (const part of silentParts) {
      if (!part) continue;
      result = result.split(part).join('');
    }
  }
  result = replaceClozeForTts(result, { keepValue: keepClozeValue });
  result = result.replace(/\[\s*\.\.\.\s*\]/g, ' ');
  result = result
    .split(/\n+/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  return result;
}

function rawTextForTts(text) {
  if (text == null) return '';
  return String(text);
}

function sanitizeAnswerTtsText(text, card) {
  return stripSilentText(text, card, { keepClozeValue: true, trimLatinLemma: false });
}

window.__stripSilentText = (card, text, opts) => stripSilentText(text, card, opts);

/* Build correct-answer TTS text for any card */
function answerTextFromCard(card) {
  if (!card) return '';
  // 0) New schema: correct[]
  if (Array.isArray(card.correct) && card.correct.length) {
    const ok = card.correct.map(s => String(s ?? '').trim()).filter(Boolean);
    if (ok.length) return sanitizeAnswerTtsText(ok.join(', '), card);
  }
  // 1) MCQ objects: [{ text, correct: true }, ...]
  if (Array.isArray(card.answers) && card.answers.length && typeof card.answers[0] === 'object') {
    const ok = card.answers
      .filter(a => a && a.correct)
      .map(a => String(a.text ?? '').trim())
      .filter(Boolean);
    if (ok.length) return sanitizeAnswerTtsText(ok.join(', '), card);
  }
  // 2) MCQ strings + correct_indices
  if (Array.isArray(card.answers) && Array.isArray(card.correct_indices)) {
    const idx = new Set(card.correct_indices);
    const ok = card.answers
      .map((t, i) => (idx.has(i) ? String(t ?? '').trim() : ''))
      .filter(Boolean);
    if (ok.length) return sanitizeAnswerTtsText(ok.join(', '), card);
  }
  // 3) Fill-in / accept list
  if (Array.isArray(card.accept) && card.accept.length) {
    const a = card.accept.map(s => String(s ?? '').trim()).filter(Boolean);
    if (a.length) return sanitizeAnswerTtsText(a.join(', '), card);
  }
  // 4) Fallbacks (back_text/back/answer/front_text)
  const sources = [card.back_text, card.back, card.answer, card.front_text];
  for (const src of sources) {
    const raw = rawTextForTts(src);
    if (!raw || !raw.trim()) continue;
    const cleaned = sanitizeAnswerTtsText(raw, card);
    if (cleaned) return cleaned;
  }
  return '';
}

/**
 * Setup flashcard controls and navigation.
 * (kept for compatibility – main.js calls renderCard directly)
 */
export function setupFlashcard(deckInput, render) {
  deck = deckInput;
  if (!deck.length) return;

  const cardEl = document.querySelector('.flashcard');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');

  // Flip on click
  cardEl?.addEventListener('click', (e) => {
    if (document.body?.classList.contains('editor-active') && e.target.closest('.flashcard-edit-input, textarea, input, [contenteditable="true"]')) return;
    cardEl.classList.toggle('flipped');
  });
  prevBtn?.addEventListener('click', () => step(-1));
  nextBtn?.addEventListener('click', () => step(1));
  document.addEventListener('keydown', e => {
    if (document.body?.classList.contains('editor-active')) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], .flashcard-edit-input')) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      step(-1);
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      step(1);
    }
    const isSpace = e.key === ' ' || e.key === 'Spacebar' || e.code === 'Space';
    if (!isSpace) return;
    if (e.repeat) return;
    if (e.target instanceof Element && e.target.closest('button, a, summary, [role="button"], [role="menuitem"], [role="menuitemradio"]')) return;
    e.preventDefault();
    cardEl.classList.toggle('flipped');
  });

  document.querySelectorAll('.top-right-btn').forEach(btn => {
    btn.addEventListener('click', e => e.stopPropagation());
  });

  render(deck[idx]);
  adjustLayout();
}

function step(dir) {
  if (!deck.length) return;
  idx = (idx + dir + deck.length) % deck.length;
  renderCard(deck[idx]);
  adjustLayout();
}

/**
 * Render one card (text or image-occlusion)
 * - Legacy: text-only and single `maskRegion` still supported.
 * - New: `mask = { regions: [...], activeIndex }` for multi-label diagrams.
 */
export function renderCard(c, opts = {}) {
  currentCard = c;
  const cardEl = opts.target || document.querySelector('.flashcard');
  if (!cardEl) return;
  let frontEl = opts.frontEl || cardEl.querySelector('.flashcard__front');
  let backEl  = opts.backEl  || cardEl.querySelector('.flashcard__back');
  const skipSizing = !!opts.skipSizing;
  hideWordPopup({ immediate: true });

  // If rendering into an alternate container, ensure faces exist
  if (opts.target && (!frontEl || !backEl)) {
    cardEl.innerHTML = '';
    frontEl = document.createElement('div');
    frontEl.className = 'flashcard__face flashcard__front';
    backEl = document.createElement('div');
    backEl.className = 'flashcard__face flashcard__back';
    cardEl.appendChild(frontEl);
    cardEl.appendChild(backEl);
  }

  // Apply per-card typography via CSS variables (scoped to this card)
  try {
    const t = c.font || c.typography || {};
    const map = {
      // Hard-disable custom font family; always remove it so system default applies
      // '--card-font-family': t.family,
      '--card-font-weight': t.weight,
      '--card-font-size': t.size,
      '--card-letter-spacing': t.letterSpacing,
      '--card-line-height': t.lineHeight,
      '--card-text-transform': t.textTransform
    };
    Object.entries(map).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') cardEl.style.removeProperty(k);
      else cardEl.style.setProperty(k, String(v));
    });
    // Ensure family var is removed even if previously set
    cardEl.style.removeProperty('--card-font-family');
    const facesRm = document.querySelectorAll('.flashcard__face');
    facesRm.forEach(face => face.style.removeProperty('--card-font-family'));
  } catch {}

  const hasImage = !!(c.image || c.imageFront || c.imageBack);
  const hasMask  = !!(c.mask && Array.isArray(c.mask.regions));
  const hasLegacyMask = !!c.maskRegion;
  const isDiagramCard = hasMask || hasLegacyMask || c.type === 'diagram';

  // Always compute hidden TTS strings for speech (respect per-card toggles)
  const ttsCfg = (c && typeof c.tts === 'object') ? c.tts : null;
  const allowFrontTTS = (ttsCfg && ttsCfg.readFront !== undefined)
    ? !!ttsCfg.readFront
    : false;
  const allowBackTTS = (ttsCfg && ttsCfg.readBack !== undefined)
    ? !!ttsCfg.readBack
    : true;

  if (allowFrontTTS) {
    let frontTts = '';
    if (typeof ttsCfg?.frontText === 'string') {
      frontTts = ttsCfg.frontText;
    } else if (typeof ttsCfg?.ttsFront === 'string') {
      frontTts = ttsCfg.ttsFront;
    } else {
      frontTts = stripSilentText(c.front, c, { keepClozeValue: false, trimLatinLemma: true });
    }
    frontTts = stripSilentText(frontTts, c, { keepClozeValue: false, trimLatinLemma: true });
    if (frontTts && mcqAnswersInButtons(c)) {
      frontTts = stripInlineMcqOptions(stripMcqOptionLines(frontTts));
    }
    if (frontTts) frontEl.dataset.tts = frontTts;
    else delete frontEl.dataset.tts;
  } else {
    delete frontEl.dataset.tts;
  }

  if (allowBackTTS) {
    let backTts = '';
    if (typeof ttsCfg?.backText === 'string') {
      backTts = ttsCfg.backText;
    } else if (typeof ttsCfg?.ttsBack === 'string') {
      backTts = ttsCfg.ttsBack;
    } else {
      const rawBack = c.back_text ?? c.back ?? '';
      backTts = stripSilentText(rawBack, c, { keepClozeValue: true, trimLatinLemma: false }) || answerTextFromCard(c) || '';
    }
    if (isMcqArchetype(c)) {
      const mcqBack = getMcqBackText(c);
      if (mcqBack) backTts = mcqBack;
    }
    backTts = stripSilentText(backTts, c, { keepClozeValue: true, trimLatinLemma: false });
    if (backTts) backEl.dataset.tts = backTts;
    else delete backEl.dataset.tts;
  } else {
    delete backEl.dataset.tts;
  }

  applyFaceLanguageData(frontEl, backEl, c);

  // Disconnect previous sizing observers (if any) for this card element
  if (!skipSizing) clearSizingState(cardEl);

  cardEl.classList.toggle('image-card', hasImage || hasLegacyMask);

  // Text-only card
  if (!hasImage && !hasLegacyMask) {
    cardEl.style.width  = '';
    cardEl.style.height = '';
    cardEl.style.aspectRatio = '';
    frontEl.innerHTML = `<div class="flashcard-text">${frontHTML(c.front, c)}</div>`;
    backEl.innerHTML  = `<div class="flashcard-text">${backHTML(c)}</div>`;
    renderMathIn(frontEl);
    renderMathIn(backEl);
    initWordLookupUI();
    wrapWordNodes(frontEl.querySelector('.flashcard-text'));
    wrapWordNodes(backEl.querySelector('.flashcard-text'));
    // (dataset.tts already set above)
    return;
  }

  // Image/occlusion card
  const imgFrontSrc = c.imageFront || c.image;
  const imgBackSrc  = c.imageBack  || c.image;

  frontEl.innerHTML = '';
  backEl.innerHTML  = '';

  // Reserve space to avoid layout jump before images load
  if (cardEl) {
    const fallbackRatio = 1.2; // portrait-ish placeholder
    const cardW = cardEl.clientWidth || Math.min(window.innerWidth || 800, 640);
    const reserveH = Math.max(320, Math.round(cardW * fallbackRatio));
    cardEl.style.height = `${reserveH}px`;
  }

  // Use canvases so we can paint masks on both faces
  const frontCanvas = document.createElement('canvas');
  const backCanvas  = document.createElement('canvas');
  frontCanvas.className = 'card-canvas';
  backCanvas.className  = 'card-canvas';
  // Scale canvases to the face box; card sizing logic controls the final aspect/fit.
  frontCanvas.style.width = '100%';
  frontCanvas.style.height = '100%';
  backCanvas.style.width  = '100%';
  backCanvas.style.height = '100%';

  // Accessibility for canvases (alt text/title)
  if (c.imageAlt) {
    frontCanvas.setAttribute('aria-label', String(c.imageAlt));
    backCanvas.setAttribute('aria-label', String(c.imageAlt));
    frontCanvas.setAttribute('title', String(c.imageAlt));
    backCanvas.setAttribute('title', String(c.imageAlt));
  }

  frontEl.appendChild(frontCanvas);
  backEl.appendChild(backCanvas);
  const fctx = frontCanvas.getContext('2d');
  const bctx = backCanvas.getContext('2d');

  const ACTIVE  = getCSS('--mask-active', 'rgba(255,210,0,1)');
  const PASSIVE = getCSS('--mask-passive', 'rgba(0,0,0,0.9)');

  const fi = new Image();
  const bi = new Image();
  fi.src = imgFrontSrc;
  bi.src = imgBackSrc;

  fi.onload = () => {
    frontCanvas.width  = fi.naturalWidth;
    frontCanvas.height = fi.naturalHeight;
    fctx.drawImage(fi, 0, 0);
    if (hasMask) {
      // Front: cover all regions; active is highlighted
      c.mask.regions.forEach((r, i) => drawRegion(fctx, r, i === c.mask.activeIndex ? ACTIVE : PASSIVE));
    } else if (hasLegacyMask) {
      const { x, y, w, h } = c.maskRegion;
      fctx.fillStyle = PASSIVE;
      fctx.fillRect(x, y, w, h);
    }
    // (caption deprecated: not rendered)
    // Try sizing as soon as the front loads (helps when back is slow or absent)
    applyImageSizing(cardEl, frontEl, frontCanvas);
    if (!skipSizing) watchCardSizing(cardEl, frontEl, frontCanvas);
    adjustLayout();
    // After real sizing applies, clear placeholder reserve
    cardEl.style.height = cardEl.style.height;
  };

  bi.onload = () => {
    backCanvas.width  = bi.naturalWidth;
    backCanvas.height = bi.naturalHeight;
    bctx.drawImage(bi, 0, 0);
    if (hasMask) {
      // Back: cover all except the active region (reveal it)
      c.mask.regions.forEach((r, i) => {
        if (i !== c.mask.activeIndex) drawRegion(bctx, r, PASSIVE);
      });
    }
    // (caption deprecated: not rendered)

    // Contain to card using the back (final) size, then keep in sync
    applyImageSizing(cardEl, frontEl, backCanvas);
    if (!skipSizing) watchCardSizing(cardEl, frontEl, backCanvas);
    adjustLayout();
  };

  function drawRegion(ctx, region, fill) {
    ctx.save();
    ctx.fillStyle = fill;
    if (region.shape === 'poly' && Array.isArray(region.points)) {
      ctx.beginPath();
      const [p0, ...rest] = region.points;
      ctx.moveTo(p0[0], p0[1]);
      rest.forEach(p => ctx.lineTo(p[0], p[1]));
      ctx.closePath();
      ctx.fill();
    } else {
      const { x = 0, y = 0, w = 1, h = 1 } = region;
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
  }

  function getCSS(varName, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    return v || fallback;
  }
}
