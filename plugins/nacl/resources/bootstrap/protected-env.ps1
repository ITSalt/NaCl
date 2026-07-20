function Assert-ProtectedEnvAcl {
  param([Parameter(Mandatory=$true)][string]$Path,[Parameter(Mandatory=$true)][string]$IcaclsPath)
  $output = (& $IcaclsPath $Path 2>&1) -join "`n"
  if ($LASTEXITCODE -ne 0 -or $output -match '\(I\)|S-1-1-0|S-1-5-11|S-1-5-32-545|Everyone|Authenticated Users|BUILTIN\\Users') {
    throw [System.Exception]::new("GRAPH_ENV_PERMISSIONS_UNSAFE")
  }
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $currentSid = $identity.User
  $acl = Get-Acl -LiteralPath $Path
  if (-not $acl.AreAccessRulesProtected -or $acl.GetOwner([System.Security.Principal.SecurityIdentifier]) -ne $currentSid) {
    throw [System.Exception]::new("GRAPH_ENV_PERMISSIONS_UNSAFE")
  }
  $rules = @($acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
  if ($rules.Count -ne 1 -or $rules[0].IdentityReference -ne $currentSid -or $rules[0].AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) {
    throw [System.Exception]::new("GRAPH_ENV_PERMISSIONS_UNSAFE")
  }
  $rights = $rules[0].FileSystemRights
  if (($rights -band [System.Security.AccessControl.FileSystemRights]::Read) -eq 0 -or ($rights -band [System.Security.AccessControl.FileSystemRights]::Write) -eq 0) {
    throw [System.Exception]::new("GRAPH_ENV_PERMISSIONS_UNSAFE")
  }
}

function Write-ProtectedEnv {
  param(
    [Parameter(Mandatory=$true)][string]$Target,
    [Parameter(Mandatory=$true)][string]$Content,
    [Parameter(Mandatory=$true)][string]$IcaclsPath
  )
  if (Test-Path -LiteralPath $Target) { throw [System.Exception]::new("GRAPH_ENV_ALREADY_EXISTS") }
  $parent = Split-Path -Parent $Target
  $stage = Join-Path $parent (".nacl-env-stage-" + [Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $stage | Out-Null
  try {
    $currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $principal = "*$currentSid"
    & $IcaclsPath $stage /inheritance:r /grant:r "${principal}:(OI)(CI)(F)" *> $null
    if ($LASTEXITCODE -ne 0) { throw [System.Exception]::new("GRAPH_ENV_ACL_STAGE_FAILED") }
    $stagedEnv = Join-Path $stage ".env"
    [System.IO.File]::WriteAllText($stagedEnv, $Content, (New-Object System.Text.UTF8Encoding($false)))
    # The secret was protected at creation by the secured staging directory.
    # Freeze the inherited user-only ACE as an explicit file ACL before move.
    & $IcaclsPath $stagedEnv /inheritance:r /grant:r "${principal}:(R,W)" *> $null
    if ($LASTEXITCODE -ne 0) { throw [System.Exception]::new("GRAPH_ENV_ACL_FINALIZE_FAILED") }
    Assert-ProtectedEnvAcl -Path $stagedEnv -IcaclsPath $IcaclsPath
    Move-Item -LiteralPath $stagedEnv -Destination $Target
    Assert-ProtectedEnvAcl -Path $Target -IcaclsPath $IcaclsPath
  } finally {
    if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
  }
}
