function Invoke-SideglanceHttp {
  param(
    [Parameter(Mandatory = $true)][ValidateSet('GET', 'POST')][string]$Method,
    [Parameter(Mandatory = $true)][string]$Uri,
    [string]$BodyJson = '',
    [int]$MaxTimeSeconds = 10
  )

  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('sideglance-http-' + [guid]::NewGuid().ToString('N'))
  $headersPath = Join-Path $tempRoot 'headers.txt'
  $bodyPath = Join-Path $tempRoot 'body.bin'
  New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
  $started = [Diagnostics.Stopwatch]::StartNew()
  try {
    $curlArgs = @('--silent', '--show-error', '--request', $Method, '--dump-header', $headersPath, '--output', $bodyPath, '--write-out', '%{http_code}', '--max-time', [string]$MaxTimeSeconds, $Uri)
    if ($Method -eq 'POST') { $curlArgs = @('--header', 'Content-Type: application/json', '--data-binary', $BodyJson) + $curlArgs }
    $statusText = & curl.exe @curlArgs
    $curlExitCode = $LASTEXITCODE
    $started.Stop()
    $status = $null
    $statusMatch = [regex]::Match(($statusText -join '').Trim(), '[0-9]{3}$')
    if ($statusMatch.Success) { $status = [int]$statusMatch.Value }
    $contentType = $null
    if (Test-Path $headersPath) {
      $headerMatch = Select-String -Path $headersPath -Pattern '^Content-Type:\s*(.+)$' | Select-Object -Last 1
      if ($headerMatch) { $contentType = $headerMatch.Matches[0].Groups[1].Value.Trim() }
    }
    $body = if (Test-Path $bodyPath) { [System.IO.File]::ReadAllText($bodyPath, [System.Text.Encoding]::UTF8) } else { '' }
    return [pscustomobject]@{ status = $status; contentType = $contentType; body = $body; latencyMs = $started.ElapsedMilliseconds; responseReached = ($null -ne $status); curlExitCode = $curlExitCode }
  } finally {
    if (Test-Path $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue }
  }
}
