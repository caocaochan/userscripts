const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("playwright/test");

const SCRIPT_PATH = path.resolve(
  __dirname,
  "../scripts/jjwxc-reader-theme.user.js",
);
const SCRIPT_SOURCE = fs.readFileSync(SCRIPT_PATH, "utf8");

const SOLARIZED = {
  base03: "#002b36",
  base02: "#073642",
  base01: "#586e75",
  base00: "#657b83",
  base0: "#839496",
  base1: "#93a1a1",
  base2: "#eee8d5",
  base3: "#fdf6e3",
  yellow: "#b58900",
  orange: "#cb4b16",
  red: "#dc322f",
  magenta: "#d33682",
  violet: "#6c71c4",
  blue: "#268bd2",
  cyan: "#2aa198",
  green: "#859900",
};

const MANIFEST_ENTRY = {
  id: "jjwxc-reader-theme",
  name: "JJWXC Reader — LXGW WenKai + Solarized Light",
  description:
    "Formats JJWXC chapter prose at 20px with LXGW WenKai Screen and themes desktop chapter pages with Solarized Light.",
  installUrl:
    "https://raw.githubusercontent.com/caocaochan/userscripts/main/scripts/jjwxc-reader-theme.user.js",
  sourceUrl:
    "https://github.com/caocaochan/userscripts/blob/main/scripts/jjwxc-reader-theme.user.js",
  tags: [
    "tampermonkey",
    "jjwxc",
    "chinese",
    "novels",
    "font",
    "solarized",
    "theme",
  ],
};

const SITE_CSS = `
  :root {
    --default-color: #000000;
    --default-background-color: #ffffff;
    --theme-color-1: #eefaee;
    --theme-color-2: #9fd59e;
    --theme-color-3: #009900;
    --theme-color-4: #e3ece3;
    --default-border-color: #009900;
    --highlight-text-color: #009900;
    --input-background-color: #ffffff;
    --input-border-color: #000000;
    --danmu-background: #ffffff;
    --danmu-main-text-color: #303030;
  }

  body {
    color: var(--default-color);
    background: #ffffff url("https://static.jjwxc.net/images/channel_2010/pagebg.gif");
  }

  div,
  h2,
  a {
    color: var(--default-color);
  }

  .noveltext {
    font-size: 16px;
    line-height: 1.8;
    font-family:
      "Microsoft YaHei",
      PingFangSC-Regular,
      HelveticaNeue-Light,
      "Helvetica Neue Light",
      sans-serif !important;
  }

  .noveltext h2 {
    font-size: 16px;
  }

  .noveltitle {
    background-color: var(--theme-color-2);
    border: 1px solid var(--default-border-color);
  }

  .novelbody {
    background-color: var(--theme-color-1);
    border: 1px solid var(--default-border-color);
  }

  #note_danmu_wrapper {
    color: #303030;
    background: var(--danmu-background);
  }

  .chapter_comment_button {
    color: var(--highlight-text-color);
    background-color: var(--theme-color-2);
  }

  .input2 {
    color: #000000;
    background: #ffffff url("https://static.jjwxc.net/images/Channel/header_006.gif");
    border: 1px solid #afd7ae;
  }

  .link1 a {
    display: block;
    width: 64px;
    height: 24px;
    background-image: url("https://static.jjwxc.net/images/yq_index_new.png");
  }

  .link2,
  .nav2,
  .nav3,
  .mainnav {
    background-image: url("https://static.jjwxc.net/images/channel_2010/headbg1.jpg");
  }
`;

async function loadFixture(page) {
  await page.setContent(`
    <header>
      <div class="link1"><a id="channel-sprite" href="/channel"></a></div>
      <div class="link2">Secondary links</div>
      <div class="nav2">
        <div id="dymenu">
          <ul class="root">
            <li><div class="title"><a href="/library">Library</a></div></li>
          </ul>
        </div>
      </div>
      <div class="nav3">
        <div class="mainnav"><a id="main-nav-link" href="/main">Main</a></div>
      </div>
    </header>
    <main>
      <div class="noveltitle">Novel title</div>
      <div class="novelbody">
        <div class="noveltext">
          <h2 id="chapter-heading">Chapter heading</h2>
          <div id="paragraph_comment_content">Chapter prose</div>
          <div id="note_danmu_wrapper">
            <div class="note_chapter_title" id="author-note-heading">Author note</div>
          </div>
        </div>
      </div>
      <a id="chapter-link" href="/next">Next chapter</a>
      <input class="input2" id="search-input" value="Search text">
      <button class="chapter_comment_button" id="comment-button">Comment</button>
      <button
        class="reader_setting_theme_btn"
        id="reader-theme-swatch"
        style="background-color: rgb(17, 34, 51)"
      ></button>
      <div class="warning" id="warning">Warning</div>
      <div class="redtext" id="error">Error</div>
      <div class="danmu_king_sp" id="special-danmu">Special danmu</div>
    </main>
    <footer id="footer">Footer</footer>
  `);

  await page.evaluate(() => {
    window.__gmStyles = [];
    window.GM = {
      addStyle(css) {
        window.__gmStyles.push(css);
        const style = document.createElement("style");
        style.dataset.source = "userscript";
        style.textContent = css;
        document.head.append(style);
        return style;
      },
    };
  });

  await page.addScriptTag({ path: SCRIPT_PATH });
  await page.addStyleTag({ content: SITE_CSS });
}

test("metadata and manifest expose the JJWXC reader theme", () => {
  expect(SCRIPT_SOURCE).toContain("// @version      0.1.1");
  expect(SCRIPT_SOURCE).toContain("// @match        https://www.jjwxc.net/onebook.php*");
  expect(SCRIPT_SOURCE).toContain("// @tag          jjwxc");
  expect(SCRIPT_SOURCE).toContain("// @tag          font");
  expect(SCRIPT_SOURCE).toContain("// @tag          solarized");
  expect(SCRIPT_SOURCE).toContain("// @tag          reading");
  expect(SCRIPT_SOURCE).toContain("// @run-at       document-start");
  expect(SCRIPT_SOURCE).toContain("// @sandbox      DOM");
  expect(SCRIPT_SOURCE).toContain("// @grant        GM.addStyle");
  expect(SCRIPT_SOURCE).toContain("// @noframes");

  const manifest = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../manifest.json"), "utf8"),
  );
  expect(manifest.scripts.find(({ id }) => id === "jjwxc-reader-theme")).toEqual(
    MANIFEST_ENTRY,
  );
});

test("uses one privileged style injection and no external or persistent APIs", () => {
  expect(SCRIPT_SOURCE.match(/\bGM\.addStyle\s*\(/g)).toHaveLength(1);
  expect(SCRIPT_SOURCE).not.toMatch(/^\/\/ @require\b/m);
  expect(SCRIPT_SOURCE).not.toMatch(/^\/\/ @resource\b/m);
  expect(SCRIPT_SOURCE).not.toMatch(/\bGM\.(?:getValue|setValue|registerMenuCommand)\b/);
  expect(SCRIPT_SOURCE).not.toContain("MutationObserver");
});

test("defines the canonical palette and protected JJWXC semantic mappings", () => {
  for (const [name, value] of Object.entries(SOLARIZED)) {
    expect(SCRIPT_SOURCE).toContain(
      `--solarized-${name}: ${value} !important;`,
    );
  }

  const mappings = {
    "--default-color": "--solarized-base00",
    "--default-background-color": "--solarized-base3",
    "--theme-color-1": "--solarized-base3",
    "--theme-color-2": "--solarized-base2",
    "--theme-color-3": "--solarized-green",
    "--theme-color-4": "--solarized-base2",
    "--default-border-color": "--solarized-base1",
    "--highlight-text-color": "--solarized-green",
    "--input-background-color": "--solarized-base3",
    "--input-border-color": "--solarized-base1",
    "--cancel-button-background-color": "--solarized-base2",
    "--theme-light-background": "--solarized-base3",
    "--theme-light-border": "--solarized-base1",
    "--grey-color-1": "--solarized-base01",
    "--dark-grey": "--solarized-base01",
    "--highlight-color-1": "--solarized-red",
    "--hightlight-color-1": "--solarized-red",
    "--highlight-color-2": "--solarized-blue",
    "--danmu-background": "--solarized-base3",
    "--danmu-main-text-color": "--solarized-base00",
  };

  for (const [siteVariable, solarizedVariable] of Object.entries(mappings)) {
    expect(SCRIPT_SOURCE).toContain(
      `${siteVariable}: var(${solarizedVariable}) !important;`,
    );
  }

  expect(SCRIPT_SOURCE).toContain("color-scheme: light;");
  expect(SCRIPT_SOURCE).toContain('"LXGW WenKai Screen",');
  expect(SCRIPT_SOURCE).not.toContain('" LXGW WenKai Screen",');
  expect(SCRIPT_SOURCE).not.toMatch(
    /\.link1[^,{]*\{[^}]*background-image\s*:\s*none/is,
  );
});

test("wins over later JJWXC styles without changing content or channel sprites", async ({
  page,
}) => {
  await loadFixture(page);

  await expect.poll(() => page.evaluate(() => window.__gmStyles.length)).toBe(1);
  await expect(page.locator("#paragraph_comment_content")).toHaveText("Chapter prose");
  await expect(page.locator("#chapter-heading")).toHaveText("Chapter heading");
  await expect(page.locator("#author-note-heading")).toHaveText("Author note");
  await expect(page.locator("#chapter-link")).toHaveAttribute("href", "/next");
  await expect(page.locator("#search-input")).toHaveValue("Search text");

  const styles = await page.evaluate(() => {
    const read = (selector) => {
      const style = getComputedStyle(document.querySelector(selector));
      return {
        color: style.color,
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        borderColor: style.borderColor,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
      };
    };

    return {
      rootDefaultColor: getComputedStyle(document.documentElement)
        .getPropertyValue("--default-color")
        .trim(),
      body: read("body"),
      prose: read("#paragraph_comment_content"),
      heading: read("#chapter-heading"),
      authorNoteHeading: read("#author-note-heading"),
      novelTitle: read(".noveltitle"),
      novelBody: read(".novelbody"),
      note: read("#note_danmu_wrapper"),
      link: read("#chapter-link"),
      input: read("#search-input"),
      commentButton: read("#comment-button"),
      readerThemeSwatch: read("#reader-theme-swatch"),
      warning: read("#warning"),
      error: read("#error"),
      specialDanmu: read("#special-danmu"),
      channelSprite: read("#channel-sprite"),
      mainNavigation: read(".mainnav"),
    };
  });

  expect(styles.rootDefaultColor).toBe("#657b83");
  expect(styles.body).toMatchObject({
    color: "rgb(101, 123, 131)",
    backgroundColor: "rgb(253, 246, 227)",
    backgroundImage: "none",
  });
  expect(styles.prose.color).toBe("rgb(101, 123, 131)");
  expect(styles.prose.fontFamily).toContain('"LXGW WenKai Screen"');
  expect(styles.prose.fontFamily.startsWith('"LXGW WenKai Screen"')).toBe(true);
  expect(styles.prose.fontSize).toBe("20px");
  expect(styles.prose.lineHeight).toBe("36px");
  expect(styles.heading.fontFamily).not.toContain("LXGW WenKai Screen");
  expect(styles.heading.fontFamily).toContain("Microsoft YaHei");
  expect(styles.heading.fontSize).toBe("16px");
  expect(styles.authorNoteHeading.fontFamily).not.toContain("LXGW WenKai Screen");
  expect(styles.authorNoteHeading.fontFamily).toContain("Microsoft YaHei");
  expect(styles.heading.color).toBe("rgb(88, 110, 117)");
  expect(styles.authorNoteHeading.color).toBe("rgb(88, 110, 117)");
  expect(styles.novelTitle).toMatchObject({
    backgroundColor: "rgb(238, 232, 213)",
    borderColor: "rgb(147, 161, 161)",
  });
  expect(styles.novelBody).toMatchObject({
    backgroundColor: "rgb(253, 246, 227)",
    borderColor: "rgb(147, 161, 161)",
  });
  expect(styles.note.backgroundColor).toBe("rgb(253, 246, 227)");
  expect(styles.link.color).toBe("rgb(38, 139, 210)");
  expect(styles.input).toMatchObject({
    color: "rgb(101, 123, 131)",
    backgroundColor: "rgb(253, 246, 227)",
    backgroundImage: "none",
    borderColor: "rgb(147, 161, 161)",
  });
  expect(styles.commentButton).toMatchObject({
    color: "rgb(133, 153, 0)",
    backgroundColor: "rgb(238, 232, 213)",
  });
  expect(styles.readerThemeSwatch.backgroundColor).toBe("rgb(17, 34, 51)");
  expect(styles.warning).toMatchObject({
    color: "rgb(203, 75, 22)",
    backgroundColor: "rgb(238, 232, 213)",
    borderColor: "rgb(203, 75, 22)",
  });
  expect(styles.error.color).toBe("rgb(220, 50, 47)");
  expect(styles.specialDanmu).toMatchObject({
    color: "rgb(220, 50, 47)",
    backgroundColor: "rgb(238, 232, 213)",
    borderColor: "rgb(220, 50, 47)",
  });
  expect(styles.channelSprite.backgroundImage).toContain("yq_index_new.png");
  expect(styles.mainNavigation).toMatchObject({
    backgroundColor: "rgb(238, 232, 213)",
    backgroundImage: "none",
  });

  await page.locator("#chapter-link").hover();
  await expect
    .poll(() => page.locator("#chapter-link").evaluate((link) => getComputedStyle(link).color))
    .toBe("rgb(42, 161, 152)");
});
