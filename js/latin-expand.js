import { expandRxAbbrevs, replaceRxWithPlaceholders, restoreRxPlaceholders } from './latin-rx.js';
import { normalizeLatinLabel, expandLatinAbbrevsAuto } from './latin-abbr.js';

function stripCutMarkers(text) {
  return String(text)
    .replace(/\s*\(\s*cut\s*\)\s*/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function _inheritTokenCase(src, dstLower) {
  if (String(src) === String(src).toUpperCase()) return dstLower.toUpperCase();
  if (/^[A-Z]/.test(String(src))) return dstLower.charAt(0).toUpperCase() + dstLower.slice(1);
  return dstLower;
}

function _toFemNomPlural(token) {
  const raw = String(token || '');
  const lower = raw.toLowerCase();
  if (!lower || /[\d]/.test(lower)) return raw;
  if (lower.endsWith('ae') || lower.endsWith('es') || lower.endsWith('iores')) return raw;
  if (lower === 'dextra') return _inheritTokenCase(raw, 'dextrae');
  if (lower === 'sinistra') return _inheritTokenCase(raw, 'sinistrae');
  if (lower.endsWith('ior')) return _inheritTokenCase(raw, `${lower}es`);
  if (lower.endsWith('is')) return _inheritTokenCase(raw, `${lower.slice(0, -2)}es`);
  if (lower.endsWith('a')) return _inheritTokenCase(raw, `${lower}e`);
  if (lower.endsWith('us')) return _inheritTokenCase(raw, `${lower.slice(0, -2)}ae`);
  return raw;
}

function pluralizeArteriaVenaDescriptorChains(text) {
  return String(text).replace(
    /\b(Arteria)\s+et\s+(Vena)\s+([A-Za-z\u00C0-\u024F]+(?:\s+[A-Za-z\u00C0-\u024F]+){0,6})/g,
    (_m, left, right, descriptorChain) => {
      const pluralized = String(descriptorChain)
        .split(/\s+/)
        .filter(Boolean)
        .map(_toFemNomPlural)
        .join(' ');
      return `${left} et ${right} ${pluralized}`;
    }
  );
}

export function expandLatinAll(input) {
  const { text: protectedInput, placeholders } = replaceRxWithPlaceholders(input);
  const normalized = normalizeLatinLabel(protectedInput);
  const anatomical = expandLatinAbbrevsAuto(normalized);
  const withRxRestored = restoreRxPlaceholders(anatomical, placeholders);
  const expanded = expandRxAbbrevs(withRxRestored);
  const withoutCut = stripCutMarkers(expanded);
  return pluralizeArteriaVenaDescriptorChains(withoutCut);
}
