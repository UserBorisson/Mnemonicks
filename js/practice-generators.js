// practice-generators.js
// Runtime deck generators (session-only).

const GENERATOR_PREFIX = 'gen:';
const DEFAULT_REYNOLDS_COUNT = 25;
const DEFAULT_NERNST_COUNT = 25;
const DEFAULT_OSMOTIC_COUNT = 25;
const DEFAULT_BIOFYZ_COUNT = 30;
const MCQ_OPTION_CAP = 4;
const BIOFYZ_PREFS_KEY = 'BIOFYZ_GENERATOR_PREFS_V1';
const BIOFYZ_DEFAULT_PREFS = {
  reynolds: true,
  nernst: true,
  osmotic_pi: true,
  osmotic_isotonic: true,
  molarity_c: true,
  molarity_dilution: true,
  molarity_mass_from_c: true,
  arterial: true,
  arterial_mean_bp: true,
  arterial_aneurysm: true,
  arterial_pulmonary_speed: true,
  photon_lambda: true,
  photon_energy: true,
  photoelectric: true,
  xray_emax: true,
  sound: true,
  sound_loudspeaker_pressure: true,
  acoustic_impedance: true,
  eye: true,
  microscope: true,
  microscope_magnification: true,
  nearpoint: true,
  farpoint: true,
  debroglie: true,
  decay_lambda: true,
  decay_half_life: true,
  ear: true,
  ultrasound_transmission_pct: true,
  ultrasound_transmitted_intensity: true,
  shielding_intensity: true,
  shielding_dual_board: true,
  dose_equivalent_mixed: true,
  ct: true,
  median: true,
  quartile: true,
  iqr: true,
  cv: true,
  ciupper: true,
  tstat: true,
  relfreq: true,
  condprob_cond: true,
  condprob_neither: true,
  hypotest_alpha: true,
  hypotest_power: true,
  negpred_npv: true,
  negpred_ppv: true,
  sensneg: true,
  cardiac_output: true,
  ecg_avf_zero: true,
  ecg_avl_zero: true,
  ecgprac_axis: true,
  ecgprac_rate: true,
  ef_esv_decrease: true,
  ef_from_sv_esv: true
};
function applyBiofyzTtsTerms(card, termMap) {
  if (!card || typeof card !== 'object') return card;
  if (!termMap || typeof termMap !== 'object') return card;
  const tts = (card.tts && typeof card.tts === 'object') ? { ...card.tts } : {};
  const frontMap = (tts.frontTermMap && typeof tts.frontTermMap === 'object') ? { ...tts.frontTermMap } : {};
  const backMap = (tts.backTermMap && typeof tts.backTermMap === 'object') ? { ...tts.backTermMap } : {};
  tts.frontTermMap = { ...frontMap, ...termMap };
  tts.backTermMap = { ...backMap, ...termMap };
  card.tts = tts;
  return card;
}

const TTS_REYNOLDS = { Re: 'Reynolds number', rho: 'density', mu: 'dynamic viscosity', r: 'radius', v: 'velocity', A: 'cross sectional area' };
const TTS_NERNST = { U: 'Nernst potential', R: 'molar gas constant', T: 'absolute temperature', z: 'ion valence', F: 'Faraday constant', c_ext: 'external concentration', c_int: 'internal concentration' };
const TTS_OSMOTIC_PI = { pi: 'osmotic pressure', R: 'molar gas constant', T: 'temperature', C: 'molar concentration', i: "van 't Hoff factor" };
const TTS_OSMOTIC_ISOTONIC = { 'd_%': 'density concentration', c_NaCl: 'sodium chloride concentration', i_NaCl: "van 't Hoff factor of sodium chloride", M_glc: 'molar mass of glucose', i_glc: "van 't Hoff factor of glucose" };
const TTS_MOLARITY_C = { c: 'resulting concentration', m: 'solute mass', M: 'molar mass', V: 'solution volume', c_phys: 'physiological concentration' };
const TTS_MOLARITY_DILUTION = { V_H2O: 'added water volume', V_H_2O: 'added water volume', V_1: 'initial solution volume', c_1: 'initial concentration', c: 'target concentration' };
const TTS_MOLARITY_MASS_FROM_C = { m: 'solute mass', c: 'target concentration', M: 'molar mass', V: 'solution volume' };
const TTS_ARTERIAL = {
  P: 'percent change of pressure',
  p: 'pressure',
  A: 'cross sectional area',
  'Delta_%P': 'percent change of pressure',
  'Delta_%p': 'percent change of pressure',
  'Delta_%A': 'percent change of cross sectional area'
};
const TTS_ARTERIAL_MEAN_BP = {
  SBP: 'systolic blood pressure',
  DBP: 'diastolic blood pressure',
  p_mean: 'mean arterial pressure',
  c_mmHg_Pa: 'millimeters of mercury to pascals conversion factor'
};
const TTS_ARTERIAL_ANEURYSM = {
  A: 'cross sectional area',
  A_1: 'cross sectional area one',
  A_2: 'cross sectional area two',
  v_1: 'velocity one',
  v_2: 'velocity two',
  p: 'pressure',
  p_1: 'pressure one',
  p_2: 'pressure two',
  rho: 'blood density',
  'Delta_%A': 'percent change of cross sectional area',
  'Delta_%p': 'percent change of pressure'
};
const TTS_ARTERIAL_PULMONARY = {
  Q: 'volumetric flow rate',
  A: 'cross sectional area',
  A_a: 'cross sectional area of aorta',
  A_p: 'cross sectional area of pulmonary artery',
  v_a: 'velocity in aorta',
  v_p: 'velocity in pulmonary artery',
  'Delta_%A': 'percent change of cross sectional area'
};
const TTS_PHOTON_LAMBDA = { lambda: 'wavelength', c: 'speed of light', N: 'number of photons', h: 'Planck constant', I: 'intensity', A: 'area', t: 'time', cNh: 'c times N times h', IAt: 'I times A times t' };
const TTS_PHOTON_ENERGY = { E: 'photon energy', h: 'Planck constant', c: 'speed of light', lambda: 'wavelength', J: 'joules' };
const TTS_PHOTOELECTRIC = { 'Delta_%': 'percent change', lambda_min: 'minimum wavelength', w: 'work function fraction' };
const TTS_XRAY_EMAX = { E_max: 'maximum photon energy', e: 'elementary charge', U: 'anode voltage', J: 'joules' };
const TTS_SOUND = { L: 'sound level', L_1: 'initial sound level', N: 'number of identical sources' };
const TTS_SOUND_LOUDSPEAKER_PRESSURE = { p_ac: 'acoustic pressure amplitude', p_max: 'maximum acoustic pressure', p_eff: 'effective acoustic pressure', f: 'frequency', A: 'displacement amplitude', v: 'membrane velocity amplitude', rho: 'medium density', c: 'speed of sound in medium', Z: 'acoustic impedance' };
const TTS_ACOUSTIC = { Z: 'acoustic impedance', rho: 'medium density', c: 'speed of sound' };
const TTS_EYE = { x: 'viewing distance', d: 'minimum resolvable distance', alpha: 'angular resolution' };
const TTS_MICROSCOPE = { R: 'microscope resolution', d_min: 'minimum resolvable distance', lambda: 'wavelength', NA: 'numerical aperture', n: 'refractive index', alpha: 'refraction angle' };
const TTS_MICROSCOPE_MAG = { M: 'magnification', M_obj: 'magnification of objective', M_eye: 'magnification of eyepiece' };
const TTS_NEARPOINT = { NP: 'near point distance', P: 'optical power', d_0: 'reference distance' };
const TTS_FARPOINT = { FP: 'far point distance', P: 'optical power' };
const TTS_DEBROGLIE = { lambda: 'de Broglie wavelength', h: 'Planck constant', m: 'electron mass', e: 'elementary charge', U: 'accelerating voltage', V: 'accelerating voltage' };
const TTS_DECAY_LAMBDA = { lambda: 'decay constant', A_1: 'activity at time one', A_2: 'activity at time two', t_1: 'time one', t_2: 'time two' };
const TTS_DECAY_HALF = { t_1_2: 'half life', 't_1/2': 'half life', A_0: 'initial activity', A_t: 'activity at time t', t: 'elapsed time' };
const TTS_EAR = { f: 'resonant frequency', c: 'speed of sound', v: 'speed of sound', L: 'ear canal length' };
const TTS_ULTRASOUND_TRANS_PCT = { R: 'reflection coefficient', T: 'transmission percentage', Z_1: 'acoustic impedance of medium one', Z_2: 'acoustic impedance of medium two' };
const TTS_ULTRASOUND_TRANS_I = { I_0: 'incident intensity', I_t: 'transmitted intensity', c_1: 'speed of sound in medium one', c_2: 'speed of sound in medium two' };
const TTS_SHIELDING_I = {
  I: 'transmitted intensity',
  I_0: 'initial intensity',
  lambda: 'decay constant',
  mu: 'attenuation coefficient',
  t: 'elapsed time',
  d: 'shield thickness',
  x: 'shield thickness',
  't_1/2': 'half life',
  'd_1/2': 'half value layer thickness'
};
const TTS_SHIELDING_DUAL = { A_1: 'absorption of first board', T_2: 'transmission of second board', A_tot: 'total absorption' };
const TTS_DOSE_EQ = { H: 'dose equivalent', D: 'total absorbed dose', p_gamma: 'gamma dose fraction', Q_gamma: 'gamma quality factor', Q_n: 'neutron quality factor' };
const TTS_CT = { CT: 'CT number', HU: 'hounsfield unit', mu: 'linear attenuation coefficient', mu_water: 'attenuation coefficient of water', N_0: 'particle flow density in front of layer', N_1: 'particle flow density behind layer', d: 'layer thickness' };
const TTS_MEDIAN = { tildex: 'median', x: 'sorted value', n: 'sample size' };
const TTS_QUARTILE = { Q_1: 'first quartile', Q_3: 'third quartile', x: 'sorted value', n: 'sample size' };
const TTS_IQR = { IQR: 'interquartile range', Q_1: 'first quartile', Q_3: 'third quartile', x: 'sorted value', n: 'sample size' };
const TTS_CV = { CV: 'coefficient of variation', s: 'sample standard deviation', S: 'sample variance', x: 'sample mean', barx: 'sample mean' };
const TTS_CIUPPER = { CI: 'confidence interval', U: 'upper confidence limit', L: 'lower confidence limit', x: 'sample mean', barx: 'sample mean', t: 't critical value', s: 'sample standard deviation', S: 'sample variance', n: 'sample size', df: 'degrees of freedom' };
const TTS_TSTAT = { t: 'test statistic', x: 'sample mean', barx: 'sample mean', mu_0: 'reference mean', s: 'sample standard deviation', S: 'sample variance', n: 'sample size' };
const TTS_RELFREQ = { n_i: 'count in class i', f: 'relative frequency', n: 'count', sum: 'sum', i: 'class index' };
const TTS_CONDPROB = { P: 'probability', A: 'event A', B: 'event B' };
const TTS_HYPOTEST = { P: 'probability', H_0: 'null hypothesis', H_A: 'alternative hypothesis', alpha: 'significance level', beta: 'type two error probability' };
const TTS_NEGPRED = { P: 'probability', Se: 'sensitivity', Sp: 'specificity', p: 'prevalence', D: 'disease status', T: 'test status' };
const TTS_SENSNEG = { N_neg: 'false negative count', Se: 'sensitivity', N: 'population count' };
const TTS_CARDIAC = { CO: 'cardiac output', HR: 'heart rate', SV: 'stroke volume' };
const TTS_EF_ESV_DEC = { ESV: 'end systolic volume', ESV_1: 'initial end systolic volume', ESV_2: 'final end systolic volume', EF_1: 'initial ejection fraction', EF_2: 'final ejection fraction', 'Delta_%ESV': 'percent change of end systolic volume' };
const TTS_EF_FROM_SV = { EF: 'ejection fraction', EDV: 'end diastolic volume', ESV: 'end systolic volume', SV: 'stroke volume' };
const TTS_ECG_LEAD = { I: 'lead one potential', II: 'lead two potential', III: 'lead three potential', aVF: 'augmented lead foot', aVL: 'augmented lead left' };
const TTS_ECG_AXIS = { alpha: 'electrical axis angle', I: 'lead one net deflection', III: 'lead three net deflection' };
const TTS_ECG_RATE = { HR: 'heart rate', RR_n: 'number of RR intervals', RR_total: 'total RR length' };
const BIOFYZ_TYPE_TTS_TERM_MAP = Object.freeze({
  reynolds: TTS_REYNOLDS,
  nernst: TTS_NERNST,
  osmotic_pi: TTS_OSMOTIC_PI,
  osmotic_isotonic: TTS_OSMOTIC_ISOTONIC,
  molarity_c: TTS_MOLARITY_C,
  molarity_dilution: TTS_MOLARITY_DILUTION,
  molarity_mass_from_c: TTS_MOLARITY_MASS_FROM_C,
  arterial: TTS_ARTERIAL,
  arterial_mean_bp: TTS_ARTERIAL_MEAN_BP,
  arterial_aneurysm: TTS_ARTERIAL_ANEURYSM,
  arterial_pulmonary_speed: TTS_ARTERIAL_PULMONARY,
  photon_lambda: TTS_PHOTON_LAMBDA,
  photon_energy: TTS_PHOTON_ENERGY,
  photoelectric: TTS_PHOTOELECTRIC,
  xray_emax: TTS_XRAY_EMAX,
  sound: TTS_SOUND,
  sound_loudspeaker_pressure: TTS_SOUND_LOUDSPEAKER_PRESSURE,
  acoustic_impedance: TTS_ACOUSTIC,
  eye: TTS_EYE,
  microscope: TTS_MICROSCOPE,
  microscope_magnification: TTS_MICROSCOPE_MAG,
  nearpoint: TTS_NEARPOINT,
  farpoint: TTS_FARPOINT,
  debroglie: TTS_DEBROGLIE,
  decay_lambda: TTS_DECAY_LAMBDA,
  decay_half_life: TTS_DECAY_HALF,
  ear: TTS_EAR,
  ultrasound_transmission_pct: TTS_ULTRASOUND_TRANS_PCT,
  ultrasound_transmitted_intensity: TTS_ULTRASOUND_TRANS_I,
  shielding_intensity: TTS_SHIELDING_I,
  shielding_dual_board: TTS_SHIELDING_DUAL,
  dose_equivalent_mixed: TTS_DOSE_EQ,
  ct: TTS_CT,
  median: TTS_MEDIAN,
  quartile: TTS_QUARTILE,
  iqr: TTS_IQR,
  cv: TTS_CV,
  ciupper: TTS_CIUPPER,
  tstat: TTS_TSTAT,
  relfreq: TTS_RELFREQ,
  condprob_cond: TTS_CONDPROB,
  condprob_neither: TTS_CONDPROB,
  hypotest_alpha: TTS_HYPOTEST,
  hypotest_power: TTS_HYPOTEST,
  negpred_npv: TTS_NEGPRED,
  negpred_ppv: TTS_NEGPRED,
  sensneg: TTS_SENSNEG,
  cardiac_output: TTS_CARDIAC,
  ecg_avf_zero: TTS_ECG_LEAD,
  ecg_avl_zero: TTS_ECG_LEAD,
  ecgprac_axis: TTS_ECG_AXIS,
  ecgprac_rate: TTS_ECG_RATE,
  ef_esv_decrease: TTS_EF_ESV_DEC,
  ef_from_sv_esv: TTS_EF_FROM_SV
});

function normalizeInferenceText(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferBiofyzTypeKeyFromId(rawId = '') {
  const id = String(rawId || '').trim().toLowerCase();
  if (!id) return '';
  const parts = id.split(':');
  const prefix = parts[0] || '';
  const subtype = parts[2] || '';
  if (prefix === 'reynolds') return 'reynolds';
  if (prefix === 'nernst') return 'nernst';
  if (prefix === 'osmotic') return subtype === 'isotonic' ? 'osmotic_isotonic' : 'osmotic_pi';
  if (prefix === 'molarity') {
    if (subtype === 'dilution') return 'molarity_dilution';
    if (subtype === 'mass_from_c') return 'molarity_mass_from_c';
    return 'molarity_c';
  }
  if (prefix === 'arterial') {
    if (subtype === 'mean_bp') return 'arterial_mean_bp';
    if (subtype === 'aneurysm') return 'arterial_aneurysm';
    if (subtype === 'pulmonary_speed') return 'arterial_pulmonary_speed';
    return 'arterial';
  }
  if (prefix === 'photon') return subtype === 'energy' ? 'photon_energy' : 'photon_lambda';
  if (prefix === 'sound') return subtype === 'loudspeaker_pressure' ? 'sound_loudspeaker_pressure' : 'sound';
  if (prefix === 'acoustic') return 'acoustic_impedance';
  if (prefix === 'eye') return 'eye';
  if (prefix === 'microscope') return subtype === 'magnification' ? 'microscope_magnification' : 'microscope';
  if (prefix === 'nearpoint') return 'nearpoint';
  if (prefix === 'farpoint') return 'farpoint';
  if (prefix === 'debroglie') return 'debroglie';
  if (prefix === 'decay') return subtype === 'half_life' ? 'decay_half_life' : 'decay_lambda';
  if (prefix === 'ear') return 'ear';
  if (prefix === 'ultrasound') return subtype === 'intensity' ? 'ultrasound_transmitted_intensity' : 'ultrasound_transmission_pct';
  if (prefix === 'shielding') return subtype === 'dual_board' ? 'shielding_dual_board' : 'shielding_intensity';
  if (prefix === 'dosimetry') return 'dose_equivalent_mixed';
  if (prefix === 'ct') return 'ct';
  if (prefix === 'median') return 'median';
  if (prefix === 'quartile') return 'quartile';
  if (prefix === 'iqr') return 'iqr';
  if (prefix === 'cv') return 'cv';
  if (prefix === 'ciupper') return 'ciupper';
  if (prefix === 'tstat') return 'tstat';
  if (prefix === 'relfreq') return 'relfreq';
  if (prefix === 'condprob') return subtype === 'neither' ? 'condprob_neither' : 'condprob_cond';
  if (prefix === 'hypotest') return subtype === 'power' ? 'hypotest_power' : 'hypotest_alpha';
  if (prefix === 'negpred') return subtype === 'ppv' ? 'negpred_ppv' : 'negpred_npv';
  if (prefix === 'sensneg') return 'sensneg';
  if (prefix === 'cardiac') return 'cardiac_output';
  if (prefix === 'ecg') return subtype === 'avl_zero' ? 'ecg_avl_zero' : 'ecg_avf_zero';
  if (prefix === 'ecgprac') return subtype === 'rate' ? 'ecgprac_rate' : 'ecgprac_axis';
  if (prefix === 'ef') return subtype === 'from_sv_esv' ? 'ef_from_sv_esv' : 'ef_esv_decrease';
  if (prefix === 'photoelectric') return 'photoelectric';
  if (prefix === 'xray') return 'xray_emax';
  return '';
}

function inferBiofyzTypeKeyFromTags(rawTags = []) {
  const tags = Array.isArray(rawTags)
    ? rawTags.map(tag => String(tag || '').toLowerCase().trim()).filter(Boolean)
    : [];
  if (!tags.length) return '';
  const has = (tag) => tags.includes(tag);
  if (has('reynolds')) return 'reynolds';
  if (has('nernst')) return 'nernst';
  if (has('arterial') && (has('mean-bp') || has('map'))) return 'arterial_mean_bp';
  if (has('molarity') && has('mass')) return 'molarity_mass_from_c';
  if (has('molarity') && has('dilution')) return 'molarity_dilution';
  if (has('molarity')) return 'molarity_c';
  if (has('microscope') && has('magnification')) return 'microscope_magnification';
  if (has('microscope')) return 'microscope';
  if (has('near-point')) return 'nearpoint';
  if (has('far-point')) return 'farpoint';
  if (has('debroglie')) return 'debroglie';
  if (has('reynolds')) return 'reynolds';
  if (has('ct')) return 'ct';
  if (has('cardiac')) return 'cardiac_output';
  if (has('photoelectric')) return 'photoelectric';
  if (has('xray')) return 'xray_emax';
  if (has('ultrasound') && has('transmission')) return 'ultrasound_transmission_pct';
  if (has('ultrasound') && has('intensity')) return 'ultrasound_transmitted_intensity';
  if (has('shielding') && has('dual-board')) return 'shielding_dual_board';
  if (has('shielding')) return 'shielding_intensity';
  if (has('decay') && has('half-life')) return 'decay_half_life';
  if (has('decay')) return 'decay_lambda';
  if (has('sound') && has('loudspeaker')) return 'sound_loudspeaker_pressure';
  if (has('acoustics')) return 'acoustic_impedance';
  if (has('sound')) return 'sound';
  if (has('vision') && has('microscope')) return 'microscope';
  if (has('vision') && has('near-point')) return 'nearpoint';
  if (has('vision') && has('far-point')) return 'farpoint';
  if (has('vision')) return 'eye';
  return '';
}

function inferBiofyzTypeKeyFromText(rawText = '') {
  const text = normalizeInferenceText(rawText);
  if (!text) return '';
  const has = (re) => re.test(text);
  if (has(/m[_\s]*\{?obj\}?|m[_\s]*\{?eye\}?|objective magnification|eyepiece magnification|magnification of objective/)) return 'microscope_magnification';
  if (has(/reynolds|\\mathrm\{re\}|reynoldsovo/) && has(/\\rho|rho|\\mu|mu|viscos/)) return 'reynolds';
  if (has(/nernst|c[_\s]*\{?ext\}?|c[_\s]*\{?int\}?|faraday|ion valence|membranov/)) return 'nernst';
  if (has(/grams of nacl|mass of nacl|must be added to .*water/) && has(/final solution|target concentration|molar concentration|mol\/l|mol\\cdot/)) return 'molarity_mass_from_c';
  if (has(/sbp|dbp|mean arterial pressure|mean blood pressure/) && has(/mmhg/) && has(/kpa/)) return 'arterial_mean_bp';
  if (has(/v[_\s]*h[_\s]*2o|dilution|added water volume|saline/) && has(/c[_\s]*1|target concentration|c final|c_?final/)) return 'molarity_dilution';
  if (has(/molar concentration|physiological concentration|c[_\s]*phys|mol\/l|nacl/)) return 'molarity_c';
  if (has(/ct number|hounsfield|\bhu\b|mu[_\s]*\{?water\}?/)) return 'ct';
  if (has(/de ?broglie|electron microscope/) && has(/wavelength|\\lambda|planck/)) return 'debroglie';
  if (has(/numerical aperture|\bna\b/) && has(/resolution|wavelength|\\lambda/)) return 'microscope';
  if (has(/near point|\bnp\b|optical power/) && has(/diopter|\bd\b/)) return 'nearpoint';
  if (has(/far point|\bfp\b|optical power/) && has(/diopter|\bd\b/)) return 'farpoint';
  if (has(/loudspeaker|membrane/) && has(/acoustic pressure|\\bp\\b/) && has(/frequency|hz/)) return 'sound_loudspeaker_pressure';
  if (has(/ultrasound|acoustic impedance|z[_\s]*1|z[_\s]*2/)) {
    if (has(/transmitted intensity|i[_\s]*t|i[_\s]*0/)) return 'ultrasound_transmitted_intensity';
    return 'ultrasound_transmission_pct';
  }
  if (has(/half value layer|hvl|shielding|d[_\s]*1\/2|t[_\s]*1\/2/) && has(/intensity|i[_\s]*0|i[_\s]*t/)) return 'shielding_intensity';
  if (has(/a[_\s]*tot|dual board|t[_\s]*2/)) return 'shielding_dual_board';
  if (has(/dose equivalent|q[_\s]*gamma|q[_\s]*n|msv/)) return 'dose_equivalent_mixed';
  return '';
}

export function getBiofyzTtsTermMapForType(typeKey) {
  const key = String(typeKey || '').trim().toLowerCase();
  return key && BIOFYZ_TYPE_TTS_TERM_MAP[key] ? BIOFYZ_TYPE_TTS_TERM_MAP[key] : null;
}

export function inferBiofyzTypeKeyForCard(card, { text = '' } = {}) {
  if (!card || typeof card !== 'object') return '';
  const fromId = inferBiofyzTypeKeyFromId(card.id);
  if (fromId) return fromId;
  const fromTags = inferBiofyzTypeKeyFromTags(card.tags);
  if (fromTags) return fromTags;
  const combined = [text, card.front_text, card.front, card.back_text, card.back]
    .filter(Boolean)
    .join(' ');
  return inferBiofyzTypeKeyFromText(combined);
}

export function inferBiofyzTtsTermMapForCard(card, { text = '' } = {}) {
  const key = inferBiofyzTypeKeyForCard(card, { text });
  return getBiofyzTtsTermMapForType(key);
}

const REYNOLDS_TARGETS = ['Re', 'v', 'r'];
const REYNOLDS_VARIABLES = ['rho', 'v', 'r', 'mu', 'Re'];
const REYNOLDS_CONSTANTS = {
  rho: {
    si: 1060,
    displays: [
      { label: 'kg/m^3', value: 1060, step: 1 }
    ]
  },
  mu: {
    si: 0.003,
    displays: [
      { label: 'Pa*s', value: 0.003, step: 0.0001 }
    ]
  }
};
const REYNOLDS_PROMPT_VARIANTS = {
  Re: {
    area: [
      'Calculate the Reynolds number in the stenotic part of the artery, where the speed of blood is $${v}$ and its cross section is $${A}$.',
      'Calculate the Reynolds number in a given artery if the speed of blood is $${v}$ and the cross-section is $${A}$.'
    ],
    radius: [
      'Calculate the value of the Reynolds number, if the radius of the artery is $${r}$ and blood velocity in it is $${v}$.',
      'Determine the Reynolds number in an artery where the radius is $${r}$ and blood velocity is $${v}$.'
    ]
  },
  v: {
    area: [
      'Calculate the average speed of blood in given artery if the Reynolds number is equal to $${Re}$ and cross-section of artery is $${A}$.',
      'Determine the average blood velocity if the Reynolds number is $${Re}$ and the cross-section of the artery is $${A}$.'
    ],
    radius: [
      'Calculate the average speed of blood in given artery if the Reynolds number is equal to $${Re}$ and radius of artery is $${r}$.',
      'Determine the blood velocity in an artery if the Reynolds number is $${Re}$ and its radius is $${r}$.'
    ]
  },
  r: {
    radius: [
      'Calculate the radius of the artery if the Reynolds number is equal to $${Re}$ and blood velocity is $${v}$.',
      'Determine the artery radius when the Reynolds number is $${Re}$ and blood velocity is $${v}$.'
    ]
  }
};

const NERNST_CONSTANTS = {
  R: 8.314,
  F: 96481
};
const NERNST_CONST_DISPLAY = {
  R: '8.314',
  F: '9.6481 \\times 10^{4}'
};
const NERNST_FIXED = {
  T: 310.15
};
const NERNST_Z_VALUES = [-1, 1];
const NERNST_SPECS = {
  U: { unit: 'mV', min: -150, max: 150, step: 0.1 },
  T: { unit: 'K', step: 0.01 },
  c_ext: { unit: 'mM', min: 1, max: 150, step: 1 },
  c_int: { unit: 'mM', min: 1, max: 150, step: 1 },
  z: { unit: '', values: NERNST_Z_VALUES.slice() }
};
const NERNST_TARGETS = ['U'];
const NERNST_GIVEN_ORDER = ['T', 'z', 'c_ext', 'c_int'];

const OSMOTIC_CONSTANTS = {
  R: 8.314,
  i: 1,
  molarMass: 180,
  tempOffset: 273.15
};
const OSMOTIC_T_C = { min: 20, max: 30, step: 1 };
const OSMOTIC_C_PCT = { min: 1.0, max: 5.0, step: 0.1 };
const OSMOTIC_SPEC = { unit: 'kPa', min: 100, max: 800, step: 1 };
const OSMOTIC_ISOTONIC_C_NACL_MMOL = { min: 110, max: 160, step: 1 };
const OSMOTIC_ISOTONIC_VOL_ML = { min: 50, max: 150, step: 1 };
const OSMOTIC_ISOTONIC_I_NACL = 2;
const OSMOTIC_ISOTONIC_I_GLUCOSE = 1;
const OSMOTIC_ISOTONIC_M_GLUCOSE = 180;
const OSMOTIC_ISOTONIC_D_RANGE = { min: 3.0, max: 7.0 };
const OSMOTIC_ISOTONIC_ANSWER_STEP = 0.01;
const OSMOTIC_TARGETS = ['pi'];
const ECG_LEAD_TYPES = ['avf_zero', 'avl_zero'];
const ECG_UNIT = 'mV';
const ECG_PRACTICAL_TYPES = ['axis', 'rate'];
const ECG_AXIS_NET_RANGE = { min: 2, max: 15 };
const ECG_QRS_Q_RANGE = { min: 0, max: 4 };
const ECG_QRS_S_RANGE = { min: 0, max: 4 };
const ECG_QRS_R_RANGE = { min: 5, max: 25 };
const ECG_PAPER_SPEED_MM_S = 25;
const ECG_STRIP_SECONDS = 10;
const ECG_HR_RANGE = { min: 60, max: 120 };
const ECG_STRIP_TOTAL_MM = ECG_PAPER_SPEED_MM_S * ECG_STRIP_SECONDS;
const ECG_RR_N_RANGE = { min: 2, max: 12 };
const ECG_SMALL_BOX_MM = 1;
const ECG_LARGE_BOX_MM = 5;
const ECG_SMALL_BOX_MV = 0.1;
const ECG_LARGE_BOX_SYMBOL = '\u2610';
const ECG_SMALL_BOX_SYMBOL = '\u25A1';
const ECG_I_SPECS = {
  avf_zero: { min: 0.4, max: 1.0, step: 0.1 },
  avl_zero: { min: 0.1, max: 0.6, step: 0.1 }
};
const ECG_ANSWER_STEPS = {
  avf_zero: 0.05,
  avl_zero: 0.1
};
const ECG_OPTION_RANGES = {
  avf_zero: { min: -0.8, max: 0.8 },
  avl_zero: { min: 0.1, max: 1.4 }
};
const EF_PERCENT_SPEC = { min: 30, max: 50, step: 2 };
const EF_PERCENT_MAX = 70;
const EF_MIN_INCREASE = 6;
const EF_DECREASE_RANGE = { min: 5, max: 60 };
const EF_SV_ML = { min: 50, max: 120, step: 1 };
const EF_ESV_OF_SV_PCT = { min: 40, max: 85, step: 1 };
const CARDIAC_OUTPUT_HR_BPM = { min: 55, max: 120, step: 1 };
const CARDIAC_OUTPUT_SV_ML = { min: 45, max: 110, step: 1 };
const CARDIAC_OUTPUT_SYS_BP = { min: 100, max: 150, step: 1 };
const CARDIAC_OUTPUT_DIA_BP = { min: 60, max: 95, step: 1 };
const CARDIAC_OUTPUT_EF_PCT = { min: 35, max: 75, step: 1 };
const CARDIAC_OUTPUT_ANSWER_STEP = 0.01;
const ARTERIAL_AREA_DEC_PCT = { min: 5, max: 15, step: 1 };
const ARTERIAL_RATIO_SIGFIG = 4;
const ARTERIAL_ANSWER_STEP = 0.1;
const ARTERIAL_MEAN_BP_SBP_MMHG = { min: 100, max: 190, step: 1 };
const ARTERIAL_MEAN_BP_DBP_MMHG = { min: 50, max: 110, step: 1 };
const ARTERIAL_MMHG_TO_PA = 133.3;
const ARTERIAL_MEAN_BP_ANSWER_STEP = 0.01;
const ARTERIAL_PULMONARY_VA_MS = { min: 0.3, max: 0.7, step: 0.1 };
const ARTERIAL_PULMONARY_Q_L_MIN = { min: 2.5, max: 6.0, step: 0.1 };
const ARTERIAL_PULMONARY_AREA_INC_PCT = { min: 10, max: 30, step: 1 };
const ARTERIAL_PULMONARY_ANSWER_STEP = 0.001;
const ARTERIAL_ANEURYSM_P1_KPA = { min: 1.0, max: 2.0, step: 0.1 };
const ARTERIAL_ANEURYSM_V1_MS = { min: 0.2, max: 0.6, step: 0.1 };
const ARTERIAL_ANEURYSM_AREA_INC_PCT = { min: 20, max: 60, step: 1 };
const ARTERIAL_ANEURYSM_RHO = 1060;
const ARTERIAL_ANEURYSM_ANSWER_STEP = 0.1;
const PHOTON_WAVELENGTH_PHOTON_COEFF = { min: 2.5, max: 5.0, step: 0.1 };
const PHOTON_WAVELENGTH_PHOTON_EXP = 16;
const PHOTON_WAVELENGTH_INTENSITY_MW = { min: 5, max: 20, step: 1 };
const PHOTON_WAVELENGTH_H = 6.626e-34;
const PHOTON_WAVELENGTH_C = 3.0e8;
const PHOTON_WAVELENGTH_RANGE_NM = { min: 200, max: 1400 };
const PHOTON_ENERGY_WAVELENGTH_NM = { min: 400, max: 700, step: 1 };
const PHOTON_ENERGY_POWER_MW = { min: 20.0, max: 200.0, step: 0.1 };
const PHOTON_ENERGY_SCALE_EXP = -19;
const PHOTON_ENERGY_COEFF_RANGE = { min: 2.0, max: 6.0 };
const PHOTON_ENERGY_ANSWER_STEP = 0.01;
const PHOTOELECTRIC_WORK_PCT = { min: 3, max: 15, step: 1 };
const PHOTOELECTRIC_ANSWER_STEP = 0.01;
const XRAY_EMAX_VOLTAGE_KV = { min: 80.0, max: 250.0, step: 0.1 };
const XRAY_ELEMENTARY_CHARGE = 1.602e-19;
const XRAY_EMAX_SCALE_EXP = -14;
const XRAY_EMAX_COEFF_RANGE = { min: 1.2, max: 4.2 };
const XRAY_EMAX_ANSWER_STEP = 0.01;
const SOUND_PIPE_LEVEL_DB = { min: 60, max: 100, step: 2 };
const SOUND_PIPE_COUNT = { min: 2, max: 20, step: 1 };
const SOUND_ANSWER_STEP = 0.1;
const SOUND_LOUDSPEAKER_FREQ_HZ = { min: 80, max: 320, step: 10 };
const SOUND_LOUDSPEAKER_DISP_MM = { min: 0.05, max: 0.25, step: 0.01 };
const SOUND_LOUDSPEAKER_MEDIA = [
  { key: 'air', label: 'air', rho: 1.2, c: 340 },
  { key: 'water', label: 'water', rho: 1000, c: 1480 }
];
const SOUND_LOUDSPEAKER_SQRT2 = Math.sqrt(2);
const SOUND_LOUDSPEAKER_ANSWER_STEP = 0.1;
const ACOUSTIC_IMPEDANCE_RHO_AIR = { min: 1.1, max: 1.3, step: 0.1 };
const ACOUSTIC_IMPEDANCE_SOUND_SPEED_AIR = { min: 330, max: 350, step: 1 };
const ACOUSTIC_IMPEDANCE_ANSWER_STEP = 1;
const EYE_RESOLUTION_DISTANCE_MM = { min: 2.0, max: 5.0, step: 0.1 };
const EYE_RESOLUTION_ALPHA_DEG = 1 / 60;
const EYE_RESOLUTION_ANSWER_STEP = 0.1;
const MICROSCOPE_NA = { min: 1.0, max: 1.4, step: 0.1 };
const MICROSCOPE_LAMBDA_NM = { min: 400, max: 700, step: 10 };
const MICROSCOPE_ALPHA_DEG = { min: 35, max: 70, step: 1 };
const MICROSCOPE_REFRACTIVE_INDEX_OPTIONS = [1.0, 1.33, 1.52];
const MICROSCOPE_ANSWER_STEP = 0.1;
const MICROSCOPE_NA_ANSWER_STEP = 0.001;
const MICROSCOPE_MAG_OBJECTIVE = { min: 20, max: 120, step: 1 };
const MICROSCOPE_MAG_EYEPIECE = { min: 4, max: 20, step: 1 };
const MICROSCOPE_MAG_ANSWER_STEP = 1;
const NEAR_POINT_POWER_D = { min: 0.5, max: 3.0, step: 0.25 };
const NEAR_POINT_REF_M = 0.25;
const NEAR_POINT_ANSWER_STEP = 0.001;
const FAR_POINT_POWER_D = { min: -3.0, max: -0.25, step: 0.25 };
const FAR_POINT_ANSWER_STEP = 0.001;
const DEBROGLIE_VOLTAGE_KV = { min: 2.0, max: 10.0, step: 0.2 };
const DEBROGLIE_H = 6.626e-34;
const DEBROGLIE_E = 1.602e-19;
const DEBROGLIE_M = 9.11e-31;
const DEBROGLIE_ANSWER_STEP = 0.001;
const DECAY_TIME_HOURS = { min: 6, max: 48, step: 1 };
const DECAY_GAP_HOURS = { min: 40, max: 400, step: 5 };
const DECAY_ACTIVITY_MBQ = { min: 1.0, max: 6.0, step: 0.01 };
const DECAY_LAMBDA_RANGE = { min: 0.001, max: 0.02 };
const DECAY_ANSWER_STEP = 0.00001;
const DECAY_HALF_LIFE_TIME_HOURS = { min: 0.5, max: 4.0, step: 0.1 };
const DECAY_HALF_LIFE_ACTIVITY_KBQ = { min: 500, max: 1200, step: 1 };
const DECAY_HALF_LIFE_TARGET_HOURS = { min: 0.4, max: 4.0, step: 0.1 };
const DECAY_HALF_LIFE_ANSWER_STEP = 0.01;
const EAR_CANAL_LENGTH_CM = { min: 2.0, max: 3.5, step: 0.1 };
const EAR_CANAL_C = 340;
const EAR_CANAL_ANSWER_STEP = 1;
const ULTRASOUND_Z1 = { min: 1, max: 4, step: 1 };
const ULTRASOUND_Z2 = { min: 2, max: 6, step: 1 };
const ULTRASOUND_INTERFACE_I0_W_CM2 = { min: 2.0, max: 12.0, step: 0.5 };
const ULTRASOUND_ANSWER_STEP = 0.1;
const ULTRASOUND_I0_MW_CM2 = { min: 5.0, max: 20.0, step: 0.1 };
const ULTRASOUND_C1_MS = { min: 1400, max: 1650, step: 10 };
const ULTRASOUND_C2_MS = { min: 1450, max: 1700, step: 10 };
const ULTRASOUND_INTENSITY_ANSWER_STEP = 0.001;
const SHIELD_HALF_LIFE_DAYS = { min: 0.5, max: 2.0, step: 0.5 };
const SHIELD_HVL_CM = { min: 5, max: 15, step: 1 };
const SHIELD_THICKNESS_CM = { min: 10, max: 30, step: 1 };
const SHIELD_TIME_DAYS = { min: 0, max: 3, step: 1 };
const SHIELD_ANSWER_STEP = 0.1;
const SHIELD_BOARD_ABSORB_PCT = { min: 30.0, max: 85.0, step: 0.1 };
const SHIELD_BOARD_TRANSMIT_PCT = { min: 30.0, max: 85.0, step: 0.1 };
const SHIELD_BOARD_ANSWER_STEP = 0.1;
const DOSE_EQ_TOTAL_MGY = { min: 12.0, max: 60.0, step: 0.1 };
const DOSE_EQ_GAMMA_PCT = { min: 20.0, max: 80.0, step: 0.1 };
const DOSE_EQ_Q_GAMMA = 1;
const DOSE_EQ_Q_NEUTRON_OPTIONS = [5, 10, 15];
const DOSE_EQ_ANSWER_STEP = 0.1;
const CT_LAYER_THICKNESS_MM = { min: 20, max: 50, step: 1 };
const CT_N1_COUNTS = { min: 180, max: 320, step: 1 };
const CT_WATER_MU = 0.19;
const CT_TARGET_HU = { min: 120, max: 900, step: 1 };
const CT_HU_RANGE = { min: 100, max: 999 };
const CT_ANSWER_STEP = 1;
const MEDIAN_COUNT_OPTIONS = [5, 6, 7, 8];
const MEDIAN_VALUE_RANGE = { min: 10, max: 35 };
const MEDIAN_ANSWER_STEP = 0.1;
const QUARTILE_COUNT_OPTIONS = [6, 7, 9, 10];
const QUARTILE_VALUE_RANGE = { min: 120, max: 360 };
const QUARTILE_ANSWER_STEP = 0.1;
const IQR_COUNT_OPTIONS = [8, 10, 12];
const IQR_VALUE_RANGE = { min: 10, max: 90 };
const IQR_ANSWER_STEP = 0.1;
const ALPHA_RANGE = { min: 0.01, max: 0.1, step: 0.01 };
const POWER_RANGE = { min: 0.8, max: 0.99, step: 0.001 };
const PROBABILITY_ANSWER_STEP = 0.001;
const CI_MEAN_CM = { min: 170, max: 184, step: 1 };
const CI_VARIANCE_CM2 = { min: 4.0, max: 10.0, step: 0.1 };
const CI_N_OPTIONS = [10, 12, 15];
const CI_CONF_LEVELS = [
  { label: '90\\%', p: '0.95', t: { 9: 1.8331, 11: 1.7959, 14: 1.7613 } },
  { label: '99\\%', p: '0.995', t: { 9: 3.2498, 11: 3.1058, 14: 2.9768 } },
  { label: '99.9\\%', p: '0.9995', t: { 9: 4.7809, 11: 4.437, 14: 4.1405 } }
];
const CI_ANSWER_STEP = 0.01;
const CV_SAMPLE_N = 12;
const CV_MEAN = { min: 15, max: 30, step: 1 };
const CV_VARIANCE_OPTIONS = [4, 9, 16, 25];
const CV_ANSWER_STEP = 0.1;
const REL_FREQ_COUNT = { min: 10, max: 100, step: 1 };
const REL_FREQ_ANSWER_STEP = 0.001;
const COND_PROB_RANGE = { min: 0.1, max: 0.4, step: 0.01 };
const COND_PROB_ANSWER_STEP = 0.001;
const NEG_PRED_PREV = { min: 0.05, max: 0.2, step: 0.01 };
const NEG_PRED_SENS = { min: 0.85, max: 0.99, step: 0.01 };
const NEG_PRED_SPEC = { min: 0.85, max: 0.99, step: 0.01 };
const NEG_PRED_ANSWER_STEP = 0.001;
const ANSWER_SIGFIG = 3;
const TSTAT_MEAN = { min: 170, max: 184, step: 1 };
const TSTAT_VARIANCE = { min: 4.0, max: 10.0, step: 0.1 };
const TSTAT_N_OPTIONS = [10, 12, 15];
const TSTAT_DELTA = { min: 1.0, max: 4.0, step: 0.5 };
const TSTAT_ANSWER_STEP = 0.01;
const SENS_NEG_POP = { min: 200, max: 600, step: 100 };
const SENS_NEG_SENS = { min: 85, max: 98, step: 1 };
const MOLARITY_MOLAR_MASS = 58.5;
const MOLARITY_MASS_G = { min: 0.8, max: 2.0, step: 0.1 };
const MOLARITY_VOLUME_ML = { min: 100, max: 200, step: 10 };
const MOLARITY_PHYS_G_PER_L = 9.0;
const MOLARITY_MASS_FROM_C_VOLUME_ML = 93;
const MOLARITY_MASS_FROM_C_TARGET_C = 0.1539;
const MOLARITY_DILUTION_C1_PCT = 0.9;
const MOLARITY_DILUTION_V1_ML = { min: 80, max: 220, step: 1 };
const MOLARITY_DILUTION_CF_PCT = { min: 0.3, max: 0.8, step: 0.1 };
const MOLARITY_DILUTION_ANSWER_STEP = 1;

const AREA_GIVEN_PROB = 0.35;
const AREA_SPEC = {
  label: 'A',
  unit: 'cm^2',
  min: 1.0,
  max: 5.0,
  step: 0.1
};

const VAR_SPECS = {
  rho: {
    label: 'rho',
    siUnit: 'kg/m^3',
    range: [1000, 1100],
    siStep: 10,
    units: [
      { label: 'g/cm^3', min: 1.00, max: 1.10, step: 0.01, toSI: (v) => v * 1000 }
    ]
  },
  v: {
    label: 'v',
    siUnit: 'm/s',
    range: [0.10, 0.40],
    siStep: 0.01,
    units: [
      { label: 'cm/s', min: 10, max: 40, step: 1, toSI: (v) => v / 100 },
      { label: 'mm/s', min: 100, max: 400, step: 10, toSI: (v) => v / 1000 }
    ]
  },
  r: {
    label: 'r',
    siUnit: 'm',
    range: [0.003, 0.015],
    siStep: 0.0005,
    units: [
      { label: 'cm', min: 0.30, max: 1.50, step: 0.05, toSI: (v) => v / 100 },
      { label: 'mm', min: 3, max: 15, step: 1, toSI: (v) => v / 1000 }
    ]
  },
  mu: {
    label: 'mu',
    siUnit: 'Pa*s',
    range: [0.003, 0.005],
    siStep: 0.0001,
    units: [
      { label: 'cP', min: 3.0, max: 5.0, step: 0.1, toSI: (v) => v * 0.001 },
      { label: 'mPa*s', min: 3.0, max: 5.0, step: 0.1, toSI: (v) => v * 0.001 }
    ]
  },
  Re: {
    label: 'Re',
    siUnit: '',
    range: [500, 1500],
    siStep: 10,
    units: [
      { label: '', min: 500, max: 1500, step: 10, toSI: (v) => v }
    ]
  }
};

const LABEL_ALIASES = {
  mu: ['eta']
};

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function mergeBiofyzPrefs(source, defaults) {
  const out = { ...defaults };
  if (!source || typeof source !== 'object') return out;
  Object.keys(out).forEach(key => {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      out[key] = source[key] !== false;
    }
  });
  const legacyGroups = {
    osmotic: ['osmotic_pi', 'osmotic_isotonic'],
    molarity: ['molarity_c', 'molarity_dilution', 'molarity_mass_from_c'],
    arterial: ['arterial', 'arterial_mean_bp', 'arterial_aneurysm', 'arterial_pulmonary_speed'],
    photon: ['photon_lambda', 'photon_energy'],
    sound: ['sound', 'sound_loudspeaker_pressure'],
    nearpoint: ['nearpoint', 'farpoint'],
    decay: ['decay_lambda', 'decay_half_life'],
    ultrasound: ['ultrasound_transmission_pct', 'ultrasound_transmitted_intensity'],
    shielding: ['shielding_intensity', 'shielding_dual_board'],
    condprob: ['condprob_cond', 'condprob_neither'],
    hypotest: ['hypotest_alpha', 'hypotest_power'],
    negpred: ['negpred_npv', 'negpred_ppv'],
    ecg: ['ecg_avf_zero', 'ecg_avl_zero'],
    ecgprac: ['ecgprac_axis', 'ecgprac_rate'],
    ef: ['ef_esv_decrease', 'ef_from_sv_esv']
  };
  Object.entries(legacyGroups).forEach(([legacyKey, splitKeys]) => {
    if (!Object.prototype.hasOwnProperty.call(source, legacyKey)) return;
    const legacyEnabled = source[legacyKey] !== false;
    splitKeys.forEach(splitKey => {
      if (!Object.prototype.hasOwnProperty.call(source, splitKey) && Object.prototype.hasOwnProperty.call(out, splitKey)) {
        out[splitKey] = legacyEnabled;
      }
    });
  });
  if (Object.prototype.hasOwnProperty.call(source, 'alpha') && !Object.prototype.hasOwnProperty.call(source, 'hypotest_alpha')) {
    out.hypotest_alpha = source.alpha !== false;
  }
  if (Object.prototype.hasOwnProperty.call(source, 'power') && !Object.prototype.hasOwnProperty.call(source, 'hypotest_power')) {
    out.hypotest_power = source.power !== false;
  }
  return out;
}

function loadBiofyzPrefs() {
  const defaults = { ...BIOFYZ_DEFAULT_PREFS };
  if (typeof localStorage === 'undefined') return defaults;
  try {
    const raw = localStorage.getItem(BIOFYZ_PREFS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return mergeBiofyzPrefs(parsed, defaults);
  } catch {
    return defaults;
  }
}

function getBiofyzPrefs() {
  const defaults = { ...BIOFYZ_DEFAULT_PREFS };
  try {
    const globalPrefs = typeof globalThis !== 'undefined' ? globalThis.__biofyzPrefs : null;
    if (globalPrefs && typeof globalPrefs === 'object') {
      return mergeBiofyzPrefs(globalPrefs, defaults);
    }
  } catch {}
  return loadBiofyzPrefs();
}

export function isGeneratorPath(path) {
  if (!isNonEmptyString(path)) return false;
  return String(path).trim().toLowerCase().startsWith(GENERATOR_PREFIX);
}

function parseGeneratorPath(path) {
  if (!isGeneratorPath(path)) return null;
  const raw = String(path).trim().slice(GENERATOR_PREFIX.length);
  const [namePart, queryPart] = raw.split('?');
  const name = String(namePart || '').trim().toLowerCase();
  const params = {};
  if (queryPart) {
    queryPart.split('&').forEach(pair => {
      if (!pair) return;
      const [k, v] = pair.split('=');
      const key = decodeURIComponent(String(k || '').trim());
      if (!key) return;
      const val = decodeURIComponent(String(v || '').trim());
      params[key] = val;
    });
  }
  return { name, params };
}

function parseTypeList(raw) {
  if (!isNonEmptyString(raw)) return [];
  return String(raw)
    .split(/[,\s|]+/)
    .map(part => part.trim().toLowerCase())
    .filter(Boolean);
}

function expandLegacyBiofyzTypeKeys(typeKeys = []) {
  const out = new Set();
  const legacyGroups = {
    osmotic: ['osmotic_pi', 'osmotic_isotonic'],
    molarity: ['molarity_c', 'molarity_dilution', 'molarity_mass_from_c'],
    arterial: ['arterial', 'arterial_mean_bp', 'arterial_aneurysm', 'arterial_pulmonary_speed'],
    photon: ['photon_lambda', 'photon_energy'],
    sound: ['sound', 'sound_loudspeaker_pressure'],
    decay: ['decay_lambda', 'decay_half_life'],
    ultrasound: ['ultrasound_transmission_pct', 'ultrasound_transmitted_intensity'],
    shielding: ['shielding_intensity', 'shielding_dual_board'],
    condprob: ['condprob_cond', 'condprob_neither'],
    hypotest: ['hypotest_alpha', 'hypotest_power'],
    negpred: ['negpred_npv', 'negpred_ppv'],
    ecg: ['ecg_avf_zero', 'ecg_avl_zero'],
    ecgprac: ['ecgprac_axis', 'ecgprac_rate'],
    ef: ['ef_esv_decrease', 'ef_from_sv_esv']
  };
  (Array.isArray(typeKeys) ? typeKeys : []).forEach(rawKey => {
    const key = String(rawKey || '').trim().toLowerCase();
    if (!key) return;
    if (legacyGroups[key]) {
      legacyGroups[key].forEach(k => out.add(k));
      return;
    }
    out.add(key);
  });
  return Array.from(out);
}

export function generateDeckForPath(path) {
  const spec = parseGeneratorPath(path);
  if (!spec) return null;
  if (spec.name === 'reynolds' || spec.name === 'reynolds-number') {
    const count = Math.max(1, parseInt(spec.params.count || spec.params.n || DEFAULT_REYNOLDS_COUNT, 10) || DEFAULT_REYNOLDS_COUNT);
    return generateReynoldsDeck({ count });
  }
  if (spec.name === 'nernst') {
    const count = Math.max(1, parseInt(spec.params.count || spec.params.n || DEFAULT_NERNST_COUNT, 10) || DEFAULT_NERNST_COUNT);
    return generateNernstDeck({ count });
  }
  if (spec.name === 'osmotic' || spec.name === 'osmotic-pressure') {
    const count = Math.max(1, parseInt(spec.params.count || spec.params.n || DEFAULT_OSMOTIC_COUNT, 10) || DEFAULT_OSMOTIC_COUNT);
    return generateOsmoticDeck({ count });
  }
  if (spec.name === 'biofyz' || spec.name === 'bio') {
    const count = Math.max(1, parseInt(spec.params.count || spec.params.n || DEFAULT_BIOFYZ_COUNT, 10) || DEFAULT_BIOFYZ_COUNT);
    const typesRaw = spec.params.types || spec.params.type || spec.params.t || '';
    const enabledTypes = parseTypeList(typesRaw);
    return generateBiofyzDeck({ count, enabledTypes });
  }
  throw new Error(`Unknown generator: ${spec.name || String(path || '')}`);
}

function randStep(rng, min, max, step) {
  const lo = Number(min);
  const hi = Number(max);
  const st = Number(step);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return NaN;
  if (!Number.isFinite(st) || st <= 0) return lo + (hi - lo) * rng();
  const steps = Math.max(0, Math.round((hi - lo) / st));
  const k = Math.floor(rng() * (steps + 1));
  return lo + (k * st);
}

function randInt(rng, min, max) {
  return Math.round(randStep(rng, min, max, 1));
}

function randSignedInt(rng, minAbs, maxAbs) {
  const abs = Math.max(1, randInt(rng, minAbs, maxAbs));
  const sign = rng() < 0.5 ? -1 : 1;
  return abs * sign;
}

function formatBoxPhrase(largeCount, smallCount) {
  const parts = [];
  if (largeCount > 0) {
    parts.push(`${largeCount} large box${largeCount === 1 ? '' : 'es'}`);
  }
  if (smallCount > 0) {
    parts.push(`${smallCount} small box${smallCount === 1 ? '' : 'es'}`);
  }
  if (!parts.length) {
    parts.push('0 small boxes');
  }
  return parts.join(' + ');
}

function formatRrBoxPhrase(largeCount, smallCount, index) {
  return `$RR_{${index}} = ${largeCount}\\,\\text{${ECG_LARGE_BOX_SYMBOL}} + ${smallCount}\\,\\text{${ECG_SMALL_BOX_SYMBOL}}$`;
}

function formatRrTotalPhrase(totalLarge, totalSmall) {
  return `$RR_{\\mathrm{total}} = ${totalLarge}\\,\\text{${ECG_LARGE_BOX_SYMBOL}} + ${totalSmall}\\,\\text{${ECG_SMALL_BOX_SYMBOL}}$`;
}

function formatSignedBoxSymbols(magnitude, signChar) {
  const abs = Math.abs(Number(magnitude) || 0);
  const large = Math.floor(abs / ECG_LARGE_BOX_MM);
  const small = abs % ECG_LARGE_BOX_MM;
  if (!large && !small) return '0';
  const sign = signChar === '-' ? '-' : '+';
  let out = '';
  if (large) out = `${sign}${large}\\,\\text{${ECG_LARGE_BOX_SYMBOL}}`;
  if (small) {
    const join = sign === '-' ? '-' : '+';
    out = out ? `${out} ${join} ${small}\\,\\text{${ECG_SMALL_BOX_SYMBOL}}` : `${sign}${small}\\,\\text{${ECG_SMALL_BOX_SYMBOL}}`;
  }
  return out;
}

function buildLeadQrsLine(label, q, r, s) {
  const sub = `\\mathrm{${label}}`;
  const qLine = `Q_{${sub}} = ${formatSignedBoxSymbols(q, '-')}`;
  const rLine = `R_{${sub}} = ${formatSignedBoxSymbols(r, '+')}`;
  const sLine = `S_{${sub}} = ${formatSignedBoxSymbols(s, '-')}`;
  return `$${qLine},\\; ${rLine},\\; ${sLine}$`;
}

function buildRandomLeadQrs(rng) {
  const maxAttempts = 120;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const q = randInt(rng, ECG_QRS_Q_RANGE.min, ECG_QRS_Q_RANGE.max);
    const s = randInt(rng, ECG_QRS_S_RANGE.min, ECG_QRS_S_RANGE.max);
    const r = randInt(rng, ECG_QRS_R_RANGE.min, ECG_QRS_R_RANGE.max);
    const net = r - q - s;
    if (!Number.isFinite(net) || net === 0) continue;
    const absNet = Math.abs(net);
    if (absNet < ECG_AXIS_NET_RANGE.min || absNet > ECG_AXIS_NET_RANGE.max) continue;
    return { q, r, s, net };
  }
  return null;
}

function buildAngleAcceptList(valueDeg, tolerance = 15) {
  const base = Math.round(Number(valueDeg) || 0);
  const out = new Set();
  for (let d = -tolerance; d <= tolerance; d += 1) {
    const v = base + d;
    out.add(String(v));
    out.add(`${v}°`);
    out.add(`${v} deg`);
    out.add(`${v} degrees`);
  }
  return Array.from(out);
}

function buildNumericToleranceAccept(value, tolerance = 2, unit = '') {
  const base = Math.round(Number(value) || 0);
  const out = new Set();
  for (let d = -tolerance; d <= tolerance; d += 1) {
    const v = base + d;
    out.add(String(v));
    if (unit) {
      out.add(`${v} ${unit}`);
      out.add(`${v}${unit}`);
    }
  }
  return Array.from(out);
}

function pickUnitOption(varKey, rng) {
  const spec = VAR_SPECS[varKey];
  const list = spec?.units || [];
  if (!list.length) return null;
  const idx = Math.floor(rng() * list.length);
  return list[idx];
}

function pickConstantDisplay(varKey, rng) {
  const constant = REYNOLDS_CONSTANTS[varKey];
  if (!constant) return null;
  const list = constant.displays || [];
  if (!list.length) return { label: '', value: constant.si, step: 0 };
  const idx = Math.floor(rng() * list.length);
  return list[idx] || list[0];
}

function buildGivenEntry(varKey, rng) {
  const constant = REYNOLDS_CONSTANTS[varKey];
  if (constant) {
    const display = pickConstantDisplay(varKey, rng);
    return {
      unit: { label: display.label || '', step: display.step },
      displayValue: display.value,
      siValue: constant.si
    };
  }
  const unit = pickUnitOption(varKey, rng);
  if (!unit) return null;
  const displayValue = randStep(rng, unit.min, unit.max, unit.step);
  const siValue = unit.toSI(displayValue);
  return { unit, displayValue, siValue };
}

function formatReynoldsPromptValue(entry, { includeUnit = true } = {}) {
  if (!entry) return '';
  const step = entry.unit?.step;
  const display = Number.isFinite(step)
    ? formatByStep(entry.displayValue, step)
    : formatSigFig(entry.displayValue, 3);
  if (!includeUnit) return `${display}`;
  const unit = entry.unit?.label || '';
  const unitLatex = unit ? formatUnitLatex(unit) : '';
  return unitLatex ? `${display}\\,${unitLatex}` : `${display}`;
}

function pickReynoldsPrompt(templateList, rng) {
  if (!Array.isArray(templateList) || !templateList.length) return '';
  const idx = Math.floor(rng() * templateList.length);
  return templateList[idx] || '';
}

function buildReynoldsPrompt({ targetKey, useArea, given, rng }) {
  const spec = REYNOLDS_PROMPT_VARIANTS[targetKey];
  if (!spec) return '';
  const key = (targetKey === 'r')
    ? 'radius'
    : (useArea ? 'area' : 'radius');
  const template = pickReynoldsPrompt(spec[key], rng);
  if (!template) return '';
  const replacements = {
    v: formatReynoldsPromptValue(given.v, { includeUnit: true }),
    r: formatReynoldsPromptValue(given.r, { includeUnit: true }),
    A: formatReynoldsPromptValue(given.A, { includeUnit: true }),
    Re: formatReynoldsPromptValue(given.Re, { includeUnit: false })
  };
  return template.replace(/\$\{(v|r|A|Re)\}/g, (_, token) => replacements[token] || '');
}

function buildAreaEntry(rng) {
  const displayValue = randStep(rng, AREA_SPEC.min, AREA_SPEC.max, AREA_SPEC.step);
  const siValue = displayValue * 1e-4; // cm^2 -> m^2
  return {
    unit: { label: AREA_SPEC.unit, step: AREA_SPEC.step },
    displayValue,
    siValue
  };
}

function computeTarget(targetKey, values) {
  const rho = values.rho;
  const v = values.v;
  const r = values.r;
  const mu = values.mu;
  const Re = values.Re;
  if (targetKey === 'Re') return (rho * v * r) / mu;
  if (targetKey === 'v') return (Re * mu) / (rho * r);
  if (targetKey === 'r') return (Re * mu) / (rho * v);
  if (targetKey === 'rho') return (Re * mu) / (v * r);
  if (targetKey === 'mu') return (rho * v * r) / Re;
  return NaN;
}

function expandExponential(str) {
  const match = String(str).match(/^([+-]?\d*\.?\d+)[eE]([+-]?\d+)$/);
  if (!match) return String(str);
  const mantissa = match[1];
  const exp = parseInt(match[2], 10);
  const sign = mantissa.startsWith('-') ? '-' : '';
  const raw = mantissa.replace(/^[+-]/, '');
  const parts = raw.split('.');
  const intPart = parts[0] || '0';
  const fracPart = parts[1] || '';
  const digits = intPart + fracPart;
  const decimalPos = intPart.length + exp;
  if (decimalPos <= 0) {
    return `${sign}0.${'0'.repeat(Math.abs(decimalPos))}${digits}`;
  }
  if (decimalPos >= digits.length) {
    return `${sign}${digits}${'0'.repeat(decimalPos - digits.length)}`;
  }
  return `${sign}${digits.slice(0, decimalPos)}.${digits.slice(decimalPos)}`;
}

function formatSigFig(value, sig = 3) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  if (num === 0) return '0';
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  let str = abs.toPrecision(sig);
  if (str.includes('e') || str.includes('E')) {
    str = expandExponential(str);
  }
  str = str.replace(/(\.\d*?[1-9])0+$/,'$1').replace(/\.0+$/,'').replace(/\.$/,'');
  return sign + str;
}

function formatSigFigStrict(value, sig = 3) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  if (num === 0) return '0';
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  let str = abs.toPrecision(sig);
  if (str.includes('e') || str.includes('E')) {
    str = expandExponential(str);
  }
  return sign + str;
}

function nearlyEqual(a, b, relTol = 1e-12) {
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const scale = Math.max(1, Math.abs(x), Math.abs(y));
  return Math.abs(x - y) <= relTol * scale;
}

function formatAnswer(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  const rounded = Number(num.toPrecision(ANSWER_SIGFIG));
  // If no rounding is needed, allow compact output (per request).
  if (nearlyEqual(num, rounded)) return formatSigFig(num, ANSWER_SIGFIG);
  // If rounding is needed, keep explicit 3 significant figures.
  return formatSigFigStrict(num, ANSWER_SIGFIG);
}

function decimalsFromString(valueStr) {
  const raw = String(valueStr || '').trim();
  const idx = raw.indexOf('.');
  if (idx === -1) return 0;
  return Math.max(0, raw.length - idx - 1);
}

function formatLike(value, templateStr) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  const dec = decimalsFromString(templateStr);
  const rounded = normalizeNegZero(num);
  if (dec <= 0) return String(Math.round(rounded));
  return rounded.toFixed(dec);
}

function formatDummyLike(value, templateStr, { min = null, max = null, rng = Math.random } = {}) {
  const base = formatLike(value, templateStr);
  if (!base) return '';
  const template = String(templateStr || '').trim();
  if (!template) return base;
  if (template.endsWith('0') || !base.endsWith('0')) return base;
  const dec = decimalsFromString(template);
  const step = dec > 0 ? Math.pow(10, -dec) : 1;
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = digits.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [digits[i], digits[j]] = [digits[j], digits[i]];
  }
  const signs = rng() < 0.5 ? [1, -1] : [-1, 1];
  for (const d of digits) {
    for (const sign of signs) {
      const cand = value + sign * d * step;
      if (!Number.isFinite(cand)) continue;
      if (Number.isFinite(min) && cand < min) continue;
      if (Number.isFinite(max) && cand > max) continue;
      const formatted = formatLike(cand, template);
      if (formatted && !formatted.endsWith('0')) return formatted;
    }
  }
  return base;
}

function formatSciLatex(value, sig = 3) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  if (num === 0) return '0';
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  const exp = Math.floor(Math.log10(abs));
  const mantissa = abs / Math.pow(10, exp);
  const mantissaStr = formatSigFig(mantissa, sig);
  if (!mantissaStr) return '';
  return `${sign}${mantissaStr} \\times 10^{${exp}}`;
}

function stripMathDelimiters(str) {
  const raw = String(str || '').trim();
  if (!raw) return '';
  if (raw.startsWith('$') && raw.endsWith('$')) {
    return raw.slice(1, -1).trim();
  }
  return raw;
}

function combineFormulaLine(formulas = []) {
  if (!Array.isArray(formulas)) return '';
  const parts = formulas.map(stripMathDelimiters).filter(Boolean);
  if (!parts.length) return '';
  return `$${parts.join(',\\; ')}$`;
}

function decimalsFromStep(step) {
  const s = String(step);
  if (!s.includes('.')) return 0;
  return s.split('.')[1].length;
}

function formatByStep(value, step) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  const dec = decimalsFromStep(step);
  let out = num.toFixed(dec);
  out = out.replace(/(\.\d*?[1-9])0+$/,'$1').replace(/\.0+$/,'').replace(/\.$/,'');
  return out;
}

function normalizeNegZero(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return num;
  return Math.abs(num) < 1e-9 ? 0 : num;
}

function inferPowerOfTenExponent(fromValue, toValue) {
  const src = Number(fromValue);
  const dst = Number(toValue);
  if (!Number.isFinite(src) || !Number.isFinite(dst) || src === 0) return null;
  const ratio = dst / src;
  if (!Number.isFinite(ratio) || ratio === 0) return null;
  const absRatio = Math.abs(ratio);
  const exp = Math.round(Math.log10(absRatio));
  if (!Number.isFinite(exp)) return null;
  const target = Math.pow(10, exp);
  if (!nearlyEqual(absRatio, target, 1e-10)) return null;
  return exp;
}

function capMcqOptions(options, correctText, cap = MCQ_OPTION_CAP, rng = Math.random) {
  const list = Array.isArray(options) ? options.slice() : [];
  if (!cap || list.length <= cap) return list;
  const pool = list.filter(opt => opt !== correctText);
  const picked = [];
  if (correctText && list.includes(correctText)) picked.push(correctText);
  while (picked.length < cap && pool.length) {
    const idx = Math.floor(rng() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked.length ? picked : list.slice(0, cap);
}

function buildNumericMcqOptions({
  value,
  valueStr = '',
  unit = '',
  step = null,
  rng = Math.random,
  min = 0,
  max = null,
  sig = 3
} = {}) {
  const options = new Set();
  const fallbackStr = (Number.isFinite(step) && step > 0)
    ? formatByStep(value, step)
    : formatSigFig(value, sig);
  const templateStr = String(valueStr || fallbackStr || '').trim();
  const formatVal = (val) => {
    if (!Number.isFinite(val)) return '';
    if (templateStr) return formatDummyLike(val, templateStr, { min, max, rng });
    if (Number.isFinite(step) && step > 0) return formatByStep(val, step);
    return formatSigFig(val, sig);
  };
  const addOption = (val) => {
    if (!Number.isFinite(val)) return;
    if (Number.isFinite(min) && val < min) return;
    if (Number.isFinite(max) && val > max) return;
    let rounded = val;
    if (Number.isFinite(step) && step > 0) {
      rounded = Math.round(val / step) * step;
    }
    const str = formatVal(rounded);
    if (!str) return;
    options.add(formatValueWithUnitLatex(str, unit));
  };

  const correctStr = templateStr || formatVal(value);
  const correctText = formatValueWithUnitLatex(correctStr, unit);
  options.add(correctText);

  const factors = [0.7, 0.85, 1.15, 1.3];
  factors.forEach(f => addOption(value * f));

  let attempts = 0;
  while (options.size < MCQ_OPTION_CAP && attempts < 60) {
    attempts += 1;
    let candidate = value * (1 + (rng() * 0.8 - 0.4));
    if (Number.isFinite(min) && Number.isFinite(max)) {
      candidate = min + (max - min) * rng();
    }
    addOption(candidate);
  }

  const capped = capMcqOptions(Array.from(options), correctText, MCQ_OPTION_CAP, rng);
  return { options: capped, correctText };
}


function buildAcceptList(label, valueStr, unit, aliases = []) {
  const out = new Set();
  if (!valueStr) return [];
  const base = String(valueStr);
  out.add(base);
  if (unit) {
    out.add(`${base} ${unit}`);
    out.add(`${base}${unit}`);
  }
  const labels = [label, ...aliases].filter(Boolean);
  labels.forEach(lab => {
    out.add(`${lab}=${base}`);
    out.add(`${lab} = ${base}`);
    if (unit) {
      out.add(`${lab}=${base} ${unit}`);
      out.add(`${lab} = ${base} ${unit}`);
      out.add(`${lab}=${base}${unit}`);
    }
  });
  return Array.from(out);
}

function buildMcqOptions(targetKey, targetValueSI, rng) {
  const spec = VAR_SPECS[targetKey];
  const min = spec.range[0];
  const max = spec.range[1];
  const step = spec.siStep;
  const correctValue = formatAnswer(targetValueSI);
  const correctText = formatValueWithUnitLatex(correctValue, spec.siUnit);
  const options = new Set([correctText]);
  let attempts = 0;
  while (options.size < 4 && attempts < 80) {
    attempts += 1;
    let candidate = null;
    if (attempts < 24) {
      const factor = 1 + (rng() * 0.4 - 0.2); // +/- 20%
      candidate = targetValueSI * factor;
    } else {
      candidate = randStep(rng, min, max, step);
    }
    if (!Number.isFinite(candidate)) continue;
    if (candidate < min || candidate > max) continue;
    if (Number.isFinite(step) && step > 0) {
      candidate = Math.round(candidate / step) * step;
    }
    const candValue = formatDummyLike(candidate, correctValue, { min, max, rng });
    if (!candValue) continue;
    const candText = formatValueWithUnitLatex(candValue, spec.siUnit);
    if (candText === correctText) continue;
    options.add(candText);
  }
  return { options: Array.from(options), correctText };
}

function latexVarLabel(key) {
  if (key === 'rho') return '\\rho';
  if (key === 'mu') return '\\mu';
  if (key === 'Re') return '\\mathrm{Re}';
  if (key === 'U') return 'U';
  if (key === 'T') return 'T';
  if (key === 'z') return 'z';
  if (key === 'c_ext') return 'c_{ext}';
  if (key === 'c_int') return 'c_{int}';
  if (key === 'R') return 'R';
  if (key === 'F') return 'F';
  if (key === 'A') return 'A';
  if (key === 'pi') return '\\pi';
  if (key === 'i') return 'i';
  if (key === 'C') return 'C';
  return key;
}

function formatUnitLatex(unit) {
  if (!unit) return '';
  const cleaned = String(unit)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\*/g, ' \\times ');
  return `\\mathrm{${cleaned}}`;
}

function formatValueWithUnitLatex(valueStr, unit) {
  const base = String(valueStr || '').trim();
  if (!base) return '';
  if (!unit) return `$${base}$`;
  const unitLatex = formatUnitLatex(unit);
  return `$${base}\\,${unitLatex}$`;
}

function formatUnitInlineLatex(unit) {
  if (!unit) return '';
  return `$${formatUnitLatex(unit)}$`;
}

function formatMathBlockLines(lines = []) {
  if (!Array.isArray(lines) || !lines.length) return '';
  return lines.map((line, idx) => {
    const cls = (idx === lines.length - 1) ? 'math-final' : 'math-step';
    return `<div class="${cls}">${line}</div>`;
  }).join('');
}

function extractGivenItems(lines = []) {
  const items = [];
  lines.forEach((line) => {
    const raw = String(line || '').trim();
    if (!raw) return;
    const segments = raw.match(/\$[^$]+\$/g);
    if (segments && segments.length) {
      segments.forEach(seg => {
        const trimmed = String(seg || '').trim();
        if (trimmed) items.push(trimmed);
      });
    } else {
      items.push(raw);
    }
  });
  return items.filter(Boolean);
}

function buildGivenListLine(lines = []) {
  const items = extractGivenItems(lines);
  if (!items.length) return '';
  const html = items.map((item, idx) => {
    const suffix = idx < items.length - 1 ? ',' : '';
    return `<span class="given-item">${item}${suffix}</span>`;
  }).join(' ');
  return `<div class="math-step given-list">${html}</div>`;
}

function normalizeBracketOrderLatex(expr = '') {
  const input = String(expr ?? '');
  if (!input) return input;
  const expected = [
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: '\\{', close: '\\}' }
  ];
  const isRecognizedDelim = (delim) => delim === '(' || delim === ')' || delim === '[' || delim === ']' || delim === '\\{' || delim === '\\}';
  const tokens = [];
  for (let i = 0; i < input.length; i += 1) {
    if (input.startsWith('\\left', i) || input.startsWith('\\right', i)) {
      const isLeft = input.startsWith('\\left', i);
      let j = i + (isLeft ? 5 : 6);
      while (j < input.length && /\s/.test(input[j])) j += 1;
      if (j >= input.length) continue;
      let delim = input[j];
      let consumed = 1;
      if (delim === '\\') {
        const next = input[j + 1];
        if (next === '{' || next === '}') {
          delim = `\\${next}`;
          consumed = 2;
        }
      }
      if (delim === '.' || !isRecognizedDelim(delim)) {
        i = j + consumed - 1;
        continue;
      }
      tokens.push({
        kind: isLeft ? 'open' : 'close',
        delim,
        start: j,
        end: j + consumed,
        hasLeftRight: true
      });
      i = j + consumed - 1;
      continue;
    }
    const ch = input[i];
    if (ch === '(' || ch === '[') {
      tokens.push({ kind: 'open', delim: ch, start: i, end: i + 1, hasLeftRight: false });
      continue;
    }
    if (ch === ')' || ch === ']') {
      tokens.push({ kind: 'close', delim: ch, start: i, end: i + 1, hasLeftRight: false });
      continue;
    }
    if (ch === '\\') {
      const next = input[i + 1];
      if (next === '{' || next === '}') {
        const delim = `\\${next}`;
        tokens.push({ kind: next === '{' ? 'open' : 'close', delim, start: i, end: i + 2, hasLeftRight: false });
        i += 1;
      }
    }
  }

  const stack = [];
  const pairs = [];
  tokens.forEach((token) => {
    if (token.kind === 'open') {
      const depth = stack.length + 1;
      const pair = { open: token, close: null, depth, maxDepth: depth };
      token.pair = pair;
      pairs.push(pair);
      stack.push(pair);
      return;
    }
    if (!stack.length) return;
    const pair = stack.pop();
    pair.close = token;
    token.pair = pair;
    if (stack.length) {
      const parent = stack[stack.length - 1];
      if (pair.maxDepth > parent.maxDepth) parent.maxDepth = pair.maxDepth;
    }
  });

  const cycle = [
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: '\\{', close: '\\}' }
  ];
  pairs.forEach((pair) => {
    const distance = Math.max(0, pair.maxDepth - pair.depth);
    const expectedPair = cycle[distance % cycle.length];
    pair.normalized = expectedPair;
  });

  const replacements = [];
  tokens.forEach((token) => {
    const pair = token.pair;
    if (!pair || !pair.normalized) return;
    const repl = token.kind === 'open' ? pair.normalized.open : pair.normalized.close;
    replacements.push({ start: token.start, end: token.end, text: repl });
  });
  if (!replacements.length) return input;
  replacements.sort((a, b) => a.start - b.start);
  let out = '';
  let last = 0;
  for (const rep of replacements) {
    if (rep.start < last) continue;
    out += input.slice(last, rep.start);
    out += rep.text;
    last = rep.end;
  }
  out += input.slice(last);
  return out;
}

function normalizeMultiplicationStyleLatex(expr = '') {
  let out = String(expr ?? '');
  if (!out) return out;

  // Keep explicit multiplication before natural log when ln(...) is a factor.
  out = out.replace(/\\ln\b/g, (match, offset, source) => {
    const left = source.slice(0, offset).replace(/[ \t]+$/g, '');
    if (!left) return match;
    if (/(?:\\times|\\cdot|\\div|\\pm|\\mp|[+\-=\/*×·])$/.test(left)) return match;
    if (/[A-Za-z0-9}\)\]]$/.test(left)) return ` \\times ${match}`;
    return match;
  });

  // Remove redundant explicit multiplication when the right-hand side is symbolic.
  // Keep explicit multiplication for numeric multiplication (e.g. 970 \\times 0.003).
  out = out.replace(/([A-Za-z}\)\]])\s*\\times\s*(?=(?:[A-Za-z]|\\(?!ln\b)[A-Za-z]))/g, '$1 ');
  out = out.replace(/([A-Za-z}\)\]])\s*\\cdot\s*(?=(?:[A-Za-z]|\\(?!ln\b)[A-Za-z]))/g, '$1 ');

  return out.replace(/[ \t]{2,}/g, ' ');
}

function normalizeMathSegmentsInText(text = '') {
  const input = String(text ?? '');
  if (!input) return input;
  const re = /\$\$([\s\S]*?)\$\$|\$([^$]*?)\$/g;
  return input.replace(re, (match, dbl, single) => {
    if (dbl != null) return `$$${normalizeMultiplicationStyleLatex(normalizeBracketOrderLatex(dbl))}$$`;
    if (single != null) return `$${normalizeMultiplicationStyleLatex(normalizeBracketOrderLatex(single))}$`;
    return match;
  });
}

function normalizeGeneratedCard(card) {
  if (!card || typeof card !== 'object') return card;
  if (typeof card.front === 'string') card.front = normalizeMathSegmentsInText(card.front);
  if (typeof card.back === 'string') card.back = normalizeMathSegmentsInText(card.back);
  if (typeof card.front_text === 'string') card.front_text = normalizeMathSegmentsInText(card.front_text);
  if (typeof card.back_text === 'string') card.back_text = normalizeMathSegmentsInText(card.back_text);
  return card;
}

function normalizeGeneratedDeck(cards) {
  if (!Array.isArray(cards)) return cards;
  return cards.map(card => normalizeGeneratedCard(card));
}

export function __normalizeMathSegmentsInText(text = '') {
  return normalizeMathSegmentsInText(text);
}

function buildFrontWithPrompt({ promptLine = '', formulaLine = '', givenLines = [] } = {}) {
  const parts = [];
  if (promptLine) parts.push(`<div class="math-step prompt-line">${promptLine}</div>`);
  const givenLine = buildGivenListLine(givenLines);
  if (givenLine) parts.push(givenLine);
  return parts.join('');
}

function formatConst(value, decimals = null) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  if (decimals == null) return String(num);
  let out = num.toFixed(decimals);
  out = out.replace(/(\.\d*?[1-9])0+$/,'$1').replace(/\.0+$/,'').replace(/\.$/,'');
  return out;
}

function formatNernstValue(key, value) {
  if (key === 'z') return String(Math.trunc(value));
  if (key === 'U') return formatSigFig(value, 3);
  const spec = NERNST_SPECS[key];
  const step = spec?.step;
  if (step != null) return formatByStep(value, step);
  return formatSigFig(value, 3);
}

function formatSubValue(value) {
  return formatSigFig(value, 3);
}

function buildSiExprFromGivenEntry(entry, sig = 4) {
  if (!entry) return '';
  const step = entry.unit?.step;
  const display = Number.isFinite(step)
    ? formatByStep(entry.displayValue, step)
    : formatSigFig(entry.displayValue, sig);
  const exp = inferPowerOfTenExponent(entry.displayValue, entry.siValue);
  if (exp == null || exp === 0) return display;
  return `${display} \\times 10^{${exp}}`;
}

function buildFormulaLine(targetKey, valuesSI, given = {}) {
  const rho = given?.rho ? buildSiExprFromGivenEntry(given.rho) : formatSubValue(valuesSI.rho);
  const v = given?.v ? buildSiExprFromGivenEntry(given.v) : formatSubValue(valuesSI.v);
  const r = given?.r ? buildSiExprFromGivenEntry(given.r) : formatSubValue(valuesSI.r);
  const mu = given?.mu ? buildSiExprFromGivenEntry(given.mu) : formatSubValue(valuesSI.mu);
  const Re = given?.Re ? buildSiExprFromGivenEntry(given.Re) : formatSubValue(valuesSI.Re);
  const A = given?.A ? buildSiExprFromGivenEntry(given.A) : formatSubValue(valuesSI.A);
  const hasArea = Number.isFinite(valuesSI.A);
  const rExpr = hasArea ? `\\sqrt{\\frac{${A}}{\\pi}}` : r;
  if (targetKey === 'Re') {
    return `$Re = \\frac{\\rho v r}{\\mu} = \\frac{${rho} \\times ${v} \\times ${rExpr}}{${mu}}$`;
  }
  if (targetKey === 'v') {
    return `$v = \\frac{\\mathrm{Re} \\mu}{\\rho r} = \\frac{${Re} \\times ${mu}}{${rho} \\times ${rExpr}}$`;
  }
  if (targetKey === 'r') {
    return `$r = \\frac{\\mathrm{Re} \\mu}{\\rho v} = \\frac{${Re} \\times ${mu}}{${rho} \\times ${v}}$`;
  }
  return '';
}

function buildReynoldsFormulaLine(targetKey, hasArea) {
  const rExpr = hasArea ? '\\sqrt{\\frac{A}{\\pi}}' : 'r';
  const formulas = [];
  if (hasArea) {
    formulas.push(`r = ${rExpr}`);
  }
  if (targetKey === 'Re') {
    formulas.push(`Re = \\frac{\\rho v r}{\\mu}`);
  } else if (targetKey === 'v') {
    formulas.push(`v = \\frac{\\mathrm{Re} \\mu}{\\rho r}`);
  } else if (targetKey === 'r') {
    formulas.push(`r = \\frac{\\mathrm{Re} \\mu}{\\rho v}`);
  } else if (targetKey === 'rho') {
    formulas.push(`\\rho = \\frac{\\mathrm{Re} \\mu}{v r}`);
  } else if (targetKey === 'mu') {
    formulas.push(`\\mu = \\frac{\\rho v r}{\\mathrm{Re}}`);
  }
  return combineFormulaLine(formulas);
}

function buildReynoldsGivenOrder(targetKey, useArea) {
  const orderByTarget = {
    Re: ['rho', 'v', 'r', 'mu'],
    v: ['Re', 'mu', 'rho', 'r'],
    r: ['Re', 'mu', 'rho', 'v'],
    rho: ['Re', 'mu', 'v', 'r'],
    mu: ['rho', 'v', 'r', 'Re']
  };
  const base = orderByTarget[targetKey] || ['rho', 'v', 'r', 'mu', 'Re'];
  if (!useArea) return base;
  const withoutR = base.filter(key => key !== 'r');
  return ['A', ...withoutR];
}

function buildNernstGivenLines(targetKey, values, useConstants = true) {
  const lines = [];
  const addLine = (key, value) => {
    const spec = NERNST_SPECS[key];
    const label = latexVarLabel(key);
    const unit = spec?.unit || '';
    const step = spec?.step ?? null;
    const display = (step != null) ? formatByStep(value, step) : formatSigFig(value, 3);
    const unitLatex = unit ? formatUnitLatex(unit) : '';
    const line = unitLatex ? `$${label} = ${display}\\,${unitLatex}$` : `$${label} = ${display}$`;
    lines.push(line);
  };
  const rVal = NERNST_CONST_DISPLAY.R || formatConst(NERNST_CONSTANTS.R, 3);
  const fVal = NERNST_CONST_DISPLAY.F || formatConst(NERNST_CONSTANTS.F, 0);
  if (useConstants) {
    lines.push(`$${latexVarLabel('R')} = ${rVal}\\,${formatUnitLatex('J/(mol K)')}$`);
  }
  if (targetKey !== 'T' && values.T != null) addLine('T', values.T);
  if (targetKey !== 'z' && values.z != null) addLine('z', values.z);
  if (useConstants) {
    lines.push(`$${latexVarLabel('F')} = ${fVal}\\,${formatUnitLatex('C/mol')}$`);
  }
  if (targetKey !== 'c_ext' && values.c_ext != null) addLine('c_ext', values.c_ext);
  if (targetKey !== 'c_int' && values.c_int != null) addLine('c_int', values.c_int);
  return lines;
}

function buildNernstFormulaLine(targetKey, values) {
  if (targetKey !== 'U') return '';
  const R = NERNST_CONST_DISPLAY.R || formatConst(NERNST_CONSTANTS.R, 3);
  const F = NERNST_CONST_DISPLAY.F || formatConst(NERNST_CONSTANTS.F, 0);
  const T = formatNernstValue('T', values.T);
  const z = formatNernstValue('z', values.z);
  const cext = formatNernstValue('c_ext', values.c_ext);
  const cint = formatNernstValue('c_int', values.c_int);
  const lnRatio = `\\ln\\frac{${cext}}{${cint}}`;
  return `$U = \\frac{R \\times T}{z \\times F} \\times \\ln\\frac{c_{ext}}{c_{int}} = \\frac{${R} \\times ${T}}{${z} \\times ${F}} \\times ${lnRatio}$`;
}

function buildMcqOptionsNernst(targetKey, targetValue, rng) {
  const spec = NERNST_SPECS[targetKey];
  if (!spec) return { options: [], correctText: '' };
  if (Array.isArray(spec.values)) {
    const correctValue = formatSubValue(targetValue);
    const correctText = formatValueWithUnitLatex(correctValue, spec.unit);
    const opts = spec.values.map(v => formatValueWithUnitLatex(formatSubValue(v), spec.unit));
    if (!opts.includes(correctText)) opts.push(correctText);
    return { options: opts.slice(0, 4), correctText };
  }
  const correctValue = formatAnswer(targetValue);
  const correctText = formatValueWithUnitLatex(correctValue, spec.unit);
  const options = new Set([correctText]);
  let attempts = 0;
  while (options.size < 4 && attempts < 80) {
    attempts += 1;
    let candidate = null;
    if (attempts < 24) {
      const factor = 1 + (rng() * 0.4 - 0.2);
      candidate = targetValue * factor;
    } else {
      candidate = randStep(rng, spec.min, spec.max, spec.step);
    }
    if (!Number.isFinite(candidate)) continue;
    if (candidate < spec.min || candidate > spec.max) continue;
    const candValue = formatDummyLike(candidate, correctValue, { min: spec.min, max: spec.max, rng });
    if (!candValue) continue;
    const candText = formatValueWithUnitLatex(candValue, spec.unit);
    if (candText === correctText) continue;
    options.add(candText);
  }
  return { options: Array.from(options), correctText };
}

function buildNernstCard(targetKey, index, rng, runId) {
  if (targetKey !== 'U') {
    throw new Error(`Unsupported Nernst target: ${targetKey}`);
  }
  const maxAttempts = 300;
  const r = NERNST_CONSTANTS.R;
  const f = NERNST_CONSTANTS.F;
  const Tfixed = NERNST_FIXED.T;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const z = NERNST_Z_VALUES[Math.floor(rng() * NERNST_Z_VALUES.length)];
    const T = Tfixed;
    let c_ext = randStep(rng, NERNST_SPECS.c_ext.min, NERNST_SPECS.c_ext.max, NERNST_SPECS.c_ext.step);
    let c_int = randStep(rng, NERNST_SPECS.c_int.min, NERNST_SPECS.c_int.max, NERNST_SPECS.c_int.step);
    if (c_ext <= 0 || c_int <= 0) continue;
    let lnRatio = Math.log(c_ext / c_int);
    if (!Number.isFinite(lnRatio) || Math.abs(lnRatio) < 0.2) continue;

    const Uvolts = (r * T) / (z * f) * lnRatio;
    const U = Uvolts * 1000; // mV
    if (!Number.isFinite(U)) continue;
    if (U < NERNST_SPECS.U.min || U > NERNST_SPECS.U.max || Math.abs(U) < 5) continue;

    const values = { U, T, z, c_ext, c_int };
    const targetValue = values[targetKey];
    if (targetValue == null || !Number.isFinite(targetValue)) continue;

    const targetSpec = NERNST_SPECS[targetKey];
    const answerValue = (targetKey === 'z')
      ? String(Math.trunc(targetValue))
      : formatAnswer(targetValue);
    if (!answerValue) continue;

    const answerUnit = targetSpec?.unit || '';
    const ionName = z > 0 ? 'potassium' : 'chloride';
    const targetLatex = latexVarLabel(targetKey);
    const unitInline = answerUnit ? formatUnitInlineLatex(answerUnit) : '';
    const targetLine = unitInline
      ? `Find $${targetLatex}$ (${unitInline}).`
      : `Find $${targetLatex}$.`;

    const formulaLine = combineFormulaLine([
      'U = \\frac{R \\times T}{z \\times F} \\times \\ln\\frac{c_{ext}}{c_{int}}'
    ]);
    const givenLines = buildNernstGivenLines(targetKey, values, true);
    const promptLine = `Calculate the Nernst's potential for ${ionName} ions for normal temperature of body. Result express in $\\mathrm{mV}$.`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines
    });

    const answerLatex = answerUnit ? `${answerValue}\\,${formatUnitLatex(answerUnit)}` : answerValue;
    const substitutionLine = buildNernstFormulaLine(targetKey, values);
    const finalLine = `$${targetLatex} = ${answerLatex}$`.trim();
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      substitutionLine ? `<div class="math-step">${substitutionLine}</div>` : '',
      `<div class="math-final">${finalLine}</div>`
    ].filter(Boolean).join('');

    const { options, correctText } = buildMcqOptionsNernst(targetKey, targetValue, rng);
    return {
      id: `nernst:${runId}:${targetKey}:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerValue],
      accept: buildAcceptList(targetKey, answerValue, answerUnit),
      mcqOptions: options.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'nernst', String(targetKey).toLowerCase()]
    };
  }
  throw new Error(`Failed to generate Nernst card for ${targetKey}`);
}

function buildOsmoticGivenLines(values) {
  const lines = [];
  const tC = formatByStep(values.tC, OSMOTIC_T_C.step);
  const cPct = formatByStep(values.cPct, OSMOTIC_C_PCT.step);
  const rVal = formatConst(OSMOTIC_CONSTANTS.R, 3);
  const iVal = formatConst(OSMOTIC_CONSTANTS.i, 0);
  const molarVal = formatConst(OSMOTIC_CONSTANTS.molarMass, 0);
  const rUnit = '\\mathrm{kPa}\\,\\times\\,\\mathrm{L}/(\\mathrm{mol}\\,\\mathrm{K})';
  lines.push(`$R = ${rVal}\\,${rUnit}$`);
  lines.push(`$T = ${tC}^{\\circ}\\,\\mathrm{C}$`);
  lines.push(`$C = ${cPct}\\%_{d}$`);
  lines.push(`$M_{\\mathrm{glc}} = ${molarVal}\\,${formatUnitLatex('g/mol')}$`);
  lines.push(`$i = ${iVal}$`);
  return lines;
}

function buildOsmoticFormulaLine(values) {
  const rVal = formatConst(OSMOTIC_CONSTANTS.R, 3);
  const tC = formatByStep(values.tC, OSMOTIC_T_C.step);
  const cPct = formatByStep(values.cPct, OSMOTIC_C_PCT.step);
  const offset = formatConst(OSMOTIC_CONSTANTS.tempOffset, 2);
  const molar = formatConst(OSMOTIC_CONSTANTS.molarMass, 0);
  const iVal = formatConst(OSMOTIC_CONSTANTS.i, 0);
  const tExpr = `(${tC} + ${offset})`;
  const cExpr = `\\frac{${cPct} \\times 10^{1}}{${molar}}`;
  return `$\\pi = R \\times T \\times C \\times i = ${rVal} \\times ${tExpr} \\times ${cExpr} \\times ${iVal}$`;
}

function buildMcqOptionsOsmotic(targetValue, rng) {
  const spec = OSMOTIC_SPEC;
  const correctValue = formatAnswer(targetValue);
  const correctText = formatValueWithUnitLatex(correctValue, spec.unit);
  const options = new Set([correctText]);
  let attempts = 0;
  while (options.size < 4 && attempts < 80) {
    attempts += 1;
    let candidate = null;
    if (attempts < 24) {
      const factor = 1 + (rng() * 0.4 - 0.2);
      candidate = targetValue * factor;
    } else {
      candidate = randStep(rng, spec.min, spec.max, spec.step);
    }
    if (!Number.isFinite(candidate)) continue;
    if (candidate < spec.min || candidate > spec.max) continue;
    const candValue = formatDummyLike(candidate, correctValue, { min: spec.min, max: spec.max, rng });
    if (!candValue) continue;
    const candText = formatValueWithUnitLatex(candValue, spec.unit);
    if (candText === correctText) continue;
    options.add(candText);
  }
  return { options: Array.from(options), correctText };
}

function buildOsmoticPressureCard(index, rng, runId) {
  const maxAttempts = 200;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const tC = randStep(rng, OSMOTIC_T_C.min, OSMOTIC_T_C.max, OSMOTIC_T_C.step);
    const cPct = randStep(rng, OSMOTIC_C_PCT.min, OSMOTIC_C_PCT.max, OSMOTIC_C_PCT.step);
    const T = tC + OSMOTIC_CONSTANTS.tempOffset;
    const C = (cPct * 10) / OSMOTIC_CONSTANTS.molarMass; // mol/L
    const pi = OSMOTIC_CONSTANTS.R * T * C * OSMOTIC_CONSTANTS.i;
    if (!Number.isFinite(pi)) continue;
    if (pi < OSMOTIC_SPEC.min || pi > OSMOTIC_SPEC.max) continue;
    const answerValue = formatAnswer(pi);
    if (!answerValue) continue;

    const formulaLine = combineFormulaLine([
      '\\pi = R \\times T \\times C \\times i'
    ]);
    const cPctStr = formatByStep(cPct, OSMOTIC_C_PCT.step);
    const tCStr = formatByStep(tC, OSMOTIC_T_C.step);
    const targetLine = `Find the osmotic pressure (in $\\mathrm{kPa}$) of glucose with density concentration $${cPctStr}\\%_{d}$, temperature $${tCStr}^{\\circ}\\,\\mathrm{C}$.`;
    const givenLines = buildOsmoticGivenLines({ tC, cPct });
    const front = buildFrontWithPrompt({
      promptLine: targetLine,
      formulaLine,
      givenLines
    });

    const answerLatex = `${answerValue}\\,${formatUnitLatex(OSMOTIC_SPEC.unit)}`;
    const substitutionLine = buildOsmoticFormulaLine({ tC, cPct });
    const finalLine = `$${latexVarLabel('pi')} = ${answerLatex}$`.trim();
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      substitutionLine ? `<div class="math-step">${substitutionLine}</div>` : '',
      `<div class="math-final">${finalLine}</div>`
    ].filter(Boolean).join('');

    const { options, correctText } = buildMcqOptionsOsmotic(pi, rng);

    return {
      id: `osmotic:${runId}:pi:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerValue],
      accept: buildAcceptList('pi', answerValue, OSMOTIC_SPEC.unit),
      mcqOptions: options.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'osmotic', 'pressure']
    };
  }
  throw new Error('Failed to generate osmotic pressure card');
}

function buildOsmoticIsotonicCard(index, rng, runId) {
  const maxAttempts = 200;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const cNaClMmol = randStep(rng, OSMOTIC_ISOTONIC_C_NACL_MMOL.min, OSMOTIC_ISOTONIC_C_NACL_MMOL.max, OSMOTIC_ISOTONIC_C_NACL_MMOL.step);
    const volMl = randStep(rng, OSMOTIC_ISOTONIC_VOL_ML.min, OSMOTIC_ISOTONIC_VOL_ML.max, OSMOTIC_ISOTONIC_VOL_ML.step);
    if (!Number.isFinite(cNaClMmol) || !Number.isFinite(volMl)) continue;

    const cNaCl = cNaClMmol * 1e-3; // mol/L
    const dPct = (cNaCl * OSMOTIC_ISOTONIC_I_NACL * OSMOTIC_ISOTONIC_M_GLUCOSE) / (10 * OSMOTIC_ISOTONIC_I_GLUCOSE);
    if (!Number.isFinite(dPct)) continue;
    if (dPct < OSMOTIC_ISOTONIC_D_RANGE.min || dPct > OSMOTIC_ISOTONIC_D_RANGE.max) continue;

    const answerStr = formatAnswer(dPct);
    if (!answerStr) continue;

    const cNaClMmolStr = formatByStep(cNaClMmol, OSMOTIC_ISOTONIC_C_NACL_MMOL.step);
    const volMlStr = formatByStep(volMl, OSMOTIC_ISOTONIC_VOL_ML.step);
    const iNaClStr = formatConst(OSMOTIC_ISOTONIC_I_NACL, 0);
    const iGlucoseStr = formatConst(OSMOTIC_ISOTONIC_I_GLUCOSE, 0);
    const mGlucoseStr = formatConst(OSMOTIC_ISOTONIC_M_GLUCOSE, 0);

    const formulaLine = combineFormulaLine([
      'd_{\\%} = \\frac{c_{\\mathrm{NaCl}} \\times i_{\\mathrm{NaCl}} \\times M_{\\mathrm{glc}}}{10 \\times i_{\\mathrm{glc}}}'
    ]);
    const promptLine = `What density concentration (in $\\%_{d}$) of glucose (molar mass $${mGlucoseStr}\\,\\mathrm{g/mol}$) is isotonic with $${volMlStr}\\,\\mathrm{mL}$ of NaCl solution of concentration $${cNaClMmolStr}\\,\\mathrm{mmol/L}$?`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [
        `$c_{\\mathrm{NaCl}} = ${cNaClMmolStr}\\,${formatUnitLatex('mmol/L')}$`,
        `$i_{\\mathrm{NaCl}} = ${iNaClStr}$`,
        `$M_{\\mathrm{glc}} = ${mGlucoseStr}\\,${formatUnitLatex('g/mol')}$`,
        `$i_{\\mathrm{glc}} = ${iGlucoseStr}$`
      ]
    });

    const substitutionLine = `$d_{\\%} = \\frac{(${cNaClMmolStr} \\times 10^{-3}) \\times ${iNaClStr} \\times ${mGlucoseStr}}{10 \\times ${iGlucoseStr}}$`;
    const finalLine = `$d_{\\%} = ${answerStr}\\,\\%_{d}$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${substitutionLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: dPct,
      valueStr: answerStr,
      unit: '\\%',
      step: OSMOTIC_ISOTONIC_ANSWER_STEP,
      rng,
      min: OSMOTIC_ISOTONIC_D_RANGE.min,
      max: OSMOTIC_ISOTONIC_D_RANGE.max
    });

    const accept = new Set(buildAcceptList('d%', answerStr, '%', ['d_%']));
    accept.add(`${answerStr}%d`);
    accept.add(`${answerStr} %d`);
    accept.add(`${answerStr}%_d`);
    accept.add(`${answerStr} %_d`);
    accept.add(`${answerStr}%`);
    accept.add(`${answerStr} %`);

    return {
      id: `osmotic:${runId}:isotonic:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: Array.from(accept),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'osmotic', 'isotonic', 'glucose', 'nacl']
    };
  }
  throw new Error('Failed to generate isotonic osmotic card');
}

function buildOsmoticCard(index, rng, runId) {
  if (rng() < 0.5) return buildOsmoticPressureCard(index, rng, runId);
  return buildOsmoticIsotonicCard(index, rng, runId);
}

function buildEcgMcqOptions(correctValue, step, rng, range, templateStr = '') {
  const options = new Set();
  const normalizedCorrect = normalizeNegZero(correctValue);
  const correctStr = templateStr || formatByStep(normalizedCorrect, step);
  const correctText = formatValueWithUnitLatex(correctStr, ECG_UNIT);
  options.add(correctText);

  const candidates = [
    normalizedCorrect * -1,
    normalizedCorrect * 0.5,
    normalizedCorrect * 1.5,
    normalizedCorrect * 2
  ];

  const min = range?.min ?? (normalizedCorrect < 0 ? normalizedCorrect * 2 : 0);
  const max = range?.max ?? (normalizedCorrect < 0 ? Math.abs(normalizedCorrect) * 2 : normalizedCorrect * 2);

  const addCandidate = (value) => {
    if (!Number.isFinite(value)) return;
    if (Number.isFinite(min) && value < min) return;
    if (Number.isFinite(max) && value > max) return;
    let rounded = value;
    if (Number.isFinite(step) && step > 0) {
      rounded = Math.round(value / step) * step;
    }
    rounded = normalizeNegZero(rounded);
    const valueStr = formatDummyLike(rounded, correctStr, { min, max, rng });
    if (!valueStr) return;
    options.add(formatValueWithUnitLatex(valueStr, ECG_UNIT));
  };

  candidates.forEach(addCandidate);

  let attempts = 0;
  while (options.size < MCQ_OPTION_CAP && attempts < 50) {
    attempts += 1;
    const candidate = randStep(rng, min, max, step);
    addCandidate(candidate);
  }

  const capped = capMcqOptions(Array.from(options), correctText, MCQ_OPTION_CAP, rng);
  return { options: capped, correctText };
}

function buildEcgLeadCard(typeKey, index, rng, runId) {
  const spec = ECG_I_SPECS[typeKey];
  if (!spec) throw new Error(`Unsupported ECG type: ${typeKey}`);

  const leadI = randStep(rng, spec.min, spec.max, spec.step);
  const leadIStr = formatByStep(leadI, spec.step);
  if (!leadIStr) throw new Error('Failed to format ECG lead I value');

  let answerValue = NaN;
  let targetLabel = '';
  let front = '';
  let formulaLine = '';
  let substitutionLine = '';

  if (typeKey === 'avf_zero') {
    answerValue = -leadI / 2;
    targetLabel = 'Lead III';
    const leadIIStr = formatByStep(normalizeNegZero(leadI / 2), ECG_ANSWER_STEPS.avf_zero);
    formulaLine = combineFormulaLine([
      'aVF = \\mathrm{II} - \\frac{\\mathrm{I}}{2}',
      '\\mathrm{II} = \\mathrm{I} + \\mathrm{III}'
    ]);
    const promptLine = `The entire amplitude of QRS complex in the lead $aVF$ is $0\\,\\mathrm{mV}$ and in the lead $\\mathrm{I}$ is $${leadIStr}\\,\\mathrm{mV}$. Determine the entire amplitude of QRS complex in the lead $\\mathrm{III}$. Result express in $\\mathrm{mV}$.`;
    const givenLines = [
      `$aVF = 0\\,${formatUnitLatex(ECG_UNIT)}$`,
      `$\\mathrm{I} = ${leadIStr}\\,${formatUnitLatex(ECG_UNIT)}$`
    ];
    front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines
    });
    substitutionLine = `$\\mathrm{II} = 0 + \\frac{${leadIStr}}{2} = ${leadIIStr},\\; \\mathrm{III} = ${leadIIStr} - ${leadIStr}$`;
  } else if (typeKey === 'avl_zero') {
    answerValue = leadI * 2;
    targetLabel = 'Lead II';
    formulaLine = combineFormulaLine([
      'aVL = \\mathrm{I} - \\frac{\\mathrm{II}}{2}',
      '\\mathrm{II} = 2(\\mathrm{I} - aVL)'
    ]);
    const promptLine = `The entire amplitude of QRS complex in the lead $aVL$ is $0\\,\\mathrm{mV}$. Determine the entire amplitude of QRS complex in the lead $\\mathrm{II}$ if the same value in the lead $\\mathrm{I}$ is $${leadIStr}\\,\\mathrm{mV}$. Result express in $\\mathrm{mV}$.`;
    const givenLines = [
      `$aVL = 0\\,${formatUnitLatex(ECG_UNIT)}$`,
      `$\\mathrm{I} = ${leadIStr}\\,${formatUnitLatex(ECG_UNIT)}$`
    ];
    front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines
    });
    substitutionLine = `$\\mathrm{II} = 2(${leadIStr} - 0) = ${formatByStep(normalizeNegZero(answerValue), ECG_ANSWER_STEPS.avl_zero)}$`;
  }

  const step = ECG_ANSWER_STEPS[typeKey] ?? 0.1;
  const answerStr = formatAnswer(normalizeNegZero(answerValue));
  if (!answerStr) throw new Error('Failed to format ECG answer');

  const targetShort = targetLabel.replace(/^Lead\s+/i, '');
  const targetLatex = `\\mathrm{${targetShort}}`;
  const finalLine = `$${targetLatex} = ${answerStr}\\,${formatUnitLatex(ECG_UNIT)}$`;
  const back = [
    `<div class="math-step">${formulaLine}</div>`,
    `<div class="math-step">${substitutionLine}</div>`,
    `<div class="math-final">${finalLine}</div>`
  ].join('');
  const labelAlias = targetLabel.replace(/^Lead\s+/i, '');
  const accept = buildAcceptList(targetLabel, answerStr, ECG_UNIT, [labelAlias]);

  const range = ECG_OPTION_RANGES[typeKey] || null;
  const { options, correctText } = buildEcgMcqOptions(answerValue, step, rng, range, answerStr);

  return {
    id: `ecg:${runId}:${typeKey}:${String(index).padStart(3, '0')}`,
    archetype: 'maths',
    front,
    back,
    correct: [answerStr],
    accept,
    mcqOptions: options.map(text => ({ text })),
    mcqCorrect: [correctText],
    tags: ['biophysics', 'ecg', 'leads', 'einthoven']
  };
}

function buildEcgPracticalAxisCard(index, rng, runId) {
  const maxAttempts = 200;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const leadI = buildRandomLeadQrs(rng);
    const leadIII = buildRandomLeadQrs(rng);
    if (!leadI || !leadIII) continue;
    if (!Number.isFinite(leadI.net) || !Number.isFinite(leadIII.net)) continue;
    if (!leadI.net) continue;

    const tanValue = (2 / Math.sqrt(3)) * ((leadIII.net / leadI.net) + 0.5);
    if (!Number.isFinite(tanValue)) continue;
    const angle = Math.atan(tanValue) * (180 / Math.PI);
    if (!Number.isFinite(angle)) continue;
    const angleRounded = Math.round(angle);
    const answerStr = String(angleRounded);

    const promptLine = 'Determine the orientation of the electrical cardiac axis of the QRS complex from the first fully recorded cardiac cycle. Accuracy will be assessed within +/- 15 angular degrees.';
    const givenLines = [
      buildLeadQrsLine('III', leadIII.q, leadIII.r, leadIII.s),
      buildLeadQrsLine('I', leadI.q, leadI.r, leadI.s)
    ];
    const front = buildFrontWithPrompt({ promptLine, givenLines });

    const leadILine = `$\\mathrm{I} = -${leadI.q} + ${leadI.r} - ${leadI.s} = ${leadI.net}\\,\\mathrm{mm}$`;
    const leadIIILine = `$\\mathrm{III} = -${leadIII.q} + ${leadIII.r} - ${leadIII.s} = ${leadIII.net}\\,\\mathrm{mm}$`;
    const formulaLine = '$\\alpha = \\tan^{-1}\\left(\\frac{2}{\\sqrt{3}} \\times \\left(\\frac{\\mathrm{III}}{\\mathrm{I}} + 0.5\\right)\\right)$';
    const substitutionLine = `$\\alpha = \\tan^{-1}\\left(\\frac{2}{\\sqrt{3}} \\times \\left(\\frac{${leadIII.net}}{${leadI.net}} + 0.5\\right)\\right)$`;
    const finalLine = `$\\alpha \\approx ${answerStr}^{\\circ}$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${leadILine}</div>`,
      `<div class="math-step">${leadIIILine}</div>`,
      `<div class="math-step">${substitutionLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    return {
      id: `ecgprac:${runId}:axis:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: buildAngleAcceptList(angleRounded, 15),
      tags: ['biophysics', 'ecg', 'practical', 'axis']
    };
  }
  throw new Error('Failed to generate ECG practical axis card');
}

function buildEcgPracticalRateCard(index, rng, runId) {
  const maxAttempts = 200;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const rrMin = Math.max(1, ECG_RR_N_RANGE.min);
    const rrMax = Math.max(rrMin, ECG_RR_N_RANGE.max);
    const intervalCount = randInt(rng, rrMin, rrMax);
    const minTotalMm = Math.ceil((60 * ECG_PAPER_SPEED_MM_S * intervalCount) / ECG_HR_RANGE.max);
    const maxTotalMm = Math.floor((60 * ECG_PAPER_SPEED_MM_S * intervalCount) / ECG_HR_RANGE.min);
    const cappedMax = Math.min(maxTotalMm, ECG_STRIP_TOTAL_MM);
    if (!Number.isFinite(minTotalMm) || !Number.isFinite(cappedMax) || minTotalMm > cappedMax) continue;
    const totalMm = randInt(rng, minTotalMm, cappedMax);
    if (!Number.isFinite(totalMm) || totalMm <= 0) continue;
    let totalLarge = Math.floor(totalMm / ECG_LARGE_BOX_MM);
    let totalSmall = totalMm % ECG_LARGE_BOX_MM;
    if (!Number.isInteger(totalLarge) || totalLarge < 0) continue;
    if (!Number.isInteger(totalSmall) || totalSmall < 0) continue;

    const avgMm = totalMm / intervalCount;
    if (!Number.isFinite(avgMm) || avgMm <= 0) continue;
    const heartRate = (60 * ECG_PAPER_SPEED_MM_S) / avgMm;
    if (!Number.isFinite(heartRate)) continue;
    if (heartRate < ECG_HR_RANGE.min || heartRate > ECG_HR_RANGE.max) continue;
    const answerRounded = Math.round(heartRate);
    const answerStr = String(answerRounded);

    const promptLine = 'Determine the average heart rate in beats per minute from all fully displayed R-R intervals. Assume a $10\\,\\mathrm{s}$ strip at paper speed $25\\,\\mathrm{mm/s}$.';
    const givenLines = [
      formatRrTotalPhrase(totalLarge, totalSmall),
      `$RR_n = ${intervalCount}$`
    ];
    const front = buildFrontWithPrompt({ promptLine, givenLines });

    const avgStr = formatByStep(avgMm, 1);
    const totalMmStr = formatByStep(totalMm, 1);
    const totalLine = `$RR_{\\mathrm{total}} = ${totalLarge} \\times 5 + ${totalSmall} \\times 1 = ${totalMmStr}\\,\\mathrm{mm}$`;
    const finalLine = `$HR = \\frac{60 \\times 25}{\\frac{${totalMmStr}}{${intervalCount}}} \\approx ${answerStr}\\,\\mathrm{bpm}$`;
    const back = [
      `<div class="math-step">$HR = \\frac{60 \\times 25}{\\frac{RR_{\\mathrm{total}}}{RR_n}}$</div>`,
      `<div class="math-step">${totalLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    return {
      id: `ecgprac:${runId}:rate:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: buildNumericToleranceAccept(answerRounded, 2, 'bpm'),
      tags: ['biophysics', 'ecg', 'practical', 'rate']
    };
  }
  throw new Error('Failed to generate ECG practical rate card');
}

function buildEcgPracticalCard(typeKey, index, rng, runId) {
  if (typeKey === 'axis') return buildEcgPracticalAxisCard(index, rng, runId);
  if (typeKey === 'rate') return buildEcgPracticalRateCard(index, rng, runId);
  throw new Error(`Unsupported ECG practical type: ${typeKey}`);
}

function buildEjectionFractionFromImprovementCard(index, rng, runId) {
  const maxAttempts = 200;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const ef1Pct = randStep(rng, EF_PERCENT_SPEC.min, EF_PERCENT_SPEC.max, EF_PERCENT_SPEC.step);
    const minEf2 = ef1Pct + EF_MIN_INCREASE;
    if (!Number.isFinite(minEf2) || minEf2 > EF_PERCENT_MAX) continue;
    const ef2Pct = randStep(rng, minEf2, EF_PERCENT_MAX, EF_PERCENT_SPEC.step);
    if (!Number.isFinite(ef1Pct) || !Number.isFinite(ef2Pct) || ef2Pct <= ef1Pct) continue;

    const ef1 = ef1Pct / 100;
    const ef2 = ef2Pct / 100;
    const esvRatio = (1 - ef2) / (1 - ef1);
    const percentDecrease = (1 - esvRatio) * 100;
    if (!Number.isFinite(percentDecrease)) continue;
    if (percentDecrease < EF_DECREASE_RANGE.min || percentDecrease > EF_DECREASE_RANGE.max) continue;

    const answerStr = formatAnswer(percentDecrease);
    if (!answerStr) continue;

    const ef1Str = formatByStep(ef1Pct, 1);
    const ef2Str = formatByStep(ef2Pct, 1);
    const ef1Dec = formatByStep(ef1, 0.01);
    const ef2Dec = formatByStep(ef2, 0.01);

    const formulaLine = combineFormulaLine([
      '\\Delta_{\\%} ESV = (1 - \\frac{ESV_2}{ESV_1}) \\times 100\\%',
      '\\frac{ESV_2}{ESV_1} = \\frac{1 - EF_2}{1 - EF_1}'
    ]);
    const promptLine = `The ejection fraction increased from $${ef1Str}\\%$ to $${ef2Str}\\%$ after successful surgery. Determine by how many percent the end-systolic volume decreased by this intervention (assume the end-diastolic volume did not change).`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [
        `$EF_2 = ${ef2Str}\\%$`,
        `$EF_1 = ${ef1Str}\\%$`
      ]
    });
    const ratioLine = `$\\frac{ESV_2}{ESV_1} = \\frac{1 - ${ef2Dec}}{1 - ${ef1Dec}}$`;
    const finalLine = `$\\Delta_{\\%} ESV = \\left(1 - \\frac{1 - ${ef2Dec}}{1 - ${ef1Dec}}\\right) \\times 100\\% = ${answerStr}\\%$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${ratioLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: percentDecrease,
      valueStr: answerStr,
      unit: '\\%',
      step: 0.1,
      rng,
      min: 0,
      max: 100
    });

    return {
      id: `ef:${runId}:esv:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: [answerStr, `${answerStr}%`, `${answerStr} %`],
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'cardio', 'ejection', 'fraction']
    };
  }
  throw new Error('Failed to generate ejection fraction card');
}

function buildEjectionFractionFromSvEsvShareCard(index, rng, runId) {
  const maxAttempts = 200;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const svMl = randStep(rng, EF_SV_ML.min, EF_SV_ML.max, EF_SV_ML.step);
    const esvOfSvPct = randStep(rng, EF_ESV_OF_SV_PCT.min, EF_ESV_OF_SV_PCT.max, EF_ESV_OF_SV_PCT.step);
    if (!Number.isFinite(svMl) || !Number.isFinite(esvOfSvPct)) continue;
    if (svMl <= 0 || esvOfSvPct <= 0) continue;

    const esvMl = svMl * (esvOfSvPct / 100);
    const edvMl = svMl + esvMl;
    const efPct = (svMl / edvMl) * 100;
    if (![esvMl, edvMl, efPct].every(v => Number.isFinite(v))) continue;
    if (efPct <= 0 || efPct >= 100) continue;

    const svStr = formatByStep(svMl, EF_SV_ML.step);
    const esvPctStr = formatByStep(esvOfSvPct, EF_ESV_OF_SV_PCT.step);
    const esvRatioStr = formatByStep(esvOfSvPct / 100, 0.01);
    const answerStr = formatAnswer(efPct);
    if (!answerStr) continue;

    const formulaLine = combineFormulaLine([
      'EF = \\frac{SV}{EDV}\\times 100\\%',
      'EDV = SV + ESV'
    ]);
    const promptLine = `Stroke volume is $${svStr}\\,\\mathrm{mL}$ and end-systolic volume is $${esvPctStr}\\%$ of the stroke volume. Determine the ejection fraction (in percentage).`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [
        `$SV = ${svStr}\\,${formatUnitLatex('mL')}$`,
        `$ESV = ${esvPctStr}\\%\\times SV$`
      ]
    });

    const substitutionLine = `$EF = \\frac{${svStr}}{${svStr} + (${esvRatioStr}\\times ${svStr})}\\times 100\\%$`;
    const finalLine = `$EF = ${answerStr}\\%$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">$ESV = ${esvRatioStr}\\times ${svStr}\\,\\mathrm{mL}$</div>`,
      `<div class="math-step">$EDV = ${svStr} + (${esvRatioStr}\\times ${svStr})\\,\\mathrm{mL}$</div>`,
      `<div class="math-step">${substitutionLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: efPct,
      valueStr: answerStr,
      unit: '\\%',
      step: 0.1,
      rng,
      min: 20,
      max: 80
    });

    const accept = new Set(buildAcceptList('EF', answerStr, '%', ['ejection fraction']));
    accept.add(`${answerStr}%`);
    accept.add(`${answerStr} %`);

    return {
      id: `ef:${runId}:from_sv_esv:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: Array.from(accept),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'cardio', 'ejection', 'fraction']
    };
  }
  throw new Error('Failed to generate ejection fraction from SV/ESV card');
}

function buildEjectionFractionCard(index, rng, runId) {
  if (rng() < 0.5) return buildEjectionFractionFromImprovementCard(index, rng, runId);
  return buildEjectionFractionFromSvEsvShareCard(index, rng, runId);
}

function buildCardiacOutputCard(index, rng, runId) {
  const maxAttempts = 220;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const hrBpm = randStep(rng, CARDIAC_OUTPUT_HR_BPM.min, CARDIAC_OUTPUT_HR_BPM.max, CARDIAC_OUTPUT_HR_BPM.step);
    const svMl = randStep(rng, CARDIAC_OUTPUT_SV_ML.min, CARDIAC_OUTPUT_SV_ML.max, CARDIAC_OUTPUT_SV_ML.step);
    const sys = randStep(rng, CARDIAC_OUTPUT_SYS_BP.min, CARDIAC_OUTPUT_SYS_BP.max, CARDIAC_OUTPUT_SYS_BP.step);
    const dia = randStep(rng, CARDIAC_OUTPUT_DIA_BP.min, CARDIAC_OUTPUT_DIA_BP.max, CARDIAC_OUTPUT_DIA_BP.step);
    const efPct = randStep(rng, CARDIAC_OUTPUT_EF_PCT.min, CARDIAC_OUTPUT_EF_PCT.max, CARDIAC_OUTPUT_EF_PCT.step);
    if (![hrBpm, svMl, sys, dia, efPct].every(v => Number.isFinite(v))) continue;
    if (hrBpm <= 0 || svMl <= 0 || sys <= dia || efPct <= 0 || efPct >= 100) continue;

    const coLMin = hrBpm * svMl * 1e-3;
    if (!Number.isFinite(coLMin) || coLMin <= 0) continue;

    const hrStr = formatByStep(hrBpm, CARDIAC_OUTPUT_HR_BPM.step);
    const svStr = formatByStep(svMl, CARDIAC_OUTPUT_SV_ML.step);
    const sysStr = formatByStep(sys, CARDIAC_OUTPUT_SYS_BP.step);
    const diaStr = formatByStep(dia, CARDIAC_OUTPUT_DIA_BP.step);
    const efStr = formatByStep(efPct, CARDIAC_OUTPUT_EF_PCT.step);
    const answerStr = formatAnswer(coLMin);
    if (!hrStr || !svStr || !sysStr || !diaStr || !efStr || !answerStr) continue;

    const formulaLine = combineFormulaLine([
      'CO = HR\\times SV\\times 10^{-3}'
    ]);
    const promptLine = `The examination results are: blood pressure $${sysStr}/${diaStr}$, ejection fraction $${efStr}\\%$, heart rate $${hrStr}\\,\\mathrm{beats/min}$ and stroke volume $${svStr}\\,\\mathrm{mL}$. Calculate the cardiac output in litres per minute.`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [
        `$HR = ${hrStr}$`,
        `$SV = ${svStr}$`
      ]
    });

    const substitutionLine = `$CO = ${hrStr}\\times ${svStr}\\times 10^{-3}$`;
    const finalLine = `$CO = ${answerStr}\\,${formatUnitLatex('L/min')}$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${substitutionLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: coLMin,
      valueStr: answerStr,
      unit: 'L/min',
      step: CARDIAC_OUTPUT_ANSWER_STEP,
      rng,
      min: 2.0,
      max: 12.0
    });

    const accept = new Set(buildAcceptList('CO', answerStr, 'L/min', ['cardiac output']));
    accept.add(`${answerStr}L/min`);

    return {
      id: `cardiac:${runId}:output:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: Array.from(accept),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'cardio', 'cardiac-output', 'hemodynamics']
    };
  }
  throw new Error('Failed to generate cardiac output card');
}

function buildArterialPressureCard(index, rng, runId) {
  const maxAttempts = 200;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const decPct = randStep(rng, ARTERIAL_AREA_DEC_PCT.min, ARTERIAL_AREA_DEC_PCT.max, ARTERIAL_AREA_DEC_PCT.step);
    if (!Number.isFinite(decPct) || decPct <= 0 || decPct >= 100) continue;
    const decFrac = decPct / 100;
    const areaRatio = 1 - decFrac;
    if (areaRatio <= 0) continue;
    const pressureRatio = 1 / (areaRatio * areaRatio);
    if (!Number.isFinite(pressureRatio)) continue;
    const increasePct = (pressureRatio - 1) * 100;
    if (!Number.isFinite(increasePct) || increasePct <= 0) continue;

    const decPctStr = formatByStep(decPct, 1);
    const decFracStr = formatByStep(decFrac, 0.01);
    const answerStr = formatAnswer(increasePct);
    if (!answerStr) continue;

    const formulaLine = combineFormulaLine([
      '\\Delta_{\\%} P = \\left(\\frac{1}{(1 - \\Delta_{\\%} A)^2} - 1\\right) \\times 100\\%'
    ]);
    const promptLine = `By how many percent does the arterial pressure increase if the total cross-section of systemic circulation system decreases by $${decPctStr}\\%$ and the cardiac output does not change?`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [`$\\Delta_{\\%} A = ${decPctStr}\\%$`]
    });
    const substitutionLine = `$\\Delta_{\\%} P = \\left(\\frac{1}{(1 - ${decFracStr})^2} - 1\\right) \\times 100\\%$`;
    const finalLine = `$\\Delta_{\\%} P = ${answerStr}\\%$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${substitutionLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: increasePct,
      valueStr: answerStr,
      unit: '\\%',
      step: ARTERIAL_ANSWER_STEP,
      rng,
      min: 0,
      max: 100
    });

    return {
      id: `arterial:${runId}:pressure:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: [answerStr, `${answerStr}%`, `${answerStr} %`],
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'arterial', 'pressure']
    };
  }
  throw new Error('Failed to generate arterial pressure card');
}

function buildArterialMeanPressureCard(index, rng, runId) {
  const maxAttempts = 240;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const sbp = randStep(rng, ARTERIAL_MEAN_BP_SBP_MMHG.min, ARTERIAL_MEAN_BP_SBP_MMHG.max, ARTERIAL_MEAN_BP_SBP_MMHG.step);
    const dbp = randStep(rng, ARTERIAL_MEAN_BP_DBP_MMHG.min, ARTERIAL_MEAN_BP_DBP_MMHG.max, ARTERIAL_MEAN_BP_DBP_MMHG.step);
    if (![sbp, dbp].every(v => Number.isFinite(v))) continue;
    if (sbp <= dbp) continue;
    const pulse = sbp - dbp;
    if (pulse < 20 || pulse > 100) continue;

    const mapMmHg = (sbp + (2 * dbp)) / 3;
    const mapKpa = mapMmHg * ARTERIAL_MMHG_TO_PA * Math.pow(10, -3);
    if (!Number.isFinite(mapMmHg) || !Number.isFinite(mapKpa) || mapKpa <= 0) continue;

    const sbpStr = formatByStep(sbp, ARTERIAL_MEAN_BP_SBP_MMHG.step);
    const dbpStr = formatByStep(dbp, ARTERIAL_MEAN_BP_DBP_MMHG.step);
    const answerStr = formatAnswer(mapKpa);
    if (!sbpStr || !dbpStr || !answerStr) continue;

    const formulaLine = combineFormulaLine([
      'MAP = \\left(\\frac{1}{3}SBP + \\frac{2}{3}DBP\\right)\\times 133.3\\times 10^{-3}'
    ]);
    const promptLine = `The measured blood pressure is $${sbpStr}/${dbpStr}\\,\\mathrm{mmHg}$ (systolic/diastolic). Calculate the mean blood pressure in $\\mathrm{kPa}$.`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [
        `$SBP = ${sbpStr}\\,${formatUnitLatex('mmHg')}$`,
        `$DBP = ${dbpStr}\\,${formatUnitLatex('mmHg')}$`
      ]
    });
    const substituteLine = `$MAP = \\left(\\frac{1}{3}\\times ${sbpStr} + \\frac{2}{3}\\times ${dbpStr}\\right)\\times 133.3\\times 10^{-3}$`;
    const finalLine = `$MAP = ${answerStr}\\,${formatUnitLatex('kPa')}$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${substituteLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: mapKpa,
      valueStr: answerStr,
      unit: 'kPa',
      step: ARTERIAL_MEAN_BP_ANSWER_STEP,
      rng,
      min: 6,
      max: 20
    });

    const accept = new Set(buildAcceptList('p_mean', answerStr, 'kPa', ['MAP', 'Pmean', 'mean pressure']));
    accept.add(`${answerStr}kPa`);

    return {
      id: `arterial:${runId}:mean_bp:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: Array.from(accept),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'arterial', 'mean-bp', 'pressure', 'map']
    };
  }
  throw new Error('Failed to generate arterial mean pressure card');
}

function buildArterialPulmonarySpeedCard(index, rng, runId) {
  const maxAttempts = 220;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const vA = randStep(rng, ARTERIAL_PULMONARY_VA_MS.min, ARTERIAL_PULMONARY_VA_MS.max, ARTERIAL_PULMONARY_VA_MS.step);
    const qLMin = randStep(rng, ARTERIAL_PULMONARY_Q_L_MIN.min, ARTERIAL_PULMONARY_Q_L_MIN.max, ARTERIAL_PULMONARY_Q_L_MIN.step);
    const areaIncPct = randStep(rng, ARTERIAL_PULMONARY_AREA_INC_PCT.min, ARTERIAL_PULMONARY_AREA_INC_PCT.max, ARTERIAL_PULMONARY_AREA_INC_PCT.step);
    if (![vA, qLMin, areaIncPct].every(v => Number.isFinite(v))) continue;
    if (vA <= 0 || qLMin <= 0 || areaIncPct <= 0) continue;

    const qM3s = (qLMin * 1e-3) / 60;
    if (!Number.isFinite(qM3s) || qM3s <= 0) continue;

    const aA = qM3s / vA;
    if (!Number.isFinite(aA) || aA <= 0) continue;
    const inc = areaIncPct / 100;
    const aP = aA * (1 + inc);
    if (!Number.isFinite(aP) || aP <= 0) continue;
    const vP = qM3s / aP;
    if (!Number.isFinite(vP) || vP <= 0) continue;

    const vAStr = formatByStep(vA, ARTERIAL_PULMONARY_VA_MS.step);
    const qLMinStr = formatByStep(qLMin, ARTERIAL_PULMONARY_Q_L_MIN.step);
    const areaIncStr = formatByStep(areaIncPct, ARTERIAL_PULMONARY_AREA_INC_PCT.step);
    const incStr = formatByStep(inc, 0.01);
    const answerStr = formatAnswer(vP);
    if (!vAStr || !qLMinStr || !areaIncStr || !incStr || !answerStr) continue;

    const formulaLine = combineFormulaLine([
      'Q = A_a \\times v_a = A_p \\times v_p',
      'A_p = A_a \\times (1 + \\Delta_{\\%}A)',
      'v_p = \\frac{v_a}{1 + \\Delta_{\\%}A}'
    ]);
    const promptLine = `The mean speed of blood in the aorta is $${vAStr}\\,\\mathrm{m/s}$ and the cardiac output is $${qLMinStr}\\,\\mathrm{L/min}$. What is the mean speed of blood (in $\\mathrm{m/s}$) in the pulmonary artery if its cross-section area is $${areaIncStr}\\%$ greater than the cross-section area of the aorta?`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [
        `$Q = ${qLMinStr}\\,${formatUnitLatex('L/min')}$`,
        `$v_a = ${vAStr}\\,${formatUnitLatex('m/s')}$`,
        `$\\Delta_{\\%}A = ${areaIncStr}\\%$`
      ]
    });

    const substitutionLine = `$v_p = \\frac{v_a}{1+\\Delta_{\\%}A} = \\frac{${vAStr}}{1+${incStr}}$`;
    const finalLine = `$v_p = ${answerStr}\\,${formatUnitLatex('m/s')}$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${substitutionLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: vP,
      valueStr: answerStr,
      unit: 'm/s',
      step: ARTERIAL_PULMONARY_ANSWER_STEP,
      rng,
      min: 0.05,
      max: 1.0
    });

    const accept = new Set(buildAcceptList('v_p', answerStr, 'm/s', ['vp', 'pulmonary speed']));
    accept.add(`${answerStr}m/s`);

    return {
      id: `arterial:${runId}:pulmonary_speed:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: Array.from(accept),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'arterial', 'flow', 'continuity']
    };
  }
  throw new Error('Failed to generate arterial pulmonary speed card');
}

function buildPhotonWavelengthCard(index, rng, runId) {
  const maxAttempts = 200;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const photonCoeff = randStep(rng, PHOTON_WAVELENGTH_PHOTON_COEFF.min, PHOTON_WAVELENGTH_PHOTON_COEFF.max, PHOTON_WAVELENGTH_PHOTON_COEFF.step);
    const intensityMw = randStep(rng, PHOTON_WAVELENGTH_INTENSITY_MW.min, PHOTON_WAVELENGTH_INTENSITY_MW.max, PHOTON_WAVELENGTH_INTENSITY_MW.step);
    if (!Number.isFinite(photonCoeff) || !Number.isFinite(intensityMw)) continue;

    const photons = photonCoeff * Math.pow(10, PHOTON_WAVELENGTH_PHOTON_EXP);
    const intensityW = intensityMw * 1e-3;
    const f = (intensityW * 1 * 1) / (photons * PHOTON_WAVELENGTH_H);
    if (!Number.isFinite(f) || f <= 0) continue;

    const lambdaNm = (PHOTON_WAVELENGTH_C / f) * 1e9;
    if (!Number.isFinite(lambdaNm)) continue;
    if (lambdaNm < PHOTON_WAVELENGTH_RANGE_NM.min || lambdaNm > PHOTON_WAVELENGTH_RANGE_NM.max) continue;

    const photonCoeffStr = formatByStep(photonCoeff, PHOTON_WAVELENGTH_PHOTON_COEFF.step);
    const nStr = `${photonCoeffStr} \\times 10^{${PHOTON_WAVELENGTH_PHOTON_EXP}}`;
    const intensityMwStr = formatByStep(intensityMw, PHOTON_WAVELENGTH_INTENSITY_MW.step);
    const intensityWStr = `${intensityMwStr} \\times 10^{-3}`;
    const hStr = formatSciLatex(PHOTON_WAVELENGTH_H, 4);
    const cStr = formatSciLatex(PHOTON_WAVELENGTH_C, 3);
    const lambdaStr = formatAnswer(lambdaNm);
    if (!lambdaStr) continue;

    const formulaLine = combineFormulaLine([
      '\\lambda = \\frac{c \\times N \\times h}{I \\times A \\times t}'
    ]);
    const promptLine = `$${nStr}$ photons are incident on area $1\\,\\mathrm{m^2}$ during $1\\,\\mathrm{s}$. The light intensity is $${intensityMwStr}\\,\\mathrm{mW/m^2}$. Calculate the wavelength of this light in $\\mathrm{nm}$.`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [
        `$I = ${intensityMwStr}\\,${formatUnitLatex('mW/m^2')}$`,
        `$A = 1\\,${formatUnitLatex('m^2')}$`,
        `$t = 1\\,${formatUnitLatex('s')}$`,
        `$N = ${nStr}$`,
        `$h = ${hStr}\\,${formatUnitLatex('J\\,s')}$`,
        `$c = ${cStr}\\,${formatUnitLatex('m/s')}$`
      ]
    });
    const substitutionLine = `$\\lambda = \\frac{${cStr} \\times ${nStr} \\times ${hStr}}{${intensityWStr} \\times 1 \\times 1} \\times 10^{9}$`;
    const finalLine = `$\\lambda = ${lambdaStr}\\,\\mathrm{nm}$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${substitutionLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: lambdaNm,
      valueStr: lambdaStr,
      unit: 'nm',
      rng,
      min: PHOTON_WAVELENGTH_RANGE_NM.min,
      max: PHOTON_WAVELENGTH_RANGE_NM.max
    });

    const accept = new Set(buildAcceptList('lambda', lambdaStr, 'nm', ['λ']));
    accept.add(`${lambdaStr}nm`);

    return {
      id: `photon:${runId}:lambda:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [lambdaStr],
      accept: Array.from(accept),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'photon', 'wavelength', 'intensity']
    };
  }
  throw new Error('Failed to generate photon wavelength card');
}

function buildArterialAneurysmPressureCard(index, rng, runId) {
  const maxAttempts = 220;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const p1Kpa = randStep(rng, ARTERIAL_ANEURYSM_P1_KPA.min, ARTERIAL_ANEURYSM_P1_KPA.max, ARTERIAL_ANEURYSM_P1_KPA.step);
    const v1 = randStep(rng, ARTERIAL_ANEURYSM_V1_MS.min, ARTERIAL_ANEURYSM_V1_MS.max, ARTERIAL_ANEURYSM_V1_MS.step);
    const areaIncPct = randStep(rng, ARTERIAL_ANEURYSM_AREA_INC_PCT.min, ARTERIAL_ANEURYSM_AREA_INC_PCT.max, ARTERIAL_ANEURYSM_AREA_INC_PCT.step);
    if (![p1Kpa, v1, areaIncPct].every(v => Number.isFinite(v))) continue;
    if (p1Kpa <= 0 || v1 <= 0 || areaIncPct <= 0) continue;

    const alpha = areaIncPct / 100;
    const v2 = v1 / (1 + alpha);
    if (!Number.isFinite(v2) || v2 <= 0) continue;

    const p1Pa = p1Kpa * 1000;
    const p2Pa = p1Pa + 0.5 * ARTERIAL_ANEURYSM_RHO * (v1 * v1 - v2 * v2);
    if (!Number.isFinite(p2Pa) || p2Pa <= 0) continue;

    const deltaPct = ((p2Pa - p1Pa) / p1Pa) * 100;
    if (!Number.isFinite(deltaPct) || deltaPct <= 0) continue;
    if (deltaPct < 0.2 || deltaPct > 20) continue;

    const p1Str = formatByStep(p1Kpa, ARTERIAL_ANEURYSM_P1_KPA.step);
    const v1Str = formatByStep(v1, ARTERIAL_ANEURYSM_V1_MS.step);
    const alphaStr = formatByStep(alpha, 0.01);
    const areaIncStr = formatByStep(areaIncPct, ARTERIAL_ANEURYSM_AREA_INC_PCT.step);
    const rhoStr = formatByStep(ARTERIAL_ANEURYSM_RHO, 1);
    const answerStr = formatAnswer(deltaPct);
    if (!p1Str || !v1Str || !alphaStr || !rhoStr || !answerStr) continue;

    const formulaLine = combineFormulaLine([
      'A_1 \\times v_1 = A_2 \\times v_2',
      'p_1 + \\frac{1}{2} \\times \\rho \\times v_1^2 = p_2 + \\frac{1}{2} \\times \\rho \\times v_2^2',
      '\\Delta_{\\%} p = \\left(\\frac{p_2 - p_1}{p_1}\\right)\\times 100\\%'
    ]);
    const promptLine = `An aneurysm appeared in an artery where the mean blood pressure was $${p1Str}\\,\\mathrm{kPa}$ and the mean blood velocity was $${v1Str}\\,\\mathrm{m/s}$. In the aneurysm the cross-section increased by $${areaIncStr}\\%$ of the original cross-section. By how many percent did the blood pressure increase at the aneurysm location? Assume constant volume flow.`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [
        `$p_1 = ${p1Str}\\,${formatUnitLatex('kPa')}$`,
        `$v_1 = ${v1Str}\\,${formatUnitLatex('m/s')}$`,
        `$\\Delta_{\\%}A = ${areaIncStr}\\%$`,
        `$\\rho = ${rhoStr}\\,${formatUnitLatex('kg/m^3')}$`
      ]
    });

    const v2Line = `$v_2 = \\frac{v_1}{1 + \\Delta_{\\%}A} = \\frac{${v1Str}}{1 + ${alphaStr}}$`;
    const substitutionLine = `$\\Delta_{\\%} p = \\left(\\frac{\\frac{1}{2}\\times ${rhoStr}\\times\\left(${v1Str}^2 - \\left(\\frac{${v1Str}}{1 + ${alphaStr}}\\right)^2\\right)}{${p1Str}\\times 10^{3}}\\right)\\times 100\\%$`;
    const finalLine = `$\\Delta_{\\%} p = ${answerStr}\\%$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${v2Line}</div>`,
      `<div class="math-step">${substitutionLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: deltaPct,
      valueStr: answerStr,
      unit: '\\%',
      step: ARTERIAL_ANEURYSM_ANSWER_STEP,
      rng,
      min: 0,
      max: 25
    });

    const accept = new Set(buildAcceptList('Delta_p', answerStr, '%', ['\\Delta p', 'pressure increase']));
    accept.add(`${answerStr}%`);
    accept.add(`${answerStr} %`);

    return {
      id: `arterial:${runId}:aneurysm:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: Array.from(accept),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'arterial', 'aneurysm', 'pressure']
    };
  }
  throw new Error('Failed to generate arterial aneurysm pressure card');
}

function buildPhotonEnergyFromWavelengthCard(index, rng, runId) {
  const maxAttempts = 200;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const lambdaNm = randStep(rng, PHOTON_ENERGY_WAVELENGTH_NM.min, PHOTON_ENERGY_WAVELENGTH_NM.max, PHOTON_ENERGY_WAVELENGTH_NM.step);
    const powerMw = randStep(rng, PHOTON_ENERGY_POWER_MW.min, PHOTON_ENERGY_POWER_MW.max, PHOTON_ENERGY_POWER_MW.step);
    if (!Number.isFinite(lambdaNm) || !Number.isFinite(powerMw) || lambdaNm <= 0) continue;

    const lambdaM = lambdaNm * 1e-9;
    const energyJ = (PHOTON_WAVELENGTH_H * PHOTON_WAVELENGTH_C) / lambdaM;
    if (!Number.isFinite(energyJ) || energyJ <= 0) continue;

    const scaledEnergy = energyJ * Math.pow(10, -PHOTON_ENERGY_SCALE_EXP);
    if (!Number.isFinite(scaledEnergy)) continue;
    if (scaledEnergy < PHOTON_ENERGY_COEFF_RANGE.min || scaledEnergy > PHOTON_ENERGY_COEFF_RANGE.max) continue;

    const lambdaStr = formatByStep(lambdaNm, PHOTON_ENERGY_WAVELENGTH_NM.step);
    const lambdaMStr = `${lambdaStr} \\times 10^{-9}`;
    const powerStr = formatByStep(powerMw, PHOTON_ENERGY_POWER_MW.step);
    const hStr = formatSciLatex(PHOTON_WAVELENGTH_H, 4);
    const cStr = formatSciLatex(PHOTON_WAVELENGTH_C, 3);
    const answerStr = formatAnswer(scaledEnergy);
    if (!answerStr) continue;

    const formulaLine = combineFormulaLine([
      'E = \\frac{h \\times c}{\\lambda}'
    ]);
    const promptLine = `Light of a laser has wavelength $${lambdaStr}\\,\\mathrm{nm}$ and power $${powerStr}\\,\\mathrm{mW}$. Calculate the energy of one photon. Express your answer as coefficient in $10^{-19}\\,\\mathrm{J}$.`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [
        `$h = ${hStr}\\,${formatUnitLatex('J\\,s')}$`,
        `$c = ${cStr}\\,${formatUnitLatex('m/s')}$`,
        `$\\lambda = ${lambdaStr}\\,${formatUnitLatex('nm')}$`
      ]
    });
    const substitutionLine = `$E = \\frac{${hStr} \\times ${cStr}}{${lambdaMStr}}$`;
    const finalLine = `$E = ${answerStr} \\times 10^{-19}\\,\\mathrm{J}$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${substitutionLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: scaledEnergy,
      valueStr: answerStr,
      unit: '',
      step: PHOTON_ENERGY_ANSWER_STEP,
      rng,
      min: PHOTON_ENERGY_COEFF_RANGE.min,
      max: PHOTON_ENERGY_COEFF_RANGE.max
    });

    const accept = new Set(buildAcceptList('E', answerStr, '', ['energy']));
    accept.add(`${answerStr}x10^-19J`);
    accept.add(`${answerStr} x 10^-19 J`);
    accept.add(`${answerStr}*10^-19J`);
    accept.add(`${answerStr} * 10^-19 J`);
    accept.add(`${answerStr} × 10^-19 J`);
    accept.add(`${answerStr}e-19J`);

    return {
      id: `photon:${runId}:energy:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: Array.from(accept),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'photon', 'energy', 'wavelength']
    };
  }
  throw new Error('Failed to generate photon energy card');
}

function buildPhotonCard(index, rng, runId) {
  if (rng() < 0.5) return buildPhotonWavelengthCard(index, rng, runId);
  return buildPhotonEnergyFromWavelengthCard(index, rng, runId);
}

function buildAcousticImpedanceAirCard(index, rng, runId) {
  const maxAttempts = 200;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const rho = randStep(
      rng,
      ACOUSTIC_IMPEDANCE_RHO_AIR.min,
      ACOUSTIC_IMPEDANCE_RHO_AIR.max,
      ACOUSTIC_IMPEDANCE_RHO_AIR.step
    );
    const c = randStep(
      rng,
      ACOUSTIC_IMPEDANCE_SOUND_SPEED_AIR.min,
      ACOUSTIC_IMPEDANCE_SOUND_SPEED_AIR.max,
      ACOUSTIC_IMPEDANCE_SOUND_SPEED_AIR.step
    );
    if (!Number.isFinite(rho) || !Number.isFinite(c) || rho <= 0 || c <= 0) continue;

    const z = rho * c;
    if (!Number.isFinite(z) || z <= 0) continue;
    const zRounded = Math.round(z);
    if (!Number.isFinite(zRounded) || zRounded <= 0) continue;

    const rhoStr = formatByStep(rho, ACOUSTIC_IMPEDANCE_RHO_AIR.step);
    const cStr = formatByStep(c, ACOUSTIC_IMPEDANCE_SOUND_SPEED_AIR.step);
    const answerStr = formatByStep(zRounded, ACOUSTIC_IMPEDANCE_ANSWER_STEP);
    if (!rhoStr || !cStr || !answerStr) continue;

    const formulaLine = combineFormulaLine([
      'Z = \\rho \\times c'
    ]);
    const promptLine = 'Calculate the acoustical impedance of air (in $\\mathrm{kg\\,m^{-2}\\,s^{-1}}$) at normal temperature and pressure.';
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [
        `$\\rho = ${rhoStr}\\,${formatUnitLatex('kg/m^3')}$`,
        `$c = ${cStr}\\,${formatUnitLatex('m/s')}$`
      ]
    });

    const substitutionLine = `$Z = ${rhoStr} \\times ${cStr}$`;
    const finalLine = `$Z = ${answerStr}\\,${formatUnitLatex('kg\\,m^{-2}\\,s^{-1}')}$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${substitutionLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: zRounded,
      valueStr: answerStr,
      unit: 'kg m^-2 s^-1',
      step: ACOUSTIC_IMPEDANCE_ANSWER_STEP,
      rng,
      min: 300,
      max: 500
    });

    const accept = new Set(buildAcceptList('Z', answerStr, 'kg m^-2 s^-1', ['impedance', 'acoustic impedance']));
    accept.add(`${answerStr}kgm^-2s^-1`);

    return {
      id: `acoustic:${runId}:impedance:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: Array.from(accept),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'acoustics', 'impedance', 'air']
    };
  }
  throw new Error('Failed to generate acoustic impedance card');
}

function buildSoundPipesCard(index, rng, runId) {
  const maxAttempts = 200;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const levelDb = randStep(rng, SOUND_PIPE_LEVEL_DB.min, SOUND_PIPE_LEVEL_DB.max, SOUND_PIPE_LEVEL_DB.step);
    const pipeCount = randStep(rng, SOUND_PIPE_COUNT.min, SOUND_PIPE_COUNT.max, SOUND_PIPE_COUNT.step);
    if (!Number.isFinite(levelDb) || !Number.isFinite(pipeCount)) continue;
    if (pipeCount < 2) continue;

    const totalLevel = 10 * Math.log10(pipeCount * Math.pow(10, levelDb / 10));
    if (!Number.isFinite(totalLevel)) continue;

    const levelStr = formatByStep(levelDb, SOUND_PIPE_LEVEL_DB.step);
    const countStr = formatByStep(pipeCount, SOUND_PIPE_COUNT.step);
    const answerStr = formatAnswer(totalLevel);
    if (!answerStr) continue;

    const formulaLine = combineFormulaLine([
      'L = 10 \\log_{10}\\left(N \\times 10^{L_1/10}\\right)'
    ]);
    const promptLine = `One pipe can produce the sound of the intensity level $${levelStr}\\,\\mathrm{dB}$. Calculate the sound intensity level (in $\\mathrm{dB}$) produced by the organ composed of $${countStr}$ pipes.`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [
        `$N = ${countStr}$`,
        `$L_1 = ${levelStr}\\,${formatUnitLatex('dB')}$`
      ]
    });
    const substitutionLine = `$L = 10 \\log_{10}\\left(${countStr} \\times 10^{${levelStr}/10}\\right)$`;
    const finalLine = `$L = ${answerStr}\\,${formatUnitLatex('dB')}$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${substitutionLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: totalLevel,
      valueStr: answerStr,
      unit: 'dB',
      step: SOUND_ANSWER_STEP,
      rng,
      min: 0,
      max: 140
    });

    const accept = new Set(buildAcceptList('L', answerStr, 'dB'));
    accept.add(`${answerStr}dB`);

    return {
      id: `sound:${runId}:pipes:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: Array.from(accept),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'sound', 'intensity', 'pipes']
    };
  }
  throw new Error('Failed to generate sound pipes card');
}

function buildLoudspeakerPressureCard(index, rng, runId) {
  const maxAttempts = 220;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const freqHz = randStep(rng, SOUND_LOUDSPEAKER_FREQ_HZ.min, SOUND_LOUDSPEAKER_FREQ_HZ.max, SOUND_LOUDSPEAKER_FREQ_HZ.step);
    const dispMm = randStep(rng, SOUND_LOUDSPEAKER_DISP_MM.min, SOUND_LOUDSPEAKER_DISP_MM.max, SOUND_LOUDSPEAKER_DISP_MM.step);
    const medium = SOUND_LOUDSPEAKER_MEDIA[Math.floor(rng() * SOUND_LOUDSPEAKER_MEDIA.length)] || SOUND_LOUDSPEAKER_MEDIA[0];
    if (![freqHz, dispMm, medium?.rho, medium?.c].every(v => Number.isFinite(v))) continue;
    if (freqHz <= 0 || dispMm <= 0) continue;

    const dispM = dispMm * 1e-3;
    const v = 2 * Math.PI * freqHz * dispM;
    const zMedium = medium.rho * medium.c;
    const pMax = zMedium * v;
    const pEff = pMax / SOUND_LOUDSPEAKER_SQRT2;
    if (!Number.isFinite(v) || !Number.isFinite(pMax) || pMax <= 0 || !Number.isFinite(pEff) || pEff <= 0) continue;

    const freqStr = formatByStep(freqHz, SOUND_LOUDSPEAKER_FREQ_HZ.step);
    const dispStr = formatByStep(dispMm, SOUND_LOUDSPEAKER_DISP_MM.step);
    const rhoStr = formatByStep(medium.rho, medium.rho < 10 ? 0.1 : 1);
    const cStr = formatByStep(medium.c, 1);
    const zStr = formatAnswer(zMedium);
    const vStr = formatAnswer(v);
    const pMaxStr = formatAnswer(pMax);
    const askEffective = rng() < 0.5;
    const targetValue = askEffective ? pEff : pMax;
    const answerStr = formatAnswer(targetValue);
    const sqrt2Str = formatConst(SOUND_LOUDSPEAKER_SQRT2, 3);
    if (!freqStr || !dispStr || !rhoStr || !cStr || !zStr || !vStr || !pMaxStr || !answerStr || !sqrt2Str) continue;

    const formulaLine = askEffective
      ? combineFormulaLine([
          'v = 2\\pi f A',
          'Z = \\rho c',
          'p_{max} = \\rho c v',
          'p_{eff} = \\frac{p_{max}}{\\sqrt{2}}'
        ])
      : combineFormulaLine([
          'v = 2\\pi f A',
          'Z = \\rho c',
          'p_{max} = \\rho c v'
        ]);
    const promptLine = askEffective
      ? `The membrane of a loudspeaker is vibrating in ${medium.label} at frequency $${freqStr}\\,\\mathrm{Hz}$ with displacement amplitude $${dispStr}\\,\\mathrm{mm}$. Calculate the effective acoustic pressure $p_{eff}$ (in $\\mathrm{Pa}$).`
      : `The membrane of a loudspeaker is vibrating in ${medium.label} at frequency $${freqStr}\\,\\mathrm{Hz}$ with displacement amplitude $${dispStr}\\,\\mathrm{mm}$. Calculate the maximum acoustic pressure $p_{max}$ (in $\\mathrm{Pa}$).`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [
        `$f = ${freqStr}\\,${formatUnitLatex('Hz')}$`,
        `$A = ${dispStr}\\,${formatUnitLatex('mm')}$`,
        `$\\rho = ${rhoStr}\\,${formatUnitLatex('kg/m^3')}$`,
        `$c = ${cStr}\\,${formatUnitLatex('m/s')}$`,
        `$\\pi = 3.14$`,
        `$\\sqrt{2} = ${sqrt2Str}$`
      ]
    });
    const velocityLine = `$v = 2\\pi \\times ${freqStr} \\times (${dispStr}\\times 10^{-3}) = ${vStr}\\,${formatUnitLatex('m/s')}$`;
    const impedanceLine = `$Z = ${rhoStr}\\times ${cStr} = ${zStr}\\,${formatUnitLatex('kg/(m^2 s)')}$`;
    const pMaxSubstituteLine = `$p_{max} = Z\\times v = ${zStr}\\times ${vStr} = ${pMaxStr}\\,${formatUnitLatex('Pa')}$`;
    const pEffLine = `$p_{eff} = \\frac{p_{max}}{\\sqrt{2}} = \\frac{${pMaxStr}}{${sqrt2Str}}\\,${formatUnitLatex('Pa')}$`;
    const finalLine = askEffective
      ? `$p_{eff} = ${answerStr}\\,${formatUnitLatex('Pa')}$`
      : `$p_{max} = ${answerStr}\\,${formatUnitLatex('Pa')}$`;
    const back = askEffective
      ? [
          `<div class="math-step">${formulaLine}</div>`,
          `<div class="math-step">${velocityLine}</div>`,
          `<div class="math-step">${impedanceLine}</div>`,
          `<div class="math-step">${pMaxSubstituteLine}</div>`,
          `<div class="math-step">${pEffLine}</div>`,
          `<div class="math-final">${finalLine}</div>`
        ].join('')
      : [
          `<div class="math-step">${formulaLine}</div>`,
          `<div class="math-step">${velocityLine}</div>`,
          `<div class="math-step">${impedanceLine}</div>`,
          `<div class="math-step">${pMaxSubstituteLine}</div>`,
          `<div class="math-final">${finalLine}</div>`
        ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: targetValue,
      valueStr: answerStr,
      unit: 'Pa',
      step: SOUND_LOUDSPEAKER_ANSWER_STEP,
      rng,
      min: 1,
      max: Math.max(220, targetValue * 2.2)
    });

    const accept = askEffective
      ? new Set(buildAcceptList('p_eff', answerStr, 'Pa', ['peff', 'p_effective', 'p_rms', 'pressure']))
      : new Set(buildAcceptList('p_max', answerStr, 'Pa', ['pmax', 'p_amplitude', 'pressure']));
    accept.add(`${answerStr}Pa`);

    return {
      id: `sound:${runId}:loudspeaker_pressure:${askEffective ? 'eff' : 'max'}:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: Array.from(accept),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: askEffective
        ? ['biophysics', 'sound', 'loudspeaker', 'acoustic-pressure', 'effective']
        : ['biophysics', 'sound', 'loudspeaker', 'acoustic-pressure', 'maximum']
    };
  }
  throw new Error('Failed to generate loudspeaker pressure card');
}

function buildEyeResolutionCard(index, rng, runId) {
  const maxAttempts = 200;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const distanceMm = randStep(rng, EYE_RESOLUTION_DISTANCE_MM.min, EYE_RESOLUTION_DISTANCE_MM.max, EYE_RESOLUTION_DISTANCE_MM.step);
    if (!Number.isFinite(distanceMm) || distanceMm <= 0) continue;

    const distanceM = distanceMm * 1e-3;
    const alphaRad = (EYE_RESOLUTION_ALPHA_DEG * Math.PI) / 180;
    const tanHalf = Math.tan(alphaRad / 2);
    if (!Number.isFinite(tanHalf) || tanHalf <= 0) continue;

    const x = (distanceM / 2) / tanHalf;
    if (!Number.isFinite(x) || x <= 0) continue;

    const distanceMmStr = formatByStep(distanceMm, EYE_RESOLUTION_DISTANCE_MM.step);
    const distanceMStr = formatSciLatex(distanceM, 3);
    const answerStr = formatAnswer(x);
    if (!answerStr) continue;

    const formulaLine = combineFormulaLine([
      'x = \\frac{\\frac{d}{2}}{\\tan(\\frac{\\alpha}{2})}',
      '\\alpha = \\frac{1}{60}^{\\circ}'
    ]);
    const promptLine = `Two very small objects are placed in the same distance in front of an eye. Their distance is $${distanceMmStr}\\,\\mathrm{mm}$. Find the maximal distance (in $\\mathrm{m}$) from the normal eye in which they are distinguished as two separate objects.`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [
        `$d = ${distanceMmStr}\\,${formatUnitLatex('mm')}$`,
        `$\\alpha = \\frac{1}{60}^{\\circ}$`
      ]
    });
    const substitutionLine = `$x = \\frac{\\frac{${distanceMStr}}{2}}{\\tan\\left(\\frac{\\frac{1}{60}^{\\circ}}{2}\\right)}$`;
    const finalLine = `$x = ${answerStr}\\,${formatUnitLatex('m')}$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${substitutionLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: x,
      valueStr: answerStr,
      unit: 'm',
      step: EYE_RESOLUTION_ANSWER_STEP,
      rng,
      min: 0,
      max: 50
    });

    const accept = new Set(buildAcceptList('x', answerStr, 'm'));
    accept.add(`${answerStr}m`);

    return {
      id: `eye:${runId}:resolution:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: Array.from(accept),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'vision', 'resolution', 'eye']
    };
  }
  throw new Error('Failed to generate eye resolution card');
}

function buildMicroscopeResolutionCard(index, rng, runId) {
  const maxAttempts = 200;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const askNaFromAngle = rng() < 0.5;
    const lambdaNm = randStep(rng, MICROSCOPE_LAMBDA_NM.min, MICROSCOPE_LAMBDA_NM.max, MICROSCOPE_LAMBDA_NM.step);
    if (!Number.isFinite(lambdaNm) || lambdaNm <= 0) continue;

    if (askNaFromAngle) {
      const alphaDeg = randStep(rng, MICROSCOPE_ALPHA_DEG.min, MICROSCOPE_ALPHA_DEG.max, MICROSCOPE_ALPHA_DEG.step);
      const n = MICROSCOPE_REFRACTIVE_INDEX_OPTIONS[Math.floor(rng() * MICROSCOPE_REFRACTIVE_INDEX_OPTIONS.length)];
      if (![alphaDeg, n].every(v => Number.isFinite(v))) continue;

      const alphaRad = (alphaDeg * Math.PI) / 180;
      const na = n * Math.sin(alphaRad);
      if (!Number.isFinite(na) || na <= 0) continue;

      const lambdaStr = formatByStep(lambdaNm, MICROSCOPE_LAMBDA_NM.step);
      const alphaStr = formatByStep(alphaDeg, MICROSCOPE_ALPHA_DEG.step);
      const nStr = formatByStep(n, 0.01);
      const answerStr = formatAnswer(na);
      if (!answerStr || !lambdaStr || !alphaStr || !nStr) continue;

      const formulaLine = combineFormulaLine([
        'NA = n\\sin(\\alpha)'
      ]);
      const promptLine = `A microscope uses light with wavelength $${lambdaStr}\\,\\mathrm{nm}$. In the objective medium, the refractive index is $${nStr}$ and the refraction angle is $${alphaStr}^{\\circ}$. Find the numerical aperture $NA$.`;
      const front = buildFrontWithPrompt({
        promptLine,
        formulaLine,
        givenLines: [
          `$\\lambda = ${lambdaStr}\\,${formatUnitLatex('nm')}$`,
          `$n = ${nStr}$`,
          `$\\alpha = ${alphaStr}^{\\circ}$`
        ]
      });
      const substitutionLine = `$NA = ${nStr}\\sin(${alphaStr}^{\\circ})$`;
      const finalLine = `$NA = ${answerStr}$`;
      const back = [
        `<div class="math-step">${formulaLine}</div>`,
        `<div class="math-step">${substitutionLine}</div>`,
        `<div class="math-final">${finalLine}</div>`
      ].join('');

      const { options: mcqOptions, correctText } = buildNumericMcqOptions({
        value: na,
        valueStr: answerStr,
        unit: '',
        step: MICROSCOPE_NA_ANSWER_STEP,
        rng,
        min: 0.5,
        max: 1.6
      });

      const accept = new Set(buildAcceptList('NA', answerStr, '', ['na']));

      return {
        id: `microscope:${runId}:na:${String(index).padStart(3, '0')}`,
        archetype: 'maths',
        front,
        back,
        correct: [answerStr],
        accept: Array.from(accept),
        mcqOptions: mcqOptions.map(text => ({ text })),
        mcqCorrect: [correctText],
        tags: ['biophysics', 'microscope', 'numerical-aperture', 'optics']
      };
    }

    const na = randStep(rng, MICROSCOPE_NA.min, MICROSCOPE_NA.max, MICROSCOPE_NA.step);
    if (!Number.isFinite(na) || na <= 0) continue;

    const resNm = lambdaNm / na;
    if (!Number.isFinite(resNm) || resNm <= 0) continue;

    const naStr = formatByStep(na, MICROSCOPE_NA.step);
    const lambdaStr = formatByStep(lambdaNm, MICROSCOPE_LAMBDA_NM.step);
    const answerStr = formatAnswer(resNm);
    if (!answerStr) continue;

    const formulaLine = combineFormulaLine([
      'R = \\frac{\\lambda}{NA}'
    ]);
    const promptLine = `A microscope is equipped with the immersion objective with $NA = ${naStr}$. Light with wavelength $${lambdaStr}\\,\\mathrm{nm}$ was used. Find the resolution ($\\mathrm{nm}$) of the microscope.`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [
        `$\\lambda = ${lambdaStr}\\,${formatUnitLatex('nm')}$`,
        `$NA = ${naStr}$`
      ]
    });
    const substitutionLine = `$R = \\frac{${lambdaStr}}{${naStr}}$`;
    const finalLine = `$R = ${answerStr}\\,${formatUnitLatex('nm')}$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${substitutionLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: resNm,
      valueStr: answerStr,
      unit: 'nm',
      step: MICROSCOPE_ANSWER_STEP,
      rng,
      min: 100,
      max: 1000
    });

    const accept = new Set(buildAcceptList('R', answerStr, 'nm'));
    accept.add(`${answerStr}nm`);

    return {
      id: `microscope:${runId}:resolution:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: Array.from(accept),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'microscope', 'resolution', 'optics']
    };
  }
  throw new Error('Failed to generate microscope resolution card');
}

function buildMicroscopeMagnificationCard(index, rng, runId) {
  const maxAttempts = 200;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const objectiveMag = randStep(
      rng,
      MICROSCOPE_MAG_OBJECTIVE.min,
      MICROSCOPE_MAG_OBJECTIVE.max,
      MICROSCOPE_MAG_OBJECTIVE.step
    );
    const eyepieceMag = randStep(
      rng,
      MICROSCOPE_MAG_EYEPIECE.min,
      MICROSCOPE_MAG_EYEPIECE.max,
      MICROSCOPE_MAG_EYEPIECE.step
    );
    if (!Number.isFinite(objectiveMag) || !Number.isFinite(eyepieceMag)) continue;
    if (objectiveMag <= 0 || eyepieceMag <= 0) continue;

    const totalMag = objectiveMag * eyepieceMag;
    if (!Number.isFinite(totalMag) || totalMag <= 0) continue;

    const objectiveStr = formatByStep(objectiveMag, MICROSCOPE_MAG_OBJECTIVE.step);
    const eyepieceStr = formatByStep(eyepieceMag, MICROSCOPE_MAG_EYEPIECE.step);
    const answerStr = formatByStep(totalMag, MICROSCOPE_MAG_ANSWER_STEP);
    if (!objectiveStr || !eyepieceStr || !answerStr) continue;

    const formulaLine = combineFormulaLine([
      'M = M_{obj} \\times M_{eye}'
    ]);
    const promptLine = `The compound microscope has objective magnification $${objectiveStr}$ and eyepiece magnification $${eyepieceStr}$. Calculate the total magnification of this microscope.`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [
        `$M_{obj} = ${objectiveStr}$`,
        `$M_{eye} = ${eyepieceStr}$`
      ]
    });
    const substitutionLine = `$M = ${objectiveStr} \\times ${eyepieceStr}$`;
    const finalLine = `$M = ${answerStr}$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${substitutionLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: totalMag,
      valueStr: answerStr,
      unit: '',
      step: MICROSCOPE_MAG_ANSWER_STEP,
      rng,
      min: 80,
      max: 2400
    });

    const accept = new Set(buildAcceptList('M', answerStr, '', ['magnification']));

    return {
      id: `microscope:${runId}:magnification:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: Array.from(accept),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'microscope', 'magnification', 'optics']
    };
  }
  throw new Error('Failed to generate microscope magnification card');
}

function buildNearPointDistanceCard(index, rng, runId) {
  const maxAttempts = 200;
  const invRef = 1 / NEAR_POINT_REF_M;
  const refDistStr = formatByStep(NEAR_POINT_REF_M, 0.01);
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const power = randStep(rng, NEAR_POINT_POWER_D.min, NEAR_POINT_POWER_D.max, NEAR_POINT_POWER_D.step);
    if (!Number.isFinite(power) || power <= 0) continue;
    const invNear = invRef - power;
    if (!Number.isFinite(invNear) || invNear <= 0) continue;
    const nearPoint = 1 / invNear;
    if (!Number.isFinite(nearPoint) || nearPoint <= 0) continue;
    const useCmVariant = rng() < 0.5;
    const nearPointCm = nearPoint * 100;

    const powerStr = formatByStep(power, NEAR_POINT_POWER_D.step);
    const invNearStr = formatByStep(invNear, 0.01);
    const answerStr = useCmVariant ? formatByStep(nearPointCm, 0.1) : formatAnswer(nearPoint);
    if (!answerStr) continue;

    const formulaLine = combineFormulaLine([
      '\\frac{1}{NP} = \\frac{1}{d_0} - P',
      'NP = \\frac{1}{\\frac{1}{d_0} - P}'
    ]);
    const promptLine = useCmVariant
      ? `The optical power of the patient's glasses is equal to $${powerStr}\\,\\mathrm{D}$. Calculate the distance of the nearest object on which the patient can focus properly without glasses. Enter the result in $\\mathrm{cm}$.`
      : `The optical power of the patient's glasses is equal to $${powerStr}\\,\\mathrm{D}$. Calculate the distance of the near point of his eyes (in $\\mathrm{m}$).`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [
        `$d_0 = ${refDistStr}\\,${formatUnitLatex('m')}$`,
        `$P = ${powerStr}\\,${formatUnitLatex('D')}$`
      ]
    });
    const substitutionLine = `$\\frac{1}{NP} = \\frac{1}{${refDistStr}} - ${powerStr} = ${invNearStr}$`;
    const finalLine = useCmVariant
      ? `$NP = \\frac{1}{${invNearStr}}\\times 10^{2} = ${answerStr}\\,${formatUnitLatex('cm')}$`
      : `$NP = \\frac{1}{${invNearStr}} = ${answerStr}\\,${formatUnitLatex('m')}$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${substitutionLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: useCmVariant ? nearPointCm : nearPoint,
      valueStr: answerStr,
      unit: useCmVariant ? 'cm' : 'm',
      step: useCmVariant ? 0.1 : NEAR_POINT_ANSWER_STEP,
      rng,
      min: useCmVariant ? 10 : 0.1,
      max: useCmVariant ? 200 : 2
    });

    const accept = new Set(buildAcceptList('NP', answerStr, useCmVariant ? 'cm' : 'm', ['near point']));
    accept.add(`${answerStr}${useCmVariant ? 'cm' : 'm'}`);

    return {
      id: `nearpoint:${runId}:${useCmVariant ? 'distance_cm' : 'distance'}:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: Array.from(accept),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'vision', 'near-point', 'optics']
    };
  }
  throw new Error('Failed to generate near point card');
}

function buildFarPointCard(index, rng, runId) {
  const maxAttempts = 200;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const power = randStep(rng, FAR_POINT_POWER_D.min, FAR_POINT_POWER_D.max, FAR_POINT_POWER_D.step);
    if (!Number.isFinite(power) || power >= 0) continue;

    const farPoint = -1 / power;
    if (!Number.isFinite(farPoint) || farPoint <= 0) continue;

    const powerStr = formatByStep(power, FAR_POINT_POWER_D.step);
    const answerStr = formatAnswer(farPoint);
    if (!answerStr) continue;

    const formulaLine = combineFormulaLine([
      'FP = -\\frac{1}{P}'
    ]);
    const promptLine = `The optical power of the patient's glasses is equal to $${powerStr}\\,\\mathrm{D}$. Calculate the distance of the far point of his eyes (in $\\mathrm{m}$).`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [
        `$P = ${powerStr}\\,${formatUnitLatex('D')}$`
      ]
    });
    const substitutionLine = `$FP = -\\frac{1}{${powerStr}}$`;
    const finalLine = `$FP = ${answerStr}\\,${formatUnitLatex('m')}$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${substitutionLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: farPoint,
      valueStr: answerStr,
      unit: 'm',
      step: FAR_POINT_ANSWER_STEP,
      rng,
      min: 0.2,
      max: 10
    });

    const accept = new Set(buildAcceptList('FP', answerStr, 'm', ['far point']));
    accept.add(`${answerStr}m`);

    return {
      id: `farpoint:${runId}:distance:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: Array.from(accept),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'vision', 'far-point', 'optics']
    };
  }
  throw new Error('Failed to generate far point card');
}

function buildNearPointCard(index, rng, runId) {
  if (rng() < 0.5) return buildNearPointDistanceCard(index, rng, runId);
  return buildFarPointCard(index, rng, runId);
}

function buildDebroglieCard(index, rng, runId) {
  const maxAttempts = 200;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const voltageKv = randStep(rng, DEBROGLIE_VOLTAGE_KV.min, DEBROGLIE_VOLTAGE_KV.max, DEBROGLIE_VOLTAGE_KV.step);
    if (!Number.isFinite(voltageKv) || voltageKv <= 0) continue;

    const voltageV = voltageKv * 1e3;
    const denom = Math.sqrt(2 * DEBROGLIE_M * DEBROGLIE_E * voltageV);
    if (!Number.isFinite(denom) || denom <= 0) continue;

    const lambdaM = DEBROGLIE_H / denom;
    const lambdaNm = lambdaM * 1e9;
    if (!Number.isFinite(lambdaNm) || lambdaNm <= 0) continue;

    const voltageStr = formatByStep(voltageKv, DEBROGLIE_VOLTAGE_KV.step);
    const lambdaStr = formatAnswer(lambdaNm);
    if (!lambdaStr) continue;

    const hStr = formatSciLatex(DEBROGLIE_H, 4);
    const eStr = formatSciLatex(DEBROGLIE_E, 3);
    const mStr = formatSciLatex(DEBROGLIE_M, 3);

    const formulaLine = combineFormulaLine([
      '\\lambda = \\frac{h}{\\sqrt{2 \\times m \\times e \\times V}}'
    ]);
    const promptLine = `Calculate the de Broglie's wavelength of electron which is accelerated by the voltage $${voltageStr}\\,\\mathrm{kV}$ in electron microscope. Result express in $\\mathrm{nm}$.`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [
        `$h = ${hStr}\\,${formatUnitLatex('J\\,s')}$`,
        `$m = ${mStr}\\,${formatUnitLatex('kg')}$`,
        `$e = ${eStr}\\,${formatUnitLatex('C')}$`,
        `$V = ${voltageStr}\\,${formatUnitLatex('kV')}$`
      ]
    });
    const substitutionLine = `$\\lambda = \\frac{${hStr}}{\\sqrt{2 \\times ${mStr} \\times ${eStr} \\times ${voltageStr} \\times 10^{3}}}$`;
    const finalLine = `$\\lambda = ${lambdaStr}\\,${formatUnitLatex('nm')}$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${substitutionLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: lambdaNm,
      valueStr: lambdaStr,
      unit: 'nm',
      step: DEBROGLIE_ANSWER_STEP,
      rng,
      min: 0,
      max: 0.1
    });

    const accept = new Set(buildAcceptList('lambda', lambdaStr, 'nm', ['\\lambda', 'λ']));
    accept.add(`${lambdaStr}nm`);

    return {
      id: `debroglie:${runId}:lambda:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [lambdaStr],
      accept: Array.from(accept),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'debroglie', 'electron', 'wavelength']
    };
  }
  throw new Error('Failed to generate de Broglie card');
}

function buildDecayConstantCard(index, rng, runId) {
  const maxAttempts = 300;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const gap = randStep(rng, DECAY_GAP_HOURS.min, DECAY_GAP_HOURS.max, DECAY_GAP_HOURS.step);
    if (!Number.isFinite(gap)) continue;
    const t1 = 0;
    const t2 = gap;

    const A1 = randStep(rng, DECAY_ACTIVITY_MBQ.min, DECAY_ACTIVITY_MBQ.max, DECAY_ACTIVITY_MBQ.step);
    if (!Number.isFinite(A1) || A1 <= 0) continue;

    const lambda = randStep(rng, DECAY_LAMBDA_RANGE.min, DECAY_LAMBDA_RANGE.max, DECAY_LAMBDA_RANGE.step);
    if (!Number.isFinite(lambda) || lambda <= 0) continue;

    const A2 = A1 * Math.exp(-lambda * (t2 - t1));
    if (!Number.isFinite(A2) || A2 <= 0) continue;

    const ratio = A1 / A2;
    if (!Number.isFinite(ratio) || ratio <= 1.01) continue;

    const t1Str = formatByStep(t1, DECAY_TIME_HOURS.step);
    const t2Str = formatByStep(t2, DECAY_GAP_HOURS.step);
    const A1Str = formatByStep(A1, DECAY_ACTIVITY_MBQ.step);
    const A2Str = formatByStep(A2, DECAY_ACTIVITY_MBQ.step);
    const deltaTStr = formatByStep(t2 - t1, DECAY_GAP_HOURS.step);
    const answerStr = formatAnswer(lambda);
    if (!answerStr) continue;

    const formulaLine = combineFormulaLine([
      '\\lambda = \\frac{\\ln\\left(\\frac{A_1}{A_2}\\right)}{t_2 - t_1}'
    ]);
    const promptLine = `Find out the decay constant of the radionuclide if after its application the recorded activity was $${A1Str}\\,\\mathrm{MBq}$ and after $${t2Str}\\,\\mathrm{h}$ the recorded activity was $${A2Str}\\,\\mathrm{MBq}$. Enter the result in $\\mathrm{h^{-1}}$.`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [
        `$A_1 = ${A1Str}\\,${formatUnitLatex('MBq')}$`,
        `$A_2 = ${A2Str}\\,${formatUnitLatex('MBq')}$`,
        `$t_2 = ${t2Str}\\,${formatUnitLatex('h')}$`,
        `$t_1 = ${t1Str}\\,${formatUnitLatex('h')}$`
      ]
    });
    const substitutionLine = `$\\lambda = \\frac{\\ln\\left(\\frac{${A1Str}}{${A2Str}}\\right)}{${deltaTStr}}$`;
    const finalLine = `$\\lambda = ${answerStr}\\,${formatUnitLatex('h^{-1}')}$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${substitutionLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: lambda,
      valueStr: answerStr,
      unit: 'h^{-1}',
      step: DECAY_ANSWER_STEP,
      rng,
      min: 0,
      max: 0.05
    });

    const accept = new Set(buildAcceptList('lambda', answerStr, 'h^-1', ['\\lambda']));
    accept.add(`${answerStr} h^-1`);
    accept.add(`${answerStr}h^-1`);

    return {
      id: `decay:${runId}:lambda:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: Array.from(accept),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'decay', 'radioactivity', 'lambda']
    };
  }
  throw new Error('Failed to generate decay constant card');
}

function buildDecayHalfLifeCard(index, rng, runId) {
  const maxAttempts = 300;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const elapsedHours = randStep(
      rng,
      DECAY_HALF_LIFE_TIME_HOURS.min,
      DECAY_HALF_LIFE_TIME_HOURS.max,
      DECAY_HALF_LIFE_TIME_HOURS.step
    );
    const initialActivity = randStep(
      rng,
      DECAY_HALF_LIFE_ACTIVITY_KBQ.min,
      DECAY_HALF_LIFE_ACTIVITY_KBQ.max,
      DECAY_HALF_LIFE_ACTIVITY_KBQ.step
    );
    const targetHalfLife = randStep(
      rng,
      DECAY_HALF_LIFE_TARGET_HOURS.min,
      DECAY_HALF_LIFE_TARGET_HOURS.max,
      DECAY_HALF_LIFE_TARGET_HOURS.step
    );
    if (![elapsedHours, initialActivity, targetHalfLife].every(v => Number.isFinite(v))) continue;
    if (elapsedHours <= 0 || initialActivity <= 0 || targetHalfLife <= 0) continue;

    const lambdaTarget = Math.log(2) / targetHalfLife;
    if (!Number.isFinite(lambdaTarget) || lambdaTarget <= 0) continue;

    const finalActivity = Math.round(initialActivity * Math.exp(-lambdaTarget * elapsedHours));
    if (!Number.isFinite(finalActivity) || finalActivity <= 0 || finalActivity >= initialActivity) continue;

    const ratio = initialActivity / finalActivity;
    const lnRatio = Math.log(ratio);
    if (!Number.isFinite(ratio) || !Number.isFinite(lnRatio) || ratio <= 1.05 || lnRatio <= 0) continue;

    const halfLife = (elapsedHours * Math.log(2)) / lnRatio;
    if (!Number.isFinite(halfLife) || halfLife <= 0 || halfLife > 20) continue;

    const a0Str = formatByStep(initialActivity, DECAY_HALF_LIFE_ACTIVITY_KBQ.step);
    const atStr = formatByStep(finalActivity, DECAY_HALF_LIFE_ACTIVITY_KBQ.step);
    const tStr = formatByStep(elapsedHours, DECAY_HALF_LIFE_TIME_HOURS.step);
    const answerStr = formatAnswer(halfLife);
    if (!answerStr) continue;

    const formulaLine = combineFormulaLine([
      't_{1/2} = \\frac{t \\times \\ln 2}{\\ln\\left(\\frac{A_0}{A_t}\\right)}'
    ]);
    const promptLine = `Calculate the half-life of the radionuclide if its activity decreased from $${a0Str}\\,\\mathrm{kBq}$ to $${atStr}\\,\\mathrm{kBq}$ in $${tStr}\\,\\mathrm{h}$. Enter the result in hours.`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [
        `$A_0 = ${a0Str}\\,${formatUnitLatex('kBq')}$`,
        `$A_t = ${atStr}\\,${formatUnitLatex('kBq')}$`,
        `$t = ${tStr}\\,${formatUnitLatex('h')}$`
      ]
    });
    const substitutionLine = `$t_{1/2} = \\frac{${tStr} \\times \\ln 2}{\\ln\\left(\\frac{${a0Str}}{${atStr}}\\right)}$`;
    const finalLine = `$t_{1/2} = ${answerStr}\\,${formatUnitLatex('h')}$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${substitutionLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: halfLife,
      valueStr: answerStr,
      unit: 'h',
      step: DECAY_HALF_LIFE_ANSWER_STEP,
      rng,
      min: 0.2,
      max: 20
    });

    const accept = new Set(buildAcceptList('t1/2', answerStr, 'h', ['t_{1/2}', 't_half', 'half-life']));
    accept.add(`${answerStr}h`);

    return {
      id: `decay:${runId}:half_life:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: Array.from(accept),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'decay', 'radioactivity', 'half-life']
    };
  }
  throw new Error('Failed to generate decay half-life card');
}

function buildDecayCard(index, rng, runId) {
  if (rng() < 0.5) return buildDecayConstantCard(index, rng, runId);
  return buildDecayHalfLifeCard(index, rng, runId);
}

function buildEarCanalResonanceCard(index, rng, runId) {
  const maxAttempts = 200;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const lengthCm = randStep(rng, EAR_CANAL_LENGTH_CM.min, EAR_CANAL_LENGTH_CM.max, EAR_CANAL_LENGTH_CM.step);
    if (!Number.isFinite(lengthCm) || lengthCm <= 0) continue;
    const lengthM = lengthCm * 1e-2;
    const lambda = 4 * lengthM;
    if (!Number.isFinite(lambda) || lambda <= 0) continue;

    const freq = EAR_CANAL_C / lambda;
    if (!Number.isFinite(freq) || freq <= 0) continue;

    const lengthCmStr = formatByStep(lengthCm, EAR_CANAL_LENGTH_CM.step);
    const freqStr = formatAnswer(freq);
    if (!freqStr) continue;

    const formulaLine = combineFormulaLine([
      'f = \\frac{c}{4 \\times L}'
    ]);
    const promptLine = `The ear canal is $${lengthCmStr}\\,\\mathrm{cm}$ long, it is filled with the air. Calculate the frequency of sound (in $\\mathrm{Hz}$), at which the maximum amplification by the sound resonance in the ear canal will occur.`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [
        `$c = ${EAR_CANAL_C}\\,${formatUnitLatex('m/s')}$`,
        `$L = ${lengthCmStr}\\,${formatUnitLatex('cm')}$`
      ]
    });
    const substitutionLine = `$f = \\frac{${EAR_CANAL_C}}{4 \\times (${lengthCmStr} \\times 10^{-2})}$`;
    const finalLine = `$f = ${freqStr}\\,${formatUnitLatex('Hz')}$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${substitutionLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: freq,
      valueStr: freqStr,
      unit: 'Hz',
      step: null,
      rng,
      min: 500,
      max: 5000
    });

    const accept = new Set(buildAcceptList('f', freqStr, 'Hz'));
    accept.add(`${freqStr}Hz`);

    return {
      id: `ear:${runId}:resonance:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [freqStr],
      accept: Array.from(accept),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'sound', 'resonance', 'ear']
    };
  }
  throw new Error('Failed to generate ear canal resonance card');
}

function buildUltrasoundTransmissionCard(index, rng, runId) {
  const maxAttempts = 200;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const i0Wcm2 = randStep(
      rng,
      ULTRASOUND_INTERFACE_I0_W_CM2.min,
      ULTRASOUND_INTERFACE_I0_W_CM2.max,
      ULTRASOUND_INTERFACE_I0_W_CM2.step
    );
    const z1 = randStep(rng, ULTRASOUND_Z1.min, ULTRASOUND_Z1.max, ULTRASOUND_Z1.step);
    const z2 = randStep(rng, ULTRASOUND_Z2.min, ULTRASOUND_Z2.max, ULTRASOUND_Z2.step);
    if (![i0Wcm2, z1, z2].every(v => Number.isFinite(v))) continue;
    if (z1 <= 0 || z2 <= 0) continue;
    if (z1 === z2) continue;

    const reflectFrac = Math.pow((z2 - z1) / (z2 + z1), 2);
    const reflectPct = reflectFrac * 100;
    const transmitPct = (1 - reflectFrac) * 100;
    if (!Number.isFinite(transmitPct) || transmitPct <= 0) continue;

    const z1Str = formatByStep(z1, ULTRASOUND_Z1.step);
    const z2Str = formatByStep(z2, ULTRASOUND_Z2.step);
    const i0Str = formatByStep(i0Wcm2, ULTRASOUND_INTERFACE_I0_W_CM2.step);
    const askReflection = rng() < 0.5;
    const answerValue = askReflection ? reflectFrac : transmitPct;
    const answerStr = formatAnswer(answerValue);
    if (!answerStr || !i0Str) continue;

    const formulaLine = combineFormulaLine([
      'R = \\left(\\frac{Z_2 - Z_1}{Z_2 + Z_1}\\right)^2',
      'T = (1 - R)\\times 100\\%'
    ]);
    const promptLine = askReflection
      ? `Ultrasound with intensity $${i0Str}\\,\\mathrm{W\\,cm^{-2}}$ is incidenting to the interface of tissues, their acoustic impedances are in ratio $${z1Str} : ${z2Str}$. Calculate the reflection coefficient $R$ at this interface.`
      : `Ultrasound with intensity $${i0Str}\\,\\mathrm{W\\,cm^{-2}}$ is incidenting to the interface of tissues, their acoustic impedances are in ratio $${z1Str} : ${z2Str}$. Calculate the percentage of the original intensity which is able to pass through this interface.`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [
        `$Z_1 : Z_2 = ${z1Str} : ${z2Str}$`
      ]
    });
    const diff = Math.abs(z2 - z1);
    const sum = z2 + z1;
    const diffStr = formatByStep(diff, 1);
    const sumStr = formatByStep(sum, 1);
    const substitutionLine = `$R = \\left(\\frac{${z2Str} - ${z1Str}}{${z2Str} + ${z1Str}}\\right)^2$`;
    const transmitLine = `$T = \\left(1 - \\left(\\frac{${diffStr}}{${sumStr}}\\right)^2\\right)\\times 100\\%$`;
    const reflectLine = `$R = \\left(\\frac{${diffStr}}{${sumStr}}\\right)^2$`;
    const finalLine = askReflection
      ? `$R = ${answerStr}$`
      : `$T = ${answerStr}\\%$`;
    const back = askReflection
      ? [
          `<div class="math-step">${formulaLine}</div>`,
          `<div class="math-step">${substitutionLine}</div>`,
          `<div class="math-step">${reflectLine}</div>`,
          `<div class="math-final">${finalLine}</div>`
        ].join('')
      : [
          `<div class="math-step">${formulaLine}</div>`,
          `<div class="math-step">${substitutionLine}</div>`,
          `<div class="math-step">${transmitLine}</div>`,
          `<div class="math-final">${finalLine}</div>`
        ].join('');

    const { options: mcqOptions, correctText } = askReflection
      ? buildNumericMcqOptions({
          value: reflectFrac,
          valueStr: answerStr,
          unit: '',
          step: PROBABILITY_ANSWER_STEP,
          rng,
          min: 0,
          max: 1
        })
      : buildNumericMcqOptions({
          value: transmitPct,
          valueStr: answerStr,
          unit: '\\%',
          step: ULTRASOUND_ANSWER_STEP,
          rng,
          min: 0,
          max: 100
        });

    const accept = askReflection
      ? new Set(buildAcceptList('R', answerStr, ''))
      : new Set(buildAcceptList('T', answerStr, '%'));
    if (askReflection) {
      const reflectPctStr = formatAnswer(reflectPct);
      if (reflectPctStr) {
        accept.add(`${reflectPctStr}%`);
        accept.add(`${reflectPctStr} %`);
      }
    } else {
      accept.add(`${answerStr}%`);
      accept.add(`${answerStr} %`);
    }

    return {
      id: `ultrasound:${runId}:${askReflection ? 'reflection' : 'transmission'}:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: Array.from(accept),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: askReflection
        ? ['biophysics', 'ultrasound', 'impedance', 'transmission', 'reflection']
        : ['biophysics', 'ultrasound', 'impedance', 'transmission']
    };
  }
  throw new Error('Failed to generate ultrasound transmission card');
}

function buildShieldingIntensityCard(index, rng, runId) {
  const maxAttempts = 300;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const tHalf = randStep(rng, SHIELD_HALF_LIFE_DAYS.min, SHIELD_HALF_LIFE_DAYS.max, SHIELD_HALF_LIFE_DAYS.step);
    const hvl = randStep(rng, SHIELD_HVL_CM.min, SHIELD_HVL_CM.max, SHIELD_HVL_CM.step);
    const thickness = randStep(rng, SHIELD_THICKNESS_CM.min, SHIELD_THICKNESS_CM.max, SHIELD_THICKNESS_CM.step);
    const timeDays = randStep(rng, SHIELD_TIME_DAYS.min, SHIELD_TIME_DAYS.max, SHIELD_TIME_DAYS.step);
    if (![tHalf, hvl, thickness, timeDays].every(v => Number.isFinite(v))) continue;
    if (tHalf <= 0 || hvl <= 0 || thickness <= 0) continue;

    const lambda = Math.log(2) / tHalf;
    const mu = Math.log(2) / hvl;
    const intensityFrac = Math.exp(-lambda * timeDays) * Math.exp(-mu * thickness);
    const intensityPct = intensityFrac * 100;
    if (!Number.isFinite(intensityPct) || intensityPct <= 0) continue;

    const tHalfStr = formatByStep(tHalf, SHIELD_HALF_LIFE_DAYS.step);
    const hvlStr = formatByStep(hvl, SHIELD_HVL_CM.step);
    const thicknessStr = formatByStep(thickness, SHIELD_THICKNESS_CM.step);
    const timeStr = formatByStep(timeDays, SHIELD_TIME_DAYS.step);
    const answerStr = formatAnswer(intensityPct);
    if (!answerStr) continue;

    const formulaLine = combineFormulaLine([
      'I = I_0 \\times e^{-\\lambda \\times t} \\times e^{-\\mu \\times d}',
      '\\lambda = \\frac{\\ln 2}{t_{1/2}}',
      '\\mu = \\frac{\\ln 2}{d_{1/2}}'
    ]);
    const promptLine = `Ionizing radiation from radioisotope of half-life $${tHalfStr}\\,\\mathrm{day}$ is passing through the shielding material of half-value layer $${hvlStr}\\,\\mathrm{cm}$. Determine the intensity (express in percentage of original intensity) of radiation behind $${thicknessStr}\\,\\mathrm{cm}$ of shielding layer after $${timeStr}\\,\\mathrm{day}$.`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [
        `$t = ${timeStr}\\,${formatUnitLatex('day')}$, $d = ${thicknessStr}\\,${formatUnitLatex('cm')}$`,
        `$t_{1/2} = ${tHalfStr}\\,${formatUnitLatex('day')}$`,
        `$d_{1/2} = ${hvlStr}\\,${formatUnitLatex('cm')}$`
      ]
    });
    const substitutionLine = `$\\frac{I}{I_0} = e^{-\\left(\\frac{\\ln 2}{${tHalfStr}}\\right)\\times ${timeStr}} \\times e^{-\\left(\\frac{\\ln 2}{${hvlStr}}\\right)\\times ${thicknessStr}}$`;
    const finalLine = `$\\frac{I}{I_0} = ${answerStr}\\%$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${substitutionLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: intensityPct,
      valueStr: answerStr,
      unit: '\\%',
      step: SHIELD_ANSWER_STEP,
      rng,
      min: 0,
      max: 100
    });

    const accept = new Set(buildAcceptList('I/I0', answerStr, '%', ['I/I_0']));
    accept.add(`${answerStr}%`);
    accept.add(`${answerStr} %`);

    return {
      id: `shielding:${runId}:intensity:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: Array.from(accept),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'radiation', 'shielding', 'intensity']
    };
  }
  throw new Error('Failed to generate shielding intensity card');
}

function buildUltrasoundTransmittedIntensityCard(index, rng, runId) {
  const maxAttempts = 240;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const i0MwCm2 = randStep(rng, ULTRASOUND_I0_MW_CM2.min, ULTRASOUND_I0_MW_CM2.max, ULTRASOUND_I0_MW_CM2.step);
    const c1 = randStep(rng, ULTRASOUND_C1_MS.min, ULTRASOUND_C1_MS.max, ULTRASOUND_C1_MS.step);
    const c2 = randStep(rng, ULTRASOUND_C2_MS.min, ULTRASOUND_C2_MS.max, ULTRASOUND_C2_MS.step);
    if (![i0MwCm2, c1, c2].every(v => Number.isFinite(v))) continue;
    if (i0MwCm2 <= 0 || c1 <= 0 || c2 <= 0) continue;
    if (Math.abs(c2 - c1) < 20) continue;

    const reflectFrac = Math.pow((c2 - c1) / (c2 + c1), 2);
    const transmittedMwCm2 = i0MwCm2 * (1 - reflectFrac);
    if (!Number.isFinite(transmittedMwCm2) || transmittedMwCm2 <= 0) continue;

    const i0Str = formatByStep(i0MwCm2, ULTRASOUND_I0_MW_CM2.step);
    const c1Str = formatByStep(c1, ULTRASOUND_C1_MS.step);
    const c2Str = formatByStep(c2, ULTRASOUND_C2_MS.step);
    const answerStr = formatAnswer(transmittedMwCm2);
    if (!i0Str || !c1Str || !c2Str || !answerStr) continue;

    const formulaLine = combineFormulaLine([
      'I_t = I_0\\left(1 - \\left(\\frac{c_2 - c_1}{c_2 + c_1}\\right)^2\\right)'
    ]);
    const promptLine = `Ultrasound with intensity $${i0Str}\\,\\mathrm{mW/cm^2}$ is partly reflected at the interface of two tissues. Find the transmitted ultrasound intensity (in $\\mathrm{mW/cm^2}$) if the velocities are $c_1=${c1Str}\\,\\mathrm{m/s}$ and $c_2=${c2Str}\\,\\mathrm{m/s}$, and densities of both tissues are the same.`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [
        `$I_0 = ${i0Str}\\,${formatUnitLatex('mW/cm^2')}$`,
        `$c_1 = ${c1Str}\\,${formatUnitLatex('m/s')}$`,
        `$c_2 = ${c2Str}\\,${formatUnitLatex('m/s')}$`,
        `$\\rho_1 = \\rho_2$`
      ]
    });
    const substitutionLine = `$I_t = ${i0Str}\\left(1 - \\left(\\frac{${c2Str} - ${c1Str}}{${c2Str} + ${c1Str}}\\right)^2\\right)$`;
    const finalLine = `$I_t = ${answerStr}\\,${formatUnitLatex('mW/cm^2')}$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${substitutionLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: transmittedMwCm2,
      valueStr: answerStr,
      unit: 'mW/cm^2',
      step: ULTRASOUND_INTENSITY_ANSWER_STEP,
      rng,
      min: 0,
      max: 25
    });

    const accept = new Set(buildAcceptList('I_t', answerStr, 'mW/cm^2', ['It', 'transmitted intensity']));
    accept.add(`${answerStr}mW/cm^2`);

    return {
      id: `ultrasound:${runId}:intensity:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: Array.from(accept),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'ultrasound', 'transmission', 'intensity']
    };
  }
  throw new Error('Failed to generate ultrasound transmitted intensity card');
}

function buildShieldingDualBoardAbsorptionCard(index, rng, runId) {
  const maxAttempts = 250;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const absorb1Pct = randStep(rng, SHIELD_BOARD_ABSORB_PCT.min, SHIELD_BOARD_ABSORB_PCT.max, SHIELD_BOARD_ABSORB_PCT.step);
    const transmit2Pct = randStep(rng, SHIELD_BOARD_TRANSMIT_PCT.min, SHIELD_BOARD_TRANSMIT_PCT.max, SHIELD_BOARD_TRANSMIT_PCT.step);
    if (![absorb1Pct, transmit2Pct].every(v => Number.isFinite(v))) continue;
    if (absorb1Pct <= 0 || absorb1Pct >= 100 || transmit2Pct <= 0 || transmit2Pct >= 100) continue;

    const a1 = absorb1Pct / 100;
    const t2 = transmit2Pct / 100;
    const absorbedTotalPct = (a1 + ((1 - a1) * (1 - t2))) * 100;
    if (!Number.isFinite(absorbedTotalPct) || absorbedTotalPct <= 0 || absorbedTotalPct >= 100) continue;

    const a1PctStr = formatByStep(absorb1Pct, SHIELD_BOARD_ABSORB_PCT.step);
    const t2PctStr = formatByStep(transmit2Pct, SHIELD_BOARD_TRANSMIT_PCT.step);
    const answerStr = formatAnswer(absorbedTotalPct);
    if (!a1PctStr || !t2PctStr || !answerStr) continue;

    const formulaLine = combineFormulaLine([
      'A_{tot} = A_1 + (1 - A_1)(1 - T_2)'
    ]);
    const promptLine = `One shielding board absorbs $${a1PctStr}\\%$ of gamma radiation. Another board transmits $${t2PctStr}\\%$ of radiation. Determine how many percent of the original radiation is absorbed after both boards are used in series.`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [
        `$A_1 = ${a1PctStr}\\%$`,
        `$T_2 = ${t2PctStr}\\%$`
      ]
    });
    const substitutionLine = `$A_{tot} = (${a1PctStr}\\times 10^{-2}) + \\left(1 - ${a1PctStr}\\times 10^{-2}\\right)\\left(1 - ${t2PctStr}\\times 10^{-2}\\right)$`;
    const finalLine = `$A_{tot} = ${answerStr}\\%$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${substitutionLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: absorbedTotalPct,
      valueStr: answerStr,
      unit: '\\%',
      step: SHIELD_BOARD_ANSWER_STEP,
      rng,
      min: 0,
      max: 100
    });

    const accept = new Set(buildAcceptList('A_tot', answerStr, '%', ['Atotal', 'absorption']));
    accept.add(`${answerStr}%`);
    accept.add(`${answerStr} %`);

    return {
      id: `shielding:${runId}:dual_board:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: Array.from(accept),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'radiation', 'shielding', 'absorption']
    };
  }
  throw new Error('Failed to generate dual-board shielding card');
}

function buildDoseEquivalentMixedFieldCard(index, rng, runId) {
  const maxAttempts = 240;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const totalDoseMgy = randStep(rng, DOSE_EQ_TOTAL_MGY.min, DOSE_EQ_TOTAL_MGY.max, DOSE_EQ_TOTAL_MGY.step);
    const gammaPct = randStep(rng, DOSE_EQ_GAMMA_PCT.min, DOSE_EQ_GAMMA_PCT.max, DOSE_EQ_GAMMA_PCT.step);
    const qNeutron = DOSE_EQ_Q_NEUTRON_OPTIONS[Math.floor(rng() * DOSE_EQ_Q_NEUTRON_OPTIONS.length)];
    if (![totalDoseMgy, gammaPct, qNeutron].every(v => Number.isFinite(v))) continue;
    if (totalDoseMgy <= 0 || gammaPct <= 0 || gammaPct >= 100 || qNeutron <= 0) continue;

    const pGamma = gammaPct / 100;
    const doseEquivalentMsv = totalDoseMgy * (pGamma * DOSE_EQ_Q_GAMMA + (1 - pGamma) * qNeutron);
    if (!Number.isFinite(doseEquivalentMsv) || doseEquivalentMsv <= 0) continue;

    const totalDoseStr = formatByStep(totalDoseMgy, DOSE_EQ_TOTAL_MGY.step);
    const gammaPctStr = formatByStep(gammaPct, DOSE_EQ_GAMMA_PCT.step);
    const qGammaStr = formatByStep(DOSE_EQ_Q_GAMMA, 1);
    const qNeutronStr = formatByStep(qNeutron, 1);
    const answerStr = formatAnswer(doseEquivalentMsv);
    if (!totalDoseStr || !gammaPctStr || !qGammaStr || !qNeutronStr || !answerStr) continue;

    const formulaLine = combineFormulaLine([
      'H = D\\left[p_{\\gamma}Q_{\\gamma} + (1-p_{\\gamma})Q_n\\right]'
    ]);
    const promptLine = `What is the value of the dose equivalent in a mixed field of neutrons and gamma rays where total dose is $${totalDoseStr}\\,\\mathrm{mGy}$? The dose of gamma radiation is $${gammaPctStr}\\%$ of total dose, quality factor of gamma radiation is $${qGammaStr}$ and quality factor of neutrons is $${qNeutronStr}$. Enter the result in $\\mathrm{mSv}$.`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [
        `$D = ${totalDoseStr}\\,${formatUnitLatex('mGy')}$`,
        `$p_{\\gamma} = ${gammaPctStr}\\%$`,
        `$Q_{\\gamma} = ${qGammaStr}$`,
        `$Q_n = ${qNeutronStr}$`
      ]
    });

    const substitutionLine = `$H = ${totalDoseStr}\\left[(${gammaPctStr}\\times 10^{-2})\\times ${qGammaStr} + \\left(1 - ${gammaPctStr}\\times 10^{-2}\\right)\\times ${qNeutronStr}\\right]$`;
    const finalLine = `$H = ${answerStr}\\,${formatUnitLatex('mSv')}$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${substitutionLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: doseEquivalentMsv,
      valueStr: answerStr,
      unit: 'mSv',
      step: DOSE_EQ_ANSWER_STEP,
      rng,
      min: 0,
      max: 900
    });

    const accept = new Set(buildAcceptList('H', answerStr, 'mSv', ['dose equivalent']));
    accept.add(`${answerStr}mSv`);

    return {
      id: `dosimetry:${runId}:mixed_equivalent:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: Array.from(accept),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'dosimetry', 'radiation', 'dose-equivalent']
    };
  }
  throw new Error('Failed to generate mixed-field dose equivalent card');
}

function buildShieldingCard(index, rng, runId) {
  if (rng() < 0.5) return buildShieldingIntensityCard(index, rng, runId);
  return buildShieldingDualBoardAbsorptionCard(index, rng, runId);
}

function buildCtNumberCard(index, rng, runId) {
  const maxAttempts = 300;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const dMm = randStep(rng, CT_LAYER_THICKNESS_MM.min, CT_LAYER_THICKNESS_MM.max, CT_LAYER_THICKNESS_MM.step);
    const n1 = randStep(rng, CT_N1_COUNTS.min, CT_N1_COUNTS.max, CT_N1_COUNTS.step);
    const ctTarget = randStep(rng, CT_TARGET_HU.min, CT_TARGET_HU.max, CT_TARGET_HU.step);
    if (![dMm, n1, ctTarget].every(v => Number.isFinite(v))) continue;
    if (dMm <= 0 || n1 <= 0) continue;

    const dCm = dMm / 10;
    const muMaterialTarget = CT_WATER_MU * (1 + (ctTarget / 1000));
    if (!Number.isFinite(muMaterialTarget) || muMaterialTarget <= 0) continue;

    const ratio = Math.exp(muMaterialTarget * dCm);
    if (!Number.isFinite(ratio) || ratio <= 1) continue;

    const n0 = Math.round(n1 * ratio);
    if (!Number.isFinite(n0) || n0 <= n1) continue;

    const muMaterial = (1 / dCm) * Math.log(n0 / n1);
    if (!Number.isFinite(muMaterial) || muMaterial <= 0) continue;

    const ct = ((muMaterial - CT_WATER_MU) / CT_WATER_MU) * 1000;
    if (!Number.isFinite(ct)) continue;

    const ctRounded = Math.round(ct);
    if (!Number.isFinite(ctRounded)) continue;
    if (ctRounded < CT_HU_RANGE.min || ctRounded > CT_HU_RANGE.max) continue;

    const dMmStr = formatByStep(dMm, CT_LAYER_THICKNESS_MM.step);
    const n0Str = formatByStep(n0, 1);
    const n1Str = formatByStep(n1, CT_N1_COUNTS.step);
    const muWaterStr = formatByStep(CT_WATER_MU, 0.01);
    const answerStr = formatAnswer(ct);
    if (!answerStr) continue;

    const formulaLine = combineFormulaLine([
      '\\mu = \\frac{1}{d} \\ln\\left(\\frac{N_0}{N_1}\\right)',
      'CT = \\left(\\frac{\\mu - \\mu_{water}}{\\mu_{water}}\\right)\\times 1000'
    ]);
    const promptLine = `A material layer is $${dMmStr}\\,\\mathrm{mm}$ thick. Particle flow density in front of the layer is $N_0=${n0Str}$ and behind the layer is $N_1=${n1Str}$. The linear attenuation coefficient of water is $${muWaterStr}\\,\\mathrm{cm^{-1}}$. Calculate the CT number of this material (in $\\mathrm{HU}$).`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [
        `$d = ${dMmStr}\\,${formatUnitLatex('mm')}$`,
        `$N_0 = ${n0Str}$`,
        `$N_1 = ${n1Str}$`,
        `$\\mu_{water} = ${muWaterStr}\\,${formatUnitLatex('cm^{-1}')}$`
      ]
    });

    const muLine = `$\\mu = \\frac{1}{${dMmStr} \\times 10^{-1}}\\ln\\left(\\frac{${n0Str}}{${n1Str}}\\right)$`;
    const finalLine = `$CT = \\left(\\frac{\\frac{1}{${dMmStr} \\times 10^{-1}}\\ln\\left(\\frac{${n0Str}}{${n1Str}}\\right) - ${muWaterStr}}{${muWaterStr}}\\right)\\times 1000 = ${answerStr}\\,\\mathrm{HU}$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${muLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: ctRounded,
      valueStr: answerStr,
      unit: 'HU',
      step: CT_ANSWER_STEP,
      rng,
      min: CT_HU_RANGE.min,
      max: CT_HU_RANGE.max
    });

    const accept = new Set(buildAcceptList('CT', answerStr, 'HU', ['CT number']));
    accept.add(`${answerStr}HU`);

    return {
      id: `ct:${runId}:number:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: Array.from(accept),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'ct', 'attenuation', 'hounsfield']
    };
  }
  throw new Error('Failed to generate CT number card');
}

function buildMedianCard(index, rng, runId) {
  const maxAttempts = 200;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const count = MEDIAN_COUNT_OPTIONS[Math.floor(rng() * MEDIAN_COUNT_OPTIONS.length)];
    if (!Number.isFinite(count) || count < 3) continue;
    const values = new Set();
    let guard = 0;
    while (values.size < count && guard < 200) {
      guard += 1;
      const v = Math.floor(MEDIAN_VALUE_RANGE.min + rng() * (MEDIAN_VALUE_RANGE.max - MEDIAN_VALUE_RANGE.min + 1));
      values.add(v);
    }
    if (values.size < count) continue;

    const list = Array.from(values);
    const sorted = list.slice().sort((a, b) => a - b);
    let median = 0;
    let medianExpr = '';
    let positionExpr = '';
    if (sorted.length % 2 === 1) {
      const pos = (sorted.length + 1) / 2;
      median = sorted[pos - 1];
      medianExpr = `${median}`;
      positionExpr = `x_{${pos}}`;
    } else {
      const pos1 = sorted.length / 2;
      const pos2 = pos1 + 1;
      const mid1 = sorted[pos1 - 1];
      const mid2 = sorted[pos2 - 1];
      median = (mid1 + mid2) / 2;
      medianExpr = `\\frac{${mid1} + ${mid2}}{2}`;
      positionExpr = `\\frac{x_{${pos1}} + x_{${pos2}}}{2}`;
    }
    if (!Number.isFinite(median)) continue;

    const answerStr = formatAnswer(median);
    if (!answerStr) continue;

    const rawLine = `\\(\\{${list.join(', ')}\\}\\)`;
    const sortedLine = `\\(\\{${sorted.join(', ')}\\}\\)`;

    const formulaLine = sorted.length % 2 === 1
      ? '$\\tilde{x} = x_{(n+1)/2}$'
      : '$\\tilde{x} = \\frac{x_{n/2} + x_{n/2+1}}{2}$';
    const front = buildFrontWithPrompt({
      promptLine: 'Find $\\tilde{x}$.',
      formulaLine,
      givenLines: [rawLine]
    });
    const sortLine = `${sortedLine}`;
    const substitutionLine = sorted.length % 2 === 1
      ? `$\\tilde{x} = ${positionExpr} = ${medianExpr}$`
      : `$\\tilde{x} = ${positionExpr} = ${medianExpr} = ${answerStr}$`;
    const finalLine = '';
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${sortLine}</div>`,
      `<div class="math-step">${substitutionLine}</div>`,
      finalLine ? `<div class="math-final">${finalLine}</div>` : ''
    ].filter(Boolean).join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: median,
      valueStr: answerStr,
      unit: '',
      step: MEDIAN_ANSWER_STEP,
      rng,
      min: MEDIAN_VALUE_RANGE.min,
      max: MEDIAN_VALUE_RANGE.max
    });

    return {
      id: `median:${runId}:value:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: buildAcceptList('median', answerStr, ''),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'stats', 'median']
    };
  }
  throw new Error('Failed to generate median card');
}

function buildQuartileInfo(sorted, quartile) {
  const n = sorted.length;
  const useAverage = n % 4 === 0;
  const posLabel = quartile === 1 ? 'n/4' : '3 \\times n/4';
  const posLabelNext = `${posLabel}+1`;
  if (useAverage) {
    const pos1 = (quartile * n) / 4;
    const pos2 = pos1 + 1;
    const val1 = sorted[pos1 - 1];
    const val2 = sorted[pos2 - 1];
    return {
      value: (val1 + val2) / 2,
      useAverage: true,
      positionExpr: `\\frac{x_{${pos1}} + x_{${pos2}}}{2}`,
      valueExpr: `\\frac{${val1} + ${val2}}{2}`,
      formula: `Q_${quartile} = \\frac{x_{${posLabel}} + x_{${posLabelNext}}}{2}`
    };
  }
  const pos = Math.ceil((quartile * n) / 4);
  const val = sorted[pos - 1];
  return {
    value: val,
    useAverage: false,
    positionExpr: `x_{${pos}}`,
    valueExpr: `${val}`,
    formula: `Q_${quartile} = x_{\\lceil ${posLabel} \\rceil}`
  };
}

function buildInterquartileRangeCard(index, rng, runId) {
  const maxAttempts = 200;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const count = IQR_COUNT_OPTIONS[Math.floor(rng() * IQR_COUNT_OPTIONS.length)];
    if (!Number.isFinite(count) || count < 4) continue;
    const values = new Set();
    let guard = 0;
    while (values.size < count && guard < 300) {
      guard += 1;
      const v = Math.floor(IQR_VALUE_RANGE.min + rng() * (IQR_VALUE_RANGE.max - IQR_VALUE_RANGE.min + 1));
      values.add(v);
    }
    if (values.size < count) continue;

    const list = Array.from(values);
    const sorted = list.slice().sort((a, b) => a - b);
    const q1Info = buildQuartileInfo(sorted, 1);
    const q3Info = buildQuartileInfo(sorted, 3);
    if (!Number.isFinite(q1Info.value) || !Number.isFinite(q3Info.value)) continue;
    const iqr = q3Info.value - q1Info.value;
    if (!Number.isFinite(iqr)) continue;

    const q1Str = formatAnswer(q1Info.value);
    const q3Str = formatAnswer(q3Info.value);
    const answerStr = formatAnswer(iqr);
    if (!q1Str || !q3Str || !answerStr) continue;

    const rawLine = `$\\{${list.join(', ')}\\}$`;
    const sortedLine = `$\\{${sorted.join(', ')}\\}$`;
    const formulaLine = combineFormulaLine([
      q1Info.formula,
      q3Info.formula,
      'IQR = Q_3 - Q_1'
    ]);
    const front = buildFrontWithPrompt({
      promptLine: 'Find $IQR$.',
      formulaLine,
      givenLines: [rawLine]
    });

    const q1Line = q1Info.useAverage
      ? `$Q_1 = ${q1Info.positionExpr} = ${q1Info.valueExpr} = ${q1Str}$`
      : `$Q_1 = ${q1Info.positionExpr} = ${q1Str}$`;
    const q3Line = q3Info.useAverage
      ? `$Q_3 = ${q3Info.positionExpr} = ${q3Info.valueExpr} = ${q3Str}$`
      : `$Q_3 = ${q3Info.positionExpr} = ${q3Str}$`;
    const finalLine = `$IQR = ${answerStr}$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${sortedLine}</div>`,
      `<div class="math-step">${q1Line}</div>`,
      `<div class="math-step">${q3Line}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: iqr,
      valueStr: answerStr,
      unit: '',
      step: IQR_ANSWER_STEP,
      rng,
      min: 0,
      max: IQR_VALUE_RANGE.max - IQR_VALUE_RANGE.min
    });

    return {
      id: `iqr:${runId}:range:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: buildAcceptList('IQR', answerStr, ''),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'stats', 'iqr']
    };
  }
  throw new Error('Failed to generate interquartile range card');
}

function buildQuartileCard(index, rng, runId) {
  const maxAttempts = 200;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const count = QUARTILE_COUNT_OPTIONS[Math.floor(rng() * QUARTILE_COUNT_OPTIONS.length)];
    if (!Number.isFinite(count) || count < 4) continue;
    const values = new Set();
    let guard = 0;
    while (values.size < count && guard < 300) {
      guard += 1;
      const v = Math.floor(QUARTILE_VALUE_RANGE.min + rng() * (QUARTILE_VALUE_RANGE.max - QUARTILE_VALUE_RANGE.min + 1));
      values.add(v);
    }
    if (values.size < count) continue;

    const list = Array.from(values);
    const sorted = list.slice().sort((a, b) => a - b);
    const quartile = rng() < 0.5 ? 1 : 3;
    const info = buildQuartileInfo(sorted, quartile);
    if (!Number.isFinite(info.value)) continue;

    const qStr = formatAnswer(info.value);
    if (!qStr) continue;

    const rawLine = `$\\{${list.join(', ')}\\}$`;
    const sortedLine = `$\\{${sorted.join(', ')}\\}$`;
    const formulaLine = combineFormulaLine([info.formula]);
    const front = buildFrontWithPrompt({
      promptLine: `Find $Q_${quartile}$.`,
      formulaLine,
      givenLines: [rawLine]
    });

    const qLine = info.useAverage
      ? `$Q_${quartile} = ${info.positionExpr} = ${info.valueExpr} = ${qStr}$`
      : `$Q_${quartile} = ${info.positionExpr} = ${qStr}$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${sortedLine}</div>`,
      `<div class="math-final">${qLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: info.value,
      valueStr: qStr,
      unit: '',
      step: QUARTILE_ANSWER_STEP,
      rng,
      min: QUARTILE_VALUE_RANGE.min,
      max: QUARTILE_VALUE_RANGE.max
    });

    const label = quartile === 1 ? 'Q1' : 'Q3';
    return {
      id: `quartile:${runId}:q${quartile}:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [qStr],
      accept: buildAcceptList(label, qStr, '', [`Q_${quartile}`]),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'stats', 'quartile']
    };
  }
  throw new Error('Failed to generate quartile card');
}

function buildHypothesisTestCard(index, rng, runId, forcedVariant = null) {
  const maxAttempts = 160;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const variant = forcedVariant || (rng() < 0.5 ? 'alpha' : 'power');
    if (variant === 'alpha') {
      const alpha = randStep(rng, ALPHA_RANGE.min, ALPHA_RANGE.max, ALPHA_RANGE.step);
      if (!Number.isFinite(alpha) || alpha <= 0 || alpha >= 1) continue;
      const power = randStep(rng, POWER_RANGE.min, POWER_RANGE.max, POWER_RANGE.step);
      if (!Number.isFinite(power) || power <= 0 || power >= 1) continue;
      const beta = 1 - power;
      if (!Number.isFinite(beta) || beta <= 0 || beta >= 1) continue;
      const prob = 1 - alpha;
      if (!Number.isFinite(prob) || prob <= 0) continue;

      const alphaStr = formatByStep(alpha, ALPHA_RANGE.step);
      const alphaPctStr = formatByStep(alpha * 100, 1);
      const betaStr = formatByStep(beta, PROBABILITY_ANSWER_STEP);
      const betaPctStr = formatByStep(beta * 100, 1);
      const answerStr = formatAnswer(prob);
      if (!alphaStr || !betaStr || !answerStr) continue;

      const formulaLine = combineFormulaLine([
        'P(\\text{not reject } H_0 \\mid H_0) = 1 - \\alpha'
      ]);
      const promptLine = `The significance level for testing $H_0$ against $H_A$ is $${alphaPctStr}\\%$. The probability of type II error is $${betaStr}$. What is the probability that, if $H_0$ is true, it will not be rejected?`;
      const front = buildFrontWithPrompt({
        promptLine,
        formulaLine,
        givenLines: [
          `$\\alpha = ${alphaStr}$`,
          `$\\beta = ${betaStr}$`
        ]
      });
      const substitutionLine = `$P(\\text{not reject } H_0 \\mid H_0) = 1 - ${alphaStr}$`;
      const finalLine = `$P(\\text{not reject } H_0 \\mid H_0) = ${answerStr}$`;
      const back = [
        `<div class="math-step">${formulaLine}</div>`,
        `<div class="math-step">${substitutionLine}</div>`,
        `<div class="math-final">${finalLine}</div>`
      ].join('');

      const { options: mcqOptions, correctText } = buildNumericMcqOptions({
        value: prob,
        valueStr: answerStr,
        unit: '',
        step: PROBABILITY_ANSWER_STEP,
        rng,
        min: 0,
        max: 1
      });

      return {
        id: `hypotest:${runId}:alpha:${String(index).padStart(3, '0')}`,
        archetype: 'maths',
        front,
        back,
        correct: [answerStr],
        accept: buildAcceptList('P', answerStr, ''),
        mcqOptions: mcqOptions.map(text => ({ text })),
        mcqCorrect: [correctText],
        tags: ['biophysics', 'stats', 'hypothesis', 'alpha']
      };
    }

    const power = randStep(rng, POWER_RANGE.min, POWER_RANGE.max, POWER_RANGE.step);
    if (!Number.isFinite(power) || power <= 0 || power >= 1) continue;
    const beta = 1 - power;
    if (!Number.isFinite(beta) || beta <= 0 || beta >= 1) continue;
    const betaStr = formatByStep(beta, PROBABILITY_ANSWER_STEP);
    const answerStr = formatAnswer(power);
    if (!betaStr || !answerStr) continue;

    const formulaLine = combineFormulaLine([
      'P(\\text{reject } H_0 \\mid H_A) = 1 - \\beta'
    ]);
    const alpha = randStep(rng, ALPHA_RANGE.min, ALPHA_RANGE.max, ALPHA_RANGE.step);
    if (!Number.isFinite(alpha) || alpha <= 0 || alpha >= 1) continue;
    const alphaStr = formatByStep(alpha, ALPHA_RANGE.step);
    const alphaPctStr = formatByStep(alpha * 100, 1);
    const promptLine = `The significance level for testing $H_0$ against $H_A$ is $${alphaPctStr}\\%$. The probability of type II error is $${betaStr}$. What is the probability that $H_0$ will be rejected if $H_A$ is true?`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [
        `$\\beta = ${betaStr}$`,
        `$\\alpha = ${alphaStr}$`
      ]
    });
    const substitutionLine = `$P(\\text{reject } H_0 \\mid H_A) = 1 - ${betaStr}$`;
    const finalLine = `$P(\\text{reject } H_0 \\mid H_A) = ${answerStr}$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${substitutionLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: power,
      valueStr: answerStr,
      unit: '',
      step: PROBABILITY_ANSWER_STEP,
      rng,
      min: 0,
      max: 1
    });

    return {
      id: `hypotest:${runId}:power:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: buildAcceptList('P', answerStr, ''),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'stats', 'hypothesis', 'power']
    };
  }
  throw new Error('Failed to generate hypothesis test card');
}

function buildConfidenceUpperCard(index, rng, runId) {
  const maxAttempts = 200;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const n = CI_N_OPTIONS[Math.floor(rng() * CI_N_OPTIONS.length)];
    const df = n - 1;
    const conf = CI_CONF_LEVELS[Math.floor(rng() * CI_CONF_LEVELS.length)];
    const tCrit = conf?.t?.[df];
    if (!Number.isFinite(tCrit)) continue;
    const mean = randStep(rng, CI_MEAN_CM.min, CI_MEAN_CM.max, CI_MEAN_CM.step);
    const variance = randStep(rng, CI_VARIANCE_CM2.min, CI_VARIANCE_CM2.max, CI_VARIANCE_CM2.step);
    if (!Number.isFinite(mean) || !Number.isFinite(variance) || variance <= 0) continue;
    const s = Math.sqrt(variance);
    const margin = tCrit * (s / Math.sqrt(n));
    if (!Number.isFinite(margin)) continue;
    const isUpper = rng() < 0.5;
    const limit = isUpper ? mean + margin : mean - margin;
    if (!Number.isFinite(limit)) continue;

    const meanStr = formatByStep(mean, CI_MEAN_CM.step);
    const varianceStr = formatByStep(variance, CI_VARIANCE_CM2.step);
    const tStr = formatByStep(tCrit, 0.0001);
    const answerStr = formatAnswer(limit);
    if (!meanStr || !varianceStr || !tStr || !answerStr) continue;

    const limitLabel = isUpper ? 'U' : 'L';
    const formulaLine = combineFormulaLine([
      `${limitLabel} = \\bar{x} ${isUpper ? '+' : '-'} t_{${conf.p}, df} \\frac{s}{\\sqrt{n}}`,
      's = \\sqrt{S^2}'
    ]);
    const promptLine = `We measured the height of $${n}$ twenty-year-old men. The sample mean was $${meanStr}\\,\\mathrm{cm}$ and the variance $${varianceStr}\\,\\mathrm{cm^2}$. Calculate the ${isUpper ? 'upper' : 'lower'} limit of an interval that includes with the probability $${conf.label}$ the population mean of the heights of twenty-year-old men. Express the result in $\\mathrm{cm}$.`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [
        `$\\bar{x} = ${meanStr}\\,${formatUnitLatex('cm')}$`,
        `$t_{${conf.p}, ${df}} = ${tStr}$`,
        `$n = ${n}$, $df = ${df}$`,
        `$S^2 = ${varianceStr}\\,${formatUnitLatex('cm^2')}$`
      ]
    });
    const sLine = `$s = \\sqrt{${varianceStr}}$`;
    const substitutionLine = `$${limitLabel} = ${meanStr} ${isUpper ? '+' : '-'} ${tStr} \\times \\frac{\\sqrt{${varianceStr}}}{\\sqrt{${n}}}$`;
    const finalLine = `$${limitLabel} = ${answerStr}\\,${formatUnitLatex('cm')}$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${sLine}</div>`,
      `<div class="math-step">${substitutionLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: limit,
      valueStr: answerStr,
      unit: 'cm',
      step: null,
      rng,
      min: CI_MEAN_CM.min,
      max: CI_MEAN_CM.max + 20
    });

    return {
      id: `ciupper:${runId}:${isUpper ? 'upper' : 'lower'}:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: buildAcceptList(limitLabel, answerStr, 'cm', [isUpper ? 'upper' : 'lower']),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'stats', 'confidence', isUpper ? 'upper' : 'lower']
    };
  }
  throw new Error('Failed to generate confidence upper card');
}

function buildVariationCoefficientCard(index, rng, runId) {
  const maxAttempts = 160;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const mean = randStep(rng, CV_MEAN.min, CV_MEAN.max, CV_MEAN.step);
    const variance = CV_VARIANCE_OPTIONS[Math.floor(rng() * CV_VARIANCE_OPTIONS.length)];
    if (!Number.isFinite(mean) || !Number.isFinite(variance) || mean <= 0 || variance <= 0) continue;
    const s = Math.sqrt(variance);
    const cv = (s / mean) * 100;
    if (!Number.isFinite(cv)) continue;

    const meanStr = formatByStep(mean, CV_MEAN.step);
    const varianceStr = formatSigFig(variance, 3);
    const answerStr = formatAnswer(cv);
    if (!meanStr || !varianceStr || !answerStr) continue;

    const formulaLine = combineFormulaLine([
      's = \\sqrt{S^2}',
      'CV = \\frac{s}{\\bar{x}} \\times 100\\%'
    ]);
    const promptLine = `The sample mean is $${meanStr}$, the variance is $${varianceStr}$ and the sample size is $${CV_SAMPLE_N}$. Calculate the variation coefficient and express its value as a percentage.`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [
        `$S^2 = ${varianceStr}$`,
        `$\\bar{x} = ${meanStr}$`
      ]
    });
    const sLine = `$s = \\sqrt{${varianceStr}}$`;
    const substitutionLine = `$CV = \\frac{\\sqrt{${varianceStr}}}{${meanStr}} \\times 100\\%$`;
    const finalLine = `$CV = ${answerStr}\\%$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${sLine}</div>`,
      `<div class="math-step">${substitutionLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: cv,
      valueStr: answerStr,
      unit: '\\%',
      step: CV_ANSWER_STEP,
      rng,
      min: 0,
      max: 100
    });

    const accept = new Set(buildAcceptList('CV', answerStr, '%'));
    accept.add(`${answerStr}%`);
    accept.add(`${answerStr} %`);

    return {
      id: `cv:${runId}:value:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: Array.from(accept),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'stats', 'variation']
    };
  }
  throw new Error('Failed to generate variation coefficient card');
}

function buildRelativeFrequencyCard(index, rng, runId) {
  const maxAttempts = 200;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const n1 = randStep(rng, REL_FREQ_COUNT.min, REL_FREQ_COUNT.max, REL_FREQ_COUNT.step);
    const n2 = randStep(rng, REL_FREQ_COUNT.min, REL_FREQ_COUNT.max, REL_FREQ_COUNT.step);
    const n3 = randStep(rng, REL_FREQ_COUNT.min, REL_FREQ_COUNT.max, REL_FREQ_COUNT.step);
    const n4 = randStep(rng, REL_FREQ_COUNT.min, REL_FREQ_COUNT.max, REL_FREQ_COUNT.step);
    if (![n1, n2, n3, n4].every(v => Number.isFinite(v))) continue;
    const total = n1 + n2 + n3 + n4;
    const kRoll = rng();
    const k = kRoll < 0.33 ? 1 : (kRoll < 0.66 ? 2 : 3);
    const rangeSum = n1 + (k >= 2 ? n2 : 0) + (k >= 3 ? n3 : 0);
    if (total <= 0) continue;
    const freq = rangeSum / total;
    if (!Number.isFinite(freq)) continue;

    const n1Str = formatByStep(n1, REL_FREQ_COUNT.step);
    const n2Str = formatByStep(n2, REL_FREQ_COUNT.step);
    const n3Str = formatByStep(n3, REL_FREQ_COUNT.step);
    const n4Str = formatByStep(n4, REL_FREQ_COUNT.step);
    const totalStr = formatByStep(total, REL_FREQ_COUNT.step);
    const rangeStr = formatByStep(rangeSum, REL_FREQ_COUNT.step);
    const answerStr = formatAnswer(freq);
    if (!answerStr) continue;

    const rangeLabel = k === 1 ? '1' : `1-${k}`;
    const formulaLine = combineFormulaLine([
      `n_{${rangeLabel}} = \\sum_{i=1}^{${k}} n_i`,
      `f_{${rangeLabel}} = \\frac{\\sum_{i=1}^{${k}} n_i}{\\sum_{i=1}^{4} n_i}`
    ]);
    const gradeLimit = String(k);
    const promptLine = `Students' grades: $${n1Str}$ got ($1$), $${n2Str}$ got ($2$), $${n3Str}$ got ($3$), $${n4Str}$ got ($4$). Find the relative frequency of not getting worse than grade $${gradeLimit}$ (0–1).`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [
        `$n_1 = ${n1Str}$`,
        `$n_2 = ${n2Str}$`,
        `$n_3 = ${n3Str}$`,
        `$n_4 = ${n4Str}$`
      ]
    });
    const sumExpr = k === 1
      ? `${n1Str}`
      : (k === 2
        ? `${n1Str} + ${n2Str}`
        : `${n1Str} + ${n2Str} + ${n3Str}`);
    const rangeLine = `$\\sum_{i=1}^{${k}} n_i = ${sumExpr} = ${rangeStr}$`;
    const totalLine = `$\\sum_{i=1}^{4} n_i = ${n1Str} + ${n2Str} + ${n3Str} + ${n4Str} = ${totalStr}$`;
    const finalLine = `$f_{${rangeLabel}} = \\frac{${rangeStr}}{${totalStr}} = ${answerStr}$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${rangeLine}</div>`,
      `<div class="math-step">${totalLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: freq,
      valueStr: answerStr,
      unit: '',
      step: REL_FREQ_ANSWER_STEP,
      rng,
      min: 0,
      max: 1
    });

    return {
      id: `relfreq:${runId}:better:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: buildAcceptList('f', answerStr, ''),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'stats', 'frequency']
    };
  }
  throw new Error('Failed to generate relative frequency card');
}

function buildConditionalProbabilityCard(index, rng, runId, forcedVariant = null) {
  const maxAttempts = 200;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const variant = forcedVariant || (rng() < 0.5 ? 'cond' : 'neither');
    if (variant === 'neither') {
      const pA = randStep(rng, COND_PROB_RANGE.min, COND_PROB_RANGE.max, COND_PROB_RANGE.step);
      const pB = randStep(rng, COND_PROB_RANGE.min + 0.05, COND_PROB_RANGE.max + 0.05, COND_PROB_RANGE.step);
      if (!Number.isFinite(pA) || !Number.isFinite(pB)) continue;
      const maxIntersection = Math.min(pA, pB) - 0.02;
      const minIntersection = Math.max(0.01, pA + pB - 1 + 0.02);
      if (maxIntersection <= minIntersection) continue;
      const pAB = randStep(rng, minIntersection, maxIntersection, COND_PROB_RANGE.step);
      if (!Number.isFinite(pAB) || pAB <= 0) continue;
      const pUnion = pA + pB - pAB;
      if (!Number.isFinite(pUnion) || pUnion >= 1) continue;
      const pNeither = 1 - pUnion;
      if (!Number.isFinite(pNeither) || pNeither <= 0.05) continue;

      const pAStr = formatByStep(pA, COND_PROB_RANGE.step);
      const pBStr = formatByStep(pB, COND_PROB_RANGE.step);
      const pABStr = formatByStep(pAB, COND_PROB_RANGE.step);
      const pNeitherStr = formatAnswer(pNeither);
      if (!pNeitherStr) continue;

      const formulaLine = combineFormulaLine([
        'P(\\text{neither}) = 1 - P(A \\cup B)',
        'P(A \\cup B) = P(A) + P(B) - P(A \\cap B)'
      ]);
      const promptLine = `The probability that a randomly chosen person suffers from ischaemia is $${pAStr}$. The probability that a randomly chosen person is a smoker is $${pBStr}$. The probability that a person both smokes and suffers from ischaemia is $${pABStr}$. What is the probability that a person is neither smoker nor suffers from ischaemia ($0\\text{-}1$)?`;
      const front = buildFrontWithPrompt({
        promptLine,
        formulaLine,
        givenLines: [
          `$P(A) = ${pAStr}$`,
          `$P(B) = ${pBStr}$`,
          `$P(A \\cap B) = ${pABStr}$`
        ]
      });
      const unionLine = `$P(A \\cup B) = ${pAStr} + ${pBStr} - ${pABStr}$`;
      const finalLine = `$P(\\text{neither}) = 1 - (${pAStr} + ${pBStr} - ${pABStr}) = ${pNeitherStr}$`;
      const back = [
        `<div class="math-step">${formulaLine}</div>`,
        `<div class="math-step">${unionLine}</div>`,
        `<div class="math-final">${finalLine}</div>`
      ].join('');

      const { options: mcqOptions, correctText } = buildNumericMcqOptions({
        value: pNeither,
        valueStr: pNeitherStr,
        unit: '',
        step: COND_PROB_ANSWER_STEP,
        rng,
        min: 0,
        max: 1
      });

      return {
        id: `condprob:${runId}:neither:${String(index).padStart(3, '0')}`,
        archetype: 'maths',
        front,
        back,
        correct: [pNeitherStr],
        accept: buildAcceptList('P', pNeitherStr, ''),
        mcqOptions: mcqOptions.map(text => ({ text })),
        mcqCorrect: [correctText],
        tags: ['biophysics', 'stats', 'probability']
      };
    }

    const pA = randStep(rng, COND_PROB_RANGE.min, COND_PROB_RANGE.max, COND_PROB_RANGE.step);
    const pB = randStep(rng, COND_PROB_RANGE.min + 0.05, COND_PROB_RANGE.max + 0.05, COND_PROB_RANGE.step);
    if (!Number.isFinite(pA) || !Number.isFinite(pB)) continue;
    const maxIntersection = Math.min(pA, pB) - 0.02;
    const minIntersection = Math.max(0.01, pA + pB - 1 + 0.02);
    if (maxIntersection <= minIntersection) continue;
    const pAB = randStep(rng, minIntersection, maxIntersection, COND_PROB_RANGE.step);
    if (!Number.isFinite(pAB) || pAB <= 0) continue;
    const cond = pAB / pB;
    if (!Number.isFinite(cond)) continue;

    const pAStr = formatByStep(pA, COND_PROB_RANGE.step);
    const pBStr = formatByStep(pB, COND_PROB_RANGE.step);
    const pABStr = formatByStep(pAB, COND_PROB_RANGE.step);
    const answerStr = formatAnswer(cond);
    if (!answerStr) continue;

    const formulaLine = combineFormulaLine([
      'P(A \\mid B) = \\frac{P(A \\cap B)}{P(B)}'
    ]);
    const promptLine = `The probability that a randomly chosen person suffers from ischaemia is $${pAStr}$. The probability that a randomly chosen person is a smoker is $${pBStr}$. The probability that a person both smokes and suffers from ischaemia is $${pABStr}$. Calculate the conditional probability that a person who is smoker suffers from ischaemia ($0\\text{-}1$).`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [
        `$P(A \\cap B) = ${pABStr}$`,
        `$P(B) = ${pBStr}$`,
        `$P(A) = ${pAStr}$`
      ]
    });
    const finalLine = `$P(A \\mid B) = \\frac{${pABStr}}{${pBStr}} = ${answerStr}$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: cond,
      valueStr: answerStr,
      unit: '',
      step: COND_PROB_ANSWER_STEP,
      rng,
      min: 0,
      max: 1
    });

    return {
      id: `condprob:${runId}:ab:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: buildAcceptList('P', answerStr, ''),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'stats', 'probability']
    };
  }
  throw new Error('Failed to generate conditional probability card');
}

function buildNegativePredictiveCard(index, rng, runId, forcedVariant = null) {
  const maxAttempts = 200;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const prev = randStep(rng, NEG_PRED_PREV.min, NEG_PRED_PREV.max, NEG_PRED_PREV.step);
    const sens = randStep(rng, NEG_PRED_SENS.min, NEG_PRED_SENS.max, NEG_PRED_SENS.step);
    const spec = randStep(rng, NEG_PRED_SPEC.min, NEG_PRED_SPEC.max, NEG_PRED_SPEC.step);
    if (![prev, sens, spec].every(v => Number.isFinite(v))) continue;
    if (prev <= 0 || prev >= 1) continue;
    const variant = forcedVariant || (rng() < 0.5 ? 'npv' : 'ppv');
    const npvNumerator = spec * (1 - prev);
    const npvDenom = npvNumerator + (1 - sens) * prev;
    if (!Number.isFinite(npvDenom) || npvDenom <= 0) continue;
    const npv = npvNumerator / npvDenom;
    if (!Number.isFinite(npv)) continue;
    const ppvNumerator = sens * prev;
    const ppvDenom = ppvNumerator + (1 - spec) * (1 - prev);
    if (!Number.isFinite(ppvDenom) || ppvDenom <= 0) continue;
    const ppv = ppvNumerator / ppvDenom;
    if (!Number.isFinite(ppv)) continue;

    const prevStr = formatByStep(prev, NEG_PRED_PREV.step);
    const sensStr = formatByStep(sens, NEG_PRED_SENS.step);
    const specStr = formatByStep(spec, NEG_PRED_SPEC.step);
    const answerStr = formatAnswer(variant === 'npv' ? npv : ppv);
    if (!answerStr) continue;

    const formulaLine = combineFormulaLine([
      variant === 'npv'
        ? 'P(D^- \\mid T^-) = \\frac{Sp(1-p)}{Sp(1-p) + (1-Se)p}'
        : 'P(D^+ \\mid T^+) = \\frac{Se p}{Se p + (1-Sp)(1-p)}'
    ]);
    const promptLine = variant === 'npv'
      ? `Prevalence of a certain disease is $${prevStr}$. To detect this disease we use a diagnostic test. The sensitivity of this test is $${sensStr}$ and the specificity is $${specStr}$. Calculate the probability that a person with a negative test result does not have the disease ($0\\text{-}1$).`
      : `Prevalence of a certain disease is $${prevStr}$. To detect this disease we use a diagnostic test. The sensitivity of this test is $${sensStr}$ and the specificity is $${specStr}$. Calculate the probability that a person with a positive test result has the disease ($0\\text{-}1$).`;
    const givenLines = variant === 'npv'
      ? [
        `$Sp = ${specStr}$`,
        `$p = ${prevStr}$`,
        `$Se = ${sensStr}$`
      ]
      : [
        `$Se = ${sensStr}$`,
        `$p = ${prevStr}$`,
        `$Sp = ${specStr}$`
      ];
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines
    });
    const substitutionLine = variant === 'npv'
      ? `$P(D^- \\mid T^-) = \\frac{${specStr} \\times (1-${prevStr})}{${specStr} \\times (1-${prevStr}) + (1-${sensStr}) \\times ${prevStr}}$`
      : `$P(D^+ \\mid T^+) = \\frac{${sensStr} \\times ${prevStr}}{${sensStr} \\times ${prevStr} + (1-${specStr}) \\times (1-${prevStr})}$`;
    const finalLine = variant === 'npv'
      ? `$P(D^- \\mid T^-) = ${answerStr}$`
      : `$P(D^+ \\mid T^+) = ${answerStr}$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${substitutionLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: variant === 'npv' ? npv : ppv,
      valueStr: answerStr,
      unit: '',
      step: NEG_PRED_ANSWER_STEP,
      rng,
      min: 0,
      max: 1
    });

    return {
      id: `negpred:${runId}:${variant}:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: buildAcceptList('P', answerStr, ''),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'stats', 'diagnostics']
    };
  }
  throw new Error('Failed to generate negative predictive card');
}

function buildTestCriterionCard(index, rng, runId) {
  const maxAttempts = 200;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const n = TSTAT_N_OPTIONS[Math.floor(rng() * TSTAT_N_OPTIONS.length)];
    const mu0 = randStep(rng, TSTAT_MEAN.min, TSTAT_MEAN.max, TSTAT_MEAN.step);
    const delta = randStep(rng, TSTAT_DELTA.min, TSTAT_DELTA.max, TSTAT_DELTA.step);
    const variance = randStep(rng, TSTAT_VARIANCE.min, TSTAT_VARIANCE.max, TSTAT_VARIANCE.step);
    if (![n, mu0, delta, variance].every(v => Number.isFinite(v))) continue;
    if (variance <= 0) continue;
    const mean = mu0 + delta;
    const s = Math.sqrt(variance);
    const t = (mean - mu0) / (s / Math.sqrt(n));
    if (!Number.isFinite(t)) continue;
    if (Math.abs(t) < 0.5 || Math.abs(t) > 6) continue;

    const meanStr = formatByStep(mean, TSTAT_MEAN.step);
    const mu0Str = formatByStep(mu0, TSTAT_MEAN.step);
    const varianceStr = formatByStep(variance, TSTAT_VARIANCE.step);
    const answerStr = formatAnswer(t);
    if (!meanStr || !mu0Str || !varianceStr || !answerStr) continue;

    const formulaLine = combineFormulaLine([
      't = \\frac{\\bar{x} - \\mu_0}{\\frac{s}{\\sqrt{n}}}',
      's = \\sqrt{S^2}'
    ]);
    const promptLine = `We measured the height of $${n}$ adult men. The average of the values measured was $${meanStr}\\,\\mathrm{cm}$ and the variance $${varianceStr}\\,\\mathrm{cm^2}$. We would like to know if these men are from a population with the mean height $${mu0Str}\\,\\mathrm{cm}$. Calculate the test criterion of a suitable test (assume Gauss distribution).`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [
        `$\\bar{x} = ${meanStr}$`,
        `$\\mu_0 = ${mu0Str}$`,
        `$n = ${n}$`,
        `$S^2 = ${varianceStr}$`
      ]
    });
    const sLine = `$s = \\sqrt{${varianceStr}}$`;
    const substitutionLine = `$t = \\frac{${meanStr} - ${mu0Str}}{\\frac{\\sqrt{${varianceStr}}}{\\sqrt{${n}}}}$`;
    const finalLine = `$t = ${answerStr}$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${sLine}</div>`,
      `<div class="math-step">${substitutionLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: t,
      valueStr: answerStr,
      unit: '',
      step: TSTAT_ANSWER_STEP,
      rng,
      min: -6,
      max: 6
    });

    return {
      id: `tstat:${runId}:criterion:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: buildAcceptList('t', answerStr, ''),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'stats', 't-test']
    };
  }
  throw new Error('Failed to generate test criterion card');
}

function buildSensitivityNegativeCountCard(index, rng, runId) {
  const maxAttempts = 120;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const population = randStep(rng, SENS_NEG_POP.min, SENS_NEG_POP.max, SENS_NEG_POP.step);
    const sensPct = randStep(rng, SENS_NEG_SENS.min, SENS_NEG_SENS.max, SENS_NEG_SENS.step);
    if (!Number.isFinite(population) || !Number.isFinite(sensPct)) continue;
    const sens = sensPct / 100;
    const neg = Math.round(population * (1 - sens));
    if (!Number.isFinite(neg)) continue;

    const populationStr = formatByStep(population, SENS_NEG_POP.step);
    const sensPctStr = formatByStep(sensPct, SENS_NEG_SENS.step);
    const sensStr = formatByStep(sens, 0.01);
    const answerStr = formatAnswer(neg);
    if (!populationStr || !sensPctStr || !sensStr || !answerStr) continue;

    const formulaLine = combineFormulaLine([
      'N_{neg} = (1 - Se) N'
    ]);
    const promptLine = `A diagnostic test was developed in order to aid the detection of a certain disease. It was applied on $${populationStr}$ people suffering from that disease. The sensitivity of the test was $${sensPctStr}\\%$. How many persons had a negative result of the test?`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [
        `$Se = ${sensPctStr}\\%$`,
        `$N = ${populationStr}$`
      ]
    });
    const substitutionLine = `$N_{neg} = (1 - ${sensStr})\\times ${populationStr}$`;
    const finalLine = `$N_{neg} = ${answerStr}$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${substitutionLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: neg,
      valueStr: answerStr,
      unit: '',
      step: 1,
      rng,
      min: 0,
      max: population
    });

    return {
      id: `sensneg:${runId}:count:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: buildAcceptList('N', answerStr, ''),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'stats', 'sensitivity']
    };
  }
  throw new Error('Failed to generate sensitivity negative card');
}

function buildPhotoelectricBrakingCard(index, rng, runId) {
  const maxAttempts = 200;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const workPct = randStep(rng, PHOTOELECTRIC_WORK_PCT.min, PHOTOELECTRIC_WORK_PCT.max, PHOTOELECTRIC_WORK_PCT.step);
    if (!Number.isFinite(workPct) || workPct <= 0 || workPct >= 100) continue;
    const workFrac = workPct / 100;
    const ratio = 1 / (1 - workFrac);
    const increasePct = (ratio - 1) * 100;
    if (!Number.isFinite(increasePct) || increasePct <= 0) continue;

    const workPctStr = formatByStep(workPct, PHOTOELECTRIC_WORK_PCT.step);
    const workFracStr = formatByStep(workFrac, 0.01);
    const answerStr = formatAnswer(increasePct);
    if (!answerStr) continue;

    const formulaLine = combineFormulaLine([
      '\\Delta_{\\%} \\lambda_{min} = \\left(\\frac{1}{1 - w} - 1\\right) \\times 100\\%'
    ]);
    const promptLine = `By how many percent is the minimal wavelength of this braking radiation higher than the wavelength of primary photon if $${workPctStr}\\%$ of primary photon energy was consumed as work function?`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [
        `$w = ${workPctStr}\\%$`
      ]
    });
    const substitutionLine = `$\\Delta_{\\%} \\lambda_{min} = \\left(\\frac{1}{1 - ${workFracStr}} - 1\\right) \\times 100\\%$`;
    const finalLine = `$\\Delta_{\\%} \\lambda_{min} = ${answerStr}\\%$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${substitutionLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: increasePct,
      valueStr: answerStr,
      unit: '\\%',
      step: PHOTOELECTRIC_ANSWER_STEP,
      rng,
      min: 0,
      max: 100
    });

    return {
      id: `photoelectric:${runId}:lambda:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: [answerStr, `${answerStr}%`, `${answerStr} %`],
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'photoelectric', 'braking', 'radiation']
    };
  }
  throw new Error('Failed to generate photoelectric braking card');
}

function buildMolarityConcentrationCard(index, rng, runId) {
  const maxAttempts = 200;
  const molarMass = MOLARITY_MOLAR_MASS;
  const physMassPerL = MOLARITY_PHYS_G_PER_L;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const mass = randStep(rng, MOLARITY_MASS_G.min, MOLARITY_MASS_G.max, MOLARITY_MASS_G.step);
    const volumeMl = randStep(rng, MOLARITY_VOLUME_ML.min, MOLARITY_VOLUME_ML.max, MOLARITY_VOLUME_ML.step);
    if (!Number.isFinite(mass) || !Number.isFinite(volumeMl)) continue;
    const volumeL = volumeMl / 1000;
    if (!Number.isFinite(volumeL) || volumeL <= 0) continue;

    const nAdded = mass / molarMass;
    const cPhys = physMassPerL / molarMass;
    const nPhys = cPhys * volumeL;
    const nTotal = nAdded + nPhys;
    const c = nTotal / volumeL;
    if (!Number.isFinite(c) || c <= 0) continue;

    const answerStr = formatAnswer(c);
    if (!answerStr) continue;

    const massStr = formatByStep(mass, MOLARITY_MASS_G.step);
    const volMlStr = formatByStep(volumeMl, MOLARITY_VOLUME_ML.step);
    const molarMassStr = formatSigFig(molarMass, 3);
    const physPctStr = formatByStep(physMassPerL / 10, 0.1);

    const formulaLine = combineFormulaLine([
      'c = \\frac{\\frac{m}{M} + c_{phys} \\times V}{V}'
    ]);
    const promptLine = `Calculate the molar concentration (in $\\mathrm{mol/L}$) of the solution prepared by mixing $${massStr}\\,\\mathrm{g}$ of NaCl with $${volMlStr}\\,\\mathrm{mL}$ of $${physPctStr}\\%_{d}$ physiological solution (neglect volume change).`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [
        `$m_{\\mathrm{NaCl}} = ${massStr}\\,${formatUnitLatex('g')}$`,
        `$M_{\\mathrm{NaCl}} = ${molarMassStr}\\,${formatUnitLatex('g/mol')}$`,
        `$V = ${volMlStr}\\,${formatUnitLatex('mL')}$`
      ]
    });
    const substitutionLine = `$c = \\frac{\\frac{${massStr}}{${molarMassStr}} + \\frac{${physPctStr} \\times 10^{1}}{${molarMassStr}} \\times (${volMlStr} \\times 10^{-3})}{${volMlStr} \\times 10^{-3}}$`;
    const finalLine = `$c = ${answerStr}\\,${formatUnitLatex('mol/L')}$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${substitutionLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: c,
      valueStr: answerStr,
      unit: 'mol/L',
      rng,
      min: 0,
      max: 1
    });

    const accept = new Set(buildAcceptList('c', answerStr, 'mol/L', ['C']));
    accept.add(`${answerStr} M`);
    accept.add(`${answerStr}M`);
    accept.add(`c=${answerStr} M`);
    accept.add(`c = ${answerStr} M`);
    accept.add(`C=${answerStr} M`);
    accept.add(`C = ${answerStr} M`);

    return {
      id: `molarity:${runId}:c:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: Array.from(accept),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'molarity', 'concentration']
    };
  }
  throw new Error('Failed to generate molarity card');
}

function buildXrayMaxEnergyCard(index, rng, runId) {
  const maxAttempts = 220;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const voltageKv = randStep(rng, XRAY_EMAX_VOLTAGE_KV.min, XRAY_EMAX_VOLTAGE_KV.max, XRAY_EMAX_VOLTAGE_KV.step);
    if (!Number.isFinite(voltageKv) || voltageKv <= 0) continue;

    const voltageV = voltageKv * 1e3;
    const energyJ = XRAY_ELEMENTARY_CHARGE * voltageV;
    if (!Number.isFinite(energyJ) || energyJ <= 0) continue;

    const scaledEnergy = energyJ * Math.pow(10, -XRAY_EMAX_SCALE_EXP);
    if (!Number.isFinite(scaledEnergy)) continue;
    if (scaledEnergy < XRAY_EMAX_COEFF_RANGE.min || scaledEnergy > XRAY_EMAX_COEFF_RANGE.max) continue;

    const voltageStr = formatByStep(voltageKv, XRAY_EMAX_VOLTAGE_KV.step);
    const eStr = formatSciLatex(XRAY_ELEMENTARY_CHARGE, 4);
    const answerStr = formatAnswer(scaledEnergy);
    if (!voltageStr || !eStr || !answerStr) continue;

    const formulaLine = combineFormulaLine([
      'E_{max} = e U'
    ]);
    const promptLine = `X-rays used during surgery were obtained using the anode voltage $${voltageStr}\\,\\mathrm{kV}$. Calculate the maximal energy of a braking radiation photon. Express your answer as coefficient in $10^{-14}\\,\\mathrm{J}$.`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [
        `$U = ${voltageStr}\\,${formatUnitLatex('kV')}$`,
        `$e = ${eStr}\\,${formatUnitLatex('C')}$`
      ]
    });
    const substitutionLine = `$E_{max} = ${eStr} \\times ${voltageStr} \\times 10^{3}$`;
    const finalLine = `$E_{max} = ${answerStr} \\times 10^{-14}\\,\\mathrm{J}$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${substitutionLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: scaledEnergy,
      valueStr: answerStr,
      unit: '',
      step: XRAY_EMAX_ANSWER_STEP,
      rng,
      min: XRAY_EMAX_COEFF_RANGE.min,
      max: XRAY_EMAX_COEFF_RANGE.max
    });

    const accept = new Set(buildAcceptList('Emax', answerStr, '', ['E_max', 'energy']));
    accept.add(`${answerStr}x10^-14J`);
    accept.add(`${answerStr} x 10^-14 J`);
    accept.add(`${answerStr}*10^-14J`);
    accept.add(`${answerStr} * 10^-14 J`);
    accept.add(`${answerStr}e-14J`);

    return {
      id: `xray:${runId}:emax:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: Array.from(accept),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'xray', 'braking-radiation', 'photon-energy']
    };
  }
  throw new Error('Failed to generate X-ray max-energy card');
}

function buildMolarityDilutionCard(index, rng, runId) {
  const maxAttempts = 200;
  const c1Pct = MOLARITY_DILUTION_C1_PCT;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const v1Ml = randStep(rng, MOLARITY_DILUTION_V1_ML.min, MOLARITY_DILUTION_V1_ML.max, MOLARITY_DILUTION_V1_ML.step);
    const cFinalPct = randStep(rng, MOLARITY_DILUTION_CF_PCT.min, MOLARITY_DILUTION_CF_PCT.max, MOLARITY_DILUTION_CF_PCT.step);
    if (!Number.isFinite(v1Ml) || !Number.isFinite(cFinalPct)) continue;
    if (v1Ml <= 0 || cFinalPct <= 0 || cFinalPct >= c1Pct) continue;

    const vWaterMl = v1Ml * ((c1Pct / cFinalPct) - 1);
    if (!Number.isFinite(vWaterMl) || vWaterMl <= 0) continue;

    const v1Str = formatByStep(v1Ml, MOLARITY_DILUTION_V1_ML.step);
    const c1Str = formatByStep(c1Pct, 0.1);
    const cFinalStr = formatByStep(cFinalPct, MOLARITY_DILUTION_CF_PCT.step);
    const answerStr = formatAnswer(vWaterMl);
    if (!v1Str || !c1Str || !cFinalStr || !answerStr) continue;

    const formulaLine = combineFormulaLine([
      'V_{H_2O} = V_1\\left(\\frac{c_1}{c} - 1\\right)'
    ]);
    const promptLine = `How much water (in $\\mathrm{mL}$) is necessary to add to $${v1Str}\\,\\mathrm{mL}$ of saline to prepare a solution of final density concentration $${cFinalStr}\\%_{d}$?`;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines: [
        `$V_1 = ${v1Str}\\,${formatUnitLatex('mL')}$`,
        `$c_1 = ${c1Str}\\,\\%_{d}$`,
        `$c = ${cFinalStr}\\,\\%_{d}$`
      ]
    });
    const substitutionLine = `$V_{H_2O} = ${v1Str}\\left(\\frac{${c1Str}}{${cFinalStr}} - 1\\right)$`;
    const finalLine = `$V_{H_2O} = ${answerStr}\\,${formatUnitLatex('mL')}$`;
    const back = [
      `<div class="math-step">${formulaLine}</div>`,
      `<div class="math-step">${substitutionLine}</div>`,
      `<div class="math-final">${finalLine}</div>`
    ].join('');

    const { options: mcqOptions, correctText } = buildNumericMcqOptions({
      value: vWaterMl,
      valueStr: answerStr,
      unit: 'mL',
      step: MOLARITY_DILUTION_ANSWER_STEP,
      rng,
      min: 10,
      max: 800
    });

    const accept = new Set(buildAcceptList('V_H2O', answerStr, 'mL', ['V_H20', 'Vw', 'water']));
    accept.add(`${answerStr}mL`);

    return {
      id: `molarity:${runId}:dilution:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerStr],
      accept: Array.from(accept),
      mcqOptions: mcqOptions.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'molarity', 'dilution', 'saline']
    };
  }
  throw new Error('Failed to generate molarity dilution card');
}

function buildMolarityMassFromConcentrationCard(index, rng, runId) {
  const molarMass = MOLARITY_MOLAR_MASS;
  const volumeMl = MOLARITY_MASS_FROM_C_VOLUME_ML;
  const targetC = MOLARITY_MASS_FROM_C_TARGET_C;
  const volumeL = volumeMl / 1000;
  const mass = targetC * volumeL * molarMass;
  if (!Number.isFinite(mass) || mass <= 0) {
    throw new Error('Failed to generate molarity mass-from-concentration card');
  }

  const answerStr = formatAnswer(mass);
  if (!answerStr) {
    throw new Error('Failed to format molarity mass-from-concentration answer');
  }

  const cStr = formatByStep(targetC, 0.0001);
  const vStr = formatByStep(volumeMl, 1);
  const molarMassStr = formatSigFig(molarMass, 3);
  const formulaLine = combineFormulaLine([
    'm = c \\times V \\times M'
  ]);
  const promptLine = `How many grams of NaCl must be added to $${vStr}\\,\\mathrm{mL}$ of water to obtain a final solution with a concentration of $${cStr}\\,\\mathrm{mol\\cdot L^{-1}}$?`;
  const front = buildFrontWithPrompt({
    promptLine,
    formulaLine,
    givenLines: [
      `$c = ${cStr}\\,${formatUnitLatex('mol/L')}$`,
      `$V = ${vStr}\\,${formatUnitLatex('mL')}$`,
      `$M_{\\mathrm{NaCl}} = ${molarMassStr}\\,${formatUnitLatex('g/mol')}$`
    ]
  });
  const substitutionLine = `$m = ${cStr} \\times (${vStr} \\times 10^{-3}) \\times ${molarMassStr}$`;
  const finalLine = `$m = ${answerStr}\\,${formatUnitLatex('g')}$`;
  const back = [
    `<div class="math-step">${formulaLine}</div>`,
    `<div class="math-step">${substitutionLine}</div>`,
    `<div class="math-final">${finalLine}</div>`
  ].join('');

  const { options: mcqOptions, correctText } = buildNumericMcqOptions({
    value: mass,
    valueStr: answerStr,
    unit: 'g',
    rng,
    min: 0,
    max: 5
  });

  const accept = new Set(buildAcceptList('m', answerStr, 'g', ['m_NaCl', 'mNaCl', 'NaCl']));
  accept.add(`${answerStr} gram`);
  accept.add(`${answerStr} grams`);
  const morePrecise = formatByStep(mass, 0.0001);
  if (morePrecise) {
    accept.add(morePrecise);
    accept.add(`${morePrecise} g`);
    accept.add(`${morePrecise}g`);
  }

  return {
    id: `molarity:${runId}:mass_from_c:${String(index).padStart(3, '0')}`,
    archetype: 'maths',
    front,
    back,
    correct: [answerStr],
    accept: Array.from(accept),
    mcqOptions: mcqOptions.map(text => ({ text })),
    mcqCorrect: [correctText],
    tags: ['biophysics', 'molarity', 'mass', 'concentration', 'nacl']
  };
}

function buildMolarityCard(index, rng, runId) {
  const roll = rng();
  if (roll < (1 / 3)) return buildMolarityConcentrationCard(index, rng, runId);
  if (roll < (2 / 3)) return buildMolarityDilutionCard(index, rng, runId);
  return buildMolarityMassFromConcentrationCard(index, rng, runId);
}

export function generateNernstDeck({ count = DEFAULT_NERNST_COUNT } = {}) {
  const total = Math.max(1, Number(count) || DEFAULT_NERNST_COUNT);
  const rng = Math.random;
  const runId = `${Date.now().toString(36)}${Math.floor(rng() * 1e6).toString(36)}`;
  const targets = NERNST_TARGETS.length ? NERNST_TARGETS : ['U'];
  const cards = [];
  for (let i = 0; i < total; i += 1) {
    const target = targets[i % targets.length];
    const card = buildNernstCard(target, i + 1, rng, runId);
    cards.push(applyBiofyzTtsTerms(card, getBiofyzTtsTermMapForType('nernst')));
  }
  return normalizeGeneratedDeck(cards);
}

export function generateOsmoticDeck({ count = DEFAULT_OSMOTIC_COUNT } = {}) {
  const total = Math.max(1, Number(count) || DEFAULT_OSMOTIC_COUNT);
  const rng = Math.random;
  const runId = `${Date.now().toString(36)}${Math.floor(rng() * 1e6).toString(36)}`;
  const cards = [];
  for (let i = 0; i < total; i += 1) {
    const card = buildOsmoticCard(i + 1, rng, runId);
    cards.push(applyBiofyzTtsTerms(card, inferBiofyzTtsTermMapForCard(card)));
  }
  return normalizeGeneratedDeck(cards);
}

export function generateBiofyzDeck({ count = DEFAULT_BIOFYZ_COUNT, enabledTypes = null } = {}) {
  const total = Math.max(1, Number(count) || DEFAULT_BIOFYZ_COUNT);
  const rng = Math.random;
  const runId = `${Date.now().toString(36)}${Math.floor(rng() * 1e6).toString(36)}`;
  const cards = [];
  const nernstTargets = NERNST_TARGETS.length ? NERNST_TARGETS : ['U'];
  const allTypes = [
    { key: 'reynolds', build: (i) => buildCardForTarget(REYNOLDS_TARGETS[i % REYNOLDS_TARGETS.length], i + 1, rng, runId) },
    { key: 'nernst', build: (i) => buildNernstCard(nernstTargets[i % nernstTargets.length], i + 1, rng, runId) },
    { key: 'osmotic_pi', build: (i) => buildOsmoticPressureCard(i + 1, rng, runId) },
    { key: 'osmotic_isotonic', build: (i) => buildOsmoticIsotonicCard(i + 1, rng, runId) },
    { key: 'molarity_c', build: (i) => buildMolarityConcentrationCard(i + 1, rng, runId) },
    { key: 'molarity_dilution', build: (i) => buildMolarityDilutionCard(i + 1, rng, runId) },
    { key: 'molarity_mass_from_c', build: (i) => buildMolarityMassFromConcentrationCard(i + 1, rng, runId) },
    { key: 'arterial', build: (i) => buildArterialPressureCard(i + 1, rng, runId) },
    { key: 'arterial_mean_bp', build: (i) => buildArterialMeanPressureCard(i + 1, rng, runId) },
    { key: 'arterial_aneurysm', build: (i) => buildArterialAneurysmPressureCard(i + 1, rng, runId) },
    { key: 'arterial_pulmonary_speed', build: (i) => buildArterialPulmonarySpeedCard(i + 1, rng, runId) },
    { key: 'photon_lambda', build: (i) => buildPhotonWavelengthCard(i + 1, rng, runId) },
    { key: 'photon_energy', build: (i) => buildPhotonEnergyFromWavelengthCard(i + 1, rng, runId) },
    { key: 'sound', build: (i) => buildSoundPipesCard(i + 1, rng, runId) },
    { key: 'sound_loudspeaker_pressure', build: (i) => buildLoudspeakerPressureCard(i + 1, rng, runId) },
    { key: 'acoustic_impedance', build: (i) => buildAcousticImpedanceAirCard(i + 1, rng, runId) },
    { key: 'eye', build: (i) => buildEyeResolutionCard(i + 1, rng, runId) },
    { key: 'microscope', build: (i) => buildMicroscopeResolutionCard(i + 1, rng, runId) },
    { key: 'microscope_magnification', build: (i) => buildMicroscopeMagnificationCard(i + 1, rng, runId) },
    { key: 'nearpoint', build: (i) => buildNearPointDistanceCard(i + 1, rng, runId) },
    { key: 'farpoint', build: (i) => buildFarPointCard(i + 1, rng, runId) },
    { key: 'debroglie', build: (i) => buildDebroglieCard(i + 1, rng, runId) },
    { key: 'decay_lambda', build: (i) => buildDecayConstantCard(i + 1, rng, runId) },
    { key: 'decay_half_life', build: (i) => buildDecayHalfLifeCard(i + 1, rng, runId) },
    { key: 'ear', build: (i) => buildEarCanalResonanceCard(i + 1, rng, runId) },
    { key: 'ultrasound_transmission_pct', build: (i) => buildUltrasoundTransmissionCard(i + 1, rng, runId) },
    { key: 'ultrasound_transmitted_intensity', build: (i) => buildUltrasoundTransmittedIntensityCard(i + 1, rng, runId) },
    { key: 'shielding_intensity', build: (i) => buildShieldingIntensityCard(i + 1, rng, runId) },
    { key: 'shielding_dual_board', build: (i) => buildShieldingDualBoardAbsorptionCard(i + 1, rng, runId) },
    { key: 'dose_equivalent_mixed', build: (i) => buildDoseEquivalentMixedFieldCard(i + 1, rng, runId) },
    { key: 'ct', build: (i) => buildCtNumberCard(i + 1, rng, runId) },
    { key: 'median', build: (i) => buildMedianCard(i + 1, rng, runId) },
    { key: 'quartile', build: (i) => buildQuartileCard(i + 1, rng, runId) },
    { key: 'iqr', build: (i) => buildInterquartileRangeCard(i + 1, rng, runId) },
    { key: 'cv', build: (i) => buildVariationCoefficientCard(i + 1, rng, runId) },
    { key: 'ciupper', build: (i) => buildConfidenceUpperCard(i + 1, rng, runId) },
    { key: 'tstat', build: (i) => buildTestCriterionCard(i + 1, rng, runId) },
    { key: 'relfreq', build: (i) => buildRelativeFrequencyCard(i + 1, rng, runId) },
    { key: 'condprob_cond', build: (i) => buildConditionalProbabilityCard(i + 1, rng, runId, 'cond') },
    { key: 'condprob_neither', build: (i) => buildConditionalProbabilityCard(i + 1, rng, runId, 'neither') },
    { key: 'hypotest_alpha', build: (i) => buildHypothesisTestCard(i + 1, rng, runId, 'alpha') },
    { key: 'hypotest_power', build: (i) => buildHypothesisTestCard(i + 1, rng, runId, 'power') },
    { key: 'negpred_npv', build: (i) => buildNegativePredictiveCard(i + 1, rng, runId, 'npv') },
    { key: 'negpred_ppv', build: (i) => buildNegativePredictiveCard(i + 1, rng, runId, 'ppv') },
    { key: 'sensneg', build: (i) => buildSensitivityNegativeCountCard(i + 1, rng, runId) },
    { key: 'cardiac_output', build: (i) => buildCardiacOutputCard(i + 1, rng, runId) },
    { key: 'photoelectric', build: (i) => buildPhotoelectricBrakingCard(i + 1, rng, runId) },
    { key: 'xray_emax', build: (i) => buildXrayMaxEnergyCard(i + 1, rng, runId) },
    { key: 'ef_esv_decrease', build: (i) => buildEjectionFractionFromImprovementCard(i + 1, rng, runId) },
    { key: 'ef_from_sv_esv', build: (i) => buildEjectionFractionFromSvEsvShareCard(i + 1, rng, runId) },
    { key: 'ecg_avf_zero', build: (i) => buildEcgLeadCard('avf_zero', i + 1, rng, runId) },
    { key: 'ecg_avl_zero', build: (i) => buildEcgLeadCard('avl_zero', i + 1, rng, runId) },
    { key: 'ecgprac_axis', build: (i) => buildEcgPracticalAxisCard(i + 1, rng, runId) },
    { key: 'ecgprac_rate', build: (i) => buildEcgPracticalRateCard(i + 1, rng, runId) }
  ];
  let types = allTypes;
  if (Array.isArray(enabledTypes) && enabledTypes.length) {
    const allowed = new Set(expandLegacyBiofyzTypeKeys(enabledTypes));
    types = allTypes.filter(type => allowed.has(type.key));
  } else {
    const prefs = getBiofyzPrefs();
    types = allTypes.filter(type => prefs[type.key] !== false);
  }
  if (!types.length) types = allTypes;
  const base = Math.floor(total / types.length);
  const remainder = total % types.length;
  types.forEach((type, idx) => {
    const countForType = base + (idx < remainder ? 1 : 0);
    for (let i = 0; i < countForType; i += 1) {
      const card = type.build(i);
      const termMap = type?.ttsTermMap || BIOFYZ_TYPE_TTS_TERM_MAP[type.key] || null;
      cards.push(applyBiofyzTtsTerms(card, termMap));
    }
  });
  cards.forEach(card => {
    if (!card || typeof card !== 'object') return;
    card.lang = 'en';
    card.langFront = 'en';
    card.langBack = 'en';
  });
  return normalizeGeneratedDeck(cards);
}

function buildCardForTarget(targetKey, index, rng, runId) {
  const spec = VAR_SPECS[targetKey];
  const maxAttempts = 200;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const given = {};
    const valuesSI = {};
    const useArea = targetKey !== 'r' && rng() < AREA_GIVEN_PROB;
    REYNOLDS_VARIABLES.forEach(key => {
      if (key === targetKey) return;
      if (key === 'r' && useArea) return;
      const entry = buildGivenEntry(key, rng);
      if (!entry) return;
      given[key] = entry;
      valuesSI[key] = entry.siValue;
    });
    if (useArea) {
      const areaEntry = buildAreaEntry(rng);
      given.A = areaEntry;
      valuesSI.A = areaEntry.siValue;
      valuesSI.r = Math.sqrt(areaEntry.siValue / Math.PI);
    }

    const targetSI = computeTarget(targetKey, valuesSI);
    if (!Number.isFinite(targetSI) || targetSI <= 0) continue;
    if (targetSI < spec.range[0] || targetSI > spec.range[1]) continue;

    const answerValue = formatAnswer(targetSI);
    if (!answerValue) continue;
    const answerUnit = spec.siUnit;

    const givenLines = [];
    const givenOrder = buildReynoldsGivenOrder(targetKey, useArea);
    givenOrder.forEach(key => {
      if (key === targetKey) return;
      const entry = given[key];
      if (!entry) return;
      const unit = entry.unit?.label || '';
      const step = entry.unit?.step;
      const display = Number.isFinite(step) ? formatByStep(entry.displayValue, step) : formatSigFig(entry.displayValue, 3);
      const label = latexVarLabel(key);
      const unitLatex = unit ? formatUnitLatex(unit) : '';
      const line = unitLatex
        ? `$${label} = ${display}\\,${unitLatex}$`
        : `$${label} = ${display}$`;
      givenLines.push(line);
    });

    const targetLabel = spec.label;
    const targetLatex = latexVarLabel(targetKey);
    const targetLine = targetKey === 'Re'
      ? `Find $${targetLatex}$.`
      : `Find $${targetLatex}$ (${formatUnitInlineLatex(answerUnit)}).`;

    const answerLatex = answerUnit ? `${answerValue}\\,${formatUnitLatex(answerUnit)}` : answerValue;
    const formulaLine = buildReynoldsFormulaLine(targetKey, useArea);
    const promptLine = buildReynoldsPrompt({ targetKey, useArea, given, rng }) || targetLine;
    const front = buildFrontWithPrompt({
      promptLine,
      formulaLine,
      givenLines
    });
    const substitutionLine = buildFormulaLine(targetKey, valuesSI, given);
    const finalLine = `$${latexVarLabel(targetKey)} = ${answerLatex}$`.trim();
    const back = [
      formulaLine ? `<div class="math-step">${formulaLine}</div>` : '',
      substitutionLine ? `<div class="math-step">${substitutionLine}</div>` : '',
      `<div class="math-final">${finalLine}</div>`
    ].filter(Boolean).join('');
    const aliases = LABEL_ALIASES[targetKey] || [];
    const accept = buildAcceptList(targetLabel, answerValue, answerUnit, aliases);

    const { options, correctText } = buildMcqOptions(targetKey, targetSI, rng);

    return {
      id: `reynolds:${runId}:${targetKey}:${String(index).padStart(3, '0')}`,
      archetype: 'maths',
      front,
      back,
      correct: [answerValue],
      accept,
      mcqOptions: options.map(text => ({ text })),
      mcqCorrect: [correctText],
      tags: ['biophysics', 'reynolds', targetKey.toLowerCase()]
    };
  }
  throw new Error(`Failed to generate Reynolds card for ${targetKey}`);
}

export function generateReynoldsDeck({ count = DEFAULT_REYNOLDS_COUNT } = {}) {
  const total = Math.max(1, Number(count) || DEFAULT_REYNOLDS_COUNT);
  const rng = Math.random;
  const runId = `${Date.now().toString(36)}${Math.floor(rng() * 1e6).toString(36)}`;
  const cards = [];
  for (let i = 0; i < total; i += 1) {
    const target = REYNOLDS_TARGETS[i % REYNOLDS_TARGETS.length];
    const card = buildCardForTarget(target, i + 1, rng, runId);
    cards.push(applyBiofyzTtsTerms(card, getBiofyzTtsTermMapForType('reynolds')));
  }
  return normalizeGeneratedDeck(cards);
}
