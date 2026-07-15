# connect-remote.ps1 — JOIN an already-provisioned shared graph (Windows; nacl-init mode=connect).
# Mirror of connect-remote.sh: no Docker, no schema, no graph writes — only client config +
# a READ-ONLY verify gate (connectivity + the (:Project) marker must already exist).
#
# Prints (last lines of stdout):
#   NACL_GRAPH_RESULT: status=CONNECTED|FAILED
#     project_scope=<id> handshake=ok|fail project_exists=yes|no failed_check=<name|none>
param(
  [Parameter(Mandatory)][string]$ProjectRoot,
  [Parameter(Mandatory)][string]$SkillsDir,
  [Parameter(Mandatory)][string]$Uri,
  [Parameter(Mandatory)][string]$ProjectScope,
  [Parameter(Mandatory)][string]$Id,
  [Parameter(Mandatory)][string]$Name,
  [string]$User = "neo4j",
  [string]$Password = $env:NEO4J_PASSWORD,
  [string]$Database = "neo4j"
)
. (Join-Path $SkillsDir "nacl-tl-core\scripts\lib-neo4j-mcp.ps1")

$script:Handshake = "fail"; $script:ProjectExists = "no"; $script:FailedCheck = "none"
function Emit([string]$Status) {
  Write-Output ""
  Write-Output "NACL_GRAPH_RESULT: status=$Status"
  Write-Output "  project_scope=$ProjectScope handshake=$script:Handshake project_exists=$script:ProjectExists failed_check=$script:FailedCheck"
}
function Fail([string]$Check) { $script:FailedCheck = $Check; [Console]::Error.WriteLine("FAILED at: $Check"); Emit "FAILED"; exit 1 }

try { Resolve-Neo4jMcpBin } catch { [Console]::Error.WriteLine($_); Fail "resolve-binary" }
if (-not (Test-Path $script:StableBin)) { Fail "resolve-binary" }

try {
  $out = Invoke-McpCypher -SkillsDir $SkillsDir -Uri $Uri -User $User -Password $Password -Database $Database `
    -Query "MATCH (p:Project {id:'$ProjectScope'}) RETURN count(p) AS c"
} catch { [Console]::Error.WriteLine($_); Fail "handshake" }
$script:Handshake = "ok"
if ($out -match '"c"[: ]*[1-9]') { $script:ProjectExists = "yes" }
if ($script:ProjectExists -ne "yes") {
  [Console]::Error.WriteLine("Remote graph has no project '$ProjectScope'. The first developer must run: /nacl-init --scale=create")
  Fail "project-missing"
}

$node = Get-NodeExe
& $node (Join-Path $SkillsDir "nacl-tl-core\scripts\write-mcp-config.mjs") --project-root $ProjectRoot --command $script:StableBin --uri $Uri --username $User --password $Password --database $Database | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "write-mcp" }
& $node (Join-Path $SkillsDir "nacl-tl-core\scripts\write-graph-config.mjs") --project-root $ProjectRoot --mode remote --set "neo4j_uri=`"$Uri`"" --set "neo4j_username=`"$User`"" --set "neo4j_database=`"$Database`"" --set "project_scope=`"$ProjectScope`"" | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "write-config" }
& $node (Join-Path $SkillsDir "nacl-tl-core\scripts\register-project.mjs") --id $Id --name $Name --root $ProjectRoot | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "register" }

Emit "CONNECTED"
[Console]::Error.WriteLine("Connected to existing remote project '$ProjectScope' (no Docker, no seed).")
exit 0
