// ==UserScript==
// @name         iQIYI Subtitle Downloader
// @namespace    https://www.iq.com/
// @version      0.1.1
// @updateURL    https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/iqiyi-subtitle-downloader.user.js
// @downloadURL  https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/iqiyi-subtitle-downloader.user.js
// @description  Adds SRT download buttons for subtitles on iQ.com episode pages.
// @author       CaoCao
// @match        https://www.iq.com/play/*
// @match        https://iq.com/play/*
// @include      /^https:\/\/(?:www\.)?iq\.com\/play\/.*$/
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      meta.video.iqiyi.com
// @connect      www.iq.com
// @connect      iq.com
// ==/UserScript==

(() => {
  "use strict";

  const PANEL_ID = "iqiyi-subtitle-downloader-panel";
  const TOAST_CLASS = "iqiyi-subtitle-downloader-toast";
  const LIST_CLASS = "iqiyi-subtitle-downloader-list";
  const ROW_CLASS = "iqiyi-subtitle-downloader-row";
  const EMPTY_CLASS = "iqiyi-subtitle-downloader-empty";
  const BUTTON_CLASS = "iqiyi-subtitle-downloader-button";
  const TITLE_CLASS = "iqiyi-subtitle-downloader-title";
  const STATUS_CLASS = "iqiyi-subtitle-downloader-status";
  const SRT_BASE_URL = "https://meta.video.iqiyi.com";
  const ROUTE_CHECK_INTERVAL_MS = 800;
  const FETCH_STALE_DELAY_MS = 350;

  const css = `
    #${PANEL_ID} {
      position: fixed;
      right: 24px;
      bottom: 72px;
      z-index: 2147483647;
      box-sizing: border-box;
      width: min(340px, calc(100vw - 32px));
      max-height: min(58vh, 520px);
      padding: 16px;
      overflow: hidden;
      color: #f4f7fb;
      background: rgba(20, 23, 30, 0.94);
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 8px;
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.38);
      font: 14px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      backdrop-filter: blur(10px);
    }

    #${PANEL_ID} .${TITLE_CLASS} {
      margin: 0 0 12px;
      color: #fff;
      font-size: 14px;
      font-weight: 700;
      line-height: 1.2;
    }

    #${PANEL_ID} .${LIST_CLASS} {
      display: grid;
      gap: 6px;
      max-height: calc(min(58vh, 520px) - 58px);
      overflow: auto;
      padding-right: 2px;
      scrollbar-width: thin;
    }

    #${PANEL_ID} .${STATUS_CLASS} {
      margin: -4px 0 10px;
      color: rgba(244, 247, 251, 0.64);
      font-size: 12px;
    }

    #${PANEL_ID} .${ROW_CLASS} {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 12px;
      min-height: 30px;
      color: rgba(244, 247, 251, 0.86);
    }

    #${PANEL_ID} .${ROW_CLASS} span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    #${PANEL_ID} .${EMPTY_CLASS} {
      color: rgba(244, 247, 251, 0.64);
      font-size: 13px;
    }

    #${PANEL_ID} .${BUTTON_CLASS} {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 48px;
      height: 28px;
      padding: 0 10px;
      border: 0;
      border-radius: 7px;
      color: #07150b;
      background: #36d661;
      font: 800 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
      cursor: pointer;
      touch-action: manipulation;
    }

    #${PANEL_ID} .${BUTTON_CLASS}:hover:not(:disabled) {
      background: #5ee77f;
    }

    #${PANEL_ID} .${BUTTON_CLASS}:disabled {
      cursor: wait;
      opacity: 0.66;
    }

    .${TOAST_CLASS} {
      position: fixed;
      left: 50%;
      bottom: 24px;
      z-index: 2147483647;
      box-sizing: border-box;
      max-width: min(440px, calc(100vw - 32px));
      padding: 9px 12px;
      color: #fff;
      background: rgba(0, 0, 0, 0.82);
      border-radius: 7px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
      font: 13px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      text-align: center;
      transform: translateX(-50%);
      pointer-events: none;
    }
  `;

  let panel = null;
  let toastTimer = 0;
  let lastHref = "";
  let lastSignature = "";
  let lastState = null;
  let refreshTimer = 0;
  let fallbackFetchTimer = 0;
  let menuCommandsInstalled = false;
  let hasStarted = false;

  console.info("[iQIYI Subtitle Downloader] started", window.location.href);

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

  function ensurePanel() {
    if (panel && panel.isConnected) {
      return panel;
    }

    panel = document.getElementById(PANEL_ID) || document.createElement("section");
    panel.id = PANEL_ID;
    panel.setAttribute("aria-label", "iQIYI subtitle downloads");

    if (!panel.parentElement) {
      getMountRoot().appendChild(panel);
    }

    return panel;
  }

  function renderPanel(state) {
    ensurePanel();

    panel.replaceChildren();

    const title = document.createElement("div");
    title.className = TITLE_CLASS;
    title.textContent = "Subtitles";
    panel.appendChild(title);

    const list = document.createElement("div");
    list.className = LIST_CLASS;
    panel.appendChild(list);

    if (state.message) {
      const status = document.createElement("div");
      status.className = STATUS_CLASS;
      status.textContent = state.message;
      panel.insertBefore(status, list);
    }

    if (!state.subtitles.length) {
      const empty = document.createElement("div");
      empty.className = EMPTY_CLASS;
      empty.textContent = state.status === "error" ? "Could not read IQ.com page data" : state.message || "No subtitles found";
      list.appendChild(empty);
      return;
    }

    for (const subtitle of state.subtitles) {
      const row = document.createElement("div");
      row.className = ROW_CLASS;

      const label = document.createElement("span");
      label.textContent = subtitle.name;
      label.title = subtitle.name;

      const button = document.createElement("button");
      button.type = "button";
      button.className = BUTTON_CLASS;
      button.textContent = "SRT";
      button.title = `Download ${subtitle.name} subtitles as SRT`;
      button.setAttribute("aria-label", button.title);
      button.addEventListener("click", () => onDownloadClick(button, state, subtitle));

      row.append(label, button);
      list.appendChild(row);
    }
  }

  async function onDownloadClick(button, state, subtitle) {
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "...";

    try {
      await downloadSubtitle(subtitle.url, buildFilename(state, subtitle));
      showToast(`Downloading ${subtitle.name} subtitles`);
    } catch (error) {
      console.warn("[iQIYI Subtitle Downloader]", error);
      showToast(`Could not download ${subtitle.name}; opening subtitle URL`);
      window.open(subtitle.url, "_blank", "noopener");
    } finally {
      button.disabled = false;
      button.textContent = originalText || "SRT";
    }
  }

  function downloadSubtitle(url, filename) {
    if (typeof GM_download === "function") {
      return new Promise((resolve, reject) => {
        try {
          GM_download({
            url,
            name: filename,
            saveAs: false,
            onload: resolve,
            onerror: reject,
            ontimeout: reject,
          });
        } catch (error) {
          reject(error);
        }
      }).catch(() => downloadViaRequest(url, filename));
    }

    return downloadViaRequest(url, filename);
  }

  function downloadViaRequest(url, filename) {
    if (typeof GM_xmlhttpRequest !== "function") {
      return downloadViaFetch(url, filename);
    }

    return new Promise((resolve, reject) => {
      try {
        GM_xmlhttpRequest({
          method: "GET",
          url,
          responseType: "blob",
          onload: (response) => {
            if (response.status < 200 || response.status >= 300) {
              reject(new Error(`Subtitle request failed with HTTP ${response.status}`));
              return;
            }

            saveBlob(response.response, filename);
            resolve();
          },
          onerror: reject,
          ontimeout: reject,
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function downloadViaFetch(url, filename) {
    const response = await fetch(url, {
      credentials: "omit",
      headers: {
        Accept: "application/x-subrip,text/plain,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      throw new Error(`Subtitle request failed with HTTP ${response.status}`);
    }

    saveBlob(await response.blob(), filename);
  }

  function saveBlob(blob, filename) {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    link.style.display = "none";
    getMountRoot().appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  function showToast(message) {
    document.querySelector(`.${TOAST_CLASS}`)?.remove();

    const toast = document.createElement("div");
    toast.className = TOAST_CLASS;
    toast.textContent = message;
    getMountRoot().appendChild(toast);

    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.remove(), 2200);
  }

  function refreshFromDocument() {
    const state = extractStateFromDocument(document);
    renderState(state);

    window.clearTimeout(fallbackFetchTimer);
    if (!isStateHrefCurrent(state.href) || state.source === "missing") {
      fallbackFetchTimer = window.setTimeout(refreshFromFetchedPage, FETCH_STALE_DELAY_MS);
    }
  }

  async function refreshFromFetchedPage() {
    try {
      const response = await fetch(window.location.href, {
        credentials: "include",
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      if (!response.ok) {
        throw new Error(`Page request failed with HTTP ${response.status}`);
      }

      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      renderState(extractStateFromDocument(doc, window.location.href));
    } catch (error) {
      console.warn("[iQIYI Subtitle Downloader]", error);
      renderState(buildState({}, [], window.location.href, "error", "Could not read IQ.com page data"));
    }
  }

  function renderState(state) {
    lastState = state;
    const signature = JSON.stringify({
      href: state.href,
      status: state.status,
      message: state.message,
      albumTitle: state.albumTitle,
      episodeTitle: state.episodeTitle,
      episodeOrder: state.episodeOrder,
      subtitles: state.subtitles.map((subtitle) => `${subtitle.name}:${subtitle.url}`),
    });

    if (signature === lastSignature) {
      return;
    }

    lastSignature = signature;
    renderPanel(state);
  }

  function extractStateFromDocument(doc, href = doc.location?.href || "") {
    const data = parseNextData(doc);
    if (!data) {
      return buildState({}, [], href, "missing", "Could not read IQ.com page data");
    }

    const pageProps = data?.props?.initialProps?.pageProps || {};
    const initialState = data?.props?.initialState || {};
    const subtitles = normalizeSubtitles(pageProps?.prePlayerData?.dash?.data?.program?.stl);
    const videoInfo = initialState?.play?.curVideoInfo || initialState?.play?.videoInfo || {};
    const albumInfo = initialState?.album?.videoAlbumInfo || {};
    const dataHref = resolveDataHref(pageProps, videoInfo, href);

    return buildState(
      {
        albumTitle: videoInfo.albumName || albumInfo.name || "",
        episodeTitle: videoInfo.name || videoInfo.subTitle || videoInfo.shortName || "",
        episodeOrder: videoInfo.order,
      },
      subtitles,
      dataHref,
      "next-data",
      subtitles.length ? `Found ${subtitles.length} subtitle track${subtitles.length === 1 ? "" : "s"}` : "No subtitles found",
    );
  }

  function resolveDataHref(pageProps, videoInfo, fallbackHref) {
    const suffix = normalizeText(videoInfo.playLocSuffix || pageProps.curUrl || pageProps.pathname);
    if (!suffix) {
      return fallbackHref;
    }

    try {
      if (/^https?:\/\//i.test(suffix)) {
        return new URL(suffix).toString();
      }

      return new URL(suffix.startsWith("/") ? suffix : `/play/${suffix}`, window.location.origin).toString();
    } catch {
      return fallbackHref;
    }
  }

  function isStateHrefCurrent(href) {
    try {
      return new URL(href || window.location.href, window.location.origin).pathname === window.location.pathname;
    } catch {
      return true;
    }
  }

  function parseNextData(doc) {
    const script = doc.getElementById("__NEXT_DATA__");
    if (!script?.textContent) {
      return null;
    }

    try {
      return JSON.parse(script.textContent);
    } catch (error) {
      console.warn("[iQIYI Subtitle Downloader] Could not parse __NEXT_DATA__.", error);
      return null;
    }
  }

  function normalizeSubtitles(entries) {
    if (!Array.isArray(entries)) {
      return [];
    }

    const seenNames = new Map();
    return entries
      .filter((entry) => entry && typeof entry.srt === "string" && entry.srt.trim())
      .map((entry) => {
        const baseName = normalizeText(entry._name || entry.name || `Subtitle ${entry.lid || ""}`) || "Subtitle";
        const duplicateCount = seenNames.get(baseName) || 0;
        seenNames.set(baseName, duplicateCount + 1);

        return {
          name: duplicateCount ? `${baseName} ${duplicateCount + 1}` : baseName,
          sort: numberValue(entry._sort),
          lid: numberValue(entry.lid),
          url: new URL(entry.srt, SRT_BASE_URL).toString(),
        };
      })
      .sort((left, right) => (
        compareNullableNumbers(left.sort, right.sort)
        || left.name.localeCompare(right.name)
        || left.lid - right.lid
      ));
  }

  function buildState(videoInfo, subtitles, href, source, message = "") {
    const titleFallback = getTitleFallback();
    return {
      source,
      status: source === "missing" || source === "error" ? "error" : subtitles.length ? "ready" : "empty",
      message,
      href,
      albumTitle: normalizeTitle(videoInfo.albumTitle) || titleFallback.albumTitle,
      episodeTitle: normalizeTitle(videoInfo.episodeTitle) || titleFallback.episodeTitle,
      episodeOrder: numberValue(videoInfo.episodeOrder),
      subtitles,
    };
  }

  function getTitleFallback() {
    const title = normalizeTitle(document.title).replace(/\s+online with .*$/i, "");
    const parts = title.split(/\s+[-|]\s+/).map(normalizeTitle).filter(Boolean);
    const firstPart = parts[0] || title || "iQIYI";
    const episodeMatch = firstPart.match(/^(.*?)\s+(Episode\s+\d+.*?)$/i);

    if (episodeMatch) {
      return {
        albumTitle: normalizeTitle(episodeMatch[1]) || "iQIYI",
        episodeTitle: normalizeTitle(episodeMatch[2]) || firstPart,
      };
    }

    return {
      albumTitle: firstPart || "iQIYI",
      episodeTitle: firstPart || "Episode",
    };
  }

  function buildFilename(state, subtitle) {
    const episodeNumber = state.episodeOrder > 0 ? `E${String(state.episodeOrder).padStart(2, "0")}` : "Episode";
    const parts = [
      state.albumTitle,
      episodeNumber,
      state.episodeTitle,
      subtitle.name,
    ].map(sanitizeFilenamePart).filter(Boolean);

    return `${parts.join(" - ") || "iQIYI Subtitles"}.srt`;
  }

  function sanitizeFilenamePart(value) {
    return normalizeText(value)
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/\s*-\s*/g, " - ")
      .replace(/(?:\s+-){2,}\s*/g, " - ")
      .replace(/\s{2,}/g, " ")
      .replace(/^[.\s-]+|[.\s-]+$/g, "");
  }

  function scheduleRefresh(delay = 100) {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(refreshFromDocument, delay);
  }

  function observeNavigation() {
    window.addEventListener("popstate", () => scheduleRefresh(0), { passive: true });
    window.addEventListener("hashchange", () => scheduleRefresh(0), { passive: true });

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function pushState(...args) {
      const result = originalPushState.apply(this, args);
      scheduleRefresh(0);
      return result;
    };

    history.replaceState = function replaceState(...args) {
      const result = originalReplaceState.apply(this, args);
      scheduleRefresh(0);
      return result;
    };

    window.setInterval(() => {
      if (window.location.href === lastHref) {
        return;
      }

      lastHref = window.location.href;
      scheduleRefresh(0);
    }, ROUTE_CHECK_INTERVAL_MS);
  }

  function installMenuCommands() {
    if (menuCommandsInstalled || typeof GM_registerMenuCommand !== "function") {
      return;
    }

    menuCommandsInstalled = true;
    GM_registerMenuCommand("Refresh subtitle panel", () => {
      showLoadingPanel();
      refreshFromDocument();
    });
    GM_registerMenuCommand("Log subtitle debug info", logDebugInfo);
  }

  function logDebugInfo() {
    const debugInfo = {
      href: window.location.href,
      hasNextData: Boolean(document.getElementById("__NEXT_DATA__")),
      subtitleCount: lastState?.subtitles?.length || 0,
      albumTitle: lastState?.albumTitle || "",
      episodeTitle: lastState?.episodeTitle || "",
      panelConnected: Boolean(panel?.isConnected),
    };

    console.info("[iQIYI Subtitle Downloader] debug", debugInfo);
    return debugInfo;
  }

  function installDebugHandle() {
    window.iqiyiSubtitleDownloaderDebug = {
      refresh: refreshFromDocument,
      getState: () => lastState,
      log: logDebugInfo,
    };
  }

  function showLoadingPanel() {
    renderState(buildState({}, [], window.location.href, "loading", "Loading subtitles..."));
  }

  function normalizeTitle(value) {
    return normalizeText(value)
      .replace(/\uFF1F/g, "?")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function numberValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function compareNullableNumbers(left, right) {
    const leftValue = left || Number.POSITIVE_INFINITY;
    const rightValue = right || Number.POSITIVE_INFINITY;
    return leftValue - rightValue;
  }

  function start() {
    if (hasStarted) {
      return;
    }

    if (!document.body) {
      window.setTimeout(start, 50);
      return;
    }

    hasStarted = true;
    addStyle();
    ensurePanel();
    installMenuCommands();
    installDebugHandle();
    showLoadingPanel();
    lastHref = window.location.href;
    refreshFromDocument();
    observeNavigation();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
