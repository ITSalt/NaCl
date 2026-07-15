# install-sidecar.ps1 — per-developer mTLS tunnel to a shared VPS graph (Windows).
# Mirror of install-sidecar.sh: writes a ghostunnel client launcher that exposes a local
# plaintext bolt://localhost:<SidecarPort> backed by an mTLS link to the VPS gateway, using
# THIS developer's client certificate (the revocable "API key").
#
#   install-sidecar.ps1 -ProjectScope SCOPE -VpsHost graph.example.com -GatewayPort 7687 `
#       -SidecarPort 3700 -Cert PATH -Key PATH -CaCert PATH [-Start] [-Autostart | -NoAutostart]
#
# Autostart is on by default: a Scheduled Task ("NaCl Sidecar <scope>") is registered so the
# tunnel survives reboot/logon without a manual relaunch. Pass -NoAutostart to keep the plain
# Start-Process behavior instead. ghostunnel is a console app, so the scheduled task runs it
# through a hidden .vbs wrapper (no visible console window).
param(
  [Parameter(Mandatory)][string]$ProjectScope,
  [Parameter(Mandatory)][string]$VpsHost,
  [Parameter(Mandatory)][int]$GatewayPort,
  [Parameter(Mandatory)][int]$SidecarPort,
  [Parameter(Mandatory)][string]$Cert,
  [Parameter(Mandatory)][string]$Key,
  [Parameter(Mandatory)][string]$CaCert,
  [switch]$Start,
  [switch]$Autostart,
  [switch]$NoAutostart
)
$ErrorActionPreference = "Stop"

$AutostartEnabled = -not $NoAutostart

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
$marker   = Join-Path $sideDir "$ProjectScope.autostart"
$vbsWrapper = Join-Path $sideDir "$ProjectScope.vbs"
$taskName = "NaCl Sidecar $ProjectScope"

$cmd = "ghostunnel client --listen `"localhost:$SidecarPort`" --target `"$VpsHost`:$GatewayPort`" --cert `"$Cert`" --key `"$Key`" --cacert `"$CaCert`" --connect-timeout 10s"
Set-Content -Path $launcher -Value "@echo off`r`n$cmd" -Encoding ASCII
[Console]::Error.WriteLine("Sidecar launcher written: $launcher")
[Console]::Error.WriteLine("  local bolt socket: bolt://localhost:$SidecarPort  ->  mTLS  ->  $VpsHost`:$GatewayPort")

if ($AutostartEnabled) {
  # ghostunnel is a console app; wrap it so the scheduled task runs it with no visible window.
  $vbsContent = "CreateObject(`"WScript.Shell`").Run `"`"`"$launcher`"`"`", 0, False"
  Set-Content -Path $vbsWrapper -Value $vbsContent -Encoding ASCII

  $action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbsWrapper`""
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
  Start-ScheduledTask -TaskName $taskName
  Set-Content -Path $marker -Value "schtasks" -Encoding ASCII
  [Console]::Error.WriteLine("Sidecar autostart installed: Scheduled Task `"$taskName`"")
  [Console]::Error.WriteLine("  it will (re)start at logon and after crashes/reboot.")

  if ($Start) {
    Start-ScheduledTask -TaskName $taskName
    [Console]::Error.WriteLine("Sidecar started.")
  } else {
    [Console]::Error.WriteLine("It will start automatically at next logon. To start it now: Start-ScheduledTask -TaskName `"$taskName`"")
  }
} else {
  if (Test-Path $marker) { Remove-Item -Path $marker -Force }
  if ($Start) {
    Start-Process -FilePath $launcher -WindowStyle Hidden
    [Console]::Error.WriteLine("Sidecar started.")
  } else {
    [Console]::Error.WriteLine("Run it with: $launcher   (or re-run with -Start)")
  }
}

Write-Output ""
Write-Output "NACL_SIDECAR_RESULT: status=READY scope=$ProjectScope listen=localhost:$SidecarPort target=$VpsHost`:$GatewayPort"
