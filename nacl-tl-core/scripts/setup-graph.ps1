<#
.SYNOPSIS
  Deterministic Neo4j graph infrastructure setup for nacl-init on native Windows (PowerShell 5.1+).

.DESCRIPTION
  Mirror of nacl-tl-core/scripts/setup-graph.sh, written so NOTHING relies on bash, git-bash,
  WSL2, `unzip`, stdin `<` redirection, or `seq`. Performs nacl-init Step 2c.3-2c.6:
    1. Copy docker-compose + schema + queries into <project>\graph-infra\ (byte-preserving).
    2. Resolve the OFFICIAL neo4j-mcp binary to a stable path via direct GitHub download +
       Expand-Archive (no npm launcher -> no download-on-start, no STDOUT banner corruption).
    3. Write .env / .env.example / .mcp.json as UTF-8 WITHOUT BOM (cypher-shell rejects a BOM),
       .mcp.json pointing directly at the resolved neo4j-mcp.exe.
    4. docker compose up, wait healthy, load schema via `docker cp` + `cypher-shell --file`.
    5. Hard 3-part gate: container healthy AND constraint count == expected AND a one-shot
       initialize+tools/list JSON-RPC handshake against the binary succeeds.

  Prints a machine-parseable result block as the LAST lines of stdout:
    NACL_GRAPH_RESULT: status=READY|FAILED
      binary=<path> health=<status> constraints_expected=<n> constraints_actual=<n>
      handshake=ok|fail failed_check=<name|none>
  Exit code 0 on READY, non-zero on FAILED.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File setup-graph.ps1 -ProjectRoot C:\proj -SkillsDir C:\proj `
    -Prefix myproj -BoltPort 3587 -HttpPort 3574
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$ProjectRoot,
  [Parameter(Mandatory=$true)][string]$SkillsDir,
  [Parameter(Mandatory=$true)][string]$Prefix,
  [Parameter(Mandatory=$true)][int]$BoltPort,
  [Parameter(Mandatory=$true)][int]$HttpPort,
  [string]$Password = "neo4j_graph_dev",
  [string]$Database = "neo4j"
)

$ErrorActionPreference = "Stop"
$Container  = "$Prefix-neo4j"
$GraphDir   = Join-Path $ProjectRoot "graph-infra"
$SchemaDir  = Join-Path $GraphDir "schema"
$BinDir     = Join-Path $env:USERPROFILE ".neo4j-mcp-bin"
$StableBin  = Join-Path $BinDir "neo4j-mcp.exe"
$CacheDir   = Join-Path $env:USERPROFILE ".cache\neo4j-mcp"

$script:Health    = "unknown"
$script:Expected  = 0
$script:Actual    = 0
$script:Handshake = "fail"
$script:FailedCheck = "none"

function Write-NoBom([string]$Path, [string]$Content) {
  [System.IO.File]::WriteAllText($Path, $Content, (New-Object System.Text.UTF8Encoding($false)))
}

function Emit-Result([string]$Status) {
  Write-Output ""
  Write-Output "NACL_GRAPH_RESULT: status=$Status"
  Write-Output ("  binary={0} health={1} constraints_expected={2} constraints_actual={3} handshake={4} failed_check={5}" -f `
    $StableBin, $script:Health, $script:Expected, $script:Actual, $script:Handshake, $script:FailedCheck)
}

function Fail([string]$Check) {
  $script:FailedCheck = $Check
  [Console]::Error.WriteLine("FAILED at: $Check")
  Emit-Result "FAILED"
  exit 1
}

# ---------------------------------------------------------------------------
# 1. Copy infra files (copy-only-if-missing, byte-preserving -> preserves no-BOM)
# ---------------------------------------------------------------------------
try {
  New-Item -ItemType Directory -Force -Path $SchemaDir, (Join-Path $GraphDir "queries"), (Join-Path $GraphDir "boards") | Out-Null
  $compose = Join-Path $GraphDir "docker-compose.yml"
  if (-not (Test-Path $compose)) { Copy-Item (Join-Path $SkillsDir "nacl-tl-core\templates\graph-docker-compose.yml") $compose }
  foreach ($s in @("ba-schema","sa-schema","tl-schema")) {
    $t = Join-Path $SchemaDir "$s.cypher"
    if (-not (Test-Path $t)) { Copy-Item (Join-Path $SkillsDir "graph-infra\schema\$s.cypher") $t }
  }
  Get-ChildItem (Join-Path $SkillsDir "graph-infra\queries\*.cypher") -ErrorAction SilentlyContinue | ForEach-Object {
    $t = Join-Path $GraphDir ("queries\" + $_.Name)
    if (-not (Test-Path $t)) { Copy-Item $_.FullName $t }
  }
} catch { Fail "copy-infra" }

# ---------------------------------------------------------------------------
# 2. Resolve the official neo4j-mcp.exe to a stable path
# ---------------------------------------------------------------------------
function Resolve-Binary {
  if (Test-Path $StableBin) { Write-Verbose "binary: reusing $StableBin"; return }
  New-Item -ItemType Directory -Force -Path $BinDir | Out-Null

  # Fast path: a previous launcher/run already extracted a cached binary.
  $cached = Get-ChildItem (Join-Path $CacheDir "neo4j-mcp-v*") -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($cached) { Copy-Item $cached.FullName $StableBin -Force; Write-Verbose "binary: from cache"; return }

  # Direct GitHub download.
  switch ($env:PROCESSOR_ARCHITECTURE) {
    "AMD64" { $arch = "x86_64" }
    "ARM64" { $arch = "arm64" }
    default { throw "Unsupported arch: $env:PROCESSOR_ARCHITECTURE" }
  }
  $asset = "neo4j-mcp_Windows_$arch.zip"

  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $rel = Invoke-RestMethod -Uri "https://api.github.com/repos/neo4j/mcp/releases/latest" `
           -Headers @{ "User-Agent" = "nacl-init" }
  $a = $rel.assets | Where-Object { $_.name -eq $asset } | Select-Object -First 1
  if (-not $a) { throw "Release asset $asset not found (available: $($rel.assets.name -join ', '))" }

  New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null
  $archive = Join-Path $CacheDir $asset
  Invoke-WebRequest -Uri $a.browser_download_url -OutFile $archive -Headers @{ "User-Agent" = "nacl-init" }

  $tmp = Join-Path $CacheDir ("extract_" + $PID)
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  Expand-Archive -Path $archive -DestinationPath $tmp -Force
  $found = Get-ChildItem $tmp -Recurse -File | Where-Object { $_.Name -in @("neo4j-mcp.exe","neo4j-mcp") } | Select-Object -First 1
  if (-not $found) { throw "Binary not found inside $asset" }
  Copy-Item $found.FullName $StableBin -Force
  Remove-Item $tmp -Recurse -Force
  Write-Verbose "binary: installed $StableBin"
}
try { Resolve-Binary } catch { [Console]::Error.WriteLine($_); Fail "resolve-binary" }
if (-not (Test-Path $StableBin)) { Fail "resolve-binary" }

# ---------------------------------------------------------------------------
# 3. Write .env / .env.example / .mcp.json (UTF-8 without BOM)
# ---------------------------------------------------------------------------
try {
  $envText = "COMPOSE_PROJECT_NAME=$Prefix-graph`nCONTAINER_PREFIX=$Prefix`nNEO4J_PASSWORD=$Password`nNEO4J_HTTP_PORT=$HttpPort`nNEO4J_BOLT_PORT=$BoltPort`n"
  $envFile = Join-Path $GraphDir ".env"
  $envEx   = Join-Path $GraphDir ".env.example"
  if (-not (Test-Path $envFile)) { Write-NoBom $envFile $envText }
  if (-not (Test-Path $envEx))   { Write-NoBom $envEx   $envText }

  $mcpPath = Join-Path $ProjectRoot ".mcp.json"
  $neo4jEntry = [ordered]@{
    type    = "stdio"
    command = $StableBin
    args    = @()
    env     = [ordered]@{
      NEO4J_URI       = "bolt://localhost:$BoltPort"
      NEO4J_USERNAME  = "neo4j"
      NEO4J_PASSWORD  = $Password
      NEO4J_DATABASE  = $Database
      NEO4J_TELEMETRY = "false"
    }
  }
  if (Test-Path $mcpPath) {
    # Merge into existing config without clobbering other MCP servers.
    $raw = [System.IO.File]::ReadAllText($mcpPath).TrimStart([char]0xFEFF)
    $existing = $raw | ConvertFrom-Json
    if (-not $existing.mcpServers) { $existing | Add-Member -NotePropertyName mcpServers -NotePropertyValue (New-Object PSObject) -Force }
    $existing.mcpServers | Add-Member -NotePropertyName neo4j -NotePropertyValue $neo4jEntry -Force
    Write-NoBom $mcpPath (($existing | ConvertTo-Json -Depth 12) + "`n")
  } else {
    $doc = [ordered]@{ mcpServers = [ordered]@{ neo4j = $neo4jEntry } }
    Write-NoBom $mcpPath (($doc | ConvertTo-Json -Depth 12) + "`n")
  }
} catch { [Console]::Error.WriteLine($_); Fail "write-config" }

# ---------------------------------------------------------------------------
# 4. Start Docker, wait healthy, load schema
# ---------------------------------------------------------------------------
# From here on, control flow is driven by explicit $LASTEXITCODE checks + Fail.
# Switch off Stop: under it, PS 5.1 turns ANY native-command stderr (docker/cypher-shell
# progress and benign "already exists" notices) into a terminating NativeCommandError.
$ErrorActionPreference = "Continue"
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Fail "docker-missing" }
Push-Location $ProjectRoot
try {
  docker compose -f graph-infra/docker-compose.yml up -d | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail "docker-up" }
} finally { Pop-Location }

for ($i = 0; $i -lt 40; $i++) {
  try { $script:Health = (docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' $Container 2>$null) } catch { $script:Health = "absent" }
  if ($script:Health -eq "healthy") { break }
  Start-Sleep -Seconds 3
}
if ($script:Health -ne "healthy") { Fail "container-health" }

foreach ($s in @("ba-schema","sa-schema","tl-schema")) {
  $src = Join-Path $SchemaDir "$s.cypher"
  # Re-write a BOM-free copy (defense-in-depth) before loading.
  $clean = Join-Path $CacheDir "$s.clean.cypher"
  New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null
  Write-NoBom $clean ([System.IO.File]::ReadAllText($src).TrimStart([char]0xFEFF))
  docker cp $clean "${Container}:/tmp/$s.cypher" | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail "schema-copy" }
  # Non-fatal: a re-run hits "constraint already exists" (schema is not IF NOT EXISTS).
  # Gate 2 (constraint count) is the authoritative verdict, so log and continue.
  # NOTE: never use 2>&1 here — under ErrorActionPreference=Stop, PS 5.1 wraps a native
  # command's stderr as a terminating NativeCommandError. 2>$null discards it safely.
  docker exec $Container cypher-shell -u neo4j -p $Password -d $Database --file "/tmp/$s.cypher" 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { [Console]::Error.WriteLine("note: $s load reported errors (continuing; gate verifies final state)") }
}

# ---------------------------------------------------------------------------
# 5. Hard 3-part gate
# ---------------------------------------------------------------------------
# gate 1: health already confirmed.

# gate 2: constraint count == expected (computed dynamically from the schema files)
$script:Expected = 0
foreach ($s in @("ba-schema","sa-schema","tl-schema")) {
  $script:Expected += ([regex]::Matches([System.IO.File]::ReadAllText((Join-Path $SchemaDir "$s.cypher")), "(?i)CREATE CONSTRAINT")).Count
}
$countOut = docker exec $Container cypher-shell -u neo4j -p $Password -d $Database --format plain `
              "SHOW CONSTRAINTS YIELD name RETURN count(name) AS c" 2>$null
$lastLine = ($countOut | Select-Object -Last 1)
$script:Actual = [int](($lastLine -replace '[^0-9]', ''))
if ($script:Expected -le 0) { Fail "constraints-expected-zero" }
if ($script:Actual -lt $script:Expected) { Fail "constraints-count" }

# gate 3: initialize + tools/list JSON-RPC handshake against the resolved binary
function Invoke-Handshake {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $StableBin
  $psi.UseShellExecute = $false
  $psi.RedirectStandardInput  = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError  = $true
  $psi.EnvironmentVariables["NEO4J_URI"]       = "bolt://localhost:$BoltPort"
  $psi.EnvironmentVariables["NEO4J_USERNAME"]  = "neo4j"
  $psi.EnvironmentVariables["NEO4J_PASSWORD"]  = $Password
  $psi.EnvironmentVariables["NEO4J_DATABASE"]  = $Database
  $psi.EnvironmentVariables["NEO4J_TELEMETRY"] = "false"
  $p = [System.Diagnostics.Process]::Start($psi)
  $init  = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"nacl-init","version":"1.0"}}}'
  $notif = '{"jsonrpc":"2.0","method":"notifications/initialized"}'
  $list  = '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
  $p.StandardInput.WriteLine($init)
  $p.StandardInput.WriteLine($notif)
  $p.StandardInput.WriteLine($list)
  $p.StandardInput.Flush()
  $p.StandardInput.Close()
  if (-not $p.WaitForExit(8000)) { try { $p.Kill() } catch {}; $p.WaitForExit(2000) | Out-Null }
  $out = $p.StandardOutput.ReadToEnd()
  return ($out -match '"tools"' -or $out -match '"result"')
}
try {
  if (Invoke-Handshake) { $script:Handshake = "ok" } else { Fail "handshake" }
} catch { [Console]::Error.WriteLine($_); Fail "handshake" }

Emit-Result "READY"
[Console]::Error.WriteLine("Graph infrastructure verified: healthy, $($script:Actual)/$($script:Expected) constraints, handshake ok.")
exit 0
