import { normalize } from './answers.js';

const MCQ_KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const MCQ_LINE_RE = /^\s*([A-H])\s*[\)\.\:]\s*(.+)\s*$/i;

function sanitizeKey(raw) {
  if (raw == null) return '';
  const cleaned = String(raw).toUpperCase().replace(/[^A-Z0-9]+/g, '');
  return cleaned;
}

function coerceKey(raw, idx) {
  const cleaned = sanitizeKey(raw);
  if (cleaned) return cleaned;
  return MCQ_KEYS[idx] || String(idx + 1);
}

function normalizeOptionEntry(entry, idx) {
  if (entry == null) return null;
  if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') {
    const text = String(entry).trim();
    if (!text) return null;
    return { key: coerceKey('', idx), text };
  }
  if (typeof entry === 'object') {
    const textRaw = entry.text ?? entry.value ?? '';
    const text = String(textRaw ?? '').trim();
    if (!text) return null;
    const key = coerceKey(entry.key ?? entry.label ?? entry.letter ?? '', idx);
    return { key, text };
  }
  return null;
}

function ensureUniqueKeys(options) {
  const used = new Set();
  const out = [];
  let fallbackIdx = 0;
  for (const opt of options) {
    let key = sanitizeKey(opt.key);
    if (!key || used.has(key)) {
      while (MCQ_KEYS[fallbackIdx] && used.has(MCQ_KEYS[fallbackIdx])) fallbackIdx += 1;
      key = MCQ_KEYS[fallbackIdx] || String(out.length + 1);
      fallbackIdx += 1;
    }
    used.add(key);
    out.push({ key, text: opt.text });
  }
  return out;
}

function normalizeOptionList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    const out = [];
    raw.forEach((entry, idx) => {
      const opt = normalizeOptionEntry(entry, idx);
      if (opt) out.push(opt);
    });
    return ensureUniqueKeys(out);
  }
  if (typeof raw === 'object') {
    const out = Object.entries(raw).map(([key, text], idx) => ({
      key: coerceKey(key, idx),
      text: String(text ?? '').trim()
    })).filter(opt => opt.text);
    // Sort by key to preserve A, B, C... ordering for map-style objects.
    out.sort((a, b) => {
      const ai = MCQ_KEYS.indexOf(a.key);
      const bi = MCQ_KEYS.indexOf(b.key);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      return a.key.localeCompare(b.key);
    });
    return ensureUniqueKeys(out);
  }
  return [];
}

function parseOptionsFromText(text) {
  if (!text) return [];
  const lines = String(text).split(/\r?\n/);
  const out = [];
  lines.forEach(line => {
    const m = line.match(MCQ_LINE_RE);
    if (!m) return;
    const key = coerceKey(m[1], out.length);
    const desc = String(m[2] ?? '').trim();
    if (desc) out.push({ key, text: desc });
  });
  return ensureUniqueKeys(out);
}

export function resolveMcqOptions(card) {
  const structured = normalizeOptionList(card?.mcqOptions ?? card?.mcq?.options ?? null);
  if (structured.length) return structured;

  const fromBack = parseOptionsFromText(card?.back ?? '');
  const fromFront = parseOptionsFromText(card?.front ?? '');
  if (fromBack.length || fromFront.length) {
    const picked = (fromBack.length >= fromFront.length) ? fromBack : fromFront;
    const archetype = String(card?.archetype ?? card?.type ?? '').toLowerCase();
    const isExplicitMcq = archetype === 'mcq';
    if (isExplicitMcq || picked.length >= 4) {
      return picked;
    }
  }
  return [];
}

export function resolveMcqCorrect(card, options) {
  const byKey = new Map();
  const byNormText = new Map();
  options.forEach(opt => {
    const key = sanitizeKey(opt.key);
    const text = String(opt.text ?? '').trim();
    if (key) byKey.set(key, opt);
    const normText = normalize(text);
    if (normText && !byNormText.has(normText)) byNormText.set(normText, key);
  });

  const correctKeys = new Set();
  const correctTextSet = new Set();

  const addKey = (value) => {
    const key = sanitizeKey(value);
    if (key && byKey.has(key)) correctKeys.add(key);
  };
  const addText = (value) => {
    const normText = normalize(value);
    if (normText) correctTextSet.add(normText);
  };

  const rawMcqCorrect = Array.isArray(card?.mcqCorrect)
    ? card.mcqCorrect
    : Array.isArray(card?.mcq?.correct)
      ? card.mcq.correct
      : [];
  rawMcqCorrect.forEach(item => {
    if (item == null) return;
    const raw = String(item).trim();
    if (!raw) return;
    const maybeKey = sanitizeKey(raw);
    if (maybeKey && byKey.has(maybeKey)) addKey(maybeKey);
    else addText(raw);
  });

  if (Array.isArray(card?.correct)) {
    card.correct.forEach(item => {
      if (item == null) return;
      const raw = String(item).trim();
      if (!raw) return;
      const maybeKey = sanitizeKey(raw);
      if (maybeKey && byKey.has(maybeKey)) addKey(maybeKey);
      addText(raw);
    });
  }

  correctTextSet.forEach(normText => {
    const key = byNormText.get(normText);
    if (key) correctKeys.add(key);
  });

  correctKeys.forEach(key => {
    const opt = byKey.get(key);
    if (opt?.text) correctTextSet.add(normalize(opt.text));
  });

  return { correctKeys, correctTextSet, byKey };
}

export function getMcqCorrectAliases(card) {
  const aliases = [];
  const seen = new Set();
  const archetype = String(card?.archetype ?? card?.type ?? '').toLowerCase();
  const disableLetterAliases = archetype === 'maths';
  const pushAlias = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw) return;
    const key = normalize(raw);
    if (seen.has(key)) return;
    seen.add(key);
    aliases.push(raw);
  };

  if (Array.isArray(card?._mcqOptions) && card._mcqOptions.length) {
    card._mcqOptions.forEach(opt => {
      if (!opt || !opt.correct) return;
      const key = opt.displayKey || opt.key;
      if (key && !disableLetterAliases) {
        pushAlias(key);
        pushAlias(`${key})`);
        pushAlias(`${key}.`);
        pushAlias(`${key}:`);
      }
      if (opt.text) pushAlias(opt.text);
    });
    return aliases;
  }

  const options = resolveMcqOptions(card);
  if (!options.length) return [];
  const { correctKeys, correctTextSet, byKey } = resolveMcqCorrect(card, options);
  if (!correctKeys.size && !correctTextSet.size) return [];

  const normToText = new Map();
  options.forEach(opt => {
    const normText = normalize(opt.text);
    if (normText && !normToText.has(normText)) normToText.set(normText, opt.text);
  });

  correctKeys.forEach(key => {
    if (!disableLetterAliases) {
      pushAlias(key);
      pushAlias(`${key})`);
      pushAlias(`${key}.`);
      pushAlias(`${key}:`);
    }
    const opt = byKey.get(key);
    if (opt?.text) pushAlias(opt.text);
  });

  correctTextSet.forEach(normText => {
    const raw = normToText.get(normText);
    if (raw) pushAlias(raw);
  });

  return aliases;
}
