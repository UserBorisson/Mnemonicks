/**
 * Latin declension engine: table-driven paradigms + deterministic solver.
 *
 * The data and types follow the specification from docs/latin-abbrev.md.
 * We keep everything declarative so the abbreviation expander can trace
 * exactly which rule produced a given inflected form.
 */

/** @typedef {'noun' | 'adjective'} PartOfSpeech */
/** @typedef {'m' | 'f' | 'n' | 'c'} Gender */
/** @typedef {'sg' | 'pl'} NumberCat */
/** @typedef {'nom' | 'gen' | 'dat' | 'acc' | 'abl' | 'voc'} CaseCat */

/** @typedef {'1'
 *  | '2m_us' | '2m_er' | '2n'
 *  | '3mf' | '3mf_i' | '3n' | '3n_i'
 *  | '4m' | '4n'
 *  | '5'} NounClass */

/** @typedef {'1-2'
 *  | '3-two'
 *  | '3-one'
 *  | 'comparative'
 *  | 'superlative'
 *  | 'indeclinable'} AdjectiveClass */

/** @typedef {{ end: string, alt?: string[], tags?: string[] }} EndingCell */
/** @typedef {Record<CaseCat, EndingCell>} EndingsByCase */
/** @typedef {Record<NumberCat, EndingsByCase>} NumberedEndings */

/**
 * @typedef {{ label: string, endings: NumberedEndings, rules?: {
 *   neuterNomAccVocEqual?: boolean;
 *   genPluralIum?: boolean;
 *   ablSingI?: boolean;
 * } }} Paradigm
 */

/**
 * @typedef {{ label: string, byGender: Partial<Record<Gender, NumberedEndings>>, rules?: Paradigm['rules'] }} AdjectiveParadigm
 */

/**
 * @typedef {{ baseFrom: 'gen_sg' | 'nom_sg' | 'stored', stripSuffix: string, flags?: {
 *   dropEAfterR?: boolean;
 *   keepEAfterR?: boolean;
 *   vocIusToI?: boolean;
 * } }} StemRule
 */

/**
 * @typedef {Object} LemmaEntry
 * @property {PartOfSpeech} pos
 * @property {string} lemma
 * @property {string=} gen_sg
 * @property {Gender[]=} genders
 * @property {NounClass=} nounClass
 * @property {AdjectiveClass=} adjClass
 * @property {string=} stem
 * @property {Record<string, boolean>=} flags
 * @property {Partial<Record<`${CaseCat}_${NumberCat}_${Gender}`, string>>=} overrides
 */

/**
 * @typedef {Object} SolveFeatures
 * @property {PartOfSpeech} pos
 * @property {CaseCat} case
 * @property {NumberCat} number
 * @property {Gender=} gender
 * @property {boolean=} stripMacrons
 */

/**
 * @typedef {Object} SolveTrace
 * @property {string} lemma
 * @property {NounClass | AdjectiveClass} classUsed
 * @property {'stored' | 'gen_sg' | 'nom_sg'} stemSource
 * @property {string} stem
 * @property {{ case: CaseCat, number: NumberCat, gender?: Gender, end: string, altUsed?: string, altOptions?: string[] }} endingChosen
 * @property {string[]} rulesApplied
 * @property {boolean=} overrideHit
 */

/**
 * @typedef {{ form: string, trace: SolveTrace }} SolveResult
 */

/** @type {Record<NounClass, Paradigm>} */
export const NOUN_PARADIGMS = {
  '1': {
    label: '1st decl. (mostly feminine)',
    endings: {
      sg: {
        nom: { end: '-a' },
        gen: { end: '-ae' },
        dat: { end: '-ae' },
        acc: { end: '-am' },
        abl: { end: '-ā' },
        voc: { end: '-a' }
      },
      pl: {
        nom: { end: '-ae' },
        gen: { end: '-ārum' },
        dat: { end: '-īs' },
        acc: { end: '-ās' },
        abl: { end: '-īs' },
        voc: { end: '-ae' }
      }
    }
  },

  '2m_us': {
    label: '2nd decl. masculine (-us)',
    endings: {
      sg: {
        nom: { end: '-us' },
        gen: { end: '-ī' },
        dat: { end: '-ō' },
        acc: { end: '-um' },
        abl: { end: '-ō' },
        voc: { end: '-e' }
      },
      pl: {
        nom: { end: '-ī' },
        gen: { end: '-ōrum' },
        dat: { end: '-īs' },
        acc: { end: '-ōs' },
        abl: { end: '-īs' },
        voc: { end: '-ī' }
      }
    }
  },

  '2m_er': {
    label: '2nd decl. masculine (-er)',
    endings: {
      sg: {
        nom: { end: '-er' },
        gen: { end: '-ī' },
        dat: { end: '-ō' },
        acc: { end: '-um' },
        abl: { end: '-ō' },
        voc: { end: '-er' }
      },
      pl: {
        nom: { end: '-ī' },
        gen: { end: '-ōrum' },
        dat: { end: '-īs' },
        acc: { end: '-ōs' },
        abl: { end: '-īs' },
        voc: { end: '-ī' }
      }
    }
  },

  '2n': {
    label: '2nd decl. neuter',
    endings: {
      sg: {
        nom: { end: '-um' },
        gen: { end: '-ī' },
        dat: { end: '-ō' },
        acc: { end: '-um' },
        abl: { end: '-ō' },
        voc: { end: '-um' }
      },
      pl: {
        nom: { end: '-a' },
        gen: { end: '-ōrum' },
        dat: { end: '-īs' },
        acc: { end: '-a' },
        abl: { end: '-īs' },
        voc: { end: '-a' }
      }
    },
    rules: { neuterNomAccVocEqual: true }
  },

  '3mf': {
    label: '3rd decl. consonant-stem (m./f.)',
    endings: {
      sg: {
        nom: { end: '' },
        gen: { end: '-is' },
        dat: { end: '-ī' },
        acc: { end: '-em' },
        abl: { end: '-e' },
        voc: { end: '' }
      },
      pl: {
        nom: { end: '-ēs' },
        gen: { end: '-um' },
        dat: { end: '-ibus' },
        acc: { end: '-ēs' },
        abl: { end: '-ibus' },
        voc: { end: '-ēs' }
      }
    }
  },

  '3mf_i': {
    label: '3rd decl. i-stem (m./f.)',
    endings: {
      sg: {
        nom: { end: '' },
        gen: { end: '-is' },
        dat: { end: '-ī' },
        acc: { end: '-em' },
        abl: { end: '-ī' },
        voc: { end: '' }
      },
      pl: {
        nom: { end: '-ēs' },
        gen: { end: '-ium' },
        dat: { end: '-ibus' },
        acc: { end: '-ēs' },
        abl: { end: '-ibus' },
        voc: { end: '-ēs' }
      }
    },
    rules: { genPluralIum: true, ablSingI: true }
  },

  '3n': {
    label: '3rd decl. consonant-stem (neuter)',
    endings: {
      sg: {
        nom: { end: '' },
        gen: { end: '-is' },
        dat: { end: '-ī' },
        acc: { end: '' },
        abl: { end: '-e' },
        voc: { end: '' }
      },
      pl: {
        nom: { end: '-a' },
        gen: { end: '-um' },
        dat: { end: '-ibus' },
        acc: { end: '-a' },
        abl: { end: '-ibus' },
        voc: { end: '-a' }
      }
    },
    rules: { neuterNomAccVocEqual: true }
  },

  '3n_i': {
    label: '3rd decl. i-stem (neuter)',
    endings: {
      sg: {
        nom: { end: '' },
        gen: { end: '-is' },
        dat: { end: '-ī' },
        acc: { end: '' },
        abl: { end: '-ī' },
        voc: { end: '' }
      },
      pl: {
        nom: { end: '-ia' },
        gen: { end: '-ium' },
        dat: { end: '-ibus' },
        acc: { end: '-ia' },
        abl: { end: '-ibus' },
        voc: { end: '-ia' }
      }
    },
    rules: { neuterNomAccVocEqual: true, genPluralIum: true, ablSingI: true }
  },

  '4m': {
    label: '4th decl. masculine',
    endings: {
      sg: {
        nom: { end: '-us' },
        gen: { end: '-ūs' },
        dat: { end: '-uī', alt: ['-ū'] },
        acc: { end: '-um' },
        abl: { end: '-ū' },
        voc: { end: '-us' }
      },
      pl: {
        nom: { end: '-ūs' },
        gen: { end: '-uum' },
        dat: { end: '-ibus' },
        acc: { end: '-ūs' },
        abl: { end: '-ibus' },
        voc: { end: '-ūs' }
      }
    }
  },

  '4n': {
    label: '4th decl. neuter',
    endings: {
      sg: {
        nom: { end: '-ū' },
        gen: { end: '-ūs' },
        dat: { end: '-ū' },
        acc: { end: '-ū' },
        abl: { end: '-ū' },
        voc: { end: '-ū' }
      },
      pl: {
        nom: { end: '-ua' },
        gen: { end: '-uum' },
        dat: { end: '-ibus' },
        acc: { end: '-ua' },
        abl: { end: '-ibus' },
        voc: { end: '-ua' }
      }
    },
    rules: { neuterNomAccVocEqual: true }
  },

  '5': {
    label: '5th decl. (mostly feminine)',
    endings: {
      sg: {
        nom: { end: '-ēs' },
        gen: { end: '-eī', alt: ['-ēī'] },
        dat: { end: '-eī', alt: ['-ēī'] },
        acc: { end: '-em' },
        abl: { end: '-ē' },
        voc: { end: '-ēs' }
      },
      pl: {
        nom: { end: '-ēs' },
        gen: { end: '-ērum' },
        dat: { end: '-ēbus' },
        acc: { end: '-ēs' },
        abl: { end: '-ēbus' },
        voc: { end: '-ēs' }
      }
    }
  }
};

/** @type {Record<AdjectiveClass, AdjectiveParadigm>} */
export const ADJ_PARADIGMS = {
  '1-2': {
    label: 'Adjectives of 1st/2nd decl. (bonus, bona, bonum)',
    byGender: {
      m: NOUN_PARADIGMS['2m_us'].endings,
      f: NOUN_PARADIGMS['1'].endings,
      n: NOUN_PARADIGMS['2n'].endings
    }
  },

  '3-two': {
    label: '3rd decl. adjectives, two terminations (fortis, forte)',
    byGender: {
      m: NOUN_PARADIGMS['3mf_i'].endings,
      f: NOUN_PARADIGMS['3mf_i'].endings,
      n: NOUN_PARADIGMS['3n_i'].endings
    },
    rules: { genPluralIum: true, ablSingI: true }
  },

  '3-one': {
    label: '3rd decl. adjectives, one termination (ingēns, ingentis)',
    byGender: {
      m: NOUN_PARADIGMS['3mf_i'].endings,
      f: NOUN_PARADIGMS['3mf_i'].endings,
      n: NOUN_PARADIGMS['3n_i'].endings
    },
    rules: { genPluralIum: true, ablSingI: true }
  },

  'comparative': {
    label: 'Comparatives (clārior, clārius)',
    byGender: {
      m: NOUN_PARADIGMS['3mf'].endings,
      f: NOUN_PARADIGMS['3mf'].endings,
      n: NOUN_PARADIGMS['3n'].endings
    }
  },

  'superlative': {
    label: 'Superlatives (clārissimus, -a, -um)',
    byGender: {
      m: NOUN_PARADIGMS['2m_us'].endings,
      f: NOUN_PARADIGMS['1'].endings,
      n: NOUN_PARADIGMS['2n'].endings
    }
  },

  'indeclinable': {
    label: 'Indeclinable adjective',
    byGender: { m: undefined, f: undefined, n: undefined }
  }
};

/** @type {{ noun: Record<NounClass, StemRule>, adjective: Record<AdjectiveClass, StemRule> }} */
export const STEM_RULES = {
  noun: {
    '1': { baseFrom: 'gen_sg', stripSuffix: 'ae' },
    '2m_us': { baseFrom: 'gen_sg', stripSuffix: 'ī' },
    '2m_er': { baseFrom: 'gen_sg', stripSuffix: 'ī', flags: {} },
    '2n': { baseFrom: 'gen_sg', stripSuffix: 'ī' },
    '3mf': { baseFrom: 'gen_sg', stripSuffix: 'is' },
    '3mf_i': { baseFrom: 'gen_sg', stripSuffix: 'is' },
    '3n': { baseFrom: 'gen_sg', stripSuffix: 'is' },
    '3n_i': { baseFrom: 'gen_sg', stripSuffix: 'is' },
    '4m': { baseFrom: 'gen_sg', stripSuffix: 'ūs' },
    '4n': { baseFrom: 'gen_sg', stripSuffix: 'ūs' },
    '5': { baseFrom: 'gen_sg', stripSuffix: 'eī' }
  },
  adjective: {
    '1-2': { baseFrom: 'gen_sg', stripSuffix: 'ī', flags: {} },
    '3-two': { baseFrom: 'gen_sg', stripSuffix: 'is' },
    '3-one': { baseFrom: 'gen_sg', stripSuffix: 'is' },
    'comparative': { baseFrom: 'stored', stripSuffix: '' },
    'superlative': { baseFrom: 'stored', stripSuffix: '' },
    'indeclinable': { baseFrom: 'stored', stripSuffix: '' }
  }
};

const MACRON_STRIP_MAP = {
  ā: 'a', ē: 'e', ī: 'i', ō: 'o', ū: 'u', ȳ: 'y',
  Ā: 'A', Ē: 'E', Ī: 'I', Ō: 'O', Ū: 'U', Ȳ: 'Y'
};
const MACRON_REGEX = /[āēīōūȳĀĒĪŌŪȲ]/g;

/**
 * @param {string} value
 */
export function removeMacrons(value) {
  return value.replace(MACRON_REGEX, (ch) => MACRON_STRIP_MAP[ch] || ch);
}

/**
 * @param {string | undefined} ending
 */
function normalizeEnding(ending) {
  if (!ending) return '';
  return ending.startsWith('-') ? ending.slice(1) : ending;
}

/**
 * Compute a stem using the appropriate rule for this lemma/class.
 * @param {LemmaEntry} entry
 * @param {NounClass | AdjectiveClass} classKey
 * @returns {{ stem: string, stemSource: 'stored' | 'gen_sg' | 'nom_sg', stemRules: string[] }}
 */
function deriveStem(entry, classKey) {
  const rulesApplied = [];
  if (entry.stem) {
    return { stem: entry.stem, stemSource: 'stored', stemRules: rulesApplied };
  }

  const ruleGroup = entry.pos === 'noun' ? STEM_RULES.noun : STEM_RULES.adjective;
  const rule = ruleGroup[classKey];
  if (!rule) {
    throw new Error(`No stem rule for class ${classKey}`);
  }

  let baseSource = rule.baseFrom;
  let base;
  if (rule.baseFrom === 'gen_sg') {
    if (!entry.gen_sg) throw new Error(`Missing gen_sg for lemma ${entry.lemma}`);
    base = entry.gen_sg;
  } else if (rule.baseFrom === 'nom_sg') {
    base = entry.lemma;
  } else {
    if (!entry.stem) throw new Error(`Missing stored stem for lemma ${entry.lemma}`);
    base = entry.stem;
  }

  let stem = base;
  const strip = rule.stripSuffix || '';
  if (strip && stem.endsWith(strip)) {
    stem = stem.slice(0, stem.length - strip.length);
  } else if (strip) {
    // Allow for alternate strip endings like ēī when stripSuffix is eī.
    if (entry.flags?.altStripSuffixes) {
      const alt = entry.flags.altStripSuffixes.find((altStrip) => stem.endsWith(altStrip));
      if (alt) stem = stem.slice(0, stem.length - alt.length);
    }
  }

  const dropE = entry.flags?.dropEAfterR || rule.flags?.dropEAfterR;
  const keepE = entry.flags?.keepEAfterR || rule.flags?.keepEAfterR;
  if (dropE && /er$/.test(stem)) {
    stem = stem.replace(/er$/, 'r');
    rulesApplied.push('dropEAfterR');
  } else if (keepE && /r$/.test(stem) && !/er$/.test(stem)) {
    stem = stem.replace(/r$/, 'er');
    rulesApplied.push('keepEAfterR');
  }

  return { stem, stemSource: baseSource, stemRules: rulesApplied };
}

/**
 * Resolve paradigm and base number endings for a lemma.
 * @param {LemmaEntry} entry
 * @param {SolveFeatures} feat
 */
function resolveParadigm(entry, feat) {
  if (entry.pos === 'noun') {
    const classKey = entry.nounClass;
    if (!classKey) throw new Error(`Lemma ${entry.lemma} missing nounClass`);
    const paradigm = NOUN_PARADIGMS[classKey];
    if (!paradigm) throw new Error(`Unknown noun paradigm ${classKey}`);
    return { classKey, paradigm, endings: paradigm.endings };
  }

  const classKey = entry.adjClass;
  if (!classKey) throw new Error(`Lemma ${entry.lemma} missing adjClass`);
  const paradigm = ADJ_PARADIGMS[classKey];
  if (!paradigm) throw new Error(`Unknown adjective paradigm ${classKey}`);
  const gender = feat.gender || entry.genders?.[0];
  const genderEndings = (gender && paradigm.byGender[gender]) || paradigm.byGender.m || paradigm.byGender.f || paradigm.byGender.n;
  return { classKey, paradigm, endings: genderEndings, resolvedGender: gender };
}

/**
 * Apply neuter/i-stem rule annotations to the trace list.
 * @param {Paradigm['rules'] | undefined} rules
 * @param {CaseCat} caseCat
 * @param {NumberCat} numberCat
 * @param {Gender | undefined} gender
 * @returns {{ targetCase: CaseCat, ruleNotes: string[] }}
 */
function applyParadigmRules(rules, caseCat, numberCat, gender) {
  let targetCase = caseCat;
  const notes = [];
  if (rules?.neuterNomAccVocEqual && (caseCat === 'acc' || caseCat === 'voc')) {
    targetCase = 'nom';
    notes.push('neuterNomAccVocEqual');
  }
  if (rules?.genPluralIum && caseCat === 'gen' && numberCat === 'pl') {
    notes.push('i-stem gen.pl -ium');
  }
  if (rules?.ablSingI && caseCat === 'abl' && numberCat === 'sg') {
    notes.push('i-stem abl.sg -ī');
  }
  return { targetCase, ruleNotes: notes };
}

function defaultGender(entry, fallback) {
  if (fallback) return fallback;
  return entry.genders?.[0];
}

/**
 * @param {LemmaEntry} entry
 * @param {SolveFeatures} feat
 * @returns {SolveResult}
 */
export function decline(entry, feat) {
  if (!entry) throw new Error('Missing lemma entry');
  if (entry.pos !== feat.pos) {
    throw new Error(`Part of speech mismatch for ${entry.lemma}: entry=${entry.pos}, requested=${feat.pos}`);
  }

  const { classKey, paradigm, endings, resolvedGender } = resolveParadigm(entry, feat);
  if (!endings) {
    // Indeclinables or incomplete tables -> return lemma directly.
    return {
      form: feat.stripMacrons ? removeMacrons(entry.lemma) : entry.lemma,
      trace: {
        lemma: entry.lemma,
        classUsed: classKey,
        stemSource: 'stored',
        stem: entry.stem || entry.lemma,
        endingChosen: { case: feat.case, number: feat.number, gender: resolvedGender, end: '' },
        rulesApplied: ['indeclinable']
      }
    };
  }

  const numberCat = feat.number;
  const caseCat = feat.case;
  const gender = entry.pos === 'noun' ? defaultGender(entry, resolvedGender) : resolvedGender || feat.gender || entry.genders?.[0];

  if (!endings[numberCat]) {
    throw new Error(`No endings for number ${numberCat} in class ${classKey}`);
  }

  const { targetCase, ruleNotes } = applyParadigmRules(paradigm.rules, caseCat, numberCat, gender);
  const endingCell = endings[numberCat][targetCase];
  if (!endingCell) {
    throw new Error(`No ending for ${numberCat}.${targetCase} in class ${classKey}`);
  }

  const endingString = normalizeEnding(endingCell.end);
  const altOptions = endingCell.alt ? endingCell.alt.map(normalizeEnding) : undefined;

  const { stem, stemSource, stemRules } = deriveStem(entry, classKey);
  const endingNotes = [...ruleNotes, ...stemRules];

  // Adjust for -ius vocative override (e.g., fīlius -> fīlī).
  let suffix = endingString;
  if (
    entry.pos === 'noun' &&
    classKey === '2m_us' &&
    caseCat === 'voc' &&
    numberCat === 'sg' &&
    entry.flags?.vocIusToI
  ) {
    suffix = 'ī';
    endingNotes.push('voc -ius→-ī');
  }

  // Compose base form before overrides.
  const composed = composeForm(entry, {
    stem,
    suffix,
    caseCat,
    numberCat,
    gender,
    classKey
  });

  const overrideKeyGender = gender ? `${caseCat}_${numberCat}_${gender}` : undefined;
  let finalForm = composed;
  let overrideHit = false;
  if (overrideKeyGender && entry.overrides && entry.overrides[overrideKeyGender]) {
    finalForm = entry.overrides[overrideKeyGender];
    overrideHit = true;
  }

  const output = feat.stripMacrons ? removeMacrons(finalForm) : finalForm;

  return {
    form: output,
    trace: {
      lemma: entry.lemma,
      classUsed: classKey,
      stemSource,
      stem,
      endingChosen: {
        case: caseCat,
        number: numberCat,
        gender,
        end: endingCell.end,
        altUsed: overrideHit ? undefined : undefined,
        altOptions
      },
      rulesApplied: endingNotes,
      overrideHit
    }
  };
}

/**
 * Compose the finished form given stem/suffix and handle special-case logic.
 * @param {LemmaEntry} entry
 * @param {{ stem: string, suffix: string, caseCat: CaseCat, numberCat: NumberCat, gender?: Gender, classKey: NounClass | AdjectiveClass }} ctx
 */
function composeForm(entry, ctx) {
  const { stem, suffix, caseCat, numberCat, gender, classKey } = ctx;
  const baseSuffix = suffix || '';

  if (
    entry.pos === 'noun' &&
    classKey === '2m_us' &&
    numberCat === 'sg' &&
    caseCat === 'voc' &&
    entry.flags?.vocIusToI
  ) {
    const lemmaVoc = entry.lemma.replace(/ius$/i, 'ī');
    if (lemmaVoc !== entry.lemma) {
      return lemmaVoc;
    }
    return stem + baseSuffix;
  }

  // Use lemma for nominative singular of nouns, since that is the dictionary headword.
  if (entry.pos === 'noun') {
    if (numberCat === 'sg' && (caseCat === 'nom' || caseCat === 'voc')) {
      // Vocative in many declensions equals nominative; use lemma as baseline.
      if (caseCat === 'voc' && classKey === '2m_us' && baseSuffix !== '') {
        // Already handled by suffix; proceed to combine stem+suffix.
      } else if (numberCat === 'sg') {
        if (caseCat === 'nom') return entry.lemma;
        if (caseCat === 'voc') return entry.lemma;
      }
    }

    // For neuter accusative singular, apply nominative (same as lemma) if suffix empty.
    if (numberCat === 'sg' && caseCat === 'acc' && baseSuffix === '' && entry.genders?.includes('n')) {
      return entry.lemma;
    }
  }

  if (entry.pos === 'adjective') {
    if (numberCat === 'sg' && caseCat === 'nom') {
      if (entry.adjClass === '3-one') {
        return entry.lemma;
      }
      if (gender === 'm') {
        return entry.lemma;
      }
      if (gender === 'f' && entry.adjClass === '3-two') {
        return entry.lemma;
      }
      if (gender === 'n') {
        if (entry.adjClass === '3-two') {
          return entry.lemma.replace(/is$/, 'e');
        }
        if (entry.adjClass === '3-one') {
          return entry.lemma;
        }
        if (entry.adjClass === 'comparative') {
          return entry.lemma.replace(/ior$/, 'ius');
        }
        // For '1-2' and 'superlative' neuter nominative, suffix already applied.
      }
    }
    if (numberCat === 'sg' && caseCat === 'acc' && gender === 'n') {
      if (entry.adjClass === '3-two') {
        return entry.lemma.replace(/is$/, 'e');
      }
      if (entry.adjClass === '3-one') {
        return entry.lemma;
      }
      if (entry.adjClass === 'comparative') {
        return entry.lemma.replace(/ior$/, 'ius');
      }
    }
    if (numberCat === 'sg' && caseCat === 'voc' && gender === 'n') {
      if (entry.adjClass === '3-two') {
        return entry.lemma.replace(/is$/, 'e');
      }
      if (entry.adjClass === '3-one') {
        return entry.lemma;
      }
      if (entry.adjClass === 'comparative') {
        return entry.lemma.replace(/ior$/, 'ius');
      }
    }
  }

  const actualSuffix = baseSuffix;
  return stem + actualSuffix;
}
