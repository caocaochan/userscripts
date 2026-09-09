const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("playwright/test");

const source = fs.readFileSync(path.resolve(__dirname, "../scripts/gagaoolala-subtitle-downloader.user.js"), "utf8");
const startup = source.lastIndexOf("  function start()");
const subtitleText = "WEBVTT\n\n00:01.000 --> 00:02.000\nHello &amp; goodbye\n";
const expectedSrt = "1\n00:00:01,000 --> 00:00:02,000\nHello & goodbye\n";
const filename = "Example - E02 - English.srt";
const toast = ".gagaoolala-subtitle-downloader-toast";

async function mount(page, options = {}) {
  await page.setContent('<button id="download">SRT</button>');
  await page.clock.install();
  expect(startup).toBeGreaterThan(0);
  await page.addScriptTag({ content: `${source.slice(0, startup)}\n globalThis.startDownload = onDownloadClick;\n})();` });
  await page.evaluate(({ options, subtitleText }) => {
    window.calls = { requests: [], downloads: [], anchors: [], revoked: [], opened: [], blobs: [] };
    window.GM = {
      async xmlHttpRequest({ url }) {
        calls.requests.push(url);
        if (options.generationFailure) throw new Error("Subtitle request failed");
        return { status: 200, responseText: subtitleText };
      },
      async download({ url, name, saveAs }) {
        const blob = url instanceof Blob;
        window.downloadBlob = blob ? url : null;
        calls.downloads.push({ blob, name, saveAs, content: blob ? await url.text() : url });
        if (options.pending) {
          await new Promise((resolve) => { window.finishDownload = resolve; });
        }
        if (options.downloadError) throw options.downloadError;
      },
    };
    const createObjectURL = URL.createObjectURL.bind(URL);
    const revokeObjectURL = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      calls.blobs.push({ sameBlob: blob === window.downloadBlob });
      return createObjectURL(blob);
    };
    URL.revokeObjectURL = (url) => { calls.revoked.push(url); revokeObjectURL(url); };
    HTMLAnchorElement.prototype.click = function () {
      calls.anchors.push({ href: this.href, name: this.download, connected: this.isConnected });
      if (options.anchorFailure) throw new Error("Anchor click failed");
    };
    window.open = (...args) => calls.opened.push(args);
    const track = {
      name: "English", type: options.trackType || "vtt", url: "https://cdn.example/en.vtt",
      segmentUrls: ["https://cdn.example/1.vtt"],
    };
    document.querySelector("#download").addEventListener("click", (event) => {
      window.pendingClick = startDownload(event.currentTarget, { title: "Example", episode: 2 }, track);
    });
  }, { options, subtitleText });
}

async function clickAndFinish(page) {
  await page.locator("#download").click();
  await page.evaluate(() => window.pendingClick);
  await expect(page.locator("#download")).toBeEnabled();
  await expect(page.locator("#download")).toHaveText("SRT");
  return page.evaluate(() => window.calls);
}

test("saves the generated SRT Blob and waits for completion before restoring the button", async ({ page }) => {
  await mount(page, { pending: true });
  await page.locator("#download").click();
  await expect.poll(() => page.evaluate(() => typeof window.finishDownload)).toBe("function");
  await expect(page.locator("#download")).toBeDisabled();
  await expect(page.locator("#download")).toHaveText("...");
  await expect(page.locator(toast)).toHaveCount(0);
  await page.evaluate(() => window.finishDownload());
  await page.evaluate(() => window.pendingClick);
  const calls = await page.evaluate(() => window.calls);
  expect(calls.downloads).toEqual([{ blob: true, name: filename, saveAs: false, content: expectedSrt }]);
  expect(calls.requests).toEqual(["https://cdn.example/en.vtt"]);
  expect(calls.anchors).toEqual([]);
  expect(calls.blobs).toEqual([]);
  expect(calls.opened).toEqual([]);
  await expect(page.locator(toast)).toHaveText("English subtitles downloaded");
  await expect(page.locator("#download")).toBeEnabled();
  await expect(page.locator("#download")).toHaveText("SRT");
});

for (const error of ["not_enabled", "not_whitelisted", "not_permitted", "not_supported"]) {
  test(`reuses the completed Blob once after ${error} and cleans up the anchor`, async ({ page }) => {
    await mount(page, { downloadError: { error } });
    const calls = await clickAndFinish(page);
    expect(calls.requests).toHaveLength(1);
    expect(calls.downloads).toEqual([{ blob: true, name: filename, saveAs: false, content: expectedSrt }]);
    expect(calls.blobs).toEqual([{ sameBlob: true }]);
    expect(calls.anchors).toEqual([{ href: expect.stringMatching(/^blob:/), name: filename, connected: true }]);
    expect(calls.opened).toEqual([]);
    expect(calls.revoked).toEqual([]);
    await expect(page.locator("a[download]")).toHaveCount(0);
    await expect(page.locator(toast)).toHaveText("English subtitle download started");
    await page.clock.fastForward(1000);
    expect(await page.evaluate(() => calls.revoked)).toEqual([calls.anchors[0].href]);
  });
}

for (const [label, downloadError] of [
  ["string", "CANCELLED"],
  ["error", { error: "USER_CANCELED" }],
  ["message", { message: "Cancelled" }],
  ["details", { error: "not_succeeded", details: "USER_CANCELED" }],
  ["nested details", { error: "not_succeeded", details: { current: "USER_CANCELED" } }],
  ["cancellation before fallback", { error: "not_permitted", details: { current: "USER_CANCELED" } }],
]) {
  test(`stops ${label} cancellation without a secondary download or opened URL`, async ({ page }) => {
    await mount(page, { downloadError });
    const calls = await clickAndFinish(page);
    expect(calls.requests).toHaveLength(1);
    expect(calls.downloads).toHaveLength(1);
    expect(calls.anchors).toEqual([]);
    expect(calls.blobs).toEqual([]);
    expect(calls.opened).toEqual([]);
    await expect(page.locator(toast)).toHaveText("Download cancelled");
  });
}

for (const error of ["not_succeeded", "unexpected_error"]) {
  test(`reports ${error} save failure without retrying the raw track`, async ({ page }) => {
    await mount(page, { downloadError: { error } });
    const calls = await clickAndFinish(page);
    expect(calls.requests).toHaveLength(1);
    expect(calls.downloads).toHaveLength(1);
    expect(calls.anchors).toEqual([]);
    expect(calls.opened).toEqual([]);
    await expect(page.locator(toast)).toHaveText("Could not save English subtitles");
  });
}

test("cleans up after an anchor click throws and does not download the raw track", async ({ page }) => {
  await mount(page, { downloadError: { error: "not_whitelisted" }, anchorFailure: true });
  const calls = await clickAndFinish(page);
  expect(calls.requests).toHaveLength(1);
  expect(calls.downloads).toHaveLength(1);
  expect(calls.anchors).toHaveLength(1);
  expect(calls.opened).toEqual([]);
  await expect(page.locator("a[download]")).toHaveCount(0);
  await expect(page.locator(toast)).toHaveText("Could not save English subtitles");
  await page.clock.fastForward(1000);
  expect(await page.evaluate(() => calls.revoked)).toEqual([calls.anchors[0].href]);
});

test("retains the original track and extension fallback after generation failure", async ({ page }) => {
  await mount(page, { generationFailure: true });
  const calls = await clickAndFinish(page);
  expect(calls.downloads).toEqual([{
    blob: false, name: "Example - E02 - English.vtt", saveAs: false, content: "https://cdn.example/en.vtt",
  }]);
  expect(calls.anchors).toEqual([]);
  expect(calls.opened).toEqual([]);
  await expect(page.locator(toast)).toHaveText("English subtitles downloaded");
});

test("does not open a URL when the original-track fallback is cancelled", async ({ page }) => {
  await mount(page, { generationFailure: true, downloadError: { error: "USER_CANCELED" } });
  const calls = await clickAndFinish(page);
  expect(calls.downloads).toHaveLength(1);
  expect(calls.anchors).toEqual([]);
  expect(calls.opened).toEqual([]);
  await expect(page.locator(toast)).toHaveText("Download cancelled");
});

test("retains URL opening when generation and the original-track fallback both fail", async ({ page }) => {
  await mount(page, { generationFailure: true, downloadError: { error: "not_succeeded" } });
  const calls = await clickAndFinish(page);
  expect(calls.downloads).toHaveLength(1);
  expect(calls.opened).toEqual([["https://cdn.example/en.vtt", "_blank", "noopener"]]);
});

for (const trackType of ["hls", "segments"]) {
  test(`never saves incomplete ${trackType} subtitles or falls back to a single raw segment`, async ({ page }) => {
    await mount(page, { generationFailure: true, trackType });
    const calls = await clickAndFinish(page);
    expect(calls.downloads).toEqual([]);
    expect(calls.anchors).toEqual([]);
    expect(calls.opened).toEqual([]);
    await expect(page.locator(toast)).toHaveText("Could not download complete English subtitles");
  });
}
