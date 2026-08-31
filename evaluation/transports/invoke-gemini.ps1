# LOCAL EVALUATION ONLY. NOT PRODUCTION TRANSPORT.
param([switch]$DryRun)

$requestBody = [Console]::In.ReadToEnd()

function Write-TransportResult($result) {
  [Console]::Out.Write(($result | ConvertTo-Json -Compress -Depth 10))
}

if ($DryRun) {
  try {
    if ([string]::IsNullOrWhiteSpace($env:MODEL_API_KEY) -or [string]::IsNullOrWhiteSpace($env:MODEL_API_URL) -or [string]::IsNullOrWhiteSpace($env:MODEL_NAME)) { throw 'required environment is not configured' }
    $null = $requestBody | ConvertFrom-Json
    $null = [Uri]$env:MODEL_API_URL
    [Console]::Error.WriteLine('STATUS=200')
    Write-TransportResult @{ ok = $true; status = 200; body = (@{ dryRun = $true; stdinJson = $true; environment = @{ MODEL_API_KEY = $true; MODEL_API_URL = $true; MODEL_NAME = $true }; requestConstructed = $true } | ConvertTo-Json -Compress) }
  } catch {
    Write-TransportResult @{ ok = $false; category = 'powershell_script_error'; status = $null; message = 'Dry-run transport validation failed.' }
    exit 1
  }
  exit 0
}

$endpoint = $env:MODEL_API_URL.TrimEnd('/')
if (-not $endpoint.EndsWith('/chat/completions')) { $endpoint = $endpoint + '/chat/completions' }

try {
  $response = Invoke-WebRequest -Uri $endpoint -Method Post -Headers @{ authorization = ('Bearer ' + $env:MODEL_API_KEY) } -ContentType 'application/json' -Body $requestBody -UseBasicParsing -TimeoutSec 60
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
    Write-TransportResult @{ ok = $true; status = [int]$webResponse.StatusCode; body = [string]$errorBody }
    exit 0
  }
  if ($_.Exception -is [System.Net.WebException] -and $_.Exception.Status -eq [System.Net.WebExceptionStatus]::Timeout) {
    Write-TransportResult @{ ok = $false; category = 'powershell_timeout'; status = $null; message = 'PowerShell request timed out.' }
  } else {
    Write-TransportResult @{ ok = $false; category = 'powershell_script_error'; status = $null; message = 'PowerShell script failed.' }
  }
  exit 1
}
