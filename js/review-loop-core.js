function toId(value) {
  if (value == null) return "";
  return String(value);
}

function toIdSet(values) {
  const out = new Set();
  if (values instanceof Set) {
    values.forEach((value) => {
      const id = toId(value);
      if (id) out.add(id);
    });
    return out;
  }
  if (!values || typeof values[Symbol.iterator] !== "function") return out;
  for (const value of values) {
    const id = toId(value);
    if (id) out.add(id);
  }
  return out;
}

export function evaluateReviewAttempt({ isCorrect, attempts = 1, hintUsed = false } = {}) {
  const tries = Math.max(1, Number(attempts) || 1);
  const correct = !!isCorrect;
  const usedHint = !!hintUsed;
  const fullyCorrect = correct && tries <= 1 && !usedHint;
  const penalized = !correct || tries > 1 || usedHint;
  const shouldRequeue = !correct || usedHint || tries >= 3;
  return {
    correct,
    attempts: tries,
    hintUsed: usedHint,
    fullyCorrect,
    penalized,
    shouldRequeue
  };
}

export function applyForcedRetryDecision(currentIds, cardId, attempt = {}) {
  const next = toIdSet(currentIds);
  const id = toId(cardId);
  if (!id) return next;
  const shouldRequeue = typeof attempt?.shouldRequeue === "boolean" ? attempt.shouldRequeue : !attempt?.fullyCorrect;
  if (!shouldRequeue) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

export function includeForcedRetryCards({
  baseDue = [],
  allCards = [],
  forcedRetryIds = new Set(),
  sortCards
} = {}) {
  const base = Array.isArray(baseDue) ? baseDue.slice() : [];
  const forcedSet = toIdSet(forcedRetryIds);
  if (!forcedSet.size) return base;

  const seen = new Set(base.map((card) => toId(card?.id)));
  const forced = (Array.isArray(allCards) ? allCards : []).filter((card) => {
    const id = toId(card?.id);
    return id && forcedSet.has(id) && !seen.has(id);
  });
  if (!forced.length) return base;

  const sorter = typeof sortCards === "function" ? sortCards : ((items) => items.slice());
  return base.concat(sorter(forced));
}

export function nextDueIndexAfterRebuild({
  dueArr = [],
  currentId = null,
  previousIndex = null,
  advance = false
} = {}) {
  const list = Array.isArray(dueArr) ? dueArr : [];
  if (!list.length) return 0;
  if (!advance) return 0;

  if (currentId != null) {
    const idx = list.findIndex((card) => toId(card?.id) === toId(currentId));
    if (idx !== -1) return (idx + 1) % list.length;
  }

  if (Number.isInteger(previousIndex)) {
    return Math.max(0, Math.min(previousIndex, Math.max(0, list.length - 1)));
  }
  return 0;
}
