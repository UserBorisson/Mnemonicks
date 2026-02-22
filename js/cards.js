import { removeMacrons } from './latin-declension.js';
import { generateDeckForPath, isGeneratorPath } from './practice-generators.js?v=20260211';

// cards.js
// Handles loading, expansion, shuffling, and prepping cards

const AGREEMENT_CASES = ['nom_sg', 'gen_sg', 'acc_sg', 'abl_sg', 'nom_pl', 'acc_pl'];
const GENITIVE_PATTERNS = [
  { head: 'nom_sg', tail: 'gen_sg', label: 'Nom. sg. + Gen. sg.' },
  { head: 'nom_pl', tail: 'gen_pl', label: 'Nom. pl. + Gen. pl.' }
];
const LATIN_VOCAB_POS = new Set(['noun', 'adjective', 'phrase', 'preposition', 'particle']); // kept for legacy; now optional
const ANATOMY_KEYWORDS = [
  'artery', 'vein', 'aorta', 'auricle', 'ear', 'axilla', 'armpit', 'bursa', 'sac', 'clavicle',
  'scapula', 'shoulder', 'line', 'ridge', 'crest', 'notch', 'incision', 'column', 'spine',
  'vertebra', 'fascia', 'band', 'membrane', 'mucosa', 'tissue', 'substance', 'matter', 'tongue',
  'breast', 'gland', 'marrow', 'medulla', 'palate', 'eyelid', 'papilla', 'nipple', 'patella',
  'kneecap', 'rib', 'fibula', 'ulna', 'tibia', 'maxilla', 'mandible', 'uvula', 'vagina', 'bladder',
  'gallbladder', 'valve', 'portal', 'tube', 'tunic', 'layer', 'tonsil', 'sclera', 'areola',
  'groove', 'fissure', 'fossa', 'pit', 'eminence', 'linea', 'suture', 'conjunctiva', 'slit', 'duct'
];
const ADJECTIVE_KEYWORDS = [
  'gluteal', 'iliac', 'iliopubic', 'hepatic', 'meningeal', 'salivary', 'coccygeal', 'coronary',
  'corneal', 'biliary', 'gall', 'internal', 'external', 'deep', 'middle', 'broad', 'wide', 'gray',
  'white', 'submucosal', 'systemic', 'urinary', 'uterine', 'pharyngeal', 'transverse', 'infraspinous',
  'supraspinous', 'thoracic', 'palatine', 'oblong', 'concave', 'hollow'
];
const PLACEHOLDER_RE = /[\uFFFD]/;
const DRILL_STYLE = {
  SINGLE: 'single',
  NOUN_ADJ: 'noun_adj',
  PHRASE: 'phrase',
  SENTENCE: 'sentence'
};
const DRILL_LEVEL = {
  SINGLE: 1,
  PAIR: 2,
  PHRASE: 3,
  EXTENDED: 4,
  SENTENCE: 5
};
const DRILL_LEVEL_BY_NAME = {
  single: DRILL_LEVEL.SINGLE,
  pair: DRILL_LEVEL.PAIR,
  phrase: DRILL_LEVEL.PHRASE,
  extended: DRILL_LEVEL.EXTENDED,
  sentence: DRILL_LEVEL.SENTENCE
};
function levelFromWordCount(count = 0) {
  if (count >= 5) return DRILL_LEVEL.SENTENCE;
  if (count === 4) return DRILL_LEVEL.EXTENDED;
  if (count === 3) return DRILL_LEVEL.PHRASE;
  if (count === 2) return DRILL_LEVEL.PAIR;
  return DRILL_LEVEL.SINGLE;
}
function normalizeDrillLevel(value, fallback = DRILL_LEVEL.SINGLE) {
  if (typeof value === 'string') {
    const mapped = DRILL_LEVEL_BY_NAME[value.trim().toLowerCase()];
    if (mapped) return mapped;
  }
  const num = Number(value);
  if (Number.isFinite(num) && num >= DRILL_LEVEL.SINGLE && num <= DRILL_LEVEL.SENTENCE) {
    return num;
  }
  return fallback;
}
const LATIN_MCQ_LIMIT = 6;


/**
 * Load cards from JSON and prepare for app.
 *  - Expands "diagram" entries into 1 card per label (image-occlusion)
 *  - Builds specialized decks (e.g., latin drills) from lexicon configs
 *  - Shuffles MCQ answers if needed (optional) and remaps correct_indices
 */
export async function loadCards({ shuffleAnswers = false, deckPath } = {}) {
  const url = deckPath || 'cards.json';
  let deckData = null;
  if (isGeneratorPath(url)) {
    deckData = generateDeckForPath(url);
  } else {
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`Failed to load deck: ${url} (${resp.status})`);
    }
    const raw = await resp.text();
    const trimmed = raw.trim();
    if (!trimmed) {
      deckData = [];
    } else {
      try {
        deckData = JSON.parse(raw);
      } catch (err) {
        throw new Error(`Failed to parse deck: ${url} (${err?.message || err})`);
      }
    }
  }

  if (isLatinDrillDeck(deckData)) {
    deckData = buildLatinDrillCards(deckData);
  }

  let deck;
  if (Array.isArray(deckData)) {
    deck = deckData.slice();
  } else if (Array.isArray(deckData?.cards)) {
    deck = deckData.cards.slice();
  } else if (deckData && typeof deckData === 'object' && Object.keys(deckData).length === 0) {
    deck = [];
  } else {
    throw new Error('Unsupported deck schema');
  }

  // Expand diagram entries -> atomic cards
  deck = expandDiagrams(deck);

  // Validate new-schema cards at runtime (non-fatal warnings)
  try { validateDeckSchema(deck); } catch {}

  // Optionally, shuffle MCQ answers and remap correct_indices
  if (shuffleAnswers) {
    deck = deck.map(card => {
      if (Array.isArray(card.answers) && Array.isArray(card.correct_indices)) {
        const { shuffledAnswers, remappedIndices } =
          shuffleAnswersWithIndices(card.answers, card.correct_indices);
        return {
          ...card,
          answers: shuffledAnswers,
          correct_indices: remappedIndices
        };
      }
      return card;
    });
  }

  return deck;
}

/**
 * Expands any "diagram" objects into per-label cards with mask metadata.
 * Schema (source item):
 * {
 *   id: "medulla spinalis",
 *   type: "diagram",
 *   image: "img/medulla_spinalis.png",
 *   labels: [{ key, name, accept[], region: {shape:'rect'| 'poly', ...} }, ...]
 * }
 */
export function expandDiagrams(deck) {
  const out = [];
  for (const card of deck) {
    const labels = Array.isArray(card.labels) ? card.labels : null;
    const isDiagram = card.type === 'diagram' && card.image && labels;

    if (!isDiagram) {
      out.push(card);
      continue;
    }

    const img = card.image;
    const names = labels.map(l => l.name);
    const regions = labels.map(l => normalizeRegion(l.region));
    const ttsCfg = (card.tts && typeof card.tts === 'object') ? card.tts : {};
    const baseReadFront = ttsCfg.readFront;
    const baseReadBack = ttsCfg.readBack;

    labels.forEach((lbl, i) => {
      const answers = names.slice();
      let correctIndex = answers.findIndex(a => a === lbl.name);
      if (correctIndex === -1) { answers.push(lbl.name); correctIndex = answers.length - 1; }

      const expanded = {
        id: `${card.id ?? 'diagram'}:${lbl.key ?? i}`,
        front: card.front ?? 'Which structure is highlighted?',
        back: lbl.name,
        accept: Array.isArray(lbl.accept) && lbl.accept.length ? [lbl.name, ...lbl.accept] : [lbl.name],
        answers,
        correct_indices: [correctIndex],
        image: img,
        imageFront: card.imageFront ?? img,
        imageBack:  card.imageBack  ?? img,
        mask: { regions, activeIndex: i },
        lang: card.lang,

        // carry FSRS/meta transparently if present
        due: card.due ?? null,
        lastReviewed: card.lastReviewed ?? null,
        state: card.state ?? 'New',
        reps: card.reps ?? 0,
        lapses: card.lapses ?? 0,
        learning_steps: card.learning_steps ?? 0,
        scheduled_days: card.scheduled_days ?? 0,
        elapsed_days: card.elapsed_days ?? 0,
        stability: card.stability ?? 1,
        difficulty: card.difficulty ?? 4,
        tags: card.tags ?? []
      };

      const childTts = {
        readFront: baseReadFront !== undefined ? !!baseReadFront : false,
        readBack: baseReadBack !== undefined ? !!baseReadBack : true
      };
      expanded.tts = childTts;

      out.push(expanded);
    });
  }
  return out;
}

// ---- Runtime validator for new schema (non-fatal) ----
function isStr(v) { return typeof v === 'string'; }
function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
function isStrArr(a) { return Array.isArray(a) && a.every(isStr); }
function isMcqOptionEntry(v) {
  if (isStr(v)) return true;
  if (!isObj(v)) return false;
  if (!isStr(v.text) && !isStr(v.value)) return false;
  if (v.key != null && !isStr(v.key)) return false;
  if (v.label != null && !isStr(v.label)) return false;
  return true;
}
function isMcqOptions(v) {
  if (Array.isArray(v)) return v.every(isMcqOptionEntry);
  if (isObj(v)) return Object.values(v).every(isStr);
  return false;
}

export function validateDeckSchema(deck) {
  if (!Array.isArray(deck)) return true;
  for (const c of deck) {
    if (!Array.isArray(c?.correct)) continue; // legacy or diagram-expanded
    const errs = [];
    if (!isStr(c.id) || !String(c.id).trim()) errs.push('id');
    if (!isStr(c.front)) errs.push('front');
    if (!isStr(c.back)) errs.push('back');
    if (!isStrArr(c.correct) || c.correct.length === 0) errs.push('correct[]');
    if (c.accept != null && !isStrArr(c.accept)) errs.push('accept[]');
    if (c.tags != null && !isStrArr(c.tags)) errs.push('tags[]');
    if (c.lang != null && !(isStr(c.lang) || isObj(c.lang))) errs.push('lang');
    if (isObj(c.lang)) {
      if (c.lang.front != null && !isStr(c.lang.front)) errs.push('lang.front');
      if (c.lang.back != null && !isStr(c.lang.back)) errs.push('lang.back');
    }
    if (c.meta != null && (typeof c.meta !== 'object' || Array.isArray(c.meta))) errs.push('meta');
    if (c.archetype != null && !isStr(c.archetype)) errs.push('archetype');
    if (c.mcqOptions != null && !isMcqOptions(c.mcqOptions)) errs.push('mcqOptions');
    if (c.mcqCorrect != null && !isStrArr(c.mcqCorrect)) errs.push('mcqCorrect');
    if (c.mcq != null) {
      if (!isObj(c.mcq)) errs.push('mcq');
      else {
        if (c.mcq.options != null && !isMcqOptions(c.mcq.options)) errs.push('mcq.options');
        if (c.mcq.correct != null && !isStrArr(c.mcq.correct)) errs.push('mcq.correct');
      }
    }
    if (errs.length) {
      console.warn('Card failed schema checks:', { id: c.id, fields: errs });
    }
  }
  return true;
}

function normalizeRegion(region = {}) {
  if (region.shape === 'poly' && Array.isArray(region.points)) {
    return { shape: 'poly', points: region.points };
  }
  const { x = 0, y = 0, w = Math.max(1, region.w ?? region.width ?? 1), h = Math.max(1, region.h ?? region.height ?? 1), rx = 6, ry = 6 } = region;
  return { shape: 'rect', x, y, w, h, rx, ry };
}

/**
 * Shuffles answers and remaps correct_indices for MCQ.
 * @param {string[]} answers - Array of answer choices.
 * @param {number[]} correct_indices - Array of indices for correct answers (pre-shuffle).
 * @returns {{shuffledAnswers: string[], remappedIndices: number[]}}
 */
function shuffleAnswersWithIndices(answers, correct_indices) {
  const indexed = answers.map((a, i) => ({ a, i }));
  // Fisher-Yates shuffle
  for (let j = indexed.length - 1; j > 0; j--) {
    const k = Math.floor(Math.random() * (j + 1));
    [indexed[j], indexed[k]] = [indexed[k], indexed[j]];
  }
  const shuffledAnswers = indexed.map(obj => obj.a);
  const remappedIndices = indexed
    .map((obj, idx) => ({ orig: obj.i, now: idx }))
    .filter(({ orig }) => correct_indices.includes(orig))
    .map(({ now }) => now);

  return { shuffledAnswers, remappedIndices };
}

/** Optional: Filter deck by card type (e.g., "mcq", "flashcard") */
export function filterByType(deck, type) {
  return deck.filter(card => card.type === type);
}

/** Optional: General deck shuffling (not answers) */
export function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function isLatinDrillDeck(data) {
  return data && typeof data === 'object' && Array.isArray(data.lexicon) && data.type === 'latin_drill_deck';
}

function collectNounDeclensions(entries = []) {
  const set = new Set();
  entries.forEach(entry => {
    const key = typeof entry?.declension === 'string' ? entry.declension : null;
    if (key) set.add(key);
  });
  return Array.from(set);
}

function joinForms(parts = []) {
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function buildAcceptList(phrase) {
  const normalized = removeMacrons(phrase);
  const variants = [phrase];
  if (normalized && normalized !== phrase) variants.push(normalized);
  return dedupeStrings(variants);
}

function dictionaryLabel(entry) {
  if (typeof entry === 'string') return String(entry || '').trim();
  return String(entry?.dictionary || entry?.lemma || '').trim();
}

function dictionaryDisplay(entry) {
  const raw = dictionaryLabel(entry);
  if (!raw) return '';
  const idx = raw.indexOf(',');
  if (idx === -1) return raw;
  const head = raw.slice(0, idx);
  const tail = raw.slice(idx + 1);
  return `${head},<span data-tts="off">${tail}</span>`;
}

function formatComponentFront(entries = []) {
  return entries
    .map(dictionaryDisplay)
    .filter(Boolean)
    .join('\n');
}

function formatVocabularyBack(entry) {
  const czech = String(entry?.czech || '').trim();
  const english = String(entry?.english || '').trim();
  if (czech && english) return `${czech}\n${english}`;
  return czech || english || '';
}

function latinLang(front = 'la', back = 'la') {
  return { front, back };
}

function latinVocabBackLang(entry) {
  const czech = String(entry?.czech || '').trim();
  return czech ? 'cs' : 'en';
}

function buildLexemeSignature(entries = []) {
  const ids = entries
    .map(entry => entry?.id || (typeof entry === 'string' ? entry : ''))
    .map(id => String(id || '').trim())
    .filter(Boolean);
  return ids.length ? ids.join('|') : '';
}

const CASE_VARIANT_KEYS = [
  'nom_sg', 'gen_sg', 'dat_sg', 'acc_sg', 'abl_sg',
  'nom_pl', 'gen_pl', 'dat_pl', 'acc_pl', 'abl_pl'
];

function collectFormsForEntry(entry) {
  const forms = CASE_VARIANT_KEYS
    .map(caseKey => getFormValue(entry, caseKey))
    .filter(value => value && !hasMissingForm(value));
  if (!forms.length) {
    const label = dictionaryLabel(entry);
    if (label) forms.push(label);
  }
  return forms;
}

function generateCaseVariantsForComponents(components, { limit = 8, exclude } = {}) {
  if (!Array.isArray(components) || !components.length) return [];
  const pools = components.map(entry => collectFormsForEntry(entry));
  if (pools.some(pool => !pool.length)) return [];
  const variants = new Set();
  const maxAttempts = limit * 10;
  for (let attempt = 0; attempt < maxAttempts && variants.size < limit; attempt++) {
    const parts = pools.map(pool => pool[Math.floor(Math.random() * pool.length)]);
    const phrase = parts.join(' ').replace(/\s+/g, ' ').trim();
    if (!phrase) continue;
    if (exclude && removeMacrons(phrase) === removeMacrons(exclude)) continue;
    variants.add(phrase);
  }
  return Array.from(variants);
}

function groupAdjectivesByGender(entries = [], predicate = () => true) {
  const buckets = {};
  entries.forEach(entry => {
    if (!entry || !predicate(entry)) return;
    const gender = String(entry.gender || '').toLowerCase();
    if (!gender) return;
    if (!buckets[gender]) buckets[gender] = [];
    buckets[gender].push(entry);
  });
  return buckets;
}

function lemmaKey(value = '') {
  return removeMacrons(String(value || '').toLowerCase())
    .replace(/[^a-z0-9]+/g, '');
}

function buildLexIndex(lexicon) {
  const byLemma = new Map();
  const familyMap = new Map();
  lexicon.forEach(entry => {
    if (!entry) return;
    const dictionary = entry.dictionary || entry.lemma || entry.id;
    const lemma = entry.lemma || '';
    const baseToken = dictionary ? dictionary.split(',')[0] : '';
    [dictionary, lemma, baseToken, entry.id].forEach(keySource => {
      const key = lemmaKey(keySource);
      if (!key) return;
      if (!byLemma.has(key)) byLemma.set(key, []);
      byLemma.get(key).push(entry);
    });
    if (entry.family) {
      const familySources = [entry.family, entry.family.split(',')[0]];
      familySources.forEach(source => {
        const famKey = lemmaKey(source);
        if (!famKey) return;
        if (!familyMap.has(famKey)) familyMap.set(famKey, []);
        familyMap.get(famKey).push(entry);
      });
    }
  });
  return { byLemma, familyMap };
}

function lookupLemma(index, rawKey, predicate) {
  const key = lemmaKey(rawKey);
  if (!key) return null;
  const list = index.byLemma.get(key);
  if (!list || !list.length) return null;
  if (typeof predicate === 'function') {
    const found = list.find(predicate);
    if (found) return found;
  }
  return list[0];
}

function lookupNoun(index, key) {
  return (
    lookupLemma(index, key, entry => entry.pos === 'noun') ||
    lookupLemma(index, key)
  );
}

function lookupAdjective(index, familyKey, gender) {
  const fam = lemmaKey(familyKey);
  if (!fam) return null;
  const list = index.familyMap.get(fam);
  if (!list || !list.length) return null;
  if (gender) {
    const found = list.find(entry => entry.gender === gender);
    if (found) return found;
  }
  return list[0] || null;
}

function buildCuratedPairCards(index, combos = []) {
  const cards = [];
  if (!Array.isArray(combos) || !combos.length) return cards;
  combos.forEach((combo, idx) => {
    const noun = lookupNoun(index, combo.noun);
    if (!noun) return;
    const nounCase = combo.nounCase || 'nom_sg';
    const nounForm = getFormValue(noun, nounCase) || dictionaryLabel(noun);
    if (!nounForm) return;
    const modifierLabel = combo.modifier || combo.adjective;
    const inferredType = combo.modifierType || (combo.adjective ? 'adj' : 'noun');
    let modifier = null;
    let pairType = inferredType === 'noun' ? 'noun_noun' : 'noun_adj';
    if (pairType === 'noun_noun') {
      modifier = lookupNoun(index, modifierLabel);
    } else {
      const gender = combo.modifierGender || noun?.gender || 'f';
      modifier = lookupAdjective(index, modifierLabel, gender);
    }
    if (!modifier) return;
    const modifierCase = combo.modifierCase || (pairType === 'noun_noun' ? 'gen_sg' : nounCase);
    const modifierForm = getFormValue(modifier, modifierCase) || dictionaryLabel(modifier);
    if (!modifierForm) return;
    const components = [noun, modifier];
    const phrase = joinForms([nounForm, modifierForm]);
    if (!phrase) return;
    const lexemeSignature = buildLexemeSignature(components);
    const variants = generateCaseVariantsForComponents(components, { exclude: phrase });
    const card = {
      id: `latin_curated_pair|${idx}|${noun.id}|${modifier.id}`,
      type: 'latin_pair',
      front: formatComponentFront(components),
      back: phrase,
      front_text: formatComponentFront(components),
      back_text: phrase,
      correct: [phrase],
      accept: buildAcceptList(phrase),
      tags: ['latin', 'pair', 'curated'],
      meta: { noun: noun.id, modifier: modifier.id, type: pairType },
      lang: latinLang(),
      drillStyle: pairType === 'noun_adj' ? DRILL_STYLE.NOUN_ADJ : DRILL_STYLE.PHRASE,
      drillLevel: DRILL_LEVEL.PAIR,
      nounDeclensions: collectNounDeclensions([noun])
    };
    if (lexemeSignature) card.lexemeId = lexemeSignature;
    attachMcqVariants(card, phrase, variants);
    cards.push(card);
  });
  return cards;
}

function resolveCuratedComponent(index, component) {
  if (component.kind === 'noun') {
    return lookupNoun(index, component.key);
  }
  if (component.kind === 'adj') {
    return lookupAdjective(index, component.key, component.gender || 'f');
  }
  if (component.kind === 'prep' || component.kind === 'preposition') {
    return (
      lookupLemma(index, component.key, entry => entry.pos === 'preposition') || {
        id: `prep|${component.key}`,
        pos: 'preposition',
        dictionary: component.key
      }
    );
  }
  return null;
}

function drillStyleForLevel(level) {
  if (level >= DRILL_LEVEL.SENTENCE) return DRILL_STYLE.SENTENCE;
  if (level >= DRILL_LEVEL.EXTENDED) return DRILL_STYLE.PHRASE;
  if (level === DRILL_LEVEL.PAIR) return DRILL_STYLE.NOUN_ADJ;
  return DRILL_STYLE.PHRASE;
}

function buildCuratedPhraseCards(index, entries = []) {
  const cards = [];
  if (!Array.isArray(entries) || !entries.length) return cards;
  entries.forEach((entry, idx) => {
    const resolved = entry.components.map(component => resolveCuratedComponent(index, component));
    if (resolved.some(part => !part)) return;
    const front = formatComponentFront(resolved);
    const answer = entry.answer;
    const wordCount = resolved.length;
    const level = normalizeDrillLevel(entry.level, levelFromWordCount(wordCount));
    const lexemeSignature = buildLexemeSignature(resolved);
    const variants = generateCaseVariantsForComponents(resolved, { exclude: answer });
    const nounsOnly = resolved.filter(part => part?.pos === 'noun');
    const card = {
      id: `latin_curated_phrase|${idx}`,
      type: 'latin_phrase',
      front,
      back: answer,
      front_text: front,
      back_text: answer,
      correct: [answer],
      accept: buildAcceptList(answer),
      tags: ['latin', 'phrase', 'curated'],
      meta: { components: resolved.map(part => part?.id || ''), sourceLevel: entry.level, wordCount },
      lang: latinLang(),
      drillStyle: drillStyleForLevel(level),
      drillLevel: level,
      nounDeclensions: collectNounDeclensions(nounsOnly)
    };
    if (lexemeSignature) card.lexemeId = lexemeSignature;
    attachMcqVariants(card, answer, variants);
    cards.push(card);
  });
  return cards;
}

function buildWorkbookSimpleAgreementCards(index, combos = [], { tag = 'simple_agreement' } = {}) {
  const cards = [];
  if (!Array.isArray(combos) || !combos.length) return cards;
  combos.forEach((pair, idx) => {
    const noun = lookupNoun(index, pair.noun);
    if (!noun) return;
    const adjective = lookupAdjective(index, pair.adjective, noun.gender);
    if (!adjective) return;
    const singular = joinForms([getFormValue(noun, 'nom_sg'), getFormValue(adjective, 'nom_sg')]);
    const plural = joinForms([getFormValue(noun, 'nom_pl'), getFormValue(adjective, 'nom_pl')]);
    if (!singular) return;
    const components = [noun, adjective];
    const frontLabel = formatComponentFront(components);
    const lexemeSignature = buildLexemeSignature(components);
    const nounDeclensions = collectNounDeclensions([noun]);
    const variants = gatherAgreementVariants(noun, adjective);
    const combinedVariants = variants.concat(generateCaseVariantsForComponents(components, { exclude: singular }));
    if (!pair.onlyPlural) {
      const card = {
        id: `latin_workbook_simple|${noun.id}|${adjective.id}|${idx}`,
        type: 'latin_workbook_simple',
        front: frontLabel,
        back: singular,
        front_text: frontLabel,
        back_text: singular,
        correct: [singular],
        accept: buildAcceptList(singular),
        tags: ['latin', 'workbook', tag],
        meta: { noun: noun.id, adjective: adjective.id, number: 'sg' },
        lang: latinLang(),
        drillStyle: DRILL_STYLE.NOUN_ADJ,
        drillLevel: DRILL_LEVEL.PHRASE,
        nounDeclensions
      };
      if (lexemeSignature) card.lexemeId = lexemeSignature;
      attachMcqVariants(card, singular, combinedVariants);
      cards.push(card);
    }
    if (pair.onlyPlural !== false && plural) {
      const pluralCard = {
        id: `latin_workbook_pluralize|${noun.id}|${adjective.id}|${idx}`,
        type: 'latin_workbook_plural',
        front: frontLabel,
        back: plural,
        front_text: frontLabel,
        back_text: plural,
        correct: [plural],
        accept: buildAcceptList(plural),
        tags: ['latin', 'workbook', tag, 'plural'],
        meta: { noun: noun.id, adjective: adjective.id, number: 'pl' },
        lang: latinLang(),
        drillStyle: DRILL_STYLE.NOUN_ADJ,
        drillLevel: DRILL_LEVEL.PHRASE,
        nounDeclensions
      };
      if (lexemeSignature) pluralCard.lexemeId = lexemeSignature;
      const pluralExtras = generateCaseVariantsForComponents(components, { exclude: plural });
      attachMcqVariants(pluralCard, plural, variants.concat(pluralExtras));
      cards.push(pluralCard);
    }
  });
  return cards;
}

function buildWorkbookGenitivePairs(index, combos = []) {
  const cards = [];
  if (!Array.isArray(combos) || !combos.length) return cards;
  combos.forEach((pair, idx) => {
    const head = lookupNoun(index, pair.head);
    const complement = lookupNoun(index, pair.complement);
    if (!head || !complement) return;
    const headForm = getFormValue(head, 'nom_sg');
    const tailForm = getFormValue(complement, 'gen_sg');
    if (hasMissingForm(headForm) || hasMissingForm(tailForm)) return;
    const phrase = joinForms([headForm, tailForm]);
    const components = [head, complement];
    const variants = gatherGenitiveVariants(head, complement);
    const extraVariants = generateCaseVariantsForComponents(components, { exclude: phrase });
    const combinedVariants = variants.concat(extraVariants);
    const card = {
      id: `latin_workbook_genitive|${head.id}|${complement.id}|${idx}`,
      type: 'latin_workbook_genitive',
      front: formatComponentFront(components),
      back: phrase,
      front_text: formatComponentFront(components),
      back_text: phrase,
      correct: [phrase],
      accept: buildAcceptList(phrase),
      tags: ['latin', 'workbook', 'genitive_pair'],
      meta: { head: head.id, complement: complement.id },
      lang: latinLang(),
      drillLevel: DRILL_LEVEL.PAIR,
      drillStyle: DRILL_STYLE.PHRASE,
      nounDeclensions: collectNounDeclensions([head, complement])
    };
    const lexemeSignature = buildLexemeSignature(components);
    if (lexemeSignature) card.lexemeId = lexemeSignature;
    attachMcqVariants(card, phrase, combinedVariants);
    cards.push(card);
  });
  return cards;
}

function buildWorkbookComplexPairs(index, combos = []) {
  const cards = [];
  if (!Array.isArray(combos) || !combos.length) return cards;
  combos.forEach((pair, idx) => {
    const head = lookupNoun(index, pair.head);
    const complement = lookupNoun(index, pair.complement);
    if (!head || !complement) return;
    const headForm = getFormValue(head, 'nom_sg');
    const tailForm = getFormValue(complement, 'gen_sg');
    if (hasMissingForm(headForm) || hasMissingForm(tailForm)) return;
    const adjectives = (pair.adjectives || []).map(key => lookupAdjective(index, key, complement.gender)).filter(Boolean);
    const adjectiveForms = adjectives
      .map(adj => getFormValue(adj, 'gen_sg'))
      .filter(form => !hasMissingForm(form));
    const phrase = joinForms([headForm, tailForm, ...adjectiveForms]);
    if (!phrase) return;
    const components = [head, complement, ...adjectives];
    const lexemeSignature = buildLexemeSignature(components);
    const variants = gatherComplexGenitiveVariants(head, complement, adjectives);
    const extraVariants = generateCaseVariantsForComponents(components, { exclude: phrase });
    const combinedVariants = variants.concat(extraVariants);
    const card = {
      id: `latin_workbook_complex|${head.id}|${complement.id}|${idx}`,
      type: 'latin_workbook_complex',
      front: formatComponentFront(components),
      back: phrase,
      front_text: formatComponentFront(components),
      back_text: phrase,
      correct: [phrase],
      accept: buildAcceptList(phrase),
      tags: ['latin', 'workbook', 'complex_phrase'],
      meta: { head: head.id, complement: complement.id, adjectives: adjectives.map(adj => adj.id) },
      lang: latinLang(),
      drillStyle: DRILL_STYLE.SENTENCE,
      nounDeclensions: collectNounDeclensions([head, complement])
    };
    let level = DRILL_LEVEL.PHRASE;
    if (pair.adjectives.length >= 2) level = DRILL_LEVEL.EXTENDED;
    if (pair.adjectives.length >= 3) level = DRILL_LEVEL.SENTENCE;
    card.drillLevel = level;
    if (lexemeSignature) card.lexemeId = lexemeSignature;
    attachMcqVariants(card, phrase, combinedVariants);
    cards.push(card);
  });
  return cards;
}

function buildDynamicExtendedCards(nouns, adjectives) {
  const cards = [];
  const anatomical = Array.isArray(nouns) ? nouns.filter(looksAnatomical) : [];
  const adjectiveBuckets = groupAdjectivesByGender(adjectives, isAnatomicalAdjective);
  if (anatomical.length < 4 || !Object.keys(adjectiveBuckets).length) return cards;
  const limit = Math.min(anatomical.length, 18);
  for (let i = 0; i < limit; i++) {
    const primaryHead = anatomical[i];
    const primaryComplement = anatomical[(i + 3) % anatomical.length];
    const clauseA = buildClauseSegment(primaryHead, primaryComplement, adjectiveBuckets, { adjectiveCount: 2, seed: i });
    if (clauseA) {
      cards.push(createDynamicPhraseCard(clauseA, DRILL_LEVEL.EXTENDED, `latin_dynamic_ext4|${i}`));
    }
    const secondaryHead = anatomical[(i + 5) % anatomical.length];
    const secondaryComplement = anatomical[(i + 7) % anatomical.length];
    const clauseB = buildClauseSegment(secondaryHead, secondaryComplement, adjectiveBuckets, { adjectiveCount: 1, seed: i + 1 });
    if (clauseA && clauseB) {
      const connector = (i % 2 === 0) ? 'et' : 'cum';
      const sentenceCard = createDynamicSentenceCard(clauseA, clauseB, connector, i);
      if (sentenceCard) cards.push(sentenceCard);
    }
  }
  return cards;
}

function buildClauseSegment(head, complement, adjectiveBuckets, { adjectiveCount = 1, seed = 0 } = {}) {
  if (!head || !complement || head.id === complement.id) return null;
  const headNom = getFormValue(head, 'nom_sg');
  const complementGen = getFormValue(complement, 'gen_sg');
  if (hasMissingForm(headNom) || hasMissingForm(complementGen)) return null;
  const bucketKey = String(complement.gender || 'f').toLowerCase();
  const bucket = adjectiveBuckets[bucketKey];
  if (!bucket || bucket.length < adjectiveCount) return null;
  const adjectives = [];
  for (let i = 0; i < adjectiveCount; i++) {
    const pick = bucket[(seed + i) % bucket.length];
    const form = getFormValue(pick, 'gen_sg');
    if (hasMissingForm(form)) return null;
    adjectives.push({ entry: pick, form });
  }
  const phrase = joinForms([headNom, complementGen, ...adjectives.map(adj => adj.form)]);
  if (!phrase) return null;
  const components = [head, complement, ...adjectives.map(adj => adj.entry)];
  const label = components.map(dictionaryLabel).join(' + ');
  const lexemeSignature = buildLexemeSignature(components);
  return { phrase, head, complement, adjectives: adjectives.map(adj => adj.entry), components, label, lexemeSignature };
}

function createDynamicPhraseCard(clause, level, id) {
  const components = clause.components;
  const front = formatComponentFront(components);
  const lexemeSignature = buildLexemeSignature(components);
  const card = {
    id,
    type: 'latin_dynamic_phrase',
    front,
    back: clause.phrase,
    front_text: front,
    back_text: clause.phrase,
    correct: [clause.phrase],
    accept: buildAcceptList(clause.phrase),
    tags: ['latin', 'dynamic'],
    meta: { components: components.map(dictionaryLabel) },
    lang: latinLang(),
    drillStyle: level >= DRILL_LEVEL.SENTENCE ? DRILL_STYLE.SENTENCE : DRILL_STYLE.PHRASE,
    drillLevel: level,
    nounDeclensions: collectNounDeclensions([clause.head, clause.complement])
  };
  card.lexemeId = clause.lexemeSignature || lexemeSignature;
  const extraVariants = generateCaseVariantsForComponents(components, { exclude: clause.phrase });
  attachMcqVariants(card, clause.phrase, extraVariants);
  return card;
}

function createDynamicSentenceCard(primaryClause, secondaryClause, connector, idx) {
  const sentence = joinForms([primaryClause.phrase, connector, secondaryClause.phrase]);
  if (!sentence) return null;
  const components = [...primaryClause.components, ...secondaryClause.components];
  const front = formatComponentFront(components);
  const card = {
    id: `latin_dynamic_sentence|${primaryClause.head.id}|${secondaryClause.head.id}|${idx}`,
    type: 'latin_dynamic_sentence',
    front,
    back: sentence,
    front_text: front,
    back_text: sentence,
    correct: [sentence],
    accept: buildAcceptList(sentence),
    tags: ['latin', 'dynamic', 'sentence'],
    meta: { components: components.map(dictionaryLabel), connector },
    lang: latinLang(),
    drillStyle: DRILL_STYLE.SENTENCE,
    drillLevel: DRILL_LEVEL.SENTENCE,
    nounDeclensions: collectNounDeclensions([primaryClause.head, primaryClause.complement, secondaryClause.head, secondaryClause.complement])
  };
  const lexemeSignature = buildLexemeSignature(components);
  if (lexemeSignature) card.lexemeId = lexemeSignature;
  const extraVariants = generateCaseVariantsForComponents(components, { exclude: sentence });
  attachMcqVariants(card, sentence, extraVariants);
  return card;
}

function buildLatinDrillCards(config = {}) {
  const lexicon = Array.isArray(config.lexicon) ? config.lexicon : [];
  if (!lexicon.length) return [];
  const lexIndex = buildLexIndex(lexicon);
  const vocabEntries = lexicon.slice(); // accept all entries; pos is optional
  const drills = (config && typeof config === 'object') ? (config.drills || {}) : {};
  const curatedPairs = Array.isArray(drills.curatedPairs) ? drills.curatedPairs : [];
  const curatedPhrases = Array.isArray(drills.curatedPhrases) ? drills.curatedPhrases : [];
  const cards = [];
  cards.push(...buildLatinVocabCards(vocabEntries));
  cards.push(...buildCuratedPairCards(lexIndex, curatedPairs));
  cards.push(...buildCuratedPhraseCards(lexIndex, curatedPhrases));
  return cards;
}

function buildLatinVocabCards(entries) {
  const cards = [];
  const seenFamilies = new Set();
  entries.forEach(entry => {
    if (!entry) return;
    const pos = entry.pos || 'word';
    const isAdjectiveFamily = pos === 'adjective' && entry.family;
    if (isAdjectiveFamily) {
      if (entry.gender && entry.gender !== 'm') return;
      if (seenFamilies.has(entry.family)) return;
      seenFamilies.add(entry.family);
    }
    const lemmaId = (isAdjectiveFamily ? entry.family : null) || entry.id || entry.lemma || entry.dictionary || entry.english;
    if (!lemmaId) return;
    const front = isAdjectiveFamily ? entry.family : dictionaryLabel(entry);
    if (!front) return;
    const englishList = splitEnglish(entry.english);
    const czechList = splitCzech(entry.czech);
    const merged = dedupeStrings([...czechList, ...englishList]); // keep Czech-first order as on card
    const back = formatVocabularyBack(entry);
    const backLines = back ? back.split(/\r?\n/).map(s => s.trim()).filter(Boolean) : [];
    const primary = backLines[0] || merged[0] || front || '';
    const canonical = primary || front;
    const correctArr = backLines.length ? backLines : (merged.length ? merged : [canonical]);
    const accept = correctArr;
    const vocabType = pos === 'phrase' ? 'latin_phrase' : 'latin_vocab';
    const tags = ['latin', vocabType === 'latin_phrase' ? 'phrase' : 'vocab', entry.pos].filter(Boolean);
    const drillStyle = pos === 'phrase' ? DRILL_STYLE.PHRASE : DRILL_STYLE.SINGLE;
    const nounDeclensions = pos === 'noun' ? collectNounDeclensions([entry]) : [];
    const card = {
      id: `latin_vocab|${lemmaId}`,
      type: vocabType,
      front,
      back,
      front_text: front,
      back_text: entry.english || entry.czech || '',
      correct: correctArr,
      accept,
      tags,
      lexemeId: lemmaId,
      dictionary: entry.dictionary,
      lang: latinLang('la', latinVocabBackLang(entry)),
      drillStyle,
      drillLevel: DRILL_LEVEL.SINGLE
    };
    if (nounDeclensions.length) card.nounDeclensions = nounDeclensions;
    cards.push(card);
  });
  return cards;
}

function buildLatinAgreementCards(nouns, adjectives) {
  const cards = [];
  if (!Array.isArray(nouns) || !Array.isArray(adjectives)) return cards;
  const anatomicalNouns = nouns.filter(looksAnatomical);
  const adjectivesByGender = groupAdjectivesByGender(adjectives, isAnatomicalAdjective);
  const seen = new Set();
  anatomicalNouns.forEach((noun, idx) => {
    if (!noun) return;
    const gender = String(noun.gender || 'f').toLowerCase();
    const pool = adjectivesByGender[gender];
    if (!pool || !pool.length) return;
    const adjective = pool[idx % pool.length];
    if (!adjective) return;
    AGREEMENT_CASES.forEach(caseKey => {
      const nounForm = getFormValue(noun, caseKey);
      const adjForm = getFormValue(adjective, caseKey);
      if (hasMissingForm(nounForm) || hasMissingForm(adjForm)) return;
      const phrase = `${nounForm} ${adjForm}`.replace(/\s+/g, ' ').trim();
      if (!phrase) return;
      const comboKey = `${noun.id}|${adjective.id}|${caseKey}`;
      if (seen.has(comboKey)) return;
      seen.add(comboKey);
      const components = [noun, adjective];
      const lexemeSignature = buildLexemeSignature(components);
      const canonical = phrase;
      const accept = dedupeStrings([canonical, removeMacrons(canonical)]);
      const variants = gatherAgreementVariants(noun, adjective);
      const extraVariants = generateCaseVariantsForComponents(components, { exclude: canonical });
      const combinedVariants = variants.concat(extraVariants);
      const card = {
        id: `latin_agreement|${noun.id}|${adjective.id}|${caseKey}`,
        type: 'latin_agreement',
        front: formatComponentFront(components),
        back: canonical,
        front_text: formatComponentFront(components),
        back_text: canonical,
        correct: [canonical],
        accept: accept.length ? accept : [canonical],
        tags: ['latin', 'agreement'],
        meta: { noun: noun.id, adjective: adjective.id, caseKey },
        drillStyle: DRILL_STYLE.NOUN_ADJ,
        drillLevel: DRILL_LEVEL.PHRASE,
        nounDeclensions: collectNounDeclensions([noun]),
        lang: latinLang()
      };
      if (lexemeSignature) card.lexemeId = lexemeSignature;
      attachMcqVariants(card, canonical, combinedVariants);
      cards.push(card);
    });
  });
  return cards;
}

function buildLatinGenitiveCards(nouns) {
  const cards = [];
  if (!Array.isArray(nouns) || nouns.length < 2) return cards;
  const anatomical = nouns.filter(looksAnatomical);
  if (anatomical.length < 2) return cards;
  const seen = new Set();
  const offset = 3;
  anatomical.forEach((noun, idx) => {
    const partner = anatomical[(idx + offset) % anatomical.length];
    if (!partner || partner.id === noun.id) return;
    GENITIVE_PATTERNS.forEach(pattern => {
      const headForm = getFormValue(noun, pattern.head);
      const tailForm = getFormValue(partner, pattern.tail);
      if (hasMissingForm(headForm) || hasMissingForm(tailForm)) return;
      const phrase = `${headForm} ${tailForm}`.replace(/\s+/g, ' ').trim();
      if (!phrase) return;
      const pairKey = `${pattern.head}|${noun.id}|${partner.id}`;
      const reverseKey = `${pattern.head}|${partner.id}|${noun.id}`;
      if (seen.has(pairKey) || seen.has(reverseKey)) return;
      seen.add(pairKey);
      seen.add(reverseKey);
      const canonical = phrase;
      const accept = dedupeStrings([canonical, removeMacrons(canonical)]);
      const components = [noun, partner];
      const lexemeSignature = buildLexemeSignature(components);
      const variants = gatherGenitiveVariants(noun, partner);
      const extraVariants = generateCaseVariantsForComponents(components, { exclude: canonical });
      const combinedVariants = variants.concat(extraVariants);
      const card = {
        id: `latin_genitive|${noun.id}|${partner.id}|${pattern.head}`,
        type: 'latin_genitive',
        front: formatComponentFront(components),
        back: canonical,
        front_text: formatComponentFront(components),
        back_text: canonical,
        correct: [canonical],
        accept: accept.length ? accept : [canonical],
        tags: ['latin', 'genitive'],
        meta: { noun: noun.id, complement: partner.id, pattern: pattern.head },
        drillStyle: DRILL_STYLE.PHRASE,
        drillLevel: DRILL_LEVEL.PAIR,
        nounDeclensions: collectNounDeclensions([noun, partner]),
        lang: latinLang()
      };
      if (lexemeSignature) card.lexemeId = lexemeSignature;
      attachMcqVariants(card, canonical, combinedVariants);
      cards.push(card);
    });
  });
  return cards;
}

function getFormValue(entry, caseKey) {
  if (!entry || !caseKey) return '';
  const forms = (entry.forms && typeof entry.forms === 'object') ? entry.forms : null;
  const value = forms?.[caseKey] ?? entry[caseKey];
  return typeof value === 'string' ? value.trim() : '';
}

function hasMissingForm(value) {
  return !value || PLACEHOLDER_RE.test(value);
}

function dedupeStrings(list) {
  const out = [];
  if (!Array.isArray(list)) return out;
  const seen = new Set();
  list.forEach(item => {
    if (typeof item !== 'string') return;
    const trimmed = item.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(trimmed);
  });
  return out;
}

function attachMcqVariants(card, target, variants = []) {
  if (!card || typeof target !== 'string' || !target.trim()) return;
  const combined = [target, ...variants];
  const unique = [];
  const seen = new Set();
  combined.forEach(text => {
    if (typeof text !== 'string') return;
    const trimmed = text.trim();
    if (!trimmed) return;
    if (seen.has(trimmed)) return;
    seen.add(trimmed);
    unique.push(trimmed);
  });
  if (!unique.length) unique.push(target);
  const limited = unique.slice(0, LATIN_MCQ_LIMIT);
  let idx = limited.findIndex(val => val === target);
  if (idx === -1) {
    limited.unshift(target);
    if (limited.length > LATIN_MCQ_LIMIT) limited.length = LATIN_MCQ_LIMIT;
    idx = 0;
  }
  card.mcqVariants = limited.slice();
  if (!Array.isArray(card.answers) || !card.answers.length) {
    card.answers = limited.slice();
    card.correct_indices = [idx];
  }
}

function gatherAgreementVariants(noun, adjective) {
  const variants = [];
  AGREEMENT_CASES.forEach(caseKey => {
    const nounForm = getFormValue(noun, caseKey);
    const adjForm = getFormValue(adjective, caseKey);
    if (hasMissingForm(nounForm) || hasMissingForm(adjForm)) return;
    variants.push(joinForms([nounForm, adjForm]));
  });
  return variants;
}

function gatherGenitiveVariants(head, complement) {
  const variants = [];
  GENITIVE_PATTERNS.forEach(pattern => {
    const headForm = getFormValue(head, pattern.head);
    const tailForm = getFormValue(complement, pattern.tail);
    if (hasMissingForm(headForm) || hasMissingForm(tailForm)) return;
    variants.push(joinForms([headForm, tailForm]));
  });
  return variants;
}

function gatherComplexGenitiveVariants(head, complement, adjectives = []) {
  const variants = [];
  GENITIVE_PATTERNS.forEach(pattern => {
    const headForm = getFormValue(head, pattern.head);
    const tailForm = getFormValue(complement, pattern.tail);
    if (hasMissingForm(headForm) || hasMissingForm(tailForm)) return;
    const adjForms = adjectives
      .map(adj => getFormValue(adj, pattern.tail))
      .filter(form => !hasMissingForm(form));
    variants.push(joinForms([headForm, tailForm, ...adjForms]));
  });
  return variants;
}

function splitEnglish(text) {
  if (!text) return [];
  return String(text)
    .split(/;/)
    .map(s => s.trim())
    .filter(Boolean);
}

function splitCzech(text) {
  if (!text) return [];
  return String(text)
    .split(/[;,]/)
    .map(s => s.trim())
    .filter(Boolean);
}

function firstGloss(text) {
  if (!text) return '';
  const chunk = String(text).split(/[;,]/)[0] || '';
  return chunk.trim();
}

function looksAnatomical(entry) {
  const gloss = String(entry?.english || '').toLowerCase();
  return ANATOMY_KEYWORDS.some(keyword => gloss.includes(keyword));
}

function isAnatomicalAdjective(entry) {
  const gloss = String(entry?.english || '').toLowerCase();
  return ADJECTIVE_KEYWORDS.some(keyword => gloss.includes(keyword));
}
