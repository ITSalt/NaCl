param(
  [Parameter(Mandatory=$true)][string]$ProjectRoot,
  [Parameter(Mandatory=$true)][string]$ProjectId,
  [Parameter(Mandatory=$true)][int]$BoltPort,
  [Parameter(Mandatory=$true)][int]$HttpPort,
  [Parameter(Mandatory=$true)][string]$Confirmation,
  [string]$Database = "neo4j"
)

$ErrorActionPreference = "Stop"
$script:MutationStarted = $false
function Block([string]$Code) {
  if ($script:MutationStarted) {
    $failure = New-Object System.Exception($Code)
    $failure.Data["NaclCode"] = $Code
    throw $failure
  }
  [Console]::Error.WriteLine("NACL_GRAPH_RESULT: status=BLOCKED code=$Code")
  exit 1
}
if (-not [System.IO.Path]::IsPathRooted($ProjectRoot) -or -not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) { Block "PROJECT_ROOT_INVALID" }
$ProjectRootInput = $ProjectRoot
$ProjectRootItem = Get-Item -LiteralPath $ProjectRootInput -Force
$ProjectRootCursor = $ProjectRootItem
while ($null -ne $ProjectRootCursor) {
  if ($ProjectRootCursor.Attributes.HasFlag([System.IO.FileAttributes]::ReparsePoint)) { Block "PROJECT_ROOT_NOT_CANONICAL" }
  $ProjectRootCursor = $ProjectRootCursor.Parent
}
$ProjectRootCanonical = (Resolve-Path -LiteralPath $ProjectRootInput).Path
if (-not [string]::Equals($ProjectRootInput, $ProjectRootCanonical, [System.StringComparison]::OrdinalIgnoreCase)) { Block "PROJECT_ROOT_NOT_CANONICAL" }
$ProjectRoot = $ProjectRootCanonical
if ($ProjectId -notmatch '^[a-z0-9][a-z0-9_-]{2,63}$') { Block "PROJECT_ID_INVALID" }
if ($BoltPort -lt 1024 -or $BoltPort -gt 65535 -or $HttpPort -lt 1024 -or $HttpPort -gt 65535 -or $BoltPort -eq $HttpPort) { Block "PORT_INVALID" }
$ConfirmationPrefix = "INIT_LOCAL_GRAPH:${ProjectId}:"
if (-not $Confirmation.StartsWith($ConfirmationPrefix, [System.StringComparison]::Ordinal)) { Block "CONFIRMATION_REQUIRED" }
$ConfirmationHash = $Confirmation.Substring($ConfirmationPrefix.Length)
if ($ConfirmationHash -notmatch '^[0-9a-f]{64}$') { Block "CONFIRMATION_REQUIRED" }

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ResourceRoot = (Resolve-Path (Join-Path $ScriptDir "..")).Path
$Guard = Join-Path $ScriptDir "codex-config-guard.mjs"
$Writer = Join-Path $ScriptDir "write-codex-mcp-config.mjs"
$LauncherSource = Join-Path $ScriptDir "project-neo4j-launcher.mjs"
$SupplySource = Join-Path $ScriptDir "neo4j-mcp-supply.mjs"
$PinSource = Join-Path $ScriptDir "neo4j-mcp-release.pin"
$SchemaRunner = Join-Path $ScriptDir "apply-project-schema.mjs"
$Preflight = Join-Path $ScriptDir "preflight-project-graph.mjs"
$BinaryInstaller = Join-Path $ScriptDir "install-pinned-neo4j-mcp.mjs"
$RollbackRunner = Join-Path $ScriptDir "rollback-project-bootstrap.mjs"
$PlanRunner = Join-Path $ScriptDir "plan-project-graph.mjs"
$ProtectedEnvHelper = Join-Path $ScriptDir "protected-env.ps1"
foreach ($required in @($Guard,$Writer,$LauncherSource,$SupplySource,$PinSource,$SchemaRunner,$Preflight,$BinaryInstaller,$RollbackRunner,$PlanRunner,$ProtectedEnvHelper,(Join-Path $ScriptDir "graph-docker-compose.yml"))) { if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { Block "BUNDLE_RESOURCE_MISSING" } }
$Node = Get-Command node -ErrorAction SilentlyContinue
if (-not $Node) { Block "NODE_MISSING" }
$NodePath = ((& $Node.Source -p "process.execPath") | Select-Object -First 1).Trim()
if (-not [System.IO.Path]::IsPathRooted($NodePath) -or -not (Test-Path -LiteralPath $NodePath -PathType Leaf)) { Block "NODE_MISSING" }
$Icacls = Get-Command icacls.exe -ErrorAction SilentlyContinue
if (-not $Icacls) { Block "WINDOWS_ACL_TOOL_MISSING" }
. $ProtectedEnvHelper

$GraphDir = Join-Path $ProjectRoot "graph-infra"
$SchemaDir = Join-Path $GraphDir "schema"
$QueryDir = Join-Path $GraphDir "queries"
$RuntimeDir = Join-Path $GraphDir "scripts"
$ProjectLauncher = Join-Path $RuntimeDir "nacl-neo4j-mcp-launcher.mjs"
$ProjectSupply = Join-Path $RuntimeDir "neo4j-mcp-supply.mjs"
$ProjectPin = Join-Path $RuntimeDir "neo4j-mcp-release.pin"
$StableBin = Join-Path (Join-Path $GraphDir "bin") "neo4j-mcp.exe"
$Uri = "bolt://localhost:$BoltPort"
& $NodePath $Preflight --project-root $ProjectRoot --project-id $ProjectId --bolt-port $BoltPort --http-port $HttpPort --node $NodePath --launcher $ProjectLauncher --binary $StableBin --uri $Uri --database $Database
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$Docker = Get-Command docker.exe -ErrorAction SilentlyContinue
if (-not $Docker) { $Docker = Get-Command docker -ErrorAction SilentlyContinue }
if (-not $Docker) { Block "DOCKER_CLI_MISSING" }
& $Docker.Source info *> $null
if ($LASTEXITCODE -ne 0) { Block "DOCKER_DAEMON_DOWN" }
function Test-DockerResource([string[]]$Arguments) {
  & $Docker.Source @Arguments *> $null
  return $LASTEXITCODE -eq 0
}
$Container = "$ProjectId-neo4j"
$DataVolume = "$ProjectId-neo4j-data"
$LogVolume = "$ProjectId-neo4j-logs"
$Network = "$ProjectId-net"
$ContainerState = if (Test-DockerResource @("inspect",$Container)) { "preexisting" } else { "absent" }
$DataState = if (Test-DockerResource @("volume","inspect",$DataVolume)) { "preexisting" } else { "absent" }
$LogState = if (Test-DockerResource @("volume","inspect",$LogVolume)) { "preexisting" } else { "absent" }
$NetworkState = if (Test-DockerResource @("network","inspect",$Network)) { "preexisting" } else { "absent" }
$GraphState = if (Test-Path -LiteralPath $GraphDir) { "preexisting" } else { "absent" }
if ($GraphState -eq "absent" -and @($ContainerState,$DataState,$LogState,$NetworkState) -contains "preexisting") { Block "DOCKER_RESOURCE_CONFLICT" }

& $NodePath $PlanRunner --project-root $ProjectRoot --project-id $ProjectId --bolt-port $BoltPort --http-port $HttpPort --database $Database --verify-token $Confirmation
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$TransactionDir = Join-Path ([System.IO.Path]::GetTempPath()) ("nacl-graph-transaction-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $TransactionDir | Out-Null
$ConfigBackup = Join-Path $TransactionDir "config.toml"
$GitignoreBackup = Join-Path $TransactionDir "gitignore"
$ConfigDirState = if (Test-Path -LiteralPath (Join-Path $ProjectRoot ".codex") -PathType Container) { "preexisting" } else { "absent" }
$ConfigState = if (Test-Path -LiteralPath (Join-Path $ProjectRoot ".codex\config.toml") -PathType Leaf) { Copy-Item -LiteralPath (Join-Path $ProjectRoot ".codex\config.toml") -Destination $ConfigBackup; "preexisting" } else { "absent" }
$GitignoreState = if (Test-Path -LiteralPath (Join-Path $ProjectRoot ".gitignore") -PathType Leaf) { Copy-Item -LiteralPath (Join-Path $ProjectRoot ".gitignore") -Destination $GitignoreBackup; "preexisting" } else { "absent" }
$script:MutationStarted = $true

function Ensure-SafeDirectory([string]$Path) {
  $item = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
  if ($item) {
    if (-not $item.PSIsContainer -or $item.Attributes.HasFlag([System.IO.FileAttributes]::ReparsePoint)) { Block "DIRECTORY_UNSAFE" }
  } else { New-Item -ItemType Directory -Path $Path | Out-Null }
}
function Copy-ExactOrCreate([string]$Source,[string]$Target,[string]$ConflictCode) {
  $item = Get-Item -LiteralPath $Target -Force -ErrorAction SilentlyContinue
  if ($item) {
    if ($item.PSIsContainer -or $item.Attributes.HasFlag([System.IO.FileAttributes]::ReparsePoint)) { Block $ConflictCode }
    if ((Get-FileHash -LiteralPath $Target -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $Source -Algorithm SHA256).Hash) { Block $ConflictCode }
  } else { Copy-Item -LiteralPath $Source -Destination $Target }
}
try {
$Ignore = Join-Path $ProjectRoot ".gitignore"
$ignoreItem = Get-Item -LiteralPath $Ignore -Force -ErrorAction SilentlyContinue
if ($ignoreItem -and ($ignoreItem.PSIsContainer -or $ignoreItem.Attributes.HasFlag([System.IO.FileAttributes]::ReparsePoint))) { Block "GITIGNORE_UNSAFE" }
$lines = if (Test-Path -LiteralPath $Ignore) { @(Get-Content -LiteralPath $Ignore) } else { @() }
foreach ($entry in @('.codex/config.toml','graph-infra/.env','graph-infra/bin/')) { if ($lines -notcontains $entry) { $lines += $entry } }
[System.IO.File]::WriteAllText($Ignore, (($lines -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding($false)))

Ensure-SafeDirectory $GraphDir
Ensure-SafeDirectory $SchemaDir
Ensure-SafeDirectory $QueryDir
Ensure-SafeDirectory (Join-Path $GraphDir "boards")
Ensure-SafeDirectory $RuntimeDir
$Compose = Join-Path $GraphDir "docker-compose.yml"
Copy-ExactOrCreate (Join-Path $ScriptDir "graph-docker-compose.yml") $Compose "COMPOSE_CONFLICT"
foreach ($schema in @("ba-schema","sa-schema","tl-schema")) {
  $target = Join-Path $SchemaDir "$schema.cypher"
  Copy-ExactOrCreate (Join-Path $ResourceRoot "graph-infra\schema\$schema.cypher") $target "SCHEMA_CONFLICT"
}
Get-ChildItem (Join-Path $ResourceRoot "graph-infra\queries\*.cypher") -ErrorAction SilentlyContinue | ForEach-Object {
  $target = Join-Path $QueryDir $_.Name
  Copy-ExactOrCreate $_.FullName $target "QUERY_CONFLICT"
}

Copy-ExactOrCreate $LauncherSource $ProjectLauncher "PROJECT_LAUNCHER_CONFLICT"
Copy-ExactOrCreate $SupplySource $ProjectSupply "PROJECT_SUPPLY_VERIFIER_CONFLICT"
Copy-ExactOrCreate $PinSource $ProjectPin "PROJECT_RELEASE_PIN_CONFLICT"

$EnvFile = Join-Path $GraphDir ".env"
$envItem = Get-Item -LiteralPath $EnvFile -Force -ErrorAction SilentlyContinue
if ($envItem) {
  if ($envItem.PSIsContainer -or $envItem.Attributes.HasFlag([System.IO.FileAttributes]::ReparsePoint)) { Block "GRAPH_ENV_UNSAFE" }
  $values = @{}
  foreach ($line in Get-Content -LiteralPath $EnvFile) { if ($line -match '^([^=]+)=(.*)$') { $values[$Matches[1]] = $Matches[2] } }
  if ($values.CONTAINER_PREFIX -ne $ProjectId -or [int]$values.NEO4J_BOLT_PORT -ne $BoltPort -or [int]$values.NEO4J_HTTP_PORT -ne $HttpPort) { Block "GRAPH_ENV_CONFLICT" }
  $Password = $values.NEO4J_PASSWORD
  if ([string]::IsNullOrWhiteSpace($Password) -or $Password.Length -lt 32) { Block "GRAPH_SECRET_INVALID" }
} else {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $Password = -join ($bytes | ForEach-Object { $_.ToString("x2") })
  $envText = "COMPOSE_PROJECT_NAME=$ProjectId-graph`nCONTAINER_PREFIX=$ProjectId`nNEO4J_PASSWORD=$Password`nNEO4J_HTTP_PORT=$HttpPort`nNEO4J_BOLT_PORT=$BoltPort`n"
  try { Write-ProtectedEnv -Target $EnvFile -Content $envText -IcaclsPath $Icacls.Source } catch { Block $_.Exception.Message }
}
$exampleText = "COMPOSE_PROJECT_NAME=$ProjectId-graph`nCONTAINER_PREFIX=$ProjectId`nNEO4J_PASSWORD=`nNEO4J_HTTP_PORT=$HttpPort`nNEO4J_BOLT_PORT=$BoltPort`n"
$exampleFile = Join-Path $GraphDir ".env.example"
if (Test-Path -LiteralPath $exampleFile) {
  if (-not (Test-Path -LiteralPath $exampleFile -PathType Leaf) -or [System.IO.File]::GetAttributes($exampleFile).HasFlag([System.IO.FileAttributes]::ReparsePoint)) { Block "GRAPH_EXAMPLE_UNSAFE" }
  if ([System.IO.File]::ReadAllText($exampleFile).Replace("`r`n", "`n") -ne $exampleText) { Block "GRAPH_EXAMPLE_CONFLICT" }
} else {
  [System.IO.File]::WriteAllText($exampleFile, $exampleText, (New-Object System.Text.UTF8Encoding($false)))
}
try { Assert-ProtectedEnvAcl -Path $EnvFile -IcaclsPath $Icacls.Source } catch { Block $_.Exception.Message }
& $NodePath $ProjectLauncher --check-only
if ($LASTEXITCODE -ne 0) { Block "GRAPH_ENV_VALIDATION_FAILED" }
if ($env:CODEX_BUILDER_TEST_MODE -eq "1" -and $env:NACL_SKILLS_ONLY_FAILURE_INJECTION -eq "after-files") { Block "INJECTED_AFTER_FILES" }

& $NodePath $BinaryInstaller --project-root $ProjectRoot
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $StableBin -PathType Leaf)) { Block "BINARY_READBACK_FAILED" }

$GuardOutput = & $NodePath $Guard --phase preflight --project-root $ProjectRoot --node $NodePath --launcher $ProjectLauncher --binary $StableBin --uri $Uri --database $Database
if ($LASTEXITCODE -ne 0) { Block "CODEX_CONFIG_PREFLIGHT_FAILED" }
$GuardOutput | Write-Output
if (($GuardOutput -join "`n") -notmatch 'state=reusable') {
  & $NodePath $Writer --project-root $ProjectRoot --node $NodePath --launcher $ProjectLauncher --binary $StableBin --uri $Uri --database $Database
  if ($LASTEXITCODE -ne 0) { Block "CODEX_CONFIG_WRITE_FAILED" }
}
Push-Location $ProjectRoot
try { & $Docker.Source compose -f graph-infra/docker-compose.yml up -d | Out-Null; if ($LASTEXITCODE -ne 0) { Block "DOCKER_UP_FAILED" } } finally { Pop-Location }

$Health = "unknown"
for ($attempt = 0; $attempt -lt 40; $attempt++) {
  try { $Health = (& $Docker.Source inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' $Container 2>$null) } catch { $Health = "absent" }
  if ($Health -eq "healthy") { break }
  Start-Sleep -Seconds 3
}
if ($Health -ne "healthy") { Block "CONTAINER_HEALTH_FAILED" }
$ApocDigestOutput = (& $Docker.Source exec $Container sha256sum /var/lib/neo4j/plugins/apoc.jar 2>$null) -join "`n"
if ($LASTEXITCODE -ne 0 -or $ApocDigestOutput -notmatch '^39092c89df1cb80f4f3d8799821e74c7f1d10503f92625be32882b70b13002fa\s') { Block "APOC_SUPPLY_VERIFICATION_FAILED" }
Write-Output "NACL_APOC_SUPPLY: status=VERIFIED version=5.24.2 digest=39092c89df1cb80f4f3d8799821e74c7f1d10503f92625be32882b70b13002fa source=pinned-image"

$previousPassword = $env:NEO4J_PASSWORD
try {
  $env:NEO4J_PASSWORD = $Password
  & $NodePath $SchemaRunner --endpoint "http://127.0.0.1:$HttpPort" --database $Database
  if ($LASTEXITCODE -ne 0) { Block "SCHEMA_GATE_FAILED" }
} finally {
  if ($null -eq $previousPassword) { Remove-Item Env:NEO4J_PASSWORD -ErrorAction SilentlyContinue } else { $env:NEO4J_PASSWORD = $previousPassword }
}

& $NodePath $Guard --phase readback --project-root $ProjectRoot --node $NodePath --launcher $ProjectLauncher --binary $StableBin --uri $Uri --database $Database
if ($LASTEXITCODE -ne 0) { Block "CONFIG_READBACK_FAILED" }
$script:MutationStarted = $false
Write-Output "NACL_SKILLS_ONLY_BOOTSTRAP: status=PARTIALLY_VERIFIED code=RESTART_REQUIRED bootstrap=VERIFIED initialization=NOT_RUN project_id=$ProjectId codex_config=.codex/config.toml mcp=nacl_neo4j next=new-task"
} catch {
  $code = if ($_.Exception.Data["NaclCode"]) { [string]$_.Exception.Data["NaclCode"] } else { "UNEXPECTED_BOOTSTRAP_FAILURE" }
  $rollbackOk = $true
  if ($ContainerState -eq "absent" -and (Test-DockerResource @("inspect",$Container))) { & $Docker.Source rm -f $Container *> $null; if ($LASTEXITCODE -ne 0) { $rollbackOk = $false } }
  if ($NetworkState -eq "absent" -and (Test-DockerResource @("network","inspect",$Network))) { & $Docker.Source network rm $Network *> $null; if ($LASTEXITCODE -ne 0) { $rollbackOk = $false } }
  if ($DataState -eq "absent" -and (Test-DockerResource @("volume","inspect",$DataVolume))) { & $Docker.Source volume rm $DataVolume *> $null; if ($LASTEXITCODE -ne 0) { $rollbackOk = $false } }
  if ($LogState -eq "absent" -and (Test-DockerResource @("volume","inspect",$LogVolume))) { & $Docker.Source volume rm $LogVolume *> $null; if ($LASTEXITCODE -ne 0) { $rollbackOk = $false } }
  & $NodePath $RollbackRunner --project-root $ProjectRoot --graph-state $GraphState --config-state $ConfigState --config-dir-state $ConfigDirState --config-backup $ConfigBackup --gitignore-state $GitignoreState --gitignore-backup $GitignoreBackup
  if ($LASTEXITCODE -ne 0) { $rollbackOk = $false }
  if (-not $rollbackOk) {
    [Console]::Error.WriteLine("NACL_GRAPH_RESULT: status=PARTIALLY_VERIFIED code=$code rollback=INCOMPLETE inventory=manual-review-required")
  } elseif (($DataState -eq "preexisting" -or $LogState -eq "preexisting") -and $code -in @("SCHEMA_GATE_FAILED","CONFIG_READBACK_FAILED")) {
    [Console]::Error.WriteLine("NACL_GRAPH_RESULT: status=PARTIALLY_VERIFIED code=$code rollback=BEST_EFFORT removed=new-resources preserved=preexisting-volumes,image-cache")
  } else {
    [Console]::Error.WriteLine("NACL_GRAPH_RESULT: status=FAILED code=$code rollback=VERIFIED removed=new-resources preserved=preexisting-resources,image-cache")
  }
  exit 1
} finally {
  $script:MutationStarted = $false
  if (Test-Path -LiteralPath $TransactionDir) { Remove-Item -LiteralPath $TransactionDir -Recurse -Force -ErrorAction SilentlyContinue }
}
