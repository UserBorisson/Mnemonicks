import { decline } from './latin-declension.js';

/**
 * Abbreviation dictionary stores canonical lemma entries that plug into
 * the table-driven declension engine.
 *
 * Scope in this file = ANATOMICAL LABELS (nouns/adjectives).
 * Rx/clinical phrases (e.g., "ad caps.", "p.o.", "D.S.") are handled in latin-rx.js.
 */

/** @typedef {import('./latin-declension.js').LemmaEntry} LemmaEntry */

/** ------------------------ ANATOMICAL NOUNS ------------------------ */
/** @type {Record<string, LemmaEntry>} */
const LATIN_ABBR = {
  // Core (legacy)
  m:    { pos: 'noun', lemma: 'mūsculus',     gen_sg: 'mūsculī',     nounClass: '2m_us', genders: ['m'] },
  n:    { pos: 'noun', lemma: 'nervus',       gen_sg: 'nervī',       nounClass: '2m_us', genders: ['m'] },
  a:    { pos: 'noun', lemma: 'artēria',      gen_sg: 'artēriae',    nounClass: '1',     genders: ['f'] },
  v:    { pos: 'noun', lemma: 'vēna',         gen_sg: 'vēnae',       nounClass: '1',     genders: ['f'] },
  r:    { pos: 'noun', lemma: 'rāmus',        gen_sg: 'rāmī',        nounClass: '2m_us', genders: ['m'] },
  lig:  { pos: 'noun', lemma: 'ligāmentum',   gen_sg: 'ligāmentī',   nounClass: '2n',    genders: ['n'] },
  proc: { pos: 'noun', lemma: 'processus',    gen_sg: 'processūs',   nounClass: '4m',    genders: ['m'] },
  art:  { pos: 'noun', lemma: 'articulātiō',  gen_sg: 'articulātiōnis', nounClass: '3mf', genders: ['f'] },

  // Extended set
  t:    { pos: 'noun', lemma: 'tendō',        gen_sg: 'tendinis',    nounClass: '3mf',   genders: ['m'] },
  gl:   { pos: 'noun', lemma: 'glandula',     gen_sg: 'glandulae',   nounClass: '1',     genders: ['f'] },
  ggl:  { pos: 'noun', lemma: 'ganglion',     gen_sg: 'gangliī',     nounClass: '2n',    genders: ['n'] },
  for:  { pos: 'noun', lemma: 'forāmen',      gen_sg: 'forāminis',   nounClass: '3n',    genders: ['n'] },
  ncl:  { pos: 'noun', lemma: 'nucleus',      gen_sg: 'nucleī',      nounClass: '2m_us', genders: ['m'] },
  pl:   { pos: 'noun', lemma: 'plexus',       gen_sg: 'plexūs',      nounClass: '4m',    genders: ['m'] },
  rec:  { pos: 'noun', lemma: 'recessus',     gen_sg: 'recessūs',    nounClass: '4m',    genders: ['m'] },
  var:  { pos: 'noun', lemma: 'variētās',     gen_sg: 'variētātis',  nounClass: '3mf',   genders: ['f'] }
};

const ABBR_FORMS = new Set(Object.keys(LATIN_ABBR));

/** ------------------------ ANATOMICAL ADJECTIVES ------------------------ */
/** @type {Record<string, LemmaEntry>} */
const LATIN_ADJ = {
  // 3rd declension two-termination adjectives
  lat:    { pos: 'adjective', lemma: 'laterālis',     gen_sg: 'laterālis',     adjClass: '3-two', genders: ['m', 'f', 'n'] },
  med:    { pos: 'adjective', lemma: 'mediālis',      gen_sg: 'mediālis',      adjClass: '3-two', genders: ['m', 'f', 'n'] },
  vent:   { pos: 'adjective', lemma: 'ventrālis',     gen_sg: 'ventrālis',     adjClass: '3-two', genders: ['m', 'f', 'n'] },
  dors:   { pos: 'adjective', lemma: 'dorsālis',      gen_sg: 'dorsālis',      adjClass: '3-two', genders: ['m', 'f', 'n'] },
  superf: { pos: 'adjective', lemma: 'superficiālis', gen_sg: 'superficiālis', adjClass: '3-two', genders: ['m', 'f', 'n'] },
  comm:   { pos: 'adjective', lemma: 'commūnis',      gen_sg: 'commūnis',      adjClass: '3-two', genders: ['m', 'f', 'n'] },

  // 1st/2nd declension adjectives
  prof:   { pos: 'adjective', lemma: 'profundus',     gen_sg: 'profundī',      adjClass: '1-2',   genders: ['m', 'f', 'n'] },
  ext:    { pos: 'adjective', lemma: 'externus',      gen_sg: 'externī',       adjClass: '1-2',   genders: ['m', 'f', 'n'] },
  int:    { pos: 'adjective', lemma: 'internus',      gen_sg: 'internī',       adjClass: '1-2',   genders: ['m', 'f', 'n'] },

  // -er adjectives (drop 'e' after 'r' when forming stems)
  dx:     { pos: 'adjective', lemma: 'dexter',        gen_sg: 'dextrī',        adjClass: '1-2',   genders: ['m', 'f', 'n'], flags: { dropEAfterR: true } },
  sin:    { pos: 'adjective', lemma: 'sinister',      gen_sg: 'sinistrī',      adjClass: '1-2',   genders: ['m', 'f', 'n'], flags: { dropEAfterR: true } },

  // Comparatives
  ant:    { pos: 'adjective', lemma: 'anterior',      adjClass: 'comparative', stem: 'anterior',  genders: ['m', 'f', 'n'] },
  post:   { pos: 'adjective', lemma: 'posterior',     adjClass: 'comparative', stem: 'posterior', genders: ['m', 'f', 'n'] },
  sup:    { pos: 'adjective', lemma: 'superior',      adjClass: 'comparative', stem: 'superior',  genders: ['m', 'f', 'n'] },
  inf:    { pos: 'adjective', lemma: 'inferior',      adjClass: 'comparative', stem: 'inferior',  genders: ['m', 'f', 'n'] }
};

// helpful aliases so inputs like "superfic.", "commun." match
const ADJ_ALIAS = {
  dex: 'dx',
  dextr: 'dx',
  superfic: 'superf',
  superfici: 'superf',
  commun: 'comm'
};

const ADJ_FORMS = new Set(Object.keys(LATIN_ADJ));

/** ------------------------ TOKEN HELPERS ------------------------ */

function makeLower(text) {
  return String(text).toLowerCase();
}

function _stripTrailingPunct(token) {
  return String(token).replace(/[.,;:]+$/, '');
}

function _isCoordConjToken(token) {
  const stripped = _stripTrailingPunct(token);
  const lower = makeLower(stripped);
  return lower === 'et' || lower === 'and' || stripped === '&';
}

function _latinizeConjunction(token) {
  const raw = String(token);
  if (raw === '&') return 'et';
  const m = raw.match(/^([A-Za-z]+)([.,;:]*)$/);
  if (!m) return raw;
  const [, word, punct] = m;
  if (makeLower(word) !== 'and') return raw;
  const et = word === word.toUpperCase() ? 'ET' : (/^[A-Z]/.test(word) ? 'Et' : 'et');
  return et + punct;
}

/** Normalize one token to its bare abbreviation core (no trailing dots). */
function _abbrBaseForm(t) {
  return makeLower(t).replace(/\.+$/, '');
}
function _adjBaseForm(t) {
  return makeLower(t).replace(/\.+$/, '');
}

/** Canonicalize plural-by-doubling: xx → x if x is a known key and last two letters are doubled. */
function _toSingularBaseIfDoubled(base) {
  if (base.length >= 2 && base.slice(-1) === base.slice(-2, -1)) {
    const candidate = base.slice(0, -1);
    if (LATIN_ABBR[candidate]) return candidate;
  }
  return null;
}

/** True if token is a noun abbr (singular or doubled plural). */
function _isAbbrToken(t) {
  const base = _abbrBaseForm(t);
  if (LATIN_ABBR[base]) return true;
  return !!_toSingularBaseIfDoubled(base);
}

/** True if token is one of our adjectives (with aliasing). */
function _isAdjToken(t) {
  const key = _canonAdj(t);
  return !!LATIN_ADJ[key];
}

/** Is the form plural via doubling last letter? (aa, mm, ligg, artt, ggll, …) */
function _isPluralForm(t) {
  const base = _abbrBaseForm(t);
  return !!_toSingularBaseIfDoubled(base);
}

/** Map plural doubled forms back to their canonical singular key. */
function _canonFrom(t) {
  const base = _abbrBaseForm(t);
  if (LATIN_ABBR[base]) return base;
  const singular = _toSingularBaseIfDoubled(base);
  return singular || base;
}

function _canonAdj(t) {
  const base = _adjBaseForm(t);
  return ADJ_ALIAS[base] || base;
}

function _ensureDot(t) {
  const raw = String(t);
  if (/\.$/.test(raw)) return raw;
  const base = _abbrBaseForm(raw);
  const adj = _canonAdj(raw);
  if (LATIN_ABBR[base] || LATIN_ADJ[adj]) return raw + '.';
  return raw;
}

function _mergeSplitDots(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const next = tokens[i + 1];
    if (/^[A-Za-z]+$/.test(t) && next === '.') {
      out.push(t + '.');
      i++;
    } else {
      out.push(t);
    }
  }
  return out;
}

/** Preserve capitalization of the first letter if the source started uppercase. */
function _inheritCase(src, out) {
  const lower = String(out).toLowerCase();
  return /^[A-Z]/.test(String(src))
    ? lower.charAt(0).toUpperCase() + lower.slice(1)
    : lower;
}

/** If abbrev appears last, pull it before the last lowercase word (helps "a. lat. dex."). */
function normalizeLatinLabel(raw) {
  if (!raw) return '';
  let tokens = String(raw).replace(/\s+/g, ' ').trim().split(' ');
  tokens = _mergeSplitDots(tokens).map((t) => _latinizeConjunction(_ensureDot(t)));

  // collapse trailing "... word ." to "... word."
  if (tokens.length >= 2 && tokens.at(-1) === '.' && /^[A-Za-z]+$/.test(tokens.at(-2))) {
    tokens.splice(tokens.length - 2, 2, tokens.at(-2) + '.');
  }

  const isLowerWord = (t) => /^[a-z\u00e0-\u024f]/.test(t) && !_isAbbrToken(t);
  if (tokens.length && _isAbbrToken(tokens.at(-1))) {
    const prev = tokens.at(-2);
    if (!_isCoordConjToken(prev)) {
      const abbr = tokens.pop();
      const ins = tokens.findLastIndex(isLowerWord);
      if (ins >= 0) tokens.splice(ins, 0, abbr);
      else tokens.push(abbr);
    }
  }

  // strip stray ending dot on a non-abbrev/non-adj token
  if (/\.$/.test(tokens.at(-1)) && !_isAbbrToken(tokens.at(-1)) && !_isAdjToken(tokens.at(-1))) {
    tokens[tokens.length - 1] = tokens.at(-1).replace(/\.+$/, '');
  }

  return tokens.join(' ');
}

function lemmaGender(entry) {
  return entry.genders?.[0] || 'm';
}

function _shouldFirstNounBeGenitive(outTokens) {
  for (let i = outTokens.length - 1; i >= 0; i--) {
    const token = outTokens[i];
    if (!token) continue;
    const stripped = _stripTrailingPunct(token);
    if (!stripped) continue;
    if (_isCoordConjToken(stripped)) return false;
    const base = _abbrBaseForm(stripped);
    if (ABBR_FORMS.has(base)) return false;
    const adjKey = _canonAdj(stripped);
    if (ADJ_FORMS.has(adjKey)) return false;
    if (/^[A-Za-z\u00C0-\u024F]+$/.test(stripped)) return true;
  }
  return false;
}

function _hasCoordConjunctionBetween(outTokens, leftIndex, rightIndex) {
  const start = Math.min(leftIndex, rightIndex) + 1;
  const end = Math.max(leftIndex, rightIndex);
  for (let i = start; i < end; i++) {
    if (_isCoordConjToken(outTokens[i])) return true;
  }
  return false;
}

/**
 * For coordinated singular nouns (e.g., "Arteria et Vena"),
 * side adjectives like dex./sin. are used in nominative plural.
 */
function _coordinatedNounMorphForSideAdj(outTokens, nouns) {
  if (!Array.isArray(nouns) || nouns.length < 2) return null;
  const right = nouns[nouns.length - 1];
  const left = nouns[nouns.length - 2];
  if (!left || !right) return null;
  if (!_hasCoordConjunctionBetween(outTokens, left.index, right.index)) return null;
  if (left.case !== 'nom' || right.case !== 'nom') return null;
  if (left.number !== 'sg' || right.number !== 'sg') return null;

  const gender = left.gender === right.gender ? left.gender : 'm';
  return { case: 'nom', number: 'pl', gender };
}

/** Decline an adjective to agree with target morph features. */
function agreeAdjective(adjKey, morph = {}) {
  const entry = LATIN_ADJ[adjKey];
  if (!entry) return null;
  const number = morph.number === 'pl' ? 'pl' : 'sg';
  const grammarCase = morph.case || 'nom';
  const gender = ['m', 'f', 'n'].includes(morph.gender) ? morph.gender : 'm';

  try {
    const { form } = decline(entry, {
      pos: 'adjective',
      case: /** @type {import('./latin-declension.js').CaseCat} */ (grammarCase),
      number,
      gender,
      stripMacrons: true
    });
    return form;
  } catch {
    return null;
  }
}

/**
 * Expand ANATOMICAL labels:
 *  - nouns like "a.", "v.", "ggl.", "rec." (+ plural doubled forms "aa.", "ggll.")
 *  - adjectives like "lat.", "dx.", "sin.", "ext.", "int.", etc. that agree with nearest noun
 */
function expandLatinAbbrevsAuto(s) {
  const toks = String(s).split(/\s+/).filter(Boolean);
  const out = [];
  const nouns = [];
  let head = null;

  const defaultMorph = () => head || nouns[0] || { case: 'nom', number: 'sg', gender: 'm' };

  for (let i = 0; i < toks.length; i++) {
    let token = _latinizeConjunction(_ensureDot(toks[i]));

    // Noun abbreviation?
    if (_isAbbrToken(token)) {
      const base = _canonFrom(token);
      const entry = LATIN_ABBR[base];
      if (!entry) {
        out.push(token);
        continue;
      }

      const num = _isPluralForm(token) ? 'pl' : 'sg';
      let cas = 'gen';
      const prevOutToken = out.length ? out[out.length - 1] : '';
      if (nouns.length > 0 && _isCoordConjToken(prevOutToken)) {
        cas = nouns[nouns.length - 1].case || 'nom';
      } else if (nouns.length === 0) {
        cas = _shouldFirstNounBeGenitive(out) ? 'gen' : 'nom';
      }
      const { form } = decline(entry, {
        pos: 'noun',
        case: /** @type {import('./latin-declension.js').CaseCat} */ (cas),
        number: /** @type {import('./latin-declension.js').NumberCat} */ (num),
        stripMacrons: true
      });
      const emitted = form ? _inheritCase(token, form) : token;
      out.push(emitted);

      const context = {
        case: cas,
        number: num,
        gender: lemmaGender(entry),
        index: out.length - 1,
        key: base
      };
      nouns.push(context);
      if (!head) head = context;
      continue;
    }

    // Adjective?
    const adjKey = _canonAdj(token);
    if (_isAdjToken(token)) {
      let target = nouns.length ? nouns[nouns.length - 1] : defaultMorph();
      if (adjKey === 'dx' || adjKey === 'sin') {
        const coordinated = _coordinatedNounMorphForSideAdj(out, nouns);
        if (coordinated) target = coordinated;
      }
      const agreed = agreeAdjective(adjKey, target || defaultMorph());
      out.push(agreed ? _inheritCase(token, agreed) : token);
      continue;
    }

    // Other token → pass through unchanged.
    out.push(token);
  }

  return out.join(' ');
}

export {
  LATIN_ABBR,
  LATIN_ADJ,
  normalizeLatinLabel,
  expandLatinAbbrevsAuto
};
