/**
 * Expand Rx / clinical abbreviations and multi-token phrases.
 * Keep this phrase-level pass separate from the anatomical morphology pass.
 * All outputs are Latin (no Czech).
 */

const RX_MAP = [
  // --- prescription "verbs" & stock phrases ---
  { rx: /\bRp\.?\b/gi, out: 'Recipe' },
  { rx: /\bD\.?\s*S\.?\b/gi, out: 'Da, signa' },
  { rx: /\bS\.?\b/gi, out: 'Signa' },
  { rx: /\bD\.?\b/gi, out: 'Da' },
  { rx: /\bD\.?\s*ad\s*vitr\.?\b/gi, out: 'Da ad vitrum' },

  // --- ad + accusative helpers ---
  { rx: /\bad\s*caps\.?\b/gi, out: 'ad capsulas' },
  { rx: /\bad\s*caps\.?\s*gelat\.?\b/gi, out: 'ad capsulas gelatinosas' },

  // --- preparation nouns ---
  { rx: /\bemuls\.?\b/gi, out: 'emulsio' },
  { rx: /\bsol\.?\b/gi, out: 'solutio' },
  { rx: /\bsusp\.?\b/gi, out: 'suspensio' },
  { rx: /\bsupp\.?\b/gi, out: 'suppositorium' },
  { rx: /\btinct\.?\b/gi, out: 'tinctura' },
  { rx: /\bung\.?\b/gi, out: 'unguentum' },
  { rx: /\bplv\.?\b/gi, out: 'pulvis' },
  { rx: /\bpil\.?\b/gi, out: 'pilula' },
  { rx: /\btab(?:\(l\))?\.?|tbl\.?/gi, out: 'tabulettae' },

  // --- quantities / frequency ---
  { rx: /\baa\.?\b/gi, out: 'ana partes aequales', lowerCaseOnly: true },
  { rx: /\bb\.?\s*d\.?\b/gi, out: 'bis die' },
  { rx: /\bq\.?\s*s\.?\b/gi, out: 'quantum satis' },
  { rx: /\bp\.?\s*d\.?\b/gi, out: 'pro dosi' },
  { rx: /\bp\.?\s*die\b/gi, out: 'pro die' },
  { rx: /\bNo\.?\b/gi, out: 'numero' },

  // --- routes ---
  { rx: /\bp\.?o\.?\b/gi, out: 'per os' },
  { rx: /\bi\.?m\.?\b/gi, out: 'intramuscularis' },
  { rx: /\bi\.?v\.?\b/gi, out: 'intravenosus' },
  { rx: /\bs\.?c\.?\b/gi, out: 'subcutaneus' },

  // --- misc. clinical ---
  { rx: /\bdg\.?\b/gi, out: 'diagnosis' },
  { rx: /\bgr\.?\b/gi, out: 'gradus' },
  { rx: /\bca\b/gi, out: 'carcinoma' },
  { rx: /\bv\.?\s*s\.?\b/gi, out: 'verisimiliter' },

  // --- containers, originals ---
  { rx: /\bExp\.?orig\.?\b/gi, out: 'expeditio originalis' },
  { rx: /\bvitr\.?\b/gi, out: 'vitrum' }
];

const TRAILING_CLEANUPS = (() => {
  const uniques = Array.from(new Set(RX_MAP.map((item) => item.out)));
  const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return uniques.map((phrase) => new RegExp(`${escapeRegex(phrase)}\\.(?=\\s|$)`, 'g'));
})();

const RX_PLACEHOLDER_PREFIX = '\uE000RX';
const RX_PLACEHOLDER_SUFFIX = '\uE001';

function applyTrailingCleanups(text) {
  let out = String(text);
  for (const pattern of TRAILING_CLEANUPS) {
    out = out.replace(pattern, (match) => match.slice(0, -1));
  }
  return out;
}

/** Expand all matches conservatively (no double-replacement loops). */
function expandRxAbbrevs(text) {
  let out = String(text);
  for (const { rx, out: replacement, lowerCaseOnly } of RX_MAP) {
    out = out.replace(rx, (match) => {
      if (lowerCaseOnly && match !== match.toLowerCase()) {
        return match;
      }
      return replacement;
    });
  }
  return applyTrailingCleanups(out);
}

function replaceRxWithPlaceholders(text) {
  let out = String(text);
  const placeholders = [];
  for (const { rx, out: replacement, lowerCaseOnly } of RX_MAP) {
    out = out.replace(rx, (match) => {
      if (lowerCaseOnly && match !== match.toLowerCase()) {
        return match;
      }
      const placeholder = `${RX_PLACEHOLDER_PREFIX}${placeholders.length}${RX_PLACEHOLDER_SUFFIX}`;
      placeholders.push(replacement);
      return placeholder;
    });
  }
  return { text: out, placeholders };
}

function restoreRxPlaceholders(text, placeholders) {
  let out = String(text);
  placeholders.forEach((replacement, index) => {
    const placeholder = `${RX_PLACEHOLDER_PREFIX}${index}${RX_PLACEHOLDER_SUFFIX}`;
    out = out.split(placeholder).join(replacement);
  });
  return applyTrailingCleanups(out);
}

export { expandRxAbbrevs, replaceRxWithPlaceholders, restoreRxPlaceholders };
