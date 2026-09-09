const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("playwright/test");

// Synthetic cue text; header, timing and manifest structure reproduce Summer Grass.
const vtt = "\uFEFFWEBVTT\r\nX-TIMESTAMP-MAP=MPEGTS:900000,LOCAL:00:00:00.000\r\n\r\n"
  + "00:00:18.760 --> 00:00:19.720\r\n测试字幕\r\n";
const master = '#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="简体中文",LANGUAGE="zh-Hans",URI="zh-Hans.m3u8"\n';
const adaptation = '<AdaptationSet mimeType="text/vtt" lang="zh-Hans"><Representation>'
  + '<BaseURL>//cdn.example/zh-Hans.vtt</BaseURL></Representation></AdaptationSet>';
const mpd = `<MPD type="static"><Period>${adaptation}</Period></MPD>`;
const payload = { data: { m3u8: "https://cdn.example/master.m3u8", dash: "https://cdn.example/main.mpd" } };

async function setup(page, { dash = mpd, hls = master, dashFails = false } = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, "../scripts/gagaoolala-subtitle-downloader.user.js"), "utf8");
  const startup = source.lastIndexOf("  function start()");
  expect(startup).toBeGreaterThan(0);
  await page.addScriptTag({ content: source.slice(0, startup)
    + "\n globalThis.audit = { extractTracksFromPlaybackPayload, buildSubtitleDownload, parseWebVttCues };\n})();" });
  await page.evaluate(({ dash, hls, dashFails, vtt, payload }) => {
    window.payload = payload;
    window.requests = [];
    window.GM = { async xmlHttpRequest({ url }) {
      requests.push(url);
      if (url === payload.data.dash && dashFails) throw new Error("DASH unavailable");
      const responses = {
        [payload.data.m3u8]: hls,
        [payload.data.dash]: dash,
        "https://cdn.example/zh-Hans.m3u8": "#EXTM3U\n#EXTINF:885\nzh-Hans.vtt\n#EXT-X-ENDLIST\n",
        "https://cdn.example/zh-Hans.vtt": vtt,
      };
      if (!(url in responses)) throw new Error(`Unexpected request: ${url}`);
      return { status: 200, responseText: responses[url] };
    } };
  }, { dash, hls, dashFails, vtt, payload });
}

test("converts the DASH-declared full VTT without shifting cues by the HLS clock offset", async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    const tracks = await audit.extractTracksFromPlaybackPayload(payload);
    const subtitle = await audit.buildSubtitleDownload(tracks[0]);
    return { tracks, srt: await subtitle.blob.text(), requests };
  });
  expect(result.tracks).toHaveLength(1);
  expect(result.tracks[0]).toMatchObject({ name: "简体中文", lang: "sc", type: "vtt", source: "dash-direct", timeline: "presentation" });
  expect(result.srt).toBe("1\n00:00:18,760 --> 00:00:19,720\n测试字幕\n");
  expect(result.requests).toEqual([payload.data.m3u8, payload.data.dash, "https://cdn.example/zh-Hans.vtt"]);
});

test("keeps the HLS timing guard when DASH is unavailable", async ({ page }) => {
  await setup(page, { dashFails: true });
  const result = await page.evaluate(async () => {
    const [track] = await audit.extractTracksFromPlaybackPayload(payload);
    try { await audit.buildSubtitleDownload(track); return {}; }
    catch (error) { return { type: track.type, message: error.message }; }
  });
  expect(result).toEqual({ type: "hls", message: "Unsupported WebVTT timestamp mapping." });
});

for (const [name, dash] of [
  ["multiple periods", `<MPD><Period>${adaptation}</Period><Period>${adaptation}</Period></MPD>`],
  ["nonzero period start", `<MPD><Period start="PT10S">${adaptation}</Period></MPD>`],
  ["invalid period start", `<MPD><Period start="invalid">${adaptation}</Period></MPD>`],
  ["dynamic manifest", `<MPD type="dynamic"><Period>${adaptation}</Period></MPD>`],
  ["SegmentBase offset", `<MPD><Period>${adaptation.replace('<BaseURL>', '<SegmentBase presentationTimeOffset="10"/><BaseURL>')}</Period></MPD>`],
  ["inherited SegmentTemplate", `<MPD><Period><SegmentTemplate media="segment-$Number$.vtt"/>${adaptation}</Period></MPD>`],
]) {
  test(`does not assume presentation timing for ${name}`, async ({ page }) => {
    await setup(page, { dash });
    const tracks = await page.evaluate(() => audit.extractTracksFromPlaybackPayload(payload));
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({ type: "hls", timeline: "" });
  });
}

test("accepts an explicit zero period start", async ({ page }) => {
  await setup(page, { dash: mpd.replace('<Period>', '<Period start="PT0.000S">') });
  const tracks = await page.evaluate(() => audit.extractTracksFromPlaybackPayload(payload));
  expect(tracks).toHaveLength(1);
  expect(tracks[0].timeline).toBe("presentation");
});

test("retains HLS-only languages and preserves displayed names", async ({ page }) => {
  await setup(page, { hls: master.replace('NAME="简体中文"', 'NAME="简体中文 (AI)"')
    + '#EXT-X-MEDIA:TYPE=SUBTITLES,NAME="English",LANGUAGE="en",URI="en.m3u8"\n' });
  const tracks = await page.evaluate(() => audit.extractTracksFromPlaybackPayload(payload));
  expect(tracks).toHaveLength(2);
  expect(tracks.find((track) => track.lang === "sc")).toMatchObject({ type: "vtt", name: "简体中文 (AI)" });
  expect(tracks.find((track) => track.lang === "en")).toMatchObject({ type: "hls", name: "English" });
});

test("does not replace multiple same-language HLS renditions with one DASH track", async ({ page }) => {
  await setup(page, { hls: master
    + '#EXT-X-MEDIA:TYPE=SUBTITLES,NAME="Chinese SDH",LANGUAGE="zh-Hans",URI="sdh.m3u8"\n' });
  const tracks = await page.evaluate(() => audit.extractTracksFromPlaybackPayload(payload));
  expect(tracks.filter((track) => track.type === "hls")).toHaveLength(2);
  expect(tracks.filter((track) => track.timeline === "presentation")).toHaveLength(1);
});

test("does not replace an SRT-capable HLS track with raw DASH TTML", async ({ page }) => {
  await setup(page, { dash: mpd.replace('text/vtt', 'application/ttml+xml').replace('zh-Hans.vtt', 'zh-Hans.ttml') });
  const tracks = await page.evaluate(() => audit.extractTracksFromPlaybackPayload(payload));
  expect(tracks).toHaveLength(1);
  expect(tracks[0].type).toBe("hls");
});
