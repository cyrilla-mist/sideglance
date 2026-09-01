param([Parameter(Mandatory = $true)][string]$ProductionUrl)
$ErrorActionPreference = 'Stop'
$base = $ProductionUrl.TrimEnd('/')
$root = Split-Path -Parent $PSScriptRoot
$reportDir = Join-Path $root 'docs/reports'
$reportPath = Join-Path $reportDir 'task10-production-diagnostic.json'
. (Join-Path $PSScriptRoot 'production-http.ps1')
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null

function Read-SafeJson([object]$Result) {
  if (-not $Result.body) { return $null }
  try { return $Result.body | ConvertFrom-Json } catch { return $null }
}

function Get-ResponseFormat([object]$Json, [object]$Result) {
  if ($Json) { return 'json' }
  if ($Result.status -eq $null -or -not $Result.body) { return 'empty' }
  return 'non_json'
}

function Get-SafeCode([object]$Json, [object]$Result) {
  if ($Json -and $Json.diagnosticCode) { return [string]$Json.diagnosticCode }
  if ($Json -and $Json.errorCode) { return [string]$Json.errorCode }
  if ($Result.status -eq 502) { return 'unknown_502' }
  if ($Result.status -eq 400) { return 'invalid_request' }
  if ($Result.status -eq $null) { return 'transport_error' }
  return $null
}

function Get-SafeResponse([object]$Result) {
  $json = Read-SafeJson $Result
  return [pscustomobject]@{ status = $Result.status; contentType = $Result.contentType; responseFormat = Get-ResponseFormat $json $Result; safeCode = Get-SafeCode $json $Result; requestId = if ($json -and $json.requestId) { [string]$json.requestId } else { $null }; latencyMs = $Result.latencyMs; json = $json }
}

function Get-TailRecord([string]$Path, [string]$RequestId) {
  if (-not $RequestId -or -not (Test-Path $Path)) { return [pscustomobject]@{ matched = $false; stage = $null; safeCode = $null; httpStatus = $null } }
  foreach ($line in (Get-Content -LiteralPath $Path -ErrorAction SilentlyContinue)) {
    if ($line -notmatch [regex]::Escape($RequestId)) { continue }
    try { $entry = $line | ConvertFrom-Json } catch { continue }
    if ($entry.message -is [string]) { try { $entry = $entry.message | ConvertFrom-Json } catch { } }
    if ($entry.requestId -eq $RequestId) { return [pscustomobject]@{ matched = $true; stage = [string]$entry.stage; safeCode = [string]$entry.diagnosticCode; httpStatus = $entry.httpStatus } }
  }
  return [pscustomobject]@{ matched = $false; stage = $null; safeCode = $null; httpStatus = $null }
}

$clientSelection = Select-SideglanceHttpClient -HealthUri "$base/api/health"
$selectedClient = $clientSelection.client
if (-not $selectedClient) { Write-Output 'PRODUCTION_DIAGNOSTIC_STOPPED: LOCAL_CLIENT_NETWORK_BLOCKED'; exit 1 }
Write-Output "HTTP client: $selectedClient"
$health = Get-SafeResponse $clientSelection.health
$malformed = Get-SafeResponse (Invoke-SideglanceHttp -Client $selectedClient -Method POST -Uri "$base/api/decode" -BodyJson (@{ inputText = '' } | ConvertTo-Json))
$malformedPass = $malformed.status -eq 400 -and $malformed.responseFormat -eq 'json' -and $malformed.json.type -eq 'failed' -and $malformed.json.errorCode -eq 'invalid_request'
Write-Output "Health PASS. Malformed request JSON capture: $(if ($malformedPass) { 'PASS' } else { 'FAIL' })."
Write-Output 'The next request will send one Sideglance ambiguous test fixture through the deployed Worker and real AI provider.'
if ((Read-Host 'Type YES to authorize the single AI diagnostic case') -cne 'YES') { Write-Output 'Stopped before model call.'; exit 1 }

$tailRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('sideglance-tail-' + [guid]::NewGuid().ToString('N'))
$tailOutput = Join-Path $tailRoot 'tail.jsonl'
New-Item -ItemType Directory -Force -Path $tailRoot | Out-Null
$tailProcess = $null
try {
  $tailProcess = Start-Process -FilePath 'npx.cmd' -ArgumentList @('wrangler', 'tail', 'sideglance-worker-production', '--env', 'production', '--format', 'json', '--status', 'error') -RedirectStandardOutput $tailOutput -RedirectStandardError (Join-Path $tailRoot 'tail.err') -PassThru -WindowStyle Hidden
  Start-Sleep -Milliseconds 750
  $ambiguous = Get-SafeResponse (Invoke-SideglanceHttp -Client $selectedClient -Method POST -Uri "$base/api/decode" -BodyJson (@{ inputText = 'fearless behavior 💀' } | ConvertTo-Json))
  Start-Sleep -Milliseconds 750
} finally {
  if ($tailProcess -and -not $tailProcess.HasExited) { Stop-Process -Id $tailProcess.Id -Force -ErrorAction SilentlyContinue }
}
$runtimeLog = Get-TailRecord $tailOutput $ambiguous.requestId
$ambiguousJson = $ambiguous.responseFormat -eq 'json'
if ($ambiguous.status -eq 502 -and $ambiguousJson -and $ambiguous.safeCode -ne 'unknown_502') { $classification = 'WORKER_JSON_FAILURE' }
elseif ($ambiguous.status -eq 502 -and -not $ambiguousJson -and -not $runtimeLog.matched) { $classification = 'PLATFORM_OR_EDGE_5XX' }
elseif ($ambiguous.status -eq 502 -and -not $ambiguousJson -and $runtimeLog.matched) { $classification = 'WORKER_LOGGED_FAILURE' }
elseif ($malformedPass) { $classification = 'PRODUCTION_DIAGNOSTIC_CASE_NOT_502' }
elseif ($malformed.status -eq 400) { $classification = 'MALFORMED_CONTROL_RESPONSE_UNEXPECTED' }
else { $classification = 'WORKER_APPLICATION_RESPONSE_PATH_ISSUE' }
$report = [ordered]@{ health = [ordered]@{ status = $health.status; latencyMs = $health.latencyMs }; malformed = [ordered]@{ status = $malformed.status; contentType = $malformed.contentType; responseFormat = $malformed.responseFormat; safeCode = $malformed.safeCode }; ambiguous = [ordered]@{ status = $ambiguous.status; contentType = $ambiguous.contentType; responseFormat = $ambiguous.responseFormat; safeCode = $ambiguous.safeCode; requestId = $ambiguous.requestId; latencyMs = $ambiguous.latencyMs }; runtimeLog = $runtimeLog; finalClassification = $classification }
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $reportPath -Encoding UTF8
Remove-Item -LiteralPath $tailRoot -Recurse -Force -ErrorAction SilentlyContinue
Write-Output $classification
