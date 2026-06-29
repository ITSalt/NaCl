# create-remote.ps1 — PROVISION a shared project inside a running VPS graph (Windows; mode=create).
# Mirror of create-remote.sh: idempotent MERGE of the (:Project) marker (schema is loaded
# VPS-side by provision-vps), then client config + register. Re-running is a safe no-op.
#
# Prints (last lines of stdout):
#   NACL_GRAPH_RESULT: status=READY|FAILED
#     project_scope=<id> handshake=ok|fail seeded=yes|no failed_check=<name|none>
param(
  [Parameter(Mandatory)][string]$ProjectRoot,
  [Parameter(Mandatory)][string]$SkillsDir,
  [Parameter(Mandatory)][string]$Uri,
  [Parameter(Mandatory)][string]$ProjectScope,
  [Parameter(Mandatory)][string]$Id,
  [Parameter(Mandatory)][string]$Name,
  [string]$DeveloperId = "",
  [string]$User = "neo4j",
  [string]$Password = $env:NEO4J_PASSWORD,
  [string]$Database = "neo4j"
)
. (Join-Path $SkillsDir "nacl-tl-core\scripts\lib-neo4j-mcp.ps1")

if (-not $DeveloperId) {
  $DeveloperId = (git -C $ProjectRoot config user.email 2>$null)
  if (-not $DeveloperId) { $DeveloperId = "$env:USERNAME@$env:COMPUTERNAME" }
}

$script:Handshake = "fail"; $script:Seeded = "no"; $script:FailedCheck = "none"
function Emit([string]$Status) {
  Write-Output ""
  Write-Output "NACL_GRAPH_RESULT: status=$Status"
  Write-Output "  project_scope=$ProjectScope handshake=$script:Handshake seeded=$script:Seeded failed_check=$script:FailedCheck"
}
function Fail([string]$Check) { $script:FailedCheck = $Check; [Console]::Error.WriteLine("FAILED at: $Check"); Emit "FAILED"; exit 1 }

try { Resolve-Neo4jMcpBin } catch { [Console]::Error.WriteLine($_); Fail "resolve-binary" }
if (-not (Test-Path $script:StableBin)) { Fail "resolve-binary" }

try {
  Invoke-McpCypher -SkillsDir $SkillsDir -Uri $Uri -User $User -Password $Password -Database $Database -Write `
    -Query "MERGE (p:Project {id:'$ProjectScope'}) ON CREATE SET p.created_by='$DeveloperId', p.created_at=datetime() SET p.updated_by='$DeveloperId', p.updated_at=datetime() RETURN p.id AS id" | Out-Null
} catch { [Console]::Error.WriteLine($_); Fail "seed-marker" }
$script:Handshake = "ok"

try {
  $out = Invoke-McpCypher -SkillsDir $SkillsDir -Uri $Uri -User $User -Password $Password -Database $Database `
    -Query "MATCH (p:Project {id:'$ProjectScope'}) RETURN count(p) AS c"
} catch { [Console]::Error.WriteLine($_); Fail "verify" }
if ($out -match '"c"[: ]*[1-9]') { $script:Seeded = "yes" }
if ($script:Seeded -ne "yes") { Fail "verify" }

$node = Get-NodeExe
& $node (Join-Path $SkillsDir "nacl-tl-core\scripts\write-mcp-config.mjs") --project-root $ProjectRoot --command $script:StableBin --uri $Uri --username $User --password $Password --database $Database | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "write-mcp" }
& $node (Join-Path $SkillsDir "nacl-tl-core\scripts\write-graph-config.mjs") --project-root $ProjectRoot --mode remote --set "neo4j_uri=`"$Uri`"" --set "neo4j_username=`"$User`"" --set "neo4j_database=`"$Database`"" --set "project_scope=`"$ProjectScope`"" | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "write-config" }
& $node (Join-Path $SkillsDir "nacl-tl-core\scripts\register-project.mjs") --id $Id --name $Name --root $ProjectRoot | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "register" }

Emit "READY"
[Console]::Error.WriteLine("Provisioned remote project '$ProjectScope' (marker seeded; schema is loaded VPS-side).")
exit 0
