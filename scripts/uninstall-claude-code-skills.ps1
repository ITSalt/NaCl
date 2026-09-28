<#
.SYNOPSIS
Remove the NaCl symlink install for Claude Code on Windows.

.DESCRIPTION
Deletes ONLY links (symlinks or junctions) that point into this repository
checkout:
  $HOME\.claude\skills\nacl-*  -> <repo>\...
  $HOME\.claude\agents\*.md    -> <repo>\...
Real directories, real files, and links pointing anywhere else are left
untouched. Stale links into the repo (target since deleted) are removed too.

Use it when switching this machine to the plugin channel. Reverse with
scripts\install-claude-code-skills.ps1.

.PARAMETER DryRun
List what would be removed without deleting anything.
#>
[CmdletBinding()]
param(
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path.TrimEnd('\', '/')

$skillsDest = Join-Path $HOME ".claude\skills"
$agentsDest = Join-Path $HOME ".claude\agents"

$script:removed = 0
$script:kept = 0

function Get-RawLinkTarget {
    param([System.IO.FileSystemInfo]$Item)
    $target = @($Item.Target)[0]
    if (-not $target) { return $null }
    if (-not [System.IO.Path]::IsPathRooted($target)) {
        $target = Join-Path (Split-Path -Parent $Item.FullName) $target
    }
    return [System.IO.Path]::GetFullPath($target)
}

function Invoke-Entry {
    param([System.IO.FileSystemInfo]$Item)
    if ($Item.LinkType -ne "SymbolicLink" -and $Item.LinkType -ne "Junction") {
        $script:kept++
        return
    }
    $target = Get-RawLinkTarget -Item $Item
    $prefix = $repoRoot + [System.IO.Path]::DirectorySeparatorChar
    if ($target -and $target.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        if ($DryRun) {
            Write-Output "  WOULD_REMOVE   $($Item.Name) -> $target"
        }
        else {
            # Delete the link itself, never the target's contents
            # (non-recursive DirectoryInfo.Delete removes only the reparse point).
            if ($Item -is [System.IO.DirectoryInfo]) { $Item.Delete() } else { Remove-Item -LiteralPath $Item.FullName -Force }
            Write-Output "  REMOVED        $($Item.Name)"
        }
        $script:removed++
    }
    else {
        Write-Output "  KEPT           $($Item.Name) (points outside $repoRoot)"
        $script:kept++
    }
}

Write-Output "==> Skills in $skillsDest"
if (Test-Path $skillsDest) {
    Get-ChildItem -Path $skillsDest -Filter "nacl-*" -Force | Sort-Object Name | ForEach-Object { Invoke-Entry -Item $_ }
}

Write-Output ""
Write-Output "==> Agents in $agentsDest"
if (Test-Path $agentsDest) {
    Get-ChildItem -Path $agentsDest -Filter "*.md" -Force | Sort-Object Name | ForEach-Object { Invoke-Entry -Item $_ }
}

Write-Output ""
if ($DryRun) {
    Write-Output "Summary (dry run): would_remove=$($script:removed) kept=$($script:kept)"
}
else {
    Write-Output "Summary: removed=$($script:removed) kept=$($script:kept)"
}
exit 0
