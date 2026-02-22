// audio.js — TTS client with latest-only playback
// Public API: initTTS({ endpoint, voice }), speak(text), stop(), setVoice(name), speakAnswerForCard(card)

import { normalizeTtsText } from './tts-normalize.js';

// Default to a currently-available Edge voice (Marcello/IsabellaMultilingual were removed upstream).
let TTS = { endpoint: '', voice: 'tr-TR-AhmetNeural' };

// single active request/audio
let currentAbort = null;
let currentAudio = null;
let currentURL   = null;
let ticket       = 0;     // monotonically increasing; latest wins
let loadingTicket = 0;
let ttsFailureCount = 0;
let ttsCooldownUntil = 0;
let ttsCooldownTimer = null;

function dispatchTtsLoading(active) {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('tts-loading', { detail: { active: !!active } }));
  } catch {}
}

function dispatchTtsStatus(state, detail = {}) {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('tts-status', { detail: { state, ...detail } }));
  } catch {}
}

function setTtsLoading(active, myTicket = 0) {
  if (active) {
    loadingTicket = myTicket || ticket;
    dispatchTtsLoading(true);
    return;
  }
  if (myTicket && myTicket !== loadingTicket) return;
  loadingTicket = 0;
  dispatchTtsLoading(false);
}

function clearCooldownTimer() {
  if (ttsCooldownTimer) clearTimeout(ttsCooldownTimer);
  ttsCooldownTimer = null;
}

function clearTtsCooldown() {
  clearCooldownTimer();
  ttsFailureCount = 0;
  ttsCooldownUntil = 0;
  dispatchTtsStatus('ready');
}

function setTtsCooldown(reason = 'failed') {
  ttsFailureCount = Math.min(ttsFailureCount + 1, 6);
  const baseMs = 1500;
  const cooldownMs = Math.min(20000, baseMs * (2 ** Math.max(0, ttsFailureCount - 1)));
  ttsCooldownUntil = Date.now() + cooldownMs;
  dispatchTtsStatus('cooldown', { reason, retryAt: ttsCooldownUntil, cooldownMs });
  clearCooldownTimer();
  ttsCooldownTimer = setTimeout(() => {
    if (Date.now() >= ttsCooldownUntil) dispatchTtsStatus('retry-ready');
  }, cooldownMs + 20);
}

function resetTtsFailure() {
  clearTtsCooldown();
  ticket++;         // invalidate in-flight requests from the prior state
  cleanupAudio();
}

export function initTTS({ endpoint, voice } = {}) {
  if (endpoint) TTS.endpoint = endpoint.replace(/\/$/, '');
  if (voice)    TTS.voice    = voice;
  resetTtsFailure(); // new config => allow future speaks even if it failed before
  // best-effort ping (non-blocking)
  fetch((TTS.endpoint || '') + '/api/voices').catch(()=>{});
}

export function setVoice(name) {
  if (name) {
    TTS.voice = name;
    resetTtsFailure();
  }
}

export function retryTTSNow() {
  clearTtsCooldown();
}

function toPlainLines(htmlish) {
  const el = document.createElement('div');
  const html = String(htmlish ?? '').replace(/<br\s*\/?>/gi, '\n');
  el.innerHTML = html;
  const text = (el.textContent || '').replace(/\r\n/g, '\n');
  return text
    .split(/\n+/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function stripHtmlToText(input) {
  const el = document.createElement('div');
  const html = String(input ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|tr|td|th|section|article|header|footer|ul|ol|table|blockquote|pre|h[1-6])>/gi, '\n');
  el.innerHTML = html;
  return (el.textContent || '').replace(/\r\n/g, '\n');
}

const TTS_MAX_CHARS = 1200;

function splitByMaxLength(text, maxChars) {
  const out = [];
  let remaining = String(text || '').trim();
  if (!remaining) return out;
  while (remaining.length > maxChars) {
    let cut = -1;
    const punct = ['.', ';', ':', ',', ' '];
    for (const mark of punct) {
      const idx = remaining.lastIndexOf(mark, maxChars);
      if (idx > cut) cut = idx;
    }
    if (cut < Math.floor(maxChars * 0.4)) cut = maxChars;
    out.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) out.push(remaining);
  return out;
}

function buildTtsChunks(text) {
  const lines = toPlainLines(text);
  if (!lines.length) return [];
  const chunks = [];
  const terminalRe = /[.!?…]+$/;
  for (const line of lines) {
    const trimmed = line.trim();
    const paced = trimmed && !terminalRe.test(trimmed) ? `${trimmed}.` : trimmed;
    if (!paced) continue;
    if (paced.length <= TTS_MAX_CHARS) chunks.push(paced);
    else chunks.push(...splitByMaxLength(paced, TTS_MAX_CHARS));
  }
  return chunks;
}


const LIGATURE_RE = /[æÆœŒ]/g;
const LIGATURE_MAP = { 'æ': 'ae', 'Æ': 'Ae', 'œ': 'oe', 'Œ': 'Oe' };
function stripLatinDiacritics(text) {
  if (text == null) return '';
  const str = String(text);
  const withoutLigatures = str.replace(LIGATURE_RE, ch => LIGATURE_MAP[ch] || ch);
  if (typeof withoutLigatures.normalize === 'function') {
    return withoutLigatures.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  return withoutLigatures;
}

function stripLatinMacrons(text) {
  if (text == null) return '';
  const str = String(text);
  if (typeof str.normalize === 'function') {
    return str.normalize('NFD').replace(/\u0304/g, '').normalize('NFC');
  }
  return str;
}

function isCzechLang(lang) {
  return normalizeLangCode(lang) === 'cs';
}

function normalizeLangCode(lang) {
  if (!lang) return '';
  if (typeof lang === 'string') {
    const raw = String(lang).trim().toLowerCase();
    if (!raw) return '';
    return raw.split(/[-_]/)[0];
  }
  if (typeof lang === 'object' && !Array.isArray(lang)) {
    if (typeof lang.front === 'string') return normalizeLangCode(lang.front);
    if (typeof lang.back === 'string') return normalizeLangCode(lang.back);
  }
  return '';
}

function isLatinLang(lang) {
  return normalizeLangCode(lang) === 'la';
}

function collapsePlainText(text) {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .split(/\n+/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function stripLatexStyling(text) {
  if (text == null) return '';
  let out = String(text);
  if (!out) return '';
  // Remove math delimiters.
  out = out.replace(/\$\$/g, ' ').replace(/\$/g, ' ');
  out = out.replace(/\\\(|\\\)|\\\[|\\\]/g, ' ');
  // Normalize linebreak/space commands.
  out = out.replace(/\\\\/g, ' ');
  out = out.replace(/\\\s+/g, ' ');
  out = out.replace(/\\[,;:!]/g, ' ');
  // Strip styling wrappers but keep contents.
  out = out.replace(/\\(mathrm|text|mathbf|mathit|mathsf|mathbb|mathcal|mathfrak)\s*\{([^}]*)\}/gi, '$2');
  // Common operators/symbols -> ASCII-friendly text.
  out = out.replace(/\\times/g, 'x');
  out = out.replace(/\\cdot/g, '*');
  out = out.replace(/\\pm/g, '+/-');
  out = out.replace(/\\Delta/g, 'delta');
  out = out.replace(/\\alpha/g, 'alpha');
  out = out.replace(/\\beta/g, 'beta');
  out = out.replace(/\\gamma/g, 'gamma');
  out = out.replace(/\\delta/g, 'delta');
  out = out.replace(/\\mu/g, 'mu');
  out = out.replace(/\\pi/g, 'pi');
  out = out.replace(/\\Omega/g, 'ohm');
  out = out.replace(/\\sigma/g, 'sigma');
  out = out.replace(/\\lambda/g, 'lambda');
  out = out.replace(/\\phi/g, 'phi');
  out = out.replace(/\\theta/g, 'theta');
  out = out.replace(/\\rho/g, 'rho');
  out = out.replace(/\\nu/g, 'nu');
  out = out.replace(/\\omega/g, 'omega');
  // Fractions and roots (simple pass).
  out = out.replace(/\\frac\s*\{([^}]*)\}\s*\{([^}]*)\}/g, '$1 / $2');
  out = out.replace(/\\sqrt\s*\{([^}]*)\}/g, 'sqrt($1)');
  out = out.replace(/\\circ/g, 'deg');
  out = out.replace(/°/g, 'deg');
  out = out.replace(/×/g, 'x');
  out = out.replace(/·/g, '*');
  out = out.replace(/−/g, '-');
  // Remove \left/\right and escaped symbols.
  out = out.replace(/\\left|\\right/g, '');
  out = out.replace(/\\([%_&#])/g, '$1');
  // Simplify superscripts/subscripts.
  out = out.replace(/\^\{([^}]+)\}/g, '^$1');
  out = out.replace(/_\{([^}]+)\}/g, '_$1');
  // Drop remaining braces.
  out = out.replace(/[{}]/g, '');
  // Drop remaining leading backslashes (keep the command text).
  out = out.replace(/\\([A-Za-z]+)/g, '$1');
  return out;
}

function cleanupAudio() {
  try { currentAudio?.pause(); } catch {}
  try { if (currentURL) URL.revokeObjectURL(currentURL); } catch {}
  currentAudio = null;
  currentURL = null;
}

export function stop() {
  // Invalidate any in-flight speak without aborting fetch (avoids noisy chunked errors when we cancel mid-stream)
  ticket++;
  currentAbort = null;
  setTtsLoading(false);
  cleanupAudio();
}

async function playBuffer(buf, myTicket, signal) {
  if (!buf || myTicket !== ticket || signal?.aborted) return;
  const blob = new Blob([buf], { type: 'audio/mpeg' });
  const url  = URL.createObjectURL(blob);
  currentURL = url;

  const audio = new Audio(url);
  currentAudio = audio;

  const playPromise = new Promise(resolve => {
    const done = () => resolve();
    audio.addEventListener('ended', done, { once: true });
    audio.addEventListener('error', done, { once: true });
    if (signal) signal.addEventListener('abort', done, { once: true });
  });

  try { await audio.play(); } catch {}
  await playPromise;

  if (url === currentURL) {
    try { URL.revokeObjectURL(url); } catch {}
  }
  cleanupAudio();
}

export async function speak(text, opts = {}) {
  if (ttsCooldownUntil && Date.now() < ttsCooldownUntil) {
    dispatchTtsStatus('cooldown', {
      reason: 'cooldown-active',
      retryAt: ttsCooldownUntil,
      cooldownMs: Math.max(0, ttsCooldownUntil - Date.now())
    });
    return;
  }
  const { lang, preserveDiacritics, termMap } = opts ?? {};
  const isLatin = isLatinLang(lang);
  const keepDiacritics = isLatin || preserveDiacritics !== false || isCzechLang(lang);
  const normalized = isLatin
    ? stripLatinMacrons(String(text ?? '').normalize('NFC'))
    : keepDiacritics
      ? String(text ?? '').normalize('NFC')
    : stripLatinDiacritics(text);
  const withoutHtml = stripHtmlToText(normalized).normalize('NFC');
  const cleaned = isLatin
    ? collapsePlainText(withoutHtml)
    : normalizeTtsText(withoutHtml, { lang, termMap });
  const segments = buildTtsChunks(cleaned);
  if (!segments.length) return;

  // latest-only: cancel any in-flight/playing
  stop();

  const myTicket = ++ticket;
  const ctrl = new AbortController();
  currentAbort = ctrl;
  setTtsLoading(true, myTicket);

  // Prefetch all buffers to minimize gaps between chunks.
  const buffers = [];
  for (const seg of segments) {
    if (myTicket !== ticket || ctrl.signal.aborted) break;

    let res;
    try {
      res = await fetch((TTS.endpoint || '') + '/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: seg, voice: TTS.voice }),
        signal: ctrl.signal
      });
    } catch (err) {
      if (ctrl.signal.aborted || myTicket !== ticket) break;
      console.warn('TTS request failed', err);
      setTtsCooldown('request-failed');
      break; // aborted or network issue
    }

    if (myTicket !== ticket || ctrl.signal.aborted) break;
    if (!res || !res.ok) {
      setTtsCooldown('http-error');
      break;
    }
    const errHdr = res.headers.get('X-TTS-Error');
    if (errHdr) {
      console.warn('TTS upstream error:', errHdr);
      setTtsCooldown('upstream-error');
      break;
    }

    let buf;
    try {
      buf = await res.arrayBuffer();
    } catch (err) {
      console.warn('TTS response unreadable', err);
      setTtsCooldown('response-unreadable');
      break;
    }
    if (myTicket !== ticket || ctrl.signal.aborted) break;
    if (!buf || buf.byteLength === 0) {
      setTtsCooldown('empty-audio');
      break;
    }

    buffers.push(buf);
  }

  if (myTicket === ticket && !ctrl.signal.aborted) {
    setTtsLoading(false, myTicket);
  }

  for (const buf of buffers) {
    if (myTicket !== ticket || ctrl.signal.aborted) break;
    await playBuffer(buf, myTicket, ctrl.signal);
    if (myTicket !== ticket || ctrl.signal.aborted) break;
  }

  if (myTicket === ticket && !ctrl.signal.aborted) {
    if (buffers.length > 0) clearTtsCooldown();
    setTtsLoading(false, myTicket);
  }
}

/* ----------------------- New: speakAnswerForCard ----------------------- */

function toSilentList(card) {
  const raw = card?.silent;
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map(item => (item == null ? '' : String(item)))
      .filter(str => str !== '');
  }
  if (typeof raw === 'string' && raw !== '') {
    return [raw];
  }
  return [];
}

const CLOZE_TTS_RE = /{{\s*c[^:}]*::([\s\S]*?)(?:::(?:[\s\S]*?))?\s*}}/gi;
const TTS_SILENT_MARKER_RE = /<<![\s\S]*?!>>/g;
const TTS_SILENT_MARKER_HTML_RE = /&lt;&lt;![\s\S]*?!&gt;&gt;/gi;

function isLatinCard(card) {
  if (!card) return false;
  if (typeof card.type === 'string' && card.type.toLowerCase().startsWith('latin')) return true;
  if (Array.isArray(card.tags) && card.tags.some(tag => String(tag).toLowerCase() === 'latin')) return true;
  return false;
}

const LATIN_MORPH_TOKENS = new Set([
  'ae', 'a', 'am', 'arum', 'is', 'as', 'um', 'i', 'orum', 'us', 'er', 'tra', 'trum', 'o', 'e',
  'ei', 'ibus', 'es', 'en', 'on', 'al', 'ar', 'ix', 'ex', 'm', 'f', 'n', 'sg', 'pl'
]);
function normalizeDiacritics(str = '') {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
function isLatinMorphToken(word = '') {
  const normalized = normalizeDiacritics(word)
    .replace(/\./g, '')
    .toLowerCase()
    .trim();
  return LATIN_MORPH_TOKENS.has(normalized);
}

function replaceClozeForTts(text, { keepValue = true } = {}) {
  const raw = String(text ?? '');
  if (!raw) return '';
  return raw.replace(CLOZE_TTS_RE, (_match, value) => {
    if (!keepValue) return ' ';
    const val = value == null ? '' : String(value);
    return (val.split('|')[0] ?? '').trim();
  });
}

function stripSilentText(text, card, opts = {}) {
  const { keepClozeValue = true, trimLatinLemma = true } = opts ?? {};
  let result = text == null ? '' : String(text);
  if (!result) return '';
  // Strip any HTML segments explicitly marked as silent for TTS.
  result = result.replace(/<span[^>]*data-tts=["']off["'][^>]*>.*?<\/span>/gi, '');
  result = result.replace(TTS_SILENT_MARKER_RE, ' ');
  result = result.replace(TTS_SILENT_MARKER_HTML_RE, ' ');
  // Strip remaining HTML tags to normalize spacing.
  result = result.replace(/<[^>]+>/g, ' ');
  // Strip dictionary suffixes (", ae, f.", ", a, um", etc.) aggressively by truncating at first comma.
  const stripDictionarySuffix = (line) => {
    if (!line) return '';
    const idx = line.indexOf(',');
    return idx === -1 ? line : line.slice(0, idx);
  };
  result = result
    .split(/\n+/)
    .map(line => {
      const stripped = stripDictionarySuffix(line);
      if (!trimLatinLemma || !isLatinCard(card)) return stripped;
      const chunks = stripped.replace(/;/g, ',').split(',').map(c => c.trim()).filter(Boolean);
      const cleanedWords = [];
      chunks.forEach(chunk => {
        const words = chunk.split(/\s+/).filter(Boolean);
        const firstKeep = words.find(w => !isLatinMorphToken(normalizeDiacritics(w)));
        if (firstKeep) cleanedWords.push(firstKeep);
      });
      return cleanedWords.length ? cleanedWords.join(' ') : stripped;
    })
    .join('\n');
  const silentParts = toSilentList(card);
  if (silentParts.length) {
    for (const part of silentParts) {
      if (!part) continue;
      result = result.split(part).join('');
    }
  }
  result = replaceClozeForTts(result, { keepValue: keepClozeValue });
  result = result.replace(/\[\s*\.\.\.\s*\]/g, ' ');
  result = result
    .split(/\n+/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  return result;
}

function rawTextForTts(text) {
  if (text == null) return '';
  return String(text);
}

function sanitizeAnswerTtsText(text, card) {
  return stripSilentText(text, card, { keepClozeValue: true, trimLatinLemma: false });
}

function answerTextFromCard(card) {
  if (!card) return '';

  // 0) New schema: card.correct holds canonical answers (strings)
  if (Array.isArray(card.correct) && card.correct.length) {
    const ok = card.correct
      .map(s => String(s ?? '').trim())
      .filter(Boolean)
      .map(txt => rawTextForTts(txt));
    if (ok.length) return sanitizeAnswerTtsText(ok.join(', '), card);
  }

  // 1) MCQ objects: [{ text, correct: true }, ...]
  if (Array.isArray(card.answers) && card.answers.length && typeof card.answers[0] === 'object') {
    const ok = card.answers
      .filter(a => a && a.correct)
      .map(a => String(a.text ?? '').trim())
      .filter(Boolean);
    if (ok.length) return sanitizeAnswerTtsText(ok.join(', '), card);
  }

  // 2) MCQ strings + correct_indices
  if (Array.isArray(card.answers) && Array.isArray(card.correct_indices)) {
    const idx = new Set(card.correct_indices);
    const ok = card.answers
      .map((t, i) => (idx.has(i) ? String(t ?? '').trim() : ''))
      .filter(Boolean);
    if (ok.length) return sanitizeAnswerTtsText(ok.join(', '), card);
  }

  // 3) Fill-in / accept list
  if (Array.isArray(card.accept) && card.accept.length) {
    const a = card.accept.map(s => String(s ?? '').trim()).filter(Boolean);
    if (a.length) return sanitizeAnswerTtsText(a.join(', '), card);
  }

  // 4) Fallbacks (back_text/back/answer/front_text)
  const sources = [card.back_text, card.back, card.answer, card.front_text];
  for (const src of sources) {
    const raw = rawTextForTts(src);
    if (!raw || !raw.trim()) continue;
    const cleaned = sanitizeAnswerTtsText(raw, card);
    if (cleaned) return cleaned;
  }
  return '';
}

export async function speakAnswerForCard(card) {
  const txt = answerTextFromCard(card);
  const ttsCfg = (card && typeof card.tts === 'object') ? card.tts : null;
  const termMap = ttsCfg?.answerTermMap || ttsCfg?.backTermMap || ttsCfg?.termMap || null;
  if (txt) await speak(txt, { lang: card?.lang, termMap });
}
