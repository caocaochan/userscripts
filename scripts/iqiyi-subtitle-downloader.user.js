// ==UserScript==
// @name         iQIYI Subtitle Downloader
// @namespace    https://www.iq.com/
// @version      0.1.3
// @updateURL    https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/iqiyi-subtitle-downloader.user.js
// @downloadURL  https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/iqiyi-subtitle-downloader.user.js
// @description  Adds SRT download buttons for subtitles on iQ.com and iQIYI.com episode pages.
// @author       CaoCao
// @match        https://www.iq.com/play/*
// @match        https://iq.com/play/*
// @match        https://www.iqiyi.com/v_*.html*
// @match        https://iqiyi.com/v_*.html*
// @include      /^https:\/\/(?:www\.)?iq\.com\/play\/.*$/
// @include      /^https:\/\/(?:www\.)?iqiyi\.com\/v_[^/?#]+\.html(?:[?#].*)?$/
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      meta.video.iqiyi.com
// @connect      www.iq.com
// @connect      iq.com
// @connect      www.iqiyi.com
// @connect      iqiyi.com
// @connect      mesh.if.iqiyi.com
// ==/UserScript==

(() => {
  "use strict";

  const PANEL_ID = "iqiyi-subtitle-downloader-panel";
  const LAUNCHER_ID = "iqiyi-subtitle-downloader-launcher";
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
  const IQIYI_RUNTIME_RETRY_MS = 500;
  const IQIYI_RUNTIME_MAX_RETRIES = 20;
  const IQIYI_LANGUAGE_BY_LID = {
    1: "Simplified Chinese",
  };

  const css = `
    #${PANEL_ID} {
      position: fixed;
      right: 24px;
      bottom: 82px;
      z-index: 2147483647;
      box-sizing: border-box;
      width: min(360px, calc(100vw - 32px));
      max-height: calc(100vh - 106px);
      max-height: calc(100dvh - 106px);
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

    #${PANEL_ID}[hidden] {
      display: none !important;
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
      max-height: calc(100vh - 190px);
      max-height: calc(100dvh - 190px);
      min-height: 0;
      overflow-y: auto;
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

    #${LAUNCHER_ID} {
      position: fixed;
      right: 24px;
      bottom: 24px;
      z-index: 2147483647;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 58px;
      height: 42px;
      padding: 0 14px;
      border: 0;
      border-radius: 8px;
      color: #07150b;
      background: #36d661;
      box-shadow: 0 10px 26px rgba(0, 0, 0, 0.28);
      font: 800 14px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
      cursor: pointer;
      touch-action: manipulation;
    }

    #${LAUNCHER_ID}:hover:not(:disabled),
    #${LAUNCHER_ID}[aria-expanded="true"] {
      background: #5ee77f;
    }

    #${LAUNCHER_ID}:disabled {
      cursor: wait;
      opacity: 0.68;
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

  let launcher = null;
  let panel = null;
  let toastTimer = 0;
  let lastHref = "";
  let lastSignature = "";
  let lastState = null;
  let refreshTimer = 0;
  let fallbackFetchTimer = 0;
  let iqiyiRuntimeRetryTimer = 0;
  let iqiyiRuntimeRetryCount = 0;
  let iqiyiMetadataFetchKey = "";
  const iqiyiMetadataCache = new Map();
  let menuCommandsInstalled = false;
  let hasStarted = false;
  let isPanelOpen = false;

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

  function ensureLauncher() {
    if (launcher && launcher.isConnected) {
      return launcher;
    }

    launcher = document.getElementById(LAUNCHER_ID) || document.createElement("button");
    launcher.id = LAUNCHER_ID;
    launcher.type = "button";
    launcher.textContent = "SRT";
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
    panel.setAttribute("aria-label", "iQIYI subtitle downloads");

    if (!panel.parentElement) {
      getMountRoot().appendChild(panel);
    }

    return panel;
  }

  function renderLauncher(state) {
    ensureLauncher();

    const count = state.subtitles.length;
    const label = count > 0 ? `Show ${count} subtitle download${count === 1 ? "" : "s"}` : "Show subtitle status";
    launcher.title = label;
    launcher.setAttribute("aria-label", label);
    launcher.setAttribute("aria-expanded", isPanelOpen ? "true" : "false");
    launcher.disabled = state.source === "loading";
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
      empty.textContent = state.status === "error" ? "Could not read iQIYI page data" : state.message || "No subtitles found";
      list.appendChild(empty);
      panel.hidden = !isPanelOpen;
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

    panel.hidden = !isPanelOpen;
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
    if (isIqiyiHost()) {
      refreshFromIqiyiRuntime();
      return;
    }

    resetIqiyiRuntimeRetry();
    const state = extractStateFromDocument(document);
    renderState(state);

    window.clearTimeout(fallbackFetchTimer);
    if (!isStateHrefCurrent(state.href) || state.source === "missing") {
      fallbackFetchTimer = window.setTimeout(refreshFromFetchedPage, FETCH_STALE_DELAY_MS);
    }
  }

  function refreshFromIqiyiRuntime() {
    window.clearTimeout(fallbackFetchTimer);

    const state = extractStateFromIqiyiRuntime(window.location.href);
    if (state) {
      resetIqiyiRuntimeRetry();
      renderState(state);
      enrichIqiyiMetadata(state);
      return;
    }

    if (iqiyiRuntimeRetryCount < IQIYI_RUNTIME_MAX_RETRIES) {
      iqiyiRuntimeRetryCount += 1;
      renderState(buildState({}, [], window.location.href, "loading", "Loading subtitles..."));
      window.clearTimeout(iqiyiRuntimeRetryTimer);
      iqiyiRuntimeRetryTimer = window.setTimeout(refreshFromIqiyiRuntime, IQIYI_RUNTIME_RETRY_MS);
      return;
    }

    renderState(buildState({}, [], window.location.href, "iqiyi-runtime", "No subtitles found"));
  }

  function resetIqiyiRuntimeRetry() {
    iqiyiRuntimeRetryCount = 0;
    window.clearTimeout(iqiyiRuntimeRetryTimer);
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
      renderState(buildState({}, [], window.location.href, "error", "Could not read iQIYI page data"));
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
      renderLauncher(state);
      if (panel) {
        panel.hidden = !isPanelOpen;
      }
      return;
    }

    lastSignature = signature;
    renderLauncher(state);
    renderPanel(state);
  }

  function extractStateFromDocument(doc, href = doc.location?.href || "") {
    const data = parseNextData(doc);
    if (!data) {
      return buildState({}, [], href, "missing", "Could not read iQIYI page data");
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

  function extractStateFromIqiyiRuntime(href) {
    const data = window.QiyiPlayerProphetData;
    const dashData = data?.dashData?.data;
    const program = dashData?.program;

    if (!program || !Array.isArray(program.stl)) {
      return null;
    }

    const tvid = data.tvId || data.tvid || data.videoInfo?.tvId || data.videoInfo?.tvid;
    const metadata = tvid ? iqiyiMetadataCache.get(String(tvid)) : null;
    const videoInfo = data.videoInfo || {};
    const subtitleBaseUrl = normalizeSubtitleBaseUrl(dashData.dstl || dashData.dm || SRT_BASE_URL);
    const subtitles = normalizeSubtitles(program.stl, subtitleBaseUrl, getIqiyiSubtitleName);
    const episodeTitle = metadata?.subt || metadata?.vn || videoInfo.title || videoInfo.name || "";
    const episodeOrder = parseEpisodeOrder(metadata?.vn) || parseEpisodeOrder(videoInfo.title) || parseEpisodeOrder(episodeTitle);

    return buildState(
      {
        albumTitle: metadata?.an || videoInfo.albumName || videoInfo.album?.name || "",
        episodeTitle,
        episodeOrder,
      },
      subtitles,
      href,
      "iqiyi-runtime",
      subtitles.length ? `Found ${subtitles.length} subtitle track${subtitles.length === 1 ? "" : "s"}` : "No subtitles found",
    );
  }

  async function enrichIqiyiMetadata(state) {
    const data = window.QiyiPlayerProphetData;
    const tvid = data?.tvId || data?.tvid || data?.videoInfo?.tvId || data?.videoInfo?.tvid;
    if (!tvid) {
      return;
    }

    const key = String(tvid);
    if (iqiyiMetadataCache.has(key) || iqiyiMetadataFetchKey === key) {
      return;
    }

    iqiyiMetadataFetchKey = key;

    try {
      const response = await fetch(`https://mesh.if.iqiyi.com/player/lw/video/playervideoinfo?id=${encodeURIComponent(key)}&locale=cn_s`, {
        credentials: "include",
        headers: {
          Accept: "application/json,*/*;q=0.8",
        },
      });

      if (!response.ok) {
        throw new Error(`Metadata request failed with HTTP ${response.status}`);
      }

      const payload = await response.json();
      if (!payload?.data) {
        return;
      }

      iqiyiMetadataCache.set(key, payload.data);

      if (lastState?.href === state.href && isIqiyiHost()) {
        const updatedState = extractStateFromIqiyiRuntime(window.location.href);
        if (updatedState) {
          renderState(updatedState);
        }
      }
    } catch (error) {
      console.warn("[iQIYI Subtitle Downloader] Could not fetch iQIYI metadata.", error);
    } finally {
      if (iqiyiMetadataFetchKey === key) {
        iqiyiMetadataFetchKey = "";
      }
    }
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

  function isIqiyiHost(host = window.location.hostname) {
    return host === "iqiyi.com" || host.endsWith(".iqiyi.com");
  }

  function parseEpisodeOrder(value) {
    const text = normalizeText(value);
    const match = text.match(/(?:Episode|Ep\.?|E|第)\s*([0-9]+)\s*(?:集|话|話)?/i);
    return match ? numberValue(match[1]) : 0;
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

  function normalizeSubtitles(entries, baseUrl = SRT_BASE_URL, getSubtitleName = getDefaultSubtitleName) {
    if (!Array.isArray(entries)) {
      return [];
    }

    const seenNames = new Map();
    return entries
      .filter((entry) => entry && typeof entry.srt === "string" && entry.srt.trim())
      .map((entry) => {
        const baseName = normalizeText(getSubtitleName(entry)) || "Subtitle";
        const duplicateCount = seenNames.get(baseName) || 0;
        seenNames.set(baseName, duplicateCount + 1);

        return {
          name: duplicateCount ? `${baseName} ${duplicateCount + 1}` : baseName,
          sort: numberValue(entry._sort),
          lid: numberValue(entry.lid),
          url: new URL(entry.srt, baseUrl).toString(),
        };
      })
      .sort((left, right) => (
        compareNullableNumbers(left.sort, right.sort)
        || left.name.localeCompare(right.name)
        || left.lid - right.lid
      ));
  }

  function getDefaultSubtitleName(entry) {
    return entry._name || entry.name || `Subtitle ${entry.lid || ""}`;
  }

  function getIqiyiSubtitleName(entry) {
    const lid = numberValue(entry.lid);
    return entry._name || entry.name || IQIYI_LANGUAGE_BY_LID[lid] || `Subtitle ${entry.lid || ""}`;
  }

  function normalizeSubtitleBaseUrl(value) {
    const baseUrl = normalizeText(value) || SRT_BASE_URL;

    try {
      const url = new URL(baseUrl);
      if (url.hostname === "meta.video.iqiyi.com") {
        url.protocol = "https:";
      }

      return url.toString();
    } catch {
      return SRT_BASE_URL;
    }
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
    document.addEventListener("pointerdown", onDocumentPointerDown, true);
    document.addEventListener("keydown", onDocumentKeyDown, true);

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

  function togglePanel() {
    if (isPanelOpen) {
      hidePanel();
      return;
    }

    showPanel();
  }

  function showPanel() {
    isPanelOpen = true;
    ensurePanel();
    renderLauncher(lastState || buildState({}, [], window.location.href, "loading", "Loading subtitles..."));
    renderPanel(lastState || buildState({}, [], window.location.href, "loading", "Loading subtitles..."));
    panel.hidden = false;
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
    GM_registerMenuCommand("Refresh subtitle panel", () => {
      refreshFromDocument();
      showPanel();
    });
    GM_registerMenuCommand("Log subtitle debug info", logDebugInfo);
  }

  function logDebugInfo() {
    const debugInfo = {
      href: window.location.href,
      host: window.location.host,
      source: lastState?.source || "",
      hasNextData: Boolean(document.getElementById("__NEXT_DATA__")),
      hasQiyiPlayerProphetData: Boolean(window.QiyiPlayerProphetData),
      subtitleCount: lastState?.subtitles?.length || 0,
      albumTitle: lastState?.albumTitle || "",
      episodeTitle: lastState?.episodeTitle || "",
      launcherConnected: Boolean(launcher?.isConnected),
      panelConnected: Boolean(panel?.isConnected),
      panelOpen: isPanelOpen,
      panelHidden: Boolean(panel?.hidden),
    };

    console.info("[iQIYI Subtitle Downloader] debug", debugInfo);
    return debugInfo;
  }

  function installDebugHandle() {
    window.iqiyiSubtitleDownloaderDebug = {
      refresh: refreshFromDocument,
      getState: () => lastState,
      log: logDebugInfo,
      show: showPanel,
      hide: hidePanel,
      toggle: togglePanel,
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
    ensureLauncher();
    ensurePanel();
    hidePanel();
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
