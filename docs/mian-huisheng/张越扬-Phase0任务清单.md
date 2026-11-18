# 张越扬 · Phase 0 任务清单（11/15 – 11/29）

> 角色：后端 + 运维，兼**进度协调人**
> 来源：《三人分工与协作规则.md》第三节 Phase 0、第四节接口契约、第八节验收标准
> 最后更新：**11/18（周三）** ｜ Phase 0 已过 4 天，剩 11 天
> 状态图例：✅ 已完成并验证 ｜ 🟡 部分完成 ｜ ⏸ 被他人/外部阻塞 ｜ ⬜ 未开始

---

## 一、P0 主线任务

### 1. 仓库与环境（🔴 最先做，另两人都卡在这）

- 🟡 GitHub 仓库 —— 远程仓库**已创建**（队友已推 9 个 commit），但**你的本地仓库还没关联远程、没推上去**
- 🟡 分支模型 —— 模型已写进 README / DECISIONS（D-09），但 `feat/backend-core` 分支**还没实际创建**（本地仍在 master）
- ✅ `.gitignore`（11/17）—— `.env`、`application-local.yml`、`*.zip` 均已排除，且用 `git check-ignore` 实测验证过
- ✅ README 骨架（11/18）—— 含启动步骤、错误码表、三个接口契约、防泄密红线、分支模型、commit 规范、密钥管理、国内镜像源排障
- ⬜ 给陆豪、张宇恒开写权限 —— ⚠️ **待确认**：仓库已建好，去 Settings → Collaborators 核对两人是否都有写权限
- ✅ `docker-compose.yml`（11/18）—— MySQL 8 + Redis 7，**已实测通过**：两容器 healthy、9 张表建成、中文注释无乱码
- ⏸ **验收：三人各自 `docker compose up -d` 都能起** —— 你这边已通过，**队友那边未完成**（zip 是否已发出待确认）

> 🔴 修复记录（11/18）：MySQL 官方镜像初始化客户端默认 latin1，中文 COMMENT 曾被双重编码成乱码。已在两个 SQL 首行加 `SET NAMES utf8mb4;` 根治，并登记为 D-18。**旧版 zip 有这个问题，队友必须用新包并 `down -v` 重建。**

### 2. Spring Boot 骨架

> ⚠️ 版本变更：原计划 Boot 3，实际采用 **Boot 4.1.2 + JDK 25**（决策 D-20，理由：Boot 3.5 的 OSS 免费支持已于 2026-06-30 结束）。**需在站会同步给队友**，他们的环境和 CI 都要对齐。

- ✅ 项目能启动，`/api/health` 返回 200（11/18 实测）—— 响应 `{"code":0,"msg":"success","data":"UP"}`
- ✅ 统一响应体 `Result<T>`（11/18）—— record 实现，`code` / `msg` / `data`
- ✅ 全局异常处理（11/18）—— `GlobalExceptionHandler`：参数校验失败 → 1001、业务异常 → 对应码、兜底 → 5000 且**日志留全栈、响应不泄堆栈**
- 🟡 参数校验 —— 依赖与异常处理已就绪，**还没有带 `@Valid` 的业务 DTO**（Phase 1 写接口时落地）
- ✅ 错误码表（11/18）—— 已写进 README，并实现为 `ErrorCode` 枚举（10 个契约码 + `5000` 兜底）
- ✅ 骨架已提交 git（commit `adee587`）

### 3. 数据库

- ✅ `schema.sql`（9 张表，11/18）—— **已实测**：容器启动自动建库建表，`SHOW TABLES` 返回 9 张，中文表注释正常
- ⏸ `init_data.sql`（剧本数据）—— 仅占位文件，**卡在张宇恒剧本定稿（Q-05）**
- ✅ 容器启动自动建库、建表 —— 已验证；**灌数据待剧本定稿**
- ⏸ **验收：库里有 1 剧本 / 4 角色 / 2 NPC / 14 线索** —— 依赖上一条

> 相关决策：D-22 `ddl-auto=none` —— 表结构**只由 schema.sql 管理**，Hibernate 禁止改表。

### 4. 接口契约（🔴 Phase 0 必须定死，写进 README，之后不许单方面改）

✅ **契约文档已全部写进 README（11/18），本阶段目标达成。** 以下是契约内容，**具体接口实现属于 Phase 1**：

- ⬜ `GET /api/room/{id}/state`（你写，前端每 2 秒轮询）—— 字段：roomId、status、phase、currentRound、phaseDeadline、players[]（seat/userId/nickname/characterName/avatarColor/isConnected）、npcList[]（npcId/name/type/remainQuota）、myClueCount
- ⬜ `GET /api/game/role`（你写，张宇恒用）—— 字段：characterName、publicInfo、privateSecret、playGuide、avatarColor
- ⬜ `POST /api/game/ask-npc`：核心由陆豪写，**你提供 Redis 支撑**（配额扣减）
- ⬜ 🔴 用专门的 VO，**绝不直接返回 Entity**（实现时必须守）
- ⬜ 🔴 三个接口响应体里绝对不能出现：`groundTruth`、`leakKeywords`、`isMurderer`、他人的 `privateSecret`

### 5. 大模型账号

- ⬜ 和陆豪一起申请 DeepSeek / 通义千问 / 智谱 三家 API，三家都能调通一次（对应 Q-04）

---

## 二、P1（主线跑通后再做）

- ⬜ GitHub Actions CI：后端测试 + 前端构建，push 后能看到绿灯
- ⬜ 验收：**CI 跑通一次绿灯**

> ⚠️ 依赖：需先把本地仓库推到远程。另外 CI 的 Java 版本要对齐 **JDK 25**（原技术方案里写的是 17，需改）——技术方案第 585 行 `java-version: '17'` 已过期。

---

## 三、协调人职责（不属于代码，但不能漏）

- ✅ 建 `DECISIONS.md`（11/18）—— 已录入 **D-01 ~ D-22** 共 22 条决策、决策权归属表、阶段节点、6 项待确认事项
- ⬜ 开第一次站会，定每天固定时间（建议晚 9 点、15 分钟）—— 🔴 **已逾期 3 天**（Q-03），这是唯一的强制节奏，别再拖
- ⬜ 确认期末考试和寒假的准确日期（Q-02）—— 决定 Phase 3 起点
- ⬜ 每周五检查一次进度，落后就按第七节砍范围
- ✅ 决策权已明确记录在 DECISIONS.md 第二节（表结构、接口、部署归你；范围砍不砍你有最终决定权）

---

## 四、11/29 你要保证达成的验收项

| 验收项 | 状态 |
|---|---|
| 三人各自 `docker compose up -d` 都能起 MySQL + Redis | 🟡 你已通过，队友待完成 |
| Spring Boot 能启动，`/api/health` 返回 200 | ✅ **已达成（11/18）** |
| 数据库里有 1 剧本 / 4 角色 / 2 NPC / 14 线索 | ⏸ 卡在剧本定稿 |
| GitHub Actions CI 跑通一次绿灯 | ⬜ 未开始 |
| `DECISIONS.md` 已建立并有首批记录 | ✅ **已达成（11/18，22 条）** |

（前端 8 页面、Prompt 记录 ≥30 轮、剧本定稿是另两人的验收项，但站会上要盯）

---

## 五、环境安装（原清单未列，11/18 补记）

- ✅ WSL2 引擎 3.0.5.0（内核 6.18.58.1-1）—— 无 Linux 发行版，Docker Desktop 自建 `docker-desktop`，不需要 Ubuntu
- ✅ Docker Desktop —— WSL2 后端，引擎 29.9.3
- ✅ JDK 25.0.5 Temurin LTS —— 静默安装，机器级 JAVA_HOME 已配
- ✅ 镜像源 —— `docker.m.daocloud.io` 等 4 个实测可用，方法写进 README（D-19）
- ✅ Maven 分发包源改阿里云镜像

> ⚠️ 遗留小问题：JDK 的 `bin` 目录**没自动进系统 PATH**（msi 的 Feature 没生效）。当前用全路径可正常工作，**新终端里 `java` 命令可能仍找不到**。想彻底修好：手动把 `C:\Program Files\Eclipse Adoptium\jdk-25.0.5.8-hotspot\bin` 加进系统 PATH，或重跑 msi 选 Modify 补勾 "Add to PATH"。

---

## 六、下一步（按优先级）

### 🔴 今天要做的三件事（都不依赖技术，只依赖你出面）

1. **开站会** —— 已逾期 3 天。当场定三件事：站会固定时间（Q-03）、期末考试日期（Q-02）、**同步 D-20 版本决策**（Boot 4.1 + JDK 25，队友环境要对齐）
2. **发新 zip 给队友** —— [mian-env.zip](<D:\Projects\mian-nailong\mian-env.zip>) 是修复版；旧包发过的话必须说明「以新包为准 + 需 `docker compose down -v` 重建」
3. **三家 API 注册**（和陆豪一起）—— 注册即用，但实名认证要时间，别拖到 Phase 2

### 接着做（技术侧）

4. **关联远程仓库 + 推 PR** —— `git remote add origin <地址>` → fetch → 建 `feat/backend-core` → merge（会有 README 冲突，两边内容都保留）→ push → 开 PR
5. 核对两人仓库写权限
6. GitHub Actions CI（Java 版本改成 25）

### 被阻塞的（盯，但推不动）

7. `init_data.sql` 灌数据 —— 等张宇恒剧本定稿（Q-05）
8. 买不买云服务器 —— Phase 3 初再定（Q-06）

---

## 七、建议顺序（原版保留，实际执行情况见上）

1. **仓库 + `.gitignore` + `docker-compose.yml`** ✅ 已完成
2. Spring Boot 骨架 + `Result<T>` + 异常处理 + 错误码表 ✅ 已完成
3. 接口契约写进 README ✅ 已完成
4. `schema.sql` + `init_data.sql` 🟡 表结构完成，数据待剧本
5. 三家大模型账号调通 ⬜
6. CI ⬜

> 关键提醒：契约定死 + 陆豪用假数据先行，是你们能真正并行的前提。**契约已定死（第 3 步完成），现在就该在站会上告诉陆豪可以开工了。**
