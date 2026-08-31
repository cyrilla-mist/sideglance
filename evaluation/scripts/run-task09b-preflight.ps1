[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $projectRoot

$devVarsPath = Join-Path $projectRoot '.dev.vars'
if (-not (Test-Path -LiteralPath $devVarsPath -PathType Leaf)) {
  Write-Error 'MODEL_API_KEY not configured'
  exit 2
}

$configuredNames = @{}
foreach ($line in Get-Content -LiteralPath $devVarsPath) {
  if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$') {
    $configuredNames[$Matches[1]] = -not [string]::IsNullOrWhiteSpace($Matches[2])
  }
}

foreach ($requiredName in @('MODEL_API_KEY', 'MODEL_API_URL', 'MODEL_NAME')) {
  if (-not $configuredNames.ContainsKey($requiredName) -or -not $configuredNames[$requiredName]) {
    Write-Error "$requiredName not configured"
    exit 2
  }
}

Write-Host 'Running local preflight checks before any network call...'
npm.cmd test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm.cmd run worker:typecheck
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm.cmd run typecheck
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm.cmd exec vite-node -- evaluation/runners/transport-self-check.ts
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host 'This command will send the four Sideglance evaluation fixtures to the configured Gemini API for local evaluation.'
Write-Host 'No API key or raw model output will be written to the report.'
$confirmation = Read-Host 'Type YES to continue'
if ($confirmation -cne 'YES') {
  Write-Host 'Preflight cancelled. No network call was made.'
  exit 2
}

npm.cmd exec vite-node -- evaluation/runners/real-transport-connectivity-check.ts
$connectivityExitCode = $LASTEXITCODE
if ($connectivityExitCode -ne 0) { exit $connectivityExitCode }

npm.cmd exec vite-node -- evaluation/runners/task09b-four-case-preflight-03.ts
$runnerExitCode = $LASTEXITCODE
$reportPath = 'evaluation/reports/task09b-four-case-preflight-05.json'

if (Test-Path -LiteralPath $reportPath -PathType Leaf) {
  $report = Get-Content -Raw -LiteralPath $reportPath | ConvertFrom-Json
  foreach ($caseId in @('B', 'A', 'C', 'D')) {
    $case = @($report.results) | Where-Object { $_.case -eq $caseId } | Select-Object -First 1
    $verdict = if ($null -eq $case) { 'NOT_RUN' } else { [string]$case.verdict }
    Write-Host "Case ${caseId}: $verdict"
  }
  Write-Host "Overall: $($report.overallVerdict)"
  Write-Host "Report: $reportPath"
}

exit $runnerExitCode
