(() => {
  "use strict";

  const WORKER_TIMEOUT_MS = 300;
  const DEFAULT_PATTERN = "(?<word>[\\p{L}\\p{N}_]+)";
  const DEFAULT_SAMPLE = "Build 42 patterns\n砌 42 個規則";
  const FLAG_ORDER = ["d", "g", "i", "m", "s", "u", "v", "y"];
  const LANGUAGE_STORAGE_KEY = "worldlens-regex-language";
  const LEGACY_LANGUAGE_STORAGE_KEY = "material-bluemap-regex-language";
  const SUPPORTED_LANGUAGES = new Set(["en", "yue", "bilingual"]);

  const translations = {
    en: {
      documentTitle: "Regex Builder · Worldlens",
      skipLink: "Skip to builder",
      homeLabel: "Worldlens home",
      primaryNav: "Primary navigation",
      home: "Home",
      contract: "Feature contract",
      repository: "Repository",
      eyebrow: "EVERY-PROJECT REFERENCE",
      title: "Build the pattern. See the truth.",
      lede: "Guided construction and raw control for JavaScript regular expressions, evaluated only in your browser.",
      engineDetails: "Engine details",
      workerBounded: "300 ms worker limit",
      localOnly: "Local only",
      languageLabel: "Language mode",
      workspaceLabel: "Regex builder workspace",
      patternHeading: "Compose",
      patternHelp: "Insert a construct or edit the pattern directly.",
      patternLabel: "Pattern",
      patternLimit: "Maximum 2,000 characters.",
      flagsLegend: "Flags",
      flagIndices: "indices",
      flagGlobal: "global",
      flagIgnoreCase: "ignore case",
      flagMultiline: "multiline",
      flagDotAll: "dot all",
      flagUnicode: "Unicode",
      flagUnicodeSets: "Unicode sets",
      flagSticky: "sticky",
      guidedHeading: "Guided constructs",
      guidedHint: "Inserted at the cursor",
      tokenLiteral: "Literal",
      tokenAny: "Any",
      tokenDigit: "Digit",
      tokenWord: "Word",
      tokenSpace: "Space",
      tokenClass: "Class",
      tokenNegated: "Not class",
      tokenStart: "Start",
      tokenEnd: "End",
      tokenCapture: "Capture",
      tokenNamed: "Named",
      tokenOr: "Or",
      tokenZeroMore: "0 or more",
      tokenOneMore: "1 or more",
      tokenOptional: "Optional",
      tokenRange: "Range",
      sampleHeading: "Test",
      sampleHelp: "Use realistic text. It never leaves this page.",
      sampleLabel: "Sample text",
      sampleLimit: "Maximum 20,000 characters.",
      copyButton: "Copy /pattern/flags",
      resetButton: "Reset example",
      resultHeading: "Inspect",
      evaluating: "Evaluating safely…",
      previewHeading: "Match preview",
      previewHint: "Zero-width matches use a cyan marker.",
      highlightLabel: "Highlighted sample text",
      matchesHeading: "Matches and captures",
      matchLimit: "First 500 matches",
      safetyHeading: "Your text stays put.",
      safetyCopy: "Evaluation runs in a disposable browser worker that is stopped after 300 ms. Patterns and samples are never stored; only your language choice is remembered.",
      dialectTerm: "Dialect",
      limitsTerm: "Limits",
      limitsValue: "2,000 pattern · 20,000 sample · 500 matches",
      storageTerm: "Storage",
      storageValue: "Language mode only",
      footerLine: "Local, bounded, inspectable.",
      footerNav: "Footer navigation",
      features: "Features",
      backTop: "Back to top",
      foundOne: "1 match found.",
      foundMany: "{count} matches found.",
      truncatedStatus: "Showing the first {count} matches; the result was truncated.",
      noMatches: "No matches. Try changing the pattern, flags, or sample.",
      invalidPattern: "The pattern could not be evaluated.",
      timeout: "Evaluation stopped after 300 ms. Simplify the pattern to avoid catastrophic backtracking.",
      workerUnavailable: "The isolated evaluator could not start. Serve this page over HTTP and try again.",
      copied: "Copied",
      copyFailed: "Copy failed",
      matchAt: "index {start}–{end}",
      capturesLabel: "Captures",
      numberedCapture: "Group {number}",
      namedCapture: "Named {name}",
      emptyValue: "empty",
      zeroWidthTitle: "Zero-width match at index {index}",
    },
    yue: {
      documentTitle: "Regex 砌式器 · Worldlens",
      skipLink: "跳去砌式器",
      homeLabel: "返 Worldlens 主頁",
      primaryNav: "主導覽",
      home: "主頁",
      contract: "功能規格",
      repository: "程式庫",
      eyebrow: "個個 PROJECT 都要有",
      title: "砌好條式，即場睇真章。",
      lede: "有引導、有原碼，自家瀏覽器即時計 JavaScript regex，唔使交資料出去。",
      engineDetails: "引擎資料",
      workerBounded: "Worker 最多 300 ms",
      localOnly: "只喺本機",
      languageLabel: "語言模式",
      workspaceLabel: "Regex 砌式工作區",
      patternHeading: "砌式",
      patternHelp: "撳一個元件插入，或者直接改條式。",
      patternLabel: "Regex 規則",
      patternLimit: "最多 2,000 個字元。",
      flagsLegend: "旗標",
      flagIndices: "索引",
      flagGlobal: "搵晒全部",
      flagIgnoreCase: "唔理大小寫",
      flagMultiline: "多行",
      flagDotAll: "點號包換行",
      flagUnicode: "Unicode",
      flagUnicodeSets: "Unicode 字元集",
      flagSticky: "黐實位置",
      guidedHeading: "引導元件",
      guidedHint: "插落游標位置",
      tokenLiteral: "原字",
      tokenAny: "任何字",
      tokenDigit: "數字",
      tokenWord: "字元",
      tokenSpace: "空白",
      tokenClass: "字元組",
      tokenNegated: "排除組",
      tokenStart: "開頭",
      tokenEnd: "結尾",
      tokenCapture: "擷取組",
      tokenNamed: "命名組",
      tokenOr: "或者",
      tokenZeroMore: "零次以上",
      tokenOneMore: "一次以上",
      tokenOptional: "可有可無",
      tokenRange: "次數範圍",
      sampleHeading: "試跑",
      sampleHelp: "擺真實文字入嚟；內容唔會離開呢頁。",
      sampleLabel: "測試文字",
      sampleLimit: "最多 20,000 個字元。",
      copyButton: "複製 /規則/旗標",
      resetButton: "還原例子",
      resultHeading: "睇結果",
      evaluating: "安全運算中…",
      previewHeading: "命中預覽",
      previewHint: "零闊度命中會用青色直線標示。",
      highlightLabel: "已標示命中嘅測試文字",
      matchesHeading: "命中同擷取組",
      matchLimit: "頭 500 個命中",
      safetyHeading: "你啲文字，原地不動。",
      safetyCopy: "運算會放入即用即棄嘅瀏覽器 worker，300 ms 就會截停。規則同測試文字一概唔儲，只會記住你揀嘅語言。",
      dialectTerm: "語法",
      limitsTerm: "上限",
      limitsValue: "規則 2,000 · 文字 20,000 · 命中 500",
      storageTerm: "儲存",
      storageValue: "只記語言模式",
      footerLine: "本機處理、有界限、睇得明。",
      footerNav: "頁尾導覽",
      features: "功能",
      backTop: "返頁頂",
      foundOne: "搵到 1 個命中。",
      foundMany: "搵到 {count} 個命中。",
      truncatedStatus: "只顯示頭 {count} 個命中；其餘已截短。",
      noMatches: "暫時零命中。試吓改規則、旗標或者測試文字。",
      invalidPattern: "呢條規則運算唔到。",
      timeout: "運算到 300 ms 已截停。請簡化規則，避免災難性回溯。",
      workerUnavailable: "開唔到隔離運算器。請用 HTTP 提供呢頁，再試一次。",
      copied: "複製咗",
      copyFailed: "複製失敗",
      matchAt: "位置 {start}–{end}",
      capturesLabel: "擷取組",
      numberedCapture: "第 {number} 組",
      namedCapture: "命名 {name}",
      emptyValue: "空值",
      zeroWidthTitle: "位置 {index} 嘅零闊度命中",
    },
  };

  const tokenSpecs = {
    literal: { text: "literal", selectStart: 0, selectLength: 7 },
    any: { text: "." },
    digit: { text: "\\d" },
    word: { text: "\\w" },
    space: { text: "\\s" },
    class: { text: "[abc]", selectStart: 1, selectLength: 3 },
    negatedClass: { text: "[^abc]", selectStart: 2, selectLength: 3 },
    start: { text: "^" },
    end: { text: "$" },
    capture: { wrap: true, prefix: "(", suffix: ")", placeholder: "pattern" },
    named: { named: true },
    alternation: { alternation: true },
    zeroMore: { text: "*" },
    oneMore: { text: "+" },
    optional: { text: "?" },
    range: { text: "{1,3}", selectStart: 1, selectLength: 3 },
  };

  const patternInput = document.getElementById("pattern");
  const sampleInput = document.getElementById("sample");
  const statusElement = document.getElementById("status");
  const errorPanel = document.getElementById("error-panel");
  const resultCount = document.getElementById("result-count");
  const highlightOutput = document.getElementById("highlight-output");
  const matchList = document.getElementById("match-list");
  const languageSelect = document.getElementById("language-mode");
  const copyButton = document.getElementById("copy-regex");
  const resetButton = document.getElementById("reset-builder");
  const flagInputs = Array.from(document.querySelectorAll('input[name="flag"]'));

  let activeLanguage = readLanguagePreference();
  let activeWorker = null;
  let activeTimer = null;
  let debounceTimer = null;
  let requestSequence = 0;

  function readLanguagePreference() {
    try {
      const current = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (SUPPORTED_LANGUAGES.has(current)) return current;
      const legacy = window.localStorage.getItem(LEGACY_LANGUAGE_STORAGE_KEY);
      if (SUPPORTED_LANGUAGES.has(legacy)) {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, legacy);
        return legacy;
      }
      return "en";
    } catch {
      return "en";
    }
  }

  function interpolate(template, values = {}) {
    return Object.entries(values).reduce(
      (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
      template,
    );
  }

  function phrase(key, values = {}) {
    const english = interpolate(translations.en[key] || key, values);
    if (activeLanguage === "en") {
      return english;
    }

    const cantonese = interpolate(translations.yue[key] || translations.en[key] || key, values);
    return activeLanguage === "yue" ? cantonese : `${english} / ${cantonese}`;
  }

  function applyLanguage(mode) {
    activeLanguage = SUPPORTED_LANGUAGES.has(mode) ? mode : "en";
    document.documentElement.lang = activeLanguage === "yue" ? "zh-HK" : "en";
    document.documentElement.dataset.language = activeLanguage;
    document.title = phrase("documentTitle");

    document.querySelectorAll("[data-i18n]").forEach((element) => {
      element.textContent = phrase(element.dataset.i18n);
    });
    document.querySelectorAll("[data-i18n-aria]").forEach((element) => {
      element.setAttribute("aria-label", phrase(element.dataset.i18nAria));
    });

    languageSelect.value = activeLanguage;
    languageSelect.options[0].textContent = activeLanguage === "bilingual" ? "English / 英文" : "English";
    languageSelect.options[1].textContent = activeLanguage === "bilingual" ? "Cantonese / 廣東話" : "廣東話";
    languageSelect.options[2].textContent = "English + 廣東話";
  }

  function setStatus(key, state, values = {}) {
    const dot = document.createElement("span");
    dot.className = "status-dot";
    dot.setAttribute("aria-hidden", "true");
    const message = document.createElement("span");
    message.textContent = phrase(key, values);
    statusElement.replaceChildren(dot, message);
    statusElement.dataset.state = state;
  }

  function setError(message) {
    errorPanel.textContent = message;
    errorPanel.hidden = false;
  }

  function clearError() {
    errorPanel.textContent = "";
    errorPanel.hidden = true;
  }

  function selectedFlags() {
    return FLAG_ORDER.filter((flag) => flagInputs.some((input) => input.value === flag && input.checked)).join("");
  }

  function stopWorker() {
    if (activeTimer !== null) {
      window.clearTimeout(activeTimer);
      activeTimer = null;
    }
    if (activeWorker !== null) {
      activeWorker.terminate();
      activeWorker = null;
    }
  }

  function scheduleEvaluation(delay = 120) {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(evaluate, delay);
  }

  function evaluate() {
    stopWorker();
    clearError();
    setStatus("evaluating", "working");
    resultCount.textContent = "…";

    const id = ++requestSequence;
    let worker;
    try {
      worker = new Worker("./regex-worker.js");
    } catch (error) {
      setStatus("workerUnavailable", "error");
      setError(`${phrase("workerUnavailable")} ${error instanceof Error ? error.message : ""}`.trim());
      return;
    }

    activeWorker = worker;
    activeTimer = window.setTimeout(() => {
      if (id !== requestSequence) {
        return;
      }
      stopWorker();
      setStatus("timeout", "error");
      setError(phrase("timeout"));
      resultCount.textContent = "0";
      renderPreview(sampleInput.value, []);
      renderMatchList([]);
    }, WORKER_TIMEOUT_MS);

    worker.addEventListener("message", (event) => {
      if (event.data.id !== id || id !== requestSequence) {
        return;
      }
      stopWorker();

      if (!event.data.ok) {
        setStatus("invalidPattern", "error");
        setError(`${phrase("invalidPattern")} ${event.data.error}`);
        resultCount.textContent = "0";
        renderPreview(sampleInput.value, []);
        renderMatchList([]);
        return;
      }

      renderResult(event.data.result);
    });

    worker.addEventListener("error", (event) => {
      if (id !== requestSequence) {
        return;
      }
      stopWorker();
      setStatus("workerUnavailable", "error");
      setError(`${phrase("workerUnavailable")} ${event.message || ""}`.trim());
      resultCount.textContent = "0";
      renderPreview(sampleInput.value, []);
      renderMatchList([]);
    });

    worker.postMessage({
      id,
      pattern: patternInput.value,
      flags: selectedFlags(),
      sample: sampleInput.value,
    });
  }

  function renderResult(result) {
    clearError();
    const count = result.matches.length;
    resultCount.textContent = String(count);

    if (result.truncated) {
      setStatus("truncatedStatus", "success", { count });
    } else if (count === 0) {
      setStatus("noMatches", "success");
    } else if (count === 1) {
      setStatus("foundOne", "success");
    } else {
      setStatus("foundMany", "success", { count });
    }

    renderPreview(sampleInput.value, result.matches);
    renderMatchList(result.matches);
  }

  function renderPreview(sample, matches) {
    const fragment = document.createDocumentFragment();
    let cursor = 0;

    matches.forEach((match) => {
      if (match.index < cursor || match.end > sample.length) {
        return;
      }

      fragment.append(document.createTextNode(sample.slice(cursor, match.index)));
      if (match.index === match.end) {
        const marker = document.createElement("span");
        marker.className = "zero-marker";
        marker.textContent = "│";
        marker.title = phrase("zeroWidthTitle", { index: match.index });
        fragment.append(marker);
      } else {
        const highlight = document.createElement("mark");
        highlight.textContent = sample.slice(match.index, match.end);
        fragment.append(highlight);
      }
      cursor = match.end;
    });

    fragment.append(document.createTextNode(sample.slice(cursor)));
    highlightOutput.replaceChildren(fragment);
  }

  function printableValue(value) {
    if (value === null || value === undefined || value === "") {
      return phrase("emptyValue");
    }
    return JSON.stringify(value);
  }

  function renderMatchList(matches) {
    matchList.replaceChildren();
    if (matches.length === 0) {
      const empty = document.createElement("li");
      empty.className = "empty-result";
      empty.textContent = phrase("noMatches");
      matchList.append(empty);
      return;
    }

    matches.forEach((match, index) => {
      const item = document.createElement("li");
      const summary = document.createElement("div");
      summary.className = "match-summary";
      const value = document.createElement("code");
      value.textContent = `#${index + 1} ${printableValue(match.value)}`;
      const location = document.createElement("span");
      location.textContent = phrase("matchAt", { start: match.index, end: match.end });
      summary.append(value, location);
      item.append(summary);

      const namedEntries = Object.entries(match.namedGroups || {});
      if (match.captures.length > 0 || namedEntries.length > 0) {
        const details = document.createElement("details");
        const detailsSummary = document.createElement("summary");
        detailsSummary.textContent = phrase("capturesLabel");
        const captures = document.createElement("ul");
        captures.className = "capture-list";

        match.captures.forEach((capture, captureIndex) => {
          const captureItem = document.createElement("li");
          const label = document.createElement("span");
          label.textContent = `${phrase("numberedCapture", { number: captureIndex + 1 })}: `;
          const captureValue = document.createElement("code");
          captureValue.textContent = printableValue(capture);
          captureItem.append(label, captureValue);
          captures.append(captureItem);
        });

        namedEntries.forEach(([name, capture]) => {
          const captureItem = document.createElement("li");
          const label = document.createElement("span");
          label.textContent = `${phrase("namedCapture", { name })}: `;
          const captureValue = document.createElement("code");
          captureValue.textContent = printableValue(capture);
          captureItem.append(label, captureValue);
          captures.append(captureItem);
        });

        details.append(detailsSummary, captures);
        item.append(details);
      }

      matchList.append(item);
    });
  }

  function insertToken(name) {
    const spec = tokenSpecs[name];
    if (!spec) {
      return;
    }

    const start = patternInput.selectionStart ?? patternInput.value.length;
    const end = patternInput.selectionEnd ?? start;
    const selected = patternInput.value.slice(start, end);
    let insertion;
    let selectionStart;
    let selectionEnd;

    if (spec.wrap) {
      const content = selected || spec.placeholder;
      insertion = `${spec.prefix}${content}${spec.suffix}`;
      selectionStart = start + spec.prefix.length;
      selectionEnd = selectionStart + content.length;
    } else if (spec.named) {
      const content = selected || "pattern";
      insertion = `(?<name>${content})`;
      selectionStart = start + 3;
      selectionEnd = selectionStart + 4;
    } else if (spec.alternation) {
      insertion = `${selected || "left"}|right`;
      selectionStart = start;
      selectionEnd = start + (selected || "left").length;
    } else {
      insertion = spec.text;
      selectionStart = start + (spec.selectStart ?? insertion.length);
      selectionEnd = selectionStart + (spec.selectLength ?? 0);
    }

    patternInput.setRangeText(insertion, start, end, "end");
    patternInput.focus();
    patternInput.setSelectionRange(selectionStart, selectionEnd);
    scheduleEvaluation();
  }

  async function copyRegex() {
    let exportValue;
    try {
      const expression = new RegExp(patternInput.value, selectedFlags());
      exportValue = `/${expression.source}/${expression.flags}`;
    } catch (error) {
      setStatus("invalidPattern", "error");
      setError(`${phrase("invalidPattern")} ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    let copied = false;

    try {
      await navigator.clipboard.writeText(exportValue);
      copied = true;
    } catch {
      const helper = document.createElement("textarea");
      helper.value = exportValue;
      helper.setAttribute("readonly", "");
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.append(helper);
      helper.select();
      copied = document.execCommand("copy");
      helper.remove();
    }

    copyButton.textContent = phrase(copied ? "copied" : "copyFailed");
    window.setTimeout(() => {
      copyButton.textContent = phrase("copyButton");
    }, 1400);
  }

  function resetBuilder() {
    patternInput.value = DEFAULT_PATTERN;
    sampleInput.value = DEFAULT_SAMPLE;
    flagInputs.forEach((input) => {
      input.checked = input.value === "g" || input.value === "u";
    });
    scheduleEvaluation(0);
    patternInput.focus();
  }

  patternInput.addEventListener("input", () => scheduleEvaluation());
  sampleInput.addEventListener("input", () => scheduleEvaluation());
  flagInputs.forEach((input) => input.addEventListener("change", () => {
    if (input.checked && (input.value === "u" || input.value === "v")) {
      const incompatibleFlag = input.value === "u" ? "v" : "u";
      const incompatibleInput = flagInputs.find((candidate) => candidate.value === incompatibleFlag);
      if (incompatibleInput) {
        incompatibleInput.checked = false;
      }
    }
    scheduleEvaluation();
  }));
  document.getElementById("token-grid").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-insert]");
    if (button) {
      insertToken(button.dataset.insert);
    }
  });
  copyButton.addEventListener("click", copyRegex);
  resetButton.addEventListener("click", resetBuilder);
  languageSelect.addEventListener("change", () => {
    applyLanguage(languageSelect.value);
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, activeLanguage);
    } catch {
      // Language persistence is optional when browser storage is unavailable.
    }
    scheduleEvaluation(0);
  });
  window.addEventListener("pagehide", stopWorker);

  applyLanguage(activeLanguage);
  scheduleEvaluation(0);
})();
