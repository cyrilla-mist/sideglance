[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $projectRoot

$preflightPath = Join-Path $projectRoot 'evaluation\reports\task09b-four-case-preflight-06.json'
if (-not (Test-Path -LiteralPath $preflightPath -PathType Leaf)) { Write-Host 'Gold Set blocked: 4-case real-AI preflight has not passed.'; exit 2 }
$preflight = Get-Content -Raw -LiteralPath $preflightPath | ConvertFrom-Json
if ($preflight.overallVerdict -ne 'PASS' -or $preflight.structuredGateProviderAcceptance -ne 'verified' -or @($preflight.results).Count -ne 4 -or @($preflight.results | Where-Object { $_.verdict -ne 'PASS' }).Count -ne 0) { Write-Host 'Gold Set blocked: 4-case real-AI preflight has not passed.'; exit 2 }

npm.cmd test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm.cmd run worker:typecheck
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm.cmd run typecheck
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm.cmd exec vite-node -- evaluation/runners/transport-self-check.ts
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$caseCount = 26
Write-Host "Task 09C Gold Set: $caseCount cases; model gemini-3.5-flash; maximum model stages $($caseCount * 2); maximum attempts $($caseCount * 2 * 2)."
Write-Host 'This command will send Gold Set fixtures to the configured Gemini API. No API key or raw model output will be written to reports.'
if ((Read-Host 'Type YES to continue') -cne 'YES') { Write-Host 'Gold Set cancelled. No network call was made.'; exit 2 }

npm.cmd exec vite-node -- evaluation/runners/real-transport-connectivity-check.ts
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm.cmd exec vite-node -- evaluation/runners/task09c-gold-set.ts
exit $LASTEXITCODE
