// ==UserScript==
// @name         GagaOOLala Subtitle Downloader
// @namespace    https://www.gagaoolala.com/
// @version      0.1.2
// @updateURL    https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/gagaoolala-subtitle-downloader.user.js
// @downloadURL  https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/gagaoolala-subtitle-downloader.user.js
// @description  Adds SRT download buttons for GagaOOLala subtitle tracks.
// @author       CaoCao
// @match        https://www.gagaoolala.com/*/videos/*
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      www.gagaoolala.com
// @connect      *
// ==/UserScript==

(() => {
  "use strict";

  const PANEL_ID = "gagaoolala-subtitle-downloader-panel";
  const LAUNCHER_ID = "gagaoolala-subtitle-downloader-launcher";
  const TOAST_CLASS = "gagaoolala-subtitle-downloader-toast";
  const LIST_CLASS = "gagaoolala-subtitle-downloader-list";
  const ROW_CLASS = "gagaoolala-subtitle-downloader-row";
  const EMPTY_CLASS = "gagaoolala-subtitle-downloader-empty";
  const BUTTON_CLASS = "gagaoolala-subtitle-downloader-button";
  const TITLE_CLASS = "gagaoolala-subtitle-downloader-title";
  const STATUS_CLASS = "gagaoolala-subtitle-downloader-status";
  const ROUTE_CHECK_INTERVAL_MS = 800;
  const REFRESH_DELAY_MS = 100;
  const PLAY_ENDPOINT_PATTERN = /\/api\/v1\.0\/[^/]+\/videos\/[^/]+\/[^/?#]+\/play(?:[?#]|$)/;
  const LANGUAGE_BY_CODE = {
    en: "English",
    tc: "繁體中文",
    sc: "简体中文",
    id: "Bahasa Indonesia",
    vi: "Tiếng Việt",
    th: "ภาษาไทย",
    ja: "日本語",
    ko: "한국어",
    fr: "français",
    de: "Deutsch",
    es: "Español",
    pt: "Português",
    hi: "हिन्दी",
    "zh-Hant": "繁體中文",
    "zh-Hans": "简体中文",
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
      color: #f8f0ff;
      background: rgba(31, 18, 42, 0.95);
      border: 1px solid rgba(185, 64, 255, 0.34);
      border-radius: 8px;
      box-shadow: 0 18px 48px rgba(28, 8, 42, 0.54);
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

    #${PANEL_ID} .${STATUS_CLASS} {
      margin: -4px 0 10px;
      color: rgba(235, 212, 255, 0.72);
      font-size: 12px;
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

    #${PANEL_ID} .${ROW_CLASS} {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 12px;
      min-height: 30px;
      color: rgba(248, 240, 255, 0.9);
    }

    #${PANEL_ID} .${ROW_CLASS} span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    #${PANEL_ID} .${EMPTY_CLASS} {
      color: rgba(235, 212, 255, 0.72);
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
      color: #fff;
      background: #b940ff;
      font: 800 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
      cursor: pointer;
      touch-action: manipulation;
    }

    #${PANEL_ID} .${BUTTON_CLASS}:hover:not(:disabled) {
      background: #d16bff;
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
      color: #fff;
      background: #b940ff;
      box-shadow: 0 10px 26px rgba(185, 64, 255, 0.28);
      font: 800 14px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
      cursor: pointer;
      touch-action: manipulation;
    }

    #${LAUNCHER_ID}:hover:not(:disabled),
    #${LAUNCHER_ID}[aria-expanded="true"] {
      background: #d16bff;
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
  let refreshTimer = 0;
  let lastHref = "";
  let lastSignature = "";
  let lastState = null;
  let hasStarted = false;
  let isPanelOpen = false;
  let menuCommandsInstalled = false;
  let currentRefreshKey = 0;
  const playbackPayloadCache = new Map();

  console.info("[GagaOOLala Subtitle Downloader] started", window.location.href);
  installFetchObserver();

  function installFetchObserver() {
    if (typeof window.fetch !== "function" || window.fetch.__gagaoolalaSubtitleDownloaderWrapped) {
      return;
    }

    const originalFetch = window.fetch;
    const wrappedFetch = function fetchWithSubtitleObserver(...args) {
      const responsePromise = originalFetch.apply(this, args);
      responsePromise
        .then((response) => {
          const url = getFetchUrl(args[0], response);
          if (!PLAY_ENDPOINT_PATTERN.test(url)) {
            return;
          }

          response.clone().json()
            .then((payload) => handleObservedPlaybackPayload(url, payload))
            .catch(() => {});
        })
        .catch(() => {});

      return responsePromise;
    };

    wrappedFetch.__gagaoolalaSubtitleDownloaderWrapped = true;
    window.fetch = wrappedFetch;
  }

  function getFetchUrl(input, response) {
    if (response?.url) {
      return response.url;
    }

    if (typeof input === "string") {
      return new URL(input, window.location.origin).toString();
    }

    if (input?.url) {
      return new URL(input.url, window.location.origin).toString();
    }

    return "";
  }

  async function handleObservedPlaybackPayload(url, payload) {
    const route = parseRouteFromUrl(url) || parseCurrentRoute();
    if (!route || !payload || payload.success !== 1) {
      return;
    }

    const key = getRouteKey(route);
    playbackPayloadCache.set(key, payload);

    if (!lastState || getRouteKey(lastState) === key) {
      try {
        const tracks = await extractTracksFromPlaybackPayload(payload, route);
        renderState(buildState({
          route,
          metadata: lastState?.metadata || null,
          source: "observed-playback",
          message: tracks.length ? foundMessage(tracks.length) : "No subtitles found",
          tracks,
          playbackPayload: payload,
        }));
      } catch (error) {
        console.warn("[GagaOOLala Subtitle Downloader] Could not parse observed playback payload.", error);
      }
    }
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
    panel.setAttribute("aria-label", "GagaOOLala subtitle downloads");

    if (!panel.parentElement) {
      getMountRoot().appendChild(panel);
    }

    return panel;
  }

  function renderLauncher(state) {
    ensureLauncher();

    const count = state.tracks.length;
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

    if (state.message) {
      const status = document.createElement("div");
      status.className = STATUS_CLASS;
      status.textContent = state.message;
      panel.appendChild(status);
    }

    const list = document.createElement("div");
    list.className = LIST_CLASS;
    panel.appendChild(list);

    if (!state.tracks.length) {
      if (!state.message) {
        const empty = document.createElement("div");
        empty.className = EMPTY_CLASS;
        empty.textContent = state.status === "error" ? "Could not read GagaOOLala playback data" : "No subtitles found";
        list.appendChild(empty);
      }
      panel.hidden = !isPanelOpen;
      return;
    }

    for (const track of state.tracks) {
      const row = document.createElement("div");
      row.className = ROW_CLASS;

      const label = document.createElement("span");
      label.textContent = track.name;
      label.title = track.name;

      const button = document.createElement("button");
      button.type = "button";
      button.className = BUTTON_CLASS;
      button.textContent = track.raw ? "Raw" : "SRT";
      button.title = `Download ${track.name} subtitles as ${track.raw ? track.extension.toUpperCase() : "SRT"}`;
      button.setAttribute("aria-label", button.title);
      button.addEventListener("click", () => onDownloadClick(button, state, track));

      row.append(label, button);
      list.appendChild(row);
    }

    panel.hidden = !isPanelOpen;
  }

  async function onDownloadClick(button, state, track) {
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "...";

    try {
      const subtitle = await buildSubtitleDownload(track);
      saveBlob(subtitle.blob, buildFilename(state, track, subtitle.extension));
      showToast(`Downloading ${track.name} subtitles`);
    } catch (error) {
      console.warn("[GagaOOLala Subtitle Downloader]", error);
      try {
        await downloadRawSubtitle(track, buildFilename(state, track, track.extension || "vtt"));
        showToast(`Downloading ${track.name} subtitles`);
      } catch (downloadError) {
        console.warn("[GagaOOLala Subtitle Downloader]", downloadError);
        showToast(`Could not download ${track.name}; opening subtitle URL`);
        if (track.url) {
          window.open(track.url, "_blank", "noopener");
        }
      }
    } finally {
      button.disabled = false;
      button.textContent = originalText || "SRT";
    }
  }

  async function downloadRawSubtitle(track, filename) {
    if (!track.url) {
      throw new Error("No raw subtitle URL is available.");
    }

    if (typeof GM_download === "function") {
      await new Promise((resolve, reject) => {
        try {
          GM_download({
            url: track.url,
            name: filename,
            saveAs: false,
            onload: resolve,
            onerror: reject,
            ontimeout: reject,
          });
        } catch (error) {
          reject(error);
        }
      });
      return;
    }

    const response = await fetch(track.url, { credentials: "include" });
    if (!response.ok) {
      throw new Error(`Raw subtitle request failed with HTTP ${response.status}`);
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

  async function refreshFromPage() {
    const route = parseCurrentRoute();
    if (!route) {
      renderState(buildState({
        route: null,
        source: "error",
        message: "Open a GagaOOLala video page first",
        tracks: [],
      }));
      return;
    }

    const refreshKey = ++currentRefreshKey;
    renderState(buildState({
      route,
      source: "loading",
      message: "Loading subtitles...",
      tracks: [],
    }));

    try {
      const metadata = await fetchVideoMetadata(route);
      if (refreshKey !== currentRefreshKey) {
        return;
      }

      const cachedPayload = playbackPayloadCache.get(getRouteKey(route));
      const playbackPayload = cachedPayload || await fetchPlaybackPayload(route);
      if (refreshKey !== currentRefreshKey) {
        return;
      }

      if (!playbackPayload || playbackPayload.success !== 1) {
        renderState(buildState({
          route,
          metadata,
          source: "playback-error",
          message: normalizeText(playbackPayload?.msg) || "Could not read GagaOOLala playback data",
          tracks: [],
          playbackPayload,
        }));
        return;
      }

      playbackPayloadCache.set(getRouteKey(route), playbackPayload);
      const tracks = await extractTracksFromPlaybackPayload(playbackPayload, route);
      if (refreshKey !== currentRefreshKey) {
        return;
      }

      renderState(buildState({
        route,
        metadata,
        source: cachedPayload ? "cached-playback" : "playback",
        message: tracks.length ? foundMessage(tracks.length) : "No subtitles found",
        tracks,
        playbackPayload,
      }));
    } catch (error) {
      console.warn("[GagaOOLala Subtitle Downloader]", error);
      if (refreshKey !== currentRefreshKey) {
        return;
      }

      renderState(buildState({
        route,
        source: "error",
        message: "Could not read GagaOOLala playback data",
        tracks: [],
      }));
    }
  }

  function renderState(state) {
    lastState = state;
    const signature = JSON.stringify({
      href: state.href,
      status: state.status,
      source: state.source,
      message: state.message,
      title: state.title,
      localTitle: state.localTitle,
      tracks: state.tracks.map((track) => `${track.name}:${track.type}:${track.url}:${track.segmentUrls?.length || 0}`),
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

  function buildState({ route, metadata = null, source, message = "", tracks = [], playbackPayload = null }) {
    const titleFallback = getTitleFallback();
    const data = metadata?.data || metadata || {};
    const title = normalizeTitle(data.name) || titleFallback.title || "GagaOOLala";
    const localTitle = normalizeTitle(data.name_local);

    return {
      href: window.location.href,
      lang: route?.lang || "",
      videoId: route?.videoId || "",
      slug: route?.slug || "",
      route,
      source,
      status: source === "loading" ? "loading" : source === "error" || source === "playback-error" ? "error" : tracks.length ? "ready" : "empty",
      message,
      title,
      localTitle,
      episode: data.episode,
      season: data.season,
      metadata,
      playbackPayload,
      subtitleCount: tracks.length,
      tracks,
    };
  }

  function parseCurrentRoute() {
    return parseRouteFromUrl(window.location.href);
  }

  function parseRouteFromUrl(value) {
    try {
      const url = new URL(value, window.location.origin);
      const match = url.pathname.match(/^\/([^/]+)\/videos\/([^/]+)\/([^/?#]+)/);
      if (!match) {
        return null;
      }

      return {
        href: url.toString(),
        lang: decodeURIComponent(match[1]),
        videoId: decodeURIComponent(match[2]),
        slug: decodeURIComponent(match[3]),
      };
    } catch {
      return null;
    }
  }

  function getRouteKey(route) {
    return `${route?.lang || ""}:${route?.videoId || ""}:${route?.slug || ""}`;
  }

  async function fetchVideoMetadata(route) {
    const response = await fetch(`/api/v3.0/${encodeURIComponent(route.lang)}/videos/${encodeURIComponent(route.videoId)}/${encodeURIComponent(route.slug)}`, {
      credentials: "include",
      headers: {
        Accept: "application/json,*/*;q=0.8",
        "X-Requested-With": "XMLHttpRequest",
      },
    });

    if (!response.ok) {
      throw new Error(`Metadata request failed with HTTP ${response.status}`);
    }

    return response.json();
  }

  async function fetchPlaybackPayload(route) {
    const url = new URL(`/api/v1.0/${encodeURIComponent(route.lang)}/videos/${encodeURIComponent(route.videoId)}/${encodeURIComponent(route.slug)}/play`, window.location.origin);
    const params = new URLSearchParams(window.location.search || "");
    for (const key of ["section", "recid"]) {
      const value = params.get(key);
      if (value) {
        url.searchParams.set(key, value);
      }
    }

    const response = await fetch(`${url.pathname}${url.search}`, {
      credentials: "include",
      headers: {
        Accept: "application/json,*/*;q=0.8",
        "X-Requested-With": "XMLHttpRequest",
      },
    });

    if (!response.ok) {
      throw new Error(`Playback request failed with HTTP ${response.status}`);
    }

    return response.json();
  }

  async function extractTracksFromPlaybackPayload(payload, route) {
    const data = payload?.data || {};
    const directTracks = findDirectSubtitleTracks(data);
    const hlsTracks = data.m3u8 ? await extractHlsTracks(data.m3u8) : [];
    const dashTracks = data.dash && hlsTracks.length < 1 ? await extractDashTracks(data.dash) : [];
    return dedupeTracks([...hlsTracks, ...dashTracks, ...directTracks], route);
  }

  async function extractHlsTracks(masterUrl) {
    const text = await requestText(masterUrl);
    if (looksLikeWebVtt(text)) {
      return [normalizeTrack({
        type: "vtt",
        name: "Subtitle",
        url: masterUrl,
        extension: "srt",
        source: "hls-direct-vtt",
      })];
    }

    const tracks = [];
    for (const line of text.split(/\r?\n/)) {
      if (!line.startsWith("#EXT-X-MEDIA:")) {
        continue;
      }

      const attrs = parseAttributeList(line.slice("#EXT-X-MEDIA:".length));
      if (normalizeText(attrs.TYPE).toUpperCase() !== "SUBTITLES" || !attrs.URI) {
        continue;
      }

      tracks.push(normalizeTrack({
        type: "hls",
        name: attrs.NAME || attrs.LANGUAGE || attrs["GROUP-ID"] || "Subtitle",
        lang: attrs.LANGUAGE || "",
        groupId: attrs["GROUP-ID"] || "",
        url: new URL(attrs.URI, masterUrl).toString(),
        extension: "srt",
        source: "hls",
      }));
    }

    return tracks;
  }

  async function extractDashTracks(mpdUrl) {
    const text = await requestText(mpdUrl);
    const doc = new DOMParser().parseFromString(text, "application/xml");
    const parseError = doc.querySelector("parsererror");
    if (parseError) {
      throw new Error("Could not parse DASH manifest XML.");
    }

    const mpdBaseUrl = getTextContent(doc.querySelector("MPD > BaseURL"));
    const periodBaseUrl = getTextContent(doc.querySelector("Period > BaseURL"));
    const tracks = [];

    for (const adaptationSet of Array.from(doc.querySelectorAll("AdaptationSet"))) {
      const mimeType = normalizeText(adaptationSet.getAttribute("mimeType"));
      const contentType = normalizeText(adaptationSet.getAttribute("contentType"));
      if (!isDashSubtitleAdaptation(contentType, mimeType, adaptationSet)) {
        continue;
      }

      const lang = normalizeText(adaptationSet.getAttribute("lang"));
      const label = getTextContent(adaptationSet.querySelector("Label")) || lang || "Subtitle";
      const adaptationBase = resolveOptionalUrl(getTextContent(adaptationSet.querySelector(":scope > BaseURL")), periodBaseUrl || mpdBaseUrl || mpdUrl);
      const adaptationTemplate = adaptationSet.querySelector(":scope > SegmentTemplate");
      const representations = Array.from(adaptationSet.querySelectorAll(":scope > Representation"));
      const nodes = representations.length ? representations : [adaptationSet];

      for (const node of nodes) {
        const representationLabel = getTextContent(node.querySelector(":scope > Label")) || label;
        const representationBase = resolveOptionalUrl(getTextContent(node.querySelector(":scope > BaseURL")), adaptationBase || periodBaseUrl || mpdBaseUrl || mpdUrl);
        const template = node.querySelector(":scope > SegmentTemplate") || adaptationTemplate;
        const resolvedName = representationLabel || normalizeText(node.getAttribute("id")) || label;
        const resolvedMimeType = normalizeText(node.getAttribute("mimeType")) || mimeType;

        if (representationBase && !template) {
          tracks.push(normalizeTrack({
            type: isWebVttUrl(representationBase) || /vtt/i.test(resolvedMimeType) ? "vtt" : "raw",
            name: resolvedName,
            lang,
            url: representationBase,
            extension: isWebVttUrl(representationBase) || /vtt/i.test(resolvedMimeType) ? "srt" : extensionFromUrl(representationBase),
            raw: !(isWebVttUrl(representationBase) || /vtt/i.test(resolvedMimeType)),
            source: "dash-direct",
          }));
          continue;
        }

        if (template) {
          const segmentUrls = buildDashSegmentUrls(template, node, adaptationBase || periodBaseUrl || mpdBaseUrl || mpdUrl);
          if (segmentUrls.length) {
            tracks.push(normalizeTrack({
              type: "segments",
              name: resolvedName,
              lang,
              url: segmentUrls[0],
              segmentUrls,
              extension: "srt",
              source: "dash-segments",
            }));
          }
        }
      }
    }

    return tracks;
  }

  function isDashSubtitleAdaptation(contentType, mimeType, node) {
    const combined = `${contentType} ${mimeType} ${node.getAttribute("codecs") || ""}`.toLowerCase();
    return /\btext\b|subtitle|caption|vtt|ttml|stpp|wvtt/.test(combined);
  }

  function buildDashSegmentUrls(template, representationNode, baseUrl) {
    const media = template.getAttribute("media") || "";
    if (!media) {
      return [];
    }

    const representationId = representationNode.getAttribute("id") || "";
    const startNumber = Number(template.getAttribute("startNumber")) || 1;
    const timeline = template.querySelector("SegmentTimeline");
    const values = [];

    if (timeline) {
      let currentTime = 0;
      for (const segment of Array.from(timeline.querySelectorAll("S"))) {
        const duration = Number(segment.getAttribute("d")) || 0;
        const repeat = Number(segment.getAttribute("r")) || 0;
        if (segment.hasAttribute("t")) {
          currentTime = Number(segment.getAttribute("t")) || 0;
        }

        const count = repeat >= 0 ? repeat + 1 : 1;
        for (let index = 0; index < count; index += 1) {
          values.push(currentTime);
          currentTime += duration;
        }
      }
    } else if (media.includes("$Number$")) {
      for (let number = startNumber; number < startNumber + 500; number += 1) {
        values.push(number);
      }
    }

    return values.map((value, index) => {
      const number = startNumber + index;
      const path = media
        .replace(/\$RepresentationID\$/g, representationId)
        .replace(/\$Number(?:%0(\d+)d)?\$/g, (match, width) => padNumber(number, Number(width) || 0))
        .replace(/\$Time\$/g, String(value));

      return new URL(path, baseUrl).toString();
    });
  }

  function findDirectSubtitleTracks(value) {
    const tracks = [];
    const seen = new Set();

    function visit(node, label = "") {
      if (!node || typeof node !== "object") {
        return;
      }

      if (Array.isArray(node)) {
        node.forEach((item, index) => visit(item, `${label} ${index + 1}`));
        return;
      }

      const name = node.name || node.label || node.lang || node.language || node.title || label || "Subtitle";
      for (const [key, rawValue] of Object.entries(node)) {
        if (typeof rawValue === "string" && /subtitle|caption|vtt|srt|webvtt|text/i.test(key) && /^https?:\/\//i.test(rawValue)) {
          const normalizedUrl = rawValue.trim();
          if (!seen.has(normalizedUrl)) {
            seen.add(normalizedUrl);
            tracks.push(normalizeTrack({
              type: isWebVttUrl(normalizedUrl) ? "vtt" : "raw",
              name,
              lang: node.lang || node.language || "",
              url: normalizedUrl,
              extension: isWebVttUrl(normalizedUrl) ? "srt" : extensionFromUrl(normalizedUrl),
              raw: !isWebVttUrl(normalizedUrl),
              source: "direct",
            }));
          }
        } else if (rawValue && typeof rawValue === "object") {
          visit(rawValue, name);
        }
      }
    }

    visit(value);
    return tracks;
  }

  function dedupeTracks(tracks) {
    const seenUrls = new Set();
    const seenNames = new Map();
    return tracks
      .filter((track) => track && track.url && !seenUrls.has(track.url) && (seenUrls.add(track.url), true))
      .map((track) => {
        const baseName = normalizeTrackName(track.name, track.lang);
        const duplicateCount = seenNames.get(baseName) || 0;
        seenNames.set(baseName, duplicateCount + 1);
        return {
          ...track,
          name: duplicateCount ? `${baseName} ${duplicateCount + 1}` : baseName,
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name) || left.url.localeCompare(right.url));
  }

  function normalizeTrack(track) {
    const lang = normalizeLanguageCode(track.lang || "");
    return {
      type: track.type || "raw",
      name: normalizeTrackName(track.name, lang),
      lang,
      groupId: track.groupId || "",
      url: track.url || "",
      segmentUrls: Array.isArray(track.segmentUrls) ? track.segmentUrls : [],
      extension: track.extension || "srt",
      raw: Boolean(track.raw),
      source: track.source || "",
    };
  }

  function normalizeTrackName(name, lang) {
    const text = normalizeText(name);
    const languageName = LANGUAGE_BY_CODE[lang] || LANGUAGE_BY_CODE[normalizeLanguageCode(text)] || "";
    if (!text || text.toLowerCase() === lang.toLowerCase()) {
      return languageName || text || "Subtitle";
    }

    return LANGUAGE_BY_CODE[text] || text;
  }

  function normalizeLanguageCode(value) {
    const text = normalizeText(value);
    if (text === "zh-Hant" || text === "zh-TW") {
      return "tc";
    }

    if (text === "zh-Hans" || text === "zh-CN") {
      return "sc";
    }

    return text;
  }

  async function buildSubtitleDownload(track) {
    if (track.raw) {
      const blob = await requestBlob(track.url);
      return { blob, extension: track.extension || extensionFromUrl(track.url) };
    }

    let cues = [];
    if (track.type === "hls") {
      cues = await buildCuesFromHlsTrack(track.url);
    } else if (track.type === "segments") {
      cues = await buildCuesFromSegmentUrls(track.segmentUrls);
    } else {
      const text = await requestText(track.url);
      cues = parseWebVttCues(text);
    }

    if (!cues.length) {
      throw new Error("No WebVTT cues found.");
    }

    const srt = cuesToSrt(cues);
    return {
      blob: new Blob([srt], { type: "application/x-subrip;charset=utf-8" }),
      extension: "srt",
    };
  }

  async function buildCuesFromHlsTrack(playlistUrl) {
    const text = await requestText(playlistUrl);
    if (looksLikeWebVtt(text)) {
      return parseWebVttCues(text);
    }

    const segmentUrls = parseHlsSegmentUrls(text, playlistUrl);
    if (!segmentUrls.length) {
      return [];
    }

    return buildCuesFromSegmentUrls(segmentUrls);
  }

  async function buildCuesFromSegmentUrls(segmentUrls) {
    const cues = [];
    for (const url of segmentUrls) {
      try {
        cues.push(...parseWebVttCues(await requestText(url)));
      } catch (error) {
        console.warn("[GagaOOLala Subtitle Downloader] Could not fetch subtitle segment.", url, error);
      }
    }

    return dedupeCues(cues);
  }

  function parseHlsSegmentUrls(text, playlistUrl) {
    const urls = [];
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }

      urls.push(new URL(line, playlistUrl).toString());
    }

    return urls;
  }

  function parseWebVttCues(text) {
    const normalized = String(text || "")
      .replace(/^\uFEFF/, "")
      .replace(/\r/g, "")
      .replace(/^WEBVTT[^\n]*(?:\n|$)/i, "")
      .replace(/^X-TIMESTAMP-MAP=.*(?:\n|$)/gim, "");
    const blocks = normalized.split(/\n{2,}/);
    const cues = [];

    for (const block of blocks) {
      const lines = block.split("\n").map((line) => line.trimEnd()).filter(Boolean);
      while (lines.length && /^(NOTE|STYLE|REGION)(?:\s|$)/i.test(lines[0])) {
        lines.shift();
      }

      if (!lines.length) {
        continue;
      }

      let timingIndex = lines.findIndex((line) => line.includes("-->"));
      if (timingIndex < 0) {
        continue;
      }

      const timing = lines[timingIndex];
      const match = timing.match(/^\s*([0-9:.]+)\s+-->\s+([0-9:.]+)(?:\s+.*)?$/);
      if (!match) {
        continue;
      }

      const textLines = lines.slice(timingIndex + 1)
        .map((line) => line.replace(/<[^>]+>/g, "").trimEnd())
        .filter((line) => !/^X-TIMESTAMP-MAP=/i.test(line));
      const cueText = textLines.join("\n").trim();
      if (!cueText) {
        continue;
      }

      cues.push({
        start: parseTimestamp(match[1]),
        end: parseTimestamp(match[2]),
        text: cueText,
      });
    }

    return dedupeCues(cues);
  }

  function dedupeCues(cues) {
    const seen = new Set();
    return cues
      .filter((cue) => Number.isFinite(cue.start) && Number.isFinite(cue.end) && cue.end >= cue.start && cue.text)
      .sort((left, right) => left.start - right.start || left.end - right.end || left.text.localeCompare(right.text))
      .filter((cue) => {
        const key = `${cue.start}:${cue.end}:${cue.text}`;
        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      });
  }

  function cuesToSrt(cues) {
    return cues.map((cue, index) => [
      String(index + 1),
      `${formatSrtTimestamp(cue.start)} --> ${formatSrtTimestamp(cue.end)}`,
      cue.text,
    ].join("\n")).join("\n\n") + "\n";
  }

  function parseTimestamp(value) {
    const parts = String(value || "").split(":");
    const secondsPart = parts.pop() || "0";
    const seconds = Number(secondsPart.replace(",", "."));
    const minutes = Number(parts.pop() || 0);
    const hours = Number(parts.pop() || 0);
    if (![hours, minutes, seconds].every(Number.isFinite)) {
      return Number.NaN;
    }

    return (hours * 3600 + minutes * 60 + seconds) * 1000;
  }

  function formatSrtTimestamp(milliseconds) {
    const total = Math.max(0, Math.round(milliseconds));
    const ms = total % 1000;
    const totalSeconds = Math.floor(total / 1000);
    const seconds = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const minutes = totalMinutes % 60;
    const hours = Math.floor(totalMinutes / 60);
    return `${padNumber(hours, 2)}:${padNumber(minutes, 2)}:${padNumber(seconds, 2)},${padNumber(ms, 3)}`;
  }

  function parseAttributeList(value) {
    const attrs = {};
    let key = "";
    let text = "";
    let inQuote = false;
    let readingKey = true;

    function commit() {
      if (!key) {
        return;
      }

      attrs[key.trim()] = unquoteAttribute(text.trim());
      key = "";
      text = "";
      readingKey = true;
    }

    for (const char of String(value || "")) {
      if (readingKey && char === "=") {
        readingKey = false;
        continue;
      }

      if (!readingKey && char === "\"") {
        inQuote = !inQuote;
        text += char;
        continue;
      }

      if (!inQuote && char === ",") {
        commit();
        continue;
      }

      if (readingKey) {
        key += char;
      } else {
        text += char;
      }
    }

    commit();
    return attrs;
  }

  function unquoteAttribute(value) {
    return value.replace(/^"|"$/g, "").replace(/\\"/g, "\"");
  }

  function getTextContent(node) {
    return normalizeText(node?.textContent || "");
  }

  function resolveOptionalUrl(value, baseUrl) {
    const text = normalizeText(value);
    if (!text) {
      return "";
    }

    return new URL(text, baseUrl).toString();
  }

  function isWebVttUrl(url) {
    return /\.vtt(?:[?#]|$)|webvtt/i.test(url);
  }

  function looksLikeWebVtt(text) {
    return /^\uFEFF?WEBVTT\b/i.test(String(text || "").trimStart());
  }

  function extensionFromUrl(url) {
    try {
      const pathname = new URL(url).pathname;
      const match = pathname.match(/\.([a-z0-9]{2,5})$/i);
      return match ? match[1].toLowerCase() : "txt";
    } catch {
      return "txt";
    }
  }

  function requestText(url) {
    if (typeof GM_xmlhttpRequest === "function") {
      return new Promise((resolve, reject) => {
        try {
          GM_xmlhttpRequest({
            method: "GET",
            url,
            responseType: "text",
            headers: {
              Accept: "text/vtt,application/vnd.apple.mpegurl,application/dash+xml,text/plain,*/*;q=0.8",
            },
            onload: (response) => {
              if (response.status < 200 || response.status >= 300) {
                reject(new Error(`Request failed with HTTP ${response.status}: ${url}`));
                return;
              }

              resolve(String(response.responseText || response.response || ""));
            },
            onerror: reject,
            ontimeout: reject,
          });
        } catch (error) {
          reject(error);
        }
      });
    }

    return fetch(url, {
      credentials: "include",
      headers: {
        Accept: "text/vtt,application/vnd.apple.mpegurl,application/dash+xml,text/plain,*/*;q=0.8",
      },
    }).then((response) => {
      if (!response.ok) {
        throw new Error(`Request failed with HTTP ${response.status}: ${url}`);
      }

      return response.text();
    });
  }

  function requestBlob(url) {
    if (typeof GM_xmlhttpRequest === "function") {
      return new Promise((resolve, reject) => {
        try {
          GM_xmlhttpRequest({
            method: "GET",
            url,
            responseType: "blob",
            onload: (response) => {
              if (response.status < 200 || response.status >= 300) {
                reject(new Error(`Request failed with HTTP ${response.status}: ${url}`));
                return;
              }

              resolve(response.response);
            },
            onerror: reject,
            ontimeout: reject,
          });
        } catch (error) {
          reject(error);
        }
      });
    }

    return fetch(url, { credentials: "include" }).then((response) => {
      if (!response.ok) {
        throw new Error(`Request failed with HTTP ${response.status}: ${url}`);
      }

      return response.blob();
    });
  }

  function buildFilename(state, track, extension = "srt") {
    const episodePart = buildEpisodePart(state);
    const parts = [
      state.title || "GagaOOLala",
      episodePart,
      track.name,
    ].map(sanitizeFilenamePart).filter(Boolean);

    return `${parts.join(" - ") || "GagaOOLala Subtitles"}.${extension}`;
  }

  function buildEpisodePart(state) {
    const episode = Number(state.episode);
    if (Number.isFinite(episode) && episode > 0) {
      return `E${String(episode).padStart(2, "0")}`;
    }

    return "";
  }

  function sanitizeFilenamePart(value) {
    return normalizeText(value)
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/\s*-\s*/g, " - ")
      .replace(/(?:\s+-){2,}\s*/g, " - ")
      .replace(/\s{2,}/g, " ")
      .replace(/^[.\s-]+|[.\s-]+$/g, "");
  }

  function getTitleFallback() {
    const title = normalizeTitle(document.title).replace(/\s+-\s+Watch Online.*$/i, "");
    return {
      title: title || "GagaOOLala",
    };
  }

  function foundMessage(count) {
    return `Found ${count} subtitle track${count === 1 ? "" : "s"}`;
  }

  function scheduleRefresh(delay = REFRESH_DELAY_MS) {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(refreshFromPage, delay);
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
    renderLauncher(lastState || buildState({ route: parseCurrentRoute(), source: "loading", message: "Loading subtitles...", tracks: [] }));
    renderPanel(lastState || buildState({ route: parseCurrentRoute(), source: "loading", message: "Loading subtitles...", tracks: [] }));
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
      refreshFromPage();
      showPanel();
    });
    GM_registerMenuCommand("Log subtitle debug info", logDebugInfo);
  }

  function logDebugInfo() {
    const debugInfo = {
      href: window.location.href,
      lang: lastState?.lang || "",
      videoId: lastState?.videoId || "",
      slug: lastState?.slug || "",
      source: lastState?.source || "",
      status: lastState?.status || "",
      message: lastState?.message || "",
      title: lastState?.title || "",
      localTitle: lastState?.localTitle || "",
      subtitleCount: lastState?.tracks?.length || 0,
      tracks: lastState?.tracks || [],
      hasCachedPlaybackPayload: Boolean(lastState?.route && playbackPayloadCache.has(getRouteKey(lastState.route))),
      launcherConnected: Boolean(launcher?.isConnected),
      panelConnected: Boolean(panel?.isConnected),
      panelOpen: isPanelOpen,
      panelHidden: Boolean(panel?.hidden),
    };

    console.info("[GagaOOLala Subtitle Downloader] debug", debugInfo);
    return debugInfo;
  }

  function installDebugHandle() {
    window.gagaoolalaSubtitleDownloaderDebug = {
      refresh: refreshFromPage,
      getState: () => lastState,
      log: logDebugInfo,
      show: showPanel,
      hide: hidePanel,
      toggle: togglePanel,
    };
  }

  function showLoadingPanel() {
    renderState(buildState({
      route: parseCurrentRoute(),
      source: "loading",
      message: "Loading subtitles...",
      tracks: [],
    }));
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

  function padNumber(value, width) {
    return String(value).padStart(width, "0");
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
    refreshFromPage();
    observeNavigation();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
