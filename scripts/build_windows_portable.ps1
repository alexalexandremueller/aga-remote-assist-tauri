$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "Installing dependencies..."
npm install

Write-Host "Building portable Windows executable..."
npm run build:portable:win

$releaseDir = Join-Path $root "release"
New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null

$candidate = Get-ChildItem -Path (Join-Path $root "src-tauri\target\x86_64-pc-windows-msvc\release") -Filter "*.exe" |
  Where-Object { $_.Name -notmatch "setup|installer" } |
  Select-Object -First 1

if (-not $candidate) {
  throw "Portable executable not found after build."
}

$target = Join-Path $releaseDir "AGA-Remote-Assist.exe"
Copy-Item $candidate.FullName $target -Force

Write-Host "Portable executable copied to $target"
