#!/usr/bin/env pwsh
#Requires -Version 7.0
<#
.SYNOPSIS
    Organizes evidence files into a structured directory based on a requirements map.

.DESCRIPTION
    Reads a JSON map file and copies/moves evidence files into a folder hierarchy
    based on their associated requirements.

.PARAMETER MapFile
    Path to the JSON map file.

.PARAMETER SourceDir
    Directory containing the source evidence files.

.PARAMETER DestRoot
    Root destination directory for organized evidence.

.EXAMPLE
    .\Organize-Evidence.ps1 -MapFile .\cmmc-map.json -SourceDir .\evidence -DestRoot .\organized-evidence
#>

[CmdletBinding()]
param (
    [Parameter(Position = 0)]
    [string]$MapFile,

    [Parameter(Position = 1)]
    [string]$SourceDir,

    [Parameter(Position = 2)]
    [string]$DestRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# --- Validate arguments -------------------------------------------------------

if (-not $MapFile -or -not $SourceDir -or -not $DestRoot) {
    Write-Host @"
Usage:
    .\Organize-Evidence.ps1 <MapFile> <SourceDir> <DestDir>

Example:
    .\Organize-Evidence.ps1 ``
        .\cmmc-map.json ``
        .\evidence ``
        .\organized-evidence
"@
    exit 1
}

# --- Load and parse the map file ----------------------------------------------

$map = Get-Content -Raw -Path $MapFile | ConvertFrom-Json

# --- Sort requirement keys using natural/version sort -------------------------
# Sort-Object with a computed key that zero-pads each numeric segment,
# mirroring bash's `sort -V` behaviour for dotted version strings.

$requirements = $map.byRequirements.PSObject.Properties.Name | Sort-Object {
    ($_ -split '\.') | ForEach-Object { $_.PadLeft(10, '0') }
}

# --- Track how many times each artifact has been processed -------------------

$processedCounts = @{}

# --- Main loop ----------------------------------------------------------------

foreach ($requirement in $requirements) {
    Write-Host ""
    Write-Host "Processing $requirement"

    # Convert "03.01.01" -> "03/01/01" for the destination path
    $requirementPath = $requirement -replace '\.', [System.IO.Path]::DirectorySeparatorChar

    # Get the list of artifact IDs for this requirement
    $artifactIds = $map.byRequirements.$requirement

    foreach ($artifactId in $artifactIds) {

        # Pull artifact info
        $artifact = $map.artifacts.$artifactId

        if ($null -eq $artifact) {
            Write-Host "  Missing artifact: $artifactId"
            continue
        }

        $name              = $artifact.filename
        $type              = $artifact.type
        $totalRequirements = ($artifact.requirements | Measure-Object).Count

        # Skip URLs
        if ($type -eq 'url') {
            Write-Host "  [URL] Skipping $name"
            continue
        }

        $destDir   = Join-Path $DestRoot $requirementPath
        $destFile  = Join-Path $destDir  $name
        $sourceFile = Join-Path $SourceDir $name

        # Ensure destination directory exists
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null

        if (-not (Test-Path -LiteralPath $sourceFile -PathType Leaf)) {
            Write-Host "  Source missing: $sourceFile"
            continue
        }

        # Track processing count for this artifact
        $currentCount = ($processedCounts[$artifactId] ?? 0) + 1
        $processedCounts[$artifactId] = $currentCount

        if ($totalRequirements -eq 1) {
            # Single requirement -> move
            Write-Host "  MOVE $name"
            Write-Host "    -> $destFile"
            Move-Item -LiteralPath $sourceFile -Destination $destFile
        }
        elseif ($currentCount -eq $totalRequirements) {
            # Last requirement for a multi-requirement artifact -> final move
            Write-Host "  FINAL MOVE $name"
            Write-Host "    -> $destFile"
            Move-Item -LiteralPath $sourceFile -Destination $destFile
        }
        else {
            # Not the last requirement -> copy
            Write-Host "  COPY $name"
            Write-Host "    -> $destFile"
            Copy-Item -LiteralPath $sourceFile -Destination $destFile
        }
    }
}

Write-Host ""
Write-Host "Done."
