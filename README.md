# 《迷案》· 多人在线 AI 剧本杀

> 3-4 人联机推理游戏。技术核心：**让大模型扮演一个知道真相、但必须守住秘密的角色**。
> 独立项目，不参赛。软截止 2027-02-28。
>
> 配套文档：`DECISIONS.md`（决策记录）｜《AI剧本杀技术方案.md》｜《剧本数据-迷案.md》

---

## 一、团队

| 成员 | 角色 | 分支 |
|---|---|---|
| 张越扬 | 后端 + 运维（兼进度协调人） | `feat/backend-core` |
| 陆豪 | AI 负责人 | `feat/ai-npc`、`feat/frontend-ask` |
| 张宇恒 | 前端 + 内容 + 质量 | `feat/frontend-pages`、`content/script` |

---

## 二、技术栈

| 层 | 选型 |
|---|---|
| 后端 | Spring Boot 3 + Java 17 |
| 前端 | Vue 3 + Vite |
| 数据库 | MySQL 8.0 |
| 缓存 / 锁 | Redis 7 |
| 大模型 | DeepSeek / 通义千问 / 智谱（三家可切换） |
| 容器 | Docker Compose（本地）→ 云服务器（Phase 3） |
| CI | GitHub Actions |

---

## 三、如何从零跑起来

### 前置要求

- Docker Desktop（Windows 需先装 WSL2，勾选 "Use WSL 2 based engine"）
- JDK 17 或 21（Maven 不用装，用项目自带的 `mvnw`）
- Node.js 20+

### 1. 克隆仓库

```bash
git clone <仓库地址>
cd mian-nailong
```

### 2. 起 MySQL + Redis

```bash
docker compose up -d
docker compose ps          # 两个服务都显示 healthy 才算成功
```

验证 9 张表已建好：

```bash
docker exec mian-mysql mysql -uroot -proot123456 mian -e "SHOW TABLES;"
```

应列出：`user`、`script`、`character`、`npc`、`clue`、`game_room`、`room_player`、`ai_dialogue`、`vote`

### 3. 配置密钥（🔴 不要跳过）

复制示例文件，填入你自己的密钥：

```bash
cp application-local.yml.example application-local.yml
```

`application-local.yml` 和 `.env` **已被 `.gitignore` 排除，绝不能提交**。

### 4. 启动后端

```bash
cd backend
./mvnw spring-boot:run        # Windows 用 .\mvnw
curl http://localhost:8080/api/health
```

返回 `{"code":0,"msg":"success","data":"UP"}` 即成功。

### 5. 启动前端

```bash
cd frontend
npm install
npm run dev
```

### 常用 Docker 命令

```bash
docker compose up -d        # 起 MySQL + Redis
docker compose logs -f      # 看日志
docker compose down         # 停（数据保留）
docker compose down -v      # 停并清空数据（重来时用）
```

---

## 四、目录结构

```
mian-nailong/
├── backend/                  # Spring Boot 3
├── frontend/                 # Vue 3 + Vite
├── sql/
│   ├── schema.sql            # 9 张表结构（容器启动自动执行）
│   └── init_data.sql         # 剧本初始化数据（待剧本定稿后填充）
├── docker-compose.yml        # MySQL 8 + Redis 7
├── DECISIONS.md              # 项目决策记录
└── README.md
```

---

## 五、🔴 接口契约（Phase 0 定死，之后不许单方面改）

> 学生团队散伙的第一原因不是能力不够，是**两个人对同一个接口的理解不一样**。
> 改契约必须先开 PR 讨论，三人同意后才能改。

### 5.1 统一响应体

```json
{
  "code": 0,
  "msg": "success",
  "data": { }
}
```

`code` = 0 成功，非 0 为业务错误码；`data` 失败时为 `null`。**前端只判断 `code === 0`。**

### 5.2 错误码表（只增不改）

| code | 含义 |
|---|---|
| 0 | 成功 |
| 1001 | 参数错误 |
| 1002 | 未登录 / token 失效 |
| 2001 | 房间不存在 |
| 2002 | 房间人数已满 |
| 2003 | 已在其他房间中 |
| 3001 | 当前阶段不允许此操作 |
| 3002 | 盘问配额已用完 |
| 3003 | 已投过票 |
| 4001 | AI 服务暂时不可用（降级提示） |

### 5.3 三个关键接口

#### `GET /api/room/{id}/state`

前端每 2 秒轮询。**张越扬写，另两人用。**

```json
{
  "roomId": 1,
  "status": 1,
  "phase": 3,
  "currentRound": 2,
  "phaseDeadline": "2026-12-05T21:35:00",
  "players": [
    {"seat":1, "userId":10, "nickname":"小明", "characterName":"苏明轩",
     "avatarColor":"#c0392b", "isConnected":true}
  ],
  "npcList": [{"npcId":1, "name":"陈伯（管家）", "type":1, "remainQuota":15}],
  "myClueCount": 3
}
```

#### `POST /api/game/ask-npc`

**陆豪写核心，张越扬提供 Redis 配额支撑。**

```json
// 请求
{ "npcId": 1, "question": "昨晚九点你在哪？" }

// 响应
{
  "code": 0,
  "data": {
    "npcName": "陈伯（管家）",
    "answer": "回您的话，二十一点十分老奴送完茶便回了仆人房……",
    "newClue": { "id": 9, "content": "陈伯的行踪：……" },
    "remainQuota": 12,
    "latencyMs": 2340
  }
}
```

#### `GET /api/game/role`

**张越扬写，张宇恒用。**

```json
{
  "characterName": "苏明轩",
  "publicInfo": "苏家长子，三十二岁……",
  "privateSecret": "你的丝厂亏空了三万大洋……",
  "playGuide": "你的目标是让票投给别人……",
  "avatarColor": "#c0392b"
}
```

### 5.4 🔴 防泄密红线

**以上三个接口响应体里绝对不能出现：**

- `groundTruth`（完整真相）
- `leakKeywords`（泄密关键词）
- `isMurderer`（凶手标记）
- 他人的 `privateSecret`（别人的秘密）

实现要求：

1. **用专门的 VO，不要直接返回 Entity**
2. 凶手标记只存服务端
3. 上线前**张宇恒用 F12 逐个接口检查**

### 5.5 并行开发约定：陆豪不等张越扬

Phase 2 陆豪做 `ask-npc` 时，后端房间/状态机可能还没就绪。解决办法：

```
陆豪用假数据先调通：
  - roomId、userId 写死
  - 阶段校验先跳过
  - Redis 配额先用本地变量代替
等张越扬的接口就绪，替换成真实调用
```

---

## 六、分支模型与协作规则

```
main                    ← 只放能跑的版本
  ├── feat/backend-core     张越扬
  ├── feat/ai-npc           陆豪
  ├── feat/frontend-ask     陆豪（盘问页 + 讨论区）
  ├── feat/frontend-pages   张宇恒（6 个页面）
  └── content/script        张宇恒（剧本数据）
```

1. 每人在自己分支开发，完成后开 **Pull Request** 合并到 `main`
2. **合并前自己先跑一遍**
3. **不要直接往 `main` 推**
4. **互相 Code Review** —— 本项目最大的隐性收益之一
5. 每 2-3 天至少合并一次，攒久了冲突会要命

---

## 七、Commit 规范

| 前缀 | 用途 | 示例 |
|---|---|---|
| `feat:` | 新功能 | `feat: 新增房间创建与加入接口` |
| `fix:` | 修 bug | `fix: 修复投票时未校验房间阶段的问题` |
| `docs:` | 文档 | `docs: 补充 README 的本地启动步骤` |
| `refactor:` | 重构 | `refactor: 抽取 Prompt 组装逻辑为独立 Service` |
| `test:` | 测试 | `test: 补充泄密拦截的单元测试` |
| `content:` | 剧本内容 | `content: 修改陈伯的人设文本，减少主动展开` |
| `chore:` | 杂项 | `chore: 升级 Spring Boot 到 3.2.1` |

> 面试官翻仓库，第一眼看的就是 commit 历史。一条 "update" 到底的仓库和规范化历史的仓库，印象分差很多。

---

## 八、🔴 密钥管理（安全红线）

```
本地开发：application-local.yml（不提交，每人自己配）
云端部署：服务器上的 .env 文件（权限 600，不进 Git）
代码里：  只读环境变量，如 System.getenv("AI_API_KEY")
仓库里：  只放 application-local.yml.example（占位值）
```

**必须排除的文件**：`.env`、`.env.*`、`application-local.yml`

> ⚠️ 这些文件里有数据库密码和大模型 API Key。**提交过一次就洗不掉**（Git 历史里永远在），到时候得重置整个仓库。
> ⚠️ 万一误提交：立刻去平台后台**吊销 Key 重新生成**，别只删文件。

---

## 九、数据诚实原则

> 官方红线：禁止伪造数据。本项目同样遵守。

- 初始化演示数据必须明确标注为演示数据
- 试玩用户数、局数、盘问次数**如实统计**，别吹——追问一句就穿
- 所有数字来自 `ai_dialogue` 表的真实埋点

正确说法示例：

> "系统内 200 条为演示用初始化数据，另有 47 条为 11月20日至12月5日期间 15 名同学实际使用产生。"

---

## 十、阶段计划

| 阶段 | 时间 | 目标 |
|---|---|---|
| Phase 0 · 地基 | 11/15 – 11/29 | 环境统一、表结构、契约定死、Prompt 试 30 轮、剧本定稿 |
| Phase 1 · 核心玩法 | 11/30 – 12/20 | **不接 AI**，先把游戏流程完整跑通 |
| Phase 2 · AI 接入 | 12/21 – 1/3 | 🔴 **1/3 达成可玩最小版本** |
| Phase 3 · 上线 | 至 2/14 | 公网可访问 + 自动部署 + 20-30 名真实用户 |
| Phase 4 · 收尾 | 至 2/28 | 开源、文档、演示视频、简历条目、模拟面试 |

详细任务分工见《三人分工与协作规则.md》。

---

## 十一、每日站会

固定时间，15 分钟，线上也行。每人只说三句：

```
昨天做完了什么
今天打算做什么
卡在哪
```

> 🔴 站会是这个项目唯一的强制节奏。**期末可降频，但不能停。**
> 每周五检查进度，落后就砍范围，别硬扛。
