// ==UserScript==
// @name         Du Chinese & Yomu Yomu Audio Downloader
// @namespace    https://duchinese.net/
// @version      0.3.0
// @updateURL    https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/duchinese-audio-downloader.user.js
// @downloadURL  https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/duchinese-audio-downloader.user.js
// @description  Adds an audio download button beside the Du Chinese and Yomu Yomu lesson players.
// @author       CaoCao
// @match        https://duchinese.net/lessons/*
// @match        https://www.duchinese.net/lessons/*
// @match        https://yomuyomu.app/lessons/*
// @match        https://www.yomuyomu.app/lessons/*
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @connect      duchinese.net
// @connect      yomuyomu.app
// ==/UserScript==

(() => {
  "use strict";

  const SCRIPT_PREFIX = "[Du Chinese & Yomu Yomu Audio Downloader]";
  const BUTTON_ID = "duchinese-audio-downloader-button";
  const BUTTON_CLASS = "duchinese-audio-downloader-button";
  const SLOT_CLASS = "duchinese-audio-downloader-slot";
  const TOAST_ID = "duchinese-audio-downloader-toast";
  const CREATED_SLOT_ATTRIBUTE = "data-duchinese-audio-downloader-created-slot";
  const SUPPORTED_AUDIO_DOMAINS = ["duchinese.net", "yomuyomu.app"];
  const MAX_TITLE_LENGTH = 160;
  const TOAST_DURATION_MS = 3500;
  const REQUEST_TIMEOUT_MS = 60000;
  const AUDIO_EXTENSION_PATTERN = /^(?:aac|flac|m4a|mp3|ogg|opus|wav|webm)$/i;

  const css = `
    .${SLOT_CLASS} {
      position: relative !important;
      min-width: 0 !important;
      overflow: visible !important;
    }

    #${BUTTON_ID}.${BUTTON_CLASS} {
      position: absolute;
      top: 50%;
      left: 4px;
      right: auto !important;
      z-index: 1;
      display: inline-flex;
      box-sizing: border-box;
      align-items: center;
      justify-content: center;
      width: 28px !important;
      min-width: 28px !important;
      max-width: 28px !important;
      height: 28px;
      margin: 0;
      padding: 0;
      color: #4281b6;
      background: #fff;
      border: 1px solid rgba(66, 129, 182, 0.72);
      border-radius: 50%;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
      font: inherit;
      cursor: pointer;
      transform: translateY(-50%);
      touch-action: manipulation;
    }

    #${BUTTON_ID}.${BUTTON_CLASS}:hover:not(:disabled) {
      color: #2f648f;
      background: #f3f8fc;
      border-color: #4281b6;
    }

    #${BUTTON_ID}.${BUTTON_CLASS}:active:not(:disabled) {
      background: #e7f1f8;
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.18);
      transform: translateY(-50%) scale(0.96);
    }

    #${BUTTON_ID}.${BUTTON_CLASS}:focus-visible {
      outline: 3px solid rgba(13, 110, 253, 0.35);
      outline-offset: 2px;
    }

    #${BUTTON_ID}.${BUTTON_CLASS}:disabled {
      cursor: progress;
      opacity: 0.55;
    }

    #${BUTTON_ID}.${BUTTON_CLASS} svg {
      width: 15px;
      height: 15px;
      fill: currentColor;
      pointer-events: none;
    }

    #${TOAST_ID} {
      position: fixed;
      left: 50%;
      bottom: 114px;
      z-index: 2147483647;
      box-sizing: border-box;
      max-width: min(440px, calc(100vw - 32px));
      padding: 9px 12px;
      color: #fff;
      background: rgba(24, 31, 38, 0.92);
      border-radius: 7px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
      font: 13px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      text-align: center;
      transform: translateX(-50%);
      pointer-events: none;
    }

    #${TOAST_ID}[data-error="true"] {
      background: rgba(159, 31, 45, 0.94);
    }

    @media (min-width: 576px) {
      #${TOAST_ID} {
        bottom: 86px;
      }
    }
  `;

  let syncFrame = 0;
  let toastTimer = 0;
  let hasWarnedAboutPlayerMarkup = false;

  function addStyle() {
    if (typeof GM_addStyle === "function") {
      GM_addStyle(css);
      return;
    }

    const style = document.createElement("style");
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  function getAudioElement() {
    return document.querySelector("#du-player audio");
  }

  function getAudioUrl() {
    const audio = getAudioElement();
    if (!audio) {
      return "";
    }

    const source = audio.querySelector("source[src]");
    const candidate = audio.currentSrc || audio.src || source?.src || source?.getAttribute("src") || "";
    if (!candidate) {
      return "";
    }

    try {
      const url = new URL(candidate, window.location.href);
      return url.protocol === "https:" ? url.toString() : "";
    } catch {
      return "";
    }
  }

  function getPlayWrapper() {
    const audio = getAudioElement();
    const player = audio?.closest("#du-player");
    const playWrapper = player?.closest(".du-player-button");
    const controls = playWrapper?.closest(".du-player-controls");

    return controls ? playWrapper : null;
  }

  function ensureSlot(playWrapper) {
    let slot = playWrapper.nextElementSibling;
    if (!slot?.hasAttribute(CREATED_SLOT_ATTRIBUTE)) {
      slot = document.createElement("div");
      slot.setAttribute(CREATED_SLOT_ATTRIBUTE, "true");
      slot.classList.add(SLOT_CLASS);
      playWrapper.insertAdjacentElement("afterend", slot);
    }

    return slot;
  }

  function createDownloadIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M5 20h14v-2H5v2zm14-9h-4V3H9v8H5l7 7 7-7z");
    svg.appendChild(path);
    return svg;
  }

  function ensureButton(slot) {
    let button = document.getElementById(BUTTON_ID);
    if (!(button instanceof HTMLButtonElement)) {
      button?.remove();
      button = document.createElement("button");
      button.id = BUTTON_ID;
      button.className = BUTTON_CLASS;
      button.type = "button";
      button.title = "Download lesson audio";
      button.setAttribute("aria-label", "Download lesson audio");
      button.appendChild(createDownloadIcon());
      button.addEventListener("click", onDownloadClick);
    }

    if (button.parentElement !== slot) {
      slot.appendChild(button);
    }

    return button;
  }

  function removeInjectedControl() {
    const button = document.getElementById(BUTTON_ID);
    if (button?.disabled) {
      return;
    }

    button?.remove();
    for (const slot of document.querySelectorAll(`[${CREATED_SLOT_ATTRIBUTE}]`)) {
      slot.remove();
    }
  }

  function warnAboutPlayerMarkupOnce() {
    if (hasWarnedAboutPlayerMarkup) {
      return;
    }

    hasWarnedAboutPlayerMarkup = true;
    console.warn(SCRIPT_PREFIX, "Found the lesson audio element but not its player controls; the site markup may have changed.");
  }

  function syncButton() {
    const playWrapper = getPlayWrapper();
    if (!playWrapper) {
      if (getAudioElement()) {
        warnAboutPlayerMarkupOnce();
      }

      removeInjectedControl();
      return;
    }

    if (!getAudioUrl()) {
      removeInjectedControl();
      return;
    }

    ensureButton(ensureSlot(playWrapper));
  }

  function scheduleSync() {
    if (syncFrame) {
      return;
    }

    syncFrame = window.requestAnimationFrame(() => {
      syncFrame = 0;
      syncButton();
    });
  }

  async function onDownloadClick(event) {
    const button = event.currentTarget;
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return;
    }

    const audioUrl = getAudioUrl();
    if (!audioUrl) {
      showToast("Lesson audio is not available yet.", true);
      scheduleSync();
      return;
    }

    const filename = buildFilename(audioUrl);
    setButtonBusy(button, true);

    try {
      assertSupportedAudioHost(audioUrl);
      const method = await downloadAudio(audioUrl, filename);
      showToast(method === "gm" ? `Downloaded ${filename}` : `Downloading ${filename}`);
    } catch (error) {
      if (isCancelledDownload(error)) {
        showToast("Download cancelled.");
      } else {
        console.error(SCRIPT_PREFIX, "Audio download failed.", error);
        showToast(error?.userFacing ? error.message : "Audio download failed. See the console for details.", true);
      }
    } finally {
      setButtonBusy(button, false);
    }
  }

  function setButtonBusy(button, isBusy) {
    button.disabled = isBusy;
    if (isBusy) {
      button.setAttribute("aria-busy", "true");
    } else {
      button.removeAttribute("aria-busy");
    }
  }

  function userError(message) {
    const error = new Error(message);
    error.userFacing = true;
    return error;
  }

  function isCancelledDownload(error) {
    return error?.error === "user_canceled";
  }

  function assertSupportedAudioHost(audioUrl) {
    const hostname = new URL(audioUrl).hostname.toLowerCase();
    const isSupported = SUPPORTED_AUDIO_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    );

    if (!isSupported) {
      throw userError(`Unsupported audio host: ${hostname}`);
    }
  }

  async function downloadAudio(url, filename) {
    try {
      await downloadViaGm(url, filename);
      return "gm";
    } catch (error) {
      if (isCancelledDownload(error)) {
        throw error;
      }

      console.warn(SCRIPT_PREFIX, "GM_download failed; retrying with GM_xmlhttpRequest.", error);
      await downloadViaRequest(url, filename);
      return "request";
    }
  }

  function downloadViaGm(url, filename) {
    if (typeof GM_download !== "function") {
      return Promise.reject(new Error("GM_download is unavailable."));
    }

    return new Promise((resolve, reject) => {
      try {
        GM_download({
          url,
          name: filename,
          saveAs: false,
          onload: resolve,
          onerror: (error) => reject(error || new Error("GM_download failed.")),
          ontimeout: () => reject(new Error("GM_download timed out.")),
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function downloadViaRequest(url, filename) {
    if (typeof GM_xmlhttpRequest !== "function") {
      return Promise.reject(new Error("GM_xmlhttpRequest is unavailable."));
    }

    return new Promise((resolve, reject) => {
      try {
        GM_xmlhttpRequest({
          method: "GET",
          url,
          responseType: "blob",
          timeout: REQUEST_TIMEOUT_MS,
          headers: {
            Accept: "audio/mpeg,audio/*;q=0.9,*/*;q=0.8",
          },
          onload: (response) => {
            if (response.status < 200 || response.status >= 300) {
              reject(userError(`Audio request failed with HTTP ${response.status}.`));
              return;
            }

            try {
              const blob = response.response instanceof Blob
                ? response.response
                : new Blob([response.response], { type: response.responseHeaders?.match(/content-type:\s*([^\r\n]+)/i)?.[1] || "audio/mpeg" });
              triggerBlobDownload(blob, filename);
              resolve();
            } catch (error) {
              reject(error);
            }
          },
          onerror: (error) => reject(error || new Error("Audio request failed.")),
          ontimeout: () => reject(new Error("Audio request timed out.")),
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function triggerBlobDownload(blob, filename) {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.hidden = true;
    (document.body || document.documentElement).appendChild(anchor);

    try {
      anchor.click();
    } finally {
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }
  }

  function buildFilename(audioUrl) {
    const title = sanitizeFilenamePart(getLessonTitle());
    const lessonId = getLessonId();
    const brand = getSiteName();
    const fallback = lessonId ? `${brand} Lesson ${lessonId}` : `${brand} Lesson`;
    return `${title || fallback}.${getAudioExtension(audioUrl)}`;
  }

  function getSiteName() {
    return /(?:^|\.)yomuyomu\.app$/i.test(window.location.hostname) ? "Yomu Yomu" : "Du Chinese";
  }

  function getLessonTitle() {
    const heading = document.querySelector("header h1, main h1, h1");
    return heading?.textContent || "";
  }

  function getLessonId() {
    return window.location.pathname.match(/\/lessons\/(\d+)(?:[-/]|$)/)?.[1] || "";
  }

  function sanitizeFilenamePart(value) {
    let title = String(value || "")
      .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, "-")
      .replace(/\s+/g, " ")
      .replace(/^[.\s-]+|[.\s-]+$/g, "");

    title = Array.from(title).slice(0, MAX_TITLE_LENGTH).join("").replace(/[.\s-]+$/g, "");
    if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(title)) {
      title = `_${title}`;
    }

    return title;
  }

  function getAudioExtension(audioUrl) {
    try {
      const extension = new URL(audioUrl).pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1] || "";
      return AUDIO_EXTENSION_PATTERN.test(extension) ? extension.toLowerCase() : "mp3";
    } catch {
      return "mp3";
    }
  }

  function showToast(message, isError = false) {
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement("div");
      toast.id = TOAST_ID;
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      (document.body || document.documentElement).appendChild(toast);
    }

    toast.textContent = message;
    toast.dataset.error = String(isError);
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.remove(), TOAST_DURATION_MS);
  }

  function start() {
    addStyle();
    syncButton();

    new MutationObserver(scheduleSync).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src"],
    });
  }

  start();
})();
