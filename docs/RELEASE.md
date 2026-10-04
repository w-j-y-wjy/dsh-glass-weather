# 发布清单 · dsh-glass-weather 0.2.0

## 一次性准备

- 注册并登录 npm（本机 `npm whoami` 未登录时）：
  `npm adduser --auth-type=legacy --registry=https://registry.npmjs.org`
- 本机 registry 是 npmmirror 镜像，**发布必须显式带 `--registry`**。
- 包名 `dsh-glass-weather`（`dsh-weather` 已被他人占用）。

## 发布前跑这四条（都应全绿）

| 命令 | 期望 |
|---|---|
| `npm run typecheck` | 0 报错 |
| `npm run build` | `lib/` 出 4 个文件：`client.js` / `client.d.ts` / `index.js` / `index.d.ts` |
| `npm run verify` | `passed: 185   failed: 0` |
| `npm run verify:release` | 19/19：打包 → 包内复验 185 → 隔离 profile 里组装 patch |

## 发布

```powershell
npm publish --access public --registry=https://registry.npmjs.org
```

## 发布后自查

```powershell
npm view dsh-glass-weather@0.2.0 version --registry=https://registry.npmjs.org
```

再用浏览器打开 npm 页面，确认 README 与三张截图渲染正常。

## 已知限制

1. Host 旧字段（`rainColor` / `densityScale` 等）仍在 schema 里被校验，但**不影响外观**——外观由 23 状态决定。
2. 龙卷风没有公开数据源，只能手动选；台风用「风 ≥ 118 km/h 且气压 ≤ 995 hPa」代理判定。
3. 本机开关存 `localStorage`，换浏览器或清缓存会回落默认。
4. 浏览器半类型文件已随构建产出（`lib/client.d.ts`），`exports` 与实际产物一致。

## 仓库

<https://github.com/w-j-y-wjy/dsh-glass-weather>