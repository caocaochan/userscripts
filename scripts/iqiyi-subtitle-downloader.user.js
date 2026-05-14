// ==UserScript==
// @name         iQIYI Subtitle SRT Downloader
// @namespace    local.iqdl
// @version      0.1.3
// @description  Add SRT download buttons beside iQIYI subtitle languages.
// @match        https://www.iq.com/play/*
// @match        https://iq.com/play/*
// @include      https://www.iq.com/play/*
// @include      https://iq.com/play/*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @connect      meta.video.iqiyi.com
// @connect      cache-video.iq.com
// @connect      www.iq.com
// @connect      iq.com
// @connect      *.iq.com
// ==/UserScript==

(function () {
  'use strict';

  const pageWindow = typeof unsafeWindow === 'undefined' ? window : unsafeWindow;
  const SUBTITLE_BASE_URL = 'https://meta.video.iqiyi.com';
  const DASH_URL_PATTERN = /(?:^https?:\/\/[^?#]+)?\/dash(?:[/?#]|$)/i;
  const SCRIPT_PREFIX = 'iqdl';
  const DEBUG = false;
  const SCAN_INTERVAL_FAST_MS = 800;
  const SCAN_INTERVAL_SLOW_MS = 5000;
  const ROUTE_CHECK_INTERVAL_MS = 1000;
  const INLINE_REFRESH_DELAY_MS = 100;

  const LID_TAGS = new Map([
    ['1', 'zh-Hans'],
    ['2', 'zh-Hant'],
    ['3', 'en'],
    ['4', 'ko'],
    ['5', 'ja'],
    ['18', 'th'],
    ['21', 'ms'],
    ['23', 'vi'],
    ['24', 'id'],
    ['26', 'es'],
    ['28', 'ar'],
  ]);

  const state = {
    subtitles: new Map(),
    lastUrl: location.href,
    scanTimer: 0,
    scanStartedAt: Date.now(),
    inlineRefreshTimer: 0,
    menuOpen: false,
    observer: null,
  };

  debug('startup', {
    url: location.href,
    hasGmXmlHttpRequest: typeof GM_xmlhttpRequest === 'function',
    hasUnsafeWindow: typeof unsafeWindow !== 'undefined',
    readyState: document.readyState,
  });

  installNetworkHooks();
  installRouteHooks();
  startGlobalScan();
  waitForBody(() => {
    injectStyles();
    createFallbackUi();
    installMutationObserver();
    scheduleInlineRefresh();
    updateFallbackUi();
  });

  function installNetworkHooks() {
    patchFetch();
    patchXhr();
  }

  function patchFetch() {
    const originalFetch = pageWindow.fetch;
    if (typeof originalFetch !== 'function' || originalFetch.__iqdlPatched) {
      return;
    }

    function iqdlFetch(input, init) {
      const url = getFetchUrl(input);
      const responsePromise = originalFetch.apply(this, arguments);

      if (isDashUrl(url)) {
        responsePromise
          .then((response) => {
            if (!response || typeof response.clone !== 'function') {
              return;
            }
            response.clone().text()
              .then((text) => handlePotentialDashText(text, url))
              .catch(noop);
          })
          .catch(noop);
      }

      return responsePromise;
    }

    iqdlFetch.__iqdlPatched = true;
    iqdlFetch.__iqdlOriginal = originalFetch;
    pageWindow.fetch = iqdlFetch;
  }

  function patchXhr() {
    const Xhr = pageWindow.XMLHttpRequest;
    if (!Xhr || !Xhr.prototype || Xhr.prototype.open.__iqdlPatched) {
      return;
    }

    const originalOpen = Xhr.prototype.open;
    const originalSend = Xhr.prototype.send;

    Xhr.prototype.open = function iqdlOpen(method, url) {
      this.__iqdlUrl = String(url || '');
      return originalOpen.apply(this, arguments);
    };

    Xhr.prototype.open.__iqdlPatched = true;

    Xhr.prototype.send = function iqdlSend() {
      if (isDashUrl(this.__iqdlUrl)) {
        this.addEventListener('loadend', () => {
          try {
            if (this.responseType === 'json' && this.response) {
              handlePotentialDashData(this.response, this.__iqdlUrl);
              return;
            }
            const text = this.responseText;
            if (text) {
              handlePotentialDashText(text, this.__iqdlUrl);
            }
          } catch (error) {
            noop(error);
          }
        });
      }
      return originalSend.apply(this, arguments);
    };
  }

  function installRouteHooks() {
    const originalPushState = pageWindow.history && pageWindow.history.pushState;
    const originalReplaceState = pageWindow.history && pageWindow.history.replaceState;

    if (typeof originalPushState === 'function' && !originalPushState.__iqdlPatched) {
      pageWindow.history.pushState = function iqdlPushState() {
        const result = originalPushState.apply(this, arguments);
        setTimeout(checkRouteChange, 0);
        return result;
      };
      pageWindow.history.pushState.__iqdlPatched = true;
    }

    if (typeof originalReplaceState === 'function' && !originalReplaceState.__iqdlPatched) {
      pageWindow.history.replaceState = function iqdlReplaceState() {
        const result = originalReplaceState.apply(this, arguments);
        setTimeout(checkRouteChange, 0);
        return result;
      };
      pageWindow.history.replaceState.__iqdlPatched = true;
    }

    pageWindow.addEventListener('popstate', checkRouteChange);
    setInterval(checkRouteChange, ROUTE_CHECK_INTERVAL_MS);
  }

  function checkRouteChange() {
    if (state.lastUrl === location.href) {
      return;
    }

    state.lastUrl = location.href;
    state.subtitles.clear();
    state.scanStartedAt = Date.now();
    closeFallbackMenu();
    removeInlineButtons();
    startGlobalScan();
    updateFallbackUi();
    scheduleInlineRefresh();
  }

  function startGlobalScan() {
    if (state.scanTimer) {
      clearInterval(state.scanTimer);
    }

    scanKnownGlobals();
    state.scanTimer = setInterval(() => {
      scanKnownGlobals();
      if (state.subtitles.size > 0 && Date.now() - state.scanStartedAt > 10000) {
        clearInterval(state.scanTimer);
        state.scanTimer = setInterval(scanKnownGlobals, SCAN_INTERVAL_SLOW_MS);
      }
    }, SCAN_INTERVAL_FAST_MS);
  }

  function scanKnownGlobals() {
    const roots = [
      pageWindow.playerObject,
      pageWindow.__NEXT_DATA__,
      pageWindow.__NUXT__,
      pageWindow.QiyiPlayerProphetData,
      pageWindow.QiyiPlayer,
    ].filter(Boolean);

    for (const root of roots) {
      const containers = findSubtitleContainers(root);
      for (const container of containers) {
        mergeSubtitlesFromProgram(container.program, container.dstl, 'global');
      }
    }
  }

  function findSubtitleContainers(root) {
    const found = [];
    const seen = new WeakSet();
    const queue = [{ value: root, depth: 0, dstl: '' }];
    let visited = 0;

    while (queue.length > 0 && visited < 5000) {
      const item = queue.shift();
      const value = item.value;
      visited += 1;

      if (!value || typeof value !== 'object' || seen.has(value) || item.depth > 8) {
        continue;
      }
      seen.add(value);

      const directProgram = value.program && typeof value.program === 'object' ? value.program : null;
      const dataProgram = value.data && value.data.program && typeof value.data.program === 'object'
        ? value.data.program
        : null;
      const dstl = value.dstl || (value.data && value.data.dstl) || item.dstl || '';

      if (directProgram && Array.isArray(directProgram.stl)) {
        found.push({ program: directProgram, dstl });
      }
      if (dataProgram && Array.isArray(dataProgram.stl)) {
        found.push({ program: dataProgram, dstl });
      }

      let keys = [];
      try {
        keys = Object.keys(value);
      } catch (error) {
        noop(error);
        continue;
      }

      for (const key of keys) {
        if (key === 'window' || key === 'document' || key === 'parent' || key === 'top') {
          continue;
        }
        let child;
        try {
          child = value[key];
        } catch (error) {
          noop(error);
          continue;
        }
        if (child && typeof child === 'object') {
          queue.push({ value: child, depth: item.depth + 1, dstl });
        }
      }
    }

    return found;
  }

  function handlePotentialDashText(text, sourceUrl) {
    const data = parseMaybeJson(text);
    if (data) {
      handlePotentialDashData(data, sourceUrl);
    }
  }

  function handlePotentialDashData(data, sourceUrl) {
    const payload = data && data.data ? data.data : data;
    if (!payload || !payload.program || !Array.isArray(payload.program.stl)) {
      const containers = findSubtitleContainers(payload);
      for (const container of containers) {
        mergeSubtitlesFromProgram(container.program, container.dstl, sourceUrl || 'dash');
      }
      return;
    }

    mergeSubtitlesFromProgram(payload.program, payload.dstl, sourceUrl || 'dash');
  }

  function mergeSubtitlesFromProgram(program, dstl, sourceLabel) {
    if (!program || !Array.isArray(program.stl)) {
      return;
    }

    let changed = false;
    for (const rawSubtitle of program.stl) {
      const subtitle = normalizeSubtitle(rawSubtitle, dstl);
      if (!subtitle || !subtitle.url) {
        continue;
      }

      const existing = state.subtitles.get(subtitle.id);
      if (!existing || existing.url !== subtitle.url || existing.name !== subtitle.name) {
        state.subtitles.set(subtitle.id, subtitle);
        changed = true;
      }
    }

    if (changed) {
      debug(`subtitles updated from ${sourceLabel}`, Array.from(state.subtitles.values()));
      updateFallbackUi();
      scheduleInlineRefresh();
    }
  }

  function normalizeSubtitle(rawSubtitle, dstl) {
    if (!rawSubtitle || typeof rawSubtitle !== 'object') {
      return null;
    }

    const lid = rawSubtitle.lid == null ? '' : String(rawSubtitle.lid);
    const mappedCode = LID_TAGS.get(lid);
    const code = mappedCode || (lid ? `lid-${lid}` : 'unknown');
    const isAi = rawSubtitle.ss === 1 || rawSubtitle.ss === '1';
    const rawName = String(rawSubtitle._name || rawSubtitle.name || mappedCode || lid || 'Subtitle').trim();
    const name = isAi && !/\(ai\)$/i.test(rawName) ? `${rawName} (AI)` : rawName;
    const urlPath = rawSubtitle.srt || rawSubtitle.webvtt || rawSubtitle.url || '';
    const sourceFormat = rawSubtitle.srt ? 'srt' : rawSubtitle.webvtt ? 'vtt' : 'unknown';
    const url = buildSubtitleUrl(urlPath, dstl);

    return {
      id: `${lid || code}:${sourceFormat}:${url}`,
      lid,
      code,
      name,
      isAi,
      url,
      sourceFormat,
    };
  }

  function buildSubtitleUrl(path, baseUrl) {
    if (!path || typeof path !== 'string') {
      return '';
    }

    try {
      return new URL(path, baseUrl || SUBTITLE_BASE_URL).href;
    } catch (error) {
      return '';
    }
  }

  function installMutationObserver() {
    if (!document.body || state.observer) {
      return;
    }

    state.observer = new MutationObserver(() => scheduleInlineRefresh());
    state.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'aria-hidden'],
    });
  }

  function scheduleInlineRefresh() {
    if (state.inlineRefreshTimer) {
      clearTimeout(state.inlineRefreshTimer);
    }

    state.inlineRefreshTimer = setTimeout(() => {
      state.inlineRefreshTimer = 0;
      injectInlineButtons();
    }, INLINE_REFRESH_DELAY_MS);
  }

  function injectInlineButtons() {
    if (!document.body || state.subtitles.size === 0) {
      return;
    }

    const subtitles = Array.from(state.subtitles.values());
    const candidates = document.body.querySelectorAll([
      'li',
      '[role="menuitem"]',
      '[role="option"]',
      '[class*="subtitle" i]',
      '[class*="language" i]',
      '[class*="lang" i]',
      '[class*="item" i]',
    ].join(','));

    for (const candidate of candidates) {
      if (!(candidate instanceof HTMLElement) || candidate.closest(`.${SCRIPT_PREFIX}-menu, .${SCRIPT_PREFIX}-floating-button, .${SCRIPT_PREFIX}-toast`)) {
        continue;
      }

      const row = candidate.closest('li,[role="menuitem"],[role="option"]') || candidate;
      if (!(row instanceof HTMLElement) || row.querySelector(`.${SCRIPT_PREFIX}-download-sub-btn`)) {
        continue;
      }

      if (!isLikelySubtitleMenuRow(row)) {
        continue;
      }

      const matchedSubtitle = findSubtitleForElement(row, subtitles);
      if (!matchedSubtitle) {
        continue;
      }

      row.appendChild(createInlineButton(matchedSubtitle));
      row.classList.add(`${SCRIPT_PREFIX}-inline-row`);
    }
  }

  function isLikelySubtitleMenuRow(element) {
    if (!isVisible(element) || element.closest('header, footer, nav')) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width < 20 || rect.width > 700 || rect.height < 12 || rect.height > 100) {
      return false;
    }
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      return false;
    }

    const text = normalizeText(element.textContent || '');
    if (!text || text.length > 140) {
      return false;
    }

    const style = getComputedStyle(element);
    const hasOverlayPosition = hasPositionedAncestor(element);
    const classHint = /subtitle|caption|language|lang|menu|popup|pop|control|setting|option|item/i.test(element.className || '');
    const roleHint = /menuitem|option/i.test(element.getAttribute('role') || '');
    const positioned = /absolute|fixed|sticky/.test(style.position);

    return hasOverlayPosition || classHint || roleHint || positioned;
  }

  function hasPositionedAncestor(element) {
    let current = element.parentElement;
    let depth = 0;
    while (current && depth < 6) {
      if (current.closest('header, footer, nav')) {
        return false;
      }
      const style = getComputedStyle(current);
      if (/absolute|fixed|sticky/.test(style.position)) {
        return true;
      }
      current = current.parentElement;
      depth += 1;
    }
    return false;
  }

  function findSubtitleForElement(element, subtitles) {
    const elementText = normalizeText(element.textContent || '');
    for (const subtitle of subtitles) {
      const name = normalizeText(subtitle.name);
      const nameWithoutAi = normalizeText(subtitle.name.replace(/\s*\(ai\)\s*$/i, ''));

      if (name && elementText.includes(name)) {
        return subtitle;
      }
      if (nameWithoutAi && elementText.includes(nameWithoutAi)) {
        return subtitle;
      }

      const code = normalizeText(subtitle.code);
      if (code.length > 2 && elementText.includes(code)) {
        return subtitle;
      }
      if (code.length <= 2 && new RegExp(`(^|\\s|\\()${escapeRegExp(code)}(\\s|\\)|$)`, 'i').test(elementText)) {
        return subtitle;
      }
    }
    return null;
  }

  function createInlineButton(subtitle) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `${SCRIPT_PREFIX}-download-sub-btn`;
    button.textContent = '↓';
    button.title = `Download ${subtitle.name} subtitles as SRT`;
    button.disabled = !subtitle.url;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!button.disabled) {
        downloadSubtitle(subtitle);
      }
    });
    return button;
  }

  function removeInlineButtons() {
    document.querySelectorAll(`.${SCRIPT_PREFIX}-download-sub-btn`).forEach((button) => {
      const row = button.parentElement;
      button.remove();
      if (row) {
        row.classList.remove(`${SCRIPT_PREFIX}-inline-row`);
      }
    });
  }

  function createFallbackUi() {
    if (document.querySelector(`.${SCRIPT_PREFIX}-floating-button`)) {
      return;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = `${SCRIPT_PREFIX}-floating-button`;
    button.textContent = 'SRT';
    button.title = 'Download iQIYI subtitles as SRT';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleFallbackMenu();
    });

    const menu = document.createElement('div');
    menu.className = `${SCRIPT_PREFIX}-menu`;
    menu.hidden = true;

    document.body.append(button, menu);
    document.addEventListener('click', (event) => {
      if (!(event.target instanceof Node)) {
        return;
      }
      if (!button.contains(event.target) && !menu.contains(event.target)) {
        closeFallbackMenu();
      }
    }, true);
  }

  function updateFallbackUi() {
    if (!document.body) {
      return;
    }

    const button = document.querySelector(`.${SCRIPT_PREFIX}-floating-button`);
    const menu = document.querySelector(`.${SCRIPT_PREFIX}-menu`);
    if (!(button instanceof HTMLButtonElement) || !(menu instanceof HTMLElement)) {
      return;
    }

    const shouldShow = /\/play\//i.test(location.pathname) || state.subtitles.size > 0;
    button.hidden = !shouldShow;
    button.classList.toggle(`${SCRIPT_PREFIX}-has-subtitles`, state.subtitles.size > 0);
    button.title = state.subtitles.size > 0
      ? 'Download iQIYI subtitles as SRT'
      : 'No iQIYI subtitles found yet';

    renderFallbackMenu();
  }

  function toggleFallbackMenu() {
    const menu = document.querySelector(`.${SCRIPT_PREFIX}-menu`);
    if (!(menu instanceof HTMLElement)) {
      return;
    }

    state.menuOpen = menu.hidden;
    renderFallbackMenu();
    menu.hidden = !state.menuOpen;
  }

  function closeFallbackMenu() {
    state.menuOpen = false;
    const menu = document.querySelector(`.${SCRIPT_PREFIX}-menu`);
    if (menu instanceof HTMLElement) {
      menu.hidden = true;
    }
  }

  function renderFallbackMenu() {
    const menu = document.querySelector(`.${SCRIPT_PREFIX}-menu`);
    if (!(menu instanceof HTMLElement)) {
      return;
    }

    menu.textContent = '';

    const header = document.createElement('div');
    header.className = `${SCRIPT_PREFIX}-menu-title`;
    header.textContent = 'Subtitles';
    menu.appendChild(header);

    const subtitles = Array.from(state.subtitles.values());
    if (subtitles.length === 0) {
      const empty = document.createElement('div');
      empty.className = `${SCRIPT_PREFIX}-menu-empty`;
      empty.textContent = 'No subtitles found yet';
      menu.appendChild(empty);
      return;
    }

    for (const subtitle of subtitles) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `${SCRIPT_PREFIX}-menu-item`;
      item.textContent = `${subtitle.name} (${subtitle.code})`;
      item.title = `Download ${subtitle.name} subtitles as SRT`;
      item.disabled = !subtitle.url;
      item.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        downloadSubtitle(subtitle);
        closeFallbackMenu();
      });
      menu.appendChild(item);
    }
  }

  async function downloadSubtitle(subtitle) {
    if (!subtitle || !subtitle.url) {
      showToast('Subtitle URL is missing');
      return;
    }

    try {
      const rawText = await requestText(subtitle.url);
      if (!rawText.trim()) {
        throw new Error(`Empty subtitle response: ${subtitle.url}`);
      }

      const looksVtt = /^\uFEFF?\s*WEBVTT(?:\s|$)/i.test(rawText);
      let srtText;

      if (subtitle.sourceFormat === 'vtt' || looksVtt) {
        srtText = convertVttToSrt(rawText);
        if (!srtText) {
          if (looksLikeSrt(rawText)) {
            srtText = normalizeSrt(rawText);
          } else {
            showToast('Subtitle conversion failed');
            return;
          }
        }
      } else {
        srtText = normalizeSrt(rawText);
      }

      const filename = buildFilename(subtitle);
      saveTextFile(filename, srtText);
    } catch (error) {
      console.error(`[${SCRIPT_PREFIX}] subtitle download failed`, error);
      showToast('Subtitle download failed');
    }
  }

  function requestText(url) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest === 'function') {
        GM_xmlhttpRequest({
          method: 'GET',
          url,
          responseType: 'text',
          onload(response) {
            const status = Number(response.status || 0);
            const responseText = String(response.responseText || '');

            if (status >= 200 && status < 300) {
              if (!responseText.trim()) {
                reject(new Error(`Empty response from ${url}`));
                return;
              }
              resolve(responseText);
            } else {
              reject(new Error(`GM_xmlhttpRequest HTTP ${status || 'unknown'} from ${url}`));
            }
          },
          onerror(error) {
            reject(new Error(`GM_xmlhttpRequest network error from ${url}: ${formatRequestError(error)}`));
          },
          ontimeout(error) {
            reject(new Error(`GM_xmlhttpRequest timeout from ${url}: ${formatRequestError(error)}`));
          },
        });
        return;
      }

      debug('GM_xmlhttpRequest unavailable; falling back to fetch', { url });
      fetch(url, { credentials: 'include' })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`fetch HTTP ${response.status} from ${url}`);
          }
          return response.text();
        })
        .then((text) => {
          if (!text.trim()) {
            throw new Error(`Empty fetch response from ${url}`);
          }
          return text;
        })
        .then(resolve)
        .catch((error) => {
          reject(new Error(`GM_xmlhttpRequest unavailable; fetch failed from ${url}: ${formatRequestError(error)}`));
        });
    });
  }

  function formatRequestError(error) {
    if (!error) {
      return 'unknown error';
    }
    if (error instanceof Error) {
      return error.message;
    }
    try {
      return JSON.stringify(error);
    } catch (jsonError) {
      noop(jsonError);
      return String(error);
    }
  }

  function normalizeSrt(text) {
    return String(text || '')
      .replace(/^\uFEFF/, '')
      .replace(/\r\n?/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .concat('\n');
  }

  function looksLikeSrt(text) {
    return /\d+\s*\n\s*\d{2}:\d{2}:\d{2},\d{3}\s+-->\s+\d{2}:\d{2}:\d{2},\d{3}/.test(String(text || ''));
  }

  function convertVttToSrt(text) {
    const normalized = String(text || '')
      .replace(/^\uFEFF/, '')
      .replace(/\r\n?/g, '\n')
      .trim();

    if (!normalized) {
      return '';
    }

    const blocks = normalized.split(/\n{2,}/);
    const output = [];
    let index = 1;

    for (const block of blocks) {
      const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
      if (lines.length === 0) {
        continue;
      }

      const first = lines[0].toUpperCase();
      if (first.startsWith('WEBVTT') || first.startsWith('NOTE') || first.startsWith('STYLE') || first.startsWith('REGION')) {
        continue;
      }

      let timeLineIndex = lines.findIndex((line) => line.includes('-->'));
      if (timeLineIndex < 0) {
        continue;
      }

      const timeLine = convertVttTimestampLine(lines[timeLineIndex]);
      if (!timeLine) {
        continue;
      }

      const cueText = lines
        .slice(timeLineIndex + 1)
        .join('\n')
        .replace(/<v(?:\s+[^>]*)?>/gi, '')
        .replace(/<\/v>/gi, '')
        .trim();

      if (!cueText) {
        continue;
      }

      output.push(`${index}\n${timeLine}\n${cueText}`);
      index += 1;
    }

    return output.length ? `${output.join('\n\n')}\n` : '';
  }

  function convertVttTimestampLine(line) {
    const match = String(line || '').match(/^(.+?)\s+-->\s+(.+?)(?:\s+.*)?$/);
    if (!match) {
      return '';
    }

    const start = convertVttTimestamp(match[1]);
    const end = convertVttTimestamp(match[2]);
    if (!start || !end) {
      return '';
    }

    return `${start} --> ${end}`;
  }

  function convertVttTimestamp(value) {
    const match = String(value || '').trim().match(/^(?:(\d{1,}):)?(\d{2}):(\d{2})\.(\d{3})$/);
    if (!match) {
      return '';
    }

    const hours = match[1] == null ? '00' : match[1].padStart(2, '0');
    return `${hours}:${match[2]}:${match[3]},${match[4]}`;
  }

  function saveTextFile(filename, text) {
    const blob = new Blob([text], { type: 'application/x-subrip;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.srt') ? filename : `${filename}.srt`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function buildFilename(subtitle) {
    const title = getVideoTitle();
    return `${sanitizeFilename(title)}.${sanitizeFilename(subtitle.code || 'subtitle')}.srt`;
  }

  function getVideoTitle() {
    const titleCandidates = [
      document.querySelector('h1'),
      document.querySelector('[class*="title" i]'),
      document.querySelector('[class*="name" i]'),
    ];

    for (const candidate of titleCandidates) {
      const text = candidate && candidate.textContent ? candidate.textContent.trim() : '';
      if (text && text.length <= 160) {
        return text;
      }
    }

    const documentTitle = document.title
      .replace(/\s*[|–-]\s*iQIYI.*$/i, '')
      .replace(/\s*[|–-]\s*iQ\.com.*$/i, '')
      .trim();

    return documentTitle || 'iqiyi-subtitle';
  }

  function sanitizeFilename(value) {
    return String(value || 'subtitle')
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'subtitle';
  }

  function parseMaybeJson(text) {
    if (!text || typeof text !== 'string') {
      return null;
    }

    const trimmed = text.trim();
    const attempts = [trimmed];
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      attempts.push(trimmed.slice(firstBrace, lastBrace + 1));
    }

    for (const attempt of attempts) {
      try {
        return JSON.parse(attempt);
      } catch (error) {
        noop(error);
      }
    }

    return null;
  }

  function getFetchUrl(input) {
    if (typeof input === 'string') {
      return input;
    }
    if (input && typeof input.url === 'string') {
      return input.url;
    }
    return '';
  }

  function isDashUrl(url) {
    return DASH_URL_PATTERN.test(String(url || ''));
  }

  function debug(...args) {
    if (DEBUG) {
      console.debug(`[${SCRIPT_PREFIX}]`, ...args);
    }
  }

  function waitForBody(callback) {
    if (document.body) {
      callback();
      return;
    }

    const timer = setInterval(() => {
      if (document.body) {
        clearInterval(timer);
        callback();
      }
    }, 50);
  }

  function injectStyles() {
    if (document.getElementById(`${SCRIPT_PREFIX}-styles`)) {
      return;
    }

    const style = document.createElement('style');
    style.id = `${SCRIPT_PREFIX}-styles`;
    style.textContent = `
      .${SCRIPT_PREFIX}-inline-row {
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
      }

      .${SCRIPT_PREFIX}-download-sub-btn {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        flex: 0 0 auto !important;
        width: 22px !important;
        height: 22px !important;
        min-width: 22px !important;
        margin-left: auto !important;
        padding: 0 !important;
        border: 1px solid rgba(255, 255, 255, 0.38) !important;
        border-radius: 4px !important;
        background: rgba(0, 0, 0, 0.54) !important;
        color: #fff !important;
        font: 700 14px/1 Arial, sans-serif !important;
        cursor: pointer !important;
        opacity: 0.9 !important;
      }

      .${SCRIPT_PREFIX}-download-sub-btn:hover {
        background: rgba(18, 130, 72, 0.95) !important;
        border-color: rgba(255, 255, 255, 0.7) !important;
      }

      .${SCRIPT_PREFIX}-download-sub-btn:disabled {
        opacity: 0.45 !important;
        cursor: not-allowed !important;
      }

      .${SCRIPT_PREFIX}-floating-button {
        position: fixed !important;
        right: 18px !important;
        bottom: 108px !important;
        z-index: 2147483646 !important;
        width: 48px !important;
        height: 34px !important;
        border: 1px solid rgba(255, 255, 255, 0.22) !important;
        border-radius: 6px !important;
        background: rgba(20, 20, 20, 0.82) !important;
        color: #fff !important;
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.28) !important;
        font: 700 13px/1 Arial, sans-serif !important;
        cursor: pointer !important;
      }

      .${SCRIPT_PREFIX}-floating-button.${SCRIPT_PREFIX}-has-subtitles {
        background: rgba(18, 130, 72, 0.95) !important;
      }

      .${SCRIPT_PREFIX}-menu {
        position: fixed !important;
        right: 18px !important;
        bottom: 148px !important;
        z-index: 2147483647 !important;
        min-width: 220px !important;
        max-width: 320px !important;
        max-height: min(420px, 70vh) !important;
        overflow: auto !important;
        padding: 8px !important;
        border: 1px solid rgba(255, 255, 255, 0.14) !important;
        border-radius: 8px !important;
        background: rgba(18, 18, 18, 0.96) !important;
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.4) !important;
        color: #fff !important;
        font: 13px/1.35 Arial, sans-serif !important;
      }

      .${SCRIPT_PREFIX}-menu-title {
        padding: 4px 8px 8px !important;
        color: rgba(255, 255, 255, 0.72) !important;
        font: 700 12px/1 Arial, sans-serif !important;
        text-transform: uppercase !important;
      }

      .${SCRIPT_PREFIX}-menu-empty {
        padding: 10px 8px !important;
        color: rgba(255, 255, 255, 0.74) !important;
      }

      .${SCRIPT_PREFIX}-menu-item {
        display: block !important;
        width: 100% !important;
        min-height: 32px !important;
        padding: 7px 8px !important;
        border: 0 !important;
        border-radius: 5px !important;
        background: transparent !important;
        color: #fff !important;
        text-align: left !important;
        font: 13px/1.25 Arial, sans-serif !important;
        cursor: pointer !important;
      }

      .${SCRIPT_PREFIX}-menu-item:hover {
        background: rgba(255, 255, 255, 0.1) !important;
      }

      .${SCRIPT_PREFIX}-menu-item:disabled {
        color: rgba(255, 255, 255, 0.45) !important;
        cursor: not-allowed !important;
      }

      .${SCRIPT_PREFIX}-toast {
        position: fixed !important;
        left: 50% !important;
        bottom: 44px !important;
        z-index: 2147483647 !important;
        transform: translateX(-50%) !important;
        max-width: min(460px, calc(100vw - 32px)) !important;
        padding: 9px 12px !important;
        border-radius: 6px !important;
        background: rgba(24, 24, 24, 0.94) !important;
        color: #fff !important;
        box-shadow: 0 8px 22px rgba(0, 0, 0, 0.35) !important;
        font: 13px/1.35 Arial, sans-serif !important;
        pointer-events: none !important;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function showToast(message) {
    waitForBody(() => {
      document.querySelectorAll(`.${SCRIPT_PREFIX}-toast`).forEach((toast) => toast.remove());
      const toast = document.createElement('div');
      toast.className = `${SCRIPT_PREFIX}-toast`;
      toast.textContent = message;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2800);
    });
  }

  function isVisible(element) {
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function normalizeText(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function noop() {}
})();
