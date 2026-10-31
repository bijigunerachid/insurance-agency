# Runs the disaster drill (disaster-drill.sh) on this development computer with Docker Desktop.
# It ERASES the insurance-agency volumes of this computer (drill data only), never run it on the server.
#   powershell -File deployment/rehearsal/run-drill.ps1 -Release release\insurance-agency-1.0.0
param([Parameter(Mandatory = $true)][string]$Release)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$root = (Resolve-Path (Join-Path $here '..\..')).Path
$release = (Resolve-Path $Release).Path
$work = Join-Path $env:TEMP 'insurance-agency-drill'
if (Test-Path $work) { Remove-Item -Recurse -Force $work }
New-Item -ItemType Directory -Path $work | Out-Null

$utf8 = New-Object Text.UTF8Encoding $false
foreach ($file in 'disaster-drill.sh', 'seed-agent.mjs') {
  $text = [IO.File]::ReadAllText((Join-Path $here $file)) -replace "`r`n", "`n"
  [IO.File]::WriteAllText((Join-Path $work $file), $text, $utf8)
}
Copy-Item (Join-Path $root 'backend\test\fixtures\agency-logo-synthetique.png') (Join-Path $work 'logo.png')
$password = 'Essai-Production-' + [guid]::NewGuid().ToString('N').Substring(0, 12)
[IO.File]::WriteAllText((Join-Path $work 'password.txt'), $password, $utf8)

# The same folder as Docker Desktop's engine sees it, so compose's relative paths work.
$full = (Resolve-Path $work).Path
$dockerPath = '/run/desktop/mnt/host/' + $full.Substring(0, 1).ToLower() + ($full.Substring(2) -replace '\\', '/')
# docker:27-cli, pinned by digest
$cli = 'docker@sha256:851f91d241214e7c6db86513b270d58776379aacc5eb9c4a87e5b47115e3065c'
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v "${full}:$dockerPath" -v "${full}:/drill" `
  -v "${release}:/release" $cli sh -c "apk add -q bash coreutils util-linux openssl >/dev/null && bash /drill/disaster-drill.sh $dockerPath"
if ($LASTEXITCODE -ne 0) { throw "The disaster drill FAILED (exit code $LASTEXITCODE)." }
Write-Host "Drill passed. Smoke test of the restored server:"
Write-Host "  `$env:PRODUCTION_URL='https://agence.internal:18443'; `$env:SMOKE_USERNAME='agent.essai'; `$env:SMOKE_PASSWORD='$password'"
Write-Host "  `$env:SMOKE_RESOLVE='agence.internal:127.0.0.1'; `$env:SMOKE_IGNORE_TLS='1'; npm run test:production"
