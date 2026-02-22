const wordEl = document.getElementById("word");
const preEl = document.getElementById("wordPre");
const focusEl = document.getElementById("wordFocus");
const postEl = document.getElementById("wordPost");
const stageEl = document.querySelector(".stage");
const progressEl = document.getElementById("progress");
const statusEl = document.getElementById("status");

const wikiForm = document.getElementById("wikiForm");
const wikiInput = document.getElementById("wikiInput");
const applyFiltersBtn = document.getElementById("applyFiltersBtn");

const playBtn = document.getElementById("playBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const restartBtn = document.getElementById("restartBtn");

const wpmSlider = document.getElementById("wpmSlider");
const wpmValue = document.getElementById("wpmValue");
const textSizeSlider = document.getElementById("textSizeSlider");
const textSizeValue = document.getElementById("textSizeValue");

const presetSelect = document.getElementById("distillPreset");
const optHeadings = document.getElementById("optHeadings");
const optTables = document.getElementById("optTables");
const optCaptions = document.getElementById("optCaptions");
const optLists = document.getElementById("optLists");
const optReferences = document.getElementById("optReferences");
const optParens = document.getElementById("optParens");
const optBrackets = document.getElementById("optBrackets");
const optBraces = document.getElementById("optBraces");
const optWhitespace = document.getElementById("optWhitespace");

const state = {
  words: [],
  index: 0,
  playing: false,
  timer: null,
  wpm: 300,
  sourceHtml: "",
  sourceTitle: "",
};

const minWpm = 120;
const maxWpm = 900;
const stepWpm = 10;
const minTextSize = 20;
const maxTextSize = 72;
const stepTextSize = 2;
let sizeLocked = false;
const presets = {
  raw: {
    headings: false,
    tables: false,
    captions: false,
    lists: false,
    references: false,
    parens: false,
    brackets: false,
    braces: false,
    whitespace: true,
  },
  clean: {
    headings: true,
    tables: true,
    captions: true,
    lists: false,
    references: true,
    parens: false,
    brackets: false,
    braces: false,
    whitespace: true,
  },
  focused: {
    headings: true,
    tables: true,
    captions: true,
    lists: true,
    references: true,
    parens: true,
    brackets: true,
    braces: false,
    whitespace: true,
  },
};

const wordCharRegex = /[\p{L}\p{N}]/u;
const driftState = {
  active: false,
  timer: null,
  resetTimer: null,
  minDelay: 30000,
  maxDelay: 30000,
  holdMs: 200,
};

function setStatus(message) {
  statusEl.textContent = message;
}

function setControlsEnabled(enabled) {
  [playBtn, prevBtn, nextBtn, restartBtn].forEach((btn) => {
    btn.disabled = !enabled;
  });
}

function clearDriftTimers() {
  if (driftState.timer) {
    clearTimeout(driftState.timer);
    driftState.timer = null;
  }
  if (driftState.resetTimer) {
    clearTimeout(driftState.resetTimer);
    driftState.resetTimer = null;
  }
}

function getDriftDistance() {
  const raw = getComputedStyle(stageEl).getPropertyValue("--drift-distance").trim();
  const value = parseFloat(raw);
  return Number.isFinite(value) ? value : 2;
}

function scheduleDriftPulse() {
  if (!driftState.active) {
    return;
  }
  const span = driftState.maxDelay - driftState.minDelay;
  const delay = driftState.minDelay + Math.random() * Math.max(0, span);
  driftState.timer = setTimeout(() => {
    if (!driftState.active) {
      return;
    }
    const distance = getDriftDistance();
    const sign = Math.random() < 0.5 ? -1 : 1;
    stageEl.style.setProperty(
      "--drift-offset",
      `${(distance * sign).toFixed(2)}px`
    );
    driftState.resetTimer = setTimeout(() => {
      stageEl.style.setProperty("--drift-offset", "0px");
      if (driftState.active) {
        scheduleDriftPulse();
      }
    }, driftState.holdMs);
  }, delay);
}

function setDriftActive(active) {
  driftState.active = active;
  stageEl.classList.toggle("is-drifting", active);
  clearDriftTimers();
  stageEl.style.setProperty("--drift-offset", "0px");
  if (active) {
    scheduleDriftPulse();
  }
}

function updateProgress() {
  if (!state.words.length) {
    progressEl.textContent = "0 / 0";
    return;
  }
  progressEl.textContent = `${state.index + 1} / ${state.words.length}`;
}

function setWpm(value) {
  const clamped = Math.min(
    maxWpm,
    Math.max(minWpm, Math.round(value / stepWpm) * stepWpm)
  );
  state.wpm = clamped;
  wpmValue.textContent = clamped;
  wpmSlider.value = String(clamped);
  updateSliderFill(clamped);

  if (state.playing) {
    scheduleNext();
  }
}

function updateSliderFill(value) {
  const ratio = (value - minWpm) / (maxWpm - minWpm);
  const percent = Math.max(0, Math.min(100, Math.round(ratio * 100)));
  wpmSlider.style.background = `linear-gradient(90deg, var(--accent) 0%, var(--accent) ${percent}%, rgba(255, 255, 255, 0.2) ${percent}%, rgba(255, 255, 255, 0.2) 100%)`;
}

function setTextSize(value, lock = true) {
  const clamped = Math.min(
    maxTextSize,
    Math.max(minTextSize, Math.round(value / stepTextSize) * stepTextSize)
  );
  textSizeSlider.value = String(clamped);
  textSizeValue.textContent = `${clamped}px`;
  if (lock) {
    sizeLocked = true;
    stageEl.style.setProperty("--word-size", `${clamped}px`);
  }
  if (state.words.length) {
    alignWord();
  } else {
    setPlaceholder();
  }
}

function syncTextSizeFromLayout() {
  if (sizeLocked) {
    return;
  }
  const size = parseFloat(getComputedStyle(wordEl).fontSize);
  if (Number.isFinite(size)) {
    setTextSize(size, false);
  }
}

function applyPreset(name) {
  const preset = presets[name];
  if (!preset) {
    return;
  }
  optHeadings.checked = preset.headings;
  optTables.checked = preset.tables;
  optCaptions.checked = preset.captions;
  optLists.checked = preset.lists;
  optReferences.checked = preset.references;
  optParens.checked = preset.parens;
  optBrackets.checked = preset.brackets;
  optBraces.checked = preset.braces;
  optWhitespace.checked = preset.whitespace;
}

function getOptionsFromUI() {
  return {
    stripHeadings: optHeadings.checked,
    stripTables: optTables.checked,
    stripCaptions: optCaptions.checked,
    stripLists: optLists.checked,
    stripReferences: optReferences.checked,
    stripParens: optParens.checked,
    stripBrackets: optBrackets.checked,
    stripBraces: optBraces.checked,
    normalizeWhitespace: optWhitespace.checked,
  };
}

function parseWikiInput(input) {
  let base = "https://en.wikipedia.org";
  let title = input.trim();

  try {
    const url = new URL(input);
    if (url.hostname.includes("wikipedia.org")) {
      base = url.origin;
      const match = url.pathname.match(/\/wiki\/(.+)/);
      if (match && match[1]) {
        title = decodeURIComponent(match[1]);
      }
    }
  } catch (error) {
    // Treat input as a plain article title.
  }

  title = title.replace(/_/g, " ").trim();
  return { base, title };
}

async function fetchWikiHtml(base, title) {
  const url = new URL("/w/api.php", base);
  url.searchParams.set("origin", "*");
  url.searchParams.set("format", "json");
  url.searchParams.set("action", "parse");
  url.searchParams.set("prop", "text");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("redirects", "1");
  url.searchParams.set("page", title);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error("Wikipedia fetch failed.");
  }
  const data = await response.json();
  if (!data.parse || !data.parse.text) {
    throw new Error(data?.error?.info || "Article not found.");
  }
  return data.parse.text;
}

function cleanWikiHtml(html, options) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.querySelector(".mw-parser-output") || doc.body;

  const alwaysRemove = [
    "script",
    "style",
    "noscript",
    "svg",
    "audio",
    "video",
    "iframe",
  ];
  root.querySelectorAll(alwaysRemove.join(",")).forEach((el) => el.remove());

  const selectors = [];
  selectors.push(".toc", ".shortdescription", ".hatnote", ".portal");

  if (options.stripHeadings) {
    selectors.push("h1", "h2", "h3", "h4", "h5", "h6");
  }
  if (options.stripTables) {
    selectors.push("table", ".infobox", ".navbox", ".vertical-navbox", ".sidebar");
  }
  if (options.stripCaptions) {
    selectors.push("figure", "figcaption", ".thumb", ".thumbcaption", ".gallery");
  }
  if (options.stripLists) {
    selectors.push("ul", "ol", "dl");
  }
  if (options.stripReferences) {
    selectors.push("sup.reference", ".mw-references-wrap", ".reflist", ".reference");
  }

  if (selectors.length) {
    root.querySelectorAll(selectors.join(",")).forEach((el) => el.remove());
  }

  let text = root.innerText || "";
  text = text.replace(/\u00a0/g, " ");

  if (options.stripReferences) {
    text = stripReferenceMarkers(text);
  }

  if (options.stripParens || options.stripBrackets || options.stripBraces) {
    text = stripBracketed(text, options);
  }

  if (options.normalizeWhitespace) {
    text = text.replace(/\s+/g, " ").trim();
  } else {
    text = text.replace(/\s+\n/g, "\n").trim();
  }

  return text;
}

function stripReferenceMarkers(text) {
  return text
    .replace(/\[\s*\d+\s*\]/g, "")
    .replace(/\[\s*citation needed\s*\]/gi, "");
}

function stripBracketed(text, options) {
  const pairs = [];
  if (options.stripParens) {
    pairs.push(["(", ")"]);
  }
  if (options.stripBrackets) {
    pairs.push(["[", "]"]);
  }
  if (options.stripBraces) {
    pairs.push(["{", "}"]);
  }
  if (!pairs.length) {
    return text;
  }

  const openToClose = new Map(pairs);
  const closes = new Set(pairs.map((pair) => pair[1]));
  const stack = [];
  let output = "";

  for (const ch of text) {
    if (openToClose.has(ch)) {
      stack.push(openToClose.get(ch));
      continue;
    }
    if (stack.length && ch === stack[stack.length - 1]) {
      stack.pop();
      continue;
    }
    if (!stack.length || !closes.has(ch)) {
      output += ch;
    }
  }
  return output;
}

function tokenizeText(text) {
  const parts = text.trim().split(/\s+/);
  return parts.map(buildWordInfo).filter(Boolean);
}

function isWordChar(ch) {
  return wordCharRegex.test(ch);
}


function getOrpIndex(length) {
  let index = 0;
  if (length <= 1) {
    index = 0;
  } else if (length <= 5) {
    index = 1;
  } else if (length <= 9) {
    index = 2;
  } else if (length <= 13) {
    index = 3;
  } else {
    index = 4;
  }
  return Math.min(index, Math.max(0, length - 1));
}

function getTerminalPunct(raw) {
  const trailing = ")]}\"'";
  let idx = raw.length - 1;
  while (idx >= 0 && trailing.includes(raw[idx])) {
    idx -= 1;
  }
  return idx >= 0 ? raw[idx] : "";
}

function getPauseFactor(raw, coreLength) {
  const terminal = getTerminalPunct(raw);
  let factor = 1;
  if (terminal === "." || terminal === "!" || terminal === "?") {
    factor = 1.8;
  } else if (terminal === "," || terminal === ";" || terminal === ":") {
    factor = 1.3;
  }

  if (coreLength >= 14) {
    factor += 0.35;
  } else if (coreLength >= 10) {
    factor += 0.2;
  }
  return factor;
}

function buildWordInfo(raw) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const chars = Array.from(trimmed);
  let start = 0;
  while (start < chars.length && !isWordChar(chars[start])) {
    start += 1;
  }
  let end = chars.length - 1;
  while (end >= start && !isWordChar(chars[end])) {
    end -= 1;
  }

  if (start > end) {
    const focus = chars[0] || "";
    return {
      raw: trimmed,
      display: trimmed,
      pre: "",
      focus,
      post: trimmed.slice(1),
      orpIndex: 0,
      coreLength: 0,
      pauseFactor: 1.1,
    };
  }

  const leading = chars.slice(0, start).join("");
  const core = chars.slice(start, end + 1).join("");
  const trailing = chars.slice(end + 1).join("");

  const orpIndexCore = getOrpIndex(core.length);
  const focus = core.charAt(orpIndexCore) || core.charAt(0) || "";
  const pre = leading + core.slice(0, orpIndexCore);
  const post = core.slice(orpIndexCore + 1) + trailing;

  return {
    raw: trimmed,
    display: pre + focus + post,
    pre,
    focus,
    post,
    orpIndex: pre.length,
    coreLength: core.length,
    pauseFactor: getPauseFactor(trimmed, core.length),
  };
}

function alignWord() {
  wordEl.style.transform = "translate(-50%, -50%)";
  const wordRect = wordEl.getBoundingClientRect();
  const focusRect = focusEl.getBoundingClientRect();
  if (!wordRect.width || !focusRect.width) {
    return;
  }
  const wordCenter = wordRect.left + wordRect.width / 2;
  const focusCenter = focusRect.left + focusRect.width / 2;
  const delta = wordCenter - focusCenter;

  // Align the ORP letter with the center focus ticks.
  wordEl.style.transform = `translate(-50%, -50%) translateX(${delta.toFixed(3)}px)`;
}

function renderWord() {
  if (!state.words.length) {
    return;
  }
  const info = state.words[state.index];
  preEl.textContent = info.pre;
  focusEl.textContent = info.focus;
  postEl.textContent = info.post;
  alignWord();
  updateProgress();
}

function setPlaceholder() {
  const info = buildWordInfo("already");
  if (!info) {
    return;
  }
  preEl.textContent = info.pre;
  focusEl.textContent = info.focus;
  postEl.textContent = info.post;
  alignWord();
  updateProgress();
}

function computeDelay(info) {
  const base = 60000 / state.wpm;
  return Math.max(60, base * (info.pauseFactor || 1));
}

function scheduleNext() {
  if (!state.playing) {
    return;
  }
  clearTimeout(state.timer);
  const info = state.words[state.index];
  const delay = computeDelay(info);
  state.timer = setTimeout(() => {
    if (!state.playing) {
      return;
    }
    if (state.index >= state.words.length - 1) {
      pause();
      return;
    }
    state.index += 1;
    renderWord();
    scheduleNext();
  }, delay);
}

function play() {
  if (!state.words.length) {
    return;
  }
  state.playing = true;
  playBtn.textContent = "Pause";
  playBtn.setAttribute("aria-pressed", "true");
  setDriftActive(true);
  scheduleNext();
}

function pause() {
  state.playing = false;
  playBtn.textContent = "Play";
  playBtn.setAttribute("aria-pressed", "false");
  clearTimeout(state.timer);
  setDriftActive(false);
}

function togglePlay() {
  if (state.playing) {
    pause();
  } else {
    play();
  }
}

function nextWord() {
  if (!state.words.length) {
    return;
  }
  if (state.index < state.words.length - 1) {
    state.index += 1;
    renderWord();
    if (state.playing) {
      scheduleNext();
    }
  } else {
    pause();
  }
}

function prevWord() {
  if (!state.words.length) {
    return;
  }
  if (state.index > 0) {
    state.index -= 1;
    renderWord();
    if (state.playing) {
      scheduleNext();
    }
  }
}

function restart() {
  if (!state.words.length) {
    return;
  }
  state.index = 0;
  renderWord();
  if (state.playing) {
    scheduleNext();
  }
}

async function loadFromWiki() {
  const input = wikiInput.value.trim();
  if (!input) {
    setStatus("Enter a Wikipedia link or title.");
    return;
  }

  pause();
  setStatus("Fetching article...");

  try {
    const { base, title } = parseWikiInput(input);
    const html = await fetchWikiHtml(base, title);
    state.sourceHtml = html;
    state.sourceTitle = title;

    const text = cleanWikiHtml(html, getOptionsFromUI());
    const words = tokenizeText(text);
    if (!words.length) {
      setStatus("No text after filtering. Try relaxing the filters.");
      setControlsEnabled(Boolean(state.words.length));
      return;
    }

    state.words = words;
    state.index = 0;
    setControlsEnabled(true);
    renderWord();
    setStatus(`Loaded ${words.length} words from "${title}".`);
    applyFiltersBtn.disabled = false;
  } catch (error) {
    setStatus(error?.message || "Could not load the article.");
    setControlsEnabled(Boolean(state.words.length));
  }
}

function applyFiltersFromCache() {
  if (!state.sourceHtml) {
    setStatus("Load an article before applying filters.");
    return;
  }
  pause();
  const text = cleanWikiHtml(state.sourceHtml, getOptionsFromUI());
  const words = tokenizeText(text);
  if (!words.length) {
    setStatus("No text after filtering. Try relaxing the filters.");
    return;
  }
  state.words = words;
  state.index = 0;
  setControlsEnabled(true);
  renderWord();
  setStatus(`Rebuilt ${words.length} words from "${state.sourceTitle}".`);
}

function handleKeyControls(event) {
  const tag = document.activeElement?.tagName || "";
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) {
    return;
  }

  if (event.key === " ") {
    event.preventDefault();
    togglePlay();
  } else if (event.key === "ArrowRight") {
    nextWord();
  } else if (event.key === "ArrowLeft") {
    prevWord();
  } else if (event.key === "Home") {
    restart();
  }
}

function init() {
  setControlsEnabled(false);
  applyFiltersBtn.disabled = true;
  applyPreset(presetSelect.value);
  setWpm(state.wpm);
  syncTextSizeFromLayout();
  setPlaceholder();
  wpmSlider.addEventListener("input", (event) => {
    setWpm(Number(event.target.value));
  });
  textSizeSlider.addEventListener("input", (event) => {
    setTextSize(Number(event.target.value), true);
  });

  wikiForm.addEventListener("submit", (event) => {
    event.preventDefault();
    loadFromWiki();
  });

  applyFiltersBtn.addEventListener("click", applyFiltersFromCache);
  playBtn.addEventListener("click", togglePlay);
  prevBtn.addEventListener("click", prevWord);
  nextBtn.addEventListener("click", nextWord);
  restartBtn.addEventListener("click", restart);

  presetSelect.addEventListener("change", (event) => {
    applyPreset(event.target.value);
  });

  window.addEventListener("resize", () => {
    if (state.words.length) {
      renderWord();
    } else {
      setPlaceholder();
    }
    syncTextSizeFromLayout();
  });

  document.addEventListener("keydown", handleKeyControls);

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      if (state.words.length) {
        renderWord();
      } else {
        setPlaceholder();
      }
    });
  }
}

init();
