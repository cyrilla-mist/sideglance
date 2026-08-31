$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$blockers = [System.Collections.Generic.List[string]]::new()

function Run-Check([string]$Label, [string]$Command) {
  & powershell.exe -NoProfile -Command $Command *> $null
  if ($LASTEXITCODE -ne 0) { $blockers.Add($Label) }
}

Run-Check 'unit tests' 'npm.cmd test'
Run-Check 'worker:typecheck' 'npm.cmd run worker:typecheck'
Run-Check 'typecheck' 'npm.cmd run typecheck'
Run-Check 'build' 'npm.cmd run build'

if (-not (Get-Command wrangler -ErrorAction SilentlyContinue)) { $blockers.Add('Wrangler is not installed') }
$config = Get-Content (Join-Path $root 'wrangler.toml') -Raw
if ($config -notmatch 'MODEL_TRANSPORT\s*=\s*"cloudflare_ai_gateway"') { $blockers.Add('Gateway transport is not configured') }
if ($config -match 'CLOUDFLARE_API_TOKEN\s*=') { $blockers.Add('token appears in tracked Wrangler config') }
if (Test-Path (Join-Path $root '.git\index')) {
  $tracked = git ls-files -- '.dev.vars' '.dev.vars.*' | Out-String
  if ($tracked.Trim()) { $blockers.Add('.dev.vars is tracked') }
}
if (-not $env:CLOUDFLARE_ACCOUNT_ID -and $config -notmatch 'CLOUDFLARE_ACCOUNT_ID\s*=') { $blockers.Add('Cloudflare account ID is not configured') }

if (Get-Command wrangler -ErrorAction SilentlyContinue) {
  $ErrorActionPreference = 'Continue'
  & wrangler whoami 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { $blockers.Add('Wrangler authentication is not confirmed') }
  & wrangler deploy --dry-run 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { $blockers.Add('Wrangler bundle dry-run failed') }
  $ErrorActionPreference = 'Stop'
}

if ($blockers.Count -eq 0) { Write-Output 'READY_FOR_DEPLOY' } elseif ($blockers -contains 'Wrangler authentication is not confirmed') { Write-Output 'READY_FOR_CLOUDFLARE_CONFIGURATION' } else { Write-Output 'BLOCKED' }
foreach ($blocker in $blockers) { Write-Output "BLOCKER: $blocker" }
