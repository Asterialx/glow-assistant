# Builds the Windows installer and publishes it to the website download link in one step.
# Needs GITHUB_TOKEN in the environment (see scripts/publish-installer.ps1).
# Usage: .\scripts\build-and-publish.ps1 -Version 0.1.0
param([string]$Version = "0.1.0")

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

npm run tauri:build
if ($LASTEXITCODE -ne 0) { throw "Build failed; nothing was published." }

.\scripts\publish-installer.ps1 -Version $Version
