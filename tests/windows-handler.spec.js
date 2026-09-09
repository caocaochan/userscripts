const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { test, expect } = require('playwright/test');

test('Windows protocol handler separates untrusted media from mpv options and preserves quoted paths', () => {
  test.skip(process.platform !== 'win32', 'Requires Windows PowerShell.');
  // Extract only functions: do not run cleanup, write files, or launch mpv.
  const command = String.raw`
    $ErrorActionPreference = 'Stop'
    $tokens = $null
    $errors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile($env:HANDLER_TEST_PATH, [ref]$tokens, [ref]$errors)
    if ($errors.Count) { throw $errors[0] }
    $ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $false) |
      ForEach-Object { Invoke-Expression $_.Extent.Text }
    function Start-Process {
      param($FilePath, $ArgumentList)
      $script:captured = @{ FilePath = $FilePath; Arguments = @($ArgumentList) }
    }
    $mpvPath = 'mock-mpv.exe'
    $mediaPath = 'C:\Media\Two  Spaces\Movie.mkv'
    $params = Get-ProtocolQueryParams ('plex-mpv:///?path=' + [Uri]::EscapeDataString($mediaPath))
    Start-Mpv @($params['path'])
    $normal = $script:captured
    Start-Mpv @('--script=untrusted.lua')
    @{ normal = $normal; optionLike = $script:captured; decoded = $params['path'] } | ConvertTo-Json -Depth 4 -Compress
  `;
  const result = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, HANDLER_TEST_PATH: path.resolve(__dirname, '../handlers/windows/openInMPV.ps1') },
  }));
  expect(result.decoded).toBe('C:\\Media\\Two  Spaces\\Movie.mkv');
  expect(result.normal.Arguments).toEqual(['--', '"C:\\Media\\Two  Spaces\\Movie.mkv"']);
  expect(result.optionLike.Arguments).toEqual(['--', '"--script=untrusted.lua"']);
});
