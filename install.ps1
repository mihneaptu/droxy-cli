param(
  [string]$Repo = $(if ($env:DROXY_GITHUB_REPO) { $env:DROXY_GITHUB_REPO } else { "mihneaptu/droxy-cli" }),
  [string]$Version = $(if ($env:DROXY_VERSION) { $env:DROXY_VERSION } else { "latest" }),
  [string]$InstallDir = $(
    if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA "Droxy\bin" }
    else { Join-Path $env:USERPROFILE "AppData\Local\Droxy\bin" }
  ),
  [switch]$Uninstall
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Info {
  param([Parameter(Mandatory = $true)][string]$Message)
  Write-Host "  $Message" -ForegroundColor Cyan
}

function Write-WarnText {
  param([Parameter(Mandatory = $true)][string]$Message)
  Write-Host "  $Message" -ForegroundColor Yellow
}

function Write-Success {
  param([Parameter(Mandatory = $true)][string]$Message)
  Write-Host "  $Message" -ForegroundColor Green
}

function Invoke-Download {
  param(
    [Parameter(Mandatory = $true)][string]$Uri,
    [Parameter(Mandatory = $true)][string]$OutFile,
    [switch]$AllowMissing
  )

  try {
    $params = @{ Uri = $Uri; OutFile = $OutFile }
    if ($PSVersionTable.PSVersion.Major -lt 6) { $params.UseBasicParsing = $true }
    Invoke-WebRequest @params | Out-Null
    return $true
  } catch {
    if ($AllowMissing) { return $false }
    throw
  }
}

function Get-PathSegments {
  param([string]$PathValue)
  if (-not $PathValue) {
    return @()
  }
  $segments = $PathValue -split ";" | ForEach-Object { $_.Trim() } | Where-Object { $_ }
  return @($segments)
}

function Normalize-PathSegment {
  param([Parameter(Mandatory = $true)][string]$Segment)
  return $Segment.Trim().TrimEnd("\").ToLowerInvariant()
}

function Add-ToUserPath {
  param([Parameter(Mandatory = $true)][string]$PathToAdd)

  $target = Normalize-PathSegment -Segment $PathToAdd
  $currentUserPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $segments = Get-PathSegments -PathValue $currentUserPath
  $normalized = $segments | ForEach-Object { Normalize-PathSegment -Segment $_ }

  $added = $false
  if (-not ($normalized -contains $target)) {
    $updated = ($segments + $PathToAdd) -join ";"
    [Environment]::SetEnvironmentVariable("Path", $updated, "User")
    $added = $true
  }

  if (-not ($env:Path -like "*$PathToAdd*")) {
    $env:Path = "$PathToAdd;$env:Path"
  }

  return $added
}

function Remove-FromUserPath {
  param([Parameter(Mandatory = $true)][string]$PathToRemove)

  $target = Normalize-PathSegment -Segment $PathToRemove

  $currentUserPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $segments = Get-PathSegments -PathValue $currentUserPath
  $filtered = @($segments | Where-Object { (Normalize-PathSegment -Segment $_) -ne $target })
  $removedFromUserPath = $filtered.Count -ne $segments.Count

  if ($removedFromUserPath) {
    [Environment]::SetEnvironmentVariable("Path", ($filtered -join ";"), "User")
  }

  $processSegments = Get-PathSegments -PathValue $env:Path
  $filteredProcess = @($processSegments | Where-Object { (Normalize-PathSegment -Segment $_) -ne $target })
  if ($filteredProcess.Count -ne $processSegments.Count) {
    $env:Path = $filteredProcess -join ";"
  }

  return $removedFromUserPath
}

function Assert-NodeVersion {
  $nodePath = Get-Command node -ErrorAction SilentlyContinue
  if (-not $nodePath) {
    Write-WarnText "Droxy requires Node.js 18 or later."
    Write-Host "  Install it from https://nodejs.org and try again."
    exit 1
  }

  $nodeVersion = (node -v).Trim()
  $majorText = (($nodeVersion -replace "^v", "") -split "\.")[0]
  $major = 0
  $parsed = [int]::TryParse($majorText, [ref]$major)

  if (-not $parsed -or $major -lt 18) {
    Write-WarnText "Node.js $nodeVersion found, but Droxy requires 18 or later."
    Write-Host "  Update at https://nodejs.org and try again."
    exit 1
  }
}

function Invoke-Uninstall {
  param([Parameter(Mandatory = $true)][string]$TargetInstallDir)

  $removedAnything = $false

  if (Test-Path -LiteralPath $TargetInstallDir) {
    Remove-Item -LiteralPath $TargetInstallDir -Recurse -Force -ErrorAction Stop
    Write-Info "Removed install directory: $TargetInstallDir"
    $removedAnything = $true
  } else {
    Write-Info "Install directory not found at $TargetInstallDir"
  }

  $removedPathEntry = Remove-FromUserPath -PathToRemove $TargetInstallDir
  if ($removedPathEntry) {
    Write-Info "Removed PATH entry: $TargetInstallDir"
    $removedAnything = $true
  } else {
    Write-Info "PATH entry not found for $TargetInstallDir"
  }

  if ($removedAnything) {
    Write-Success "Droxy has been uninstalled."
  } else {
    Write-Info "Nothing to uninstall."
  }
}

if ($Uninstall) {
  Invoke-Uninstall -TargetInstallDir $InstallDir
  exit 0
}

if (-not $Repo) {
  Write-WarnText "Missing repository. Set -Repo or DROXY_GITHUB_REPO and try again."
  exit 1
}

Assert-NodeVersion

$AssetName = "droxy-cli-windows-x64.zip"
$ChecksumName = "$AssetName.sha256"

$BaseUrl = if ($Version -eq "latest") {
  "https://github.com/$Repo/releases/latest/download"
} else {
  if (-not $Version.StartsWith("v")) { $Version = "v$Version" }
  "https://github.com/$Repo/releases/download/$Version"
}

$AssetUrl = "$BaseUrl/$AssetName"
$ChecksumUrl = "$BaseUrl/$ChecksumName"

$TempRoot = if ($env:TEMP) { $env:TEMP } else { [System.IO.Path]::GetTempPath() }
$TempDir = Join-Path $TempRoot ("droxy-install-" + [guid]::NewGuid().ToString("n"))
$ZipPath = Join-Path $TempDir $AssetName
$ChecksumPath = Join-Path $TempDir $ChecksumName
$ExtractDir = Join-Path $TempDir "extract"
$PackageDir = Join-Path $ExtractDir "droxy-cli-windows-x64"

New-Item -ItemType Directory -Path $TempDir -Force | Out-Null
$ProgressPreference = "SilentlyContinue"

try {
  Write-Info "Downloading $AssetName..."
  Invoke-Download -Uri $AssetUrl -OutFile $ZipPath | Out-Null

  $hasChecksum = Invoke-Download -Uri $ChecksumUrl -OutFile $ChecksumPath -AllowMissing
  if ($hasChecksum -and (Test-Path -LiteralPath $ChecksumPath)) {
    Write-Info "Verifying checksum..."
    $expected = (Get-Content -Path $ChecksumPath -TotalCount 1).Split(" ")[0].Trim().ToLowerInvariant()
    $actual = (Get-FileHash -Algorithm SHA256 -Path $ZipPath).Hash.ToLowerInvariant()
    if ($expected -and ($expected -ne $actual)) {
      throw "Checksum mismatch for $AssetName."
    }
  } else {
    Write-Info "No checksum file found for this release; continuing."
  }

  Expand-Archive -Path $ZipPath -DestinationPath $ExtractDir -Force

  if (-not (Test-Path -LiteralPath $PackageDir)) {
    $dirs = @(Get-ChildItem -Path $ExtractDir -Directory -ErrorAction SilentlyContinue)
    if ($dirs.Count -eq 1) {
      $PackageDir = $dirs[0].FullName
    } else {
      throw "Unexpected archive layout for $AssetName."
    }
  }

  if (Test-Path -LiteralPath $InstallDir) {
    Remove-Item -LiteralPath $InstallDir -Recurse -Force -ErrorAction Stop
  }
  New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
  Copy-Item -Path (Join-Path $PackageDir "*") -Destination $InstallDir -Recurse -Force

  $addedToPath = Add-ToUserPath -PathToAdd $InstallDir

  Write-Success "Installed Droxy to $InstallDir"
  if ($addedToPath) {
    Write-Info "Added $InstallDir to your user PATH."
  } else {
    Write-Info "$InstallDir is already in your user PATH."
  }
  Write-Success "Next step: open a new terminal and run `droxy --help`."
} finally {
  if (Test-Path -LiteralPath $TempDir) {
    Remove-Item -Path $TempDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}
