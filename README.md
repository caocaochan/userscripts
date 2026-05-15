# userscripts

Collection of my userscripts.

## Install

Userscripts in this repo can be installed directly from the raw file URL in a userscript manager such as Tampermonkey.

## Scripts

- **Yatsu Converter**
  Adds a floating `简` / `繁` toggle to `https://app.yatsu.moe/` and converts reader text between simplified and traditional Chinese with OpenCC while persisting the selected mode across visits.

- **Plex Open in mpv**
  Adds an `Open in mpv` button to local Plex detail pages and small `mpv` buttons on Home/library media cards at `127.0.0.1:32400` / `localhost:32400`, resolving the best original media parts and handing them to an installed `plex-mpv://` protocol handler.

  Requires a working `plex-mpv://` protocol handler on the machine. Season pages open an ordered M3U playlist in mpv, and show pages open the first season. A generic Windows handler is included in [`handlers/windows`](handlers/windows), with install notes in [`handlers/windows/README.md`](handlers/windows/README.md) and a registry template at [`handlers/windows/install-plex-mpv-handler.reg`](handlers/windows/install-plex-mpv-handler.reg). Browsers/userscripts cannot launch `mpv.exe` directly without an external protocol handler or helper.

- **iQIYI Subtitle Downloader**
  Adds a floating subtitles panel to `https://www.iq.com/play/*` and `https://www.iqiyi.com/v_*.html` episode pages and downloads available subtitle tracks as `.srt` files. It uses IQ.com’s embedded Next.js subtitle metadata and iQIYI.com’s runtime player subtitle metadata.

- **GagaOOLala Subtitle Downloader**
  Adds a floating subtitles panel to `https://www.gagaoolala.com/*/videos/*` video pages and downloads available WebVTT subtitle tracks as `.srt` files. GagaOOLala exposes playback subtitle manifests only to logged-in sessions, so sign in first before refreshing the panel or starting playback.
