# 迷案·回声：人物、音乐与 2D 调查候选版

更新：2026-11-28。后端已按用户要求改为在团队 `feat/backend-core/backend/` 上继续开发，沿用 `com.mian.backend.BackendApplication`、Maven Wrapper、统一响应、错误码和 MySQL/Redis/JPA 配置；独立的 `cn.echo` 应用已移除。来源与扩展范围见 [后端基线说明](backend/BACKEND_CORE_ORIGIN.md)。当前公网 Node.js 站点仍保留原版，本轮没有切换线上服务。

## 现在可以玩什么

- 单人选择角色和外观，直接与两名 AI 开场；好友凭链接/房间码加入，准备后开场，支持补 AI 和两人招募；快速匹配按三个不同角色组局。
- 读本、现场、调查、指认分别最多 2、3、7、4 分钟；符合条件可全体确认提前推进，超时补齐主案证物。15–20 分钟仍是待盲测校准的目标。
- 六套人物外观与陈伯固定形象，半身立绘与聊天缩略图分开加载；开场后外观固定。聊天根据稳定的玩家 ID 标识发言人。
- 三段 CC0 无歌词背景音乐，点击才加载播放，初始静音、音量 20%，切换视图不重播，阶段换曲淡出，后台暂停，失败时保留重试入口。
- 四幅宅邸场景中的一个完整调查片段：账房登记 → 出示陈伯 → 检查卧室蓝外套、暖阁门钉布片 → 对照 H01 → 引用证物追问同伴。
- 共享背包、调查记录、一次性事件、重复请求去重、角色私卡、保密选票、个人指认依据与三票复盘。没有决斗系统。

## 直接试玩

本机运行包为 `release/formal-2.0/backend.jar`，由团队原工程打包；下载的工具、运行包和房间数据不进入源码版本库。

先双击根目录 `start-formal.cmd`，保持窗口开启，再打开：

<http://127.0.0.1:8080/>

如果已有一个 8080 服务正在运行，不要重复启动。换端口：

```powershell
powershell -File tools/start-formal.ps1 -Port 8082
```

停止用 Ctrl+C。启动器显式选择 `preview` profile；它用 `backend/data/echo.mv.db` 保存本机试玩房间，也可读取此前候选版的快照。原版 `game/data/` 不会导入或覆盖。刷新使用本人设备中保存的凭据恢复。换浏览器不等于原玩家重连。

## 从源码构建

准备 JDK 25、Node.js 24。Maven 使用团队工程自带的 `backend/mvnw.cmd` / `backend/mvnw`；本机已验证 Wrapper 的 Maven 3.10.1 可以下载并运行。也可用构建脚本参数指定已有 Maven。

```powershell
powershell -File tools/build-formal.ps1
powershell -File tools/start-formal.ps1
```

分开开发：在 `backend/` 执行 `./mvnw spring-boot:run`（Windows 用 `mvnw.cmd`）；另一个终端运行 `npm ci --prefix frontend` 和 `npm run dev --prefix frontend`。默认启动需准备 MySQL、Redis 与数据库环境变量。无数据库的页面试玩可显式设置 `SPRING_PROFILES_ACTIVE=preview`。Vite 将 `/api` 转发到本机 8080，正式构建把页面及素材打入原 backend JAR。

默认配置沿用团队 MySQL/Redis 路线，`DB_URL`、`DB_USER`、`DB_PASSWORD` 和 `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` 由环境注入。Hibernate 保持 `ddl-auto=none`。先在选定数据库明确执行 `sql/migrations/20261128_room_snapshot.sql`，业务代码不再自动建表。

当前游戏快照通过 Spring Data JPA 的实体和 Repository 读写 `echo_rooms`；原有九张业务表不变。已在独立 MySQL 8.0 / Redis 7 容器中验证连接、JPA 写入、整局流程与重启恢复。将游戏状态完整映射到团队九张表、实现 Redis 跨实例匹配与锁仍是后续工作，不能把这些当作已完成。

`preview` / `test` 是明确启用的 H2 试玩及测试配置，不替代默认 MySQL 配置。H2 的专用 SQL 也独立于团队业务表。

本版本只运行一个服务实例。Redis 不是运行前提，也没有实现跨实例匹配。

## 本轮实现位置

| 路径 | 用途 |
|---|---|
| `frontend/src/App.vue` | 首页、房间、调查、讨论、指认与个人复盘 |
| `frontend/src/components/MusicPlayer.vue` | 常驻音乐控制，独立于房间轮询 |
| `frontend/public/assets/manifest.json` | 每件图片和音乐的路径、大小、来源及许可 |
| `backend/src/main/java/com/mian/backend/BackendApplication.java` | 团队原启动类，唯一应用入口 |
| `backend/src/main/java/com/mian/backend/common/` | 团队统一响应、错误码与异常处理 |
| `backend/src/main/java/com/mian/backend/game/GameService.java` | 在原工程中接入的房间、阶段、匹配与调查规则 |
| `backend/src/main/java/com/mian/backend/game/TeammateModel.java` | 可选模型从许可答法中选择，异常回退 |
| `backend/src/main/java/com/mian/backend/persistence/` | JPA 实体、Repository 与事务存储 |
| `backend/src/main/resources/cases/tingyuxuan-2.json` | 冻结的案件包；包含私卡和真相，只放服务端 |
| `backend/src/test/` | 状态、隔离、并发、持久化和模拟模型测试 |
| `tools/formal-smoke.mjs` | 实际 HTTP 整局、重启恢复、头像与音频验收 |

## AI 与证据边界

不配置模型也能完整游玩。本地回复先区分时间、人物与证物问题，按角色口吻引用已公开材料。AI 在现场及调查开场 1–2 秒内查证、发言，指认阶段独立投票，不读取真人选票。

可选设置 `AI_URL`（完整 chat-completions URL）、`AI_MODEL`、`AI_KEY`。模型输入仅含角色名、当前问题、公开证物和许可答法。当前采用更保守的“选择许可答法”方式，任意生成的模型文字都不会发布。2.5 秒未完成则使用本地答法；进入新阶段即丢弃迟到回复。每个 AI 同时只处理一个问题，每局最多 60 次点名追问。

日记先展示【C12】生前原文，再解释其边界。H01 只是对【C10】的细读，不是新的独立见证，不能与 C10 重复计算为两份独立身份证据。所有主案证物都有证据板调查和定时补发路径。

## 接口约定

请求和返回均为 JSON。所有 `/api` 接口沿用团队 `{code,msg,data}`：`code === 0` 才成功，业务失败的 `data` 为 null，由原全局异常组件返回。房间凭据使用 `Authorization: Bearer <token>`，房间码本身不能读取私卡。`/healthz` 是原试玩兼容的基础设施探针；`/api/health` 则保持团队原响应。

| 接口 | 主要参数或返回 |
|---|---|
| `GET /api/bootstrap` | 公共角色、六个外观、备案展示配置 |
| `GET /api/health` | 团队原接口，返回 `{code:0,msg:"success",data:"UP"}` |
| `GET /api/game/role` | 本人角色 VO：`characterName/publicInfo/privateSecret/playGuide/avatarColor`，附加外观 ID |
| `POST /api/game/ask-npc` | 团队原路径，`npcId:1/2`、`question`；凭 token 定位本人房间，阶段与记录授权照常校验 |
| `POST /api/create`、`/api/join`、`/api/solo` | `name`、`role`、`avatarId`；加入时带 `code`；返回本人 `token` 与 `state` |
| `POST /api/match`、`GET /api/match`、`POST /api/match/cancel` | 入队携带外观，查询和取消凭私有 token；匹配成功返回房间 |
| `GET /api/room/{code}/state` | 本人视图、毫秒 `serverTime`、团队约定的时间字符串 `phaseDeadline`，附加毫秒 `phaseDeadlineMs`、`players[].isReady` |
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

独立测试实例先使用独立端口和数据库。固定域名切换前备份原 Node 数据、保留旧程序和 Caddy 配置。已有 Node 房间仍由原服务完成，不能将其 JSON 直接当作新库导入；此前正式候选版的 `echo_rooms` 快照结构保持兼容。

验收步骤与真实记录见 `FORMAL_ACCEPTANCE.md`。决斗仅保留为远期支线，本版本没有入口、道具效果或胜负规则。
