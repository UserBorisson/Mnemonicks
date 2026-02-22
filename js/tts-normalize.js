const UNIT_MAP_EN = {
  m: { word: 'meter', plural: 'meters' },
  cm: { word: 'centimeter', plural: 'centimeters' },
  mm: { word: 'millimeter', plural: 'millimeters' },
  nm: { word: 'nanometer', plural: 'nanometers' },
  km: { word: 'kilometer', plural: 'kilometers' },
  s: { word: 'second', plural: 'seconds' },
  ms: { word: 'millisecond', plural: 'milliseconds' },
  min: { word: 'minute', plural: 'minutes' },
  h: { word: 'hour', plural: 'hours' },
  day: { word: 'day', plural: 'days' },
  Hz: { word: 'hertz', plural: 'hertz' },
  kHz: { word: 'kilohertz', plural: 'kilohertz' },
  MHz: { word: 'megahertz', plural: 'megahertz' },
  V: { word: 'volt', plural: 'volts' },
  mV: { word: 'millivolt', plural: 'millivolts' },
  kV: { word: 'kilovolt', plural: 'kilovolts' },
  A: { word: 'ampere', plural: 'amperes' },
  mA: { word: 'milliampere', plural: 'milliamperes' },
  W: { word: 'watt', plural: 'watts' },
  mW: { word: 'milliwatt', plural: 'milliwatts' },
  J: { word: 'joule', plural: 'joules' },
  Pa: { word: 'pascal', plural: 'pascals' },
  kPa: { word: 'kilopascal', plural: 'kilopascals' },
  mmHg: { word: 'millimeter of mercury', plural: 'millimeters of mercury' },
  T: { word: 'tesla', plural: 'teslas' },
  F: { word: 'farad', plural: 'farads' },
  C: { word: 'coulomb', plural: 'coulombs' },
  K: { word: 'kelvin', plural: 'kelvin' },
  mol: { word: 'mole', plural: 'moles' },
  mmol: { word: 'millimole', plural: 'millimoles' },
  M: { word: 'molar', plural: 'molar' },
  mM: { word: 'millimolar', plural: 'millimolar' },
  L: { word: 'liter', plural: 'liters' },
  mL: { word: 'milliliter', plural: 'milliliters' },
  g: { word: 'gram', plural: 'grams' },
  kg: { word: 'kilogram', plural: 'kilograms' },
  mg: { word: 'milligram', plural: 'milligrams' },
  N: { word: 'newton', plural: 'newtons' },
  dB: { word: 'decibel', plural: 'decibels' },
  D: { word: 'diopter', plural: 'diopters' },
  MBq: { word: 'megabecquerel', plural: 'megabecquerels' },
  bpm: { word: 'beats per minute', plural: 'beats per minute' }
};

const UNIT_MAP_CS = {
  m: 'metr',
  cm: 'centimetr',
  mm: 'milimetr',
  nm: 'nanometr',
  km: 'kilometr',
  s: 'sekunda',
  ms: 'milisekunda',
  min: 'minuta',
  h: 'hodina',
  day: 'den',
  Hz: 'hertz',
  kHz: 'kilohertz',
  MHz: 'megahertz',
  V: 'volt',
  mV: 'milivolt',
  kV: 'kilovolt',
  A: 'ampér',
  mA: 'miliampér',
  W: 'watt',
  mW: 'miliwatt',
  J: 'joule',
  Pa: 'pascal',
  kPa: 'kilopascal',
  mmHg: 'milimetr rtuti',
  T: 'tesla',
  F: 'farad',
  C: 'coulomb',
  K: 'kelvin',
  mol: 'mol',
  mmol: 'milimol',
  M: 'molarita',
  mM: 'molarita',
  L: 'litr',
  mL: 'mililitr',
  g: 'gram',
  kg: 'kilogram',
  mg: 'miligram',
  N: 'newton',
  dB: 'decibel',
  D: 'dioptrie',
  MBq: 'megabecquerel',
  bpm: 'tepů za minutu'
};

function normalizeLangCode(lang) {
  if (!lang) return '';
  if (typeof lang === 'string') {
    const raw = lang.trim().toLowerCase();
    if (!raw) return '';
    return raw.split(/[-_]/)[0];
  }
  if (typeof lang === 'object' && !Array.isArray(lang)) {
    if (typeof lang.front === 'string') return normalizeLangCode(lang.front);
    if (typeof lang.back === 'string') return normalizeLangCode(lang.back);
  }
  return '';
}

const SUPER_CHAR_MAP = Object.freeze({
  '⁰': '0',
  '¹': '1',
  '²': '2',
  '³': '3',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
  '⁺': '+',
  '⁻': '-',
  'ⁿ': 'n'
});

const SUB_CHAR_MAP = Object.freeze({
  '₀': '0',
  '₁': '1',
  '₂': '2',
  '₃': '3',
  '₄': '4',
  '₅': '5',
  '₆': '6',
  '₇': '7',
  '₈': '8',
  '₉': '9',
  '₊': '+',
  '₋': '-',
  'ₙ': 'n'
});

function normalizeUnicodeIndexRuns(text) {
  let out = String(text ?? '');
  if (!out) return out;
  out = out.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿ]+/g, (seq) => {
    const normalized = Array.from(seq).map((ch) => SUPER_CHAR_MAP[ch] ?? '').join('');
    return normalized ? `^${normalized}` : seq;
  });
  out = out.replace(/[₀₁₂₃₄₅₆₇₈₉₊₋ₙ]+/g, (seq) => {
    const normalized = Array.from(seq).map((ch) => SUB_CHAR_MAP[ch] ?? '').join('');
    return normalized ? `_${normalized}` : seq;
  });
  return out;
}

function readBraceGroup(text, startIndex) {
  if (!text || text[startIndex] !== '{') return null;
  let depth = 0;
  for (let i = startIndex; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return { value: text.slice(startIndex + 1, i), end: i + 1 };
      }
    }
  }
  return null;
}

function replaceLatexFrac(text) {
  if (!text || text.indexOf('\\frac') === -1) return text;
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('\\frac', i)) {
      let j = i + 5;
      while (j < text.length && /\s/.test(text[j])) j += 1;
      const numGroup = readBraceGroup(text, j);
      if (!numGroup) {
        i += 5;
        continue;
      }
      j = numGroup.end;
      while (j < text.length && /\s/.test(text[j])) j += 1;
      const denGroup = readBraceGroup(text, j);
      if (!denGroup) {
        out += replaceLatexFrac(numGroup.value);
        i = j;
        continue;
      }
      const numText = replaceLatexFrac(numGroup.value);
      const denText = replaceLatexFrac(denGroup.value);
      out += `${numText} / ${denText}`;
      i = denGroup.end;
      continue;
    }
    out += text[i];
    i += 1;
  }
  return out;
}

function stripLatexSyntax(text) {
  if (text == null) return '';
  let out = String(text);
  if (!out) return '';
  out = normalizeUnicodeIndexRuns(out);
  out = out.replace(/\$\$/g, ' ').replace(/\$/g, ' ');
  out = out.replace(/\\\(|\\\)|\\\[|\\\]/g, ' ');
  out = out.replace(/\\\\([A-Za-z])/g, '\\$1');
  out = out.replace(/\\\\(?![A-Za-z])/g, '\n');
  out = out.replace(/\\(quad|qquad|,|;|:|!)/g, ' ');
  out = out.replace(/\\\s+/g, ' ');
  out = out.replace(/\\(d|t)frac/g, '\\frac');
  out = replaceLatexFrac(out);
  out = out.replace(/\\frac\b/g, ' ');
  out = out.replace(/\\sqrt\s*\{([^}]*)\}/g, 'sqrt of $1');
  out = out.replace(/\\(mathrm|text|mathbf|mathit|mathsf|mathbb|mathcal|mathfrak)\s*\{([^}]*)\}/gi, '$2');
  out = out.replace(/\\times/g, ' * ');
  out = out.replace(/\\cdot/g, ' * ');
  out = out.replace(/\\mid/g, ' | ');
  out = out.replace(/\\pm/g, ' +/- ');
  out = out.replace(/\\Delta/g, ' delta ');
  out = out.replace(/\\alpha/g, ' alpha ');
  out = out.replace(/\\beta/g, ' beta ');
  out = out.replace(/\\gamma/g, ' gamma ');
  out = out.replace(/\\delta/g, ' delta ');
  out = out.replace(/\\mu/g, ' mu ');
  out = out.replace(/\\pi/g, ' pi ');
  out = out.replace(/\\Omega/g, ' ohm ');
  out = out.replace(/\\sigma/g, ' sigma ');
  out = out.replace(/\\lambda/g, ' lambda ');
  out = out.replace(/\\phi/g, ' phi ');
  out = out.replace(/\\theta/g, ' theta ');
  out = out.replace(/\\rho/g, ' rho ');
  out = out.replace(/\\nu/g, ' nu ');
  out = out.replace(/\\omega/g, ' omega ');
  out = out.replace(/[πΠ]/g, ' pi ');
  out = out.replace(/[Δδ]/g, ' delta ');
  out = out.replace(/[αΑ]/g, ' alpha ');
  out = out.replace(/[βΒ]/g, ' beta ');
  out = out.replace(/[γΓ]/g, ' gamma ');
  out = out.replace(/[μΜ]/g, ' mu ');
  out = out.replace(/Ω/g, ' ohm ');
  out = out.replace(/ω/g, ' omega ');
  out = out.replace(/[θΘ]/g, ' theta ');
  out = out.replace(/[λΛ]/g, ' lambda ');
  out = out.replace(/[σΣ]/g, ' sigma ');
  out = out.replace(/[ρΡ]/g, ' rho ');
  out = out.replace(/[νΝ]/g, ' nu ');
  out = out.replace(/[φΦ]/g, ' phi ');
  out = out.replace(/\\circ/g, ' deg ');
  out = out.replace(/[°Â°]/g, ' deg ');
  out = out.replace(/[×·]/g, ' * ');
  out = out.replace(/[−–—]/g, '-');
  out = out.replace(/\\left|\\right/g, '');
  out = out.replace(/\\([%_&#])/g, '$1');
  out = out.replace(/\\(?=\d)/g, '');
  out = out.replace(/\^\{([^}]+)\}/g, '^$1');
  out = out.replace(/_\{([^}]+)\}/g, '_$1');
  out = out.replace(/[{}]/g, '');
  out = out.replace(/\\([A-Za-z]+)/g, '$1');
  return out;
}

function parseQuantity(str) {
  if (!str) return null;
  const normalized = String(str).replace(',', '.');
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function getUnitEntry(base, langCode) {
  if (langCode === 'cs') return UNIT_MAP_CS[base] || null;
  return UNIT_MAP_EN[base] || null;
}

function formatExponentEn(exp) {
  const n = Number(exp);
  if (!Number.isFinite(n)) return String(exp);
  if (n < 0) return `negative ${Math.abs(n)}`;
  return String(n);
}

function formatExponentCs(exp, { useOrdinalForSmall = true } = {}) {
  const n = Number(exp);
  if (!Number.isFinite(n)) return String(exp);
  const isNeg = n < 0;
  const abs = Math.abs(n);
  if (useOrdinalForSmall && abs === 2) return isNeg ? 'minus druhou' : 'druhou';
  if (useOrdinalForSmall && abs === 3) return isNeg ? 'minus třetí' : 'třetí';
  const base = String(abs);
  return isNeg ? `minus ${base}` : base;
}

function unitWordEnglish(entry, plural) {
  if (!entry) return '';
  if (!plural) return entry.word;
  return entry.plural || `${entry.word}s`;
}

function unitTokenToSpeech(token, langCode, { plural = false, isDenominator = false } = {}) {
  const match = String(token).match(/^([A-Za-z]+)(?:\^([+-]?\d+))?$/);
  if (!match) return '';
  const base = match[1];
  const expRaw = match[2];
  const exp = expRaw != null ? Number(expRaw) : 1;
  const entry = getUnitEntry(base, langCode);
  if (!entry) return '';

  if (langCode === 'cs') {
    const word = entry;
    if (!Number.isFinite(exp) || exp === 1) return word;
    return `${word} na ${formatExponentCs(expRaw, { useOrdinalForSmall: true })}`;
  }

  const baseWord = unitWordEnglish(entry, plural && !isDenominator);
  if (!Number.isFinite(exp) || exp === 1) return baseWord;
  if (exp === 2 && exp > 0) return `square ${baseWord}`;
  if (exp === 3 && exp > 0) return `cubic ${baseWord}`;
  return `${baseWord} to the power of ${formatExponentEn(expRaw)}`;
}

function parseUnitExpression(raw, langCode, { quantity = null, defaultPlural = false } = {}) {
  if (!raw) return '';
  let token = String(raw).trim();
  if (!token) return '';
  token = token.replace(/[()]/g, '');
  token = token.replace(/\s+/g, '');
  token = token.replace(/[·]/g, '*');
  if (!/^[A-Za-z0-9^*\/+-]+$/.test(token)) return '';

  const parts = token.split('/');
  const numerator = parts[0] ? parts[0].split('*').filter(Boolean) : [];
  const denominator = [];
  for (let i = 1; i < parts.length; i += 1) {
    const segs = parts[i].split('*').filter(Boolean);
    denominator.push(...segs);
  }

  const qty = quantity == null ? null : parseQuantity(quantity);
  const plural = langCode === 'en' ? (qty == null ? defaultPlural : Math.abs(qty) !== 1) : false;

  const numWords = [];
  for (const part of numerator) {
    const word = unitTokenToSpeech(part, langCode, { plural, isDenominator: false });
    if (!word) return '';
    numWords.push(word);
  }
  const denWords = [];
  for (const part of denominator) {
    const word = unitTokenToSpeech(part, langCode, { plural: false, isDenominator: true });
    if (!word) return '';
    denWords.push(word);
  }

  if (!numWords.length && !denWords.length) return '';
  if (!denWords.length) return numWords.join(langCode === 'cs' ? ' krát ' : ' times ');

  const joinDen = langCode === 'cs' ? ' na ' : ' per ';
  const denomPhrase = denWords.join(joinDen);
  const numerPhrase = numWords.length ? numWords.join(langCode === 'cs' ? ' krát ' : ' times ') : '';
  if (!numerPhrase) return denomPhrase;
  return `${numerPhrase}${joinDen}${denomPhrase}`;
}

function normalizeUnits(text, langCode) {
  let out = String(text ?? '');
  if (!out) return out;

  out = out.replace(/\/\s*\(([^)]+)\)/g, (_m, inner) => `/${String(inner).replace(/\s+/g, '*')}`);

  // Do not allow cross-line number+unit matching (e.g. "864\\nM"), which can
  // leak unit parsing between separate math steps.
  const numUnitRe = /(\d+(?:[.,]\d+)?(?:e[+-]?\d+)?)([ \t]*)([A-Za-z][A-Za-z0-9^*\/+-]*)(?!_[A-Za-z0-9])/g;
  out = out.replace(numUnitRe, (match, num, _space, unit) => {
    if (!_space && /^[A-Za-z](?:\^[+-]?\d+)?$/.test(unit)) return match;
    const spoken = parseUnitExpression(unit, langCode, { quantity: num, defaultPlural: false });
    if (!spoken) return match;
    return `${num} ${spoken}`;
  });

  // Handle standalone unit expressions like m^2 or kg/m^3 that are not
  // directly attached to a quantity.
  const standaloneUnitRe = /(^|[ \t(])([A-Za-z][A-Za-z0-9^*\/+-]*[\/^][A-Za-z0-9^*\/+-]*)(?=$|[ \t),.;:])/g;
  out = out.replace(standaloneUnitRe, (match, lead, unitExpr) => {
    const spoken = parseUnitExpression(unitExpr, langCode, {
      quantity: null,
      defaultPlural: langCode === 'en'
    });
    if (!spoken) return match;
    return `${lead}${spoken}`;
  });

  return out;
}

function normalizeSciNotation(text, langCode) {
  let out = String(text ?? '');
  if (!out) return out;
  const timesWord = langCode === 'cs' ? 'kr\u00E1t' : 'times';
  const tenWord = langCode === 'cs' ? 'deset' : 'ten';
  const powerWord = langCode === 'cs' ? 'na' : 'to the power of';

  const expWord = (exp) => (langCode === 'cs'
    ? formatExponentCs(exp, { useOrdinalForSmall: true })
    : formatExponentEn(exp)
  );

  // Keep line boundaries intact by limiting whitespace to spaces/tabs.
  out = out.replace(/(\d+(?:[.,]\d+)?)[ \t]*(?:[x\u00D7*])[ \t]*10[ \t]*\^[ \t]*\(?[ \t]*([+-]?\d+)[ \t]*\)?/gi,
    (_m, num, exp) => `${num} ${timesWord} ${tenWord} ${powerWord} ${expWord(exp)}`
  );
  out = out.replace(/(^|\s)(?:[x\u00D7*])[ \t]*10[ \t]*\^[ \t]*\(?[ \t]*([+-]?\d+)[ \t]*\)?/gi,
    (_m, lead, exp) => `${lead}${timesWord} ${tenWord} ${powerWord} ${expWord(exp)}`
  );
  return out;
}

function normalizeFourDigitCardinals(text, langCode) {
  let out = String(text ?? '');
  if (!out) return out;
  const sep = langCode === 'cs' ? ' ' : ',';
  return out.replace(/(?<![\d.,])(\d{4})(?![\d.,])/g, (_m, digits) => `${digits[0]}${sep}${digits.slice(1)}`);
}

function normalizeMathSpeech(text, langCode, termMap = null) {
  let out = String(text ?? '');
  if (!out) return out;
  out = out.replace(/\\/g, ' ');
  const isCs = langCode === 'cs';
  const words = {
    plus: isCs ? 'plus' : 'plus',
    minus: isCs ? 'minus' : 'minus',
    times: isCs ? 'krát' : 'times',
    over: isCs ? 'děleno' : 'over',
    equals: isCs ? 'rovná se' : 'equals',
    approx: isCs ? 'přibližně' : 'approximately',
    leq: isCs ? 'menší nebo rovno' : 'less than or equal to',
    geq: isCs ? 'větší nebo rovno' : 'greater than or equal to',
    ne: isCs ? 'nerovno' : 'not equal to',
    pm: isCs ? 'plus minus' : 'plus or minus'
  };
  // Ensure function names are detached from following variables, e.g. lnc_ext -> ln c_ext.
  out = out.replace(/([A-Za-z0-9_])(ln|log|sin|cos|tan|exp|sqrt)\b/g, '$1 $2');
  out = out.replace(/\b(ln|log|sin|cos|tan|exp|sqrt)(?=[A-Za-z0-9_])/g, '$1 ');
  // Rejoin tokenized subscripts after latex cleanup (e.g. p_ gamma -> p_gamma).
  out = out.replace(/\b([A-Za-z0-9]+)\s*_\s*([A-Za-z0-9%]+)\b/g, '$1_$2');
  // Separate number-variable adjacency to avoid glued tokens (e.g. 10^-2v).
  out = out.replace(/(?<!_)(\d)([A-Za-z](?:_[A-Za-z0-9%]+)?)/g, '$1 $2');
  // Read ceiling-index notation and summation bounds naturally.
  out = out.replace(/lceil\s*([^,;]+?)\s*rceil/gi, isCs ? 'zaokrouhleno nahoru z $1' : 'ceiling of $1');
  out = out.replace(/\bsum_([A-Za-z])\s*=\s*([0-9.+-]+)\s*\^\s*([0-9.+-]+)/gi, (_m, idx, from, to) => (
    isCs
      ? `součet od ${idx} rovná se ${from} do ${to}`
      : `sum from ${idx} equals ${from} to ${to}`
  ));
  out = out.replace(/\bc\s+NaCl\b/g, 'c_NaCl');
  out = out.replace(/\bi\s+NaCl\b/g, 'i_NaCl');
  out = out.replace(/\bM\s+glc\b/g, 'M_glc');
  out = out.replace(/\bi\s+glc\b/g, 'i_glc');
  out = out.replace(/\bc\s+phys\b/g, 'c_phys');
  out = out.replace(/\bd\s*%/g, 'd_%');
  out = out.replace(/\bRT\b/g, 'R T');
  out = out.replace(/\bzF\b/g, 'z F');
  out = out.replace(/delta\s*_\s*%/gi, isCs ? 'procentuální změna' : 'percent change');
  out = out.replace(/(procentuální změna|percent change)(?=[A-Za-z])/gi, '$1 ');

  const baseSymbolWordMap = isCs ? {
    CO: 'srdeční výdej',
    HR: 'srdeční frekvence',
    SV: 'tepový objem',
    EF: 'ejekční frakce',
    EF_1: 'první ejekční frakce',
    EF_2: 'druhá ejekční frakce',
    EDV: 'end diastolický objem',
    ESV: 'end systolický objem',
    ESV_1: 'první end systolický objem',
    ESV_2: 'druhý end systolický objem',
    NP: 'blízký bod',
    FP: 'daleký bod',
    NA: 'numerická apertura',
    IQR: 'interkvartilové rozpětí',
    CV: 'koeficient variace',
    NPV: 'negativní prediktivní hodnota',
    PPV: 'pozitivní prediktivní hodnota',
    HVL: 'poloviční vrstva',
    HU: 'hounsfieldova jednotka',
    RR: 'R R interval',
    RR_n: 'počet R R intervalů',
    RR_total: 'celková délka R R',
    QRS: 'Q R S komplex',
    Re: 'Reynoldsovo číslo',
    CT: 'C T číslo',
    I_0: 'počáteční intenzita',
    I_t: 'transmitovaná intenzita',
    A_0: 'počáteční aktivita',
    A_t: 'aktivita v čase t',
    A_1: 'A jedna',
    A_2: 'A dve',
    A_a: 'průřez aorty',
    A_p: 'průřez plicnice',
    A_tot: 'celková absorptivita',
    T_2: 'transmise druhé desky',
    p_gamma: 'podíl dávky gama',
    Q_gamma: 'faktor kvality gama',
    Q_n: 'faktor kvality neutronů',
    c_ext: 'vnější koncentrace',
    c_int: 'vnitřní koncentrace',
    c_NaCl: 'koncentrace roztoku chloridu sodného',
    i_NaCl: 'van’t Hoffův faktor chloridu sodného',
    M_glc: 'molární hmotnost glukózy',
    i_glc: 'van’t Hoffův faktor glukózy',
    c_phys: 'fyziologická koncentrace',
    c_1: 'c jedna',
    c_2: 'c dve',
    d_0: 'referenční vzdálenost',
    N_0: 'počáteční počet částic',
    N_1: 'počet částic za vrstvou',
    Q_1: 'první kvartil',
    Q_3: 'třetí kvartil',
    L_1: 'původní hladina',
    H_0: 'nulová hypotéza',
    H_A: 'alternativní hypotéza',
    H_2O: 'voda',
    V_1: 'V jedna',
    V_H2O: 'objem přidané vody',
    V_H_2O: 'objem přidané vody',
    Z_1: 'akustická impedance prostředí jedna',
    Z_2: 'akustická impedance prostředí dvě',
    p_1: 'tlak jedna',
    p_2: 'tlak dve',
    v_1: 'rychlost jedna',
    v_2: 'rychlost dvě',
    v_a: 'rychlost v aortě',
    v_p: 'rychlost v plicnici',
    t_1: 'čas jedna',
    t_2: 'čas dvě',
    n_i: 'počet v intervalu i',
    II: 'svod dva',
    III: 'svod tři'
  } : {
    CO: 'cardiac output',
    HR: 'heart rate',
    SV: 'stroke volume',
    EF: 'ejection fraction',
    EF_1: 'first ejection fraction',
    EF_2: 'second ejection fraction',
    EDV: 'end diastolic volume',
    ESV: 'end systolic volume',
    ESV_1: 'first end systolic volume',
    ESV_2: 'second end systolic volume',
    NP: 'near point',
    FP: 'far point',
    NA: 'numerical aperture',
    IQR: 'interquartile range',
    CV: 'coefficient of variation',
    NPV: 'negative predictive value',
    PPV: 'positive predictive value',
    HVL: 'half value layer',
    HU: 'hounsfield unit',
    RR: 'R R interval',
    RR_n: 'number of R R intervals',
    RR_total: 'total R R length',
    QRS: 'Q R S complex',
    Re: 'reynolds number',
    CT: 'C T number',
    I_0: 'initial intensity',
    I_t: 'transmitted intensity',
    A_0: 'initial activity',
    A_t: 'activity at time t',
    A_1: 'A one',
    A_2: 'A two',
    A_a: 'cross sectional area of aorta',
    A_p: 'cross sectional area of pulmonary artery',
    A_tot: 'total absorption',
    T_2: 'transmission of second board',
    p_gamma: 'gamma dose fraction',
    Q_gamma: 'quality factor of gamma radiation',
    Q_n: 'quality factor of neutrons',
    c_ext: 'external concentration',
    c_int: 'internal concentration',
    c_NaCl: 'sodium chloride concentration',
    i_NaCl: "van 't Hoff factor of sodium chloride",
    M_glc: 'molar mass of glucose',
    i_glc: "van 't Hoff factor of glucose",
    c_phys: 'physiological concentration',
    c_1: 'c one',
    c_2: 'c two',
    d_0: 'reference distance',
    N_0: 'initial particle count',
    N_1: 'particle count behind the layer',
    Q_1: 'first quartile',
    Q_3: 'third quartile',
    L_1: 'initial level',
    H_0: 'null hypothesis',
    H_A: 'alternative hypothesis',
    H_2O: 'water',
    V_1: 'V one',
    V_H2O: 'added water volume',
    V_H_2O: 'added water volume',
    Z_1: 'acoustic impedance of medium one',
    Z_2: 'acoustic impedance of medium two',
    p_1: 'pressure one',
    p_2: 'pressure two',
    v_1: 'velocity one',
    v_2: 'velocity two',
    v_a: 'velocity in aorta',
    v_p: 'velocity in pulmonary artery',
    t_1: 'time one',
    t_2: 'time two',
    n_i: 'count in class i',
    II: 'lead two',
    III: 'lead three'
  };

  const makeLabel = (cs, en) => (isCs ? cs : en);
  const hasToken = (token) => new RegExp(`\\b${token}\\b`).test(out);
  const hasAny = (tokens = []) => tokens.some(hasToken);
  const contextSymbolWordMap = {};
  const setCtx = (token, cs, en) => { contextSymbolWordMap[token] = makeLabel(cs, en); };

  // Reynolds
  if (hasToken('Re') && hasAny(['rho', 'mu', 'r', 'v'])) {
    setCtx('rho', 'hustota', 'density');
    setCtx('mu', 'dynamická viskozita', 'dynamic viscosity');
    setCtx('r', 'poloměr', 'radius');
    setCtx('v', 'rychlost', 'velocity');
    setCtx('A', 'průřez', 'cross sectional area');
  }

  // Microscope magnification
  if (hasAny(['M_obj', 'M_eye'])) {
    setCtx('M', 'zvetseni', 'magnification');
    setCtx('M_obj', 'zvetseni objektivu', 'magnification of objective');
    setCtx('M_eye', 'zvetseni okularu', 'magnification of eyepiece');
  }

  // Nernst
  if (hasToken('U') && hasToken('c_ext') && hasToken('c_int') && hasAny(['R', 'T', 'F'])) {
    setCtx('U', 'Nernstův potenciál', 'Nernst potential');
    setCtx('R', 'molární plynová konstanta', 'molar gas constant');
    setCtx('T', 'absolutní teplota', 'absolute temperature');
    setCtx('z', 'valence iontu', 'ion valence');
    setCtx('F', 'Faradayova konstanta', 'Faraday constant');
  }

  // Osmotic pressure
  if (hasToken('pi') && hasAny(['R', 'T', 'C', 'i'])) {
    setCtx('pi', 'osmotický tlak', 'osmotic pressure');
    setCtx('R', 'molární plynová konstanta', 'molar gas constant');
    setCtx('T', 'teplota', 'temperature');
    setCtx('C', 'látková koncentrace', 'molar concentration');
    setCtx('i', 'van’t Hoffův faktor', "van 't Hoff factor");
  }

  // Molarity / dilution
  if (hasAny(['V_H2O', 'V_H_2O', 'c_1']) && hasAny(['V_1', 'c'])) {
    setCtx('V_1', 'počáteční objem roztoku', 'initial solution volume');
    setCtx('c_1', 'počáteční koncentrace', 'initial concentration');
    setCtx('c', 'cílová koncentrace', 'target concentration');
    setCtx('V', 'objem', 'volume');
    setCtx('m', 'hmotnost látky', 'solute mass');
    setCtx('M', 'molární hmotnost', 'molar mass');
  }
  if (hasAny(['c_NaCl', 'i_NaCl', 'M_glc', 'i_glc'])) {
    setCtx('d_%', 'hmotnostní koncentrace', 'density concentration');
    setCtx('c_NaCl', 'koncentrace chloridu sodného', 'sodium chloride concentration');
    setCtx('i_NaCl', 'van’t Hoffův faktor chloridu sodného', "van 't Hoff factor of sodium chloride");
    setCtx('M_glc', 'molární hmotnost glukózy', 'molar mass of glucose');
    setCtx('i_glc', 'van’t Hoffův faktor glukózy', "van 't Hoff factor of glucose");
  }
  if (hasToken('c_phys') && hasToken('c')) {
    setCtx('c', 'výsledná koncentrace', 'resulting concentration');
    setCtx('m', 'hmotnost látky', 'solute mass');
    setCtx('M', 'molární hmotnost', 'molar mass');
    setCtx('V', 'objem roztoku', 'solution volume');
    setCtx('c_phys', 'fyziologická koncentrace', 'physiological concentration');
  }

  // Cardiac output / hemodynamics
  if (hasAny(['CO', 'HR', 'SV'])) {
    setCtx('CO', 'srdeční výdej', 'cardiac output');
    setCtx('HR', 'srdeční frekvence', 'heart rate');
    setCtx('SV', 'tepový objem', 'stroke volume');
  }
  if (hasAny(['p_1', 'p_2']) || hasAny(['v_1', 'v_2'])) {
    setCtx('p', 'tlak', 'pressure');
    setCtx('v', 'rychlost', 'velocity');
    setCtx('rho', 'hustota krve', 'blood density');
    setCtx('A_1', 'průřez jedna', 'cross sectional area one');
    setCtx('A_2', 'průřez dva', 'cross sectional area two');
  }
  if ((out.includes('percent change') || out.includes('procentuální změna')) && hasAny(['P', 'A'])) {
    setCtx('P', 'tlak', 'pressure');
    setCtx('A', 'průřez', 'cross sectional area');
  }
  if (hasAny(['A_a', 'A_p', 'v_a', 'v_p'])) {
    setCtx('Q', 'objemový průtok', 'volumetric flow rate');
    setCtx('A_a', 'průřez aorty', 'cross sectional area of aorta');
    setCtx('A_p', 'průřez plicnice', 'cross sectional area of pulmonary artery');
    setCtx('v_a', 'rychlost v aortě', 'velocity in aorta');
    setCtx('v_p', 'rychlost v plicnici', 'velocity in pulmonary artery');
  }
  if (hasToken('L_1') && hasAny(['L', 'N'])) {
    setCtx('L', 'hladina zvuku', 'sound level');
    setCtx('L_1', 'počáteční hladina zvuku', 'initial sound level');
    setCtx('N', 'počet stejných zdrojů', 'number of identical sources');
  }

  // Optics / photons / x-ray / de Broglie
  if (hasToken('E') && hasAny(['h', 'lambda'])) {
    setCtx('E', 'energie fotonu', 'photon energy');
    setCtx('h', 'Planckova konstanta', 'Planck constant');
    setCtx('c', 'rychlost světla', 'speed of light');
    setCtx('lambda', 'vlnová délka', 'wavelength');
  }
  if (hasAny(['cNh', 'IAt'])) {
    setCtx('cNh', 'c krát N krát h', 'c times N times h');
    setCtx('IAt', 'I krát A krát t', 'I times A times t');
    setCtx('N', 'počet fotonů', 'number of photons');
    setCtx('I', 'intenzita', 'intensity');
    setCtx('A', 'plocha', 'area');
    setCtx('t', 'čas', 'time');
    setCtx('h', 'Planckova konstanta', 'Planck constant');
    setCtx('c', 'rychlost světla', 'speed of light');
    setCtx('lambda', 'vlnová délka', 'wavelength');
  }
  if (hasToken('E_max') || (hasToken('e') && hasToken('U') && hasAny(['10^3', '10 ^ 3']))) {
    setCtx('e', 'elementární náboj', 'elementary charge');
    setCtx('U', 'anodové napětí', 'anode voltage');
  }
  if (hasToken('lambda') && hasAny(['m', 'e', 'U', 'h'])) {
    setCtx('m', 'hmotnost elektronu', 'electron mass');
    setCtx('e', 'elementární náboj', 'elementary charge');
    setCtx('U', 'urychlovací napětí', 'accelerating voltage');
    setCtx('h', 'Planckova konstanta', 'Planck constant');
  }
  if (hasToken('Z') && hasAny(['rho', 'c'])) {
    setCtx('Z', 'akustická impedance', 'acoustic impedance');
    setCtx('rho', 'hustota prostředí', 'medium density');
    setCtx('c', 'rychlost zvuku', 'speed of sound');
  }

  // Ultrasound interface
  if (hasToken('I_t') && hasToken('I_0') && hasAny(['c_1', 'c_2'])) {
    setCtx('I_0', 'dopadající intenzita', 'incident intensity');
    setCtx('I_t', 'transmitovaná intenzita', 'transmitted intensity');
    setCtx('c_1', 'rychlost zvuku v prostředí jedna', 'speed of sound in medium one');
    setCtx('c_2', 'rychlost zvuku v prostředí dva', 'speed of sound in medium two');
  }
  if (hasToken('A_tot') && hasToken('T_2')) {
    setCtx('A_1', 'absorpce první desky', 'absorption of first board');
    setCtx('T_2', 'transmise druhé desky', 'transmission of second board');
    setCtx('A_tot', 'celková absorpce', 'total absorption');
  }

  // Attenuation / CT
  if (hasToken('CT') && hasAny(['N_0', 'N_1', 'mu'])) {
    setCtx('mu', 'lineární koeficient zeslabení', 'linear attenuation coefficient');
    setCtx('d', 'tloušťka vrstvy', 'layer thickness');
    setCtx('N_0', 'hustota toku před vrstvou', 'particle flow density in front of layer');
    setCtx('N_1', 'hustota toku za vrstvou', 'particle flow density behind layer');
  }
  if (hasToken('H') && hasToken('Q_n') && hasAny(['p_gamma', 'Q_gamma', 'D'])) {
    setCtx('H', 'dávkový ekvivalent', 'dose equivalent');
    setCtx('D', 'celková absorbovaná dávka', 'total absorbed dose');
  }

  // Radioactivity
  if (hasToken('lambda') && hasAny(['A_1', 'A_2', 't_1', 't_2'])) {
    setCtx('lambda', 'rozpadová konstanta', 'decay constant');
    setCtx('A_1', 'aktivita v čase jedna', 'activity at time one');
    setCtx('A_2', 'aktivita v čase dva', 'activity at time two');
    setCtx('t_1', 'čas jedna', 'time one');
    setCtx('t_2', 'čas dva', 'time two');
  }
  if (hasToken('A_0') && hasToken('A_t')) {
    setCtx('A_0', 'počáteční aktivita', 'initial activity');
    setCtx('A_t', 'aktivita v čase t', 'activity at time t');
  }

  // Statistics / probability
  if (out.includes('P(') || hasAny(['alpha', 'beta', 'Se', 'Sp'])) {
    setCtx('P', 'pravděpodobnost', 'probability');
    setCtx('Se', 'senzitivita', 'sensitivity');
    setCtx('Sp', 'specificita', 'specificity');
  }

  const customSymbolWordMap = {};
  if (termMap && typeof termMap === 'object' && !Array.isArray(termMap)) {
    for (const [token, value] of Object.entries(termMap)) {
      if (!token) continue;
      if (typeof value === 'string' && value.trim()) {
        customSymbolWordMap[token] = value.trim();
        continue;
      }
      if (value && typeof value === 'object') {
        const preferred = isCs ? (value.cs ?? value.cz ?? value.en) : (value.en ?? value.cs ?? value.cz);
        if (typeof preferred === 'string' && preferred.trim()) {
          customSymbolWordMap[token] = preferred.trim();
        }
      }
    }
  }

  const hasCustomTermMap = Object.keys(customSymbolWordMap).length > 0;
  const symbolWordMap = hasCustomTermMap
    ? customSymbolWordMap
    : { ...baseSymbolWordMap, ...contextSymbolWordMap };
  const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const functionTokens = new Set(['ln', 'log', 'sin', 'cos', 'tan', 'exp', 'sqrt']);

  // Infer implicit multiplication between adjacent symbolic tokens (e.g. Re mu / rho v).
  const implicitMulTokens = Object.keys(symbolWordMap)
    .filter(token => /^[A-Za-z][A-Za-z0-9_]*$/.test(token))
    .filter(token => !functionTokens.has(token.toLowerCase()))
    .sort((a, b) => b.length - a.length);
  if (implicitMulTokens.length) {
    const symbolAlt = implicitMulTokens.map(escapeRegExp).join('|');
    const symbolTerm = `\\b(?:${symbolAlt})\\b`;
    const numberTerm = '(?:\\d+(?:[.,]\\d+)?(?:e[+-]?\\d+)?)';
    const leftTerm = `(?:${symbolTerm}|${numberTerm}|\\)|\\])`;
    const rightTerm = `(?:${symbolTerm}|${numberTerm}|\\(|\\[)`;
    const implicitMulRe = new RegExp(`(${leftTerm})[ \\t]+(?=${rightTerm})`, 'g');
    out = out.replace(implicitMulRe, '$1 * ');
    const fnAlt = Array.from(functionTokens).join('|');
    const fnMulRe = new RegExp(`(${leftTerm})[ \\t]+(?=(?:${fnAlt})\\b)`, 'gi');
    out = out.replace(fnMulRe, '$1 * ');
  }

  const symbolEntries = Object.entries(symbolWordMap).sort((a, b) => b[0].length - a[0].length);
  const placeholderPairs = [];
  symbolEntries.forEach(([token, spoken], idx) => {
    const safeWord = /^[A-Za-z0-9_]+$/.test(token);
    const re = safeWord
      ? new RegExp(`\\b${escapeRegExp(token)}\\b`, 'g')
      : new RegExp(escapeRegExp(token), 'g');
    const placeholder = `\uE000${idx}\uE001`;
    placeholderPairs.push([placeholder, spoken]);
    out = out.replace(re, placeholder);
  });
  for (const [placeholder, spoken] of placeholderPairs) {
    out = out.split(placeholder).join(spoken);
  }
  const indexPhrase = isCs ? 's indexem' : 'with index';
  out = out.replace(/\b([A-Za-z]+)_([A-Za-z0-9]+)\b/g, (match, baseToken, idxToken) => {
    const baseSpoken = symbolWordMap[baseToken];
    if (!baseSpoken) return match;
    const idxSpoken = symbolWordMap[idxToken] || idxToken;
    return `${baseSpoken} ${indexPhrase} ${idxSpoken}`;
  });

  const keepTokens = new Set([
    'pi', 'alpha', 'beta', 'gamma', 'delta', 'mu', 'rho', 'theta',
    'lambda', 'omega', 'sigma', 'nu', 'phi', 'ohm', 'deg', 'sqrt',
    'sin', 'cos', 'tan', 'log', 'ln', 'exp'
  ]);
  const shouldSpellToken = (token) => {
    if (!token || token.length < 2) return false;
    const lower = token.toLowerCase();
    if (keepTokens.has(lower)) return false;
    const upperCount = (token.match(/[A-Z]/g) || []).length;
    if (upperCount >= 2) return true;
    if (/^[A-Z]+$/.test(token)) return true;
    return false;
  };
  const spellToken = (token) => token.split('').join(' ');

  out = out.replace(/([A-Za-z]{2,})(?=[=+\-*/()])/g, (match) => {
    if (!shouldSpellToken(match)) return match;
    return spellToken(match);
  });
  out = out.replace(/([=+\-*/()])([A-Za-z]{2,})/g, (match, op, token) => {
    if (!shouldSpellToken(token)) return `${op}${token}`;
    return `${op}${spellToken(token)}`;
  });
  out = out.replace(/(\d)([A-Za-z]{2,})/g, (match, num, token) => {
    if (!shouldSpellToken(token)) return match;
    return `${num} ${spellToken(token)}`;
  });
  const lnPhrase = isCs ? 'prirozeny logaritmus z' : 'natural log of';
  out = out.replace(/\bln\s*\(\s*([^()]+)\s*\)/gi, `${lnPhrase} $1`);
  out = out.replace(/\bln\b/gi, lnPhrase);
  out = out.replace(/\|/g, isCs ? ' při ' : ' given ');

  out = out.replace(/\+\/-|±/g, ` ${words.pm} `);
  out = out.replace(/≤/g, ` ${words.leq} `);
  out = out.replace(/≥/g, ` ${words.geq} `);
  out = out.replace(/≈/g, ` ${words.approx} `);
  out = out.replace(/≠/g, ` ${words.ne} `);
  out = out.replace(/=/g, ` ${words.equals} `);

  const sayExponentNumber = (baseRaw, expRaw) => {
    const base = String(baseRaw).trim();
    const exp = Number(expRaw);
    if (Number.isFinite(exp) && exp > 0 && exp === 2) {
      return isCs ? `${base} na ${formatExponentCs('2', { useOrdinalForSmall: true })}` : `${base} squared`;
    }
    if (Number.isFinite(exp) && exp > 0 && exp === 3) {
      return isCs ? `${base} na ${formatExponentCs('3', { useOrdinalForSmall: true })}` : `${base} cubed`;
    }
    const expWord = isCs ? formatExponentCs(expRaw, { useOrdinalForSmall: true }) : formatExponentEn(expRaw);
    return isCs
      ? `${base} na ${expWord}`
      : `${base} to the power of ${expWord}`;
  };

  const sayExponentSymbol = (baseRaw, expRaw) => {
    const base = String(baseRaw).trim();
    const expLower = String(expRaw).toLowerCase();
    if (expLower === 'deg' || expLower === 'degree' || expLower === 'degrees') {
      return isCs ? `${base} stup\u0148\u016f` : `${base} degrees`;
    }
    return isCs
      ? `${base} na ${expRaw}`
      : `${base} to the power of ${expRaw}`;
  };

  // Handle exponentiation for parenthesized bases before bare-token bases.
  out = out.replace(/\(\s*([^()]+?)\s*\)\s*\^\s*([+-]?\d+)\b/g, (_m, base, expRaw) => sayExponentNumber(base, expRaw));
  out = out.replace(/(\b[\w]+)\s*\^\s*([+-]?\d+)\b/g, (_m, base, expRaw) => sayExponentNumber(base, expRaw));

  out = out.replace(/\(\s*([^()]+?)\s*\)\s*\^\s*([A-Za-z]+)\b/g, (_m, base, expRaw) => sayExponentSymbol(base, expRaw));
  out = out.replace(/(\b[\w]+)\s*\^\s*([A-Za-z]+)\b/g, (_m, base, expRaw) => sayExponentSymbol(base, expRaw));

  out = out.replace(/([A-Za-z0-9])\s*\+\s*([A-Za-z0-9])/g, `$1 ${words.plus} $2`);
  out = out.replace(/([A-Za-z0-9])\s*-\s*([A-Za-z0-9])/g, `$1 ${words.minus} $2`);
  out = out.replace(/([A-Za-z0-9])\s*[*×·]\s*([A-Za-z0-9])/g, `$1 ${words.times} $2`);
  out = out.replace(/([A-Za-z0-9])\s*\/\s*([A-Za-z0-9])/g, `$1 ${words.over} $2`);

  out = out.replace(/(^|[\s\(\[])-(?=\d)/g, `$1${isCs ? 'minus' : 'negative'} `);
  out = out.replace(/\s+\+\s+/g, ` ${words.plus} `);
  out = out.replace(/\s+-\s+/g, ` ${words.minus} `);
  out = out.replace(/\s*[*×·]\s*/g, ` ${words.times} `);
  out = out.replace(/\btimes\s*-\s*times\b/g, words.minus);
  out = out.replace(/\b(?:times\s+){2,}/g, 'times ');
  out = out.replace(/\b(?:krát\s+){2,}/g, 'krát ');
  out = out.replace(/\s*\/\s*/g, ` ${words.over} `);

  out = out.replace(/\bdeg\b/g, isCs ? 'stup\u0148\u016f' : 'degrees');
  out = out.replace(/_/g, ' ');
  const percentChangePhrase = isCs ? 'procentuální změna' : 'percent change';
  const pctEsc = escapeRegExp(percentChangePhrase);
  out = out.replace(new RegExp(`\\b(${pctEsc})(?:\\s+\\1)+\\b`, 'gi'), '$1');
  out = out.replace(/\bdelta\s+times\s+%\s+times/gi, isCs ? 'procentuální změna' : 'percent change');
  out = out.replace(/\bdelta\s+%/gi, isCs ? 'procentuální změna' : 'percent change');
  out = out.replace(/%(?=[A-Za-z])/g, '% ');
  out = normalizeFourDigitCardinals(out, langCode);
  return out;
}

function collapseWhitespace(text) {
  return String(text ?? '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export function normalizeTtsText(text, { lang, termMap } = {}) {
  const langCode = normalizeLangCode(lang) || 'en';
  let out = stripLatexSyntax(text);
  out = normalizeSciNotation(out, langCode);
  out = normalizeUnits(out, langCode);
  out = normalizeMathSpeech(out, langCode, termMap);
  out = collapseWhitespace(out);
  return out;
}

export { normalizeLangCode, stripLatexSyntax };
