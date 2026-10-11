param([Parameter(Mandatory = $true)][string]$ProductionUrl)

$ErrorActionPreference = 'Stop'
$uri = $null
try { $uri = [uri]$ProductionUrl } catch { throw 'Invalid Worker URL.' }
if ($uri.Scheme -cne 'https' -or $uri.Host -cnotmatch '^sideglance-worker-production\.[a-z0-9-]+\.workers\.dev$' -or
    $uri.AbsolutePath -cne '/' -or $uri.Query -or $uri.Fragment -or $uri.UserInfo -or
    $uri.Port -ne 443) {
  throw 'For credential safety, provide only the exact production Workers.dev HTTPS origin.'
}
$base = $uri.GetLeftPart([System.UriPartial]::Authority).TrimEnd('/')

Write-Output 'Checking Worker health (no AI model call)...'
try {
  $healthResponse = Invoke-WebRequest -UseBasicParsing -Uri "$base/api/health" -Method GET -TimeoutSec 15
  $health = $healthResponse.Content | ConvertFrom-Json
  if ($healthResponse.StatusCode -ne 200 -or $health.ok -ne $true) { throw 'Unexpected health contract.' }
} catch { throw 'Worker health is unavailable. No AI call was made.' }
Write-Output 'HEALTH_PASS'

Write-Output 'Next: one bounded live AI request to the operator-protected Worker. This may incur provider charges.'
if ((Read-Host 'Type YES to authorize exactly one model-backed diagnostic') -cne 'YES') {
  Write-Output 'STOPPED_BEFORE_MODEL_CALL'
  exit 1
}

# Never pass bearer tokens via command line, log files, tracked config, or curl arguments.
$secret = Read-Host 'Enter the AI_ACCESS_TOKEN (input hidden)' -AsSecureString
if (-not $secret -or $secret.Length -lt 32) { throw 'Operator token must contain at least 32 characters.' }
$bstr = [IntPtr]::Zero
$accessToken = $null
try {
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
  $accessToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
  if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  $secret.Dispose()
}
$headers = @{ Authorization = "Bearer $accessToken" }
$accessToken = $null

$body = @{ inputText = 'fearless behavior' } | ConvertTo-Json -Compress
$responseStatus = $null
$responseText = ''
try {
  try {
    $result = Invoke-WebRequest -UseBasicParsing -Uri "$base/api/decode" -Method POST -ContentType 'application/json' -Headers $headers -Body $body -TimeoutSec 90
    $responseStatus = [int]$result.StatusCode
    $responseText = [string]$result.Content
  } catch {
    $failure = $_.Exception.Response
    if (-not $failure) { throw 'Request transport failed without an HTTP response.' }
    $responseStatus = [int]$failure.StatusCode
    $stream = $failure.GetResponseStream()
    if ($stream) {
      $reader = New-Object System.IO.StreamReader($stream)
      try { $responseText = $reader.ReadToEnd() } finally { $reader.Dispose(); $stream.Dispose() }
    }
  }
} finally {
  $headers.Clear()
}

# Print only safe summary fields. Never echo user input or provider raw output.
$summary = $null
try { $summary = $responseText | ConvertFrom-Json } catch { $summary = $null }
$responseType = if ($summary -and $summary.type) { [string]$summary.type } else { 'non_json' }
$diagnosticCode = if ($summary -and $summary.diagnosticCode) { [string]$summary.diagnosticCode } else { 'none' }
$errorCode = if ($summary -and $summary.errorCode) { [string]$summary.errorCode } else { 'none' }
Write-Output "AI_HTTP_STATUS=$responseStatus"
Write-Output "AI_RESPONSE_TYPE=$responseType"
Write-Output "AI_ERROR_CODE=$errorCode"
Write-Output "AI_DIAGNOSTIC_CODE=$diagnosticCode"
if ($responseStatus -eq 200 -and $responseType -in @('decoded', 'needs_context')) {
  Write-Output 'AI_DIAGNOSTIC_TRANSPORT_PASS'
  exit 0
}
Write-Output 'AI_DIAGNOSTIC_NEEDS_REVIEW'
exit 1
