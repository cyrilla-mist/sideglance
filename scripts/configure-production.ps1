$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$wrangler = 'npx.cmd'
$config = Get-Content (Join-Path $root 'wrangler.toml') -Raw
$directInference = $config -match 'MODEL_TRANSPORT\s*=\s*"google_openai_direct"'

Write-Output 'Checking authenticated Wrangler account...'
$whoami = (& $wrangler wrangler whoami 2>$null | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Wrangler authentication is required. Run wrangler login, then retry.' }
$accountIds = @([regex]::Matches($whoami, '(?i)\b[0-9a-f]{32}\b') | ForEach-Object { $_.Value.ToLowerInvariant() } | Select-Object -Unique)
if ($accountIds.Count -ne 1) { throw 'Could not resolve exactly one authenticated Cloudflare account. No secret was changed.' }
$accountId = $accountIds[0]
$secretNames = (& $wrangler wrangler secret list --env production 2>$null | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Could not verify production secret names. No secret was changed.' }

$hasAccount = $secretNames -match 'CLOUDFLARE_ACCOUNT_ID'
$hasAigToken = $secretNames -match 'CLOUDFLARE_AIG_TOKEN'
$hasGoogleKey = $secretNames -match 'MODEL_API_KEY'

if (-not $directInference -and -not $hasAccount) {
  Write-Output 'Configuring account metadata as a Worker secret (value is not displayed)...'
  $accountId | & $wrangler wrangler secret put CLOUDFLARE_ACCOUNT_ID --env production 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Account ID secret configuration failed.' }
  Write-Output 'CLOUDFLARE_ACCOUNT_ID configured.'
} elseif (-not $directInference) { Write-Output 'CLOUDFLARE_ACCOUNT_ID already exists; reusing it.' }

if (-not $directInference -and -not $hasAigToken) {
  $confirmed = Read-Host 'Have you created the AI Gateway token? Type YES'
  if ($confirmed -cne 'YES') { Write-Output 'Stopped. No remote secret was changed.'; exit 1 }
  Write-Output 'Opening secure Wrangler prompt for CLOUDFLARE_AIG_TOKEN...'
  & $wrangler wrangler secret put CLOUDFLARE_AIG_TOKEN --env production
  if ($LASTEXITCODE -ne 0) { throw 'AI Gateway token configuration failed.' }
} elseif (-not $directInference) { Write-Output 'CLOUDFLARE_AIG_TOKEN already exists; reusing it.' }

if ($directInference) { Write-Output 'Direct Google OpenAI inference selected; Gateway secrets are not required for this path.' }

if (-not $hasGoogleKey) {
  Write-Output 'Opening secure Wrangler prompt for the Google AI Studio MODEL_API_KEY...'
  & $wrangler wrangler secret put MODEL_API_KEY --env production
  if ($LASTEXITCODE -ne 0) { throw 'Google API key secret configuration failed.' }
} else { Write-Output 'MODEL_API_KEY already exists; reusing it.' }
# Production AI is operator-only until public auth + billing controls are reviewed.
if ($secretNames -notmatch 'AI_ACCESS_TOKEN') {
  Write-Output 'A separate 32+ character random operator token is required for paid AI access.'
  Write-Output 'Prepare the random token in your password manager before continuing. You will need it for the protected smoke command.'
  $confirmed = Read-Host 'Type YES only when ready to enter and retain the operator token'
  if ($confirmed -cne 'YES') { Write-Output 'Operator token setup stopped. Do not deploy until it is configured.'; exit 1 }
  & $wrangler wrangler secret put AI_ACCESS_TOKEN --env production
  if ($LASTEXITCODE -ne 0) { throw 'Operator token secret configuration failed.' }
} else { Write-Output 'AI_ACCESS_TOKEN already exists; reusing it.' }

Write-Output 'Secrets configured. Run npm.cmd run production:readiness next.'
