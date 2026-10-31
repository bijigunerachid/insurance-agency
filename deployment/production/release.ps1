# Builds a release for the agency's server, on the development computer (online): the API,
# proxy and database images saved in one file, with the server scripts and the
# checksums. Copy the folder to a USB key, then run install.sh on the server (no Internet needed).
#   powershell -File deployment/production/release.ps1            version = date and time
#   powershell -File deployment/production/release.ps1 -Version 1.0.0
param(
  [string]$Version = (Get-Date -Format 'yyyy.MM.dd-HHmm'),
  # Only for a rehearsal: a real release is built from committed code.
  [switch]$AllowUncommitted
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

function Invoke-Native([string]$what) {
  if ($LASTEXITCODE -ne 0) { throw "$what failed (exit code $LASTEXITCODE)." }
}

if ($Version -notmatch '^[0-9A-Za-z][0-9A-Za-z.\-]{0,40}$') { throw 'Version: letters, digits, dot and dash only.' }
$changes = git -C $root status --porcelain
if ($changes -and -not $AllowUncommitted) {
  throw 'Uncommitted changes: commit them first (a release is built from committed code).'
}
$commit = (git -C $root rev-parse --short HEAD).Trim()

docker build -f "$root\deployment\production\api.Dockerfile" -t "insurance-agency-api:$Version" $root
Invoke-Native 'Building the API image'
docker build -f "$root\deployment\production\proxy.Dockerfile" -t "insurance-agency-proxy:$Version" $root
Invoke-Native 'Building the proxy image'
docker build -f "$root\deployment\production\db.Dockerfile" -t "insurance-agency-db:$Version" $root
Invoke-Native 'Building the database image'

$out = Join-Path $root "release\insurance-agency-$Version"
if (Test-Path $out) { throw "$out exists already: choose another version." }
New-Item -ItemType Directory -Path $out | Out-Null
docker save -o (Join-Path $out 'images.tar') "insurance-agency-api:$Version" "insurance-agency-proxy:$Version" "insurance-agency-db:$Version"
Invoke-Native 'Saving the images'

$production = Join-Path $root 'deployment\production'
foreach ($file in 'compose.yml', '.env.example', '.env.api.example', '.env.admin.example',
  'install.sh', 'firewall.sh', 'export-root-ca.sh', 'backup.sh') {
  # Shell scripts and settings keep Unix line endings for the Linux server.
  $text = [IO.File]::ReadAllText((Join-Path $production $file)) -replace "`r`n", "`n"
  [IO.File]::WriteAllText((Join-Path $out $file), $text, (New-Object Text.UTF8Encoding $false))
}
[IO.File]::WriteAllText((Join-Path $out 'VERSION'), "$Version`ncommit $commit`n", (New-Object Text.UTF8Encoding $false))

# sha256sum format, checked by install.sh before anything is loaded.
$sums = Get-ChildItem $out -File | Where-Object Name -ne 'SHA256SUMS' | Sort-Object Name | ForEach-Object {
  '{0}  {1}' -f (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower(), $_.Name
}
[IO.File]::WriteAllText((Join-Path $out 'SHA256SUMS'), (($sums -join "`n") + "`n"), (New-Object Text.UTF8Encoding $false))

$size = [math]::Round((Get-Item (Join-Path $out 'images.tar')).Length / 1MB)
Write-Host "Release $Version (commit $commit) ready in $out ($size MB). Copy the folder to the USB key."
