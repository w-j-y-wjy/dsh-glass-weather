# dsh-glass-weather 0.2.0 发布前检查清单

本清单面向「**先打包 + 全部检查通过**，再决定是否真的发 npm」。每一条都给出可直接执行的命令与**期望结果**，
期望值全部来自 2026-10-04 在本机的实跑（`scripts/verify.mjs`、`npm pack --dry-run`、`npm view`）。
凡是本清单写作时还没实跑过的步骤，都会明确写「未实跑」并给出原因，不含推测值。

- 插件根目录：`D:\dsh\dsh-weather`
- 目标版本：`0.2.0`（`package.json` 已升到 `0.2.0`）
- 本机 Node：`C:\Program Files\nodejs\node.exe`；包管理器命令用同目录的 `npm.cmd`
- **绝对不要**把任何验证命令指向真实的 `%USERPROFILE%\.dsh`；装机验证一律用隔离的 `$env:DSH_HOME`（见第 3 节）

---

## 0. 第一次发布：账号与仓库（5–10 分钟，全程免费）

**这一节只能你本人做**：注册需要邮箱验证、验证码与设置密码，任何代理都不应代持你的账号凭据。
下面每一步都给了确切的网址与命令；做完把用户名/仓库地址告诉代理，剩下的（填 `author`/`repository`、跑发布）由代理执行。

### 0.1 费用与前提

| 项 | 花费 | 说明 |
|---|---|---|
| npm 账号 | **免费** | 不需要银行卡，不需要付费计划 |
| 发布公共包 | **免费** | `--access public`；npm 只对企业私有包收费 |
| GitHub 账号与公共仓库 | **免费** | 完全可选，只为"有源码仓库"这一项 |

你需要的只有：一个能收信的邮箱、一个想好的用户名、以及一个验证器 App（做两步验证）。

### 0.2 注册 npm（发布必需）

1. 浏览器打开 <https://www.npmjs.com/signup>。
   若打不开或报 403，**先开 Nano 代理**（`127.0.0.1:65532`）再试。
   > 本机实测：命令行直接请求 `https://www.npmjs.com/` 与 `/signup` 都是 403（直连与走代理都一样），
   > 这是 Cloudflare 拦非浏览器客户端；而真正的发布通道 `registry.npmjs.org` 是通的
   > （`curl https://registry.npmjs.org/dsh-glass-weather` → **404**，正好也证明这个名字可用）。
2. 填写 **Username / Email / Password** → Create Account。
   用户名会出现在包地址里（`npmjs.com/package/dsh-glass-weather`），建议用与包名相近的小写名字。
3. 去邮箱点验证链接（QQ 邮箱留意「垃圾邮件」文件夹）。
4. **开启两步验证（强烈建议）**：右上头像 → Account → *Two-Factor Authentication* → Enable 2FA →
   选 **Authorization and Publishing** → 用验证器 App 扫码（Microsoft/Google Authenticator、1Password 均可）→
   把 recovery codes 存到安全的地方。开了 2FA 后，发布时会被要求输入一次性验证码。
5. 记下你的用户名。

### 0.3 在本机登录（一次就够）

```powershell
& "C:\Program Files\nodejs\npm.cmd" login  --registry=https://registry.npmjs.org
# 按提示输入用户名 / 密码 /（开了 2FA 会问）一次性验证码

& "C:\Program Files\nodejs\npm.cmd" whoami --registry=https://registry.npmjs.org
# 期望：回显你的用户名（未登录时是 npm error code ENEEDAUTH）
```

不想用交互式登录的话：在 npm 网站 **Account → Access Tokens** 生成一枚 *Granular Access Token*
（权限 `Read and write`，勾上自动化可绕过 OTP），然后写进**用户级** `.npmrc`：

```
//registry.npmjs.org/:_authToken=<你的 token>
```

> ⚠️ token 等同于密码：**不要发给任何人（包括代理）**，也不要提交进仓库。`.gitignore` 已忽略 `.npmrc`。

### 0.4 可选：注册 GitHub 并建仓库

1. <https://github.com/signup> → 邮箱 → 填验证码 → 设用户名与密码 → 验证邮箱。
2. 建仓库：右上 `+` → **New repository** → 名字 `dsh-glass-weather` → 可见性 **Public** →
   **不要**勾 "Add a README"（本地已有）→ Create repository。
3. 本机初始化并推送（Git 已安装：`2.47.1`，`.gitignore` 已写好，`lib/` 是**故意**要提交的——dsh 只加载构建产物）：

```powershell
cd D:\dsh\dsh-weather
git init -b main
git config user.name  "你的名字"
git config user.email "你的邮箱"
git add -A
git commit -m "feat: glass weather pill for DeepSeek Harness (0.2.0)"
git remote add origin https://github.com/<你的用户名>/dsh-glass-weather.git
git push -u origin main
```

4. 把仓库地址告诉代理 → 填进 `package.json` 的 `repository`，并可加一个跑 `npm run release:check` 的 GitHub Actions。

### 0.5 然后发布

```powershell
cd D:\dsh\dsh-weather
& "C:\Program Files\nodejs\npm.cmd" publish --access public --registry=https://registry.npmjs.org
```

本机 `npm config get registry` 是 `http://registry.npmmirror.com`（只读镜像），
**必须**像上面这样显式带 `--registry=https://registry.npmjs.org`，否则发布会失败。

### 0.6 不想注册也能分发的三种办法

| 办法 | 命令 / 做法 | 适合 |
|---|---|---|
| 直接给 tarball | `dsh plugin --profile desktop add file:D:/dsh/dsh-weather/dsh-glass-weather-0.2.0.tgz` | 发给一两个人试用 |
| 目录挂载（本机现状） | `D:\dsh\dsh-weather\scripts\mount-profile.cmd desktop` | 自己开发、改代码即时生效 |
| 手动打包 zip | 把 `lib/`、`cordis.patch.yml`、`package.json` 压成 zip 发出去，对方解到插件目录后按上面两条挂载 | 没有 npm 也不联网 |

---

## 1. 元数据 TODO（必须人工确认后才能发）

| 项 | 现状（本机实测） | 发布前要做什么 |
|---|---|---|
| `LICENSE` 版权行 | `Copyright (c) 2026 w-j-y-wjy` | ✅ 已填 |
| `package.json` `author` | `w-j-y-wjy <2876676081@qq.com>` | ✅ 已填（会公开在 npm 页面，想换可在发布前改） |
| `package.json` `repository` | `https://github.com/w-j-y-wjy/dsh-glass-weather`（含 `homepage` / `bugs`） | ✅ 已填 |
| 包名 | `dsh-glass-weather`，官方源实测**未被占用**（E404） | 无需改动，原因见下 |
| npm 登录状态 | 本机 `npm whoami` → `ENEEDAUTH`（未登录） | `npm login`（第 9 节） |
| npm registry | 本机配置是 `http://registry.npmmirror.com`（镜像，只读同步） | **发布必须显式指定官方源**：`npm publish --access public --registry=https://registry.npmjs.org`；`npm view` 想读实时数据也建议带 `--registry=…` |
| `publishConfig.access` | 已写 `"public"` | 无需改动；命令行仍建议显式带 `--access public` |
| `version` | `0.2.0` | 确认不是 `0.2.0` 之前的旧值；`npm view dsh-glass-weather versions` 里不应已存在 `0.2.0` |

**为什么包名不是 `dsh-weather`**：那个未加 scope 的名字在官方源上已被**别人**占用——`dsh-weather@0.1.0`（2026-08-14 发布，maintainer `xiaoyd7up <1621354073@qq.com>`，仓库 `https://github.com/sunshine-lang/dsh-weather`），是一个只有 `get_weather` 工具、没有界面的天气插件。本插件比它大得多（顶栏玻璃胶囊 + 工具），因此从 0.1.0 起改名为 `dsh-glass-weather`。

包名核验命令与实测输出：

```powershell
& "C:\Program Files\nodejs\npm.cmd" view dsh-glass-weather version --registry=https://registry.npmjs.org
# 实测 → npm error code E404 … 404 Not Found - GET https://registry.npmjs.org/dsh-glass-weather（exit 1，名字可用）

& "C:\Program Files\nodejs\npm.cmd" view dsh-weather version --registry=https://registry.npmjs.org
# 实测 → 0.1.0（exit 0，别人的包占着旧名字）
```

---

## 2. 本地命令与期望结果

在 `D:\dsh\dsh-weather` 下依次执行：

| 命令 | 期望结果（实测口径） |
|---|---|
| `npm run typecheck` | `tsc --noEmit` 跑完两套 tsconfig（`tsconfig.json` + `tsconfig.client.json`），**无任何报错输出**，退出码 0 |
| `npm run build` | 先删掉 `lib/`，再由 tsdown 写出**四个**文件：`lib/index.js`（Host，ESM）、`lib/index.d.ts`（Host 类型）、`lib/client.js`（浏览器半，`window.__ModuleLoader__.load` 包装）、`lib/client.d.ts`（浏览器半类型，对应 `exports["./client"].types`）；退出码 0 |
| `npm run verify` | 末尾打印 `passed: 185   failed: 0` 与 `all checks passed`，退出码 0（含真实 Open-Meteo 交叉核对；`npm run verify -- --offline` 跳过联网段） |
| `npm pack --dry-run` | **33 条**记录、`size` ≈235 KiB（实测 240768 B）、`unpackedSize` ≈558 KiB（实测 571541 B）、文件名 `dsh-glass-weather-0.2.0.tgz`；**不写任何文件** |
| `npm run verify:release` | 跑 `scripts/verify-release.mjs`：`npm pack` 出包 → 解包 → 断言必需文件齐全且无构建垃圾 → 跑**包内**的 `verify.mjs` 并与仓库内项数对比 → 用隔离 `DSH_HOME` 让真实 Loader 组装 patch；全部通过退出码 0。运行后把它打印的报告原样贴进发布记录 |
| `npm run release:check` | = `typecheck && build && verify`，一步跑完后两个命令都通过才退出 0 |

`npm run build` 的四个产物与 `npm pack` 的 33 条记录都是实测值，产物清单可用下面的命令随时复核：

```powershell
cd D:\dsh\dsh-weather
Get-ChildItem lib -Recurse -File | Select-Object Name, Length
# 实测 → client.d.ts 25158 / client.js 107729 / index.d.ts 5314 / index.js 15273
```

### `npm pack --dry-run` 应该包含什么（实测 33 条）

| 分组 | 文件 |
|---|---|
| 运行必需 | `package.json`、`cordis.patch.yml`、`lib/index.js`、`lib/index.d.ts`、`lib/client.js`、`lib/client.d.ts` |
| 文档 | `README.md`、`CHANGELOG.md`、`LICENSE`、`docs/RELEASE.md`、`docs/header.png`、`docs/pill.png`、`docs/typhoon.png` |
| 源码（可读性/可审计，按 `files` 显式列出） | `src/index.ts`、`src/tools.ts`、`src/weather.ts`、`src/client/index.tsx`、`src/client/pill.tsx`、`src/client/locate.ts`、`src/client/styles.ts`、`src/client/widget/{state,art,fx,css}.ts` |
| 构建与脚本 | `tsdown.config.ts`、`tsconfig.json`、`tsconfig.client.json`、`scripts/verify.mjs`、`scripts/verify-release.mjs`、`scripts/mount-profile.{cmd,ps1}`、`scripts/unmount-profile.{cmd,ps1}` |

**必须不出现**在 tarball 里：`node_modules/`、任何 `*.map`、`D:\dsh\_release-test\` 下的解包产物、临时文件
（`scripts/_artcheck.mjs` 之类的自测脚本）、`.dsh-market/`、仓库根目录那个 `dsh-glass-weather-0.2.0.tgz` 自身。
`npm pack --dry-run` 是只读的，可反复跑。

> 上面的 33 条 / ≈235 KiB 是 2026-10-04 实测（此时 `docs/`、`scripts/verify-release.mjs` 与 `lib/client.d.ts` 都已进包）。
> **体积与 `lib/` 文件大小会随着任何源码改动 + 重新 `build` 而变**，以当次 `npm pack --dry-run` 输出为准；
> 条数只在 `package.json` 的 `files` 增删时才会变。
> `npm run verify:release` 会真的落盘两样东西：仓库根目录的 `dsh-glass-weather-0.2.0.tgz` 与 `D:\dsh\_release-test\` 整个暂存目录；
> 确认发布后记得清理，别把它们提交进仓库。

### 一条命令的替代

```powershell
cd D:\dsh\dsh-weather; npm run release:check      # typecheck + build + verify
```

---

## 3. 干净 profile 的装机验证（不动真实 profile）

用隔离的 `DSH_HOME` 从零建一个 profile，再挂载**解包后的 tarball**，验证 `cordis.patch.yml` 会被真实 Loader 解析。

```powershell
# 1) 隔离家目录（本机 dsh CLI 在 D:\node_global，0.1.7-rc.2）
$env:DSH_HOME = "D:\dsh\_release-test\home"
D:\node_global\dsh.cmd --profile rel-iso --from-default-profile web --dump-config

# 2) 把解包出来的包挂进这个 profile（link: 指向真正的包根，不碰 D:\dsh\dsh-weather）
#    tarball 解出来的结构是 package/package/——真正的包根是内层那个（含 package.json）
D:\node_global\dsh.cmd plugin --profile rel-iso add link:D:/dsh/_release-test/package/package

# 3) 让 Loader 真实组装一次配置树，看插件条目是否被接收
D:\node_global\dsh.cmd --profile rel-iso --dump-config | Select-String -Context 2,2 "dsh-glass-weather"
```

期望输出（与 README「隔离 A/B 测试」一节同款证据）：

```
# == dsh-glass-weather
  - id: weather
    name: dsh-glass-weather
```

`--dump-config` 会真实解析每一层覆盖再组装 Loader 树，所以出现上面这两行就等于「bundle patch 被 Loader 接收」。
解包目录由 `scripts/verify-release.mjs` 生成（实测结构：`D:\dsh\_release-test\package\package\`，
内层才是含 `package.json` 的包根）；也可以手工 `tar -xzf dsh-glass-weather-0.2.0.tgz`。

**两条必须知道的边界**：

1. 本机 `D:\node_global` 的 CLI 是 **0.1.7-rc.2**，它**不会**把「以 profile bundle 方式挂载的第三方插件」组合进客户端 boot graph
   （README 里用已知可用的 `dsh-skin-im2005` 做过对照，同样缺席）。所以**客户端半必须在桌面端 0.2.0-rc.2 上验证**；
   旧 CLI 只用来验证 `--dump-config` 的覆盖层解析。
2. 跑完把 `$env:DSH_HOME` 清掉（关掉这个 PowerShell 会话即可），不要让它影响后续命令。

---

## 4. 兼容性声明

| 项 | 值 | 出处 |
|---|---|---|
| 目标宿主 | DSH Desktop / `dsh web` **0.2.0-rc.2** | `package.json` 的 `dsh.compatibility` |
| 兼容性字段 | `dsh.compatibility.dshReleases["0.2.0-rc.2"] = "compatible"` | 同上 |
| 插件形态 | 原生 Cordis 插件（非 hook-protocol 桥接）；Host 半走 `inject: ['tools']`，浏览器半走 `dsh.client.platform = "web"` | `src/index.ts`、`package.json` |
| Node | `^22.19.0 \|\| >=24.0.0` | `package.json` 的 `engines` |
| 运行时依赖 | **零**；`@deepseek-ai/*` 与 `react` 由 profile 的 pnpm 闭包与平台模块表在挂载时提供 | `package.json`（无 `dependencies`）、`tsdown.config.ts` |
| 客户端平台模块 | 只 require `react` 与 `react/jsx-runtime`（`react-dom` 不可用） | `lib/client.js` 包装层，验收第 2 组断言 |

`0.2.0` 与 `0.1.0` 的差异见 [CHANGELOG.md](../CHANGELOG.md)；0.2.0 的 UI 是推倒重来，**与 0.1.0 不共享任何 DOM 结构**。

---

## 5. 隐私与网络声明

插件**只**访问下面 5 个域名，全部免密钥、免账号、无需登录；请求全是 `GET` + URL 查询参数，**没有请求体、没有自定义请求头、没有 Cookie 或 token**。

| 域名 | 何时访问 | 传了什么 | 拿回什么 |
|---|---|---|---|
| `api.open-meteo.com/v1/forecast` | 浏览器半每次刷新；`get_weather` 每次调用 | 纬度、经度、`current` 变量表、`daily` 变量表、`forecast_days`、`timezone=auto` | 当前天气码/温度/湿度/降水/风速等 + 逐日预报 |
| `geocoding-api.open-meteo.com/v1/search` | 仅在配置了 `city` 或 `get_weather` 传了城市名时 | 城市名（`name`）、`count=1`、`language=zh` | 城市对应经纬度与行政名 |
| `air-quality-api.open-meteo.com/v1/air-quality` | 浏览器半每次刷新（与主请求**并发**） | 纬度、经度、`current=pm2_5,pm10,dust`、`timezone=auto` | PM2.5 / PM10 / 沙尘浓度 |
| `api.bigdatacloud.net/data/reverse-geocode-client` | 仅有裸坐标、且还没有地名时（`navigator.geolocation` 只给坐标） | 纬度、经度、`localityLanguage=zh` | 县/区/市/省等行政名 |
| `ipapi.co/json/` | ① 定位三级回退的第 2 级；② 反向地理编码也拿不到地名时的兜底 | 无参数（IP 由对端看到） | IP 级城市/地区与坐标 |

**不发送的东西**：不发送会话内容、提示词、文件内容、用户 ID 或任何账号标识；不发送本机设置
（胶囊开关、粒子策略、手动天气状态都只存在浏览器 `localStorage`，不出本机）；不发送设备指纹或自定义 User-Agent。

**数据落本机的部分**（浏览器）：

| localStorage 键 | 内容 | 生命周期 |
|---|---|---|
| `dsh-weather:pill-fields` | 6 个显示开关 | 换浏览器 / 清缓存即回到默认 |
| `dsh-weather:particles` | 粒子策略 `always` / `off` | 同上 |
| `dsh-weather:state` | 手动天气状态（空 = 自动） | 同上 |
| `dsh-weather:coordinate` | 坐标 + 地名 | **30 分钟** TTL，过期重新定位 |

第三方额度提示（对端策略，非本插件）：`ipapi.co` 免费额度有限、`api.bigdatacloud.net` 免密钥，
两者都只在必要时各调用一次；空气质量接口失败**不影响**胶囊工作（`fetchAirQuality` 返回 `undefined`，继续按 WMO 码渲染）。

---

## 6. Host 工具暴露能力

工具名 `get_weather`，注册在插件自己的 fiber 上（热重载/停用自动注销）。描述里明确了**何时不该用**（不查历史天气）。

**入参**：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `location` | string | 是 | 城市名（如「北京」「Shanghai」）；也接受 `"纬度,经度"` 坐标串 |
| `days` | integer | 否 | 预报天数，1–7，默认 1（越界会被 clamp 到 1–7） |

**输出字段**（`output.schema` 里 `additionalProperties: false`，即模型只看到这些）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `location` | string | 解析后的地名（**不含原始坐标**） |
| `temperature` | number | 当前 2 m 气温 °C |
| `weathercode` | integer | WMO 4677 天气码 |
| `weatherText` | string | 天气码的中文描述 |
| `precipitation` | number | 当前降水量 mm |
| `windSpeed` | number | 当前 10 m 风速 km/h |
| `humidity` | number | 相对湿度 % |
| `daily` | array | 逐日：`date`（`YYYY-MM-DD`，地点本地时区）、`tempMax`、`tempMin`、`weathercode`、`weatherText`、`precipitationSum` |

`render` 输出一段紧凑文本，字段顺序固定、数字随天气变化（下面是格式，尖括号是占位）：

```
<地名>：<中文天气>（WMO <码>），气温 <x.x>°C，相对湿度 <xx>%，降水 <x.x> mm，风速 <x.x> km/h。
逐日预报：
- <YYYY-MM-DD>：<中文天气>（WMO <码>），<min>~<max>°C，降水 <x.x> mm
```

2026-10-04 实跑（`scripts/verify.mjs` 在线段）拿到的当日真实读数，可作为核对基准：
`北京, 北京市, 中国 晴 18.6°C wind 18.7 km/h`。

---

## 7. 安装 / 卸载 / 回滚 / 生效方式

| 动作 | 命令 |
|---|---|
| 从 npm 安装（发布后） | `dsh plugin --profile desktop add dsh-glass-weather` |
| 安装指定版本 | `dsh plugin --profile desktop add dsh-glass-weather@0.2.0` |
| 本地源码挂载（开发） | `dsh plugin --profile web add link:D:/dsh/dsh-weather` |
| 脚本化挂载（幂等、带备份） | `D:\dsh\dsh-weather\scripts\mount-profile.cmd desktop` |
| 卸载 | `dsh plugin --profile desktop remove dsh-glass-weather` |
| 脚本化卸载/回滚 | `D:\dsh\dsh-weather\scripts\unmount-profile.cmd desktop` |
| 回滚到上一版本 | `dsh plugin --profile desktop add dsh-glass-weather@0.1.0` |
| 配置级回滚 | `mount-profile.ps1` 改动前会备份 profile 的 `package.json`，备份名固定为 `<profile>\package.json.bak-before-dsh-glass-weather`（只在**第一次**挂载时创建，不覆盖已有备份）；用备份覆盖回去即可 |

生效方式：Host 半（`lib/index.js`）改动需要**重启 dsh**（Node ESM 缓存不失效）；只改浏览器半（`lib/client.js`）时桌面端**不需要重启**，
宿主会重新组合 profile，浏览器半热重载（设置页多出「天气」页签、顶栏出现胶囊）。

profile 的 `package.json` / `cordis.patch.yml` 会被 `dshmarket` 在重排时重写，所以**不要**把手改当稳定状态，
常规安装只用上面的 CLI 或脚本（README「实测踩坑记录」第 3 条）。

---

## 8. 已知限制（发布说明里应原样保留）

1. **8 个旧 Host 字段不参与渲染**：`rainColor`、`snowColor`、`fogColor`、`lightningColor`、`densityScale`、`speedScale`、
   `opacity`、`enableLightning` 仍在 schema 里并被校验（`enableLightning` 还参与设置命名空间的形状识别），
   但玻璃配色与粒子密度由 23 状态的 `[data-state]` 规则和粒子预设决定——改这些字段**不会改变外观**。
2. **龙卷风只能手动**：全球没有公开的龙卷风点源数据，自动判定需要风暴报告库，插件**不自动判定** `tornado`，
   只保留手动选择，避免把强雷暴误标。其余 **22 种状态可自动判定**。
3. **台风是代理判据**：用「持续风速 ≥ 118 km/h **且** 海平面气压 ≤ 995 hPa」两个阈值合判，
   不是官方台风编号/路径数据；只有其一不成立就不判台风。
4. **本机开关存 `localStorage`**：胶囊字段、粒子策略、手动天气状态、坐标缓存都只在本机浏览器，换浏览器/清缓存回落默认
   （城市关、时间关、粒子常驻、状态自动）；坐标缓存 30 分钟。
5. **粒子默认常驻**：想要零绘制要把「粒子动效」设为 `off`（或关掉 Host 的 `enabled`），此时组件**不渲染 `<canvas>`**。
6. **没有悬停展开卡**：胶囊就是全部界面；城市名默认关闭（它最长，开着会挤掉会话标题宽度），地名始终在 `title` 提示里。
7. **浏览器半的类型声明已补齐（曾是缺口）**：`package.json` 声明 `"./client".types = "./lib/client.d.ts"`，
   早期 `tsdown.config.ts` 里浏览器半是 `dts: false`，导致该文件并不存在；**现已改为 `dts: true`**，
   `npm run build` 会产出 `lib/client.d.ts`（实测 25158 B），`exports` 映射与实际产物一致。
   运行时与它无关（浏览器半由 `window.__ModuleLoader__` 加载，不做 TS 类型解析），类型只对按子路径 import 的消费者有意义。
8. **`docs/` 随包发布，但 npm 网页上点不开**：`package.json` 的 `files` 包含 `docs`，所以 `docs/RELEASE.md`
   与 `docs/*.png` 会进 tarball（33 条记录里有 4 条是它们）；但 npm 网站不把包内的任意文件当网页服务，
   README 里指向 `docs/RELEASE.md` 的相对链接在 npm 页面上仍然点不开——它在仓库里是正常链接，解包后在本地也能打开。
9. **非 loopback 页面设置不持久化**：settings 客户端在非 loopback 页面进入 `memory` 模式，卡片会提示「当前连接不持久化设置」。
10. **旧 CLI 的客户端盲区**：0.1.7-rc.2 的 `dsh web` 不组合第三方 profile bundle（见第 3 节），客户端行为必须在 0.2.0-rc.2 上验证。
11. **包名与源码目录不同名**：包名是 `dsh-glass-weather`（`dsh-weather` 被别人占用），而源码目录仍是 `D:\dsh\dsh-weather`；
   挂载时 junction / 依赖键 / patch 里的 `name` 用**包名**，`link:` 指向的**路径**是目录名，两者不必一致。

---

## 9. 实际发布与发布后验证

> 本节的命令**尚未实跑**（发布渠道已定为「先只打包 + 检查」，不实际发 npm）。下面是发布当天的操作顺序。

```powershell
cd D:\dsh\dsh-weather

# 1) 登录（本机当前未登录，npm whoami → ENEEDAUTH）
npm login

# 2) 最后确认官方源上还没有 0.2.0
npm view dsh-glass-weather versions --registry=https://registry.npmjs.org

# 3) 发布：必须显式指定官方源，因为本机 registry 指向 npmmirror 镜像
npm publish --access public --registry=https://registry.npmjs.org
```

发布后验证：

```powershell
# 版本与 tarball 地址
npm view dsh-glass-weather@0.2.0 version --registry=https://registry.npmjs.org   # → 0.2.0
npm view dsh-glass-weather@0.2.0 dist.tarball --registry=https://registry.npmjs.org
npm view dsh-glass-weather@0.2.0 dist.integrity --registry=https://registry.npmjs.org

# 真实安装（换一台/换一个隔离 profile 跑，避免本地 link 干扰）
$env:DSH_HOME = "D:\dsh\_release-test\home2"
D:\node_global\dsh.cmd plugin --profile rel-iso2 add dsh-glass-weather
D:\node_global\dsh.cmd --profile rel-iso2 --dump-config | Select-String -Context 2,2 "dsh-glass-weather"
# 期望 → # == dsh-glass-weather / - id: weather / name: dsh-glass-weather
```

应急撤回（只在发布后 72 小时内、且确认没有下游依赖时使用）：

```powershell
npm unpublish dsh-glass-weather@0.2.0 --registry=https://registry.npmjs.org
```

---

## 10. 发布前最终签字表

| # | 检查项 | 通过标准 | 结果 |
|---|---|---|---|
| 1 | 元数据 TODO | `author` / `repository` 已填；`LICENSE` 署名已替换；包名归属已确认 | ☐ |
| 2 | `npm run typecheck` | 无输出，退出码 0 | ☐ |
| 3 | `npm run build` | `lib/` 下恰好 `client.js` / `index.js` / `index.d.ts`，退出码 0 | ☐ |
| 4 | `npm run verify` | `passed: 185   failed: 0`、`all checks passed` | ☐ |
| 5 | `npm pack --dry-run` | 32 条、体积 ≈227 KiB；含 LICENSE/CHANGELOG/docs；不含 `node_modules`/`*.map`/临时文件 | ☐ |
| 6 | 干净 profile 装机 | 隔离 `DSH_HOME` 下 `--dump-config` 出现 `id: weather` / `name: dsh-glass-weather`（并贴 `verify-release.mjs` 报告） | ☐ |
| 7 | 桌面端 0.2.0-rc.2 实测 | 顶栏出现胶囊、设置页出现「天气」页签、`get_weather` 在工具表里 | ☐ |
| 8 | `CHANGELOG.md` | 含 `[0.2.0] - 2026-10-04`，内容与实发一致 | ☐ |
| 9 | 发布后验证 | `npm view dsh-glass-weather@0.2.0 version` → `0.2.0`；市场安装成功 | ☐ |

---

相关文档：[README.md](../README.md)（安装、设置、验证、踩坑）、[CHANGELOG.md](../CHANGELOG.md)、[LICENSE](../LICENSE)。