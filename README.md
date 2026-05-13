# userscripts

Collection of my userscripts.

## Install

Userscripts in this repo can be installed directly from the raw file URL in a userscript manager such as Tampermonkey.

## Scripts

- **Yatsu Converter**
  Adds a floating `简` / `繁` toggle to `https://app.yatsu.moe/` and converts reader text between simplified and traditional Chinese with OpenCC while persisting the selected mode across visits.

- **Plex Open in mpv**
  Adds an `Open in mpv` button to local Plex movie detail pages at `127.0.0.1:32400` / `localhost:32400`, resolving the best original media part and handing it to an installed `mpv://` protocol handler.

  Requires a working `mpv://` protocol handler on the machine. Browsers/userscripts cannot launch `mpv.exe` directly without an external protocol handler or helper.
