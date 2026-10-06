# Changelog

本插件的所有值得记录的变更都写在这里。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

暂无。

## [0.2.1] - 2026-10-06

### Fixed

- **设置页下拉框在深色主题下看不见选项**：下拉弹出层由系统绘制成白底，而表单控件原本用 `color: inherit`，
  于是选项文字是白色、白底白字，只有鼠标悬停时才可见。现在 `select` / `input` 与 `option` / `optgroup`
  改用 DSH 主题 token（`--dsw-alias-bg-overlay` 浮层背景、`--dsw-alias-label-primary` 主文字、
  `--dsw-alias-bg-layer-2`、`--dsw-alias-border-l1`），并以系统色 `Canvas` / `CanvasText` 兜底，
  深浅主题都能读。验收新增 2 条回归断言。

### Changed

- `package.json` 声明 `engines.dsh: ^0.2.0-rc.2`（插件市场据此显示适用范围），README 增加兼容性一行。
- 新增 `screenshots.json`（市场详情页的截图清单，放在本仓库，换图无需再提 PR）。

## [0.2.0] - 2026-10-04

UI 全面改为用户提供的设计稿 **Glass Weather Pill**：顶栏一颗玻璃胶囊就是全部界面。

### Added

- **顶栏玻璃天气胶囊**：注册进 `conversation.session.header.actions`（`id: weather`、`order: 40`），
  即标题右侧、紧挨官方胶囊；胶囊高度 30px（设计稿的 76px 卡片由 `.dshwx--compact` 压到 `--wx-h: 30px`），
  玻璃底由 `::before` / `::after` 绘制。
- **23 种天气状态**的图形、配色与粒子：`src/client/widget/state.ts` 的状态表、
  `art.ts` 的 23 份内联 SVG、`css.ts` 的 23 条 `[data-state]` 配色规则、`fx.ts` 的 23 组 canvas 粒子预设是同一张表的四个面。
- **预警角标**：`dshwx__warn`，四级 `data-lv`（`blue` / `yellow` / `orange` / `red`），由状态表决定；可单独关闭。
- **粒子层**：设计稿的 canvas 引擎（`ParticleFx`）直接在胶囊内运行；默认常驻（`always`），可切 `off`
  （`off` 时**不渲染 `<canvas>`**，DOM 与绘制成本都是 0）。
- **6 个显示开关**（本机 `localStorage['dsh-weather:pill-fields']`）：城市 / 天气文字 / 湿度 / 今日最高最低 / 时间 / 预警角标；
  默认城市关、时间关，其余开。
- **手动天气状态选择器**（本机 `localStorage['dsh-weather:state']`）：自动 + 23 种状态，按「常规天气 / 极端天气」两组。
  这是 `tornado` 唯一能被看到的入口——全球没有公开的龙卷风点源数据，本插件不自动判定龙卷风，避免把强雷暴误标。
- **玻璃风格分组设置页**：设置 → 插件 → 「天气」页签，自上而下为状态行、实时预览、显示内容、外观与动效、数据与位置、高级六段。
- **状态判定扩展**：在 WMO 码之外读取同一家 Open-Meteo 的云量、雨/雪分项、PM2.5 / PM10 / 沙尘、风速与海平面气压、
  能见度，让 22 种状态可以自动判定（云量 → `cloudy`；雨 + 雪 → `sleet`；PM2.5 → `haze`；沙尘 / PM10 + 风 → `sandstorm`；
  风压双阈值 → `typhoon`；高温 / 寒潮 / 大风 / 晴夜各有阈值）。
- **真实县市地名**：`navigator.geolocation` 只给坐标，所以坐标先走无密钥反向地理编码
  （`api.bigdatacloud.net/data/reverse-geocode-client`，`localityLanguage=zh`）取最具体的一级（县 / 区 > 市 > 省），
  失败再退到 IP 级城市名；两个来源都说不出地名时 `city` 留空，胶囊不画地名，也不写「当前位置」这类占位。
- **`scripts/verify-release.mjs`**（`npm run verify:release`）：发布前一键验收——`npm pack` 出包，
  解包后断言必需文件齐全且不含 `node_modules` / `*.map` / 临时文件，再跑**包内**的 `verify.mjs` 并与仓库内项数对比，
  最后用隔离的 `DSH_HOME` 让真实 `dsh` Loader 组装一次 patch（期望 `- id: weather / name: dsh-glass-weather`）。

### Changed

- 设置页由单层控件表改为玻璃风格卡片 + 分组：显示内容（6 个开关，每个带一句白话说明）、外观与动效（粒子动效、手动天气状态）、
  数据与位置（城市输入框、刷新天气按钮）、高级（Host 的 `enabled` / `manualEffect`、恢复本机默认显示、设置源与写入结果提示）。
- 设置页新增**实时预览**：直接渲染顶栏那一款胶囊，跟随当前读数与开关，改开关立刻能看到效果。
- 验收脚本 `scripts/verify.mjs` 扩到 **185 项**，新增玻璃样式表命名空间与 23 条状态配色、胶囊字段开关、预警角标、
  雷暴闪光、粒子引擎（绘制 / DPR 封顶 / `document.hidden` 暂停 / `prefers-reduced-motion` / 0 尺寸不绘制）、
  设置回写与卸载清理等用例，以及**降级与容错**四组：空气质量接口挂掉、主天气接口挂掉（错误可读且保留上一次读数）、
  旧接口缺 6 个新字段、`localStorage` 读写抛错；联网段继续与 Open-Meteo 直读结果交叉核对。
- `package.json` 的 `description` / `keywords` 改为玻璃胶囊与 23 状态的描述，`version` 升到 `0.2.0`。

### Removed

- 旧的输入框上方特效层，以及它的全部实现：`src/client/WeatherEffect.ts`、
  `src/client/effects/{rain,snow,fog,thunder}.ts`、`src/client/glyphs.tsx`、`src/client/weather-map.ts`。
- **悬停展开卡**：胶囊本身就是全部界面，DOM 里没有第二层卡片，也没有 `createPortal`（本机平台模块表不提供 `react-dom`）。
- 设计稿里本插件不用的**城市下拉菜单**整组规则（menu / li / 选中态 / `aria-expanded` 箭头旋转）。
- 旧版配色与密度控件（`rainColor` / `snowColor` / `fogColor` / `lightningColor` / `densityScale` / `speedScale` / `opacity` / `enableLightning`
  这 8 个字段仍保留在 Host schema 里并被校验，但当前渲染不读取，见「已知限制」）。

## [0.1.0] - 2026-10-04

初版。

- **输入框上方的特效层**：`rain` / `snow` / `fog` / `thunder` 四种特效，按 WMO 码自动切换，另有 `manualEffect` 手动覆盖；
  可调雨滴 / 雪花 / 雾 / 闪电颜色与密度、速度、不透明度。
- **`get_weather` 工具**（Host 半）：查询指定城市的实时天气与短期预报（1–7 天），
  数据取自免密钥的 Open-Meteo；配置用 Schemastery `.volatile()` 声明，改设置下一次调用即生效。