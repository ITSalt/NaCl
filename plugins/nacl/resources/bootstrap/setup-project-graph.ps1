param(
  [Parameter(Mandatory=$true)][string]$ProjectRoot,
  [Parameter(Mandatory=$true)][string]$ProjectId,
  [Parameter(Mandatory=$true)][int]$BoltPort,
  [Parameter(Mandatory=$true)][int]$HttpPort,
  [Parameter(Mandatory=$true)][string]$Confirmation,
  [string]$Database = "neo4j"
)

$ErrorActionPreference = "Stop"
function Block([string]$Code) { [Console]::Error.WriteLine("NACL_GRAPH_RESULT: status=BLOCKED code=$Code"); exit 1 }
if (-not [System.IO.Path]::IsPathRooted($ProjectRoot) -or -not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) { Block "PROJECT_ROOT_INVALID" }
$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
if ($ProjectId -notmatch '^[a-z0-9][a-z0-9_-]{2,63}$') { Block "PROJECT_ID_INVALID" }
if ($BoltPort -lt 1024 -or $BoltPort -gt 65535 -or $HttpPort -lt 1024 -or $HttpPort -gt 65535 -or $BoltPort -eq $HttpPort) { Block "PORT_INVALID" }
if ($Confirmation -ne "INIT_LOCAL_GRAPH:$ProjectId") { Block "CONFIRMATION_REQUIRED" }

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ResourceRoot = (Resolve-Path (Join-Path $ScriptDir "..")).Path
$Lib = Join-Path $ResourceRoot "nacl-tl-core\scripts\lib-neo4j-mcp.ps1"
$Guard = Join-Path $ScriptDir "codex-config-guard.mjs"
$Writer = Join-Path $ScriptDir "write-codex-mcp-config.mjs"
$LauncherSource = Join-Path $ScriptDir "project-neo4j-launcher.mjs"
$SchemaRunner = Join-Path $ScriptDir "apply-project-schema.mjs"
foreach ($required in @($Lib,$Guard,$Writer,$LauncherSource,$SchemaRunner)) { if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { Block "BUNDLE_RESOURCE_MISSING" } }
$Node = Get-Command node -ErrorAction SilentlyContinue
if (-not $Node) { Block "NODE_MISSING" }
$NodePath = $Node.Source

$GraphDir = Join-Path $ProjectRoot "graph-infra"
$SchemaDir = Join-Path $GraphDir "schema"
$QueryDir = Join-Path $GraphDir "queries"
$RuntimeDir = Join-Path $GraphDir "scripts"
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
Ensure-SafeDirectory $GraphDir
Ensure-SafeDirectory $SchemaDir
Ensure-SafeDirectory $QueryDir
Ensure-SafeDirectory (Join-Path $GraphDir "boards")
Ensure-SafeDirectory $RuntimeDir
$Compose = Join-Path $GraphDir "docker-compose.yml"
Copy-ExactOrCreate (Join-Path $ResourceRoot "nacl-tl-core\templates\graph-docker-compose.yml") $Compose "COMPOSE_CONFLICT"
foreach ($schema in @("ba-schema","sa-schema","tl-schema")) {
  $target = Join-Path $SchemaDir "$schema.cypher"
  Copy-ExactOrCreate (Join-Path $ResourceRoot "graph-infra\schema\$schema.cypher") $target "SCHEMA_CONFLICT"
}
Get-ChildItem (Join-Path $ResourceRoot "graph-infra\queries\*.cypher") -ErrorAction SilentlyContinue | ForEach-Object {
  $target = Join-Path $QueryDir $_.Name
  Copy-ExactOrCreate $_.FullName $target "QUERY_CONFLICT"
}

$ProjectLauncher = Join-Path $RuntimeDir "nacl-neo4j-mcp-launcher.mjs"
Copy-ExactOrCreate $LauncherSource $ProjectLauncher "PROJECT_LAUNCHER_CONFLICT"

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
  [System.IO.File]::WriteAllText($EnvFile, $envText, (New-Object System.Text.UTF8Encoding($false)))
}
$exampleText = "COMPOSE_PROJECT_NAME=$ProjectId-graph`nCONTAINER_PREFIX=$ProjectId`nNEO4J_PASSWORD=`nNEO4J_HTTP_PORT=$HttpPort`nNEO4J_BOLT_PORT=$BoltPort`n"
$exampleFile = Join-Path $GraphDir ".env.example"
if (Test-Path -LiteralPath $exampleFile) {
  if (-not (Test-Path -LiteralPath $exampleFile -PathType Leaf) -or [System.IO.File]::GetAttributes($exampleFile).HasFlag([System.IO.FileAttributes]::ReparsePoint)) { Block "GRAPH_EXAMPLE_UNSAFE" }
  if ([System.IO.File]::ReadAllText($exampleFile).Replace("`r`n", "`n") -ne $exampleText) { Block "GRAPH_EXAMPLE_CONFLICT" }
} else {
  [System.IO.File]::WriteAllText($exampleFile, $exampleText, (New-Object System.Text.UTF8Encoding($false)))
}
$icacls = Get-Command icacls.exe -ErrorAction SilentlyContinue
if ($icacls) {
  & $icacls.Source $EnvFile /inheritance:r /grant:r "${env:USERNAME}:(R,W)" *> $null
  if ($LASTEXITCODE -ne 0) { Block "GRAPH_ENV_PERMISSIONS_FAILED" }
}
& $NodePath $ProjectLauncher --check-only
if ($LASTEXITCODE -ne 0) { Block "GRAPH_ENV_VALIDATION_FAILED" }

if ($env:NEO4J_MCP_VERSION -eq "latest") { Block "UNPINNED_BINARY_VERSION_FORBIDDEN" }
. $Lib
$script:BinDir = Join-Path $GraphDir "bin"
$script:StableBin = Join-Path $script:BinDir "neo4j-mcp.exe"
$script:CacheDir = Join-Path $GraphDir "cache\neo4j-mcp"
$script:PinFile = Join-Path (Split-Path -Parent $Lib) "neo4j-mcp.pin"
Ensure-SafeDirectory $script:BinDir
Ensure-SafeDirectory (Join-Path $GraphDir "cache")
Ensure-SafeDirectory $script:CacheDir
$BinaryReceipt = Join-Path $script:BinDir "neo4j-mcp.sha256"
if ((Test-Path -LiteralPath $script:StableBin) -or (Test-Path -LiteralPath $BinaryReceipt)) {
  if (-not (Test-Path -LiteralPath $script:StableBin -PathType Leaf) -or -not (Test-Path -LiteralPath $BinaryReceipt -PathType Leaf)) { Block "BINARY_RECEIPT_MISMATCH" }
  if ((Get-Item -LiteralPath $script:StableBin -Force).Attributes.HasFlag([System.IO.FileAttributes]::ReparsePoint) -or (Get-Item -LiteralPath $BinaryReceipt -Force).Attributes.HasFlag([System.IO.FileAttributes]::ReparsePoint)) { Block "BINARY_RECEIPT_MISMATCH" }
  $ExpectedBinarySha = ([System.IO.File]::ReadAllText($BinaryReceipt)).Trim()
  if ($ExpectedBinarySha -notmatch '^[0-9a-f]{64}$') { Block "BINARY_RECEIPT_MISMATCH" }
  $ActualBinarySha = (Get-FileHash -LiteralPath $script:StableBin -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($ActualBinarySha -ne $ExpectedBinarySha) { Block "BINARY_RECEIPT_MISMATCH" }
} else {
  try { Resolve-Neo4jMcpBin } catch { Block "RESOLVE_BINARY_FAILED" }
  if (-not (Test-Path -LiteralPath $script:StableBin -PathType Leaf)) { Block "RESOLVE_BINARY_FAILED" }
  $ActualBinarySha = (Get-FileHash -LiteralPath $script:StableBin -Algorithm SHA256).Hash.ToLowerInvariant()
  [System.IO.File]::WriteAllText($BinaryReceipt, "$ActualBinarySha`n", (New-Object System.Text.UTF8Encoding($false)))
}
$Uri = "bolt://localhost:$BoltPort"

$GuardOutput = & $NodePath $Guard --phase preflight --project-root $ProjectRoot --node $NodePath --launcher $ProjectLauncher --binary $script:StableBin --uri $Uri --database $Database
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$GuardOutput | Write-Output
if (($GuardOutput -join "`n") -notmatch 'state=reusable') {
  & $NodePath $Writer --project-root $ProjectRoot --node $NodePath --launcher $ProjectLauncher --binary $script:StableBin --uri $Uri --database $Database
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$Ignore = Join-Path $ProjectRoot ".gitignore"
$ignoreItem = Get-Item -LiteralPath $Ignore -Force -ErrorAction SilentlyContinue
if ($ignoreItem -and ($ignoreItem.PSIsContainer -or $ignoreItem.Attributes.HasFlag([System.IO.FileAttributes]::ReparsePoint))) { Block "GITIGNORE_UNSAFE" }
$lines = if (Test-Path -LiteralPath $Ignore) { @(Get-Content -LiteralPath $Ignore) } else { @() }
foreach ($entry in @('.codex/config.toml','graph-infra/.env','graph-infra/bin/','graph-infra/cache/')) { if ($lines -notcontains $entry) { $lines += $entry } }
[System.IO.File]::WriteAllText($Ignore, (($lines -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding($false)))

$Docker = Get-Command docker.exe -ErrorAction SilentlyContinue
if (-not $Docker) { $Docker = Get-Command docker -ErrorAction SilentlyContinue }
if (-not $Docker) { Block "DOCKER_CLI_MISSING" }
& $Docker.Source info *> $null
if ($LASTEXITCODE -ne 0) { Block "DOCKER_DAEMON_DOWN" }
Push-Location $ProjectRoot
try { & $Docker.Source compose -f graph-infra/docker-compose.yml up -d | Out-Null; if ($LASTEXITCODE -ne 0) { Block "DOCKER_UP_FAILED" } } finally { Pop-Location }

$Container = "$ProjectId-neo4j"; $Health = "unknown"
for ($attempt = 0; $attempt -lt 40; $attempt++) {
  try { $Health = (& $Docker.Source inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' $Container 2>$null) } catch { $Health = "absent" }
  if ($Health -eq "healthy") { break }
  Start-Sleep -Seconds 3
}
if ($Health -ne "healthy") { Block "CONTAINER_HEALTH_FAILED" }

$previousPassword = $env:NEO4J_PASSWORD
try {
  $env:NEO4J_PASSWORD = $Password
  & $NodePath $SchemaRunner --endpoint "http://127.0.0.1:$HttpPort" --database $Database
  if ($LASTEXITCODE -ne 0) { Block "SCHEMA_GATE_FAILED" }
} finally {
  if ($null -eq $previousPassword) { Remove-Item Env:NEO4J_PASSWORD -ErrorAction SilentlyContinue } else { $env:NEO4J_PASSWORD = $previousPassword }
}

& $NodePath $Guard --phase readback --project-root $ProjectRoot --node $NodePath --launcher $ProjectLauncher --binary $script:StableBin --uri $Uri --database $Database
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Output "NACL_SKILLS_ONLY_BOOTSTRAP: status=VERIFIED project_id=$ProjectId codex_config=.codex/config.toml mcp=nacl_neo4j next=new-task"
