function Invoke-SideglanceHttpPowerShell {
  param([Parameter(Mandatory = $true)][ValidateSet('GET', 'POST')][string]$Method, [Parameter(Mandatory = $true)][string]$Uri, [string]$BodyJson = '', [int]$MaxTimeSeconds = 10)
  $started = [Diagnostics.Stopwatch]::StartNew(); $status = $null; $contentType = $null; $body = ''
  try {
    $params = @{ UseBasicParsing = $true; Method = $Method; Uri = $Uri; TimeoutSec = $MaxTimeSeconds }
    if ($Method -eq 'POST') { $params.ContentType = 'application/json'; $params.Body = $BodyJson }
    $response = Invoke-WebRequest @params; $status = [int]$response.StatusCode; $contentType = [string]$response.Headers['Content-Type']; $body = [string]$response.Content
  } catch {
    $errorResponse = $_.Exception.Response
    if ($errorResponse) {
      $status = [int]$errorResponse.StatusCode; $contentType = [string]$errorResponse.Headers['Content-Type']; $stream = $errorResponse.GetResponseStream()
      if ($stream) { $reader = New-Object System.IO.StreamReader($stream); try { $body = $reader.ReadToEnd() } finally { $reader.Dispose(); $stream.Dispose() } }
    }
  }
  $started.Stop(); return [pscustomobject]@{ client = 'powershell'; status = $status; contentType = $contentType; body = $body; latencyMs = $started.ElapsedMilliseconds; responseReached = ($null -ne $status) }
}

function Invoke-SideglanceHttpCurl {
  param([Parameter(Mandatory = $true)][ValidateSet('GET', 'POST')][string]$Method, [Parameter(Mandatory = $true)][string]$Uri, [string]$BodyJson = '', [int]$MaxTimeSeconds = 10)
  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('sideglance-http-' + [guid]::NewGuid().ToString('N')); $headersPath = Join-Path $tempRoot 'headers.txt'; $bodyPath = Join-Path $tempRoot 'body.bin'; New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null; $started = [Diagnostics.Stopwatch]::StartNew()
  try {
    $curlArgs = @('--silent', '--show-error', '--request', $Method, '--dump-header', $headersPath, '--output', $bodyPath, '--write-out', '%{http_code}', '--max-time', [string]$MaxTimeSeconds, $Uri)
    if ($Method -eq 'POST') { $curlArgs = @('--header', 'Content-Type: application/json', '--data-binary', $BodyJson) + $curlArgs }
    $statusText = & curl.exe @curlArgs; $curlExitCode = $LASTEXITCODE; $started.Stop(); $status = $null; $statusMatch = [regex]::Match(($statusText -join '').Trim(), '[0-9]{3}$'); if ($statusMatch.Success) { $status = [int]$statusMatch.Value }
    $contentType = $null; if (Test-Path $headersPath) { $headerMatch = Select-String -Path $headersPath -Pattern '^Content-Type:\s*(.+)$' | Select-Object -Last 1; if ($headerMatch) { $contentType = $headerMatch.Matches[0].Groups[1].Value.Trim() } }
    $body = if (Test-Path $bodyPath) { [System.IO.File]::ReadAllText($bodyPath, [System.Text.Encoding]::UTF8) } else { '' }; return [pscustomobject]@{ client = 'curl'; status = $status; contentType = $contentType; body = $body; latencyMs = $started.ElapsedMilliseconds; responseReached = ($null -ne $status); curlExitCode = $curlExitCode }
  } finally { if (Test-Path $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue } }
}

function Invoke-SideglanceHttp {
  param([Parameter(Mandatory = $true)][ValidateSet('Auto', 'PowerShell', 'Curl')][string]$Client, [Parameter(Mandatory = $true)][ValidateSet('GET', 'POST')][string]$Method, [Parameter(Mandatory = $true)][string]$Uri, [string]$BodyJson = '', [int]$MaxTimeSeconds = 10)
  if ($Client -eq 'PowerShell') { return Invoke-SideglanceHttpPowerShell -Method $Method -Uri $Uri -BodyJson $BodyJson -MaxTimeSeconds $MaxTimeSeconds }
  if ($Client -eq 'Curl') { return Invoke-SideglanceHttpCurl -Method $Method -Uri $Uri -BodyJson $BodyJson -MaxTimeSeconds $MaxTimeSeconds }
  $powershellResult = Invoke-SideglanceHttpPowerShell -Method $Method -Uri $Uri -BodyJson $BodyJson -MaxTimeSeconds $MaxTimeSeconds; if ($powershellResult.responseReached) { return $powershellResult }; return Invoke-SideglanceHttpCurl -Method $Method -Uri $Uri -BodyJson $BodyJson -MaxTimeSeconds $MaxTimeSeconds
}

function Select-SideglanceHttpClient {
  param([Parameter(Mandatory = $true)][string]$HealthUri)
  $powershellResult = Invoke-SideglanceHttpPowerShell -Method GET -Uri $HealthUri -MaxTimeSeconds 10; if ($powershellResult.responseReached) { return [pscustomobject]@{ client = 'PowerShell'; health = $powershellResult } }
  $curlResult = Invoke-SideglanceHttpCurl -Method GET -Uri $HealthUri -MaxTimeSeconds 10; if ($curlResult.responseReached) { return [pscustomobject]@{ client = 'Curl'; health = $curlResult } }; return [pscustomobject]@{ client = $null; health = $curlResult }
}
