# lib-neo4j-mcp.ps1 — shared helpers for the REMOTE graph paths on Windows (connect/create).
#
# Dot-sourced by connect-remote.ps1 / create-remote.ps1. Provides Resolve-Neo4jMcpBin and
# Invoke-McpCypher (runs a query through the neo4j-mcp binary via mcp-cypher.mjs — no Docker,
# no cypher-shell). Mirrors lib-neo4j-mcp.sh. Keep the resolver behaviour identical to
# setup-graph.ps1's Resolve-Binary (deduplication is a tracked follow-up, not done here to
# avoid destabilising the tested local path).

$script:BinDir    = Join-Path $env:USERPROFILE ".neo4j-mcp-bin"
$script:StableBin = Join-Path $script:BinDir "neo4j-mcp.exe"
$script:CacheDir  = Join-Path $env:USERPROFILE ".cache\neo4j-mcp"

function Resolve-Neo4jMcpBin {
  if (Test-Path $script:StableBin) { Write-Verbose "binary: reusing $script:StableBin"; return }
  New-Item -ItemType Directory -Force -Path $script:BinDir | Out-Null

  $cached = Get-ChildItem (Join-Path $script:CacheDir "neo4j-mcp-v*") -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($cached) { Copy-Item $cached.FullName $script:StableBin -Force; return }

  switch ($env:PROCESSOR_ARCHITECTURE) {
    "AMD64" { $arch = "x86_64" }
    "ARM64" { $arch = "arm64" }
    default { throw "Unsupported arch: $env:PROCESSOR_ARCHITECTURE" }
  }
  $asset = "neo4j-mcp_Windows_$arch.zip"
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $rel = Invoke-RestMethod -Uri "https://api.github.com/repos/neo4j/mcp/releases/latest" -Headers @{ "User-Agent" = "nacl-init" }
  $a = $rel.assets | Where-Object { $_.name -eq $asset } | Select-Object -First 1
  if (-not $a) { throw "Release asset $asset not found" }
  New-Item -ItemType Directory -Force -Path $script:CacheDir | Out-Null
  $archive = Join-Path $script:CacheDir $asset
  Invoke-WebRequest -Uri $a.browser_download_url -OutFile $archive -Headers @{ "User-Agent" = "nacl-init" }
  $tmp = Join-Path $script:CacheDir ("extract_" + $PID)
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  Expand-Archive -Path $archive -DestinationPath $tmp -Force
  $found = Get-ChildItem $tmp -Recurse -File | Where-Object { $_.Name -in @("neo4j-mcp.exe","neo4j-mcp") } | Select-Object -First 1
  if (-not $found) { throw "Binary not found inside $asset" }
  Copy-Item $found.FullName $script:StableBin -Force
  Remove-Item $tmp -Recurse -Force
}

function Get-NodeExe {
  $n = Get-Command node -ErrorAction SilentlyContinue
  if (-not $n) { $n = Get-Command nodejs -ErrorAction SilentlyContinue }
  if (-not $n) { throw "node not found (required for mcp-cypher.mjs)" }
  return $n.Source
}

# Invoke-McpCypher -SkillsDir .. -Uri .. -User .. -Password .. -Database .. -Query .. [-Write]
# Returns the raw stdout (JSON rows + sentinel). Throws on non-zero exit.
function Invoke-McpCypher {
  param(
    [Parameter(Mandatory)][string]$SkillsDir,
    [Parameter(Mandatory)][string]$Uri,
    [string]$User = "neo4j",
    [string]$Password = "",
    [string]$Database = "neo4j",
    [Parameter(Mandatory)][string]$Query,
    [switch]$Write
  )
  $node = Get-NodeExe
  $script = Join-Path $SkillsDir "nacl-tl-core\scripts\mcp-cypher.mjs"
  $args = @($script, "--binary", $script:StableBin, "--uri", $Uri, "--user", $User,
            "--password", $Password, "--database", $Database, "--query", $Query)
  if ($Write) { $args += "--write" }
  $out = & $node @args 2>$null
  if ($LASTEXITCODE -ne 0) { throw "mcp-cypher failed (exit $LASTEXITCODE)" }
  return ($out -join "`n")
}
