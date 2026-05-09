// ==UserScript==
// @name         GagaOOLala Yomitan Subtitle Hover
// @namespace    https://www.gagaoolala.com/
// @version      1.3.0
// @description  Mirrors GagaOOLala Bitmovin subtitles into a Yomitan-friendly hover layer.
// @author       CaoCao
// @match        https://www.gagaoolala.com/*/videos/*
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        unsafeWindow
// @connect      *
// ==/UserScript==

(function () {
  "use strict";

  const STORAGE_KEY = "gagaoolala-yomitan-mirror-enabled";
  const FONT_SIZE_STORAGE_KEY = "gagaoolala-yomitan-font-size";
  const FONT_FAMILY_STORAGE_KEY = "gagaoolala-yomitan-font-family";
  const MIRROR_ID = "gagaoolala-yomitan-subtitle-mirror";
  const MIRROR_CLASS = "gagaoolala-yomitan-subtitle-mirror";
  const DOWNLOAD_BUTTON_CLASS = "gagaoolala-yomitan-subtitle-download";
  const SUBTITLE_TEXT_SELECTOR = ".bmpui-ui-subtitle-overlay .bmpui-ui-subtitle-label, .bmpui-ui-subtitle-overlay p";
  const SUBTITLE_LINE_HEIGHT = "1.28";
  const MIRROR_VERTICAL_PADDING = 8;
  const SUBTITLE_URL_PATTERN = /(?:\.vtt|\.srt|\.ttml|\.dfxp)(?:[?#]|$)|(?:subtitle|subtitles|caption|captions|texttrack|texttracks|timedtext)/i;
  const MEDIA_PLAYLIST_URL_PATTERN = /\.m3u8(?:[?#]|$)/i;
  const ABSOLUTE_URL_PATTERN = /https?:\/\/[^\s"'<>\\]+/gi;
  const RELATIVE_SUBTITLE_URL_PATTERN = /(?:\/|\.\/|\.\.\/)[^\s"'<>\\]+(?:\.vtt|\.srt|\.ttml|\.dfxp)(?:\?[^\s"'<>\\]*)?/gi;
  const RELATIVE_PLAYLIST_URL_PATTERN = /(?:\/|\.\/|\.\.\/)[^\s"'<>\\]+\.m3u8(?:\?[^\s"'<>\\]*)?/gi;
  const PAGE_WINDOW = typeof unsafeWindow === "object" && unsafeWindow ? unsafeWindow : window;
  const SCAN_SELECTOR = [
    ".bmpui-ui-subtitle-overlay",
    ".bmpui-ui-subtitle-label",
    ".bmpui-subtitle-region-container",
    ".bitmovinplayer-container",
    ".wide-player-stage",
  ].join(", ");

  const css = `
    .bmpui-ui-subtitle-overlay {
      pointer-events: none !important;
      -webkit-user-select: none !important;
      user-select: none !important;
    }

    .bmpui-ui-subtitle-overlay .bmpui-subtitle-region-container {
      pointer-events: none !important;
    }

    .bmpui-ui-subtitle-overlay .bmpui-ui-subtitle-label,
    .bmpui-ui-subtitle-overlay p {
      overflow: visible !important;
      line-height: ${SUBTITLE_LINE_HEIGHT} !important;
      padding-top: 0.04em !important;
      padding-bottom: 0.04em !important;
    }

    .bmpui-ui-subtitle-overlay .bmpui-ui-subtitle-label,
    .bmpui-ui-subtitle-overlay .bmpui-ui-subtitle-label *,
    .bmpui-ui-subtitle-overlay p {
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
      padding: 0;
      margin: 0;
      box-sizing: border-box;
      color: transparent;
      background: transparent;
      border: 0;
      text-shadow: none;
      line-height: ${SUBTITLE_LINE_HEIGHT};
      text-align: center;
      white-space: pre-wrap;
      pointer-events: none;
      -webkit-user-select: text;
      user-select: text;
    }

    .${MIRROR_CLASS}.${MIRROR_CLASS}--enabled {
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

    .${DOWNLOAD_BUTTON_CLASS} {
      width: 28px;
      height: 28px;
      margin-left: auto;
      padding: 0;
      color: #fff;
      background: rgba(255, 255, 255, 0.12);
      border: 1px solid rgba(255, 255, 255, 0.32);
      border-radius: 4px;
      font: 16px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
    }

    .${DOWNLOAD_BUTTON_CLASS}:hover,
    .${DOWNLOAD_BUTTON_CLASS}:focus {
      background: rgba(176, 79, 255, 0.72);
      border-color: rgba(255, 255, 255, 0.72);
      outline: none;
    }

    .${DOWNLOAD_BUTTON_CLASS}.${DOWNLOAD_BUTTON_CLASS}--pending {
      opacity: 0.68;
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

  if (typeof GM_addStyle === "function") {
    GM_addStyle(css);
  } else {
    const style = document.createElement("style");
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  let mirrorEnabled = getStoredValue(STORAGE_KEY, "1") !== "0";
  let subtitleFontSize = getStoredValue(FONT_SIZE_STORAGE_KEY, "");
  let subtitleFontFamily = getStoredValue(FONT_FAMILY_STORAGE_KEY, "");
  let latestSubtitleText = "";
  let mirrorEl = null;
  let mirrorTextEl = null;
  let toastTimer = 0;
  let rafId = 0;
  let downloadInjectionTimer = 0;
  const subtitleCandidates = new Map();
  const subtitleCandidatesByLanguage = new Map();

  installNetworkCapture();

  function getStoredValue(key, fallbackValue) {
    try {
      if (typeof GM_getValue === "function") {
        return GM_getValue(key, fallbackValue);
      }
    } catch (error) {
      console.warn("[GagaOOLala Yomitan]", error);
    }

    try {
      const rawValue = window.localStorage.getItem(key);
      return rawValue == null ? fallbackValue : rawValue;
    } catch (error) {
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
      console.warn("[GagaOOLala Yomitan]", error);
    }

    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      console.warn("[GagaOOLala Yomitan]", error);
    }
  }

  function deleteStoredValue(key) {
    try {
      if (typeof GM_setValue === "function") {
        GM_setValue(key, "");
        return;
      }
    } catch (error) {
      console.warn("[GagaOOLala Yomitan]", error);
    }

    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      console.warn("[GagaOOLala Yomitan]", error);
    }
  }

  function installNetworkCapture() {
    patchFetch();
    patchXMLHttpRequest();
    scanPerformanceEntries();
    scanDomSubtitleSources();
    scanBitmovinSubtitleTracks();
    window.setInterval(() => {
      scanPerformanceEntries();
      scanDomSubtitleSources();
      scanBitmovinSubtitleTracks();
    }, 1500);
  }

  function patchFetch() {
    try {
      const originalFetch = PAGE_WINDOW.fetch;
      if (typeof originalFetch !== "function" || originalFetch.__gagaoolalaYomitanPatched) return;

      const patchedFetch = function (...args) {
        const url = getRequestUrl(args[0]);
        if (url) recordSubtitleCandidate(url, { source: "fetch" });

        const responsePromise = originalFetch.apply(this, args);
        responsePromise
          .then((response) => inspectFetchResponse(response, url))
          .catch(() => {});
        return responsePromise;
      };

      Object.defineProperty(patchedFetch, "__gagaoolalaYomitanPatched", { value: true });
      PAGE_WINDOW.fetch = patchedFetch;
    } catch (error) {
      console.warn("[GagaOOLala Yomitan]", error);
    }
  }

  function patchXMLHttpRequest() {
    try {
      const XHR = PAGE_WINDOW.XMLHttpRequest;
      if (!XHR || !XHR.prototype || XHR.prototype.__gagaoolalaYomitanPatched) return;

      const originalOpen = XHR.prototype.open;
      const originalSend = XHR.prototype.send;

      XHR.prototype.open = function (method, url, ...rest) {
        this.__gagaoolalaYomitanUrl = getRequestUrl(url);
        if (this.__gagaoolalaYomitanUrl) {
          recordSubtitleCandidate(this.__gagaoolalaYomitanUrl, { source: "xhr" });
        }
        return originalOpen.call(this, method, url, ...rest);
      };

      XHR.prototype.send = function (...args) {
        try {
          this.addEventListener("load", () => inspectXHRResponse(this), { once: true });
        } catch (error) {
          console.warn("[GagaOOLala Yomitan]", error);
        }
        return originalSend.apply(this, args);
      };

      Object.defineProperty(XHR.prototype, "__gagaoolalaYomitanPatched", { value: true });
    } catch (error) {
      console.warn("[GagaOOLala Yomitan]", error);
    }
  }

  function getRequestUrl(input) {
    if (!input) return "";
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    if (typeof input.url === "string") return input.url;
    return "";
  }

  function inspectFetchResponse(response, sourceUrl) {
    try {
      if (!response || typeof response.clone !== "function") return;
      const contentType = response.headers && typeof response.headers.get === "function" ? response.headers.get("content-type") || "" : "";
      const contentLength = response.headers && typeof response.headers.get === "function" ? Number(response.headers.get("content-length") || 0) : 0;
      if (contentLength > 5000000 || !shouldInspectResponseText(sourceUrl, contentType)) return;

      response
        .clone()
        .text()
        .then((text) => inspectTextForSubtitleCandidates(text, sourceUrl, contentType))
        .catch(() => {});
    } catch (error) {
      console.warn("[GagaOOLala Yomitan]", error);
    }
  }

  function inspectXHRResponse(xhr) {
    try {
      const sourceUrl = xhr.__gagaoolalaYomitanUrl || xhr.responseURL || "";
      const contentType = typeof xhr.getResponseHeader === "function" ? xhr.getResponseHeader("content-type") || "" : "";
      if (!shouldInspectResponseText(sourceUrl, contentType) || typeof xhr.responseText !== "string") return;
      if (xhr.responseText.length > 5000000) return;
      inspectTextForSubtitleCandidates(xhr.responseText, sourceUrl, contentType);
    } catch (error) {
      console.warn("[GagaOOLala Yomitan]", error);
    }
  }

  function shouldInspectResponseText(url, contentType) {
    return isSubtitleLikeUrl(url) || isMediaPlaylistUrl(url) || /json|javascript|text|xml|vtt|srt|ttml|dfxp|mpegurl|m3u8/i.test(contentType || "");
  }

  function scanPerformanceEntries() {
    try {
      if (typeof performance === "undefined" || typeof performance.getEntriesByType !== "function") return;
      for (const entry of performance.getEntriesByType("resource")) {
        if (entry && entry.name) {
          recordSubtitleCandidate(entry.name, { source: "performance" });
        }
      }
      scheduleDownloadButtonInjection();
    } catch (error) {
      console.warn("[GagaOOLala Yomitan]", error);
    }
  }

  function scanDomSubtitleSources() {
    try {
      document.querySelectorAll("track[src], video track[src], source[src]").forEach((element) => {
        if (!(element instanceof HTMLElement)) return;
        const src = element.getAttribute("src");
        const label = element.getAttribute("label") || element.getAttribute("srclang") || element.getAttribute("lang") || "";
        if (src) recordSubtitleCandidate(src, { label, source: "dom" });
      });
    } catch (error) {
      console.warn("[GagaOOLala Yomitan]", error);
    }
  }

  function scanBitmovinSubtitleTracks() {
    try {
      for (const player of findBitmovinPlayers()) {
        recordBitmovinSubtitleTracks(player);
      }
    } catch (error) {
      console.warn("[GagaOOLala Yomitan]", error);
    }
  }

  function findBitmovinPlayers() {
    const players = new Set();
    const candidates = [
      PAGE_WINDOW.player,
      PAGE_WINDOW.bitmovinPlayer,
      PAGE_WINDOW.bitmovinplayer,
      PAGE_WINDOW.bmpui,
    ];

    for (const candidate of candidates) {
      collectBitmovinPlayers(candidate, players, 0);
    }

    for (const key of Object.keys(PAGE_WINDOW)) {
      if (!/player|bitmovin|video|gaga/i.test(key)) continue;
      collectBitmovinPlayers(PAGE_WINDOW[key], players, 0);
    }

    return Array.from(players);
  }

  function collectBitmovinPlayers(value, players, depth) {
    if (!value || depth > 2) return;
    if (looksLikeBitmovinPlayer(value)) {
      players.add(value);
      return;
    }

    if (typeof value !== "object" && typeof value !== "function") return;
    for (const key of Object.keys(value).slice(0, 80)) {
      try {
        collectBitmovinPlayers(value[key], players, depth + 1);
      } catch (error) {
        // Cross-origin or accessor-backed properties can throw; skip them.
      }
    }
  }

  function looksLikeBitmovinPlayer(value) {
    return Boolean(
      value &&
        ((value.subtitles && typeof value.subtitles.list === "function") ||
          typeof value.getAvailableSubtitles === "function" ||
          typeof value.getConfig === "function" ||
          typeof value.getSource === "function"),
    );
  }

  function recordBitmovinSubtitleTracks(player) {
    const tracks = [];

    try {
      if (player.subtitles && typeof player.subtitles.list === "function") {
        tracks.push(...normalizeArray(player.subtitles.list()));
      }
    } catch (error) {
      console.warn("[GagaOOLala Yomitan]", error);
    }

    try {
      if (typeof player.getAvailableSubtitles === "function") {
        tracks.push(...normalizeArray(player.getAvailableSubtitles()));
      }
    } catch (error) {
      console.warn("[GagaOOLala Yomitan]", error);
    }

    try {
      if (typeof player.getSource === "function") {
        collectSubtitleTracksFromObject(player.getSource(), tracks);
      }
    } catch (error) {
      console.warn("[GagaOOLala Yomitan]", error);
    }

    try {
      if (typeof player.getConfig === "function") {
        collectSubtitleTracksFromObject(player.getConfig(), tracks);
      }
    } catch (error) {
      console.warn("[GagaOOLala Yomitan]", error);
    }

    for (const track of tracks) {
      recordSubtitleTrackObject(track, "bitmovin");
    }
  }

  function normalizeArray(value) {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }

  function collectSubtitleTracksFromObject(value, tracks, depth = 0) {
    if (!value || typeof value !== "object" || depth > 4) return;
    if (Array.isArray(value)) {
      value.forEach((item) => collectSubtitleTracksFromObject(item, tracks, depth + 1));
      return;
    }

    if (Array.isArray(value.subtitleTracks)) tracks.push(...value.subtitleTracks);
    if (Array.isArray(value.subtitles)) tracks.push(...value.subtitles);
    if (Array.isArray(value.textTracks)) tracks.push(...value.textTracks);

    Object.values(value).forEach((item) => collectSubtitleTracksFromObject(item, tracks, depth + 1));
  }

  function recordSubtitleTrackObject(track, source) {
    if (!track || typeof track !== "object") return;
    const url = track.url || track.src || track.href || track.file;
    const label = track.label || track.name || track.language || track.lang || track.id || "";
    if (typeof url === "string" && url) {
      recordSubtitleCandidate(url, { label, source, isSubtitleTrack: true });
    }
  }

  function inspectTextForSubtitleCandidates(text, sourceUrl, contentType = "") {
    if (!text) return;

    if (isM3u8Text(text) || isMediaPlaylistUrl(sourceUrl)) {
      inspectM3u8ForSubtitleCandidates(text, sourceUrl);
    }

    if (/json/i.test(contentType) || /^[\s[]*[{[]/.test(text)) {
      try {
        inspectJsonForSubtitleCandidates(JSON.parse(text), sourceUrl);
      } catch (error) {
        // Some subtitle API responses are JavaScript-ish rather than strict JSON; URL regex fallback handles those.
      }
    }

    for (const url of extractSubtitleUrls(text, sourceUrl)) {
      recordSubtitleCandidate(url, { source: "response", sourceUrl });
    }
  }

  function inspectJsonForSubtitleCandidates(value, sourceUrl) {
    if (!value || typeof value !== "object") return;

    if (Array.isArray(value)) {
      value.forEach((item) => inspectJsonForSubtitleCandidates(item, sourceUrl));
      return;
    }

    const label = getFirstStringValue(value, ["label", "name", "language", "lang", "locale", "title"]);
    for (const key of ["url", "src", "href", "file", "path", "subtitle", "subtitleUrl", "subtitle_url", "captionUrl", "caption_url"]) {
      if (typeof value[key] === "string") {
        recordSubtitleCandidate(value[key], {
          label,
          source: "json",
          sourceUrl,
          isSubtitleTrack: /subtitle|caption|texttrack/i.test(key),
        });
      }
    }

    Object.values(value).forEach((item) => inspectJsonForSubtitleCandidates(item, sourceUrl));
  }

  function inspectM3u8ForSubtitleCandidates(text, sourceUrl) {
    const lines = String(text || "").split(/\r?\n/);

    for (const line of lines) {
      if (!/^#EXT-X-MEDIA:/i.test(line) || !/TYPE=SUBTITLES/i.test(line)) continue;
      const attributes = parseM3u8Attributes(line.slice(line.indexOf(":") + 1));
      const uri = attributes.URI;
      if (!uri) continue;

      const label = attributes.NAME || attributes.LANGUAGE || attributes["ASSOC-LANGUAGE"] || "";
      recordSubtitleCandidate(uri, {
        label,
        source: "m3u8",
        sourceUrl,
        isSubtitleTrack: true,
      });
    }

    if (looksLikeSubtitlePlaylist(lines)) {
      recordSubtitleCandidate(sourceUrl, {
        source: "m3u8",
        isSubtitleTrack: true,
      });
    }
  }

  function parseM3u8Attributes(value) {
    const attributes = {};
    const regex = /([A-Z0-9-]+)=("(?:[^"\\]|\\.)*"|[^,]*)/gi;
    let match = regex.exec(value);

    while (match) {
      attributes[match[1].toUpperCase()] = match[2].replace(/^"|"$/g, "");
      match = regex.exec(value);
    }

    return attributes;
  }

  function isM3u8Text(text) {
    return /^#EXTM3U\b/i.test(String(text || "").trimStart());
  }

  function looksLikeSubtitlePlaylist(lines) {
    return lines.some((line) => /\.vtt(?:[?#]|$)|\.webvtt(?:[?#]|$)/i.test(line)) || lines.some((line) => /^#EXT-X-TARGETDURATION:/i.test(line));
  }

  function getFirstStringValue(object, keys) {
    for (const key of keys) {
      if (typeof object[key] === "string" && object[key].trim()) return object[key].trim();
    }
    return "";
  }

  function extractSubtitleUrls(text, sourceUrl) {
    const urls = new Set();
    for (const match of text.matchAll(ABSOLUTE_URL_PATTERN)) {
      if (isSubtitleLikeUrl(match[0]) || isMediaPlaylistUrl(match[0])) urls.add(match[0]);
    }

    for (const match of text.matchAll(RELATIVE_SUBTITLE_URL_PATTERN)) {
      const absoluteUrl = toAbsoluteUrl(match[0], sourceUrl || location.href);
      if (absoluteUrl && isSubtitleLikeUrl(absoluteUrl)) urls.add(absoluteUrl);
    }

    for (const match of text.matchAll(RELATIVE_PLAYLIST_URL_PATTERN)) {
      const absoluteUrl = toAbsoluteUrl(match[0], sourceUrl || location.href);
      if (absoluteUrl && isMediaPlaylistUrl(absoluteUrl)) urls.add(absoluteUrl);
    }

    return urls;
  }

  function recordSubtitleCandidate(url, metadata = {}) {
    const absoluteUrl = toAbsoluteUrl(url, metadata.sourceUrl || location.href);
    const isSubtitleTrack = Boolean(metadata.isSubtitleTrack || isSubtitleLikeUrl(absoluteUrl));
    if (!absoluteUrl || (!isSubtitleTrack && !isMediaPlaylistUrl(absoluteUrl))) return;
    if (!isSubtitleTrack && isMediaPlaylistUrl(absoluteUrl)) return;

    const existing = subtitleCandidates.get(absoluteUrl) || {};
    const label = metadata.label || existing.label || inferLanguageLabel(absoluteUrl) || "";
    const languageKey = normalizeLanguageLabel(label || inferLanguageLabel(absoluteUrl));
    const track = {
      url: absoluteUrl,
      label,
      languageKey,
      extension: getSubtitleExtension(absoluteUrl),
      contentType: metadata.contentType || existing.contentType || "",
      source: metadata.source || existing.source || "unknown",
      isSubtitleTrack,
    };

    subtitleCandidates.set(absoluteUrl, track);
    if (languageKey && !subtitleCandidatesByLanguage.has(languageKey)) {
      subtitleCandidatesByLanguage.set(languageKey, track);
    }

    scheduleDownloadButtonInjection();
  }

  function toAbsoluteUrl(url, baseUrl) {
    try {
      if (!url || /^(blob|data|chrome-extension):/i.test(url)) return "";
      return new URL(String(url).replace(/\\u0026/g, "&"), baseUrl || location.href).href;
    } catch (error) {
      return "";
    }
  }

  function isSubtitleLikeUrl(url) {
    return SUBTITLE_URL_PATTERN.test(String(url || ""));
  }

  function isMediaPlaylistUrl(url) {
    return MEDIA_PLAYLIST_URL_PATTERN.test(String(url || ""));
  }

  function getSubtitleExtension(url) {
    try {
      const pathname = new URL(url, location.href).pathname.toLowerCase();
      const match = pathname.match(/\.([a-z0-9]+)$/);
      return match ? match[1] : "";
    } catch (error) {
      return "";
    }
  }

  function inferLanguageLabel(value) {
    const normalizedValue = normalizeLanguageLabel(value);
    const aliases = [
      ["english", ["english", "/en", "lang=en", "locale=en", "en-us", "en_"]],
      ["繁體中文", ["繁體中文", "traditional", "zh-hant", "zh_tw", "zh-tw", "cht", "tc"]],
      ["简体中文", ["简体中文", "simplified", "zh-hans", "zh_cn", "zh-cn", "chs", "sc"]],
      ["bahasa indonesia", ["bahasa indonesia", "indonesia", "/id", "lang=id", "locale=id"]],
      ["tiếng việt", ["tiếng việt", "vietnamese", "/vi", "lang=vi", "locale=vi"]],
      ["ภาษาไทย", ["ภาษาไทย", "thai", "/th", "lang=th", "locale=th"]],
      ["日本語", ["日本語", "japanese", "/ja", "lang=ja", "locale=ja", "/jp"]],
      ["한국어", ["한국어", "korean", "/ko", "lang=ko", "locale=ko"]],
      ["français", ["français", "francais", "french", "/fr", "lang=fr", "locale=fr"]],
      ["deutsch", ["deutsch", "german", "/de", "lang=de", "locale=de"]],
      ["español", ["español", "espanol", "spanish", "/es", "lang=es", "locale=es"]],
      ["português", ["português", "portugues", "portuguese", "/pt", "lang=pt", "locale=pt"]],
      ["हिन्दी", ["हिन्दी", "hindi", "/hi", "lang=hi", "locale=hi"]],
    ];

    for (const [label, tests] of aliases) {
      if (tests.some((test) => normalizedValue.includes(normalizeLanguageLabel(test)))) {
        return label;
      }
    }

    return "";
  }

  function normalizeLanguageLabel(label) {
    return String(label || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[✓✔←→⬇↧⤓⭳⇩↓]/g, " ")
      .replace(/\bdownload\b/gi, " ")
      .replace(/\boff\b/gi, " ")
      .replace(/[()[\]{}]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getLanguageAliases(label) {
    const key = normalizeLanguageLabel(label);
    const aliasGroups = [
      ["english", "en", "eng"],
      ["繁體中文", "traditional chinese", "zh-hant", "zh-tw", "cht", "tc"],
      ["简体中文", "simplified chinese", "zh-hans", "zh-cn", "chs", "sc"],
      ["bahasa indonesia", "indonesian", "id"],
      ["tiếng việt", "vietnamese", "vi"],
      ["ภาษาไทย", "thai", "th"],
      ["日本語", "japanese", "ja", "jp"],
      ["한국어", "korean", "ko"],
      ["français", "francais", "french", "fr"],
      ["deutsch", "german", "de"],
      ["español", "espanol", "spanish", "es"],
      ["português", "portugues", "portuguese", "pt"],
      ["हिन्दी", "hindi", "hi"],
    ];

    for (const group of aliasGroups) {
      if (group.map(normalizeLanguageLabel).includes(key)) {
        return new Set(group.map(normalizeLanguageLabel));
      }
    }

    return new Set([key]);
  }

  function findTrackForLanguage(label) {
    const aliases = getLanguageAliases(label);

    for (const alias of aliases) {
      if (subtitleCandidatesByLanguage.has(alias)) return subtitleCandidatesByLanguage.get(alias);
    }

    for (const track of subtitleCandidates.values()) {
      const searchable = normalizeLanguageLabel(`${track.label || ""} ${decodeURIComponentSafe(track.url)}`);
      for (const alias of aliases) {
        if (alias && searchableMatchesAlias(searchable, alias)) return track;
      }
    }

    if (subtitleCandidates.size === 1) {
      const onlyTrack = Array.from(subtitleCandidates.values())[0];
      return isLikelySubtitleFile(onlyTrack) ? onlyTrack : null;
    }

    return null;
  }

  function searchableMatchesAlias(searchable, alias) {
    if (alias.length <= 3 && /^[a-z0-9]+$/.test(alias)) {
      return new RegExp(`(^|[^a-z0-9])${escapeRegExp(alias)}($|[^a-z0-9])`).test(searchable);
    }
    return searchable.includes(alias);
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function isLikelySubtitleFile(track) {
    return Boolean(track && /^(vtt|srt|ttml|dfxp|m3u8)$/i.test(track.extension || ""));
  }

  function decodeURIComponentSafe(value) {
    try {
      return decodeURIComponent(value);
    } catch (error) {
      return value;
    }
  }

  function getSubtitleLabels() {
    const elements = Array.from(document.querySelectorAll(SUBTITLE_TEXT_SELECTOR));
    applySubtitleSettings(elements);
    return elements.filter((el) => {
      const text = normalizeText(el.textContent);
      const rect = el.getBoundingClientRect();
      return text && rect.width > 0 && rect.height > 0;
    });
  }

  function normalizeText(text) {
    return String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  function normalizeFontSize(value) {
    const trimmedValue = String(value || "").trim();
    if (!trimmedValue) return "";
    if (/^\d+(?:\.\d+)?$/.test(trimmedValue)) return `${trimmedValue}px`;
    if (/^\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|vmin|vmax|pt|pc|in|cm|mm|ex|ch|lh|rlh)$/i.test(trimmedValue)) {
      return trimmedValue;
    }
    return null;
  }

  function setStyleValue(el, property, value) {
    if (el.style[property] !== value) {
      el.style[property] = value;
    }
  }

  function applySubtitleSettings(elements = document.querySelectorAll(SUBTITLE_TEXT_SELECTOR)) {
    const subtitleElements = Array.from(elements).filter((el) => el instanceof HTMLElement);

    for (const el of subtitleElements) {
      setStyleValue(el, "overflow", "visible");
      setStyleValue(el, "lineHeight", SUBTITLE_LINE_HEIGHT);
      setStyleValue(el, "paddingTop", "0.04em");
      setStyleValue(el, "paddingBottom", "0.04em");
      setStyleValue(el, "fontSize", subtitleFontSize || "");
      setStyleValue(el, "fontFamily", subtitleFontFamily || "");
    }

    if (mirrorEl) {
      setStyleValue(mirrorEl, "lineHeight", SUBTITLE_LINE_HEIGHT);
      setStyleValue(mirrorEl, "fontSize", subtitleFontSize || "");
      setStyleValue(mirrorEl, "fontFamily", subtitleFontFamily || "");
    }

    if (mirrorTextEl) {
      setStyleValue(mirrorTextEl, "fontSize", subtitleFontSize || "");
      setStyleValue(mirrorTextEl, "fontFamily", subtitleFontFamily || "");
    }
  }

  function ensureMirror() {
    if (mirrorEl && mirrorTextEl) return;

    mirrorEl = document.getElementById(MIRROR_ID);
    if (!mirrorEl) {
      mirrorEl = document.createElement("div");
      mirrorEl.id = MIRROR_ID;
      mirrorEl.className = MIRROR_CLASS;
      mirrorEl.setAttribute("aria-hidden", "true");

      mirrorTextEl = document.createElement("span");
      mirrorTextEl.className = `${MIRROR_CLASS}__text`;
      mirrorEl.appendChild(mirrorTextEl);
      document.documentElement.appendChild(mirrorEl);
    } else {
      mirrorTextEl = mirrorEl.querySelector(`.${MIRROR_CLASS}__text`);
    }

    applySubtitleSettings();
  }

  function setMirrorEnabled(next) {
    mirrorEnabled = Boolean(next);
    setStoredValue(STORAGE_KEY, mirrorEnabled ? "1" : "0");
    updateMirror();
    showToast(`GagaOOLala Yomitan mirror ${mirrorEnabled ? "on" : "off"}`);
  }

  function setSubtitleFontSize() {
    const nextValue = window.prompt(
      "Subtitle font size (number = px, e.g. 42; CSS length allowed; blank resets)",
      subtitleFontSize,
    );
    if (nextValue == null) return;

    const normalizedValue = normalizeFontSize(nextValue);
    if (normalizedValue == null) {
      showToast("Invalid subtitle font size");
      return;
    }

    subtitleFontSize = normalizedValue;
    if (subtitleFontSize) {
      setStoredValue(FONT_SIZE_STORAGE_KEY, subtitleFontSize);
      showToast(`Subtitle font size set to ${subtitleFontSize}`);
    } else {
      deleteStoredValue(FONT_SIZE_STORAGE_KEY);
      showToast("Subtitle font size reset");
    }
    scheduleUpdate();
  }

  function setSubtitleFontFamily() {
    const nextValue = window.prompt(
      'Subtitle font family (e.g. "Noto Sans TC", sans-serif; blank resets)',
      subtitleFontFamily,
    );
    if (nextValue == null) return;

    subtitleFontFamily = String(nextValue || "").trim();
    if (subtitleFontFamily) {
      setStoredValue(FONT_FAMILY_STORAGE_KEY, subtitleFontFamily);
      showToast("Subtitle font family set");
    } else {
      deleteStoredValue(FONT_FAMILY_STORAGE_KEY);
      showToast("Subtitle font family reset");
    }
    scheduleUpdate();
  }

  function resetSubtitleFontSettings() {
    subtitleFontSize = "";
    subtitleFontFamily = "";
    deleteStoredValue(FONT_SIZE_STORAGE_KEY);
    deleteStoredValue(FONT_FAMILY_STORAGE_KEY);
    applySubtitleSettings();
    scheduleUpdate();
    showToast("Subtitle font settings reset");
  }

  function installMenuCommands() {
    if (typeof GM_registerMenuCommand !== "function") return;
    GM_registerMenuCommand("Set subtitle font size", setSubtitleFontSize);
    GM_registerMenuCommand("Set subtitle font family", setSubtitleFontFamily);
    GM_registerMenuCommand("Reset subtitle font settings", resetSubtitleFontSettings);
  }

  function scheduleDownloadButtonInjection() {
    if (downloadInjectionTimer) return;
    downloadInjectionTimer = window.setTimeout(() => {
      downloadInjectionTimer = 0;
      injectDownloadButtons();
    }, 80);
  }

  function injectDownloadButtons() {
    const rows = getLanguageMenuRows();

    for (const row of rows) {
      const label = getLanguageRowLabel(row);
      if (!label) continue;

      const existingButton = row.querySelector(`.${DOWNLOAD_BUTTON_CLASS}`);
      const track = findTrackForLanguage(label);

      const button = existingButton || document.createElement("button");
      button.type = "button";
      button.className = DOWNLOAD_BUTTON_CLASS;
      button.textContent = "↓";
      button.classList.toggle(`${DOWNLOAD_BUTTON_CLASS}--pending`, !track);
      button.title = track ? `Download ${label} subtitles` : `Download ${label} subtitles (track not discovered yet)`;
      button.setAttribute("aria-label", button.title);
      button.dataset.subtitleUrl = track ? track.url : "";
      button.dataset.subtitleLabel = label;

      if (!existingButton) {
        ["pointerdown", "mousedown", "touchstart"].forEach((eventName) => {
          button.addEventListener(eventName, stopDownloadButtonEvent, true);
        });
        button.addEventListener("click", (event) => {
          stopDownloadButtonEvent(event);
          scanPerformanceEntries();
          scanDomSubtitleSources();
          const nextTrack = findTrackForLanguage(button.dataset.subtitleLabel || label);
          if (!nextTrack) {
            showToast("Subtitle track not found yet");
            return;
          }
          downloadSubtitleTrack(nextTrack, button.dataset.subtitleLabel || label);
        });
        prepareLanguageRowForButton(row);
        row.appendChild(button);
      }
    }
  }

  function getLanguageMenuRows() {
    const panels = getLanguageMenuPanels();

    const rows = new Set();
    for (const panel of panels) {
      const elements = Array.from(panel.querySelectorAll("button, [role='menuitem'], li, div, span"));
      for (const element of elements) {
        if (!(element instanceof HTMLElement) || element.closest(`.${DOWNLOAD_BUTTON_CLASS}`)) continue;
        const label = getLanguageRowLabel(element);
        if (!looksLikeLanguageLabel(label)) continue;
        const row = getLanguageRowElement(element, panel);
        if (row) rows.add(row);
      }
    }

    return Array.from(rows);
  }

  function getLanguageMenuPanels() {
    const selectors = [
      ".bmpui-ui-settings-panel",
      ".bmpui-ui-settings-panel-page",
      "[class*='bmpui'][class*='settings']",
      "[class*='bmpui'][class*='menu']",
      ".bitmovinplayer-container [class*='settings']",
      ".bitmovinplayer-container [class*='menu']",
    ].join(", ");

    const panels = new Set(
      Array.from(document.querySelectorAll(selectors)).filter((el) => isElementVisible(el) && looksLikeLanguagePanel(el)),
    );

    Array.from(document.querySelectorAll("div")).forEach((el) => {
      if (isCompactVisiblePanel(el) && looksLikeLanguagePanel(el)) {
        panels.add(el);
      }
    });

    return Array.from(panels);
  }

  function stopDownloadButtonEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  function looksLikeLanguagePanel(element) {
    const text = normalizeText(element.textContent);
    if (!text || /subtitles/i.test(text)) return false;
    const normalizedText = normalizeLanguageLabel(text);
    return /\bLanguage\b/i.test(text) || Array.from(subtitleCandidates.values()).some((track) => track.label && normalizedText.includes(normalizeLanguageLabel(track.label)));
  }

  function isCompactVisiblePanel(element) {
    if (!(element instanceof HTMLElement) || !isElementVisible(element)) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < 180 || rect.width > 760 || rect.height < 120 || rect.height > window.innerHeight) return false;
    const style = window.getComputedStyle(element);
    return style.position === "absolute" || style.position === "fixed" || rect.right > window.innerWidth * 0.45;
  }

  function getLanguageRowElement(element, panel) {
    const row = element.closest("button, [role='menuitem'], li, [class*='item']");
    if (row instanceof HTMLElement && panel.contains(row)) return row;
    return element instanceof HTMLElement ? element : null;
  }

  function getLanguageRowLabel(row) {
    if (!(row instanceof HTMLElement)) return "";
    const clone = row.cloneNode(true);
    clone.querySelectorAll(`.${DOWNLOAD_BUTTON_CLASS}, svg, path`).forEach((el) => el.remove());
    return normalizeLanguageDisplayText(clone.textContent);
  }

  function normalizeLanguageDisplayText(text) {
    return String(text || "")
      .replace(/[✓✔←→⬇↧⤓⭳⇩↓]/g, " ")
      .replace(/\bDownload\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function looksLikeLanguageLabel(label) {
    const key = normalizeLanguageLabel(label);
    if (!key || key.length > 36 || key === "language") return false;
    if (/[/:]|1080|720|480|1x|auto|quality|speed|audio|subtitle|caption/i.test(key)) return false;
    if (findTrackForLanguage(label)) return true;
    return /english|中文|bahasa|indonesia|日本|한국|fran|deutsch|espa|portugu|thai|हिन्दी|tiếng|ภาษา/i.test(label);
  }

  function prepareLanguageRowForButton(row) {
    if (!(row instanceof HTMLElement)) return;
    const style = row.style;
    if (!style.display || style.display === "block") style.display = "flex";
    style.alignItems = "center";
    style.gap = style.gap || "8px";
    style.width = style.width || "100%";
  }

  function isElementVisible(element) {
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  }

  function downloadSubtitleTrack(track, label) {
    showToast(`Downloading ${label} subtitles`);
    fetchSubtitlePayload(track)
      .then(({ text, contentType }) => {
        if (!text.trim()) throw new Error("Empty subtitle response");

        inspectTextForSubtitleCandidates(text, track.url, contentType);
        const convertedText = convertVttToSrt(text);
        const extension = convertedText ? "srt" : track.extension === "m3u8" ? "vtt" : track.extension || getExtensionFromContentType(contentType) || "txt";
        const filename = createSubtitleFilename(label, extension);
        downloadTextFile(convertedText || text, filename, extension);
        showToast(`Downloaded ${label} subtitles`);
      })
      .catch((error) => {
        console.warn("[GagaOOLala Yomitan]", error);
        showToast("Subtitle download failed");
      });
  }

  function fetchSubtitlePayload(track) {
    if (track && track.extension === "m3u8") {
      return fetchHlsSubtitleText(track.url);
    }
    return fetchSubtitleText(track.url);
  }

  function fetchSubtitleText(url) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest === "function") {
        GM_xmlhttpRequest({
          method: "GET",
          url,
          headers: {
            Accept: "text/vtt, text/plain, application/x-subrip, application/xml, */*",
          },
          onload: (response) => {
            if (response.status < 200 || response.status >= 400) {
              reject(new Error(`Subtitle request failed with ${response.status}`));
              return;
            }
            resolve({
              text: response.responseText || "",
              contentType: getHeaderValue(response.responseHeaders, "content-type"),
            });
          },
          onerror: () => reject(new Error("Subtitle request failed")),
        });
        return;
      }

      fetch(url, { credentials: "include" })
        .then((response) => {
          if (!response.ok) throw new Error(`Subtitle request failed with ${response.status}`);
          return response.text().then((text) => ({
            text,
            contentType: response.headers.get("content-type") || "",
          }));
        })
        .then(resolve)
        .catch(reject);
    });
  }

  function fetchHlsSubtitleText(url) {
    return fetchSubtitleText(url).then(({ text }) => {
      const segmentUrls = extractM3u8SegmentUrls(text, url);
      if (segmentUrls.length === 0) {
        return { text, contentType: "application/vnd.apple.mpegurl" };
      }

      return Promise.all(segmentUrls.map((segmentUrl) => fetchSubtitleText(segmentUrl).then((response) => response.text))).then((segments) => ({
        text: mergeVttSegments(segments),
        contentType: "text/vtt",
      }));
    });
  }

  function extractM3u8SegmentUrls(text, playlistUrl) {
    const urls = [];
    for (const rawLine of String(text || "").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const absoluteUrl = toAbsoluteUrl(line, playlistUrl);
      if (absoluteUrl) urls.push(absoluteUrl);
    }
    return urls;
  }

  function mergeVttSegments(segments) {
    const mergedBlocks = [];

    for (const segment of segments) {
      const normalizedSegment = String(segment || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
      if (!normalizedSegment) continue;

      const blocks = normalizedSegment.split(/\n{2,}/).filter((block) => {
        const trimmedBlock = block.trim();
        return trimmedBlock && !/^WEBVTT\b/i.test(trimmedBlock) && !/^(NOTE|STYLE|REGION)\b/i.test(trimmedBlock);
      });
      mergedBlocks.push(...blocks);
    }

    return `WEBVTT\n\n${mergedBlocks.join("\n\n")}\n`;
  }

  function getHeaderValue(headers, name) {
    const match = String(headers || "").match(new RegExp(`^${name}:\\s*(.+)$`, "im"));
    return match ? match[1].trim() : "";
  }

  function getExtensionFromContentType(contentType) {
    if (/vtt/i.test(contentType)) return "vtt";
    if (/srt|subrip/i.test(contentType)) return "srt";
    if (/ttml|dfxp|xml/i.test(contentType)) return "ttml";
    return "";
  }

  function convertVttToSrt(text) {
    const normalizedText = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
    if (!/^WEBVTT\b/i.test(normalizedText) && !/-->\s*\d/.test(normalizedText)) return null;

    const blocks = normalizedText.split(/\n{2,}/);
    const cues = [];

    for (let block of blocks) {
      block = block.trim();
      if (!block || /^WEBVTT\b/i.test(block) || /^(NOTE|STYLE|REGION)\b/i.test(block)) continue;

      const lines = block.split("\n").map((line) => line.trimEnd());
      const timingIndex = lines.findIndex((line) => line.includes("-->"));
      if (timingIndex < 0) continue;

      const timing = convertVttTimingLine(lines[timingIndex]);
      const cueText = lines.slice(timingIndex + 1).join("\n").trim();
      if (!timing || !cueText) continue;
      cues.push({ timing, text: cueText });
    }

    if (cues.length === 0) return null;
    return cues.map((cue, index) => `${index + 1}\n${cue.timing}\n${cue.text}`).join("\n\n") + "\n";
  }

  function convertVttTimingLine(line) {
    const match = line.match(/^(.+?)\s+-->\s+(.+?)(?:\s+.*)?$/);
    if (!match) return "";
    const start = convertVttTimestamp(match[1]);
    const end = convertVttTimestamp(match[2]);
    return start && end ? `${start} --> ${end}` : "";
  }

  function convertVttTimestamp(value) {
    const match = String(value || "").trim().match(/^(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{3})$/);
    if (!match) return "";
    const hours = String(match[1] || "00").padStart(2, "0");
    return `${hours}:${match[2]}:${match[3]},${match[4]}`;
  }

  function createSubtitleFilename(label, extension) {
    const title = document.querySelector("h1") ? document.querySelector("h1").textContent : document.title;
    const baseName = slugify(`${title || "gagaoolala"}_${label || "subtitles"}`);
    return `${baseName || "gagaoolala_subtitles"}.${extension}`;
  }

  function slugify(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120);
  }

  function downloadTextFile(text, filename, extension) {
    const type = extension === "srt" ? "application/x-subrip;charset=utf-8" : "text/plain;charset=utf-8";
    const blobUrl = URL.createObjectURL(new Blob([text], { type }));
    const revoke = () => window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

    if (typeof GM_download === "function") {
      try {
        GM_download({
          url: blobUrl,
          name: filename,
          saveAs: false,
          onload: revoke,
          onerror: () => {
            triggerBrowserDownload(blobUrl, filename);
            revoke();
          },
        });
        return;
      } catch (error) {
        console.warn("[GagaOOLala Yomitan]", error);
      }
    }

    triggerBrowserDownload(blobUrl, filename);
    revoke();
  }

  function triggerBrowserDownload(url, filename) {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.documentElement.appendChild(link);
    link.click();
    link.remove();
  }

  function showToast(message) {
    const old = document.querySelector(`.${MIRROR_CLASS}__toast`);
    if (old) old.remove();

    const toast = document.createElement("div");
    toast.className = `${MIRROR_CLASS}__toast`;
    toast.textContent = message;
    document.documentElement.appendChild(toast);

    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.remove(), 1600);
  }

  function getSubtitleBounds(labels) {
    const rects = labels.map((el) => el.getBoundingClientRect());
    const left = Math.min(...rects.map((rect) => rect.left));
    const top = Math.min(...rects.map((rect) => rect.top));
    const right = Math.max(...rects.map((rect) => rect.right));
    const bottom = Math.max(...rects.map((rect) => rect.bottom));
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  function updateMirror() {
    ensureMirror();

    const labels = getSubtitleLabels();
    applySubtitleSettings(labels);
    const text = normalizeText(labels.map((el) => el.textContent).join("\n"));
    latestSubtitleText = text;

    mirrorEl.classList.toggle(`${MIRROR_CLASS}--enabled`, mirrorEnabled && Boolean(text));
    if (!mirrorTextEl) return;
    mirrorTextEl.textContent = text;

    if (!mirrorEnabled || !text || labels.length === 0) return;

    const bounds = getSubtitleBounds(labels);
    const verticalPadding = MIRROR_VERTICAL_PADDING;
    mirrorEl.style.left = `${bounds.left}px`;
    mirrorEl.style.top = `${Math.max(0, bounds.top - verticalPadding)}px`;
    mirrorEl.style.width = `${bounds.width}px`;
    mirrorEl.style.minHeight = `${bounds.height + verticalPadding * 2}px`;
    mirrorEl.style.paddingTop = `${verticalPadding}px`;
    mirrorEl.style.paddingBottom = `${verticalPadding}px`;

    const computed = window.getComputedStyle(labels[0]);
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
    mirrorEl.style.lineHeight = SUBTITLE_LINE_HEIGHT;
    mirrorEl.style.letterSpacing = computed.letterSpacing || "";
  }

  function scheduleUpdate() {
    if (rafId) return;
    rafId = window.requestAnimationFrame(() => {
      rafId = 0;
      updateMirror();
    });
  }

  function observeSubtitles() {
    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.target && mutation.target.closest && mutation.target.closest(SCAN_SELECTOR))) {
        scheduleUpdate();
      } else {
        scheduleUpdate();
      }
      scheduleDownloadButtonInjection();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    window.addEventListener("resize", scheduleUpdate, { passive: true });
    document.addEventListener("fullscreenchange", scheduleUpdate, true);
    window.setInterval(() => {
      const current = normalizeText(getSubtitleLabels().map((el) => el.textContent).join("\n"));
      if (current !== latestSubtitleText || mirrorEnabled) scheduleUpdate();
      scheduleDownloadButtonInjection();
    }, 500);
  }

  function installKeyboardToggle() {
    document.addEventListener(
      "keydown",
      (event) => {
        if (!event.altKey || event.shiftKey || event.ctrlKey || event.metaKey) return;
        if (event.key.toLowerCase() !== "y") return;
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
    scheduleDownloadButtonInjection();

    if (mirrorEnabled) {
      showToast("GagaOOLala Yomitan mirror on");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
