> 这是 README 的详细版：23 状态表、客户端插件契约、粒子性能契约、UI 移植记录与验收明细。
> 面向使用者的精简版见仓库根目录的 README.md。

# dsh-glass-weather 详细说明（内部文档）

DSH（DeepSeek Harness）原生 Cordis 插件：在 **会话顶栏（标题右侧、紧挨官方胶囊）** 放一颗 **30px 玻璃天气胶囊**，
把 图标 / 预警角标 / 城市 / 温度 / 天气文字 / 今日最高最低 / 湿度 / 时间 全部收在这颗胶囊里，并可选择让设计稿的
canvas 粒子层直接在胶囊内运行。同时注册 `get_weather` 工具供模型查询实时天气与短期预报。

![顶栏里的玻璃天气胶囊](docs/header.png)

![玻璃胶囊特写](docs/pill.png)

![灾害天气状态（台风）](docs/typhoon.png)

- 目标运行环境：**DSH Desktop / dsh web 0.2.0-rc.2**（原生 Cordis 插件，非 hook-protocol 桥接）
- 天气数据：Open-Meteo（免 key、免账号、无 CORS 障碍）
- 运行时依赖：**零**。`@deepseek-ai/*` 与 `cordis` 由 profile 的 pnpm 闭包在挂载时注入
- UI 来源：用户提供的设计稿 **Glass Weather Pill**（设计稿只在本地只读目录，未入库），
  逐字节移植进 `src/client/widget/`：`widget.js` 的 23 状态表与 canvas 粒子引擎 → `state.ts` / `fx.ts`，
  23 种 SVG 图形 → `art.ts`，`widget.css` 整份样式表 → `css.ts`

**默认形态**：顶栏只有一个玻璃胶囊，**没有悬停展开卡**——胶囊本身就是全部界面，所有数据都在里面。
粒子层默认**常驻**（`localStorage['dsh-weather:particles'] = 'always'`），在胶囊内部跑设计稿的粒子；
在设置里改成 `off`（或把 Host 的 `enabled` 关掉）之后，DOM 里**不再创建 `<canvas>`**。

**23 个状态**

设计稿的天气词汇是 **23 个状态**（不是按 weathercode 直接画），每个状态自带玻璃配色、图形与粒子预设。
`state.ts` 的 `STATES` / `STATE_BY_CODE`、`fx.ts` 的 `FX_PRESETS`、`css.ts` 的 23 条 `[data-state]` 规则是同一张表的三个面，
所以「状态 → 配色 → 粒子」可以逐条对照（配色即 CSS 变量 `--wx-tint` 的 `rgb` 三元组与 `--wx-tint-a` 透明度；
「组」是设计稿的 `group`：0 = 普通天气，1 = 灾害天气，预警角标来自 `STATES[*].warn`）：

| 状态（`data-state`） | 中文 | 组 | 预警角标 | 玻璃配色 `--wx-tint` | 粒子预设（层 × 数量） |
|---|---|---|---|---|---|
| `sunny` | 晴 | 普通 | — | 255,213,146 · α .56 | `mote`×26 |
| `partly` | 多云转晴 | 普通 | — | 168,205,246 · α .5 | `cloud`×12 + `mote`×10 |
| `cloudy` | 多云 | 普通 | — | 152,178,213 · α .64 | `cloud`×8 |
| `overcast` | 阴 | 普通 | — | 120,136,160 · α .66 | `cloud`×16（灰） |
| `fog` | 雾 | 普通 | 黄 | 168,182,198 · α .62 | `fog`×8 + `cloud`×4 |
| `haze` | 霾 | 普通 | 黄 | 196,172,140 · α .62 | `fog`×9 + `mote`×14 |
| `drizzle` | 毛毛雨 | 普通 | — | 150,178,208 · α .58 | `rain`×66 |
| `rainy` | 雨 | 普通 | — | 122,162,212 · α .6 | `rain`×78 |
| `shower` | 阵雨 | 普通 | 蓝 | 138,176,218 · α .58 | `rain`×96 + `mote`×8 |
| `thunder` | 雷雨 | 普通 | 黄 | 106,94,184 · α .66 | `rain`×96 |
| `sleet` | 雨夹雪 | 普通 | 蓝 | 156,180,206 · α .6 | `rain`×52 + `snow`×28 |
| `snowy` | 雪 | 普通 | — | 148,184,221 · α .64 | `snow`×52 |
| `windy` | 大风 | 普通 | 蓝 | 150,196,214 · α .54 | `streak`×46 |
| `night` | 晴夜 | 普通 | — | 58,70,144 · α .78 | `star`×38 |
| `rainstorm` | 暴雨 | 灾害 | 红 | 46,76,120 · α .8 | `rain`×150 + `streak`×16 |
| `blizzard` | 暴雪 | 灾害 | 橙 | 172,196,222 · α .66 | `snow`×120 + `streak`×24 |
| `hail` | 冰雹 | 灾害 | 橙 | 140,162,192 · α .66 | `pellet`×56 + `rain`×34 |
| `icyrain` | 冻雨 | 灾害 | 橙 | 122,158,190 · α .66 | `rain`×48 + `mote`×12 |
| `sandstorm` | 沙尘暴 | 灾害 | 橙 | 200,150,90 · α .68 | `streak`×96 + `mote`×26 |
| `typhoon` | 台风 | 灾害 | 红 | 40,68,100 · α .82 | `streak`×130 + `rain`×62 |
| `tornado` | 龙卷风 | 灾害 | 红 | 104,112,126 · α .76 | `swirl`×44 + `streak`×26 |
| `heatwave` | 高温 | 灾害 | 红 | 255,138,84 · α .6 | `wave`×16 + `mote`×22 |
| `coldwave` | 寒潮 | 灾害 | 橙 | 84,130,190 · α .72 | `mote`×34（下落）+ `snow`×20 |

**状态怎么定**：本机的「手动天气状态」优先（23 种任选一种，覆盖下面所有规则）；
其次是 Host 的 `manualEffect`（`rain`/`snow`/`fog`/`thunder`）直接映射 `rainy`/`snowy`/`fog`/`thunder`；
`auto` 或 `off` 时按下面的顺序判定——**WMO 码只是第一个信号**，它有 6 个状态表达不出来（多云 / 雨夹雪 / 霾 / 沙尘暴 / 台风级 / 龙卷风），
所以另外取了同一家 Open-Meteo 的额外变量来补（详见下一节「数据来源」）：

| 顺序 | 规则 | 结果 | 常量 / 出处 |
|---|---|---|---|
| 1 | 持续风速 ≥ 118 km/h **且** 海平面气压 ≤ 995 hPa | `typhoon` | `TYPHOON_KMH` / `TYPHOON_HPA` |
| 2 | 雨量 ≥ 0.1 mm **且** 降雪 > 0（雨雪同时下） | `sleet` | `SLEET_MM`，仅对 `drizzle/rainy/shower/snowy` |
| 3 | 码本身已是严重天气（如 `rainstorm`） | 保持原状态，不被任何额外读数改写 | `CALM_STATES` 之外直接返回 |
| 4 | 沙尘 ≥ 200 µg/m³，或 PM10 ≥ 420 µg/m³ 且风 ≥ 20 km/h | `sandstorm` | `SANDSTORM_DUST` / `SANDSTORM_PM10` |
| 5 | PM2.5 ≥ 75 µg/m³（且能见度 ≥ 1 km、码不是雾） | `haze` | `HAZE_PM25` / `FOG_VISIBILITY_M` |
| 6 | 温度 ≥ 35 °C | `heatwave` | `HEATWAVE_C = 35` |
| 7 | 温度 ≤ −15 °C | `coldwave` | `COLDWAVE_C = −15` |
| 8 | 风 ≥ 39 km/h 且 晴 / 多云转晴 | `windy` | `WINDY_KMH = 39` |
| 9 | 云量 ≥ 60% 且 晴 / 多云转晴 | `cloudy` | `CLOUDY_PERCENT = 60` |
| 10 | 晴 且 本地小时 ∈ {0,1,2,3,4,5,22,23} | `night` | `NIGHT_HOURS` |
| — | 以上都不命中 | 码本身的状态；码不在表内则 `partly` | `STATE_BY_CODE` |

所有 `hints` 都是可选的：只传一个 WMO 码时，`stateForCode` 的行为与扩展前**完全一致**（验收里专门有这条断言）。

WMO → 状态对照：`0→sunny`；`1/2→partly`；`3→overcast`；`45/48→fog`；`51/53→drizzle`；`55/61/63→rainy`；
`56/57/66/67→icyrain`；`65/82→rainstorm`；`71/73/77/85→snowy`；`75/86→blizzard`；`80/81→shower`；`95→thunder`；`96/99→hail`。

### 数据来源

| 来源 | 取的字段 | 用途 | 成本 |
|---|---|---|---|
| `api.open-meteo.com/v1/forecast`（`current`） | `weather_code`、`temperature_2m`、`relative_humidity_2m`、`precipitation`、`rain`、`snowfall`、`wind_speed_10m`、`wind_gusts_10m`、`cloud_cover`、`pressure_msl`、`visibility`、`cape` | 主读数 + 多云 / 雨夹雪 / 大风 / 台风级 / 雾与霾的区分 | 免密钥、免账号、CORS 开放；与次日预报**同一个请求** |
| `air-quality-api.open-meteo.com/v1/air-quality`（`current`） | `pm2_5`、`pm10`、`dust` | 霾与沙尘暴 | 同上，**每次刷新多一个请求**（与主请求并发，不增加等待时长） |
| `geocoding-api.open-meteo.com/v1/search` | 地名与经纬度 | 手动城市解析 | 仅在配置了 `city` 时调用 |
| `api.bigdatacloud.net/data/reverse-geocode-client` | `locality` / `city` / `principalSubdivision` / `localityinfo.administrative` | 把 GPS 裸坐标变成真实地名（县 > 市 > 省） | 免密钥、CORS 开放；仅在没有地名时调用，结果随坐标缓存 30 分钟 |
| `ipapi.co/json` | `city` / `region` | 反向地理编码失败时的兜底城市名，以及定位兜底 | 免密钥；仅在需要时调用 |

空气质量是**加分信号而不是前置依赖**：该接口被墙、限流或超时时 `fetchAirQuality` 返回 `undefined`，胶囊继续按 WMO 码 + 主读数工作。

`hourly` 的 `visibility` / `cape` 也一并取了，但视觉判定只用到上表；`cape` 当前仅作为**龙卷风的参考信号**保留——
龙卷风是全球都没有公开点源数据的（检测它需要风暴报告数据库，如美国的 NWS 警报、欧洲的 ESWD），所以本插件**不自动判定龙卷风**，
只保留手动选择，避免把强雷暴误标成龙卷风。

---

## 目录

- [从 npm 安装（发布后）](#从-npm-安装发布后)
- [快速开始](#快速开始)
- [目录结构](#目录结构)
- [工作原理](#工作原理)
- [设置项](#设置项)
- [验证](#验证)
- [性能约束](#性能约束)
- [与最初需求说明的差异（重要）](#与最初需求说明的差异重要)
- [实测踩坑记录](#实测踩坑记录)
- [已知限制](#已知限制)

---

## 从 npm 安装（发布后）

本版（`0.2.0`）发布到 npm 之后，安装不需要克隆仓库、也不需要本地构建：

```powershell
dsh plugin --profile desktop add dsh-glass-weather          # 取最新版
dsh plugin --profile desktop add dsh-glass-weather@0.2.0    # 钉住版本
```

- 本插件**运行时依赖为零**，`dsh plugin add` 触发的 pnpm 闭包不会引入任何第三方包。
- 也可以在 **dshmarket（插件市场）**里搜索 `dsh-glass-weather` 安装；市场会按自己的状态模型重写 profile 的
  `package.json` 与 `cordis.patch.yml`（见「实测踩坑记录」第 3 条），这是它的正常行为。
- 安装后桌面端**不需要重启**：宿主会重新组合 profile，顶栏出现胶囊、设置页多出「天气」页签；
  只有改 Host 半（`lib/index.js`）才需要重启。
- 需要本地开发或离线安装时，走下面的「快速开始」：源码构建 + `link:D:/dsh/dsh-weather`。

完整的发布前检查（元数据 TODO、打包校验、干净 profile 装机、回滚）见
[docs/RELEASE.md](docs/RELEASE.md)——`docs/` 已列入 `package.json` 的 `files`，会随 npm 包一起发布
（本版 tarball 的 32 条记录里有 4 条来自 `docs/`）；npm 网站不把包内文件当页面服务，这条链接请在仓库里打开。

---

## 快速开始

### 1. 构建

源码是 TypeScript，必须先生成 `lib/index.js`（Host）与 `lib/client.js`（浏览器）。**dsh 服务的是构建产物，缺 `lib/client.js` 会让整个客户端组合失败并报出一条构建提示。**

```powershell
cd D:\dsh\dsh-weather
pnpm install          # 只装构建工具（tsdown / typescript / 类型包）
pnpm run build        # = 清空 lib + tsdown
pnpm run typecheck    # 两套 tsconfig 各查一次
pnpm run verify       # 185 项检查（含真实 Open-Meteo 交叉核对）
```

### 2. 挂载到 profile

脚本化（推荐，本机用的是这条；幂等、带备份、可一键回滚）：

```powershell
# 挂载（默认 desktop；Windows PowerShell 5.1 需绕过执行策略，故用 .cmd 包装）
D:\dsh\dsh-weather\scripts\mount-profile.cmd desktop

# 回滚
D:\dsh\dsh-weather\scripts\unmount-profile.cmd desktop
```

脚本做的事与 `dsh plugin add` 完全一致：在 `<profile>\node_modules` 建 junction 指向插件源码、在
`dependencies` 加 `link:` 依赖、把 `dsh-glass-weather` **追加**到 `dsh.profile.bundles` 末尾，并备份 `package.json`。

也可以走官方 CLI（会额外跑一次 pnpm，本插件无运行时依赖，因此不会触发供应链策略回滚）：

```powershell
dsh plugin --profile web add link:D:/dsh/dsh-weather   # 本地开发（软链）
dsh plugin --profile web add github:你的用户名/dsh-glass-weather
```

插件自带的 `cordis.patch.yml` 随之加载，插入一条 Loader 条目：

```yaml
- insert:
    - id: weather
      name: dsh-glass-weather
```

> **注意：profile 的 `package.json` 不是"只读配置"。** 本机实测：`dshmarket` 会在 profile 重排时
> **重写** `package.json` 与 `cordis.patch.yml`（它会按自己的状态模型补齐/摘除 bundles 行，并写
> `disabled:` 行）。手工改动会被它感知并在下一次重排时调和——所以常规安装请优先用上面两条路径。

### 3. 生效方式

- **桌面端不需要重启**：本机实测，挂载后运行中的宿主会重新组合 profile，Host 半的 `get_weather`
  立即出现在工具表里，浏览器半也随之热重载（设置页多出「天气」页签、顶栏出现天气胶囊）。只改了 `lib/client.js` 时**不需要重启 dsh**（浏览器半会热重载）；改了 Host 半（`lib/index.js`）才需要重启，因为 Node ESM 缓存不会失效。
- 若你的部署没有开启热重载，重启 dsh 后生效；只改了 `lib/client.js` 的话刷新页面即可。

---

## 目录结构

```
dsh-glass-weather/
├── package.json           # dsh.bundle.patch + dsh.client{platform:web} + exports
├── cordis.patch.yml       # bundle 覆盖层：只插入本插件一行
├── tsconfig.json          # Host 半（node22, ESM）
├── tsconfig.client.json   # 浏览器半（DOM, JSX）
├── tsdown.config.ts       # 两个产物：ESM Host + 包装成 __ModuleLoader__.load 的 CJS client
├── src/
│   ├── index.ts           # Host 入口：name / inject / Config(.volatile) / apply
│   ├── tools.ts           # get_weather 工具注册
│   ├── weather.ts         # Open-Meteo 调用、WMO 中文表（无 node 依赖，两半共用）
│   └── client/
│       ├── index.tsx      # 浏览器入口：插槽接线 + 设置卡片 + 客户端命令 + 状态决策 + 本机开关
│       ├── pill.tsx       # GlassPill 组件：30px 胶囊、字段开关、粒子挂载、时钟、提示
│       ├── styles.ts      # 样式装配：.wx → .dshwx 改名 + 紧凑态 LAYOUT_CSS + installStyles
│       ├── locate.ts      # 地理定位三级回退 + 客户端天气查询
│       └── widget/        # 设计稿移植层（只依赖 state.ts 的类型）
│           ├── state.ts   # 23 状态表 + WMO→状态 + 中文标签 + 预警等级 + 极端值升级
│           ├── art.ts     # 23 种状态的 SVG 图形（逐字节移植）+ LINE_ICONS
│           ├── fx.ts      # 每状态 canvas 粒子预设 + ParticleFx 引擎（30fps / DPR≤1.5 / 暂停 / reduced-motion）
│           └── css.ts     # 整份玻璃样式表 WIDGET_CSS（String.raw 常量，不含 <style> 标签）
├── scripts/verify.mjs     # 离线+在线验收脚本
└── lib/                   # 构建产物（dsh 实际加载的就是这里）
```

**已删除的旧实现**（新版不再有这些文件）：`src/client/WeatherEffect.ts`、`src/client/effects/{rain,snow,fog,thunder}.ts`、
`src/client/glyphs.tsx`、`src/client/weather-map.ts`。旧的「顶栏背景动效层 / 天气族强调色图标 / 特效引擎」已全部
被 `widget/` + `pill.tsx` 取代。另外 `css.ts` 里设计稿的**城市下拉菜单**整组规则（menu / li / 选中态 / 打开态与
`aria-expanded` 箭头旋转）已删除，本插件不做下拉菜单。

---

## 工作原理

### Host 半（`lib/index.js`，Cordis / Node）

1. `inject: ['tools']` → 服务就绪后 `ctx.tools.register(defineTool({...}))`。返回的 disposer 由 Fiber 跟踪，插件停用/热重载自动注销。
2. `Config` 用 Schemastery 定义并调用 **`.volatile()`** → 设置面可编辑、按实时值重解析。
3. `ctx.inject(['settings'], ...)` 里 `settings.configure({ auto: false }, ctx.fiber)`：声明本插件自带设置页，关闭自动生成页。设置服务不存在时插件照常工作。

工具读取配置走 `config.get()`（volatile 解析出的是**引用对象**，不是普通对象），并且是**每次调用时**读取——改设置后下一次调用立即生效，无需重载。

### 浏览器半（`lib/client.js`，`window.__ModuleLoader__.load`）

#### 顶栏胶囊（唯一形态）

- 注册进 `conversation.session.header.actions`（`id: 'weather'`、`order: 40`、`label: () => '天气'`），即**标题右侧、紧挨官方胶囊**的列表槽位；只追加一个元素，不替换也不覆盖任何官方按钮。
- DOM 是一个 `<div class="dshwx dshwx--compact" data-state="…" role="button" tabindex="0">`：`.dshwx--compact` 把设计稿的 76px 卡片压到 `--wx-h: 30px`，玻璃底仍由 `::before` / `::after` 绘制（不是 `background`）。
- 内部元素按顺序：`<canvas class="dshwx__fx">`（仅在粒子要跑时渲染）→ `dshwx__bloom` 高光 → `thunder` 状态才有的 `dshwx__bolt` 闪光 → `dshwx__icon`（`dshwx__halo` + SVG 图形）→ `dshwx__warn` 预警角标 → `dshwx__loc`（定位图标 + 城市名）→ `dshwx__primary`（`dshwx__temp` 大号温度 + `dshwx__cond` 天气文字；下面一行 `dshwx__hl` 放今日最高/最低与湿度）→ `dshwx__clock`（`HH:MM`）。
- 图标不是 emoji 而是设计稿的内联 SVG：emoji 会忽略文字颜色、各平台字形不同，且无法与界面笔画重量对齐。图形用 `dangerouslySetInnerHTML` 注入固定字符串（非用户输入），渐变 id 每次调用重新铸造，避免同页多实例冲突。
- **没有悬停展开卡**：`pill.tsx` 明确不展开，DOM 里没有第二层卡片，也没有 `createPortal`（本机平台模块表不提供 `react-dom`，见踩坑 5）。所以胶囊不会遮住相邻按钮，也不需要 portal 去逃逸裁剪。
- 单击、`Enter` 或空格都触发 `onRefresh`（同时注册了 `/refresh_weather` 客户端动作命令）。`title` 里是精确读数（位置、天气、一位小数温度、湿度、今日区间、更新时间）加一行「单击刷新」。
- 数据未到时温度显示 `--`；读取失败时 `title` 首行变成「天气读取失败：<原因>」，成功一次即清除。

#### 胶囊字段开关（本机，6 个）

哪些内容出现在胶囊里由 6 个布尔开关决定，默认值见下表；开关存在浏览器 `localStorage['dsh-weather:pill-fields']`（JSON，`coerceFields` 逐字段校验，损坏值回落到默认）。

| 开关 | 默认 | 画什么 |
|---|---|---|
| 城市 | **关** | `dshwx__loc`：定位图标 + 城市名。城市名是胶囊里最长的一段，会挤掉会话标题宽度，所以默认关（`title` 里始终带着地名） |
| 天气文字 | 开 | `dshwx__cond` |
| 湿度 | 开 | `dshwx__hl` 里的水滴 + 百分比 |
| 今日最高/最低 | 开 | `dshwx__hl` 里的 ↑/↓ 与度数（两者都为空时整行不画） |
| 时间 | **关** | `dshwx__clock`（`HH:MM`，每 15 秒走一次，仅在开启时建立定时器） |
| 预警角标 | 开 | `dshwx__warn`，`data-lv` = `blue`/`yellow`/`orange`/`red`，由状态表决定 |

`enabled`（Host 总开关）为 `false`、或 `manualEffect` 为 `off` 时，`GlassPill` 仍然渲染（图形、配色、读数都在），但粒子层不启动：槽位传下去的 `enabled` 是 `snapshot.enabled && snapshot.manualEffect !== 'off'`，组件内部 `live = particles === 'always' && enabled`。

#### 粒子层（设计稿的 canvas 引擎）

- 策略是 `dsh-weather:particles`：`always`（**默认**，胶囊里跑粒子）/ `off`。`off` 时组件**根本不渲染 `<canvas>`**，没有任何绘制成本。
- `useParticles` 在状态或策略变化时重建引擎：`new ParticleFx(canvas, state)` → `resize()` → `start()` → `ResizeObserver` 观察 canvas → 监听 `window.resize`；清理时 `destroy()`（摘监听、清画布、断开 observer）。
- 引擎契约（`fx.ts` 头注释）：一条 rAF 循环、按时间戳门控 **30fps**；`devicePixelRatio` 封顶 **1.5** 且只用于 backing store；`document.hidden` 或 canvas 盒尺寸为 0 时**跳过该帧并把帧时钟重置为 `-Infinity`**；`prefers-reduced-motion: reduce` 时 `start()` 直接返回，运行中偏好翻转会 `stop()`；粒子在预设切换时创建、原地重生，绘制循环不分配粒子对象。
- 粒子外观全部取自设计稿（数量、速度、长度、角度、颜色、透明度、漂移均未改），预设见上文 23 状态表。

#### 样式注入与 `.dshwx` 命名空间

- `installStyles()` 向 `document.head` 注入**一个** `<style data-dsh-glass-weather-styles>`；已存在则复用同一个节点并刷新 `textContent`（热重载 / 二次挂载不会堆叠重复样式表），返回的清理函数在插件卸载时把它移除。
- 内容 = `SCOPED_CSS + LAYOUT_CSS`。`SCOPED_CSS` 是 `WIDGET_CSS.replaceAll('.wx', '.dshwx')`——设计稿的 `.wx` 前缀太通用，装配时整体改名为 `.dshwx`；`--wx-*` 自定义属性与 `wx-spin` / `wx-bolt` / `wx-flash` 等 keyframes **不含 `.wx`**，因此不会被误改。
- `LAYOUT_CSS` 只补设计稿没有的顶栏形态：`.dshwx--compact`（30px 紧凑态，含 20px 图标、16px 温度、11.5px 次级文字，以及水滴图标上一句 `drop-shadow`——设计稿给文字加 `text-shadow` 保证浅色玻璃上的可读性，内联 SVG 接不了 `text-shadow`，所以用等价投影）、以及包住内联 SVG 的 `.dshwx__glyph` / `.dshwx__drop` / `.dshwx__pin` / `.dshwx__arrow` 四个 wrapper（设计稿直接把 SVG 塞进容器，React 需要一个稳定子节点）。

#### 设置卡片、命令与调试句柄

- 设置卡片注册进 `settings.plugins.tab`（`id: 'weather'`、`order: 40`、`label: () => '天气'`）。顶部状态行显示「地点 · 天气 · 温度 · 湿度 · 今日区间 · 更新时间」；下面是 6 个字段开关、粒子动效下拉、**手动天气状态下拉（自动 + 23 种，按常规/极端分组）**、Host 的 `enabled` / `manualEffect` / `city`，以及「刷新天气」按钮。
- 设置源从 `ctx.configForms` 读取（与 Host 工具同一个设置文档），命名空间按 `['weather', 'include:weather']` 依次匹配，再退化为"按 section 形状识别"；快照一变即重绘——**不需要任何自定义 RPC 或 Host→Client 事件**。字段写入走 `form.set(field, value)`，卡片会把 `true/false` 或错误原样显示成「已保存 X」/「X 被 Host 拒绝」/「X 保存失败」。
- 卡片**不**给 `rainColor` / `snowColor` / `fogColor` / `lightningColor` / `densityScale` / `speedScale` / `opacity` / `enableLightning` 提供控件：新版配色、图形与密度由状态的 `[data-state]` 规则和粒子预设决定。这 8 个字段仍保留在 Host schema 里（`enableLightning` 还参与设置命名空间的形状识别），但当前渲染不读它们。
- 客户端动作命令 `refresh_weather`（`ui.kind = 'action'`），与 Host 的 `get_weather` 不冲突。
- 调试句柄：`window.__weatherEffect = { refresh, setParticleMode(mode), setFields(fields), setState(state), status() }`，随插件卸载被删除。

### 配置落点

`组合包 patch → $DSH_HOME/profiles/<profile>/cordis.patch.yml → $DSH_HOME/cordis.patch.yml → --patch overlay`，后层按行胜出。**对条目 `config` 的覆盖是整块替换、不做深合并**，所以 11 个字段全部带默认值：只写 `config: {enabled: false}` 不会丢掉其他字段。

---

## 设置项

设置面板路径：**设置 → 插件 → 「天气」页签**。新版是一张玻璃风格卡片（根 `<div class="dshwx-set">`），
自上而下是状态行（`dshwx-set__status`）、实时预览（`dshwx-set__preview`，里面直接挂顶栏那款 `.dshwx--compact`），
再往下是四个 `<section class="dshwx-set__group">` 分组——显示内容 / 外观与动效 / 数据与位置 / 高级：

| 段 | 内容 |
|---|---|
| 状态行 | 地点 · 天气 · 温度 · 湿度 · 今日区间 · 更新时间（读不到数据时显示「读取失败：<原因>」） |
| **实时预览** | 直接渲染顶栏那一款玻璃胶囊（跟随当前读数与显示开关），改开关立刻能看到效果，不用去顶栏确认 |
| 显示内容 | 6 个显示开关，每个带一句白话说明（见下） |
| 外观与动效 | 粒子动效（常驻 / 关闭）、手动天气状态（自动 + 23 种，按常规 / 极端分组） |
| 数据与位置 | 城市输入框（留空自动定位，也接受 `lat,lon`）、「刷新天气」按钮 |
| 高级 | Host 的 `enabled` 与 `manualEffect`、一键「恢复本机默认显示」、设置源与写入结果提示 |

### 显示内容：6 个本机开关

开关只影响胶囊画什么，不写 Host 配置，存在浏览器 `localStorage['dsh-weather:pill-fields']`（JSON，`coerceFields` 逐字段校验，损坏值回落默认）：

| 开关 | 默认 | 白话说明（与卡片上的小字一致） |
|---|---|---|
| 城市 | **关** | 在胶囊里显示地名（如「南昌县」）。地名最长，会占用会话标题的宽度，所以默认关 |
| 天气文字 | 开 | 显示「阴 / 小雨」这类状态词 |
| 湿度 | 开 | 显示相对湿度百分比 |
| 今日最高/最低 | 开 | 显示今天的最高与最低温度。两个都为空时整行不画 |
| 时间 | **关** | 显示当前时间。系统任务栏已有时间，所以默认关（只在开启时才建立 15 秒走一次的定时器） |
| 预警角标 | 开 | 恶劣天气（霾、沙尘暴、台风等）时，在图标旁显示对应颜色的三角预警标 |

### 外观与动效

| 控件 | 默认 | localStorage 键 | 说明 |
|---|---|---|---|
| 粒子动效 | `always`（常驻） | `dsh-weather:particles` | `always` 在胶囊里跑设计稿的粒子 / `off` 关闭；`off` 时 DOM 里**没有 `<canvas>`**，绘制成本为 0 |
| 手动天气状态 | 自动 | `dsh-weather:state` | 自动 + 23 种状态任选（按常规 / 极端分组）。**龙卷风唯一能被看到的入口**（全球没有公开点源数据），其余 22 种都能自动判定；手动选择只改外观与粒子，不动 `get_weather` 的读数 |

### 数据与位置

| 控件 | 写到哪里 | 说明 |
|---|---|---|
| 城市（留空自动定位） | Host 的 `city` 字段（与 `get_weather` 共用同一份设置文档） | 留空自动定位；也接受 `"纬度,经度"` 坐标串；输入即写，下一次刷新与下一次工具调用同时生效 |
| 刷新天气按钮 | 不写配置 | 与单击胶囊、`/refresh_weather` 客户端命令是同一条路径（重新定位 + 查询）；卡片上注明「数据来自 Open-Meteo，免密钥；每次刷新两个请求（天气 + 空气质量）」 |

### 高级

| 控件（卡片上的标签） | 说明 |
|---|---|
| 允许绘制（Host 总开关，`enabled`） | Host 侧配置。关掉后胶囊照常显示读数，只是粒子层不启动（与「粒子动效」都为真才创建 `<canvas>`） |
| Host 手动特效（`manualEffect`） | Host 侧的粗粒度覆盖（雨 / 雪 / 雾 / 雷暴 / 关闭粒子，即 `rain` / `snow` / `fog` / `thunder` / `off` / `auto`），优先级**低于**上面的本机「手动天气状态」 |
| 恢复本机默认显示 | 一键把**三个本机键**恢复默认：6 个显示开关回到默认、粒子常驻、手动状态回到自动。**只重置本机项，不动 Host 配置**（按钮下方小字就这么写） |
| 设置源与写入结果提示 | 卡片底部显示设置源（`weather`）与最近一次写入的结果：「已保存 X」/「X 被 Host 拒绝」/「X 保存失败：原因」；读不到值时提示「未读到设置值，界面显示的是默认值」 |

**Host 配置字段**（`Config`，11 个，全部带默认值，写入由 settings 服务按 schema 校验后落盘到 profile patch，并带 revision 防并发覆盖；非法值被 schema 直接拒绝，不会静默转默认值）：

| 字段 | 默认 | 是否影响当前渲染 | 说明 |
|---|---|---|---|
| `enabled` | `true` | 是 | 插件总开关；与「粒子动效」都为真才创建 canvas |
| `city` | `''` | 是 | 手动城市；留空自动定位。支持 `lat,lon` 直接写坐标 |
| `manualEffect` | `auto` | 是 | `auto`/`rain`/`snow`/`fog`/`thunder`/`off`；非 `auto` 时强制对应状态（`off` 不覆盖状态，但会关掉粒子层，等于 Host 侧的「关闭粒子」） |
| `rainColor` | `#aedbf0` | 否 | 旧版雨滴颜色；保留在 schema，当前渲染不读取 |
| `snowColor` | `#ffffff` | 否 | 旧版雪花颜色；同上 |
| `fogColor` | `#c8d8e8` | 否 | 旧版雾颜色；同上 |
| `lightningColor` | `#ffffff` | 否 | 旧版闪电颜色；同上 |
| `densityScale` | `1.0`（0.2–3.0） | 否 | 旧版粒子密度倍率；同上 |
| `speedScale` | `1.0`（0.2–3.0） | 否 | 旧版下落速度倍率；同上 |
| `opacity` | `0.7`（0.1–1.0） | 否 | 旧版整体不透明度；同上 |
| `enableLightning` | `true` | 否（用作命名空间指纹） | 旧版雷暴闪电开关；仍参与设置 section 的形状识别 |

> 旧版的「恢复推荐外观」按钮已随旧 UI 删除：新版没有可调的配色 / 密度，也就没有需要一键收拾的值。
> 卡片里的「恢复本机默认显示」只重置上面那三个**本机**键（胶囊字段 / 粒子策略 / 手动状态），不会改这 11 个 Host 字段中的任何一个。

---

## 验证

### 自动验收（推荐先跑）

```powershell
pnpm run verify            # 185 项
pnpm run verify -- --offline   # 跳过联网核对
```

2026-10-04 本机实测：`passed: 185   failed: 0`（含真实 Open-Meteo 交叉核对）。

覆盖范围：

1. **清单/覆盖层一致性**——`dsh.bundle.patch`、`dsh.client` 形态、exports、`id: weather` 在 patch / Host / 浏览器三处一致；
2. **bundle 包装**——`lib/client.js` 以 `window.__ModuleLoader__.load({id:"dsh-glass-weather",...})` 开头、以 `return module.exports; } });` 收尾，且运行时只 require `react` 与 `react/jsx-runtime`（其余一律由平台模块表提供）；
3. **浏览器半真跑**——把构建产物在最小 DOM + 录制型 2D context 上执行：插槽注册（顶栏 `conversation.session.header.actions` 的 `id/order` 与 `settings.plugins.tab` 设置卡片）、`include:weather` 命名空间被采用、glass 样式表注入 `<head>` 且 23 个状态各有一条 tint 规则、胶囊渲染 `data-state` 与读数、6 个字段开关（含「时间只在该开关打开时出现」）、预警角标四级、`thunder` 的 `dshwx__bolt` 闪光、粒子引擎（绘制、DPR 封顶 1.5、23 个预设齐全、`document.hidden` 暂停与恢复、`prefers-reduced-motion` 不启动、0 尺寸不绘制）、23 状态 SVG 与渐变 id 每次重铸、`LINE_ICONS` 完整、WMO→状态映射与极端值升级、设置写回传到胶囊、客户端命令、卸载清理；
4. **降级与容错**——空气质量接口挂掉（`refresh()` 不抛错、快照无 `error`、状态仍由 WMO 码决定，不会误判成霾/沙尘暴）、主天气接口挂掉（`error` 是可读原因、上一次读数不被清空、调试句柄仍在）、旧接口缺 `cloud_cover`/`rain`/`snowfall`/`wind_gusts_10m`/`pressure_msl`/`visibility`（客户端不崩、`61 → rainy`、缺字段不会变成幻影灾害态）、`localStorage` 读写抛错时回落到出厂默认；
5. **Host 半**——11 个字段默认值齐全、越界值被拒、工具参数/描述/输出 schema、`render` 输出；
6. **真实 Cordis 4 激活**——用桩 `tools`/`settings` 服务启动真实 `Context`：`tools` 缺失时 fiber 保持 pending（state 0），就绪后激活（state 2）并注册 `get_weather`；无 `settings` 时仍可运行；`fiber.dispose()` 后 `ctx.effect` 注册被逆向注销；
7. **在线核对**（默认开启）——通过工具查北京，再直连 Open-Meteo 同参数读一次，逐项比对温度/天气代码/**返回天数**。（这一段会先还原被上半场替换掉的全局 `fetch`，否则比对的两边都来自假数据——这个坑本身也踩过一次。）

### 手动验收

```js
// 1) 胶囊状态与开关快照
window.__weatherEffect.status();                  // { state, condition, temperature, fields, particleMode, enabled, … }

// 2) 粒子策略（与设置页下拉同一路径）
window.__weatherEffect.setParticleMode('off');    // 胶囊内不再有 canvas
window.__weatherEffect.setParticleMode('always');

// 3) 胶囊字段（与设置页勾选框同一路径）
window.__weatherEffect.setFields({ city: true, condition: true, humidity: true, range: true, clock: true, warn: true });

// 4) 样式表命名空间
document.querySelector('style[data-dsh-glass-weather-styles]').textContent.includes('.dshwx[data-state="sunny"]');

// 5) 重新定位 + 查询
window.__weatherEffect.refresh();

// 6) 设置面板：设置 → 插件 → 天气 → 实时预览 / 显示内容 / 粒子动效 / 手动天气状态 / 城市 / 高级
```

- 天气数据准确性：与 <https://open-meteo.com/> 官网同参数对比（`pnpm run verify` 已自动做这件事）。
- 桌面端：`window.dshDesktop` 存在时用于诊断标记；核心功能不依赖它。

### 隔离 A/B 测试（不碰生产数据）

```powershell
$env:DSH_HOME = "D:\dsh\_weather-iso"
dsh --profile weather-iso --from-default-profile web --dump-config   # 从 web 模板派生
dsh plugin --profile weather-iso add link:D:/dsh/dsh-weather
dsh --profile weather-iso --dump-config | Select-String -Context 2,2 "dsh-glass-weather"
# → # == dsh-glass-weather
#   - id: weather
#     name: dsh-glass-weather
```

`--dump-config` 会真实解析每一层覆盖并组装 Loader 树，因此上面这段输出就是「bundle patch 已被真实 Loader 接收」的证据。

> **本机 CLI 反例（重要）**：`D:\node_global` 里的 `dsh` 是 **0.1.7-rc.2**，用它启动的 `dsh web`
> **不会**把「以 profile bundle 方式挂载的第三方插件」组合进客户端 boot graph。我用已知可用的
> `dsh-skin-im2005` 做对照，同样缺席，所以这与本插件无关，是那个 CLI/模板的行为。
> 结论：**客户端组合必须在桌面端 0.2.0-rc.2 上验证**（本次已用 Inspect 通道验证通过）；
> 旧 CLI 只适合验证 `--dump-config` 的覆盖层解析。

---

## 性能约束

| 约束 | 实现 |
|---|---|
| 粒子常驻但可关 | 默认 `always`，胶囊内跑粒子；`off` 或 Host `enabled: false` 时**不渲染 `<canvas>`**，DOM 与绘制成本都是 0 |
| 30fps 节流 | 单条 rAF 循环 + `1000/30` 时间戳门控（`FRAME_MS`） |
| DPR 封顶 | `Math.min(window.devicePixelRatio \|\| 1, 1.5)`，仅用于 backing store；`setTransform(dpr,0,0,dpr,0,0)` 后按 CSS 像素绘制 |
| 页面隐藏暂停 | `document.hidden` 或 canvas 盒尺寸为 0 时跳过该帧，并把帧时钟重置为 `-Infinity`，避免恢复时一个巨型 `dt` |
| reduced-motion | 匹配 `(prefers-reduced-motion: reduce)` 时 `start()` 不启动；运行中偏好翻转立即 `stop()` |
| 无展开卡 | 不创建第二层卡片 DOM，不使用 `react-dom` portal；DOM 里始终只有一个胶囊元素加一个 `<canvas>` |
| 粒子规模 | 由 23 状态预设固定，最大的是 `rainstorm`（`rain`×150 + `streak`×16）与 `typhoon`（`streak`×130 + `rain`×62） |
| 循环内零分配 | 粒子对象在 `set(state)` 时按预设创建、之后原地重生；绘制循环只改数值 |
| 渐变的代价 | `cloud` / `fog` / `mote` 三类粒子在**每一帧**各重建一个径向渐变（设计稿原样）；按预设算，单状态最多是 `coldwave` 的 34 个/帧（`mote`×34），其次 `sunny` 与 `sandstorm` 的 26 个/帧 |
| 资源清理 | `destroy()` 停止循环、摘除 `resize` 与 `matchMedia` 监听、断开 `ResizeObserver`、清空画布与粒子引用 |

---

## 与最初需求说明的差异（重要）

需求说明里的若干 API 在 0.2.0-rc.2 中**不存在**。以下每一条都以本机安装的 0.2.0-rc.2 源码/类型声明与实测为准，代码按此实现。

| 需求说明写法 | 0.2.0-rc.2 实际情况 | 本插件做法 |
|---|---|---|
| `"dsh": { "client": true }` | `parseDshClient` 见到非对象声明会直接 `throw`：*has a non-object dsh.client declaration*；`platform` 必须是字符串且等于 `"web"` | `"client": { "platform": "web" }` |
| `ctx.settings.installSection(ns, Config, cfg, {setSource,onChange,validate})` | 无此方法。`ctx.settings` 是 `SettingsForms` Service，只有 `configure({auto}, owner)` / `describe()` / `update()` / `replace()` / `mutate()` / `writable` / `prepareDocument()` | Host 只调用 `configure({auto:false}, ctx.fiber)`；读写全部交给 settings 服务与客户端 `ctx.configForms` |
| 命名空间 `'dsh-glass-weather'` 是自由字符串 | 命名空间就是 **profile 条目 id**，而且**bundle 挂载的条目带 include 前缀**：实测本插件是 `include:weather`，官方 emoji 插件是 `include:dsh-emoji` | 客户端按 `['weather','include:weather']` 依次匹配，再退化为"按 section 形状识别"，因此两种命名都能绑定 |
| 槽位 `settings.plugin.item` | 不存在。设置域声明的槽位是 `settings.section`、`settings.plugins.tab`、`settings.general.item` 等 | 注册进 `settings.plugins.tab`：`ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({name,id,order,label}, Component))` |
| `ctx.settingsScope` 读写 + 手写持久化 | 无此服务。客户端经 `ctx.configForms`（共享 describe 镜像）读写，持久化与 revision 由 settings 服务负责 | 卡片订阅 `form.subscribe` / `form.set(field, value)` |
| Config 普通 Schemastery schema | 表单只暴露 **volatile** 字段；且 volatile schema 解析出的是**引用对象**：实测 `Config({}).city === undefined`，必须 `Config({}).get().city` | `Config` 末尾 `.volatile()`，工具通过 `() => config.get()` 每次调用取实时值 |
| `ctx.on('config/change', ...)` 通知客户端 | 事件不存在；volatile 配置是实时的，设置文档有 `settings/document-updated` | 浏览器半直接订阅 `configForms` 快照；无需自定义事件或 RPC |
| 客户端命令 `refresh_weather` | 斜杠命令目录由 Host 侧命令插件提供；客户端可用 `ctx.commandUi.register({kind:'action'})` 注册**纯客户端动作命令**，且与 Host 命令同名会冲突 | 注册客户端动作命令 `refresh_weather`，同时暴露 `window.__weatherEffect.refresh()` 与卡片上的「刷新天气」按钮 |
| `package.json` 三个依赖对象都为空 | 运行时依赖确实为空（由 profile 闭包注入）；但构建需要 tsdown/typescript/类型包 | `dependencies`/`peerDependencies` 保持 `{}`；`devDependencies` 放构建工具与类型（不会被 profile 安装） |

另外两点按需求实现并已实测：

- **约束 #5**：`lib/client.js` 通过 `window.__ModuleLoader__.load({ id, factory })` 注册，`factory(require)` 只解析 `react` / `react/jsx-runtime`（平台模块表），其余代码全部内联。
- **约束 #2**：`ctx.effect` 注册在 fiber dispose 时被逆向注销（验收第 5 组实测）。`ctx.tools.register` 也挂在调用方 scope 上——`dsh-tools` 内部实现是 `layers.effect(this.ctx, (layer) => layer.tools.insert(...))`，而 `ctx.tools` 是**调用方作用域代理**，所以不需要（也不应该）自己保存 disposer。

---

## 实测踩坑记录

这几条都是本机在真实 DSH Desktop 上跑出来的，不是推测；其中第 1 条曾让浏览器半**整个**失效，第 5–8 条是本次玻璃胶囊改造中新增的记录（第 6、7 条在改造中真实踩过）。

### 1. 未 inject 就访问 Cordis 服务 = 整个插件半抛错

第一版客户端 `apply` 在顶层直接读了 `services.configForms`。插件导出的是 `inject = []`，而在 Cordis 里
**读取一个没有 inject 的服务会抛错**，于是 `apply` 抛异常 → 浏览器半什么都没注册（没有画布、没有设置页签）。
表现极具迷惑性：Host 半完全正常、`get_weather` 可用、页面也不报错，只有前端静悄悄什么都没发生。

规避：服务访问一律包在 `ctx.inject([...], ctx => ...)` 里。`scripts/verify.mjs` 现在的假上下文是
**Cordis 形状**的——根上下文只暴露 core 成员，`inject` 只把被请求的服务交给回调，读到未 inject 的服务会抛错，
所以同类问题以后会在验收阶段直接失败（`client apply() completes without an un-injected service read`）。

### 2. 条目 id 带 `include:` 前缀

用 `cordis_inspect_query`（host / Config）看实时条目：

```json
{ "id": "include:weather", "patchId": "weather", "name": "dsh-glass-weather", "status": "schema" }
```

`patchId` 是 `cordis.patch.yml` 里写的 `weather`，而 **live id 是 `include:weather`**——设置命名空间用的是后者。
`include:` 来自 profile bundle 的 include 树，官方插件同理（`dsh-emoji` → `include:dsh-emoji`）。
新版验收里对应两条：`the include-prefixed live entry id is adopted` 与 `settings card id matches the settings namespace`。

### 3. `dshmarket` 会重写 profile 文件

`.dsh-market/log.ndjson` 记录了它自己的动作（`#696` 等）。实测：一次 profile 重排会让它重写
`package.json`（增删 `dsh.profile.bundles` 行）并往 `cordis.patch.yml` 写 `disabled:` 行。
所以：**别把手工编辑当成稳定状态**，安装/卸载优先用 `mount-profile.cmd` 或 `dsh plugin add`；
一旦市场插件对某个条目做了决定，它会连带改写你自己的配置。

### 4. 用只读 Inspect 通道做运行时验收（不需要登录令牌）

桌面端 GUI 的 HTTP 入口要令牌，但 DSH 自带的 Inspect 通道可以直接读运行时状态：

| 要确认什么 | 调用 |
|---|---|
| Host 半是否激活 | `host / Config / listConfigs {name:"dsh-glass-weather"}`（`status: schema` 即已解析） |
| 浏览器半是否注册了设置页 | `client / Slots / listSubTree {"root":"settings.plugins.tab"}`（`occupants` 里应出现 `dsh-glass-weather`） |

本次就是靠这两条在**不重启、不看浏览器**的前提下确认了两个半边都已生效。

### 5. 平台模块表只保证 react / react/jsx-runtime，`react-dom` 不可用

`lib/client.js` 的 `factory(require)` 只允许解析平台模块表里的模块（验收第 2 组会断言运行时 require 的模块**不超出**
`react` 与 `react/jsx-runtime`）。本机实测**没有 `react-dom`**，所以：

- 不能用 `createPortal`，也不能用 `react-dom` 的任何导出；
- 需要逃逸容器裁剪时，只能靠 CSS（这一版恰好不需要——顶栏胶囊自身就是完整界面，没有悬停展开卡）。

新版没有任何 `react-dom` 引用（`src/` 全树 grep 无命中），这也是它比"portal 到 body"的方案更稳的原因之一。

### 6. 本机 PowerShell 5.1 的 `Get-Content` 会把中文源码读成乱码

本机默认的 Windows PowerShell 5.1 用系统 ANSI 代码页解码文件，`Get-Content src\client\pill.tsx`
会把中文注释与中文标签（如 `'天气文字'`、`'预警角标'`）读成乱码；乱码还可能被后续工具写回文件，
把源码真正改坏。**读源码一律用 read 工具**（明确按 UTF-8 解码），不要用 `Get-Content` / `type` / `cat`。
如果确实要在命令行里看，用 `Get-Content -Encoding UTF8`。

### 7. 验收桩要跟着生产代码一起长

新版浏览器半用到的东西比旧版多，`scripts/verify.mjs` 的桩也必须同步补，否则失败信息会指向错误的位置：

- **DOM 桩**：补 `document.head`（插件会往 `<head>` 注入 `<style>`），并让 `querySelector` 支持**属性选择器**
  （`style[data-dsh-glass-weather-styles]`），否则 `installStyles` 的复用分支拿到 `null`，样式表会被重复注入；
- **React 桩**：补 `useRef` / `useLayoutEffect`，并让 `useState` 支持**惰性初始化**
  （`useState(readClock)` 必须调用函数拿到 `'HH:MM'`，否则时钟文本会变成函数本身）；
- **window 桩**：补 `matchMedia` 与 `requestAnimationFrame`/`cancelAnimationFrame`，且**必须挂在 `window` 上**——
  生产代码读的是 `window.matchMedia(...)` 与 `window.devicePixelRatio`，只挂 `globalThis` 是不够的。

### 8. 前缀改名的技巧：`replaceAll('.wx', '.dshwx')` 为什么安全

设计稿用 `.wx` 作前缀，太通用，直接注入有和别的插件撞名的风险。装配层一行就能整体改名：

```ts
export const SCOPED_CSS: string = WIDGET_CSS.replaceAll('.wx', '.dshwx');
```

之所以能这么简单，是因为设计稿里**所有**类选择器都以 `.wx` 开头（`.wx`、`.wx__lens`、`.wx[data-state="sunny"]`…），
而 `--wx-tint` / `--wx-h` 这类自定义属性与 `wx-spin` / `wx-bolt` / `wx-flash` 这些 keyframes 名**都不含 `.wx`**
（它们是 `--wx-` 或 `wx-`，中间没有点），所以不会被误伤。`styles.ts` 只 `.replaceAll` 一次，
验收里再断言 23 个状态各保留一条 tint 规则（`states=23`）。

---

## 已知限制

- **非本机访问不持久化设置**：settings 客户端在非 loopback 页面进入 `memory` 模式，卡片会提示「当前连接不持久化设置」。这是 settings 域自身的约束，不是本插件的问题。
- **本机开关存在浏览器里**：胶囊字段（`dsh-weather:pill-fields`）、粒子策略（`dsh-weather:particles`）、手动天气状态（`dsh-weather:state`）与坐标缓存（`dsh-weather:coordinate`）都在 `localStorage`；换浏览器 / 清缓存会回到默认值（城市关、时间关、粒子常驻、状态自动）。Host 侧的 `enabled` 是总开关，两者都为真才创建 canvas。
- **粒子默认常驻**：旧版是「默认干净顶栏、开关打开才有动画」，新版反过来——`always` 是默认值，想要零绘制请把「粒子动效」设为 `off`。`off` 时组件**不渲染 `<canvas>`**，不是渲染一个空画布。
- **没有悬停展开卡**：胶囊就是全部界面，不会在悬停时长出一张卡片。相应地，城市名默认关闭——它是最长的一段，开着会挤掉会话标题宽度；地名始终在 `title` 提示里。
- **配色 / 密度等 8 个 Host 字段当前不参与渲染**：`rainColor`、`snowColor`、`fogColor`、`lightningColor`、`densityScale`、`speedScale`、`opacity`、`enableLightning` 仍保留在 schema（写入仍被校验、`enableLightning` 还参与设置命名空间识别），但玻璃配色与粒子密度由 23 状态的 `[data-state]` 规则和粒子预设决定。改这些字段不会改变外观。
- **雷电是纯视觉**：`thunder` 状态的闪光由 CSS（`dshwx__bolt` + `wx-flash`/`wx-bolt` keyframes）绘制，不做音频，也不做真实闪电定位。
- **定位精度与地名**：浏览器授权定位优先，拒绝时回退到 `ipapi.co`（城市级），再失败用北京；坐标与地名一起缓存 30 分钟。`navigator.geolocation` 只有坐标没有名字，所以裸坐标会先走**无密钥反向地理编码**（`api.bigdatacloud.net/data/reverse-geocode-client`，`localityLanguage=zh`），再退到 IP 级城市；`pickPlaceName` **优先取最具体的一级**——县/区（`南昌县`）胜过市（`南昌市`）胜过省，国家名永不采用。两个来源都说不出地名时**不写「当前位置」这类占位**：`city` 字段留空，胶囊直接不画地名那一段。`city` 配置项可覆盖自动定位（也接受 `lat,lon`）。
- **`lib/` 必须随源码提交或随包发布**：dsh 只加载构建产物。

---

发布流程、元数据 TODO、打包内容与干净 profile 装机验证见 [docs/RELEASE.md](docs/RELEASE.md)（`docs/` 随包发布）；
版本变更见 [CHANGELOG.md](CHANGELOG.md)，许可见 [LICENSE](LICENSE)。