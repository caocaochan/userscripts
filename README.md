# userscripts

Collection of my userscripts.

## Install

Userscripts in this repo can be installed directly from the raw file URL. They target Tampermonkey 5.3 or newer, except GagaOOLala which requires 5.4+ for direct Blob downloads; compatibility with other userscript managers is not maintained.

Use a current desktop Chromium or Firefox release. Every script declares its required sandbox and runs only in the top frame. Scripts that need page JavaScript or page-context font access use `raw`; DOM-only scripts use `DOM`.

## Development

Use Node.js 24 for the development tools. Userscripts remain standalone files with no build step.

```powershell
npm ci
npx playwright install chromium
npm run lint
npm test
```

ESLint's flat configuration checks all 14 userscripts for correctness and modern conventions. Playwright exercises browser behavior with deterministic site fixtures and mocked Tampermonkey APIs. The Windows handler test intercepts process launches and skips on other platforms. These checks do not replace testing with Tampermonkey on authenticated live sites. See [the audit findings](AUDIT.md) for fixes and remaining limits.

The Du Chinese and iQIYI Yomitan tests use a pinned upstream Yomitan text scanner under `tests/fixtures/yomitan` (GPL-3.0-or-later, used only in tests). To run the optional anonymous live-lesson smoke test in PowerShell, use `$env:DUCHINESE_LIVE = '1'` followed by `npx playwright test tests/duchinese-yomitan-live.spec.js`; remove the override afterward with `Remove-Item Env:DUCHINESE_LIVE`. For the iQIYI episode test, use `$env:IQIYI_LIVE = '1'` followed by `npx playwright test tests/iqiyi-yomitan-live.spec.js`, then `Remove-Item Env:IQIYI_LIVE`. The iQIYI test waits through preroll ads and checks normal/fullscreen captions and hover playback behavior. These tests do not install Tampermonkey or Yomitan, or verify an extension popup; they inject the userscript with a mocked style API and exercise the upstream scanner.

## Scripts

- **English Titles for AniList**
  Adds a smaller second title line beneath anime titles on every AniList user anime-list page, across table, compact, and card layouts. It prefers AniList's official English title, falls back to romaji when English is unavailable, and suppresses equivalent duplicates. The script loads across AniList so navigation from a profile or home page into an anime list also works; it requests titles only on anime-list routes. It makes an anonymous, read-only API request per visited username, caches successful results for the current page lifetime, and stores nothing persistently. Requests cancelled by navigation may be retried when returning to that user; other failures are not automatically retried. Reused links update when their anime ID or primary title changes.

- **Du Chinese & Yomu Yomu Audio Downloader**
  Runs on `https://duchinese.net/lessons/*` and `https://yomuyomu.app/lessons/*` pages and adds a download icon beside the fixed play control. Both sites share the same lesson player, so one script covers them. Downloads use the audio URL already supplied to the lesson player. Standalone lessons are named from the lesson title; course audio adds a sortable chapter suffix such as `Chapter 01`.

- **Du Chinese — Yomitan Compatibility**
  Makes the existing Du Chinese canvas reader scannable by Yomitan by mirroring its Chinese character draws into an invisible, selectable text layer. Preserves the reader's layout, pinyin, playback highlights, and native word interactions. Follows simplified/traditional selection, font changes, resizing, and lesson navigation. Runs across Du Chinese so entering a lesson without a full page load also works; only lesson text canvases are captured. Compatible with the audio downloader above.

  Install `scripts/duchinese-yomitan.user.js`, then reload Du Chinese so the script can capture the initial drawing. Use your configured Yomitan scanning gesture with a Chinese dictionary enabled and site access granted. Requires Tampermonkey 5.3+ in a current desktop Chromium or Firefox browser; the script uses the raw page sandbox to observe canvas drawing. It sends no requests and loads no dependencies. It depends on Du Chinese's current canvas renderer and does not cover Yomu Yomu.

- **Plex Open in mpv**
  Adds an `Open in mpv` button to local Plex detail pages and small `mpv` buttons on Home/library media cards at `127.0.0.1:32400` / `localhost:32400`, resolving the best original media parts and handing them to an installed `plex-mpv://` protocol handler.

  Requires a working `plex-mpv://` protocol handler on the machine. Season pages open an ordered M3U playlist in mpv, and show pages open the first season. Multipart movies and episodes preserve all parts of the selected media version in their original order. A generic Windows handler is included in [`handlers/windows`](handlers/windows), with install notes in [`handlers/windows/README.md`](handlers/windows/README.md) and a registry template at [`handlers/windows/install-plex-mpv-handler.reg`](handlers/windows/install-plex-mpv-handler.reg). Browsers/userscripts cannot launch `mpv.exe` directly without an external protocol handler or helper.

- **Reddit Default Sorting**
  Redirects `reddit.com`, `www.reddit.com`, and `sh.reddit.com` homepages to Top posts from Today, and bare `/r/subreddit` pages to New. Matching links are rewritten on pointer or keyboard activation so Reddit navigates directly to the preferred feed without first loading the default route. The OP body and comment bodies on comments pages are set to `1rem` without changing titles, author metadata, controls, or feed-card previews.

- **iQIYI Subtitle Downloader**
  Adds a floating subtitles panel to `https://www.iq.com/play/*` and `https://www.iqiyi.com/v_*.html` episode pages and downloads available subtitle tracks as `.srt` files. It uses IQ.com’s embedded Next.js subtitle metadata and iQIYI.com’s runtime player subtitle metadata.

- **iQIYI — Yomitan Compatibility**
  Makes iQIYI.com's native HTML subtitle text selectable and scannable by Yomitan. A small stylesheet enables pointer hit testing and text selection only on caption text, preserving native appearance, timing, normal/fullscreen layout, and playback controls. It follows changing captions and episode navigation without observers, requests, or replacement overlays; playback does not pause on hover.

  Install [`scripts/iqiyi-yomitan.user.js`](scripts/iqiyi-yomitan.user.js) in Tampermonkey 5.3+ and reload iQIYI. Grant Yomitan site access to `iqiyi.com` / `www.iqiyi.com`, enable a Chinese dictionary, and use your configured scanning gesture over a subtitle. Works independently of the subtitle downloader above. This version targets the Chinese website's current HTML caption renderer; it does not cover IQ.com, captions embedded in video pixels, or native video Picture-in-Picture windows.

- **JJWXC Reader — LXGW WenKai + Solarized Light**
  Formats chapter prose at a fixed 20px with the locally installed `LXGW WenKai Screen` font on desktop `https://www.jjwxc.net/onebook.php*` pages and themes the surrounding reader, navigation, sidebars, controls, author notes, comments, and footer with Solarized Light. If the font is unavailable, the script falls back to JJWXC’s existing Chinese font stack. Logos, advertisements, cover art, QR codes, and indispensable image-based channel labels keep their original colors.

- **Missevan Subtitle Styler**
  Adds a floating `Subs` settings panel to `https://www.missevan.com/sound/player*` pages and improves audio-drama subtitles with customizable font family, size, line height, vertical position, speaker colors, text color, background opacity, and shadow strength.

- **Missevan — Yomitan Compatibility**
  Makes Missevan drama subtitle lines selectable and scannable by Yomitan. Dramas post their subtitles as fixed top/bottom danmaku lines; a small stylesheet enables pointer hit testing and text selection only on those visible lines (and on the native subtitle layer when a sound uses it), preserving their appearance and the player's click behavior. Scrolling danmaku stay click-through. Follows changing lines and sound switches without observers or requests.

  Install [`scripts/missevan-yomitan.user.js`](scripts/missevan-yomitan.user.js) in Tampermonkey 5.3+ and reload Missevan. Grant Yomitan site access to `www.missevan.com`, enable a Chinese dictionary, and use your configured scanning gesture over a subtitle. Compatible with the subtitle styler above.

- **Nyaa Group Hider + Highlighter**
  Hides or highlights torrent rows on `https://nyaa.si/` when the release title starts with a configured group tag such as `[SubsPlease]`. Hidden and highlighted groups can be edited from the page controls or Tampermonkey's userscript menu without changing the script.

- **GagaOOLala Subtitle Downloader**
  Adds a floating subtitles panel to `https://www.gagaoolala.com/*/videos/*` video pages and downloads available WebVTT subtitle tracks as `.srt` files. GagaOOLala exposes playback subtitle manifests only to logged-in sessions, so sign in first before refreshing the panel or starting playback.

  Requires Tampermonkey 5.4+. Completed subtitles are saved directly through `GM.download` as Blobs, with the button disabled until the operation settles. Explicit download permission/support errors fall back to an anchor download of the same Blob; cancellation stops without retrying, and other save failures report an error. The anchor fallback reports only that the download started because it cannot confirm completion.

  The script reads both HLS and DASH manifests. It prefers standalone DASH WebVTT tracks from a single static period starting at zero, preserving their presentation timestamps even when the files also contain HLS clock metadata. Matching languages keep their existing labels; ambiguous alternate renditions are retained. Segmented downloads require every segment to succeed. HLS tracks without a supported DASH alternative still report unsupported timestamp mappings; MP4-wrapped subtitle segments are not decoded. The refresh menu fetches fresh playback URLs when cached links have expired.

- **YouTube Exact Dates**
  Replaces English relative video dates on desktop `https://www.youtube.com/*` watch pages and video cards with exact browser-local `YYYY-MM-DD HH:mm` timestamps. Watch pages use metadata already in the document, and playlist pages batch their newest entries through YouTube's lightweight Atom feed. Other uncached cards fetch watch-page metadata only when they approach the viewport, with a single-request fallback queue, per-video deduplication, and a bounded persistent cache. Comments, community posts, and live chat are left unchanged.

- **Yatsu Reader — Traditional to Simplified Chinese**
  Converts Traditional Chinese text throughout `https://app.yatsu.moe/*`, including dynamically added content, inline-formatted ebook text, discovered open shadow roots, and the page title, to Simplified orthography with OpenCC. Conversion preserves phrase context and common already-Simplified or mixed-script content, handles `著` / `着` at Chinese word boundaries using protected Traditional and Simplified lexical forms, and conservatively leaves genuinely ambiguous standalone `著` and `么` unchanged, without localizing regional vocabulary. Form values and text-bearing attributes are left unchanged. The conversion can be toggled from Tampermonkey's userscript menu.

  The userscript follows OpenCC-JS's npm `latest` tag through jsDelivr. This floating dependency has no integrity pin and can change without a userscript release; jsDelivr and Tampermonkey caching can delay adoption of a newly published version. Set Tampermonkey's external-resource update interval to `Always` for the most aggressive refresh behavior. The lockfile records a reproducible development fixture; refresh it with `npm update opencc-js`.
