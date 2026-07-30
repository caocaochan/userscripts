# userscripts

Collection of my userscripts.

## Install

Userscripts in this repo can be installed directly from the raw file URL. They target current Tampermonkey 5.3 or newer; compatibility with other userscript managers is not maintained.

## Scripts

- **English Titles for AniList**
  Adds a smaller second title line beneath anime titles on every AniList user anime-list page, across table, compact, and card layouts. It prefers AniList's official English title, falls back to romaji when English is unavailable, and suppresses equivalent duplicates. The script uses one anonymous, read-only AniList API request per visited username, caches results only for the current page lifetime, and stores nothing persistently. It uses modern Promise-based Tampermonkey APIs and is compatible with the repository's Tampermonkey 5.3+ target while being authored against current Tampermonkey 5.6.x.

- **Du Chinese & Yomu Yomu Audio Downloader**
  Runs on `https://duchinese.net/lessons/*` and `https://yomuyomu.app/lessons/*` pages and adds a download icon beside the fixed play control. Both sites share the same lesson player, so one script covers them. Downloads use the audio URL already supplied to the lesson player. Standalone lessons are named from the lesson title; course audio adds a sortable chapter suffix such as `Chapter 01`.

- **Plex Open in mpv**
  Adds an `Open in mpv` button to local Plex detail pages and small `mpv` buttons on Home/library media cards at `127.0.0.1:32400` / `localhost:32400`, resolving the best original media parts and handing them to an installed `plex-mpv://` protocol handler.

  Requires a working `plex-mpv://` protocol handler on the machine. Season pages open an ordered M3U playlist in mpv, and show pages open the first season. A generic Windows handler is included in [`handlers/windows`](handlers/windows), with install notes in [`handlers/windows/README.md`](handlers/windows/README.md) and a registry template at [`handlers/windows/install-plex-mpv-handler.reg`](handlers/windows/install-plex-mpv-handler.reg). Browsers/userscripts cannot launch `mpv.exe` directly without an external protocol handler or helper.

- **iQIYI Subtitle Downloader**
  Adds a floating subtitles panel to `https://www.iq.com/play/*` and `https://www.iqiyi.com/v_*.html` episode pages and downloads available subtitle tracks as `.srt` files. It uses IQ.com’s embedded Next.js subtitle metadata and iQIYI.com’s runtime player subtitle metadata.

- **JJWXC Reader — LXGW WenKai + Solarized Light**
  Applies the locally installed `LXGW WenKai Screen` font to chapter prose on desktop `https://www.jjwxc.net/onebook.php*` pages and themes the surrounding reader, navigation, sidebars, controls, author notes, comments, and footer with Solarized Light. If the font is unavailable, the script falls back to JJWXC’s existing Chinese font stack. Logos, advertisements, cover art, QR codes, and indispensable image-based channel labels keep their original colors.

- **Missevan Subtitle Styler**
  Adds a floating `Subs` settings panel to `https://www.missevan.com/sound/player*` pages and improves audio-drama subtitles with customizable font family, size, line height, vertical position, speaker colors, text color, background opacity, and shadow strength.

- **Nyaa Group Hider + Highlighter**
  Hides or highlights torrent rows on `https://nyaa.si/` when the release title starts with a configured group tag such as `[SubsPlease]`. Hidden and highlighted groups can be edited from the page controls or Tampermonkey's userscript menu without changing the script.

- **GagaOOLala Subtitle Downloader**
  Adds a floating subtitles panel to `https://www.gagaoolala.com/*/videos/*` video pages and downloads available WebVTT subtitle tracks as `.srt` files. GagaOOLala exposes playback subtitle manifests only to logged-in sessions, so sign in first before refreshing the panel or starting playback.

- **Yatsu Reader — Traditional to Simplified Chinese**
  Converts Traditional Chinese text throughout `https://app.yatsu.moe/*`, including dynamically added content, inline-formatted ebook text, discovered open shadow roots, and the page title, to Simplified orthography with OpenCC. Conversion preserves phrase context and common already-Simplified or mixed-script content, handles `著` / `着` at Chinese word boundaries using protected Traditional and Simplified lexical forms, and conservatively leaves genuinely ambiguous standalone `著` and `么` unchanged, without localizing regional vocabulary. Form values and text-bearing attributes are left unchanged. The conversion can be toggled from Tampermonkey's userscript menu.

  The userscript follows OpenCC-JS's npm `latest` tag through jsDelivr. This floating dependency has no integrity pin and can change without a userscript release; jsDelivr and Tampermonkey caching can delay adoption of a newly published version. Set Tampermonkey's external-resource update interval to `Always` for the most aggressive refresh behavior. The lockfile records a reproducible development fixture; refresh it with `npm update opencc-js`.
