// answers.js
// Centralized normalization and deck-wide pool utilities for MCQ/Fill-in

/** Normalize text for matching:
 * - Unicode NFKD
 * - Strip combining diacritics
 * - Collapse whitespace, trim
 * - Lowercase
 */
export function normalize(s) {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** 
 * Build a relaxed key for MCQ choice de-duplication.
 * - Uses normalize()
 * - Drops punctuation/underscores and re-collapses whitespace
 */
export function normalizeChoiceKey(s) {
  const base = normalize(s);
  if (!base) return '';
  const collapsed = base.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  return collapsed || base;
}

/** Build a deck-wide pool of canonical correct answers plus lexeme buckets. */
export function buildDeckAnswerPool(cards) {
  const global = new Map();
  const byLexeme = new Map();
  const pool = { global, byLexeme };
  Object.defineProperty(pool, 'size', {
    enumerable: false,
    configurable: true,
    get: () => global.size
  });
  if (!Array.isArray(cards)) return pool;
  for (const card of cards) {
    const lexemeKey = getLexemeKey(card);
    const variants = collectAnswerCandidates(card);
    variants.forEach(answer => {
      const normed = normalize(answer);
      if (!normed) return;
      if (!global.has(normed)) global.set(normed, answer);
      if (lexemeKey) {
        if (!byLexeme.has(lexemeKey)) byLexeme.set(lexemeKey, []);
        const list = byLexeme.get(lexemeKey);
        if (!list.includes(answer)) list.push(answer);
      }
    });
  }
  return pool;
}

/** Mulberry32 PRNG for optional deterministic sampling */
export function mulberry32(seed) {
  let t = (seed >>> 0) || 0x9E3779B9;
  return function() {
    t |= 0; t = (t + 0x6D2B79F5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sample up to n unique items from an array using provided rng (or Math.random) */
export function sampleUnique(arr, n, rng = Math.random) {
  const out = [];
  if (!Array.isArray(arr) || n <= 0) return out;
  // Reservoir-like but simpler: copy and partial shuffle
  const a = arr.slice();
  for (let i = a.length - 1; i > 0 && out.length < n; i--) {
    const j = Math.floor((rng || Math.random)() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.min(n, a.length));
}

/** Compute MCQ choices for a new-schema card from a deck pool.
 * - Always include all of the card's correct answers (as given) — never drop them.
 * - Add dummies up to the requested totalCap (minus correct count).
 * - Returns an array of display strings.
 */
export function choicesFromPoolForCard(card, deckPool, dummyCap, rng) {
  const correctArr = Array.isArray(card?.correct) ? card.correct.filter(x => normalize(x)) : [];
  const normCorrect = new Set(correctArr.map(normalize));
  const cap = Math.max(0, Number(dummyCap) || 0);
  const lexemeKey = getLexemeKey(card);
  const isVocabCard = card?.type === 'latin_vocab' || card?.drillStyle === 'single';
  const globalPoolArray = (() => {
    if (deckPool?.global?.values) return Array.from(deckPool.global.values());
    if (deckPool instanceof Map || deckPool instanceof Set) return Array.from(deckPool.values());
    if (Array.isArray(deckPool)) return deckPool.slice();
    return [];
  })();
  const lexemePool = (lexemeKey && deckPool?.byLexeme?.get(lexemeKey)) || [];
  let basePool;
  if (isVocabCard) {
    basePool = globalPoolArray;
  } else if (lexemePool.length > 1) {
    const hasAlternatives = lexemePool.some(txt => !normCorrect.has(normalize(txt)));
    basePool = hasAlternatives ? lexemePool : globalPoolArray;
  } else {
    basePool = globalPoolArray;
  }
  const filtered = basePool.filter(text => !normCorrect.has(normalize(text)));
  const desiredDummyCount = cap;
  const dummies = sampleUnique(filtered, desiredDummyCount, rng);
  const combined = correctArr.concat(dummies);
  return combined.length ? combined : correctArr;
}

function collectAnswerCandidates(card) {
  if (Array.isArray(card?.mcqOptions) && card.mcqOptions.length) {
    return card.mcqOptions
      .map(opt => (opt && typeof opt === 'object' ? opt.text ?? opt.value ?? '' : opt))
      .map(String)
      .filter(Boolean);
  }
  if (card?.mcq && card.mcq.options) {
    const raw = card.mcq.options;
    if (Array.isArray(raw)) {
      return raw
        .map(opt => (opt && typeof opt === 'object' ? opt.text ?? opt.value ?? '' : opt))
        .map(String)
        .filter(Boolean);
    }
    if (raw && typeof raw === 'object') {
      return Object.values(raw).map(String).filter(Boolean);
    }
  }
  if (Array.isArray(card?.mcqVariants) && card.mcqVariants.length) return card.mcqVariants.map(String);
  if (Array.isArray(card?.correct) && card.correct.length) return card.correct.map(String);
  if (Array.isArray(card?.answers) && card.answers.length) {
    if (typeof card.answers[0] === 'object') {
      return card.answers.map(o => String(o?.text ?? '')).filter(Boolean);
    }
    return card.answers.map(String);
  }
  return [];
}

function getLexemeKey(card) {
  const explicit = String(card?.lexemeId || card?.meta?.lexeme || card?.meta?.noun || '').trim();
  if (explicit) return explicit;

  // Latin fallback: derive a stable key from the base lemmas on the front (before dictionary commas)
  const cardType = String(card?.type || '').toLowerCase();
  if (cardType.startsWith('latin') && typeof card?.front === 'string') {
    const parts = String(card.front || '')
      .split(/\n+/)
      .map(line => {
        const trimmed = String(line || '').trim();
        if (!trimmed) return '';
        const commaIdx = trimmed.indexOf(',');
        const base = commaIdx === -1 ? trimmed : trimmed.slice(0, commaIdx);
        return base.trim().toLowerCase();
      })
      .filter(Boolean);
    if (parts.length) return parts.join('|');
  }

  return String(card?.id || '').trim();
}
