$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$wrangler = 'npx.cmd'

Write-Output 'Checking authenticated Wrangler account...'
$whoami = (& $wrangler wrangler whoami 2>$null | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Wrangler authentication is required. Run wrangler login, then retry.' }
$accountIds = @([regex]::Matches($whoami, '(?i)\b[0-9a-f]{32}\b') | ForEach-Object { $_.Value.ToLowerInvariant() } | Select-Object -Unique)
if ($accountIds.Count -ne 1) { throw 'Could not resolve exactly one authenticated Cloudflare account. No secret was changed.' }
$accountId = $accountIds[0]

Write-Output 'Required token permission: Account -> Workers AI -> Read.'
Write-Output 'Confirm sufficient Cloudflare Unified Billing / AI Gateway credits before continuing.'
$confirmed = Read-Host 'Have you created the scoped token and confirmed billing? Type YES'
if ($confirmed -cne 'YES') { Write-Output 'Stopped. No remote secret was changed.'; exit 1 }

Write-Output 'Configuring account metadata as a Worker secret (value is not displayed)...'
$accountId | & $wrangler wrangler secret put CLOUDFLARE_ACCOUNT_ID --env production 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Account ID secret configuration failed.' }
Write-Output 'Opening secure Wrangler prompt for CLOUDFLARE_API_TOKEN...'
& $wrangler wrangler secret put CLOUDFLARE_API_TOKEN --env production
if ($LASTEXITCODE -ne 0) { throw 'API token secret configuration failed.' }
Write-Output 'Secrets configured. Run npm.cmd run production:readiness next.'
