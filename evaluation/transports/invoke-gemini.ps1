# LOCAL EVALUATION ONLY. NOT PRODUCTION TRANSPORT.
$requestBody = [Console]::In.ReadToEnd()
$endpoint = $env:MODEL_API_URL.TrimEnd('/')
if (-not $endpoint.EndsWith('/chat/completions')) { $endpoint = $endpoint + '/chat/completions' }

try {
  $response = Invoke-WebRequest -Uri $endpoint -Method Post -Headers @{ authorization = ('Bearer ' + $env:MODEL_API_KEY) } -ContentType 'application/json' -Body $requestBody -SkipHttpErrorCheck -TimeoutSec 60
  [Console]::Error.WriteLine(('STATUS=' + [int]$response.StatusCode))
  if ($response.Headers['Retry-After']) { [Console]::Error.WriteLine(('RETRY_AFTER_SECONDS=' + $response.Headers['Retry-After'])) }
  [Console]::Out.Write($response.Content)
  exit 0
} catch {
  [Console]::Error.WriteLine('ERROR=powershell_transport_error')
  exit 1
}
