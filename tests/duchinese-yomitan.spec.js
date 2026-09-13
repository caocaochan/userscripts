const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("playwright/test");

const SCRIPT = path.resolve(__dirname, "../scripts/duchinese-yomitan.user.js");
const GLYPH = ".duchinese-yomitan-character";
const LAYER = ".duchinese-yomitan-layer";
const TEXT = "压岁钱是怎么来的？\n\n每年 ABC 123，长辈给孩子压岁钱。";
const scannerCode = ["string-util.js", "dom-text-scanner.js"].map((name) =>
  fs.readFileSync(path.join(__dirname, "fixtures/yomitan", name), "utf8")
    .replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, ""),
).join("\n") + "\nwindow.DOMTextScanner = DOMTextScanner;";

async function mount(page, options = {}) {
  await page.route("https://duchinese.net/**", (route) => route.fulfill({
    contentType: "text/html", body: `<!doctype html><meta charset="utf-8">
      <style>body { margin: 30px; } .lesson-canvas-clipper { position: relative; width: 350px; height: 600px; user-select: none; }
      canvas { position: absolute; left: 0; top: 0; } .spacer { height: 900px; }</style>
      <h1>Fixture lesson</h1><div class="lesson-canvas-clipper">
        <canvas class="hidden-print"></canvas><canvas id="prose"></canvas>
        <canvas class="hidden-print" id="highlight"></canvas>
      </div><canvas id="unrelated"></canvas><div class="spacer"></div>`,
  }));
  await page.addInitScript({ path: SCRIPT });
  await page.goto("https://duchinese.net/lessons/1233-fixture");
  await page.addScriptTag({ content: scannerCode });
  await page.evaluate(({ text, ...initialOptions }) => {
    window.events = { moves: 0, downs: 0, outs: 0, touches: 0 };
    const clipper = document.querySelector(".lesson-canvas-clipper");
    clipper.addEventListener("mousemove", () => ++window.events.moves);
    clipper.addEventListener("mousedown", (event) => { ++window.events.downs; event.preventDefault(); });
    clipper.addEventListener("mouseout", () => ++window.events.outs);
    clipper.addEventListener("touchstart", () => ++window.events.touches);
    window.render = (configuration = {}) => {
      window.configuration = { text, pinyin: true, fontSize: 22, width: 350, baseline: "alphabetic", ...window.configuration, ...configuration };
      const { text: value, pinyin, fontSize, width, baseline } = window.configuration;
      const canvas = document.querySelector("#prose");
      const ctx = canvas.getContext("2d");
      const dpr = devicePixelRatio;
      canvas.parentElement.style.width = `${width}px`;
      canvas.width = width * dpr;
      canvas.height = 600 * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = "600px";
      canvas.lang = configuration.traditional ? "zh-Hant" : "zh-Hans";
      // Production updates the layout and draws once, then resets the canvas
      // height and paints it again. Both passes must produce only one text copy.
      function draw() {
        window.drawn = [];
        let x = 20;
        let y = 45;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.textBaseline = baseline;
        for (const character of value) {
          ctx.font = `${fontSize}px "Microsoft YaHei", sans-serif`;
          const metrics = ctx.measureText(character);
          if (character === "\n" || x + metrics.width > width - 20) { x = 20; y += fontSize * 2.6; }
          window.drawn.push({ text: character, x, y, width: metrics.width,
            ascent: metrics.actualBoundingBoxAscent, descent: metrics.actualBoundingBoxDescent });
          ctx.fillText(character, x, y);
          if (pinyin && /\p{Script=Han}/u.test(character)) {
            ctx.font = "15px sans-serif";
            ctx.fillText("pīn", x, y - fontSize - 3);
          }
          if (character !== "\n") x += metrics.width + (pinyin ? 5 : 0);
        }
      }
      draw();
      canvas.height = 600 * dpr;
      draw();
      const highlight = document.querySelector("#highlight");
      highlight.width = width * dpr;
      highlight.height = 70 * dpr;
      highlight.style.width = `${width}px`;
      highlight.style.height = "70px";
      highlight.getContext("2d").fillText("压岁钱", 20, 45);
      document.querySelector("#unrelated").getContext("2d").fillText("无关文字", 0, 20);
    };
    window.render(initialOptions);
  }, { text: TEXT, ...options });
  await expect(page.locator(GLYPH)).toHaveCount(Array.from(options.text || TEXT).length);
}

async function hitTest(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("#prose").getBoundingClientRect();
    return window.drawn.flatMap((draw, index) => {
      if (!/\p{Script=Han}/u.test(draw.text)) return [];
      const x = canvas.left + draw.x + draw.width * 0.25;
      const y = canvas.top + draw.y - (draw.ascent - draw.descent) / 2;
      if (y < 0 || y >= innerHeight) return [];
      const range = document.caretRangeFromPoint?.(x, y);
      const position = !range && document.caretPositionFromPoint?.(x, y);
      const node = range?.startContainer || position?.offsetNode;
      const offset = range?.startOffset ?? position?.offset;
      const glyph = document.querySelectorAll(".duchinese-yomitan-character")[index];
      return [{ index, expected: draw.text, actual: node?.textContent, offset,
        target: document.elementFromPoint(x, y)?.closest(".duchinese-yomitan-character") === glyph,
        scanned: node ? new window.DOMTextScanner(node, offset).seek(3).content : "" }];
    });
  });
}

test("retains prose, punctuation and Latin text, and excludes pinyin and highlight layers", async ({ page }) => {
  await mount(page);
  await expect(page.locator(LAYER)).toHaveCount(1);
  await expect(page.locator(LAYER)).toHaveJSProperty("textContent", TEXT);
  const hits = await hitTest(page);
  expect(hits.length).toBeGreaterThan(10);
  for (const hit of hits) {
    expect(hit, JSON.stringify(hit)).toMatchObject({ actual: hit.expected, offset: 0, target: true });
  }
  expect(hits[0].scanned).toBe("压岁钱");
});

test("upstream Yomitan scanner traverses a visual wrap and extracts paragraph context", async ({ page }) => {
  await mount(page, { width: 115, text: "中国压岁钱。\n春节快乐！" });
  const result = await page.evaluate(() => {
    const glyphs = [...document.querySelectorAll(".duchinese-yomitan-character")];
    return {
      full: new DOMTextScanner(glyphs[0].firstChild, 0).seek(12).content,
      forward: new DOMTextScanner(glyphs[2].firstChild, 0).seek(3).content,
      backward: new DOMTextScanner(glyphs[5].firstChild, 0).seek(-5).content,
      wrapped: glyphs[2].getBoundingClientRect().top !== glyphs[4].getBoundingClientRect().top,
    };
  });
  expect(result).toEqual({ full: "中国压岁钱。\n春节快乐！", forward: "压岁钱", backward: "中国压岁钱", wrapped: true });
});

for (const baseline of ["alphabetic", "ideographic", "top", "middle", "bottom"]) {
  test(`aligns text at the ${baseline} canvas baseline`, async ({ page }) => {
    await mount(page, { baseline });
    for (const hit of await hitTest(page)) expect(hit).toMatchObject({ actual: hit.expected, offset: 0, target: true });
  });
}

test("preserves native mouse/touch handling and does not alter canvas pixels", async ({ page }) => {
  await mount(page);
  const bitmap = await page.locator("#prose").evaluate((canvas) => canvas.toDataURL());
  await page.locator(GLYPH).first().hover();
  await page.locator(GLYPH).nth(1).hover();
  await page.locator(GLYPH).nth(1).click();
  // Desktop Firefox does not expose TouchEvent without touch emulation; this
  // assertion checks event propagation, not platform touch gesture synthesis.
  await page.locator(GLYPH).first().evaluate((element) => element.dispatchEvent(new Event("touchstart", { bubbles: true })));
  expect(await page.evaluate(() => window.events)).toMatchObject({ downs: 1, outs: 0, touches: 1 });
  expect(await page.evaluate(() => window.events.moves)).toBeGreaterThan(0);
  await expect(page.locator("#prose").evaluate((canvas) => canvas.toDataURL())).resolves.toBe(bitmap);
  await page.mouse.move(5, 5);
  expect(await page.evaluate(() => window.events.outs)).toBeGreaterThan(0);
});

test("updates script, pinyin, fonts and width while preserving unchanged nodes", async ({ page }) => {
  await mount(page);
  await page.evaluate(() => { window.oldGlyph = document.querySelector(".duchinese-yomitan-character"); window.render(); });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await page.evaluate(() => window.oldGlyph === document.querySelector(".duchinese-yomitan-character"))).toBe(true);
  await page.evaluate(() => window.render({ text: "壓歲錢，ABC。", traditional: true, pinyin: false, fontSize: 30, width: 210 }));
  await expect(page.locator(LAYER)).toHaveJSProperty("textContent", "壓歲錢，ABC。");
  await expect(page.locator(LAYER)).toHaveAttribute("lang", "zh-Hant");
  for (const hit of await hitTest(page)) expect(hit).toMatchObject({ actual: hit.expected, offset: 0, target: true });
});

test("tracks scrolling, backing-store scaling and CSS-only resizing", async ({ browser }) => {
  const context = await browser.newContext({ deviceScaleFactor: 2 });
  const page = await context.newPage();
  try {
    await mount(page);
    for (const hit of await hitTest(page)) expect(hit).toMatchObject({ actual: hit.expected, offset: 0, target: true });
    await page.evaluate(() => window.scrollTo(0, 80));
    for (const hit of await hitTest(page)) expect(hit).toMatchObject({ actual: hit.expected, offset: 0, target: true });
    await page.locator("#prose").evaluate((canvas) => { canvas.style.width = "175px"; canvas.style.height = "300px"; });
    await expect(page.locator(LAYER)).toHaveCSS("width", "175px");
    const glyph = await page.locator(GLYPH).first().boundingBox();
    expect(glyph.width).toBeLessThan(15);
  } finally { await context.close(); }
});

test("cleans up after resets, removal and lesson replacement, with duplicate injection harmless", async ({ page }) => {
  await mount(page);
  await page.addScriptTag({ path: SCRIPT });
  await page.locator("#prose").evaluate((canvas) => { canvas.width = canvas.width; });
  await expect(page.locator(LAYER)).toHaveCount(0);
  await page.evaluate(() => window.render());
  await expect(page.locator(LAYER)).toHaveCount(1);
  await page.locator("#prose").evaluate((canvas) => canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height));
  await expect(page.locator(LAYER)).toHaveCount(0);
  await page.evaluate(() => {
    document.querySelector("#prose").remove();
    const canvas = document.createElement("canvas");
    canvas.id = "prose";
    document.querySelector(".lesson-canvas-clipper").appendChild(canvas);
    window.render({ text: "新的课程。" });
  });
  await expect(page.locator(LAYER)).toHaveJSProperty("textContent", "新的课程。");
  await expect(page.locator(LAYER)).toHaveCount(1);
  await page.locator(".lesson-canvas-clipper").evaluate((node) => node.remove());
  await expect(page.locator(LAYER)).toHaveCount(0);
});

test("unrelated drawing retains native return values, exceptions and argument coercion", async ({ page }) => {
  await mount(page);
  const result = await page.evaluate(() => {
    const context = document.querySelector("#unrelated").getContext("2d");
    let coercions = 0;
    const returned = context.fillText({ toString() { ++coercions; return "中文"; } }, 0, 10);
    let exception;
    try { context.fillText(); } catch (error) { exception = error.name; }
    return { undefinedResult: returned === undefined, coercions, exception };
  });
  expect(result).toEqual({ undefinedResult: true, coercions: 1, exception: "TypeError" });
  await expect(page.locator(LAYER)).toHaveCount(1);
});

test("fails safely on unsupported transforms and recovers after a full redraw", async ({ page }) => {
  const warnings = [];
  page.on("console", (message) => { if (message.type() === "warning") warnings.push(message.text()); });
  await mount(page);
  await page.locator("#prose").evaluate((canvas) => {
    const ctx = canvas.getContext("2d");
    ctx.rotate(0.2);
    ctx.fillText("中文", 20, 20);
    ctx.fillText("测试", 40, 40);
  });
  await expect(page.locator(LAYER)).toHaveCount(0);
  expect(warnings).toHaveLength(1);
  await page.evaluate(() => window.render());
  await expect(page.locator(LAYER)).toHaveJSProperty("textContent", TEXT);
});

test("coexists with the audio downloader", async ({ page }) => {
  await mount(page);
  await page.evaluate(() => {
    document.body.insertAdjacentHTML("beforeend", '<div class="du-player-controls"><div></div><div class="du-player-button"><div id="du-player"><audio><source src="https://static.duchinese.net/documents/1233/audio.mp3"></audio></div></div><div></div></div>');
    window.GM = { addStyle(css) { const style = document.createElement("style"); style.textContent = css; document.head.appendChild(style); }, async download() { window.downloaded = true; } };
  });
  await page.addScriptTag({ path: path.resolve(__dirname, "../scripts/duchinese-audio-downloader.user.js") });
  await page.locator("#duchinese-audio-downloader-button").click();
  await expect.poll(() => page.evaluate(() => window.downloaded)).toBe(true);
  await expect(page.locator(LAYER)).toHaveJSProperty("textContent", TEXT);
});
