// ==UserScript==
// @name         Missevan Subtitle Styler
// @namespace    https://www.missevan.com/
// @version      0.1.7
// @updateURL    https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/missevan-subtitle-styler.user.js
// @downloadURL  https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/missevan-subtitle-styler.user.js
// @description  Adds readable, customizable subtitle styling controls to Missevan sound player pages.
// @author       CaoCao
// @match        https://www.missevan.com/sound/player*
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(() => {
  "use strict";

  const STORAGE_KEY = "missevan-subtitle-styler-settings";
  const ROOT_CLASS = "missevan-subtitle-styler-root";
  const PANEL_ID = "missevan-subtitle-styler-panel";
  const LAUNCHER_ID = "missevan-subtitle-styler-launcher";
  const ENHANCED_CLASS = "missevan-subtitle-styler-enhanced";
  const COLOR_OVERRIDE_CLASS = "missevan-subtitle-styler-color-override";
  const HIDDEN_CLASS = "missevan-subtitle-styler-hidden";
  const ROUTE_CHECK_INTERVAL_MS = 800;
  const REBIND_DELAY_MS = 80;
  const FONT_FALLBACK = "sans-serif";
  const MAX_FONT_FAMILY_LENGTH = 240;
  const FONT_HELPER_SCRIPT_ID = "missevan-subtitle-styler-font-helper";
  const FONT_HELPER_REQUEST_EVENT = "missevan-subtitle-styler-font-request";
  const FONT_HELPER_RESPONSE_EVENT = "missevan-subtitle-styler-font-response";
  const FONT_HELPER_TIMEOUT_MS = 15000;

  const FONT_OPTIONS = [
    {
      label: "System sans",
      value: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    },
    {
      label: "Missevan default",
      value: 'SimHei, "Microsoft JhengHei", Arial, Helvetica, sans-serif',
    },
    {
      label: "Microsoft YaHei",
      value: '"Microsoft YaHei", "PingFang SC", sans-serif',
    },
    {
      label: "PingFang SC",
      value: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
    },
    {
      label: "Serif",
      value: 'Georgia, "Times New Roman", "Songti SC", SimSun, serif',
    },
  ];

  const SHADOWS = {
    none: "none",
    soft: "0 1px 2px rgba(0, 0, 0, 0.75), 0 0 5px rgba(0, 0, 0, 0.45)",
    strong: "0 1px 2px rgba(0, 0, 0, 0.95), 0 0 7px rgba(0, 0, 0, 0.78), 0 0 14px rgba(0, 0, 0, 0.5)",
  };

  const DEFAULT_SETTINGS = {
    fontFamily: FONT_OPTIONS[0].value,
    fontSize: 30,
    fontWeight: 700,
    lineHeight: 1.28,
    verticalPosition: 74,
    backgroundOpacity: 0.62,
    shadowStrength: "strong",
    useRoleColors: true,
    textColor: "#ffffff",
  };

  const css = `
    :root.${ROOT_CLASS} {
      --mss-font-family: ${DEFAULT_SETTINGS.fontFamily};
      --mss-font-size: ${DEFAULT_SETTINGS.fontSize}px;
      --mss-font-weight: ${DEFAULT_SETTINGS.fontWeight};
      --mss-line-height: ${DEFAULT_SETTINGS.lineHeight};
      --mss-bottom: ${DEFAULT_SETTINGS.verticalPosition}px;
      --mss-background-opacity: ${DEFAULT_SETTINGS.backgroundOpacity};
      --mss-text-color: ${DEFAULT_SETTINGS.textColor};
      --mss-text-shadow: ${SHADOWS[DEFAULT_SETTINGS.shadowStrength]};
    }

    .subtitle-container.${ENHANCED_CLASS} {
      inset: auto 20px var(--mss-bottom) 20px !important;
      box-sizing: border-box !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: flex-end !important;
      width: auto !important;
      height: auto !important;
      min-height: 0 !important;
      max-height: calc(100% - 48px) !important;
      overflow: visible !important;
      padding: 0 !important;
      pointer-events: none !important;
      color: var(--mss-text-color) !important;
      font-family: var(--mss-font-family) !important;
      font-size: var(--mss-font-size) !important;
      line-height: var(--mss-line-height) !important;
      text-align: center !important;
      z-index: 2147483600 !important;
    }

    .subtitle-container.${ENHANCED_CLASS} > span {
      box-sizing: border-box !important;
      display: block !important;
      width: fit-content !important;
      max-width: min(100%, 1120px) !important;
      margin: 0 0 6px !important;
      padding: 5px 12px 6px !important;
      overflow-wrap: anywhere !important;
      border-radius: 7px !important;
      background: rgba(0, 0, 0, var(--mss-background-opacity)) !important;
      font-family: var(--mss-font-family) !important;
      font-size: var(--mss-font-size) !important;
      font-weight: var(--mss-font-weight) !important;
      line-height: var(--mss-line-height) !important;
      letter-spacing: 0 !important;
      text-align: center !important;
      text-shadow: var(--mss-text-shadow) !important;
      user-select: text !important;
      -webkit-user-select: text !important;
      white-space: normal !important;
      cursor: text !important;
      pointer-events: auto !important;
    }

    .subtitle-container.${ENHANCED_CLASS}.${COLOR_OVERRIDE_CLASS} > span {
      color: var(--mss-text-color) !important;
    }

    .subtitle-container.${ENHANCED_CLASS}.${HIDDEN_CLASS} {
      display: none !important;
    }

    #${LAUNCHER_ID} {
      position: fixed;
      right: 24px;
      bottom: 78px;
      z-index: 2147483647;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 58px;
      height: 42px;
      padding: 0 14px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 8px;
      color: #f7fbff;
      background: rgba(17, 24, 39, 0.95);
      box-shadow: 0 10px 26px rgba(0, 0, 0, 0.34);
      font: 800 14px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
      cursor: pointer;
      touch-action: manipulation;
    }

    #${LAUNCHER_ID}:hover,
    #${LAUNCHER_ID}[aria-expanded="true"] {
      background: rgba(31, 41, 55, 0.96);
      border-color: rgba(124, 231, 209, 0.48);
    }

    #${PANEL_ID} {
      position: fixed;
      right: 24px;
      bottom: 136px;
      z-index: 2147483647;
      box-sizing: border-box;
      width: min(360px, calc(100vw - 32px));
      max-height: calc(100vh - 106px);
      max-height: calc(100dvh - 106px);
      padding: 16px;
      overflow-y: auto;
      color: #f7fbff;
      background: rgba(17, 24, 39, 0.95);
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 8px;
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.38);
      font: 13px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      backdrop-filter: blur(10px);
    }

    #${PANEL_ID}[hidden] {
      display: none !important;
    }

    #${PANEL_ID} .mss-title {
      margin: 0 0 12px;
      color: #fff;
      font-size: 14px;
      font-weight: 800;
      line-height: 1.2;
    }

    #${PANEL_ID} .mss-grid {
      display: grid;
      gap: 11px;
    }

    #${PANEL_ID} label {
      display: grid;
      gap: 5px;
      margin: 0;
      color: rgba(247, 251, 255, 0.82);
      font-weight: 700;
    }

    #${PANEL_ID} .mss-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 10px;
    }

    #${PANEL_ID} .mss-row output {
      min-width: 52px;
      color: rgba(247, 251, 255, 0.64);
      font-size: 12px;
      text-align: right;
    }

    #${PANEL_ID} .mss-font-control {
      display: grid;
      gap: 7px;
    }

    #${PANEL_ID} .mss-font-actions {
      display: flex;
      align-items: center;
      gap: 9px;
      min-width: 0;
    }

    #${PANEL_ID} .mss-font-status {
      min-width: 0;
      color: rgba(247, 251, 255, 0.64);
      font-size: 12px;
      line-height: 1.3;
    }

    #${PANEL_ID} .mss-font-status[hidden] {
      display: none !important;
    }

    #${PANEL_ID} select,
    #${PANEL_ID} input[type="range"],
    #${PANEL_ID} input[type="color"] {
      width: 100%;
    }

    #${PANEL_ID} select {
      height: 32px;
      padding: 0 8px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 7px;
      color: #fff;
      background: rgba(255, 255, 255, 0.08);
      font: 13px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    #${PANEL_ID} select option {
      color: #111827;
      background: #fff;
    }

    #${PANEL_ID} input[type="range"] {
      accent-color: #7ce7d1;
    }

    #${PANEL_ID} input[type="color"] {
      height: 32px;
      padding: 2px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 7px;
      background: rgba(255, 255, 255, 0.08);
      cursor: pointer;
    }

    #${PANEL_ID} .mss-check {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    #${PANEL_ID} .mss-check input {
      position: static !important;
      display: block !important;
      flex: 0 0 auto;
      width: 18px;
      height: 18px;
      min-width: 18px;
      margin: 0;
      opacity: 1 !important;
      appearance: auto !important;
      -webkit-appearance: checkbox !important;
      accent-color: #7ce7d1;
      cursor: pointer;
    }

    #${PANEL_ID} .mss-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 14px;
    }

    #${PANEL_ID} button {
      height: 30px;
      padding: 0 11px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 7px;
      color: #f7fbff;
      background: rgba(31, 41, 55, 0.9);
      font: 800 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      cursor: pointer;
    }

    #${PANEL_ID} button:hover {
      background: rgba(55, 65, 81, 0.94);
      border-color: rgba(124, 231, 209, 0.42);
    }

    #${PANEL_ID} button.mss-secondary {
      flex: 0 0 auto;
      color: rgba(247, 251, 255, 0.9);
      background: rgba(255, 255, 255, 0.07);
      border-color: rgba(255, 255, 255, 0.18);
    }

    #${PANEL_ID} button.mss-secondary:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.11);
      border-color: rgba(124, 231, 209, 0.38);
    }

    #${PANEL_ID} button:disabled {
      cursor: wait;
      opacity: 0.66;
    }
  `;

  let settings = readSettings();
  let launcher = null;
  let panel = null;
  let subtitleContainer = null;
  let subtitleObserver = null;
  let bodyObserver = null;
  let rebindTimer = 0;
  let isPanelOpen = false;
  let lastHref = window.location.href;
  let menuCommandsInstalled = false;
  let installedFontOptions = [];
  let isLoadingInstalledFonts = false;
  let fontRequestId = 0;

  function readSettings() {
    const rawValue = getStoredValue(STORAGE_KEY, null);
    if (!rawValue) {
      return { ...DEFAULT_SETTINGS };
    }

    try {
      const parsed = typeof rawValue === "string" ? JSON.parse(rawValue) : rawValue;
      return normalizeSettings(parsed);
    } catch (error) {
      console.warn("[Missevan Subtitle Styler] Could not parse saved settings.", error);
      return { ...DEFAULT_SETTINGS };
    }
  }

  function normalizeSettings(value) {
    const next = { ...DEFAULT_SETTINGS, ...(value && typeof value === "object" ? value : {}) };
    next.fontFamily = isSafeFontFamilyValue(next.fontFamily) ? String(next.fontFamily) : DEFAULT_SETTINGS.fontFamily;
    next.fontSize = clampNumber(next.fontSize, 16, 56, DEFAULT_SETTINGS.fontSize);
    next.fontWeight = clampNumber(next.fontWeight, 400, 900, DEFAULT_SETTINGS.fontWeight);
    next.lineHeight = clampNumber(next.lineHeight, 1, 1.8, DEFAULT_SETTINGS.lineHeight);
    next.verticalPosition = clampNumber(next.verticalPosition, 24, 180, DEFAULT_SETTINGS.verticalPosition);
    next.backgroundOpacity = clampNumber(next.backgroundOpacity, 0, 1, DEFAULT_SETTINGS.backgroundOpacity);
    next.shadowStrength = Object.prototype.hasOwnProperty.call(SHADOWS, next.shadowStrength) ? next.shadowStrength : DEFAULT_SETTINGS.shadowStrength;
    next.useRoleColors = Boolean(next.useRoleColors);
    next.textColor = /^#[0-9a-f]{6}$/i.test(String(next.textColor || "")) ? String(next.textColor) : DEFAULT_SETTINGS.textColor;
    return next;
  }

  function getStoredValue(key, fallbackValue) {
    try {
      if (typeof GM_getValue === "function") {
        return GM_getValue(key, fallbackValue);
      }
    } catch (error) {
      console.warn("[Missevan Subtitle Styler]", error);
    }

    try {
      const rawValue = window.localStorage.getItem(key);
      return rawValue == null ? fallbackValue : rawValue;
    } catch {
      return fallbackValue;
    }
  }

  function setStoredValue(key, value) {
    try {
      if (typeof GM_setValue === "function") {
        GM_setValue(key, value);
        return;
      }
    } catch (error) {
      console.warn("[Missevan Subtitle Styler]", error);
    }

    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      console.warn("[Missevan Subtitle Styler]", error);
    }
  }

  function saveSettings() {
    setStoredValue(STORAGE_KEY, JSON.stringify(settings));
  }

  function addStyle() {
    if (typeof GM_addStyle === "function") {
      GM_addStyle(css);
      return;
    }

    const style = document.createElement("style");
    style.textContent = css;
    getMountRoot().appendChild(style);
  }

  function getMountRoot() {
    return document.body || document.documentElement;
  }

  function applySettings() {
    settings = normalizeSettings(settings);
    document.documentElement.classList.add(ROOT_CLASS);
    document.documentElement.style.setProperty("--mss-font-family", settings.fontFamily);
    document.documentElement.style.setProperty("--mss-font-size", `${settings.fontSize}px`);
    document.documentElement.style.setProperty("--mss-font-weight", String(settings.fontWeight));
    document.documentElement.style.setProperty("--mss-line-height", String(settings.lineHeight));
    document.documentElement.style.setProperty("--mss-bottom", `${settings.verticalPosition}px`);
    document.documentElement.style.setProperty("--mss-background-opacity", String(settings.backgroundOpacity));
    document.documentElement.style.setProperty("--mss-text-shadow", SHADOWS[settings.shadowStrength]);
    document.documentElement.style.setProperty("--mss-text-color", settings.textColor);

    if (subtitleContainer) {
      enhanceSubtitleContainer(subtitleContainer);
    }

    syncPanelValues();
  }

  function ensureLauncher() {
    if (launcher && launcher.isConnected) {
      return launcher;
    }

    launcher = document.getElementById(LAUNCHER_ID) || document.createElement("button");
    launcher.id = LAUNCHER_ID;
    launcher.type = "button";
    launcher.textContent = "Subs";
    launcher.title = "Missevan subtitle style settings";
    launcher.setAttribute("aria-label", launcher.title);
    launcher.setAttribute("aria-controls", PANEL_ID);
    launcher.setAttribute("aria-expanded", "false");
    launcher.addEventListener("click", togglePanel);

    if (!launcher.parentElement) {
      getMountRoot().appendChild(launcher);
    }

    return launcher;
  }

  function ensurePanel() {
    if (panel && panel.isConnected) {
      return panel;
    }

    panel = document.getElementById(PANEL_ID) || document.createElement("section");
    panel.id = PANEL_ID;
    panel.setAttribute("aria-label", "Missevan subtitle style settings");
    panel.hidden = !isPanelOpen;
    panel.replaceChildren();
    panel.append(buildPanelContent());

    if (!panel.parentElement) {
      getMountRoot().appendChild(panel);
    }

    return panel;
  }

  function buildPanelContent() {
    const fragment = document.createDocumentFragment();

    const title = document.createElement("div");
    title.className = "mss-title";
    title.textContent = "Subtitle style";
    fragment.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "mss-grid";
    fragment.appendChild(grid);

    grid.appendChild(buildFontFamilyControl());
    grid.appendChild(buildRangeControl("Font size", "fontSize", 16, 56, 1, "px"));
    grid.appendChild(buildRangeControl("Text boldness", "fontWeight", 400, 900, 50, ""));
    grid.appendChild(buildRangeControl("Line height", "lineHeight", 1, 1.8, 0.02, ""));
    grid.appendChild(buildRangeControl("Vertical position", "verticalPosition", 24, 180, 1, "px"));
    grid.appendChild(buildRangeControl("Background opacity", "backgroundOpacity", 0, 1, 0.01, ""));
    grid.appendChild(buildSelectControl("Text shadow", "shadowStrength", [
      { label: "None", value: "none" },
      { label: "Soft", value: "soft" },
      { label: "Strong", value: "strong" },
    ]));
    grid.appendChild(buildCheckboxControl("Use speaker colors", "useRoleColors"));
    grid.appendChild(buildColorControl("Text color override", "textColor"));

    const actions = document.createElement("div");
    actions.className = "mss-actions";

    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.textContent = "Reset";
    resetButton.addEventListener("click", resetSettings);
    actions.appendChild(resetButton);

    fragment.appendChild(actions);
    return fragment;
  }

  function buildFontFamilyControl() {
    const wrapper = document.createElement("div");
    wrapper.className = "mss-font-control";

    const label = document.createElement("label");
    label.textContent = "Font family";

    const select = document.createElement("select");
    select.dataset.settingKey = "fontFamily";
    populateFontFamilySelect(select);
    select.addEventListener("change", () => updateSetting("fontFamily", select.value));

    label.appendChild(select);
    wrapper.appendChild(label);

    const actions = document.createElement("div");
    actions.className = "mss-font-actions";

    const loadButton = document.createElement("button");
    loadButton.type = "button";
    loadButton.className = "mss-secondary";
    loadButton.textContent = "Load installed fonts";
    loadButton.addEventListener("click", () => loadInstalledFonts(loadButton));

    const status = document.createElement("div");
    status.className = "mss-font-status";
    status.dataset.fontStatus = "true";
    status.hidden = true;

    actions.append(loadButton, status);
    wrapper.appendChild(actions);
    return wrapper;
  }

  function buildSelectControl(labelText, key, options) {
    const label = document.createElement("label");
    label.textContent = labelText;

    const select = document.createElement("select");
    select.dataset.settingKey = key;

    for (const option of options) {
      const element = document.createElement("option");
      element.value = option.value;
      element.textContent = option.label;
      select.appendChild(element);
    }

    select.addEventListener("change", () => updateSetting(key, select.value));
    label.appendChild(select);
    return label;
  }

  function populateFontFamilySelect(select) {
    const previousValue = select.value || settings.fontFamily;
    select.replaceChildren();

    const options = getFontFamilyOptions(previousValue);
    for (const option of options) {
      const element = document.createElement("option");
      element.value = option.value;
      element.textContent = option.label;
      select.appendChild(element);
    }

    select.value = previousValue;
  }

  function getFontFamilyOptions(currentValue = settings.fontFamily) {
    const options = dedupeFontOptions([...FONT_OPTIONS, ...installedFontOptions]);
    if (isSafeFontFamilyValue(currentValue) && !options.some((option) => option.value === currentValue)) {
      options.push({
        label: `Selected: ${getFontFamilyLabel(currentValue)}`,
        value: currentValue,
      });
    }

    return options;
  }

  function dedupeFontOptions(options) {
    const seen = new Set();
    const deduped = [];

    for (const option of options) {
      if (!option || !isSafeFontFamilyValue(option.value) || seen.has(option.value)) {
        continue;
      }

      seen.add(option.value);
      deduped.push(option);
    }

    return deduped;
  }

  async function loadInstalledFonts(button) {
    if (isLoadingInstalledFonts) {
      return;
    }

    isLoadingInstalledFonts = true;
    if (button) {
      button.disabled = true;
    }
    setFontStatus("Requesting font access...");

    try {
      const result = await requestInstalledFonts();
      if (!result.ok) {
        setFontStatus(getFontLoadErrorMessage(result));
        return;
      }

      applyInstalledFontFamilies(result.families);
    } catch (error) {
      console.warn("[Missevan Subtitle Styler] Could not load installed fonts.", error);
      setFontStatus(isPermissionError(error) ? "Font access was denied." : getUnexpectedFontLoadMessage(error));
    } finally {
      isLoadingInstalledFonts = false;
      if (button) {
        button.disabled = false;
      }
    }
  }

  async function requestInstalledFonts() {
    installFontHelper();

    const helperResult = await requestInstalledFontsFromHelper();
    if (helperResult.ok || !helperResult.helperUnavailable) {
      return helperResult;
    }

    const fallbackResult = await requestInstalledFontsDirectly();
    if (!fallbackResult.ok) {
      console.warn("[Missevan Subtitle Styler] Page font helper unavailable; direct fallback also failed.", fallbackResult);
      return {
        ...fallbackResult,
        helperUnavailable: true,
      };
    }

    return fallbackResult;
  }

  function installFontHelper() {
    if (document.getElementById(FONT_HELPER_SCRIPT_ID)) {
      return;
    }

    const script = document.createElement("script");
    script.id = FONT_HELPER_SCRIPT_ID;
    script.textContent = `(() => {
      const requestEvent = ${JSON.stringify(FONT_HELPER_REQUEST_EVENT)};
      const responseEvent = ${JSON.stringify(FONT_HELPER_RESPONSE_EVENT)};
      if (window.__missevanSubtitleStylerFontHelperInstalled) {
        return;
      }
      window.__missevanSubtitleStylerFontHelperInstalled = true;

      function send(payload) {
        window.dispatchEvent(new CustomEvent(responseEvent, {
          detail: JSON.stringify(payload),
        }));
      }

      window.addEventListener(requestEvent, async (event) => {
        let id = "";
        try {
          const payload = JSON.parse(typeof event.detail === "string" ? event.detail : "{}");
          id = String(payload.id || "");
          if (typeof window.queryLocalFonts !== "function") {
            send({
              id,
              ok: false,
              name: "NotSupportedError",
              message: "queryLocalFonts is not available.",
            });
            return;
          }

          const fonts = await window.queryLocalFonts();
          send({
            id,
            ok: true,
            families: fonts.map((font) => font && font.family).filter(Boolean),
          });
        } catch (error) {
          send({
            id,
            ok: false,
            name: String(error && error.name || "Error"),
            message: String(error && error.message || error || "Unknown error"),
          });
        }
      });
    })();`;

    (document.head || document.documentElement).appendChild(script);
    script.remove();
  }

  function requestInstalledFontsFromHelper() {
    const id = String(++fontRequestId);

    return new Promise((resolve) => {
      let settled = false;
      const timer = window.setTimeout(() => {
        settle({
          ok: false,
          helperUnavailable: true,
          name: "TimeoutError",
          message: "The page font helper did not respond.",
        });
      }, FONT_HELPER_TIMEOUT_MS);

      function settle(result) {
        if (settled) {
          return;
        }

        settled = true;
        window.clearTimeout(timer);
        window.removeEventListener(FONT_HELPER_RESPONSE_EVENT, onResponse);
        resolve(result);
      }

      function onResponse(event) {
        let payload = null;
        try {
          payload = JSON.parse(typeof event.detail === "string" ? event.detail : "{}");
        } catch (error) {
          console.warn("[Missevan Subtitle Styler] Could not parse font helper response.", error);
          return;
        }

        if (String(payload.id || "") !== id) {
          return;
        }

        settle({
          ok: Boolean(payload.ok),
          families: Array.isArray(payload.families) ? payload.families : [],
          name: String(payload.name || ""),
          message: String(payload.message || ""),
        });
      }

      window.addEventListener(FONT_HELPER_RESPONSE_EVENT, onResponse);
      window.dispatchEvent(new CustomEvent(FONT_HELPER_REQUEST_EVENT, {
        detail: JSON.stringify({ id }),
      }));
    });
  }

  async function requestInstalledFontsDirectly() {
    if (typeof window.queryLocalFonts !== "function") {
      return {
        ok: false,
        name: "NotSupportedError",
        message: "queryLocalFonts is not available.",
      };
    }

    try {
      const fonts = await window.queryLocalFonts();
      return {
        ok: true,
        families: fonts.map((font) => font && font.family).filter(Boolean),
      };
    } catch (error) {
      return {
        ok: false,
        name: String(error?.name || "Error"),
        message: String(error?.message || error || "Unknown error"),
      };
    }
  }

  function applyInstalledFontFamilies(rawFamilies) {
    const families = Array.from(new Set(rawFamilies
      .map(normalizeFontFamilyName)
      .filter(Boolean)))
      .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));

    installedFontOptions = families.map((family) => ({
      label: family,
      value: buildLocalFontFamilyValue(family),
    }));

    refreshFontFamilySelects();
    setFontStatus(families.length ? `Loaded ${families.length} installed font families.` : "No installed fonts found.");
  }

  function getFontLoadErrorMessage(result) {
    if (result?.helperUnavailable) {
      return "Could not reach the page font helper.";
    }

    if (isUnsupportedFontError(result)) {
      return "Installed font loading is not supported in this browser.";
    }

    if (isActivationError(result)) {
      return "Could not open the font permission prompt. Try clicking the button again.";
    }

    if (isPermissionError(result)) {
      return "Font access was denied.";
    }

    return getUnexpectedFontLoadMessage(result);
  }

  function getUnexpectedFontLoadMessage(error) {
    const name = String(error?.name || "").trim();
    const message = String(error?.message || "").trim();
    console.warn("[Missevan Subtitle Styler] Installed font loading failed.", { name, message });

    if (name || message) {
      return `Could not load installed fonts (${name || message}).`;
    }

    return "Could not load installed fonts.";
  }

  function refreshFontFamilySelects() {
    if (!panel) {
      return;
    }

    for (const select of panel.querySelectorAll('select[data-setting-key="fontFamily"]')) {
      populateFontFamilySelect(select);
    }

    syncPanelValues();
  }

  function setFontStatus(message) {
    if (!panel) {
      return;
    }

    for (const status of panel.querySelectorAll("[data-font-status]")) {
      status.textContent = message;
      status.hidden = !message;
    }
  }

  function buildLocalFontFamilyValue(family) {
    return `${quoteCssString(family)}, ${FONT_FALLBACK}`;
  }

  function quoteCssString(value) {
    return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }

  function normalizeFontFamilyName(value) {
    const family = String(value || "").replace(/\s+/g, " ").trim();
    if (!family || family.length > 120 || /[\u0000-\u001f\u007f{};<>]/.test(family) || /url\s*\(/i.test(family)) {
      return "";
    }

    return family;
  }

  function isSafeFontFamilyValue(value) {
    const text = String(value || "").trim();
    return Boolean(text)
      && text.length <= MAX_FONT_FAMILY_LENGTH
      && !/[\u0000-\u001f\u007f{};<>]/.test(text)
      && !/\b(?:url|expression)\s*\(/i.test(text);
  }

  function getFontFamilyLabel(value) {
    const preset = [...FONT_OPTIONS, ...installedFontOptions].find((option) => option.value === value);
    if (preset) {
      return preset.label;
    }

    const firstFamily = String(value || "").split(",")[0].trim();
    return firstFamily.replace(/^"|"$/g, "").replace(/\\"/g, '"') || "Installed font";
  }

  function isPermissionError(error) {
    return /permission|denied|notallowed|security/i.test(String(error?.name || error?.message || error));
  }

  function isActivationError(error) {
    return /activation|gesture/i.test(String(error?.name || error?.message || error));
  }

  function isUnsupportedFontError(error) {
    return /notsupported|not supported|unavailable|querylocalfonts is not available/i.test(String(error?.name || error?.message || error));
  }

  function buildRangeControl(labelText, key, min, max, step, unit) {
    const label = document.createElement("label");

    const row = document.createElement("div");
    row.className = "mss-row";

    const text = document.createElement("span");
    text.textContent = labelText;

    const output = document.createElement("output");
    output.dataset.outputKey = key;

    row.append(text, output);
    label.appendChild(row);

    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.dataset.settingKey = key;
    input.dataset.unit = unit;
    input.addEventListener("input", () => updateSetting(key, Number(input.value)));

    label.appendChild(input);
    return label;
  }

  function buildCheckboxControl(labelText, key) {
    const label = document.createElement("label");
    label.className = "mss-check";

    const text = document.createElement("span");
    text.textContent = labelText;

    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.settingKey = key;
    input.addEventListener("change", () => updateSetting(key, input.checked));

    label.append(text, input);
    return label;
  }

  function buildColorControl(labelText, key) {
    const label = document.createElement("label");
    label.textContent = labelText;

    const input = document.createElement("input");
    input.type = "color";
    input.dataset.settingKey = key;
    input.addEventListener("input", () => updateSetting(key, input.value));

    label.appendChild(input);
    return label;
  }

  function updateSetting(key, value) {
    settings = normalizeSettings({ ...settings, [key]: value });
    applySettings();
    saveSettings();
  }

  function resetSettings() {
    settings = { ...DEFAULT_SETTINGS };
    applySettings();
    saveSettings();
  }

  function syncPanelValues() {
    if (!panel) {
      return;
    }

    for (const input of panel.querySelectorAll("[data-setting-key]")) {
      const key = input.dataset.settingKey;
      if (!key || !(key in settings)) {
        continue;
      }

      if (input instanceof HTMLInputElement && input.type === "checkbox") {
        input.checked = Boolean(settings[key]);
      } else {
        input.value = String(settings[key]);
      }
    }

    for (const output of panel.querySelectorAll("[data-output-key]")) {
      const key = output.dataset.outputKey;
      const input = panel.querySelector(`[data-setting-key="${key}"]`);
      const unit = input?.dataset?.unit || "";
      const value = settings[key];
      output.textContent = typeof value === "number" ? `${formatNumber(value)}${unit}` : String(value || "");
    }
  }

  function formatNumber(value) {
    if (Number.isInteger(value)) {
      return String(value);
    }

    return String(Number(value).toFixed(2)).replace(/0+$/g, "").replace(/\.$/g, "");
  }

  function togglePanel() {
    if (isPanelOpen) {
      hidePanel();
      return;
    }

    showPanel();
  }

  function showPanel() {
    isPanelOpen = true;
    ensureLauncher();
    ensurePanel();
    panel.hidden = false;
    launcher.setAttribute("aria-expanded", "true");
    syncPanelValues();
  }

  function hidePanel() {
    isPanelOpen = false;
    if (panel) {
      panel.hidden = true;
    }

    if (launcher) {
      launcher.setAttribute("aria-expanded", "false");
    }
  }

  function bindSubtitleContainer() {
    const nextContainer = document.querySelector(".subtitle-container");
    if (!nextContainer) {
      subtitleContainer = null;
      disconnectSubtitleObserver();
      return;
    }

    if (subtitleContainer !== nextContainer) {
      subtitleContainer = nextContainer;
      observeSubtitleContainer(nextContainer);
    }

    enhanceSubtitleContainer(nextContainer);
  }

  function enhanceSubtitleContainer(container) {
    container.classList.add(ENHANCED_CLASS);
    container.classList.toggle(COLOR_OVERRIDE_CLASS, !settings.useRoleColors);
    container.classList.toggle(HIDDEN_CLASS, false);
  }

  function scheduleRebind(delay = REBIND_DELAY_MS) {
    window.clearTimeout(rebindTimer);
    rebindTimer = window.setTimeout(bindSubtitleContainer, delay);
  }

  function observeSubtitleContainer(container) {
    disconnectSubtitleObserver();
    subtitleObserver = new MutationObserver(() => {
      if (subtitleContainer) {
        enhanceSubtitleContainer(subtitleContainer);
      }
    });
    subtitleObserver.observe(container, {
      childList: true,
      subtree: false,
    });
  }

  function disconnectSubtitleObserver() {
    if (!subtitleObserver) {
      return;
    }

    subtitleObserver.disconnect();
    subtitleObserver = null;
  }

  function observeBody() {
    if (bodyObserver || !document.body) {
      return;
    }

    bodyObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type !== "childList") {
          continue;
        }

        if (!subtitleContainer || !subtitleContainer.isConnected) {
          scheduleRebind(40);
          return;
        }

        for (const addedNode of mutation.addedNodes) {
          if (addedNode instanceof HTMLElement && (addedNode.matches(".subtitle-container") || addedNode.querySelector(".subtitle-container"))) {
            scheduleRebind(40);
            return;
          }
        }
      }
    });

    bodyObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function observeNavigation() {
    window.addEventListener("popstate", () => scheduleRebind(0), { passive: true });
    window.addEventListener("hashchange", () => scheduleRebind(0), { passive: true });
    document.addEventListener("pointerdown", onDocumentPointerDown, true);
    document.addEventListener("keydown", onDocumentKeyDown, true);

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function pushState(...args) {
      const result = originalPushState.apply(this, args);
      scheduleRebind(0);
      return result;
    };

    history.replaceState = function replaceState(...args) {
      const result = originalReplaceState.apply(this, args);
      scheduleRebind(0);
      return result;
    };

    window.setInterval(() => {
      if (window.location.href === lastHref) {
        return;
      }

      lastHref = window.location.href;
      scheduleRebind(0);
    }, ROUTE_CHECK_INTERVAL_MS);
  }

  function onDocumentPointerDown(event) {
    if (!isPanelOpen) {
      return;
    }

    const target = event.target;
    if (target instanceof Node && ((panel && panel.contains(target)) || (launcher && launcher.contains(target)))) {
      return;
    }

    hidePanel();
  }

  function onDocumentKeyDown(event) {
    if (event.key !== "Escape" || !isPanelOpen) {
      return;
    }

    hidePanel();
  }

  function installMenuCommands() {
    if (menuCommandsInstalled || typeof GM_registerMenuCommand !== "function") {
      return;
    }

    menuCommandsInstalled = true;
    GM_registerMenuCommand("Open subtitle style settings", showPanel);
    GM_registerMenuCommand("Reset subtitle style settings", resetSettings);
  }

  function installDebugHandle() {
    window.missevanSubtitleStylerDebug = {
      getSettings: () => ({ ...settings }),
      apply: (nextSettings = {}) => {
        settings = normalizeSettings({ ...settings, ...nextSettings });
        applySettings();
        saveSettings();
        return { ...settings };
      },
      reset: () => {
        resetSettings();
        return { ...settings };
      },
      show: showPanel,
      hide: hidePanel,
    };
  }

  function clampNumber(value, min, max, fallbackValue) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallbackValue;
    }

    return Math.min(max, Math.max(min, number));
  }

  function start() {
    if (!document.body) {
      window.setTimeout(start, 50);
      return;
    }

    addStyle();
    ensureLauncher();
    ensurePanel();
    hidePanel();
    installMenuCommands();
    installDebugHandle();
    applySettings();
    bindSubtitleContainer();
    observeBody();
    observeNavigation();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
