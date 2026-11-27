# 迷案·回声：人物、音乐与 2D 调查候选版

更新：2026-11-27。此目录实现了 Vue 3 + Spring Boot 4.1.2 / JDK 25 路线，可在独立本地实例试玩。当前公网 Node.js 站点仍保留原版，本轮没有切换线上服务。

## 现在可以玩什么

- 单人选择角色和外观，直接与两名 AI 开场；好友凭链接/房间码加入，准备后开场，支持补 AI 和两人招募；快速匹配按三个不同角色组局。
- 读本、现场、调查、指认分别最多 2、3、7、4 分钟；符合条件可全体确认提前推进，超时补齐主案证物。15–20 分钟仍是待盲测校准的目标。
- 六套人物外观与陈伯固定形象，半身立绘与聊天缩略图分开加载；开场后外观固定。聊天根据稳定的玩家 ID 标识发言人。
- 三段 CC0 无歌词背景音乐，点击才加载播放，初始静音、音量 20%，切换视图不重播，阶段换曲淡出，后台暂停，失败时保留重试入口。
- 四幅宅邸场景中的一个完整调查片段：账房登记 → 出示陈伯 → 检查卧室蓝外套、暖阁门钉布片 → 对照 H01 → 引用证物追问同伴。
- 共享背包、调查记录、一次性事件、重复请求去重、角色私卡、保密选票、个人指认依据与三票复盘。没有决斗系统。

## 直接试玩

本机已准备 `release/formal-2.0/mian-echo.jar` 和项目内独立 JDK；这些下载的工具、运行包和房间数据不进入源码版本库。

先双击根目录 `start-formal.cmd`，保持窗口开启，再打开：

<http://127.0.0.1:8080/>

如果已有一个 8080 服务正在运行，不要重复启动。换端口：

```powershell
powershell -File tools/start-formal.ps1 -Port 8082
```

停止用 Ctrl+C。`backend/data/echo.mv.db` 保存本机正式候选版房间，原版 `game/data/` 不会导入或覆盖。刷新使用本人设备中保存的凭据恢复。换浏览器不等于原玩家重连。

## 从源码构建

准备 JDK 25、Maven 3.6.3+、Node.js 24。可用系统安装，也可通过脚本参数指定位置；脚本会优先使用项目 `.tools/` 已下载工具。

```powershell
powershell -File tools/build-formal.ps1
powershell -File tools/start-formal.ps1
```

分开开发：在 `backend/` 执行 `mvn spring-boot:run`；另一个终端运行 `npm ci --prefix frontend` 和 `npm run dev --prefix frontend`。Vite 将 `/api` 转发到本机 8080。正式构建把页面及素材打入同一个 JAR，不需要用户加载外部字体或前端 CDN。

默认 H2 文件库用于隔离试玩，MySQL 可通过 `DB_URL`、`DB_USER`、`DB_PASSWORD` 接入独立数据库；实际 MySQL 环境尚未联调。当前实现以 `echo_rooms` 表保存完整房间快照，不会改动团队现有九张业务表。将快照拆为团队业务表属于下一次接口迁移，不能直接宣称已经完成。

本版本只运行一个服务实例。Redis 不是运行前提，也没有实现跨实例匹配。

## 本轮实现位置

| 路径 | 用途 |
|---|---|
| `frontend/src/App.vue` | 首页、房间、调查、讨论、指认与个人复盘 |
| `frontend/src/components/MusicPlayer.vue` | 常驻音乐控制，独立于房间轮询 |
| `frontend/public/assets/manifest.json` | 每件图片和音乐的路径、大小、来源及许可 |
| `backend/src/main/java/cn/echo/game/GameService.java` | 服务端房间与阶段规则、角色权限、匹配、调查触发 |
| `backend/src/main/java/cn/echo/game/TeammateModel.java` | 可选模型从许可答法中选择，异常回退 |
| `backend/src/main/resources/cases/tingyuxuan-2.json` | 冻结的案件包；包含私卡和真相，只放服务端 |
| `backend/src/test/` | 状态、隔离、并发、持久化和模拟模型测试 |
| `tools/formal-smoke.mjs` | 实际 HTTP 整局、重启恢复、头像与音频验收 |

## AI 与证据边界

不配置模型也能完整游玩。本地回复先区分时间、人物与证物问题，按角色口吻引用已公开材料。AI 在现场及调查开场 1–2 秒内查证、发言，指认阶段独立投票，不读取真人选票。

可选设置 `AI_URL`（完整 chat-completions URL）、`AI_MODEL`、`AI_KEY`。模型输入仅含角色名、当前问题、公开证物和许可答法。当前采用更保守的“选择许可答法”方式，任意生成的模型文字都不会发布。2.5 秒未完成则使用本地答法；进入新阶段即丢弃迟到回复。每个 AI 同时只处理一个问题，每局最多 60 次点名追问。

日记先展示【C12】生前原文，再解释其边界。H01 只是对【C10】的细读，不是新的独立见证，不能与 C10 重复计算为两份独立身份证据。所有主案证物都有证据板调查和定时补发路径。

## 接口约定

请求和返回均为 JSON；房间凭据使用 `Authorization: Bearer <token>`，房间码本身不能读取私卡。新代码使用独立正式版协议，原 Node 协议由旧服务继续支持。

| 接口 | 主要参数或返回 |
|---|---|
| `GET /api/bootstrap` | 公共角色、六个外观、备案展示配置 |
| `POST /api/create`、`/api/join`、`/api/solo` | `name`、`role`、`avatarId`；加入时带 `code`；返回本人 `token` 与 `state` |
| `POST /api/match`、`GET /api/match`、`POST /api/match/cancel` | 入队携带外观，查询和取消凭私有 token；匹配成功返回房间 |
| `GET /api/room/{code}/state` | 本人视图、`serverTime`、`phaseDeadline`（均为毫秒时间戳）、`players[].isReady` |
| `POST /api/room/{code}/seat`、`ready`、`start` | 选角色/外观；`ready` 使用明确布尔值，重复请求不反转 |
| `POST /api/room/{code}/recruit`、`cancel-recruit`、`add-bot` | 只有房主可操作，竞争席位在服务端同一锁内处理 |
| `POST /api/room/{code}/phase-ready` | `phase` 必须与服务端当前阶段一致 |
| `POST /api/room/{code}/clue`、`message` | `clueId`、`text`、可选 `to` / `replyTo`；只能引用本房间公开证物和消息 |
| `POST /api/room/{code}/inspect`、`present`、`compare` | `phase`、`target`；出示加 `itemId`；返回固定 `outcome` 和更新后的本人视图 |
| `POST /api/room/{code}/ask` | `npc: chen/diary`、`text`、可选 `clueId` |
| `POST /api/room/{code}/vote` | `phase`、其他席位的 `target`、1–2 个 `clueIds`；空 target 为弃票 |
| `POST /api/room/{code}/leave` | 仅未开场房间可释放席位 |

操作可带 `requestId`；同一玩家重复请求返回现有结果。探索事件额外有房间级触发去重。所有调查动作、角色、阶段、前置物品和引用权限均由服务端核验。`scenes`、`items` 是调查阶段的公共数据；触发条件和隐藏文案不会提前下发。

## 素材

人物和场景为本项目生成的原创虚构插画，不把它们标注为 CC0。三段音乐分别来自 OpenGameArt 作者发布页的 CC0 素材：Whispers in the Fog、Ancient Mysteries、CC0 - Mystery；来源与原文件链接记录在素材清单。音频做了 45 秒循环交叉淡化、响度归一与 64kbps MP3 编码，每段约 361KB。

原始主案证物优先于背景插画的装饰细节。背景上的泛化纸张、灯具和陈设不构成额外证据。

## 后续上线门槛

自动化与桌面浏览器通过后，仍需三组未读过真相的真人盲测，以及 iPhone Safari、Android Chrome 的真机音乐/后台/键盘检查。当前没有这些实测结论。

独立测试实例先使用独立端口和数据库。固定域名切换前备份原 Node 数据、保留旧程序和 Caddy 配置。新旧房间格式不同，已有 Node 房间应由原服务完成，不能将旧 JSON 直接当成新库导入。

验收步骤与真实记录见 `FORMAL_ACCEPTANCE.md`。决斗仅保留为远期支线，本版本没有入口、道具效果或胜负规则。
