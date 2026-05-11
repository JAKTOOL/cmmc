param(
    [Parameter(Position = 0)]
    [string]$MapFile,

    [Parameter(Position = 1)]
    [string]$OutFile = "cmmc-evidence-report.md"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

<#
Usage:

  ./generate-evidence-report.ps1 <map-file> [output-file]

Example:

  ./generate-evidence-report.ps1 ./cmmc-map.json ./cmmc-evidence-report.md

Outputs a Markdown report organized by requirement ID.
Each requirement becomes a ## heading with a table of its artifacts.
File artifacts link to <req-path>/<name> e.g. 03/01/01/file.png.
URL artifacts link to their external URL. Hash column is omitted for URLs.
#>



function Show-Usage {
    @"
Usage:
    $PSCommandPath <map-file> [output-file]

Example:
    $PSCommandPath ./cmmc-map.json ./cmmc-evidence-report.md
"@
}

if ([string]::IsNullOrWhiteSpace($MapFile)) {
    Show-Usage
    exit 1
}

if (-not (Test-Path -LiteralPath $MapFile)) {
    Write-Error "Map file not found: $MapFile"
    exit 1
}

function Get-VersionKey {
    param([string]$Value)

    return (($Value -split '\.') | ForEach-Object {
        $_.PadLeft(10, '0')
    }) -join '.'
}

function Get-ArtifactSortKey {
    param(
        [string]$ArtifactId,
        [hashtable]$Artifacts
    )

    $artifact = $Artifacts[$ArtifactId]

    if ($null -eq $artifact) {
        return "2|"
    }

    $typeRank = if ($artifact.type -eq "url") { 0 } else { 1 }

    $name = if ($artifact.PSObject.Properties.Name -contains "name") {
        [string]$artifact.name
    } else {
        ""
    }

    return "$typeRank|$($name.ToLowerInvariant())"
}

try {
    $data = Get-Content -LiteralPath $MapFile -Raw | ConvertFrom-Json

    $artifacts = @{}
    foreach ($property in $data.artifacts.PSObject.Properties) {
        $artifacts[$property.Name] = $property.Value
    }

    $byRequirements = @{}
    foreach ($property in $data.byRequirements.PSObject.Properties) {
        $byRequirements[$property.Name] = $property.Value
    }

    $sortedReqs = $byRequirements.Keys | Sort-Object { Get-VersionKey $_ }

    $lines = [System.Collections.Generic.List[string]]::new()

    $lines.Add("# CMMC 800-171 Rev 2 Evidence Report")
    $lines.Add("")

    foreach ($req in $sortedReqs) {
        $lines.Add("## $req")
        $lines.Add("")
        $lines.Add("| Artifact | Type | Hash |")
        $lines.Add("|---|---|---|")

        $artifactIds = @($byRequirements[$req]) | Sort-Object {
            Get-ArtifactSortKey -ArtifactId $_ -Artifacts $artifacts
        }

        foreach ($artId in $artifactIds) {
            $art = $artifacts[$artId]

            if ($null -eq $art) {
                $lines.Add("| *(missing: $artId)* | — | — |")
                continue
            }

            $name = [string]$art.name
            $filename = [string]$art.filename

            $atype = if ($art.PSObject.Properties.Name -contains "type") {
                [string]$art.type
            } else {
                ""
            }

            $hashType = if ($art.PSObject.Properties.Name -contains "hashType") {
                [string]$art.hashType
            } else {
                ""
            }

            if ($atype -eq "url") {
                $url = if (
                    $art.PSObject.Properties.Name -contains "url" -and
                    -not [string]::IsNullOrWhiteSpace($art.url)
                ) {
                    [string]$art.url
                } else {
                    "#"
                }

                $link = "[$name]($url)"
                $hashVal = "—"
            } else {
                $reqPath = $req -replace '\.', '/'
                $link = "[$name](./$reqPath/$filename)"

                $hashVal = if (-not [string]::IsNullOrWhiteSpace($hashType)) {
                    "``${hashType}: $artId``"
                } else {
                    "``$artId``"
                }
            }

            $lines.Add("| $link | ``$atype`` | $hashVal |")
        }

        $lines.Add("")
    }

    $outDir = Split-Path -Parent $OutFile
    if (-not [string]::IsNullOrWhiteSpace($outDir) -and -not (Test-Path -LiteralPath $outDir)) {
        New-Item -ItemType Directory -Path $outDir -Force | Out-Null
    }

    $reportText = $lines -join "`n"
    Set-Content -LiteralPath $OutFile -Value $reportText -Encoding UTF8

    Write-Host "Report written to: $OutFile"
    Write-Host "  $($sortedReqs.Count) requirements, $($artifacts.Count) artifacts"
}
catch {
    Write-Error $_
    exit 1
}
