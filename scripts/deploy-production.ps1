param([string]$ProductionUrl = '')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$readiness = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'scripts/check-production-readiness.ps1')
if ($readiness -notcontains 'READY_FOR_DEPLOY') { $readiness | ForEach-Object { Write-Output $_ }; Write-Output 'Stopped before deployment.'; exit 1 }
Write-Output 'This will deploy sideglance-worker to Cloudflare.'
$confirmation = Read-Host 'Type DEPLOY to continue'
if ($confirmation -cne 'DEPLOY') { Write-Output 'Stopped. No deployment performed.'; exit 1 }
$started = Get-Date
$deployOutput = & npx.cmd wrangler deploy --env production 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) { Write-Output 'DEPLOY_FAILED'; exit 1 }
$reportDir = Join-Path $root 'docs/reports'
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
$report = [ordered]@{ success = $true; workerName = 'sideglance-worker-production'; productionUrl = if ($ProductionUrl) { $ProductionUrl } else { $null }; deployedAt = $started.ToUniversalTime().ToString('o') }
$report | ConvertTo-Json | Set-Content (Join-Path $reportDir 'task10-production-deploy.json') -Encoding UTF8
Write-Output 'DEPLOY_SUCCESS'
Write-Output 'Sanitized deployment report written to docs/reports/task10-production-deploy.json.'
