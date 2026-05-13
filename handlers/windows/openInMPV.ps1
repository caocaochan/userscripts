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
$path = $null
$url = $null
$playlist = $null

Get-ChildItem -Path $env:TEMP -Filter "plex-mpv-*.m3u8" -ErrorAction SilentlyContinue |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-1) } |
  Remove-Item -Force -ErrorAction SilentlyContinue

function Decode-ProtocolValue {
  param([string] $Value)

  if ($null -eq $Value) {
    return $null
  }

  [Uri]::UnescapeDataString(($Value -replace '\+', ' '))
}

function Quote-ProcessArgument {
  param([string] $Argument)

  if ($null -eq $Argument) {
    return '""'
  }

  $escaped = $Argument -replace '(\\*)"', '$1$1\"'
  $escaped = $escaped -replace '(\\+)$', '$1$1'
  '"' + $escaped + '"'
}

function Start-Mpv {
  param([string[]] $Arguments)

  $quotedArguments = $Arguments | ForEach-Object { Quote-ProcessArgument $_ }
  Start-Process -FilePath $mpvPath -ArgumentList $quotedArguments
}

function Get-ProtocolQueryParams {
  param([string] $Value)

  $params = @{}
  if (-not $Value -or $Value -notmatch '^(?:plex-mpv|mpv):///\?(.+)$') {
    return $params
  }

  foreach ($pair in ($Matches[1] -split '&')) {
    if (-not $pair) {
      continue
    }

    $parts = $pair -split '=', 2
    $name = Decode-ProtocolValue $parts[0]
    if (-not $name) {
      continue
    }

    $params[$name] = if ($parts.Count -gt 1) {
      Decode-ProtocolValue $parts[1]
    } else {
      ""
    }
  }

  $params
}

$queryParams = Get-ProtocolQueryParams $RawUrl
$path = $queryParams["path"]
$url = $queryParams["url"]
$playlist = $queryParams["playlist"]

if (-not $path -and -not $url -and -not $playlist -and $RawUrl -match '^(?:plex-mpv|mpv)://(.+)$') {
  $url = [Uri]::UnescapeDataString($Matches[1])
}

$rawLogValue = if ($path) {
  "<path>"
} elseif ($playlist) {
  "<playlist>"
} elseif ($url) {
  "<url>"
} else {
  $RawUrl
}

$logValue = if ($path) {
  "path=$path"
} elseif ($playlist) {
  $entryCount = ([regex]::Matches($playlist, "(?m)^#EXTINF:")).Count
  "playlist=$entryCount entries"
} elseif ($url) {
  $url -replace '([?&]X-Plex-Token=)[^&]+', '$1<redacted>'
} else {
  "<none>"
}

Add-Content -Path $logPath -Value ("{0} raw={1} decoded={2}" -f (Get-Date).ToString("s"), $rawLogValue, $logValue)

if ($path) {
  Start-Mpv @($path)
  exit 0
}

if ($playlist) {
  $playlistPath = Join-Path $env:TEMP ("plex-mpv-" + [guid]::NewGuid().ToString() + ".m3u8")
  [System.IO.File]::WriteAllText($playlistPath, $playlist, [System.Text.UTF8Encoding]::new($false))
  Start-Mpv @($playlistPath)
  exit 0
}

if (-not $url) {
  exit 1
}

Start-Mpv @($url)
