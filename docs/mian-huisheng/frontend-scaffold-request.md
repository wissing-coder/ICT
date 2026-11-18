# 前端脚手架需求单

> Phase 0 用。分工表里脚手架归陆豪（Vue 3 + Vite + 路由 + 8 个空页面），
> 6 个业务页面与全局样式归张宇恒。为避免建好之后返工，建之前先对齐这几条。
>
> 张宇恒　｜　2026-11-18

> **V2 附注（2026-11-18）**：方案 V2.0 把页面定为 **7 个**（首页与建房、房间与准备、角色卡与偏好、
> 游戏主界面、管家与日记盘问、证物与投票、结果与复盘）。下面第 3 节的路由表是按旧 8 页写的，
> **以 V2 的 7 页为准**；目录结构、代理、别名、「请不要做的」三节仍然有效。
> 另外 V2 要求「重连凭据」——刷新后要恢复角色与阶段，前端需要把令牌存在本设备并随请求带上。

## 一、必要项（现在定，改起来贵）

### 1. 版本与包管理

| 项 | 建议 |
|---|---|
| Node | 20 LTS（和 GitHub Actions 里 `setup-node` 的版本保持一致） |
| Vue / Vite | Vue 3.4+ / Vite 5 |
| 路由 / 状态 | Vue Router 4 / Pinia 2 |
| 包管理 | npm 或 pnpm 都行，**说一声就行**，别两个人用不同的 |

### 2. 目录结构

建脚手架时把这个骨架一次建全，我按这个结构往里填，不用再挪文件：

```
frontend/
├── index.html                    ← 加移动端 viewport meta
├── vite.config.js                ← 别名 @ → src；/api 代理到 :8080
├── package.json
└── src/
    ├── main.js
    ├── App.vue
    ├── router/
    │   └── index.js              ← 8 条路由集中在这，带 name
    ├── stores/                   ← Pinia（张宇恒补 auth.js / room.js）
    ├── api/                      ← 张宇恒补
    │   ├── request.js            ← 统一 axios 实例 + 响应拦截
    │   ├── auth.js
    │   ├── room.js
    │   └── game.js
    ├── mock/                     ← 张宇恒补（假数据 + 开关）
    ├── styles/
    │   ├── variables.css         ← 张宇恒写（民国风配色变量）
    │   └── base.css              ← reset + 全局排版
    ├── components/               ← 公共组件（SeatCard / Countdown / Modal）
    └── views/
        ├── Login.vue             ← 登录/注册（一个页面切 tab）
        ├── Lobby.vue
        ├── Room.vue
        ├── RoleCard.vue
        ├── Vote.vue
        ├── Result.vue
        ├── Interrogate.vue       ← 陆豪
        └── Discuss.vue           ← 陆豪
```

### 3. 路由表（8 条，一次建好）

| path | name | 谁写 |
|---|---|---|
| `/login` | `login` | 张宇恒 |
| `/lobby` | `lobby` | 张宇恒 |
| `/room/:id` | `room` | 张宇恒 |
| `/role` | `roleCard` | 张宇恒 |
| `/vote` | `vote` | 张宇恒 |
| `/result` | `result` | 张宇恒 |
| `/interrogate` | `interrogate` | 陆豪 |
| `/discuss` | `discuss` | 陆豪 |

**要求**：跳转一律用 `name`，不要写死 path——后面加参数或改路径时不用全项目搜字符串。

### 4. 工程约定

- **路径别名**：`@` → `src`（`vite.config.js` 里配，同时加 `jsconfig.json` 让 VS Code 能跳转）
- **开发代理**：`server.proxy` 把 `/api` 转到 `http://localhost:8080`，前端请求一律写 `/api/...`，不写完整域名
- **环境变量**：`VITE_API_BASE_URL`，本地放 `.env.development`（**必须进 `.gitignore`**）
- **默认路由**：`/` 重定向到 `/login`

### 5. 移动端基础

- `index.html` 里加 `<meta name="viewport" content="width=device-width, initial-scale=1">`
- **不要**上 rem / vw 适配方案。6 个页面用弹性布局 + px 就够，多一层换算会让调试变慢

## 二、可选项（做了更好，不做不阻塞）

- **ESLint + Prettier**：建议 Phase 0 就配，两个人以上写前端，格式不统一后期 diff 会很难看
- `.npmrc` 配国内镜像（如果你那边装包慢）
- `package.json` 里加 `dev` / `build` / `preview` 三个脚本

## 三、请不要做的（会打架）

- **不要预置 UI 组件库**（Element Plus / Naive UI 之类）。民国风靠 CSS 变量 + 手写卡片，引入组件库它的默认样式会和视觉基调冲突，清理成本比手写高
- **不要写页面内容和样式**。6 个页面我自己填，你只留空壳 + `<h1>页面名</h1>` 占位
- **不要装 Tailwind**。同理，和自定义变量体系重复

## 四、交付时请附一句

1. Node 版本、用 npm 还是 pnpm、跑起来的命令
2. 8 条路由的 `name` 列表（我按这个跳转）
3. 建在哪个分支（`feat/frontend-ask` 还是先合 `main`）

**验收标准**：`npm run dev` 能起来、8 条路由手动改地址都能跳、`variables.css` 里改一个颜色能全局生效。
