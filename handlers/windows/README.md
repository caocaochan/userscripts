# Plex mpv Protocol Handler for Windows

This handler registers `plex-mpv://` URLs and passes decoded Plex local file paths, Plex media URLs, or generated M3U playlists to mpv.

## Files

- `openInMPV.vbs` launches the handler without showing a terminal window.
- `openInMPV.ps1` decodes `plex-mpv://` paths/URLs, writes temporary season playlists, and starts mpv.
- `install-plex-mpv-handler.reg` is a registry template for registering the protocol.

## Install

1. Make sure `mpv.exe` is available on `PATH`, or set an `MPV_PATH` environment variable pointing to `mpv.exe`.
2. Edit `install-plex-mpv-handler.reg` and replace:
   ```text
   C:\\Path\\To\\userscripts
   ```
   with the absolute path to this repository.
3. Double-click the edited `.reg` file and accept the registry prompt.

The registered command should point to `openInMPV.vbs`, not directly to `openInMPV.ps1`, so PowerShell stays hidden.

## Test

Run:

```powershell
Start-Process 'plex-mpv:///?path=C%3A%5CMedia%5CTest%20Movie.mkv'
```

Current userscript versions prefer Plex's local `Part.file` path and send it as `path=`. The handler still accepts older `url=` launches for compatibility.

The handler writes a sanitized log to:

```text
%TEMP%\openInMPV.log
```
