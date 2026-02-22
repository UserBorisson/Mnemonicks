// alerts.js
const STACK_ID = 'alert-stack';

function ensureStack() {
  let s = document.getElementById(STACK_ID);
  if (!s) {
    s = document.createElement('div');
    s.id = STACK_ID;
    s.className = 'alert-stack';
    document.body.appendChild(s);
  }
  return s;
}

function visibles(stack) {
  return Array.from(stack.querySelectorAll('.alert'))
    .filter(el => getComputedStyle(el).display !== 'none');
}
function measureMap(stack) {
  const map = new Map();
  const top = stack.getBoundingClientRect().top;
  visibles(stack).forEach(el => map.set(el, el.getBoundingClientRect().top - top));
  return map;
}
function animateInsert(stack, newEl, beforeEl = null) {
  const before = measureMap(stack);
  if (beforeEl) stack.insertBefore(newEl, beforeEl); else stack.prepend(newEl);
  const after = measureMap(stack);

  after.forEach((toTop, el) => {
    const fromTop = before.get(el);
    if (fromTop == null) return;
    const dy = fromTop - toTop;
    if (!dy) return;
    el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }],
      { duration: 450, easing: 'cubic-bezier(.22,.61,.36,1)' });
  });

  newEl.animate([{ opacity: 0, filter: 'blur(8px)' }, { opacity: 1, filter: 'blur(0)' }],
    { duration: 450, easing: 'cubic-bezier(.22,.61,.36,1)' });
}
function animateNeighborsOnClose(stack, closing) {
  const before = measureMap(stack);
  const startTop = before.get(closing);

  // take out of flow so siblings shift immediately
  closing.style.position = 'absolute';
  closing.style.left = '0';
  closing.style.top = `${startTop}px`;
  closing.style.width = '100%';
  closing.style.zIndex = '1';

  const after = measureMap(stack);
  after.delete(closing);

  after.forEach((toTop, el) => {
    const fromTop = before.get(el);
    const dy = fromTop - toTop;
    if (!dy) return;
    el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }],
      { duration: 450, easing: 'cubic-bezier(.22,.61,.36,1)' });
  });

  requestAnimationFrame(() => closing.classList.add('fade-out'));
  closing.addEventListener('transitionend', () => {
    closing.style.display = 'none';
    closing.classList.remove('fade-out');
    closing.style.position = closing.style.top = closing.style.left = closing.style.width = closing.style.zIndex = '';
  }, { once: true });
}

// same icons/copy as alerts.html
const DEFAULT_COPY = {
  success: { title: 'Success', desc: 'Success' },
  warning: { title: 'Alert',   desc: 'Alert'   },
  error:   { title: 'Error',   desc: 'Error'   },
  info:    { title: 'Hint',    desc: 'Hint'    },
};

function svgFor(variant) {
  if (variant === 'success') return '<svg viewBox="0 0 24 24"><path d="M20 6 9 17 4 12"/></svg>';
  if (variant === 'warning') return '<svg viewBox="0 0 24 24"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';
  if (variant === 'error')   return '<svg viewBox="0 0 24 24"><path d="M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86L7.86 2Z"/><path d="M12 8v5"/><path d="M12 17h.01"/></svg>';
  return '<svg viewBox="0 0 24 24"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 3a7 7 0 0 0-7 7c0 2.5 1.2 4 3 5.5.7.6 1 1 1 1.5h6c0-.5.3-.9 1-1.5 1.8-1.5 3-3 3-5.5a7 7 0 0 0-7-7Z"/></svg>';
}

function normalizeIcons(scope) {
  scope.querySelectorAll('svg').forEach(svg => {
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('stroke-width', '2');
  });
}

export function showAlert(variant = 'info', title, desc, { timeout = 4500 } = {}) {
  const stack = ensureStack();
  const v = DEFAULT_COPY[variant] ? variant : 'info';
  const t = title ?? DEFAULT_COPY[v].title;
  const d = desc ?? DEFAULT_COPY[v].desc;

  const role = (v === 'warning' || v === 'error') ? 'alert' : 'status';
  const el = document.createElement('section');
  el.className = `alert ${v}`;
  el.setAttribute('role', role);
  el.innerHTML = `
    <div class="iconbox" aria-hidden="true">${svgFor(v)}</div>
    <div class="content"><h3 class="title">${t}</h3><p class="desc">${d}</p></div>
    <button class="alert-close" aria-label="Dismiss notification">
      <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
    </button>
  `;
  normalizeIcons(el);

  el.querySelector('.alert-close')?.addEventListener('click', () => animateNeighborsOnClose(stack, el));
  animateInsert(stack, el, stack.firstElementChild);

  if (timeout > 0) setTimeout(() => animateNeighborsOnClose(stack, el), timeout);
  return el;
}

export function clearAlerts() {
  const stack = ensureStack();
  visibles(stack).forEach(el => { el.style.display = 'none'; });
}
