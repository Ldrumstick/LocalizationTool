param(
  [switch]$CleanBuilderCache
)

$ErrorActionPreference = "Stop"

# Use mainland mirrors to improve download reliability.
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"

# Disable auto signing discovery for local packaging.
# This avoids downloading/extracting winCodeSign in unsigned local builds.
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"

# Keep cache by default. Clearing cache forces a fresh winCodeSign extraction,
# which can fail on Windows without symlink privileges.
if ($CleanBuilderCache) {
  Remove-Item -Recurse -Force "$env:LOCALAPPDATA\electron-builder\Cache" -ErrorAction SilentlyContinue
}

function Remove-WinUnpackedIfExists {
  param([string]$DirPath)

  if (-not (Test-Path $DirPath)) { return }

  Get-CimInstance Win32_Process |
    Where-Object { $_.ExecutablePath -like "$DirPath*" } |
    ForEach-Object {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }

  for ($i = 0; $i -lt 6; $i++) {
    try {
      Remove-Item -Recurse -Force $DirPath -ErrorAction Stop
      return
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
}

# Cleanup previous packaged output folders that are commonly locked by app runs.
Remove-WinUnpackedIfExists -DirPath (Join-Path $PSScriptRoot "dist\\win-unpacked")
Remove-WinUnpackedIfExists -DirPath (Join-Path $PSScriptRoot "dist-release\\win-unpacked")

npm run build:win
if ($LASTEXITCODE -ne 0) {
  Write-Error "Build failed with exit code $LASTEXITCODE. If you see EPERM on dist/win-unpacked, close the running app/process and retry."
  exit $LASTEXITCODE
}
