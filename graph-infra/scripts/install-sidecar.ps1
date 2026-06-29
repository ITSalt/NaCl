# install-sidecar.ps1 — per-developer mTLS tunnel to a shared VPS graph (Windows).
# Mirror of install-sidecar.sh: writes a ghostunnel client launcher that exposes a local
# plaintext bolt://localhost:<SidecarPort> backed by an mTLS link to the VPS gateway, using
# THIS developer's client certificate (the revocable "API key").
#
#   install-sidecar.ps1 -ProjectScope SCOPE -VpsHost graph.example.com -GatewayPort 7687 `
#       -SidecarPort 3700 -Cert PATH -Key PATH -CaCert PATH [-Start]
param(
  [Parameter(Mandatory)][string]$ProjectScope,
  [Parameter(Mandatory)][string]$VpsHost,
  [Parameter(Mandatory)][int]$GatewayPort,
  [Parameter(Mandatory)][int]$SidecarPort,
  [Parameter(Mandatory)][string]$Cert,
  [Parameter(Mandatory)][string]$Key,
  [Parameter(Mandatory)][string]$CaCert,
  [switch]$Start
)
$ErrorActionPreference = "Stop"

function Expand-Tilde([string]$p) { if ($p.StartsWith("~/")) { return (Join-Path $env:USERPROFILE $p.Substring(2)) } return $p }
$Cert = Expand-Tilde $Cert; $Key = Expand-Tilde $Key; $CaCert = Expand-Tilde $CaCert
foreach ($f in @($Cert, $Key, $CaCert)) {
  if (-not (Test-Path $f)) { [Console]::Error.WriteLine("ERROR: certificate file not found: $f"); exit 1 }
}
if (-not (Get-Command ghostunnel -ErrorAction SilentlyContinue)) {
  [Console]::Error.WriteLine("ERROR: 'ghostunnel' is not installed. Get a release binary from https://github.com/ghostunnel/ghostunnel/releases and put it on PATH.")
  exit 1
}

$naclHome = if ($env:NACL_HOME) { $env:NACL_HOME } else { Join-Path $env:USERPROFILE ".nacl" }
$sideDir  = Join-Path $naclHome "sidecar"
New-Item -ItemType Directory -Force -Path $sideDir | Out-Null
$launcher = Join-Path $sideDir "$ProjectScope.cmd"

$cmd = "ghostunnel client --listen `"localhost:$SidecarPort`" --target `"$VpsHost`:$GatewayPort`" --cert `"$Cert`" --key `"$Key`" --cacert `"$CaCert`" --connect-timeout 10s"
Set-Content -Path $launcher -Value "@echo off`r`n$cmd" -Encoding ASCII
[Console]::Error.WriteLine("Sidecar launcher written: $launcher")
[Console]::Error.WriteLine("  local bolt socket: bolt://localhost:$SidecarPort  ->  mTLS  ->  $VpsHost`:$GatewayPort")

if ($Start) {
  Start-Process -FilePath $launcher -WindowStyle Hidden
  [Console]::Error.WriteLine("Sidecar started.")
} else {
  [Console]::Error.WriteLine("Run it with: $launcher   (or re-run with -Start)")
}

Write-Output ""
Write-Output "NACL_SIDECAR_RESULT: status=READY scope=$ProjectScope listen=localhost:$SidecarPort target=$VpsHost`:$GatewayPort"
