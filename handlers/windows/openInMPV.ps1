param(
  [Parameter(Position = 0)]
  [string] $RawUrl
)

$ErrorActionPreference = "Stop"

$mpvPath = $env:MPV_PATH
if (-not $mpvPath) {
  $mpvCommand = Get-Command "mpv.exe" -ErrorAction SilentlyContinue
  if ($mpvCommand) {
    $mpvPath = $mpvCommand.Source
  }
}

if (-not $mpvPath) {
  $mpvPath = "mpv.exe"
}

$logPath = Join-Path $env:TEMP "openInMPV.log"
$url = $null
$playlist = $null

Get-ChildItem -Path $env:TEMP -Filter "plex-mpv-*.m3u8" -ErrorAction SilentlyContinue |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-1) } |
  Remove-Item -Force -ErrorAction SilentlyContinue

if ($RawUrl -match '^(?:plex-mpv|mpv):///\?url=(.+)$') {
  $url = [Uri]::UnescapeDataString($Matches[1])
} elseif ($RawUrl -match '^(?:plex-mpv|mpv):///\?playlist=(.+)$') {
  $playlist = [Uri]::UnescapeDataString($Matches[1])
} elseif ($RawUrl -match '^(?:plex-mpv|mpv)://(.+)$') {
  $url = [Uri]::UnescapeDataString($Matches[1])
}

$rawLogValue = if ($playlist) {
  "<playlist>"
} elseif ($url) {
  "<url>"
} else {
  $RawUrl
}

$logValue = if ($playlist) {
  $entryCount = ([regex]::Matches($playlist, "(?m)^#EXTINF:")).Count
  "playlist=$entryCount entries"
} elseif ($url) {
  $url -replace '([?&]X-Plex-Token=)[^&]+', '$1<redacted>'
} else {
  "<none>"
}

Add-Content -Path $logPath -Value ("{0} raw={1} decoded={2}" -f (Get-Date).ToString("s"), $rawLogValue, $logValue)

if ($playlist) {
  $playlistPath = Join-Path $env:TEMP ("plex-mpv-" + [guid]::NewGuid().ToString() + ".m3u8")
  [System.IO.File]::WriteAllText($playlistPath, $playlist, [System.Text.UTF8Encoding]::new($false))
  Start-Process -FilePath $mpvPath -ArgumentList @($playlistPath)
  exit 0
}

if (-not $url) {
  exit 1
}

Start-Process -FilePath $mpvPath -ArgumentList @($url)
