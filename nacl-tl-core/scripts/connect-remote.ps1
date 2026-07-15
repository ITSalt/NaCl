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
  [Parameter(Mandatory)][string]$Host,
  [Parameter(Mandatory)][int]$GatewayPort,
  [Parameter(Mandatory)][int]$SidecarPort,
  [Parameter(Mandatory)][string]$ClientCert,
  [Parameter(Mandatory)][string]$ClientKey,
  [Parameter(Mandatory)][string]$CaCert,
  [string]$User = "neo4j",
  [string]$Database = "neo4j",
  [bool]$Tls = $true,
  [string]$SecretSource = "env:NEO4J_PASSWORD"
)
. (Join-Path $SkillsDir "nacl-tl-core\scripts\lib-neo4j-mcp.ps1")
$Password = $env:NEO4J_PASSWORD

$script:Handshake = "fail"; $script:ProjectExists = "no"; $script:FailedCheck = "none"
function Emit([string]$Status) {
  Write-Output ""
  Write-Output "NACL_GRAPH_RESULT: status=$Status"
  Write-Output "  project_scope=$ProjectScope handshake=$script:Handshake project_exists=$script:ProjectExists failed_check=$script:FailedCheck"
}
function Fail([string]$Check) { $script:FailedCheck = $Check; [Console]::Error.WriteLine("FAILED at: $Check"); Emit "FAILED"; exit 1 }

if ($SecretSource -eq "env:NEO4J_PASSWORD" -and -not $Password) { Fail "secret-source-unavailable" }

$node = Get-NodeExe
& $node (Join-Path $SkillsDir "nacl-tl-core\scripts\remote-route-contract.mjs") --mode connect --host $Host --gateway-port $GatewayPort --sidecar-port $SidecarPort --project-scope $ProjectScope --client-cert $ClientCert --client-key $ClientKey --ca-cert $CaCert --tls $Tls.ToString().ToLowerInvariant() --uri $Uri --username $User --database $Database --secret-source $SecretSource | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "route-contract" }

try { Resolve-Neo4jMcpBin } catch { [Console]::Error.WriteLine($_); Fail "resolve-binary" }
if (-not (Test-Path $script:StableBin)) { Fail "resolve-binary" }

try {
  $out = Invoke-McpCypher -SkillsDir $SkillsDir -Uri $Uri -User $User -Password $Password -Database $Database `
    -Query 'MATCH (p:Project {id:$projectScope}) RETURN count(p) AS c' -Params @{ projectScope = $ProjectScope }
} catch { [Console]::Error.WriteLine($_); Fail "handshake" }
$script:Handshake = "ok"
if ($out -match '"c"[: ]*[1-9]') { $script:ProjectExists = "yes" }
if ($script:ProjectExists -ne "yes") {
  [Console]::Error.WriteLine("Remote graph has no project '$ProjectScope'. The first developer must run: /nacl-init --scale=create")
  Fail "project-missing"
}

& $node (Join-Path $SkillsDir "nacl-tl-core\scripts\write-mcp-config.mjs") --project-root $ProjectRoot --command $script:StableBin --uri $Uri --username $User --database $Database --secret-source $SecretSource | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "write-mcp" }
& $node (Join-Path $SkillsDir "nacl-tl-core\scripts\write-graph-config.mjs") --project-root $ProjectRoot --mode remote --set "neo4j_uri=`"$Uri`"" --set "neo4j_username=`"$User`"" --set "neo4j_database=`"$Database`"" --set "project_scope=`"$ProjectScope`"" | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "write-config" }
& $node (Join-Path $SkillsDir "nacl-tl-core\scripts\write-graph-config.mjs") --project-root $ProjectRoot --mode remote --set "remote.host=`"$Host`"" --set "remote.gateway_port=$GatewayPort" --set "remote.sidecar_port=$SidecarPort" --set "remote.client_cert=`"$ClientCert`"" --set "remote.client_key=`"$ClientKey`"" --set "remote.ca_cert=`"$CaCert`"" --set "remote.tls=$($Tls.ToString().ToLowerInvariant())" --set "remote.secret_source=`"$SecretSource`"" | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "write-route" }
& $node (Join-Path $SkillsDir "nacl-tl-core\scripts\register-project.mjs") --id $Id --name $Name --root $ProjectRoot | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "register" }

Emit "CONNECTED"
[Console]::Error.WriteLine("Connected to existing remote project '$ProjectScope' (no Docker, no seed).")
exit 0
