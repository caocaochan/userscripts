const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("playwright/test");

// Exercise parsers and asynchronous state transitions without starting site UI.
async function expose(page, filename, names) {
  const source = fs.readFileSync(path.resolve(__dirname, `../scripts/${filename}.user.js`), "utf8");
  const startup = Math.max(source.lastIndexOf("  function start()"), source.lastIndexOf("  async function start()"));
  expect(startup).toBeGreaterThan(0);
  await page.addScriptTag({ content: `${source.slice(0, startup)}\n globalThis.audit = { ${names.join(", ")} };\n})();` });
}

test("Yatsu recomputes phrase context when adjacent inline text is removed", async ({ page }) => {
  await page.setContent('<p><span id="dry">乾</span><span id="long">隆</span></p>');
  await page.addScriptTag({ path: path.resolve(__dirname, '../node_modules/opencc-js/dist/umd/t2cn.js') });
  await page.evaluate(() => {
    window.GM = { async getValue() { return true; }, async setValue() {}, async registerMenuCommand() {} };
  });
  await page.addScriptTag({ path: path.resolve(__dirname, '../scripts/yatsu-simplified-chinese.user.js') });
  await expect(page.locator('p')).toHaveText('乾隆');
  await page.locator('#long').evaluate((node) => node.remove());
  await expect(page.locator('#dry')).toHaveText('干');
});

test("Plex preserves literal path whitespace and rejects playlist line injection", async ({ page }) => {
  await expose(page, 'plex-open-in-mpv', ['normalizeLocalFilePath']);
  expect(await page.evaluate(() => audit.normalizeLocalFilePath('C:\\Video\\Two  Spaces\u00a0Here.mkv')))
    .toBe('C:\\Video\\Two  Spaces\u00a0Here.mkv');
  expect(await page.evaluate(() => audit.normalizeLocalFilePath('C:\\Video\\bad\nother.mkv'))).toBe('');
});

test("Plex card refreshes preserve the disabled state of an in-flight launch", async ({ page }) => {
  await page.route('http://127.0.0.1:32400/**', (route) => route.fulfill({ body: '<div id="card"></div>' }));
  await page.goto('http://127.0.0.1:32400/web/index.html');
  await expose(page, 'plex-open-in-mpv', ['ensureCardButton', 'onCardButtonClick']);
  const result = await page.evaluate(async () => {
    localStorage.setItem('X-Plex-Token', 'test-token-123456');
    window.fetch = () => new Promise((resolve) => { window.resolveMetadata = resolve; });
    const card = document.querySelector('#card');
    audit.ensureCardButton(card, '123', true);
    const button = card.querySelector('button');
    const launch = audit.onCardButtonClick({
      currentTarget: button, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {},
    });
    audit.ensureCardButton(card, '123', true);
    const disabled = button.disabled;
    window.resolveMetadata(new Response('', { status: 500 }));
    await launch;
    return { disabled, enabledAfterFailure: !button.disabled };
  });
  expect(result).toEqual({ disabled: true, enabledAfterFailure: true });
});

test("Missevan ignores a null font-helper response and accepts the subsequent valid response", async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await expose(page, 'missevan-subtitle-styler', ['requestInstalledFontsFromHelper', 'FONT_HELPER_RESPONSE_EVENT']);
  const result = await page.evaluate(async () => {
    const pending = audit.requestInstalledFontsFromHelper();
    window.dispatchEvent(new CustomEvent(audit.FONT_HELPER_RESPONSE_EVENT, { detail: 'null' }));
    window.dispatchEvent(new CustomEvent(audit.FONT_HELPER_RESPONSE_EVENT, {
      detail: JSON.stringify({ id: '1', ok: true, families: ['Test Font'] }),
    }));
    return pending;
  });
  expect(result).toMatchObject({ ok: true, families: ['Test Font'] });
  expect(errors).toEqual([]);
});

test("Plex selects a complete media version and preserves its ordered parts and durations", async ({ page }) => {
  await expose(page, 'plex-open-in-mpv', ['pickBestParts', 'buildPlaylist']);
  const result = await page.evaluate(() => {
    const episode = { title: 'Episode', index: 1, parentIndex: 1, media: [
      { videoResolution: '720', duration: 90000, parts: [{ file: 'C:\\low.mkv', size: 900, duration: 90000 }] },
      { videoResolution: '1080', duration: 90000, parts: [
        { file: 'C:\\part1.mkv', size: 100, duration: 30000, container: 'mkv' },
        { file: 'C:\\part2.mkv', size: 200, duration: 60000, container: 'mkv' },
      ] },
    ] };
    const parts = audit.pickBestParts(episode);
    return { files: parts.map((part) => part.file), playlist: audit.buildPlaylist(parts.map((part) => ({ episode, part }))) };
  });
  expect(result.files).toEqual(['C:\\part1.mkv', 'C:\\part2.mkv']);
  expect(result.playlist).toContain('#EXTINF:30,S01E01 - Episode\nC:\\part1.mkv');
  expect(result.playlist).toContain('#EXTINF:60,S01E01 - Episode\nC:\\part2.mkv');
});

test("GagaOOLala skips entire NOTE blocks, decodes cue escapes, and validates timestamps", async ({ page }) => {
  await expose(page, 'gagaoolala-subtitle-downloader', ['parseWebVttCues']);
  const cues = await page.evaluate(() => audit.parseWebVttCues(
    'WEBVTT\r\n\r\nNOTE example\r\n00:01.000 --> 00:02.000\r\nNot a cue\r\n\r\n'
    + 'real\r\n00:03.000 --> 00:04.000 align:start\r\n<v A><b>A &amp; B</b> &lt;3 &nbsp; &lrm; &rlm;</v>\r\n\r\n'
    + '00:99.000 --> 01:40.000\r\nInvalid\r\n',
  ));
  expect(cues).toEqual([{ start: 3000, end: 4000, text: 'A & B <3 \u00a0 \u200e \u200f' }]);
});

test("GagaOOLala does not silently save a subtitle with missing segments", async ({ page }) => {
  await expose(page, 'gagaoolala-subtitle-downloader', ['buildCuesFromSegmentUrls']);
  const message = await page.evaluate(async () => {
    window.GM = { async xmlHttpRequest({ url }) {
      if (url.endsWith('2.vtt')) throw new Error('offline');
      return { status: 200, responseText: 'WEBVTT\n\n00:01.000 --> 00:02.000\nFirst\n' };
    } };
    try {
      await audit.buildCuesFromSegmentUrls(['https://cdn.example/1.vtt', 'https://cdn.example/2.vtt']);
      return 'saved incomplete subtitles';
    } catch (error) { return error.message; }
  });
  expect(message).toContain('offline');
});

test("GagaOOLala rejects unsupported timestamp mappings instead of saving mistimed SRT", async ({ page }) => {
  await expose(page, 'gagaoolala-subtitle-downloader', ['parseWebVttCues']);
  const result = await page.evaluate(() => {
    const cue = '\n\n00:01.000 --> 00:02.000\nFirst\n';
    const identity = audit.parseWebVttCues('WEBVTT\nX-TIMESTAMP-MAP=MPEGTS:0,LOCAL:00:00:00.000' + cue);
    try {
      audit.parseWebVttCues('WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:900000' + cue);
      return { identity, error: '' };
    } catch (error) { return { identity, error: error.message }; }
  });
  expect(result.identity).toEqual([{ start: 1000, end: 2000, text: 'First' }]);
  expect(result.error).toContain('timestamp mapping');
});

test("GagaOOLala resolves hierarchical DASH BaseURLs for each period and representation", async ({ page }) => {
  await expose(page, 'gagaoolala-subtitle-downloader', ['extractDashTracks']);
  const urls = await page.evaluate(async () => {
    window.GM = { async xmlHttpRequest() { return { status: 200, responseText:
      '<MPD><BaseURL>assets/</BaseURL><Period><BaseURL>first/</BaseURL>'
      + '<AdaptationSet contentType="text" lang="en"><BaseURL>subs/</BaseURL>'
      + '<Representation id="en" mimeType="text/vtt"><BaseURL>en.vtt</BaseURL></Representation>'
      + '</AdaptationSet></Period><Period><BaseURL>second/</BaseURL>'
      + '<AdaptationSet contentType="text" lang="en"><BaseURL>en.vtt</BaseURL></AdaptationSet>'
      + '</Period></MPD>' }; } };
    return (await audit.extractDashTracks('https://cdn.example/show/manifest.mpd')).map((track) => track.url);
  });
  expect(urls).toEqual(['https://cdn.example/show/assets/first/subs/en.vtt', 'https://cdn.example/show/assets/second/en.vtt']);
});

test("GagaOOLala uses bounded DASH durations and expands negative repeats to the next start", async ({ page }) => {
  await expose(page, 'gagaoolala-subtitle-downloader', ['extractDashTracks']);
  const urls = await page.evaluate(async () => {
    window.GM = { async xmlHttpRequest() { return { status: 200, responseText:
      '<MPD mediaPresentationDuration="PT12S"><Period><AdaptationSet contentType="text">'
      + '<Representation id="en"><BaseURL>en/</BaseURL><SegmentTemplate duration="5" media="sub-$Number%03d$.vtt" startNumber="0"/></Representation>'
      + '<Representation id="fr"><SegmentTemplate media="fr-$Time$.vtt"><SegmentTimeline><S t="0" d="5" r="-1"/><S t="10" d="2"/></SegmentTimeline></SegmentTemplate></Representation>'
      + '</AdaptationSet></Period></MPD>' }; } };
    return (await audit.extractDashTracks('https://cdn.example/show/manifest.mpd')).map((track) => track.segmentUrls);
  });
  expect(urls).toEqual([
    ['https://cdn.example/show/en/sub-000.vtt', 'https://cdn.example/show/en/sub-001.vtt', 'https://cdn.example/show/en/sub-002.vtt'],
    ['https://cdn.example/show/fr-0.vtt', 'https://cdn.example/show/fr-5.vtt', 'https://cdn.example/show/fr-10.vtt'],
  ]);
});

test("GagaOOLala retains direct subtitles when an HLS manifest fails", async ({ page }) => {
  await expose(page, 'gagaoolala-subtitle-downloader', ['extractTracksFromPlaybackPayload']);
  const urls = await page.evaluate(async () => {
    window.GM = { async xmlHttpRequest() { throw new Error('HLS unavailable'); } };
    return (await audit.extractTracksFromPlaybackPayload({ data: {
      m3u8: 'https://cdn.example/master.m3u8', subtitle: 'https://cdn.example/en.vtt', name: 'English',
    } })).map((track) => track.url);
  });
  expect(urls).toEqual(['https://cdn.example/en.vtt']);
});

test("GagaOOLala ignores an observed manifest finishing after navigation", async ({ page }) => {
  await page.route('https://www.gagaoolala.com/**', (route) => route.fulfill({ body: '<title>Video</title>' }));
  await page.goto('https://www.gagaoolala.com/en/videos/123/first');
  await expose(page, 'gagaoolala-subtitle-downloader', ['handleObservedPlaybackPayload']);
  await page.evaluate(() => {
    window.GM = { xmlHttpRequest() { return new Promise((resolve) => { window.resolveManifest = resolve; }); } };
    window.pendingObservation = audit.handleObservedPlaybackPayload(
      'https://www.gagaoolala.com/api/v1.0/en/videos/123/first/play',
      { success: 1, data: { m3u8: 'https://cdn.example/master.m3u8' } },
    );
    history.pushState({}, '', '/en/videos/456/second');
    window.resolveManifest({ status: 200, responseText: '#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,NAME="English",URI="en.m3u8"' });
  });
  await page.evaluate(() => window.pendingObservation);
  await expect(page.locator('#gagaoolala-subtitle-downloader-panel')).toHaveCount(0);
});

test("GagaOOLala parses the observed playback endpoint independently of the current route", async ({ page }) => {
  await page.route('https://www.gagaoolala.com/**', (route) => route.fulfill({ body: '<title>Video</title>' }));
  await page.goto('https://www.gagaoolala.com/en/videos/999/new-title');
  await expose(page, 'gagaoolala-subtitle-downloader', ['parseRouteFromUrl']);
  const route = await page.evaluate(() => audit.parseRouteFromUrl('https://www.gagaoolala.com/api/v1.0/en/videos/123/title/play'));
  expect(route).toMatchObject({ lang: 'en', videoId: '123', slug: 'title' });
});

test("iQIYI respects explicit download cancellation without fallback requests", async ({ page }) => {
  await expose(page, 'iqiyi-subtitle-downloader', ['downloadSubtitle']);
  const result = await page.evaluate(async () => {
    let requests = 0;
    window.GM = {
      async download() { throw { error: 'not_succeeded', details: { current: 'USER_CANCELED' } }; },
      async xmlHttpRequest() { requests += 1; throw new Error('unexpected fallback'); },
    };
    try { await audit.downloadSubtitle('https://cdn.example/en.srt', 'en.srt'); } catch {}
    return requests;
  });
  expect(result).toBe(0);
});

test("iQIYI ignores malformed and non-HTTP subtitle URLs while preserving valid tracks", async ({ page }) => {
  await expose(page, 'iqiyi-subtitle-downloader', ['normalizeSubtitles']);
  const urls = await page.evaluate(() => audit.normalizeSubtitles([
    { srt: 'http://[', name: 'Broken' }, { srt: 'javascript:void(0)', name: 'Script' },
    { srt: '/en.srt', name: 'English' },
  ]).map((track) => track.url));
  expect(urls).toEqual(['https://meta.video.iqiyi.com/en.srt']);
});

test("iQIYI ignores fetched HTML after navigating to another episode", async ({ page }) => {
  await page.route('https://www.iq.com/**', (route) => route.fulfill({ body: '<title>Episode</title>' }));
  await page.goto('https://www.iq.com/play/first');
  await expose(page, 'iqiyi-subtitle-downloader', ['refreshFromFetchedPage']);
  await page.evaluate(() => {
    window.fetch = () => new Promise((resolve) => { window.resolvePage = resolve; });
    window.pendingRefresh = audit.refreshFromFetchedPage();
    history.pushState({}, '', '/play/second');
    window.resolvePage(new Response('<script id="__NEXT_DATA__">' + JSON.stringify({ props: {} }) + '</script>', { status: 200 }));
  });
  await page.evaluate(() => window.pendingRefresh);
  await expect(page.locator('#iqiyi-subtitle-downloader-panel')).toHaveCount(0);
});
