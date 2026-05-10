// ==UserScript==
// @name         GagaOOLala Yomitan Subtitle Hover
// @namespace    https://www.gagaoolala.com/
// @version      1.4.0
// @updateURL    https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/gagaoolala-yomitan.user.js
// @downloadURL  https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/gagaoolala-yomitan.user.js
// @description  Mirrors GagaOOLala Bitmovin subtitles into a Yomitan-friendly hover layer.
// @author       CaoCao
// @match        https://www.gagaoolala.com/*/videos/*
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
  "use strict";

  const KEY_ENABLED = "gagaoolala-yomitan-mirror-enabled";
  const KEY_FONT_SIZE = "gagaoolala-yomitan-font-size";
  const KEY_FONT_FAMILY = "gagaoolala-yomitan-font-family";
  const SELECTOR = ".bmpui-ui-subtitle-overlay .bmpui-ui-subtitle-label, .bmpui-ui-subtitle-overlay p";
  const MIRROR_ID = "gagaoolala-yomitan-subtitle-mirror";
  const MIRROR_CLASS = "gagaoolala-yomitan-subtitle-mirror";
  const LINE_HEIGHT = "1.28";
  const V_PADDING = 8;
  const OBSERVE_SELECTOR = ".bmpui-ui-subtitle-overlay, .bmpui-ui-subtitle-label, .bmpui-subtitle-region-container, .bitmovinplayer-container, .wide-player-stage";

  const css = `
    .bmpui-ui-subtitle-overlay,
    .bmpui-ui-subtitle-overlay .bmpui-subtitle-region-container {
      pointer-events: none !important;
      -webkit-user-select: none !important;
      user-select: none !important;
    }

    .bmpui-ui-subtitle-overlay .bmpui-ui-subtitle-label,
    .bmpui-ui-subtitle-overlay .bmpui-ui-subtitle-label *,
    .bmpui-ui-subtitle-overlay p {
      overflow: visible !important;
      line-height: ${LINE_HEIGHT} !important;
      padding-top: 0.04em !important;
      padding-bottom: 0.04em !important;
      pointer-events: auto !important;
      -webkit-user-select: text !important;
      user-select: text !important;
      cursor: text !important;
    }

    .${MIRROR_CLASS} {
      position: fixed;
      z-index: 2147483646;
      display: none;
      max-width: min(90vw, 980px);
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      color: transparent;
      background: transparent;
      border: 0;
      text-align: center;
      text-shadow: none;
      white-space: pre-wrap;
      pointer-events: none;
      -webkit-user-select: text;
      user-select: text;
    }

    .${MIRROR_CLASS}--enabled {
      display: block;
    }

    .${MIRROR_CLASS}__text {
      display: inline;
      color: rgba(255, 255, 255, 0.01);
      background: transparent;
      pointer-events: auto;
      -webkit-user-select: text;
      user-select: text;
      cursor: text;
    }

    .${MIRROR_CLASS}::selection,
    .${MIRROR_CLASS}__text::selection {
      color: rgba(255, 255, 255, 0.01);
      background: rgba(255, 224, 64, 0.72);
      text-shadow: none;
    }

    .${MIRROR_CLASS}__toast {
      position: fixed;
      left: 50%;
      bottom: 22px;
      z-index: 2147483647;
      padding: 8px 12px;
      color: #fff;
      font: 13px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: rgba(0, 0, 0, 0.78);
      border-radius: 6px;
      transform: translateX(-50%);
      pointer-events: none;
    }
  `;

  const getValue = (key, fallback = "") => {
    try {
      if (typeof GM_getValue === "function") return GM_getValue(key, fallback);
    } catch (error) {
      console.warn("[GagaOOLala Yomitan]", error);
    }
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  };

  const setValue = (key, value) => {
    try {
      if (typeof GM_setValue === "function") return void GM_setValue(key, value);
    } catch (error) {
      console.warn("[GagaOOLala Yomitan]", error);
    }
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.warn("[GagaOOLala Yomitan]", error);
    }
  };

  const deleteValue = (key) => {
    try {
      if (typeof GM_setValue === "function") return void GM_setValue(key, "");
    } catch (error) {
      console.warn("[GagaOOLala Yomitan]", error);
    }
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn("[GagaOOLala Yomitan]", error);
    }
  };

  const normalizeText = (text) =>
    String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();

  const normalizeFontSize = (value) => {
    const text = String(value || "").trim();
    if (!text) return "";
    if (/^\d+(?:\.\d+)?$/.test(text)) return `${text}px`;
    return /^\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|vmin|vmax|pt|pc|in|cm|mm|ex|ch|lh|rlh)$/i.test(text) ? text : null;
  };

  const setStyle = (el, key, value) => {
    if (el.style[key] !== value) el.style[key] = value;
  };

  let mirrorEnabled = getValue(KEY_ENABLED, "1") !== "0";
  let subtitleFontSize = getValue(KEY_FONT_SIZE, "");
  let subtitleFontFamily = getValue(KEY_FONT_FAMILY, "");
  let latestText = "";
  let mirrorEl;
  let mirrorTextEl;
  let rafId = 0;
  let toastTimer = 0;

  if (typeof GM_addStyle === "function") {
    GM_addStyle(css);
  } else {
    const style = document.createElement("style");
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  function applySubtitleSettings(elements = document.querySelectorAll(SELECTOR)) {
    for (const el of elements) {
      if (!(el instanceof HTMLElement)) continue;
      setStyle(el, "overflow", "visible");
      setStyle(el, "lineHeight", LINE_HEIGHT);
      setStyle(el, "paddingTop", "0.04em");
      setStyle(el, "paddingBottom", "0.04em");
      setStyle(el, "fontSize", subtitleFontSize || "");
      setStyle(el, "fontFamily", subtitleFontFamily || "");
    }
  }

  function getSubtitleLabels() {
    const labels = Array.from(document.querySelectorAll(SELECTOR)).filter((el) => el instanceof HTMLElement);
    applySubtitleSettings(labels);
    return labels.filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && normalizeText(el.textContent);
    });
  }

  function ensureMirror() {
    if (mirrorEl && mirrorTextEl) return;
    mirrorEl = document.getElementById(MIRROR_ID) || document.createElement("div");
    mirrorEl.id = MIRROR_ID;
    mirrorEl.className = MIRROR_CLASS;
    mirrorEl.setAttribute("aria-hidden", "true");
    mirrorTextEl = mirrorEl.querySelector(`.${MIRROR_CLASS}__text`) || document.createElement("span");
    mirrorTextEl.className = `${MIRROR_CLASS}__text`;
    if (!mirrorTextEl.parentNode) mirrorEl.appendChild(mirrorTextEl);
    if (!mirrorEl.parentNode) document.documentElement.appendChild(mirrorEl);
  }

  function showToast(message) {
    document.querySelector(`.${MIRROR_CLASS}__toast`)?.remove();
    const toast = document.createElement("div");
    toast.className = `${MIRROR_CLASS}__toast`;
    toast.textContent = message;
    document.documentElement.appendChild(toast);
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.remove(), 1600);
  }

  function getBounds(labels) {
    const rects = labels.map((el) => el.getBoundingClientRect());
    const left = Math.min(...rects.map((rect) => rect.left));
    const top = Math.min(...rects.map((rect) => rect.top));
    const right = Math.max(...rects.map((rect) => rect.right));
    const bottom = Math.max(...rects.map((rect) => rect.bottom));
    return { left, top, width: right - left, height: bottom - top };
  }

  function updateMirror() {
    ensureMirror();

    const labels = getSubtitleLabels();
    const text = normalizeText(labels.map((el) => el.textContent).join("\n"));
    latestText = text;
    mirrorEl.classList.toggle(`${MIRROR_CLASS}--enabled`, mirrorEnabled && !!text);
    mirrorTextEl.textContent = text;
    if (!mirrorEnabled || !text || !labels.length) return;

    const bounds = getBounds(labels);
    const computed = window.getComputedStyle(labels[0]);
    mirrorEl.style.left = `${bounds.left}px`;
    mirrorEl.style.top = `${Math.max(0, bounds.top - V_PADDING)}px`;
    mirrorEl.style.width = `${bounds.width}px`;
    mirrorEl.style.minHeight = `${bounds.height + V_PADDING * 2}px`;
    mirrorEl.style.paddingTop = `${V_PADDING}px`;
    mirrorEl.style.paddingBottom = `${V_PADDING}px`;
    mirrorEl.style.lineHeight = LINE_HEIGHT;
    mirrorEl.style.letterSpacing = computed.letterSpacing || "";

    if (!subtitleFontSize && !subtitleFontFamily) {
      mirrorEl.style.font = computed.font || "";
    } else {
      mirrorEl.style.fontStyle = computed.fontStyle || "";
      mirrorEl.style.fontVariant = computed.fontVariant || "";
      mirrorEl.style.fontWeight = computed.fontWeight || "";
      mirrorEl.style.fontStretch = computed.fontStretch || "";
      mirrorEl.style.fontSize = subtitleFontSize || computed.fontSize || "";
      mirrorEl.style.fontFamily = subtitleFontFamily || computed.fontFamily || "";
    }
  }

  function scheduleUpdate() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      updateMirror();
    });
  }

  function setMirrorEnabled(next) {
    mirrorEnabled = !!next;
    setValue(KEY_ENABLED, mirrorEnabled ? "1" : "0");
    updateMirror();
    showToast(`GagaOOLala Yomitan mirror ${mirrorEnabled ? "on" : "off"}`);
  }

  function setSubtitleFontSize() {
    const next = window.prompt("Subtitle font size (number = px; blank resets)", subtitleFontSize);
    if (next == null) return;
    const normalized = normalizeFontSize(next);
    if (normalized == null) return void showToast("Invalid subtitle font size");
    subtitleFontSize = normalized;
    subtitleFontSize ? setValue(KEY_FONT_SIZE, subtitleFontSize) : deleteValue(KEY_FONT_SIZE);
    scheduleUpdate();
    showToast(subtitleFontSize ? `Subtitle font size set to ${subtitleFontSize}` : "Subtitle font size reset");
  }

  function setSubtitleFontFamily() {
    const next = window.prompt('Subtitle font family (e.g. "Noto Sans TC", sans-serif; blank resets)', subtitleFontFamily);
    if (next == null) return;
    subtitleFontFamily = String(next || "").trim();
    subtitleFontFamily ? setValue(KEY_FONT_FAMILY, subtitleFontFamily) : deleteValue(KEY_FONT_FAMILY);
    scheduleUpdate();
    showToast(subtitleFontFamily ? "Subtitle font family set" : "Subtitle font family reset");
  }

  function resetSubtitleFontSettings() {
    subtitleFontSize = "";
    subtitleFontFamily = "";
    deleteValue(KEY_FONT_SIZE);
    deleteValue(KEY_FONT_FAMILY);
    scheduleUpdate();
    showToast("Subtitle font settings reset");
  }

  function installMenuCommands() {
    if (typeof GM_registerMenuCommand !== "function") return;
    GM_registerMenuCommand("Set subtitle font size", setSubtitleFontSize);
    GM_registerMenuCommand("Set subtitle font family", setSubtitleFontFamily);
    GM_registerMenuCommand("Reset subtitle font settings", resetSubtitleFontSettings);
  }

  function observeSubtitles() {
    new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.target?.closest?.(OBSERVE_SELECTOR))) scheduleUpdate();
    }).observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    window.addEventListener("resize", scheduleUpdate, { passive: true });
    document.addEventListener("fullscreenchange", scheduleUpdate, true);
    window.setInterval(() => {
      const text = normalizeText(getSubtitleLabels().map((el) => el.textContent).join("\n"));
      if (mirrorEnabled || text !== latestText) scheduleUpdate();
    }, 500);
  }

  function installKeyboardToggle() {
    document.addEventListener(
      "keydown",
      (event) => {
        if (!event.altKey || event.shiftKey || event.ctrlKey || event.metaKey || event.key.toLowerCase() !== "y") return;
        event.preventDefault();
        setMirrorEnabled(!mirrorEnabled);
      },
      true,
    );
  }

  function start() {
    ensureMirror();
    installMenuCommands();
    updateMirror();
    observeSubtitles();
    installKeyboardToggle();
    if (mirrorEnabled) showToast("GagaOOLala Yomitan mirror on");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
