# LOCAL EVALUATION ONLY. NOT PRODUCTION TRANSPORT.
param([switch]$DryRun)

if ($DryRun) {
  [Console]::Error.WriteLine('DRY_RUN=ok')
  exit 0
}

$requestBody = [Console]::In.ReadToEnd()
$endpoint = $env:MODEL_API_URL.TrimEnd('/')
if (-not $endpoint.EndsWith('/chat/completions')) { $endpoint = $endpoint + '/chat/completions' }

try {
  $response = Invoke-WebRequest -Uri $endpoint -Method Post -Headers @{ authorization = ('Bearer ' + $env:MODEL_API_KEY) } -ContentType 'application/json' -Body $requestBody -UseBasicParsing -TimeoutSec 60
  [Console]::Error.WriteLine(('STATUS=' + [int]$response.StatusCode))
  if ($response.Headers['Retry-After']) { [Console]::Error.WriteLine(('RETRY_AFTER_SECONDS=' + $response.Headers['Retry-After'])) }
  [Console]::Out.Write($response.Content)
  exit 0
} catch {
  $webResponse = $_.Exception.Response
  if ($null -ne $webResponse) {
    $reader = New-Object System.IO.StreamReader($webResponse.GetResponseStream())
    $errorBody = $reader.ReadToEnd()
    $reader.Dispose()
    [Console]::Error.WriteLine(('STATUS=' + [int]$webResponse.StatusCode))
    [Console]::Out.Write($errorBody)
    exit 0
  }
  if ($_.Exception -is [System.Net.WebException] -and $_.Exception.Status -eq [System.Net.WebExceptionStatus]::Timeout) {
    [Console]::Error.WriteLine('ERROR=powershell_timeout')
  } else {
    [Console]::Error.WriteLine('ERROR=powershell_script_error')
  }
  exit 1
}
