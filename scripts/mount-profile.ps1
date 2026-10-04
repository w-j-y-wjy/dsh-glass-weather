<#
.SYNOPSIS
  把 dsh-glass-weather 挂载到某个 dsh profile（默认 desktop）。

.DESCRIPTION
  复刻 `dsh plugin add link:...` 对 link 依赖所做的接线，但完全不碰 pnpm
  lockfile，因此不会触发供应链策略（minimumReleaseAge）回滚：

    1. 在 <profile>\node_modules 下建 junction 指向插件源码目录；
    2. 在 <profile>\package.json 的 dependencies 里加 link: 依赖；
    3. 把 "dsh-glass-weather" 追加进 dsh.profile.bundles。

  改动前会自动备份 package.json，并且是幂等的（重复执行不会写重复项）。
  挂载后需要重启 dsh（桌面端：托盘退出再打开）才会重新组合 profile。

.PARAMETER Profile
  profile 名，默认 desktop。

.PARAMETER DshHome
  DSH_HOME，默认 $env:USERPROFILE\.dsh。

.PARAMETER Source
  插件源码目录，默认 D:\dsh\dsh-weather。

.PARAMETER WhatIf
  只打印将要做的改动，不落盘。
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$Profile = 'desktop',
    [string]$DshHome = (Join-Path $env:USERPROFILE '.dsh'),
    [string]$Source = 'D:\dsh\dsh-weather'
)

$ErrorActionPreference = 'Stop'

# package.json 必须保持 UTF-8 无 BOM（Node 的 JSON.parse 不吃 BOM），
# 中文注释脚本本身需要 BOM 才能在 Windows PowerShell 5.1 下正确解析。
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Read-Text([string]$path) { return [System.IO.File]::ReadAllText($path, $Utf8NoBom) }
function Write-Text([string]$path, [string]$text) { [System.IO.File]::WriteAllText($path, $text, $Utf8NoBom) }

function Fail([string]$msg) { Write-Host "ERROR  $msg" -ForegroundColor Red; exit 1 }
function Info([string]$msg) { Write-Host "  $msg" }

$Source = (Resolve-Path -LiteralPath $Source).Path
$profileDir = Join-Path $DshHome "profiles\$Profile"
$pkgPath = Join-Path $profileDir 'package.json'

if (-not (Test-Path -LiteralPath $pkgPath)) { Fail "找不到 profile：$pkgPath" }
foreach ($artifact in @('lib\index.js', 'lib\client.js')) {
    if (-not (Test-Path -LiteralPath (Join-Path $Source $artifact))) {
        Fail "缺少构建产物 $artifact —— 先在 $Source 里跑 pnpm run build"
    }
}

Write-Host "== 挂载 dsh-glass-weather =="
Info "profile : $profileDir"
Info "source  : $Source"

# ---- 1. junction -----------------------------------------------------------
$linkPath = Join-Path $profileDir 'node_modules\dsh-glass-weather'
$nodeModules = Join-Path $profileDir 'node_modules'
if (-not (Test-Path -LiteralPath $nodeModules)) { Fail "profile 没有 node_modules：$nodeModules" }

if (Test-Path -LiteralPath $linkPath) {
    $item = Get-Item -LiteralPath $linkPath -Force
    if ($item.LinkType -eq 'Junction' -or $item.LinkType -eq 'SymbolicLink') {
        Info "已存在 junction（先移除再重建）"
        if (-not $WhatIfPreference) { Remove-Item -LiteralPath $linkPath -Force -Recurse }
    }
    else {
        Fail "$linkPath 已存在且不是 junction —— 请人工确认后再处理"
    }
}
if ($WhatIfPreference) {
    Info "[WhatIf] New-Item -ItemType Junction -Path $linkPath -Target $Source"
}
else {
    New-Item -ItemType Junction -Path $linkPath -Target $Source | Out-Null
    Info "junction 已建立"
}

# ---- 2/3. package.json -----------------------------------------------------
$raw = Read-Text $pkgPath
try { $null = $raw | ConvertFrom-Json } catch { Fail "package.json 不是合法 JSON：$($_.Exception.Message)" }

$spec = "link:$($Source -replace '\\', '/')"
$changed = $false

if ($raw -notmatch '"dsh-glass-weather"') {
    if ($raw -notmatch '("dependencies"\s*:\s*\{)') { Fail 'package.json 里没有 dependencies 段' }
    $raw = [regex]::Replace($raw, '("dependencies"\s*:\s*\{)', "`$1`n    `"dsh-glass-weather`": `"$spec`",")
    Info "dependencies += dsh-glass-weather ($spec)"
    $changed = $true
}
else {
    Info "dependencies 里已有 dsh-glass-weather（跳过）"
}

if ($raw -notmatch '"bundles"') { Fail 'package.json 里没有 dsh.profile.bundles 段' }
$bundlesBlock = [regex]::Match($raw, '"bundles"\s*:\s*\[(?<body>[\s\S]*?)\]')
if (-not $bundlesBlock.Success) { Fail '无法解析 dsh.profile.bundles' }
$bundlesBody = $bundlesBlock.Groups['body']
if ($bundlesBody.Value -notmatch '"dsh-glass-weather"') {
    # 追加到数组末尾，与 `dsh plugin add` 的行为一致。
    $trimmed = $bundlesBody.Value.TrimEnd()
    $insertAt = $bundlesBody.Index + $trimmed.Length
    if ($trimmed.Length -eq 0) {
        $raw = $raw.Insert($insertAt, "`"dsh-glass-weather`"")
    }
    else {
        $raw = $raw.Insert($insertAt, ",`n        `"dsh-glass-weather`"")
    }
    Info 'dsh.profile.bundles += dsh-glass-weather（追加到末尾）'
    $changed = $true
}
else {
    Info 'bundles 里已有 dsh-glass-weather（跳过）'
}

# 校验改完仍然是合法 JSON，且没有把别的 bundle 弄丢
try { $parsed = $raw | ConvertFrom-Json } catch { Fail "改动后 JSON 非法，已放弃：$($_.Exception.Message)" }
if ($parsed.dsh.profile.bundles -notcontains 'dsh-glass-weather') { Fail 'bundles 校验失败，已放弃' }
$before = Read-Text $pkgPath | ConvertFrom-Json
$beforeBundles = @($before.dsh.profile.bundles)
$afterBundles = @($parsed.dsh.profile.bundles)
$missing = $beforeBundles | Where-Object { $afterBundles -notcontains $_ }
if ($missing) { Fail "改动会丢失已有 bundle：$($missing -join ', ')，已放弃" }

if ($WhatIfPreference) {
    Info '[WhatIf] package.json 将被写入（上方为计划改动）'
}
elseif ($changed) {
    $backup = "$pkgPath.bak-before-dsh-glass-weather"
    if (-not (Test-Path -LiteralPath $backup)) { Copy-Item -LiteralPath $pkgPath -Destination $backup }
    Write-Text $pkgPath $raw
    Info "package.json 已更新（备份：$backup）"
}
else {
    Info 'package.json 无需改动'
}

# ---- 结果 ----------------------------------------------------------------
$after = Read-Text $pkgPath | ConvertFrom-Json
Write-Host ''
Write-Host '== 结果 =='
Write-Host "  bundles ($($after.dsh.profile.bundles.Count)): $($after.dsh.profile.bundles -join ', ')"
Write-Host "  node_modules\dsh-glass-weather -> $((Get-Item -LiteralPath $linkPath -Force -ErrorAction SilentlyContinue).Target)"
Write-Host ''
Write-Host '下一步：重启 dsh 后生效。'
Write-Host '  桌面端：托盘图标右键退出，再双击 DeepSeek Harness 打开（或重新执行 Run 键里的程序）。'
Write-Host "  回滚  ： $Source\scripts\unmount-profile.cmd $Profile"
