const fs = require("node:fs");
const { test, expect } = require("playwright/test");
const { SCRIPT, STYLE, GM_STUB, scannerCode, scanLine } = require("./fixtures/missevan-yomitan");

const DANMAKU = "font: bold 25px/1.125 sans-serif; color: rgb(255, 190, 65);";

// Mirrors the live player's stacking: an empty subtitle layer (z 20) swallows
// clicks above the pause area (z 11) and the danmaku layer (z 10).
async function mount(page, { enabled = true } = {}) {
  await page.route("https://www.missevan.com/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><meta charset="utf-8">
      <style>
        body { margin: 0; }
        .web-sound-container { position: relative; z-index: 0; width: 1000px; height: 535px; background: #18212a; }
        .pause-area { position: absolute; left: 16px; top: 0; width: 968px; height: 535px; z-index: 11; }
        .container { position: absolute; inset: 0; z-index: 10; overflow: hidden; }
        .web-sound { position: relative; height: 535px; }
        .subtitle-container { position: absolute; inset: 0 30px; z-index: 20; }
        .b-danmaku { position: absolute; line-height: 1.125; user-select: none; white-space: pre; pointer-events: none; }
        .b-danmaku.b-danmaku-hide { opacity: 0 !important; }
        .b-danmaku.b-danmaku-center { left: 50%; transform: translateX(-50%); }
      </style>
      <div class="web-sound-container">
        <div class="pause-area"></div>
        <div id="commentCanvas" class="container">
          <div id="line" class="b-danmaku b-danmaku-center" style="${DANMAKU} top: 480px;"><span>沈抱山</span>：【点开邮箱】好，马上看</div>
          <div id="pooled" class="b-danmaku b-danmaku-center b-danmaku-hide" style="${DANMAKU} top: 20px;">旧的字幕</div>
          <div id="scrolling" class="b-danmaku" style="${DANMAKU} top: 200px; left: 300px;">开播大吉</div>
        </div>
        <div class="web-sound"><div class="subtitle-container"></div></div>
      </div>`,
  }));
  await page.addInitScript({ content: GM_STUB + (enabled ? fs.readFileSync(SCRIPT, "utf8") : "") });
  await page.goto("https://www.missevan.com/sound/player?id=1");
  await page.addScriptTag({ content: scannerCode });
  if (enabled) await expect(page.locator(STYLE)).toHaveCount(1);
}

async function topClass(page, selector) {
  return page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.className;
  });
}

test("fixed subtitle lines become scannable without changing their appearance", async ({ page }) => {
  await mount(page, { enabled: false });
  const box = () => page.locator("#line").boundingBox();
  const before = await box();
  expect((await scanLine(page, "#line")).target).toBe(false);
  await page.addScriptTag({ path: SCRIPT });
  await expect(page.locator(STYLE)).toHaveCount(1);
  expect(await scanLine(page, "#line")).toMatchObject({ target: true, offset: 0, scanned: "沈抱山：" });
  expect(await box()).toEqual(before);
});

test("hidden and scrolling danmaku stay click-through", async ({ page }) => {
  await mount(page);
  expect(await topClass(page, "#pooled")).toBe("subtitle-container");
  expect(await topClass(page, "#scrolling")).toBe("subtitle-container");
});

test("follows reused lines and native subtitle spans without reinjection", async ({ page }) => {
  await mount(page);
  await page.evaluate(() => {
    document.querySelector("#line").classList.add("b-danmaku-hide");
    const pooled = document.querySelector("#pooled");
    pooled.textContent = "同事：还在工作室呢";
    pooled.classList.remove("b-danmaku-hide");
    document.querySelector(".subtitle-container").innerHTML =
      '<span id="subtitle" style="position: absolute; top: 100px; left: 40px; font: 28px sans-serif;">李迟舒你好</span>';
  });
  expect(await topClass(page, "#line")).toBe("subtitle-container");
  expect(await scanLine(page, "#pooled")).toMatchObject({ target: true, scanned: "同事：还" });
  expect(await scanLine(page, "#subtitle")).toMatchObject({ target: true, offset: 0, scanned: "李迟舒你" });
});
