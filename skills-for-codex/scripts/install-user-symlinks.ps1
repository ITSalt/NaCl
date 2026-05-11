Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..\..")
$sourceDir = Join-Path $repoRoot "skills-for-codex"
$destDir = Join-Path $HOME ".agents\skills"

$blocked = 0
$created = 0
$alreadyPresent = 0

New-Item -ItemType Directory -Force -Path $destDir | Out-Null

$skills = Get-ChildItem -Path $sourceDir -Directory |
  Where-Object { Test-Path (Join-Path $_.FullName "SKILL.md") } |
  Sort-Object Name

foreach ($skill in $skills) {
  $sourcePath = $skill.FullName
  $destPath = Join-Path $destDir $skill.Name

  if (-not (Test-Path $sourcePath -PathType Container)) {
    Write-Output "BLOCKED $($skill.Name): missing source directory $sourcePath"
    $blocked++
    continue
  }

  if (-not (Test-Path (Join-Path $sourcePath "SKILL.md") -PathType Leaf)) {
    Write-Output "BLOCKED $($skill.Name): missing source SKILL.md $sourcePath\SKILL.md"
    $blocked++
    continue
  }

  if (-not (Test-Path $destPath)) {
    New-Item -ItemType SymbolicLink -Path $destPath -Target $sourcePath | Out-Null
    Write-Output "CREATED $($skill.Name): $destPath -> $sourcePath"
    $created++
    continue
  }

  $destItem = Get-Item $destPath -Force
  if ($destItem.LinkType -eq "SymbolicLink") {
    $sourceReal = (Resolve-Path $sourcePath).Path
    $targetReal = (Resolve-Path $destItem.Target).Path
    if ($sourceReal -eq $targetReal) {
      Write-Output "ALREADY_PRESENT $($skill.Name): $destPath -> $($destItem.Target)"
      $alreadyPresent++
      continue
    }
  }

  Write-Output "BLOCKED $($skill.Name): destination exists and is not the correct symlink: $destPath"
  $blocked++
}

Write-Output "Summary: created=$created already_present=$alreadyPresent blocked=$blocked"

if ($blocked -ne 0) {
  exit 1
}

exit 0
