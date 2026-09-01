param([Parameter(Mandatory = $true)][string]$ProductionUrl)
$ErrorActionPreference = 'Stop'
$base = $ProductionUrl.TrimEnd('/')
$reportDir = Join-Path (Split-Path -Parent $PSScriptRoot) 'docs/reports'
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
. (Join-Path $PSScriptRoot 'production-http.ps1')

function Invoke-Json([string]$Path, [object]$Body) {
  $result = Invoke-SideglanceHttp -Method POST -Uri "$base$Path" -BodyJson ($Body | ConvertTo-Json -Depth 8)
  $json = $null
  if ($result.body) { try { $json = $result.body | ConvertFrom-Json } catch { $json = $null } }
  return [pscustomobject]@{ status = $result.status; latencyMs = $result.latencyMs; contentType = $result.contentType; json = $json; responseReached = $result.responseReached }
}

function Get-SafeCode([object]$Result) {
  if ($Result.json -and $Result.json.diagnosticCode) { return [string]$Result.json.diagnosticCode }
  if ($Result.json -and $Result.json.errorCode) { return [string]$Result.json.errorCode }
  if ($Result.status -eq 502) { return 'unknown_502' }
  if ($Result.status -eq 429) { return 'gateway_rate_limited' }
  if ($Result.status -eq 401 -or $Result.status -eq 403) { return 'gateway_auth_error' }
  if ($Result.status -ge 500 -and $Result.status -le 504) { return 'gateway_provider_unavailable' }
  if ($Result.status -ge 400 -and $Result.status -lt 500) { return 'gateway_invalid_request' }
  if ($null -eq $Result.status) { return 'transport_error' }
  return $null
}

function Get-FailureLayer([object]$Result) {
  $safeCode = Get-SafeCode $Result
  if ($safeCode -in @('gateway_auth_error', 'gateway_rate_limited', 'gateway_provider_unavailable', 'gateway_invalid_request', 'structured_output_rejected')) { return 'cloudflare_ai_gateway' }
  if ($safeCode -in @('provider_model_error', 'provider_timeout', 'model_contract_error')) { return 'provider' }
  if ($safeCode -eq 'transport_error') { return 'transport' }
  if ($safeCode -eq 'unknown_502') { return 'unknown_502' }
  return 'worker_route'
}

function Get-CaseRecord([string]$CaseId, [object]$Result, [bool]$Pass) {
  $responseType = if ($Result.json -and $Result.json.type) { [string]$Result.json.type } else { $null }
  $signalCount = if ($Result.json -and $Result.json.signals) { @($Result.json.signals).Count } else { $null }
  return [ordered]@{ caseId = $CaseId; executed = $true; responseReached = $Result.responseReached; httpStatus = $Result.status; latencyMs = $Result.latencyMs; responseType = $responseType; safeCode = Get-SafeCode $Result; verdict = if ($Pass) { 'PASS' } else { 'FAIL' }; failureLayer = Get-FailureLayer $Result; signalCount = $signalCount }
}

function Test-SafeFailure([object]$Result) {
  return $Result.status -eq 400 -and $Result.json -and $Result.json.type -eq 'failed' -and $Result.json.errorCode -eq 'invalid_request' -and $Result.json.message -is [string]
}

$healthResponse = Invoke-SideglanceHttp -Method GET -Uri "$base/api/health"
$healthJson = $null
if ($healthResponse.body) { try { $healthJson = $healthResponse.body | ConvertFrom-Json } catch { $healthJson = $null } }
$health = [pscustomobject]@{ pass = ($healthResponse.status -eq 200 -and $healthJson.ok -eq $true); status = $healthResponse.status; latencyMs = $healthResponse.latencyMs }
if (-not $health.pass) { @{ health = $health; finalVerdict = 'PRODUCTION_SMOKE_FAILED' } | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $reportDir 'task10-production-smoke.json') -Encoding UTF8; Write-Output 'PRODUCTION_SMOKE_FAILED'; exit 1 }

Write-Output 'Health PASS. The next tests send Sideglance fixtures through the deployed Worker and Cloudflare AI Gateway.'
if ((Read-Host 'Type YES to authorize model-calling smoke cases') -cne 'YES') { Write-Output 'Stopped before model calls.'; exit 1 }
$ambiguous = Invoke-Json '/api/decode' @{ inputText = 'fearless behavior 💀' }
$friday = Invoke-Json '/api/decode' @{ inputText = "Nora: just merged the auth rewrite into main`n`nKai: on a friday??`n`nLeo: fearless behavior 💀`n`nNora: wait what`n`nKai: nothing. enjoy your weekend" }
$straightforward = Invoke-Json '/api/decode' @{ inputText = "Sam: I updated the README with the setup steps and the new environment variable names.`n`nMina: Thanks, I’ll review it this afternoon." }
$malformed = Invoke-Json '/api/decode' @{ inputText = '' }
$oversized = Invoke-Json '/api/decode' @{ inputText = ('x' * 5001) }
$ambiguousPass = $ambiguous.status -eq 200 -and $ambiguous.json.type -eq 'needs_context' -and ([regex]::Matches([string]$ambiguous.json.question, '\?').Count -eq 1)
$fridayPass = $friday.status -eq 200 -and $friday.json.type -eq 'decoded' -and @($friday.json.signals).Count -gt 0
$straightPass = $straightforward.status -eq 200 -and $straightforward.json.type -eq 'decoded'
$malformedPass = Test-SafeFailure $malformed
$oversizedPass = Test-SafeFailure $oversized
$verdict = if ($ambiguousPass -and $fridayPass -and $straightPass -and $malformedPass -and $oversizedPass) { 'PRODUCTION_TRANSPORT_VALIDATED' } else { 'PRODUCTION_SMOKE_FAILED' }
$report = [ordered]@{ health = $health; cases = @((Get-CaseRecord 'ambiguous' $ambiguous $ambiguousPass), (Get-CaseRecord 'friday' $friday $fridayPass), (Get-CaseRecord 'straightforward' $straightforward $straightPass), (Get-CaseRecord 'malformed' $malformed $malformedPass), (Get-CaseRecord 'oversized' $oversized $oversizedPass)); finalVerdict = $verdict }
$report | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $reportDir 'task10-production-smoke.json') -Encoding UTF8
Write-Output $verdict
if ($verdict -eq 'PRODUCTION_SMOKE_FAILED') { exit 1 }
exit 0
