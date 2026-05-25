<#
.SYNOPSIS
Install or update NaCl skills and agents for Claude Code on Windows.

.DESCRIPTION
Default behaviour: `git pull --ff-only` in the repo root, then refresh
user-level symlinks. Pass -NoPull to skip the git step.

Symlinks created (idempotent — re-run any time):
  <repo>\nacl-*\           -> $HOME\.claude\skills\<name>
  <repo>\.claude\agents\*  -> $HOME\.claude\agents\<name>

If symlink creation fails (no Administrator privileges and Developer
Mode disabled), the script falls back to directory junctions for
skills. Agents are individual .md files and require true symlinks;
they will fail without one of the two privilege paths.

Symmetric with skills-for-codex\scripts\install-user-symlinks.ps1.

.PARAMETER NoPull
Skip the git pull step. Useful in offline or sandboxed environments.
#>
[CmdletBinding()]
param(
    [switch]$NoPull
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path

$skillsSrc  = $repoRoot
$agentsSrc  = Join-Path $repoRoot ".claude\agents"
$skillsDest = Join-Path $HOME ".claude\skills"
$agentsDest = Join-Path $HOME ".claude\agents"

# Optional git pull.
if (-not $NoPull) {
    if (Test-Path (Join-Path $repoRoot ".git")) {
        Write-Output "==> git pull --ff-only in $repoRoot"
        Push-Location $repoRoot
        try {
            & git pull --ff-only
            if ($LASTEXITCODE -ne 0) {
                Write-Output ""
                Write-Error "git pull failed. Rerun with -NoPull to skip git and refresh symlinks only."
                exit 1
            }
        }
        finally {
            Pop-Location
        }
        Write-Output ""
    }
    else {
        Write-Output "WARNING: $repoRoot is not a git checkout; skipping git pull"
        Write-Output ""
    }
}

New-Item -ItemType Directory -Force -Path $skillsDest, $agentsDest | Out-Null

function Get-LinkTargetPath {
    param([System.IO.FileSystemInfo]$Item)
    $target = @($Item.Target)[0]
    if (-not $target) { return $null }
    try { return (Resolve-Path $target).Path }
    catch { return $null }
}

function New-DirLink {
    param([string]$Path, [string]$Target, [string]$Name)
    try {
        New-Item -ItemType SymbolicLink -Path $Path -Target $Target | Out-Null
        Write-Output "  CREATED        $Name"
        return $true
    }
    catch {
        try {
            New-Item -ItemType Junction -Path $Path -Target $Target | Out-Null
            Write-Output "  CREATED_JUNCT  $Name"
            return $true
        }
        catch {
            Write-Output "  BLOCKED        $Name (symlink and junction both failed)"
            return $false
        }
    }
}

function New-FileLink {
    param([string]$Path, [string]$Target, [string]$Name)
    try {
        New-Item -ItemType SymbolicLink -Path $Path -Target $Target | Out-Null
        Write-Output "  CREATED        $Name"
        return $true
    }
    catch {
        Write-Output "  BLOCKED        $Name (symlink failed; need Administrator or Developer Mode)"
        return $false
    }
}

$skillsCreated = 0
$skillsPresent = 0
$skillsBlocked = 0
$agentsCreated = 0
$agentsPresent = 0
$agentsBlocked = 0

Write-Output "==> Linking skills into $skillsDest"

$skillDirs = Get-ChildItem -Path $skillsSrc -Directory -Filter "nacl-*" |
    Where-Object { Test-Path (Join-Path $_.FullName "SKILL.md") } |
    Sort-Object Name

foreach ($skill in $skillDirs) {
    $sourcePath = $skill.FullName
    $destPath = Join-Path $skillsDest $skill.Name

    if (-not (Test-Path $destPath)) {
        if (New-DirLink -Path $destPath -Target $sourcePath -Name $skill.Name) {
            $skillsCreated++
        }
        else { $skillsBlocked++ }
        continue
    }

    $destItem = Get-Item $destPath -Force
    if ($destItem.LinkType -eq "SymbolicLink" -or $destItem.LinkType -eq "Junction") {
        $srcReal = (Resolve-Path $sourcePath).Path
        $tgtReal = Get-LinkTargetPath -Item $destItem
        if ($tgtReal -and $srcReal -eq $tgtReal) {
            $skillsPresent++
            continue
        }
    }

    Write-Output "  BLOCKED        $($skill.Name) (destination exists and is not the correct link)"
    $skillsBlocked++
}

Write-Output ""
Write-Output "==> Linking agents into $agentsDest"

if (Test-Path $agentsSrc) {
    $agentFiles = Get-ChildItem -Path $agentsSrc -Filter "*.md" -File | Sort-Object Name

    foreach ($agent in $agentFiles) {
        $sourcePath = $agent.FullName
        $destPath = Join-Path $agentsDest $agent.Name

        if (-not (Test-Path $destPath)) {
            if (New-FileLink -Path $destPath -Target $sourcePath -Name $agent.Name) {
                $agentsCreated++
            }
            else { $agentsBlocked++ }
            continue
        }

        $destItem = Get-Item $destPath -Force
        if ($destItem.LinkType -eq "SymbolicLink") {
            $tgtReal = Get-LinkTargetPath -Item $destItem
            if ($tgtReal -and $sourcePath -eq $tgtReal) {
                $agentsPresent++
                continue
            }
        }

        Write-Output "  BLOCKED        $($agent.Name) (destination exists and is not the correct symlink)"
        $agentsBlocked++
    }
}
else {
    Write-Output "  (no .claude\agents\ directory in repo; skipping)"
}

Write-Output ""
Write-Output "Summary:"
Write-Output "  Skills: created=$skillsCreated already_present=$skillsPresent blocked=$skillsBlocked"
Write-Output "  Agents: created=$agentsCreated already_present=$agentsPresent blocked=$agentsBlocked"

if ($skillsBlocked + $agentsBlocked -ne 0) {
    Write-Output ""
    Write-Output "One or more entries were BLOCKED. Inspect the destination(s) above."
    exit 1
}
exit 0
