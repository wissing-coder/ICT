# 正式候选版验收记录

当前记录日期：2026-11-28。以下自动化和浏览器记录不是真人盲测结论。

## 2026-11-28：对齐团队后端后的检查

基线：`feat/backend-core/backend/`，Spring Boot 4.1.2 + JDK 25，入口 `com.mian.backend.BackendApplication`。`cn.echo` 应用已移除。基线来源与扩展范围见 `backend/BACKEND_CORE_ORIGIN.md`。

| 检查 | 实际结果 |
|---|---|
| 常规后端检查 | 24 项通过：原工程上下文 1、游戏 15、模型 4、统一接口契约 4 |
| 统一响应 | `/api/health` 保持 `code/msg/data` 和 `UP`；游戏成功/业务失败、JSON 错误、私卡与盘问接口也使用该约定 |
| 时间兼容 | `serverTime` 为毫秒；`phaseDeadline` 保留字符串；附加 `phaseDeadlineMs`，Vue 使用单调时钟推进 |
| JPA 持久化 | 游戏存储改用 Spring Data JPA；H2 与真实 MySQL 均完成整局与 JVM 重启后恢复 |
| MySQL/Redis 实测 | 在两个仅本机可访问的独立临时容器验证，2 项通过：MySQL 8.0 元数据与 Redis PONG、JPA 提交与重新读取；其他项目容器与数据库未修改 |
| HTTP H2 整局 | 独立目录启动原 backend JAR，现场→调查链→AI→指认→复盘、好友补 AI、三角色匹配、重启恢复及音频 Range 均通过；一次本地 AI 接口约 5ms |
| HTTP MySQL 整局 | 同样流程与重启恢复通过；一次本地 AI 接口约 15ms。不等同于手机或公网端到端延迟 |
| 原工程构建方式 | Maven Wrapper 实际下载并运行 Maven 3.10.1 成功；JPA/WebMVC/Redis/Validation 依赖全部保留 |
| 前端构建 | Vue 构建通过，已适配统一响应；头像、音乐与调查资源未改变 |
| 迁移后浏览器 | 旧房间可直接恢复；独立会话完成单人开场、私卡、倒计时、阶段确认、证物追问 AI 与刷新重连，未见浏览器 error 记录。没有把这次检查当作真机盲测 |

常规检查使用 `test` profile，独立基础设施检查由 `ECHO_INFRA_INTEGRATION=yes` 明确启用。生产默认维持 MySQL 与 `ddl-auto=none`，快照表通过明确执行 SQL 准备，不由 Hibernate 或游戏代码自动建表。

## 2026-11-27：原候选版历史记录

下表记录此前独立候选版的检查，不代表新后端在所有真实设备上已验收。

## 已完成

| 检查 | 结果及边界 |
|---|---|
| 原 Node 试玩版回归 | 本机保留的部署分支副本（`deploy/ecs-preview-20261126`）：`node --test game/game.test.mjs` 共 16 项通过；正式版功能分支保留 main 中冻结的 `game/`，不以本次上传覆盖团队原型 |
| 正式版服务规则 | `GameServiceTest`：15 项通过，覆盖选角与外观锁定、明确准备、同名身份、私卡隔离、引用权限、选票保密、过期确认、超时补证、恢复、匹配、竞争补位 |
| 模拟模型 | `TeammateModelTest`：4 项通过，正常许可选择、无效/越界输出、本地超时兜底、阶段变化后的迟到回复丢弃 |
| 同时对照 | 12 个并发操作只记录一次 H01 奖励 |
| HTTP 实际整局 | `tools/formal-smoke.mjs`：读本 → 现场 → 账房链 → 引用 AI → 指认 → 三票复盘通过 |
| HTTP 重启 | 结束测试 JVM，再启动同一独立测试数据库，原 token 恢复阶段、外观和背包 |
| 入口 | HTTP 验证单人双 AI、两人补 AI、三角色真人匹配；规则测试覆盖好友候场流程与招募权限 |
| 媒体传输 | MP3 `HEAD 200`，`Range bytes=0-99` 返回 `206` 与 100 字节 |
| 本地回复时延 | HTTP 一次点名追问约 4ms；不等同于真实手机或公网端到端耗时 |
| 浏览器实际操作 | 本机内置浏览器完成单人开场、读本确认、音乐启用、引用追问、回复返回证物、账房登记与出示、蓝外套/布片检查、H01、私密指认与个人复盘 |
| 浏览器重连 | 重启应用后刷新，恢复同一房间、本人身份、私卡和阶段 |
| 页面尺寸 | 390×844、768×1024、1440×900 检查；未出现页面横向溢出。窄屏完成指认和复盘查看，不等同于真机 Safari/Chrome 验收 |
| 页面错误 | 所检查流程未见浏览器 error/warn 记录 |
| 构建 | `npm run build --prefix frontend` 通过；Java 测试与 JAR 打包通过，前端与素材嵌入运行包 |

## 复测

```powershell
npm ci --prefix frontend
npm run build --prefix frontend
# JAVA_HOME 指向 JDK 25，mvn 可使用项目 .tools 下已下载版本
backend/mvnw.cmd -f backend/pom.xml verify
node --test game/game.test.mjs
node tools/formal-smoke.mjs backend/target/backend-0.0.1-SNAPSHOT.jar
```

HTTP 测试使用本机端口 19879，以及 `.tools/smoke-*.mv.db` 独立数据库，不写入实际试玩房间。日志在 `.tools/formal-smoke.log`，不应上传。

## 尚未完成，不能据此发布通过结论

- 三组未读过真相的三人真人盲测：首个主动追问、每人的有效互动、卡关与总时长。
- 真机 iPhone Safari、Android Chrome：首次播放、后台恢复、弱网、键盘与素材缓存。
- 三台独立设备同房、异网访问新的正式候选版。
- 团队九表的完整游戏业务映射、Redis 跨实例匹配和锁；本次 MySQL/JPA 快照联调与 Redis 连接已验证，不能将它们等同于完整九表架构落地。
- 当前域名上的正式版替换、线上备份恢复演练；旧 Node 站点继续保留。

## 真人试玩记录模板

每组另存一份，勿提前提供真相材料：

| 字段 | 填写 |
|---|---|
| 日期、设备与网络 | |
| 三名角色及是否首次玩 | |
| 进入读本时间 | |
| 首次主动引用证物追问时间 | |
| 每位玩家各一次有效对质 | |
| 账房链在哪步卡住、是否用了提示 | |
| 到达结算的实际分钟数 | |
| 每人的投票、证物与改变判断的对话 | |
| 音乐、加载、后台或刷新异常 | |
| 需要修订的具体问题 | |

只有真实记录满足门槛后，才把候选版切换为公网默认版本。15–20 分钟和“三人都主动参与”仍需由这些记录验证。
