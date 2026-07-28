const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("playwright/test");

const SCRIPTS_DIR = path.resolve(__dirname, "../scripts");
const OPENCC_UMD_PATH = path.resolve(
  __dirname,
  "../node_modules/opencc-js/dist/umd/t2cn.js",
);
const SCRIPT_CONFIG = {
  "anilist-english-titles.user.js": {
    grants: [
      "GM.addStyle",
      "GM.xmlHttpRequest",
      "window.onurlchange",
    ],
    spa: true,
  },
  "gagaoolala-subtitle-downloader.user.js": {
    grants: [
      "GM.addStyle",
      "GM.download",
      "GM.xmlHttpRequest",
      "GM.registerMenuCommand",
      "window.onurlchange",
    ],
    spa: true,
  },
  "iqiyi-subtitle-downloader.user.js": {
    grants: [
      "GM.addStyle",
      "GM.download",
      "GM.xmlHttpRequest",
      "GM.registerMenuCommand",
      "window.onurlchange",
    ],
    spa: true,
  },
  "missevan-subtitle-styler.user.js": {
    grants: [
      "GM.addStyle",
      "GM.getValue",
      "GM.setValue",
      "GM.registerMenuCommand",
      "window.onurlchange",
    ],
    spa: true,
  },
  "nyaa-group-hider.user.js": {
    grants: [
      "GM.addStyle",
      "GM.getValues",
      "GM.setValue",
      "GM.registerMenuCommand",
    ],
    spa: false,
  },
  "plex-open-in-mpv.user.js": {
    grants: [
      "GM.addStyle",
      "window.onurlchange",
    ],
    spa: true,
  },
  "yatsu-simplified-chinese.user.js": {
    grants: [
      "GM.getValue",
      "GM.setValue",
      "GM.registerMenuCommand",
    ],
    spa: false,
  },
};

function scriptPath(filename) {
  return path.join(SCRIPTS_DIR, filename);
}

function readScript(filename) {
  return fs.readFileSync(scriptPath(filename), "utf8");
}

function metadataGrants(source) {
  return [...source.matchAll(/^\/\/ @grant\s+(.+)$/gm)].map((match) => match[1].trim());
}

test("all in-scope scripts use their exact modern Tampermonkey grants", () => {
  for (const [filename, configuration] of Object.entries(SCRIPT_CONFIG)) {
    const source = readScript(filename);
    expect(source, filename).not.toMatch(/\bGM_[A-Za-z0-9_]+\b/);
    expect(metadataGrants(source), filename).toEqual(configuration.grants);
  }
});

test("Yatsu uses the DOM sandbox and the latest optimized OpenCC bundle", () => {
  const source = readScript("yatsu-simplified-chinese.user.js");
  const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf8"));

  expect(source).toContain("// @version      1.2.4");
  expect(source).toContain("// @sandbox      DOM");
  expect(source).toContain(
    "// @require      https://cdn.jsdelivr.net/npm/opencc-js@latest/dist/umd/t2cn.js",
  );
  expect(source).not.toMatch(/opencc-js@\d/);
  expect(source).not.toMatch(/#(?:md5|sha(?:1|224|256|384|512))=/i);
  expect(packageJson.devDependencies["opencc-js"]).toBe("latest");
  expect(source).not.toMatch(/^\/\/ @run-in\b/m);
  expect(source).not.toContain("window.onurlchange");
});

test("AniList uses the modern DOM sandbox and Promise-based request API", () => {
  const source = readScript("anilist-english-titles.user.js");

  expect(source).toContain("// @version      0.1.0");
  expect(source).toContain("// @sandbox      DOM");
  expect(source).toContain("// @run-at       document-start");
  expect(source).toContain("// @connect      graphql.anilist.co");
  expect(source).toContain("// @noframes");
  expect(source).not.toMatch(/^\/\/ @run-in\b/m);
  expect(source).toMatch(/request\s*=\s*GM\.xmlHttpRequest\(\{/);
  expect(source).toMatch(/const response = await request;/);
  expect(source).toContain("request.abort()");
  expect(source).toContain("responseType: \"json\"");
  expect(source).toContain("anonymous: true");
  expect(source).toContain("fetch: true");
  expect(source).toContain("redirect: \"error\"");
  expect(source).not.toMatch(/^\s+(?:onload|onerror|ontimeout):/m);
});

test("the modernization scope excludes DuChinese", () => {
  expect(Object.keys(SCRIPT_CONFIG)).not.toContain("duchinese-audio-downloader.user.js");
  expect(readScript("duchinese-audio-downloader.user.js")).toContain("// @version      0.4.1");
});

test("SPA scripts use urlchange without History interception or URL polling", () => {
  for (const [filename, configuration] of Object.entries(SCRIPT_CONFIG)) {
    if (!configuration.spa) {
      continue;
    }

    const source = readScript(filename);
    expect(source, filename).toContain('window.addEventListener("urlchange"');
    expect(source, filename).not.toMatch(/history\.(?:pushState|replaceState)\s*=/);
    expect(source, filename).not.toMatch(/addEventListener\("(?:popstate|hashchange)"/);
    expect(source, filename).not.toContain("ROUTE_CHECK_INTERVAL_MS");
    expect(source, filename).not.toContain("lastHref");
  }
});

test("iQIYI uses match metadata only", () => {
  expect(readScript("iqiyi-subtitle-downloader.user.js")).not.toMatch(/^\/\/ @include\b/m);
});

test("subtitle downloaders await the Promise-based privileged APIs", () => {
  for (const filename of [
    "gagaoolala-subtitle-downloader.user.js",
    "iqiyi-subtitle-downloader.user.js",
  ]) {
    const source = readScript(filename);
    expect(source, filename).toMatch(/await GM\.download\(\{/);
    expect(source, filename).toMatch(/await GM\.xmlHttpRequest\(\{/);
    expect(source, filename).not.toMatch(/^\s+(?:onload|onerror|ontimeout):/m);
  }
});

test("Missevan awaits stored settings, persists objects, and schedules a rebind on urlchange", async ({ page }) => {
  await page.setContent('<div class="subtitle-container"></div>');
  await page.evaluate(() => {
    window.__gmCalls = { getValue: [], setValue: [], styles: [], menus: [] };
    window.GM = {
      addStyle(css) {
        window.__gmCalls.styles.push(css);
        const style = document.createElement("style");
        style.textContent = css;
        document.head.appendChild(style);
        return style;
      },
      async getValue(key, fallbackValue) {
        window.__gmCalls.getValue.push({ key, fallbackValue });
        await new Promise((resolve) => window.setTimeout(resolve, 20));
        return {
          fontSize: 42,
          fontWeight: 700,
          lineHeight: 1.4,
          verticalPosition: 72,
          backgroundOpacity: 0.5,
          shadowStrength: "soft",
          useRoleColors: true,
          textColor: "#ffffff",
          fontFamily: "sans-serif",
        };
      },
      async setValue(key, value) {
        window.__gmCalls.setValue.push({ key, value });
      },
      registerMenuCommand(name, callback) {
        window.__gmCalls.menus.push({ name, callback });
        return name;
      },
    };
  });

  await page.addScriptTag({ path: scriptPath("missevan-subtitle-styler.user.js") });
  await expect(page.locator("#missevan-subtitle-styler-launcher")).toBeVisible();
  await expect.poll(
    () => page.evaluate(() => document.documentElement.style.getPropertyValue("--mss-font-size")),
  ).toBe("42px");

  await page.locator('[data-setting-key="fontSize"]').evaluate((input) => {
    input.value = "44";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect.poll(() => page.evaluate(() => window.__gmCalls.setValue.at(-1)?.value.fontSize)).toBe(44);
  await expect.poll(() => page.evaluate(() => typeof window.__gmCalls.setValue.at(-1)?.value)).toBe("object");

  const zeroDelayTimeoutsBefore = await page.evaluate(() => {
    window.__zeroDelayTimeouts = 0;
    const originalSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (callback, delay, ...args) => {
      if (delay === 0) {
        window.__zeroDelayTimeouts += 1;
      }
      return originalSetTimeout(callback, delay, ...args);
    };
    return window.__zeroDelayTimeouts;
  });
  await page.evaluate(() => window.dispatchEvent(new Event("urlchange")));
  await expect.poll(() => page.evaluate(() => window.__zeroDelayTimeouts)).toBeGreaterThan(zeroDelayTimeoutsBefore);
});

test("Nyaa batches its initial storage read before applying both group lists", async ({ page }) => {
  await page.setContent(`
    <table class="torrent-list">
      <tbody>
        <tr id="hidden-row"><td><a href="/view/1">[HideMe] Hidden release</a></td></tr>
        <tr id="highlighted-row"><td><a href="/view/2">[HighlightMe] Highlighted release</a></td></tr>
      </tbody>
    </table>
  `);
  await page.evaluate(() => {
    window.__gmCalls = { getValues: [], setValue: [], menus: [] };
    window.GM = {
      addStyle(css) {
        const style = document.createElement("style");
        style.textContent = css;
        document.head.appendChild(style);
        return style;
      },
      async getValues(defaults) {
        window.__gmCalls.getValues.push(defaults);
        await new Promise((resolve) => window.setTimeout(resolve, 20));
        return {
          "nyaa-group-hider-hidden-groups": ["HideMe"],
          "nyaa-group-hider-highlighted-groups": ["HighlightMe"],
        };
      },
      async setValue(key, value) {
        window.__gmCalls.setValue.push({ key, value });
      },
      registerMenuCommand(name, callback) {
        window.__gmCalls.menus.push({ name, callback });
        return name;
      },
    };
  });

  await page.addScriptTag({ path: scriptPath("nyaa-group-hider.user.js") });
  await expect(page.locator("#hidden-row")).toHaveClass(/nyaa-group-hider-hidden/);
  await expect(page.locator("#highlighted-row")).toHaveClass(/nyaa-group-hider-highlighted/);
  await expect.poll(() => page.evaluate(() => window.__gmCalls.getValues.length)).toBe(1);
  await expect.poll(
    () => page.evaluate(() => Object.keys(window.__gmCalls.getValues[0]).sort()),
  ).toEqual([
    "nyaa-group-hider-hidden-groups",
    "nyaa-group-hider-highlighted-groups",
  ]);
});

test("Yatsu awaits its setting, registers a descriptive menu, and converts eligible text", async ({ page }) => {
  await page.setContent(`
    <title>傳統標題</title>
    <main>傳統內容 看著 著名 著作</main>
    <input value="傳統輸入">
    <code>傳統程式</code>
    <div contenteditable="true"><span>傳統編輯</span></div>
  `);
  await page.evaluate(() => {
    const shadowHost = document.createElement("div");
    shadowHost.id = "shadow-host";
    shadowHost.attachShadow({ mode: "open" }).innerHTML = "<span>傳統陰影</span>";
    document.body.appendChild(shadowHost);

    window.__gmCalls = { getValue: [], setValue: [], menus: [], converter: [], customConverter: [] };
    window.__settingPromise = new Promise((resolve) => {
      window.__resolveSetting = resolve;
    });
    window.OpenCC = {
      Converter(options) {
        window.__gmCalls.converter.push(options);
        return (text) => text
          .replaceAll("傳統", "传统")
          .replaceAll("標題", "标题")
          .replaceAll("內容", "内容")
          .replaceAll("動態", "动态")
          .replaceAll("程式", "程序")
          .replaceAll("編輯", "编辑")
          .replaceAll("陰影", "阴影");
      },
      CustomConverter(entries) {
        window.__gmCalls.customConverter.push(entries);
        const longestFirst = [...entries].sort((left, right) => right[0].length - left[0].length);
        return (text) => {
          let converted = "";
          for (let index = 0; index < text.length;) {
            const match = longestFirst.find(([source]) => text.startsWith(source, index));
            if (match) {
              converted += match[1];
              index += match[0].length;
            } else {
              converted += text[index];
              index += 1;
            }
          }
          return converted;
        };
      },
    };
    window.GM = {
      async getValue(key, fallbackValue) {
        window.__gmCalls.getValue.push({ key, fallbackValue });
        return window.__settingPromise;
      },
      async setValue(key, value) {
        window.__gmCalls.setValue.push({ key, value });
      },
      async registerMenuCommand(name, callback, options) {
        window.__gmCalls.menus.push({ name, callback, options });
        return name;
      },
    };
  });

  await page.addScriptTag({ path: scriptPath("yatsu-simplified-chinese.user.js") });
  await expect(page.locator("main")).toHaveText("傳統內容 看著 著名 著作");
  await expect.poll(() => page.evaluate(() => window.__gmCalls.menus.length)).toBe(0);
  await page.evaluate(() => window.__resolveSetting(true));

  await expect.poll(() => page.locator("main").textContent()).toBe("传统内容 看着 著名 著作");
  await expect.poll(() => page.title()).toBe("传统标题");
  await expect(page.locator("input")).toHaveValue("傳統輸入");
  await expect(page.locator("code")).toHaveText("傳統程式");
  await expect(page.locator('[contenteditable="true"]')).toHaveText("傳統編輯");
  await expect.poll(
    () => page.evaluate(() => document.querySelector("#shadow-host").shadowRoot.textContent),
  ).toBe("传统阴影");
  await expect.poll(() => page.evaluate(() => window.__gmCalls.getValue)).toEqual([
    { key: "yatsu-t2s-enabled", fallbackValue: true },
  ]);
  await expect.poll(
    () => page.evaluate(() => window.__gmCalls.menus.map(({ name, options }) => ({ name, options }))),
  ).toEqual([
    {
      name: "Disable Simplified conversion (reloads page)",
      options: {
        title: "Disable conversion and reload this page.",
      },
    },
  ]);
  await expect.poll(() => page.evaluate(() => window.__gmCalls.converter)).toEqual([
    { from: "t", to: "cn" },
  ]);
  await expect.poll(
    () => page.evaluate(() => window.__gmCalls.customConverter[0]),
  ).toEqual([
    ["鉅著", "钜著"],
    ["潀", "潨"],
    ["痺", "痹"],
    ["睪", "睾"],
    ["簷", "檐"],
  ]);
  await expect.poll(() => page.evaluate(() => window.__gmCalls.customConverter.length)).toBe(1);

  await page.locator("main").evaluate((main) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = "動態內容";
    main.appendChild(paragraph);
  });
  await expect.poll(() => page.locator("p").textContent()).toBe("动态内容");
});

test("Yatsu preserves phrase context across inline and ruby markup with OpenCC", async ({ page }) => {
  await page.setContent(
    '<title>傳統標題</title>'
      + '<main>'
      + '<p id="inline"><span>乾</span><span>隆</span> <span>著</span><span>名</span> '
      + '<span>看</span><span>著</span></p>'
      + '<p id="ruby"><ruby><span class="ruby-base">乾</span><rt>ㄍㄢ</rt></ruby>'
      + '<span class="ruby-base">隆</span></p>'
      + '<p id="standalone-dry">乾</p><p id="standalone-long">隆</p>'
      + '<p id="zhe-cases">著於竹帛 著式 著志 著白 鉅著 鴻篇鉅著 趁著 接著</p>'
      + '<input id="attributes" value="傳統輸入" placeholder="傳統提示" '
      + 'aria-label="傳統標籤" title="傳統標題">'
      + '</main>',
  );
  await page.addScriptTag({ path: OPENCC_UMD_PATH });
  await page.evaluate(() => {
    window.GM = {
      async getValue() {
        return true;
      },
      async setValue() {},
      registerMenuCommand() {
        return "menu-id";
      },
    };
  });

  await page.addScriptTag({ path: scriptPath("yatsu-simplified-chinese.user.js") });

  await expect.poll(() => page.locator("#inline").textContent()).toBe("乾隆 著名 看着");
  await expect.poll(
    () => page.locator("#ruby .ruby-base").allTextContents(),
  ).toEqual(["乾", "隆"]);
  await expect(page.locator("#ruby rt")).toHaveText("ㄍㄢ");
  await expect(page.locator("#standalone-dry")).toHaveText("干");
  await expect(page.locator("#standalone-long")).toHaveText("隆");
  await expect(page.locator("#zhe-cases")).toHaveText(
    "著于竹帛 著式 著志 著白 钜著 鸿篇钜著 趁着 接着",
  );
  await expect.poll(() => page.title()).toBe("传统标题");
  await expect(page.locator("#attributes")).toHaveValue("傳統輸入");
  await expect(page.locator("#attributes")).toHaveAttribute("placeholder", "傳統提示");
  await expect(page.locator("#attributes")).toHaveAttribute("aria-label", "傳統標籤");
  await expect(page.locator("#attributes")).toHaveAttribute("title", "傳統標題");
});

test("Yatsu disambiguates 著 by word without crossing lexical boundaries", async ({ page }) => {
  const cases = [
    ["拿著書看", "拿着书看"],
    ["看著名字", "看着名字"],
    ["聽著名曲", "听着名曲"],
    ["看著錄像", "看着录像"],
    ["接著有請", "接着有请"],
    ["看著有點奇怪", "看着有点奇怪"],
    ["附著於表面", "附着于表面"],
    ["執著於理想", "执着于理想"],
    ["穿著白衣", "穿着白衣"],
    ["身著白色襯衫", "身着白色衬衫"],
    ["衣著式樣", "衣着式样"],
    ["藉著機會", "借着机会"],
    ["憑藉著經驗", "凭借着经验"],
    ["著名", "著名"],
    ["著作", "著作"],
    ["著者", "著者"],
    ["著書立說", "著书立说"],
    ["著錄", "著录"],
    ["著稱", "著称"],
    ["著述", "著述"],
    ["著有", "著有"],
    ["名著", "名著"],
    ["原著", "原著"],
    ["巨著", "巨著"],
    ["鉅著", "钜著"],
    ["專著", "专著"],
    ["論著", "论著"],
    ["編著", "编著"],
    ["譯著", "译著"],
    ["合著", "合著"],
    ["拙著", "拙著"],
    ["遺著", "遗著"],
    ["顯著", "显著"],
    ["昭著", "昭著"],
    ["卓著", "卓著"],
    ["土著", "土著"],
    ["新著", "新著"],
    ["舊著", "旧著"],
    ["近著", "近著"],
    ["魯迅著《吶喊》", "鲁迅著《呐喊》"],
    ["著成此書", "著成此书"],
    ["著文立說", "著文立说"],
    ["著於竹帛", "著于竹帛"],
    ["看著作", "看著作"],
    ["拿著作業", "拿着作业"],
    ["著名作家", "著名作家"],
    ["看著名人", "看着名人"],
    ["作者著書", "作者著书"],
    ["拿著書", "拿着书"],
    ["他微笑著說", "他微笑著说"],
    ["么妹", "么妹"],
    ["什麼", "什么"],
    ["怎麼", "怎么"],
    ["那麼", "那么"],
    ["為什麼", "为什么"],
    ["麻痺", "麻痹"],
    ["睪丸", "睾丸"],
    ["屋簷", "屋檐"],
    ["潀", "潨"],
  ];

  await page.setContent(
    `<main>`
      + `<section id="traditional-cases">${cases.map(([source], index) => (
        `<p data-case="${index}">${source}</p>`
      )).join("")}</section>`
      + `<section id="idempotent-cases">${cases.map(([, expected], index) => (
        `<p data-idempotent-case="${index}">${expected}</p>`
      )).join("")}</section>`
      + `</main>`,
  );
  await page.addScriptTag({ path: OPENCC_UMD_PATH });
  await page.evaluate(() => {
    window.GM = {
      async getValue() {
        return true;
      },
      async setValue() {},
      registerMenuCommand() {
        return "menu-id";
      },
    };
  });

  await page.addScriptTag({ path: scriptPath("yatsu-simplified-chinese.user.js") });

  await expect.poll(
    () => page.locator("[data-case]").allTextContents(),
  ).toEqual(cases.map(([, expected]) => expected));
  await expect.poll(
    () => page.locator("[data-idempotent-case]").allTextContents(),
  ).toEqual(cases.map(([, expected]) => expected));
});

test("Yatsu preserves already-Simplified and mixed-script text", async ({ page }) => {
  const simplifiedCases = [
    "什么", "怎么", "这么", "那么", "多么", "为什么", "要么",
    "著录", "著称", "专著", "编著", "显著", "看着书", "接着说",
  ];

  await page.setContent(
    `<main>`
      + `<section id="simplified-cases">${simplifiedCases.map((text, index) => (
        `<p data-simplified-case="${index}">${text}</p>`
      )).join("")}</section>`
      + `<p id="mixed-script">這是一本專著；这是一本专著</p>`
      + `</main>`,
  );
  await page.addScriptTag({ path: OPENCC_UMD_PATH });
  await page.evaluate(() => {
    window.GM = {
      async getValue() {
        return true;
      },
      async setValue() {},
      registerMenuCommand() {
        return "menu-id";
      },
    };
  });

  await page.addScriptTag({ path: scriptPath("yatsu-simplified-chinese.user.js") });

  await expect.poll(
    () => page.locator("[data-simplified-case]").allTextContents(),
  ).toEqual(simplifiedCases);
  await expect(page.locator("#mixed-script")).toHaveText(
    "这是一本专著；这是一本专著",
  );
});

test("Yatsu conservatively leaves 著 unchanged when Intl.Segmenter is unavailable", async ({ page }) => {
  const warnings = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "warning" && message.text().includes("[Yatsu Reader T2S]")) {
      warnings.push(message.text());
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.setContent('<main><p id="static-fallback">看著傳統內容</p></main>');
  await page.addScriptTag({ path: OPENCC_UMD_PATH });
  await page.evaluate(() => {
    Object.defineProperty(Intl, "Segmenter", {
      value: undefined,
      configurable: true,
    });
    window.GM = {
      async getValue() {
        return true;
      },
      async setValue() {},
      registerMenuCommand() {
        return "menu-id";
      },
    };
  });

  await page.addScriptTag({ path: scriptPath("yatsu-simplified-chinese.user.js") });

  await expect.poll(() => page.locator("#static-fallback").textContent()).toBe("看著传统内容");
  await expect.poll(() => warnings).toEqual([
    expect.stringContaining("Intl.Segmenter is unavailable; leaving ambiguous 著 unchanged."),
  ]);
  expect(pageErrors).toEqual([]);

  await page.locator("main").evaluate((main) => {
    const paragraph = document.createElement("p");
    paragraph.id = "dynamic-fallback";
    paragraph.textContent = "接著傳統內容";
    main.appendChild(paragraph);
  });
  await expect.poll(() => page.locator("#dynamic-fallback").textContent()).toBe("接著传统内容");
  await page.waitForTimeout(50);
  expect(warnings).toHaveLength(1);
  expect(pageErrors).toEqual([]);
});

test("Yatsu recomputes dynamic inline runs and rejects dynamically added excluded subtrees", async ({ page }) => {
  await page.setContent('<main><p id="late-phrase"><span id="dry">乾</span></p></main>');
  await page.addScriptTag({ path: OPENCC_UMD_PATH });
  await page.evaluate(() => {
    window.GM = {
      async getValue() {
        return true;
      },
      async setValue() {},
      registerMenuCommand() {
        return "menu-id";
      },
    };
  });
  await page.addScriptTag({ path: scriptPath("yatsu-simplified-chinese.user.js") });
  await expect(page.locator("#dry")).toHaveText("干");

  await page.evaluate(() => {
    const long = document.createElement("span");
    long.id = "long";
    long.textContent = "隆";
    document.querySelector("#late-phrase").appendChild(long);

    const code = document.createElement("code");
    code.id = "dynamic-code";
    code.innerHTML = '<span id="nested-code">傳統程式</span>';
    document.body.appendChild(code);
    document.querySelector("#nested-code").firstChild.nodeValue = "動態程式";

    const editable = document.createElement("div");
    editable.id = "dynamic-editable";
    editable.contentEditable = "true";
    editable.textContent = "傳統編輯";
    document.body.appendChild(editable);
  });

  await expect.poll(() => page.locator("#late-phrase").textContent()).toBe("乾隆");
  await expect(page.locator("#dynamic-code")).toHaveText("動態程式");
  await expect(page.locator("#dynamic-editable")).toHaveText("傳統編輯");
});

test("Yatsu converts and observes existing and dynamically added open shadow roots", async ({ page }) => {
  await page.setContent('<main><div id="existing-host"></div></main>');
  await page.addScriptTag({ path: OPENCC_UMD_PATH });
  await page.evaluate(() => {
    document.querySelector("#existing-host").attachShadow({ mode: "open" }).innerHTML =
      '<p id="existing-shadow-text">傳統內容</p>';
    window.GM = {
      async getValue() {
        return true;
      },
      async setValue() {},
      registerMenuCommand() {
        return "menu-id";
      },
    };
  });
  await page.addScriptTag({ path: scriptPath("yatsu-simplified-chinese.user.js") });

  await expect.poll(
    () => page.evaluate(() => document.querySelector("#existing-host").shadowRoot.textContent),
  ).toBe("传统内容");

  await page.evaluate(() => {
    const existingRoot = document.querySelector("#existing-host").shadowRoot;
    existingRoot.querySelector("#existing-shadow-text").textContent = "動態內容";
    const added = document.createElement("p");
    added.id = "added-shadow-text";
    added.textContent = "新增陰影";
    existingRoot.appendChild(added);

    const lateHost = document.createElement("div");
    lateHost.id = "late-host";
    lateHost.attachShadow({ mode: "open" }).innerHTML =
      '<p id="late-shadow-text">傳統陰影</p>';
    document.querySelector("main").appendChild(lateHost);
  });

  await expect.poll(
    () => page.evaluate(() => document.querySelector("#existing-host").shadowRoot.textContent),
  ).toBe("动态内容新增阴影");
  await expect.poll(
    () => page.evaluate(() => document.querySelector("#late-host").shadowRoot.textContent),
  ).toBe("传统阴影");

  await page.evaluate(() => {
    document.querySelector("#late-host").shadowRoot.querySelector("p").textContent = "動態陰影";
  });
  await expect.poll(
    () => page.evaluate(() => document.querySelector("#late-host").shadowRoot.textContent),
  ).toBe("动态阴影");
});

test("Yatsu safely falls back when conversion changes code-point count without observer feedback", async ({ page }) => {
  const warnings = [];
  page.on("console", (message) => {
    if (message.type() === "warning") warnings.push(message.text());
  });
  await page.setContent('<p id="length-change"><span id="first">傳</span><span id="second">統</span></p>');
  await page.evaluate(() => {
    window.__converterCalls = 0;
    window.OpenCC = {
      Converter() {
        return (text) => {
          if (text.includes("傳") || text.includes("統")) {
            window.__converterCalls += 1;
          }
          if (text === "傳統") return "传统额";
          return text.replaceAll("傳", "传").replaceAll("統", "统");
        };
      },
      CustomConverter() {
        return (text) => text;
      },
    };
    window.GM = {
      async getValue() {
        return true;
      },
      async setValue() {},
      registerMenuCommand() {
        return "menu-id";
      },
    };
  });

  await page.addScriptTag({ path: scriptPath("yatsu-simplified-chinese.user.js") });
  await expect(page.locator("#first")).toHaveText("传");
  await expect(page.locator("#second")).toHaveText("统");
  await expect.poll(() => warnings).toEqual([
    expect.stringContaining("falling back to independent text-node conversion"),
  ]);
  await expect.poll(() => page.evaluate(() => window.__converterCalls)).toBe(3);
  await page.waitForTimeout(50);
  expect(await page.evaluate(() => window.__converterCalls)).toBe(3);
});

test("disabled Yatsu registers its enable command without starting conversion", async ({ page }) => {
  await page.setContent("<main>傳統內容</main>");
  await page.evaluate(() => {
    window.__gmCalls = { menus: [], converterCalls: 0, customConverterCalls: 0 };
    window.OpenCC = {
      Converter() {
        window.__gmCalls.converterCalls += 1;
        return (text) => text.replaceAll("傳統內容", "传统内容");
      },
      CustomConverter() {
        window.__gmCalls.customConverterCalls += 1;
        return (text) => text;
      },
    };
    window.GM = {
      async getValue() {
        return false;
      },
      async setValue() {},
      async registerMenuCommand(name, callback, options) {
        window.__gmCalls.menus.push({ name, callback, options });
        return name;
      },
    };
  });

  await page.addScriptTag({ path: scriptPath("yatsu-simplified-chinese.user.js") });
  await expect.poll(
    () => page.evaluate(() => window.__gmCalls.menus.map(({ name, options }) => ({ name, options }))),
  ).toEqual([
    {
      name: "Enable Simplified conversion (reloads page)",
      options: {
        title: "Enable conversion and reload this page.",
      },
    },
  ]);
  await expect(page.locator("main")).toHaveText("傳統內容");
  await expect.poll(
    () => page.evaluate(() => ({
      converterCalls: window.__gmCalls.converterCalls,
      customConverterCalls: window.__gmCalls.customConverterCalls,
    })),
  ).toEqual({ converterCalls: 0, customConverterCalls: 0 });

  await page.locator("main").evaluate((main) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = "動態內容";
    main.appendChild(paragraph);
  });
  await expect(page.locator("p")).toHaveText("動態內容");
});

test("Yatsu reports initialization failures without an unhandled rejection", async ({ page }) => {
  const pageErrors = [];
  const errorMessages = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errorMessages.push(message.text());
    }
  });

  await page.setContent("<main>傳統內容</main>");
  await page.evaluate(() => {
    window.GM = {
      async getValue() {
        return true;
      },
      async setValue() {},
      async registerMenuCommand() {
        return "menu-id";
      },
    };
  });

  await page.addScriptTag({ path: scriptPath("yatsu-simplified-chinese.user.js") });
  await expect.poll(() => errorMessages).toEqual([
    expect.stringContaining("[Yatsu Reader T2S] Initialization failed."),
  ]);
  expect(pageErrors).toEqual([]);
  await expect(page.locator("main")).toHaveText("傳統內容");
});
