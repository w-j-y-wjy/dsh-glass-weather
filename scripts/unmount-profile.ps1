<#
.SYNOPSIS
  从某个 dsh profile 卸载 dsh-glass-weather（mount-profile.ps1 的逆操作）。

.DESCRIPTION
  默认把 package.json 还原成挂载前的备份；如果没有备份，则按结构删除
  dsh-glass-weather 依赖项与 bundles 条目。node_modules 下的 junction 一并删除。

.PARAMETER Profile
  profile 名，默认 desktop。

.PARAMETER DshHome
  DSH_HOME，默认 $env:USERPROFILE\.dsh。

.PARAMETER KeepBackup
  只按结构删除条目，不使用备份文件还原。
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$Profile = 'desktop',
    [string]$DshHome = (Join-Path $env:USERPROFILE '.dsh'),
    [switch]$KeepBackup
)

$ErrorActionPreference = 'Stop'

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
function Read-Text([string]$path) { return [System.IO.File]::ReadAllText($path, $Utf8NoBom) }
function Write-Text([string]$path, [string]$text) { [System.IO.File]::WriteAllText($path, $text, $Utf8NoBom) }

function Info([string]$msg) { Write-Host "  $msg" }

$profileDir = Join-Path $DshHome "profiles\$Profile"
$pkgPath = Join-Path $profileDir 'package.json'
$backup = "$pkgPath.bak-before-dsh-glass-weather"
$linkPath = Join-Path $profileDir 'node_modules\dsh-glass-weather'

if (-not (Test-Path -LiteralPath $pkgPath)) { Write-Host "找不到 $pkgPath"; exit 1 }

Write-Host "== 卸载 dsh-glass-weather（profile: $Profile）=="

if (-not $KeepBackup -and (Test-Path -LiteralPath $backup)) {
    if ($PSCmdlet.ShouldProcess($pkgPath, 'restore from backup')) {
        Copy-Item -LiteralPath $backup -Destination $pkgPath -Force
        Remove-Item -LiteralPath $backup -Force
        Info "package.json 已从备份还原（备份已删除）"
    }
}
else {
    $raw = Read-Text $pkgPath
    $raw = $raw -replace '\s*"dsh-glass-weather"\s*:\s*"link:[^"]*",?', ''
    $raw = $raw -replace ',\s*"dsh-glass-weather"(\s*\])', '$1'
    $raw = $raw -replace '"dsh-glass-weather",\s*', ''
    try { $null = $raw | ConvertFrom-Json } catch { Write-Host "改动后 JSON 非法，未写入：$($_.Exception.Message)"; exit 1 }
    if ($PSCmdlet.ShouldProcess($pkgPath, 'strip dsh-glass-weather entries')) {
        Write-Text $pkgPath $raw
        Info 'package.json 中的 dsh-glass-weather 条目已删除'
    }
}

if (Test-Path -LiteralPath $linkPath) {
    $item = Get-Item -LiteralPath $linkPath -Force
    if ($item.LinkType -in @('Junction', 'SymbolicLink')) {
        if ($PSCmdlet.ShouldProcess($linkPath, 'remove junction')) {
            Remove-Item -LiteralPath $linkPath -Force -Recurse
            Info 'junction 已删除（插件源码目录未受影响）'
        }
    }
    else {
        Write-Host "  注意：$linkPath 不是 junction，未删除" -ForegroundColor Yellow
    }
}
else {
    Info '没有 junction 需要删除'
}

$after = Get-Content -LiteralPath $pkgPath -Raw | ConvertFrom-Json
Write-Host ''
Write-Host "  bundles: $($after.dsh.profile.bundles -join ', ')"
Write-Host '重启 dsh 后完全生效。'
