# LOCAL EVALUATION ONLY. NOT PRODUCTION TRANSPORT.
param([switch]$DryRun)

$requestBody = [Console]::In.ReadToEnd()

function Write-TransportResult($result) {
  [Console]::Out.Write(($result | ConvertTo-Json -Compress -Depth 10))
}

function Safe-Message($message) {
  if ($null -eq $message) { return 'PowerShell transport failed.' }
  return ([string]$message).Replace("`r", ' ').Replace("`n", ' ').Replace('Bearer ', 'Bearer [redacted] ').Substring(0, [Math]::Min(300, ([string]$message).Length))
}

function Write-TransportFailure($category, $stage, $status, $message, $body) {
  $result = @{ ok = $false; stage = $stage; category = $category; status = $status; message = (Safe-Message $message) }
  if ($null -ne $body) { $result.body = [string]$body }
  Write-TransportResult $result
}

if ($DryRun) {
  try {
    if ([string]::IsNullOrWhiteSpace($env:MODEL_API_KEY) -or [string]::IsNullOrWhiteSpace($env:MODEL_API_URL) -or [string]::IsNullOrWhiteSpace($env:MODEL_NAME)) { throw 'required environment is not configured' }
    $null = $requestBody | ConvertFrom-Json -ErrorAction Stop
    $null = [Uri]$env:MODEL_API_URL
    [Console]::Error.WriteLine('STATUS=200')
    Write-TransportResult @{ ok = $true; status = 200; body = (@{ dryRun = $true; stdinJson = $true; environment = @{ MODEL_API_KEY = $true; MODEL_API_URL = $true; MODEL_NAME = $true }; requestConstructed = $true } | ConvertTo-Json -Compress) }
  } catch {
    Write-TransportFailure 'stdin_parse_error' 'stdin' $null 'Dry-run input was not valid JSON.' $null
    exit 1
  }
  exit 0
}

$endpoint = $env:MODEL_API_URL.TrimEnd('/')
if (-not $endpoint.EndsWith('/chat/completions')) { $endpoint = $endpoint + '/chat/completions' }

try {
  $null = $requestBody | ConvertFrom-Json -ErrorAction Stop
  $requestBytes = [System.Text.Encoding]::UTF8.GetBytes($requestBody)
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
} catch {
  Write-TransportFailure 'stdin_parse_error' 'request_serialization' $null 'Request JSON could not be serialized.' $null
  exit 1
}

try {
  $response = Invoke-WebRequest -Uri $endpoint -Method Post -Headers @{ authorization = ('Bearer ' + $env:MODEL_API_KEY) } -ContentType 'application/json; charset=utf-8' -Body $requestBytes -UseBasicParsing -TimeoutSec 60
  [Console]::Error.WriteLine(('STATUS=' + [int]$response.StatusCode))
  if ($response.Headers['Retry-After']) { [Console]::Error.WriteLine(('RETRY_AFTER_SECONDS=' + $response.Headers['Retry-After'])) }
  Write-TransportResult @{ ok = $true; status = [int]$response.StatusCode; body = [string]$response.Content }
  exit 0
} catch {
  $webResponse = $_.Exception.Response
  if ($null -ne $webResponse) {
    $reader = New-Object System.IO.StreamReader($webResponse.GetResponseStream())
    $errorBody = $reader.ReadToEnd()
    $reader.Dispose()
    [Console]::Error.WriteLine(('STATUS=' + [int]$webResponse.StatusCode))
    [Console]::Error.WriteLine(('RESPONSE_ERROR=provider_http_error'))
    Write-TransportFailure 'provider_http_error' 'provider_response' ([int]$webResponse.StatusCode) ('Provider returned HTTP status ' + [int]$webResponse.StatusCode + '.') $null
    exit 0
  }
  if ($_.Exception -is [System.Net.WebException] -and $_.Exception.Status -eq [System.Net.WebExceptionStatus]::Timeout) {
    Write-TransportFailure 'connection_timeout' 'http_request' $null 'PowerShell request timed out.' $null
  } elseif ($_.Exception -is [System.Net.WebException] -and $_.Exception.Status -eq [System.Net.WebExceptionStatus]::NameResolutionFailure) {
    Write-TransportFailure 'dns_error' 'http_request' $null 'DNS resolution failed.' $null
  } elseif ($_.Exception -is [System.Net.WebException] -and $_.Exception.Status -eq [System.Net.WebExceptionStatus]::SecureChannelFailure) {
    Write-TransportFailure 'tls_error' 'http_request' $null 'TLS negotiation failed.' $null
  } else {
    Write-TransportFailure 'invoke_webrequest_error' 'http_request' $null 'Invoke-WebRequest failed.' $null
  }
  exit 1
}
