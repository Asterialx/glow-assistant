# Publishes the newest Windows installer as the "latest" GitHub release asset, so the website download link always points at it.
# Usage: $env:GITHUB_TOKEN = "<token with repo contents write>"; .\scripts\publish-installer.ps1 -Version 0.1.0
param(
  [string]$Version = "0.1.0",
  [string]$Installer = "src-tauri\target\release\bundle\nsis\Glow Assistant_${Version}_x64-setup.exe"
)

$ErrorActionPreference = "Stop"
$repo = "Asterialx/glow-assistant"
$assetName = "Glow-Assistant-setup.exe"
$token = $env:GITHUB_TOKEN
if (-not $token) { throw "Set GITHUB_TOKEN first." }
if (-not (Test-Path $Installer)) { throw "Installer not found: $Installer" }

$headers = @{ Authorization = "Bearer $token"; Accept = "application/vnd.github+json"; "X-GitHub-Api-Version" = "2022-11-28" }
$tag = "v$Version"

try {
  $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/tags/$tag" -Headers $headers
} catch {
  $body = @{ tag_name = $tag; name = "Glow $Version"; body = "Windows installer for Glow $Version."; draft = $false; prerelease = $false } | ConvertTo-Json
  $release = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/releases" -Headers $headers -Body $body -ContentType "application/json"
}

# Replace the previous installer under the same stable name.
foreach ($asset in $release.assets) {
  if ($asset.name -eq $assetName) {
    Invoke-RestMethod -Method Delete -Uri "https://api.github.com/repos/$repo/releases/assets/$($asset.id)" -Headers $headers | Out-Null
  }
}

$uploadUri = "https://uploads.github.com/repos/$repo/releases/$($release.id)/assets?name=$assetName"
Invoke-RestMethod -Method Post -Uri $uploadUri -Headers $headers -InFile $Installer -ContentType "application/octet-stream" | Out-Null
Write-Output "Published $assetName from $tag: https://github.com/$repo/releases/latest/download/$assetName"
