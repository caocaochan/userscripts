const fs = require("node:fs");
const { test, expect } = require("playwright/test");
const { SCRIPT, STYLE, GM_STUB, scannerCode, scanCaption } = require("./fixtures/iqiyi-yomitan");

// Anonymous playback and a pinned Yomitan scanner, not an extension popup test.
test("iQIYI live captions are scannable in normal and fullscreen playback", async ({ page }, testInfo) => {
  test.skip(process.env.IQIYI_LIVE !== "1", "Set IQIYI_LIVE=1 to exercise the public episode.");
  test.setTimeout(240000);
  await page.addInitScript({ content: GM_STUB + fs.readFileSync(SCRIPT, "utf8") });
  await page.goto("https://www.iqiyi.com/v_jl8v6yeia4.html", { waitUntil: "domcontentloaded", timeout: 30000 });
  try {
    await page.getByText("继续使用当前浏览器观看", { exact: true }).click({ timeout: 10000 });
  } catch { /* The browser compatibility notice is not always shown. */ }

  // Anonymous playback may show several prerolls before the episode starts.
  await page.waitForFunction(() => [...document.querySelectorAll("video")]
    .some((video) => video.duration > 1000 && video.readyState >= 2), {}, { timeout: 150000 });
  // The compatibility notice can arrive only after prerolls have finished.
  const continueWatching = page.getByText("继续使用当前浏览器观看", { exact: true });
  if (await continueWatching.isVisible()) await continueWatching.click();
  const video = page.locator("video.inner-video").first();
  await video.evaluate((element) => { element.currentTime = 300; });
  await expect.poll(() => video.evaluate((element) => !element.seeking && element.readyState >= 2), { timeout: 30000 }).toBe(true);
  const selector = "#pcaSubtitleContainer .caption-main";
  const caption = page.locator(selector);
  await expect.poll(() => caption.textContent(), { timeout: 15000 }).toMatch(/\p{Script=Han}/u);
  await video.evaluate((element) => element.pause());
  await page.addScriptTag({ content: scannerCode });
  await expect(page.locator(STYLE)).toHaveCount(1);

  async function verify(mode) {
    if (await continueWatching.isVisible()) await continueWatching.click();
    const text = (await caption.textContent()).trim();
    const result = await scanCaption(page, selector);
    expect(result).toMatchObject({ target: true, offset: 0, scanned: Array.from(text).slice(0, 4).join("") });
    await expect(page.locator("#pcaSubtitleContainer")).toHaveCSS("pointer-events", "none");
    await page.mouse.move(result.x, result.y);
    await expect(video).toHaveJSProperty("paused", true);
    await page.screenshot({ path: testInfo.outputPath(`live-${mode}.png`) });
    await testInfo.attach(`scanner-${mode}`, { body: JSON.stringify({ text, ...result }), contentType: "application/json" });
  }

  await verify("normal");
  // Hovering captions must not pause an episode that was playing, either.
  await page.mouse.move(0, 0);
  await video.evaluate((element) => element.play());
  await caption.hover();
  await expect(video).toHaveJSProperty("paused", false);
  await video.evaluate((element) => element.pause());

  await page.evaluate(() => document.querySelector("#pcaSubtitleContainer")
    .closest('[class*="XPlayer_root__"]').requestFullscreen());
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement
    ?.contains(document.querySelector("#pcaSubtitleContainer"))))).toBe(true);
  // A paused Chromium video can retain a blank compositor surface on resize.
  // Decode a fresh frame before checking the settled fullscreen player.
  await video.evaluate(async (element) => {
    await element.play();
    await new Promise((resolve) => element.requestVideoFrameCallback(resolve));
    element.pause();
  });
  await verify("fullscreen");
  await page.evaluate(() => document.exitFullscreen());
});
