const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("playwright/test");

// Opt-in, anonymous live-site smoke test. Normal npm test runs stay offline.
test("Du Chinese live reader exposes scannable text and preserves native interactions", async ({ page }, testInfo) => {
  test.skip(process.env.DUCHINESE_LIVE !== "1", "Set DUCHINESE_LIVE=1 to exercise the public lesson.");
  test.setTimeout(60000);
  const warnings = [];
  const errors = [];
  page.on("console", (message) => {
    if (message.text().startsWith("[Du Chinese Yomitan]")) warnings.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript({ path: path.resolve(__dirname, "../scripts/duchinese-yomitan.user.js") });
  await page.goto("https://duchinese.net/lessons/1233-where-did-new-year-s-money-come-from");
  const layer = page.locator(".duchinese-yomitan-layer");
  await expect(layer).toHaveCount(1, { timeout: 30000 });
  await expect(layer).toContainText("压岁钱是怎么来的？");
  const scanner = ["string-util.js", "dom-text-scanner.js"].map((name) =>
    fs.readFileSync(path.join(__dirname, "fixtures/yomitan", name), "utf8")
      .replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, ""),
  ).join("\n") + "\nwindow.DOMTextScanner = DOMTextScanner;";
  await page.addScriptTag({ content: scanner });
  const first = page.locator(".duchinese-yomitan-character").first();
  // Center it above the site's fixed audio/footer controls.
  await first.evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
  const result = await page.evaluate(() => {
    const glyph = document.querySelector(".duchinese-yomitan-character");
    const range = document.createRange();
    range.selectNodeContents(glyph);
    const rect = range.getBoundingClientRect();
    const x = rect.left + rect.width * 0.25;
    const y = rect.top + rect.height * 0.5;
    const hit = document.caretRangeFromPoint(x, y);
    return {
      text: hit?.startContainer.textContent,
      word: hit ? new window.DOMTextScanner(hit.startContainer, hit.startOffset).seek(3).content : "",
      count: document.querySelectorAll(".duchinese-yomitan-character").length,
      x, y,
      completeText: document.querySelector(".lesson-canvas-clipper > canvas:not(.hidden-print)").textContent
        .startsWith(document.querySelector(".duchinese-yomitan-layer").textContent + "\n\n"),
    };
  });
  await page.screenshot({ path: testInfo.outputPath("live-reader-before-hover.png"), fullPage: false });
  expect(result).toMatchObject({ text: "压", word: "压岁钱", completeText: true });
  expect(result.count).toBeGreaterThan(400);
  await page.mouse.move(result.x, result.y);
  await expect(page.locator(".du-translation-word").first()).toContainText("New Year");
  await page.mouse.down();
  await page.screenshot({ path: testInfo.outputPath("live-reader.png"), fullPage: false });
  await expect(page.locator(".lesson-word-menu-container > *").first()).toBeVisible();
  await page.mouse.up();
  await expect(page.locator(".lesson-word-menu-container > *").first()).toBeHidden();
  expect(warnings).toEqual([]);
  expect(errors).toEqual([]);
});
