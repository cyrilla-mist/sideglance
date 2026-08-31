param([Parameter(Mandatory = $true)][string]$ProductionUrl)
$ErrorActionPreference = 'Stop'
$base = $ProductionUrl.TrimEnd('/')
$reportDir = Join-Path (Split-Path -Parent $PSScriptRoot) 'docs/reports'
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null

function Invoke-Json([string]$Path, [object]$Body) {
  $started = [Diagnostics.Stopwatch]::StartNew()
  try { $response = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$base$Path" -ContentType 'application/json' -Body ($Body | ConvertTo-Json -Depth 8); $status = [int]$response.StatusCode; $json = $response.Content | ConvertFrom-Json } catch { $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { $null }; $json = $null }
  $started.Stop(); return [pscustomobject]@{ status = $status; latencyMs = $started.ElapsedMilliseconds; json = $json }
}

$healthWatch = [Diagnostics.Stopwatch]::StartNew()
try { $healthResponse = Invoke-WebRequest -UseBasicParsing -Method Get -Uri "$base/api/health"; $health = [pscustomobject]@{ pass = ([int]$healthResponse.StatusCode -eq 200 -and ($healthResponse.Content | ConvertFrom-Json).ok -eq $true); status = [int]$healthResponse.StatusCode; latencyMs = $healthWatch.ElapsedMilliseconds } } catch { $health = [pscustomobject]@{ pass = $false; status = $null; latencyMs = $healthWatch.ElapsedMilliseconds } }
if (-not $health.pass) { @{ health = $health; finalVerdict = 'PRODUCTION_SMOKE_FAILED' } | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $reportDir 'task10-production-smoke.json') -Encoding UTF8; Write-Output 'PRODUCTION_SMOKE_FAILED'; exit 1 }

Write-Output 'Health PASS. The next tests send Sideglance fixtures through the deployed Worker and Cloudflare AI Gateway.'
if ((Read-Host 'Type YES to authorize model-calling smoke cases') -cne 'YES') { Write-Output 'Stopped before model calls.'; exit 1 }
$ambiguous = Invoke-Json '/api/decode' @{ inputText = 'fearless behavior 💀' }
$friday = Invoke-Json '/api/decode' @{ inputText = "Nora: just merged the auth rewrite into main`n`nKai: on a friday??`n`nLeo: fearless behavior 💀`n`nNora: wait what`n`nKai: nothing. enjoy your weekend" }
$straightforward = Invoke-Json '/api/decode' @{ inputText = "Sam: I updated the README with the setup steps and the new environment variable names.`n`nMina: Thanks, I’ll review it this afternoon." }
$safe = Invoke-Json '/api/decode' @{ inputText = ('x' * 5001) }
$ambiguousPass = $ambiguous.status -eq 200 -and $ambiguous.json.type -eq 'needs_context' -and ([regex]::Matches([string]$ambiguous.json.question, '\?').Count -eq 1)
$fridayPass = $friday.status -eq 200 -and $friday.json.type -eq 'decoded' -and @($friday.json.signals).Count -gt 0
$straightPass = $straightforward.status -eq 200 -and $straightforward.json.type -eq 'decoded'
$safePass = $safe.status -eq 400 -and $safe.json.type -eq 'failed'
$verdict = if ($ambiguousPass -and $fridayPass -and $straightPass -and $safePass) { 'PRODUCTION_TRANSPORT_VALIDATED' } else { 'PRODUCTION_SMOKE_FAILED' }
$report = [ordered]@{ health = $health; ambiguous = @{ pass = $ambiguousPass; status = $ambiguous.status; latencyMs = $ambiguous.latencyMs }; contextual = @{ pass = $fridayPass; status = $friday.status; latencyMs = $friday.latencyMs }; straightforward = @{ pass = $straightPass; status = $straightforward.status; latencyMs = $straightforward.latencyMs }; safeError = @{ pass = $safePass; status = $safe.status; latencyMs = $safe.latencyMs }; finalVerdict = $verdict }
$report | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $reportDir 'task10-production-smoke.json') -Encoding UTF8
Write-Output $verdict
