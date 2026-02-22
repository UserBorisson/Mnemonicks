import { refreshFillInSizing } from './fillin.js';

function parseTimeMs(value) {
  const raw = String(value || '').trim();
  if (!raw) return 0;
  if (raw.endsWith('ms')) return Number.parseFloat(raw) || 0;
  if (raw.endsWith('s')) return (Number.parseFloat(raw) || 0) * 1000;
  return Number.parseFloat(raw) || 0;
}

function getAnimationMaxMs(el) {
  if (!el) return 0;
  const cs = getComputedStyle(el);
  const durations = String(cs.animationDuration || '').split(',').map(parseTimeMs);
  const delays = String(cs.animationDelay || '').split(',').map(parseTimeMs);
  const count = Math.max(durations.length, delays.length);
  let maxMs = 0;
  for (let i = 0; i < count; i++) {
    const d = durations[i] ?? durations[durations.length - 1] ?? 0;
    const a = delays[i] ?? delays[delays.length - 1] ?? 0;
    const total = Math.max(0, d + a);
    if (total > maxMs) maxMs = total;
  }
  return maxMs;
}

function runAnimationWithFallback(el, validNames, onFinish) {
  return new Promise(resolve => {
    if (!el) {
      resolve();
      return;
    }

    let done = false;
    let timer = null;
    const finish = () => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      el.removeEventListener('animationend', onEnd);
      try { onFinish?.(); } catch {}
      resolve();
    };
    const onEnd = (e) => {
      if (e.target !== el) return;
      if (Array.isArray(validNames) && validNames.length && !validNames.includes(e.animationName)) return;
      finish();
    };

    el.addEventListener('animationend', onEnd);

    // If animation is effectively disabled/too short, animationend can be missed.
    requestAnimationFrame(() => {
      const maxMs = getAnimationMaxMs(el);
      if (maxMs <= 0.5) {
        finish();
        return;
      }
      timer = setTimeout(finish, Math.ceil(maxMs) + 60);
    });
  });
}

/**
 * Animate a panel out using the fly-out keyframe,
 * then remove its visible state.
 * @param {HTMLElement} el
 * @returns {Promise<void>}
 */
export function animateOut(el) {
  if (!el) return Promise.resolve();
  el.classList.remove('animating-in');
  el.classList.add('animating-out');
  return runAnimationWithFallback(
    el,
    ['fly-out', 'fly-out-right', 'fade-out'],
    () => el.classList.remove('animating-out', 'visible')
  );
}

/**
 * Mark a panel visible, recalc fill-in width if needed,
 * and animate it in using fly-in.
 * @param {HTMLElement} el
 * @returns {Promise<void>}
 */
export function animateIn(el) {
  if (!el) return Promise.resolve();
  // 1) Make panel visible so it has layout
  el.classList.add('visible');
  // 2) If fillin panel, recalc its width before animation
  if (el.id === 'fillin') {
    refreshFillInSizing();
  }
  // 3) Start fly-in
  el.classList.remove('animating-out');
  el.classList.add('animating-in');
  return runAnimationWithFallback(
    el,
    ['fly-in', 'fly-in-right', 'fade-in'],
    () => el.classList.remove('animating-in')
  );
}
