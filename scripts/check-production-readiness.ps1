$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$blockers = [System.Collections.Generic.List[string]]::new()

function Run-Check([string]$Label, [string]$FilePath, [string[]]$Arguments) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  & $FilePath @Arguments 2>$null | Out-Null
  $code = $LASTEXITCODE
  $ErrorActionPreference = $previous
  if ($code -ne 0) { $blockers.Add($Label) }
}

Run-Check 'unit tests' 'npm.cmd' @('test')
Run-Check 'worker:typecheck' 'npm.cmd' @('run', 'worker:typecheck')
Run-Check 'typecheck' 'npm.cmd' @('run', 'typecheck')
Run-Check 'build' 'npm.cmd' @('run', 'build')

if (-not (Test-Path (Join-Path $root 'node_modules/.bin/wrangler.ps1'))) { $blockers.Add('Wrangler is not installed') }
$config = Get-Content (Join-Path $root 'wrangler.toml') -Raw
if ($config -notmatch 'MODEL_TRANSPORT\s*=\s*"google_openai_direct"') { $blockers.Add('Direct Google OpenAI transport is not configured') }
$directInference = $config -match 'MODEL_TRANSPORT\s*=\s*"google_openai_direct"'
if ($config -match 'CLOUDFLARE_(AIG_)?API_TOKEN\s*=') { $blockers.Add('token appears in tracked Wrangler config') }
if (Test-Path (Join-Path $root '.git\index')) {
  $tracked = git ls-files -- '.dev.vars' '.dev.vars.*' | Out-String
  if ($tracked.Trim()) { $blockers.Add('.dev.vars is tracked') }
}
if (Test-Path (Join-Path $root 'node_modules/.bin/wrangler.ps1')) {
  $ErrorActionPreference = 'Continue'
  & npx.cmd wrangler whoami 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { $blockers.Add('Wrangler authentication is not confirmed') }
  $secretNames = (& npx.cmd wrangler secret list --env production 2>$null | Out-String)
  if ($LASTEXITCODE -eq 0) {
    if ($secretNames -notmatch 'MODEL_API_KEY') { $blockers.Add('MODEL_API_KEY is not configured') }
    if (-not $directInference) {
      if ($secretNames -notmatch 'CLOUDFLARE_AIG_TOKEN') { $blockers.Add('CLOUDFLARE_AIG_TOKEN is not configured') }
      if ($secretNames -notmatch 'CLOUDFLARE_ACCOUNT_ID') { $blockers.Add('CLOUDFLARE_ACCOUNT_ID is not configured') }
    }
  }
  else { $blockers.Add('Production secret names could not be verified') }
  & npx.cmd wrangler deploy --env production --dry-run 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { $blockers.Add('Wrangler bundle dry-run failed') }
  $ErrorActionPreference = 'Stop'
}

if ($blockers.Count -eq 0) { Write-Output 'READY_FOR_DEPLOY' } elseif ($blockers -contains 'Wrangler authentication is not confirmed') { Write-Output 'READY_FOR_CLOUDFLARE_CONFIGURATION' } else { Write-Output 'BLOCKED' }
foreach ($blocker in $blockers) { Write-Output "BLOCKER: $blocker" }
