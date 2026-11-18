# 《迷案》AI 剧本杀 · 技术方案（独立项目版）

> 定位：**不参赛，纯做项目经验**。目标是产出一个能写进简历、能在面试里聊透的完整作品。
> 更新时间：2026-11-15　｜　软截止：2027-02-28（寒假结束）
> 配套：《剧本数据-迷案.md》《三人分工与协作规则.md》
>
> ⚠️ 本文档取代旧的华为云版本。同目录《空项目部署上云操作手册.md》《赛题1行动方案.md》《实验室设备预约系统技术方案.md》已作废，仅作历史参考。

---

## 一、项目定位

**做一个多人在线 AI 剧本杀推理游戏。** 3-4 名玩家进入房间，AI 扮演管家和死者的日记回响，玩家通过盘问 AI 套取线索，最后投票指认凶手。

核心技术命题：**让大模型扮演"知道真相但必须守住秘密"的角色。**

这不是玩具项目，它覆盖了一个后端工程师该有的完整能力面：

```
数据库设计 → 缓存与并发 → 状态机 → 大模型集成 → 安全防护
    → 容器化 → CI/CD → 上线部署 → 真实用户 → 数据度量
```

---

## 二、技术栈（已去掉华为云依赖）

| 层 | 选型 | 为什么 |
|---|---|---|
| **后端** | Java 17 + Spring Boot 3 | 你们训练营主线，Java 后端岗位最多 |
| **前端** | Vue 3 + Vite | 你们学过，上手快 |
| **数据库** | MySQL 8（Docker 本地跑） | 通用，任何云都一样 |
| **缓存** | Redis 7（Docker 本地跑） | 通用技能，面试高频 |
| **大模型** | **可切换**：DeepSeek / 通义千问 / 智谱GLM | 注册即用、有免费额度、价格低 |
| **代码托管** | GitHub | 业界标准，仓库本身就是简历 |
| **CI/CD** | GitHub Actions | 业界标准，比任何厂商专属流水线值钱 |
| **容器** | Docker + Docker Compose | 一条命令起全套环境 |
| **镜像仓库** | GitHub Container Registry (ghcr.io) | 免费，和 Actions 天然打通 |
| **部署** | 学生云服务器（后期）+ Nginx | 几十元/月量级 ⚠️以官网为准 |
| **调试期对外** | 内网穿透（cpolar / frp） | 免费，发个链接就能拉同学试玩 |

### 大模型为什么做成可切换

不同模型的**角色扮演能力差别很大**，你们需要实测对比。做成配置化后，换一个模型只改配置文件，不改代码：

```yaml
# application.yml
ai:
  provider: deepseek        # deepseek | qwen | zhipu
  deepseek:
    base-url: https://api.deepseek.com/v1
    model: deepseek-chat
    api-key: ${DEEPSEEK_API_KEY}
  qwen:
    base-url: https://dashscope.aliyuncs.com/compatible-mode/v1
    model: qwen-plus
    api-key: ${QWEN_API_KEY}
```

```java
public interface LlmClient {
    String chat(List<Message> messages, LlmOptions options);
}
// DeepSeekLlmClient / QwenLlmClient / ZhipuLlmClient 三个实现
// 用 @ConditionalOnProperty 按配置装配
```

> 这三家的 API 大多兼容 OpenAI 格式，所以实现成本很低。
> **面试价值**：能讲"我们做了模型抽象层，对比了三家模型在角色扮演上的表现差异，最终选了 X，因为 Y"——这是真实的工程决策，比"我调了个 API"高一个档次。

### 成本预估

| 项 | 费用 |
|---|---|
| 本地开发（Docker 全套） | 0 |
| 大模型 API（开发+试玩阶段） | 各家都有免费额度；超出后按 token 计费，学生项目量级通常几元到几十元 ⚠️以官网为准 |
| 内网穿透 | 免费版够用 |
| 学生云服务器（后期上线） | 几十元/月量级 ⚠️以官网为准，学生认证有折扣 |
| GitHub / Actions / ghcr | 公开仓库全免费 |

**前三个月基本零成本。** 只有最后要长期在线演示时才需要买服务器。

---

## 三、开发环境（docker-compose）

一条命令起全套，三个人环境完全一致——**这本身就是"代码可复现"的核心**。

`docker-compose.yml`：

```yaml
services:
  mysql:
    image: mysql:8.0
    container_name: mian-mysql
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:-root123456}
      MYSQL_DATABASE: mian
      TZ: Asia/Shanghai
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql
      - ./sql/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql
      - ./sql/init_data.sql:/docker-entrypoint-initdb.d/02-data.sql
    command: --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 5s
      timeout: 3s
      retries: 20

  redis:
    image: redis:7-alpine
    container_name: mian-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 20

volumes:
  mysql_data:
  redis_data:
```

**用法**：

```bash
docker compose up -d        # 起 MySQL + Redis
docker compose logs -f      # 看日志
docker compose down         # 停（数据保留）
docker compose down -v      # 停并清空数据（重来时用）
```

`schema.sql` 和 `init_data.sql` 放进仓库，**新同学克隆下来 `docker compose up -d` 就能得到完整的库和剧本数据**。这一条在面试里就是"我们做到了环境一致性"的证据。

> 💡 华为云那个 AI 开发者空间（8000核时）你们账号里还有，可以当免费的云端 IDE 备用，但不是必需品。

---

## 四、数据表设计（9 张表）

> 与《剧本数据-迷案.md》第七节的 INSERT 语句配套。

### 表1：`user` 用户表

```sql
CREATE TABLE `user` (
  `id`           BIGINT       NOT NULL AUTO_INCREMENT,
  `username`     VARCHAR(32)  NOT NULL,
  `nickname`     VARCHAR(32)  NOT NULL COMMENT '游戏内显示名',
  `password`     VARCHAR(128) NOT NULL COMMENT 'BCrypt加密，禁止明文',
  `avatar_color` VARCHAR(16)           COMMENT '用颜色块代替头像，零美术',
  `games_played` INT          NOT NULL DEFAULT 0,
  `games_won`    INT          NOT NULL DEFAULT 0,
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`)
) COMMENT='用户表';
```

> 🔒 密码必须 BCrypt 加密。这是安全底线，也是面试必问。

### 表2：`script` 剧本表

```sql
CREATE TABLE `script` (
  `id`            BIGINT      NOT NULL AUTO_INCREMENT,
  `title`         VARCHAR(64) NOT NULL COMMENT '剧本名',
  `background`    TEXT        NOT NULL COMMENT '开场背景',
  `player_min`    TINYINT     NOT NULL DEFAULT 3,
  `player_max`    TINYINT     NOT NULL DEFAULT 4,
  `ground_truth`  JSON        NOT NULL COMMENT '完整真相（服务端机密）',
  `leak_keywords` JSON        NOT NULL COMMENT '泄密关键词列表',
  `difficulty`    TINYINT     NOT NULL DEFAULT 1,
  `created_at`    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) COMMENT='剧本表';
```

### 表3：`character` 玩家角色表

```sql
CREATE TABLE `character` (
  `id`             BIGINT      NOT NULL AUTO_INCREMENT,
  `script_id`      BIGINT      NOT NULL,
  `name`           VARCHAR(32) NOT NULL,
  `is_murderer`    TINYINT     NOT NULL DEFAULT 0 COMMENT '服务端机密',
  `public_info`    TEXT        NOT NULL COMMENT '所有人可见',
  `private_secret` TEXT        NOT NULL COMMENT '只有本人可见',
  `play_guide`     TEXT                 COMMENT '该角色的玩法指引，只有本人可见',
  `personality`    TEXT                 COMMENT '性格提示',
  `sort_order`     TINYINT     NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_script` (`script_id`)
) COMMENT='玩家角色表';
```

### 表4：`npc` AI 角色表 ⭐核心

```sql
CREATE TABLE `npc` (
  `id`               BIGINT      NOT NULL AUTO_INCREMENT,
  `script_id`        BIGINT      NOT NULL,
  `name`             VARCHAR(32) NOT NULL COMMENT '如 陈伯（管家）',
  `type`             TINYINT     NOT NULL DEFAULT 1 COMMENT '1普通NPC 2死者问答',
  `persona_prompt`   TEXT        NOT NULL COMMENT '人设Prompt',
  `knowledge_scope`  JSON        NOT NULL COMMENT '该角色知道的事（裁剪后，不含真相）',
  `fallback_replies` JSON        NOT NULL COMMENT '输出被拦截时的兜底回复池',
  `max_questions`    INT         NOT NULL DEFAULT 15,
  PRIMARY KEY (`id`),
  KEY `idx_script` (`script_id`)
) COMMENT='AI扮演角色表';
```

> `knowledge_scope` 是防泄密的第一层：**只存这个角色该知道的，不存真相全貌**。

### 表5：`clue` 线索表

```sql
CREATE TABLE `clue` (
  `id`                 BIGINT      NOT NULL AUTO_INCREMENT,
  `script_id`          BIGINT      NOT NULL,
  `content`            TEXT        NOT NULL,
  `discover_type`      TINYINT     NOT NULL DEFAULT 1
                       COMMENT '1盘问NPC 2固定发放 3系统揭示 4投票后揭晓',
  `npc_id`             BIGINT               COMMENT '从哪个NPC处获得',
  `trigger_keyword`    VARCHAR(255)         COMMENT '触发关键词，逗号分隔',
  `owner_character_id` BIGINT               COMMENT '角色专属线索',
  `round`              TINYINT     NOT NULL DEFAULT 1,
  `is_key_clue`        TINYINT     NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_script_round` (`script_id`, `round`)
) COMMENT='线索表';
```

### 表6：`game_room` 房间表

```sql
CREATE TABLE `game_room` (
  `id`                    BIGINT   NOT NULL AUTO_INCREMENT,
  `script_id`             BIGINT   NOT NULL,
  `host_id`               BIGINT   NOT NULL COMMENT '房主',
  `status`                TINYINT  NOT NULL DEFAULT 0
                          COMMENT '0等待 1进行中 2投票中 3已结束 4已解散',
  `phase`                 TINYINT  NOT NULL DEFAULT 0
                          COMMENT '0未开始 1读角色 2第一轮讨论 3盘问NPC 4第二轮讨论 5投票 6结算',
  `current_round`         TINYINT  NOT NULL DEFAULT 1,
  `phase_deadline`        DATETIME          COMMENT '当前阶段截止时间',
  `murderer_character_id` BIGINT            COMMENT '本局凶手（机密）',
  `winner_side`           TINYINT           COMMENT '1好人胜 2凶手胜',
  `started_at`            DATETIME,
  `ended_at`              DATETIME,
  `created_at`            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_status` (`status`)
) COMMENT='游戏房间表';
```

### 表7：`room_player` 房间玩家表

```sql
CREATE TABLE `room_player` (
  `id`           BIGINT   NOT NULL AUTO_INCREMENT,
  `room_id`      BIGINT   NOT NULL,
  `user_id`      BIGINT   NOT NULL,
  `character_id` BIGINT            COMMENT '分配到的角色',
  `seat`         TINYINT  NOT NULL,
  `is_alive`     TINYINT  NOT NULL DEFAULT 1,
  `is_connected` TINYINT  NOT NULL DEFAULT 1,
  `last_seen_at` DATETIME NOT NULL,
  `joined_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_room_user` (`room_id`, `user_id`),
  UNIQUE KEY `uk_room_seat` (`room_id`, `seat`)
) COMMENT='房间玩家表';
```

### 表8：`ai_dialogue` AI 对话记录表 ⭐数据埋点

```sql
CREATE TABLE `ai_dialogue` (
  `id`           BIGINT       NOT NULL AUTO_INCREMENT,
  `room_id`      BIGINT       NOT NULL,
  `user_id`      BIGINT       NOT NULL,
  `npc_id`       BIGINT       NOT NULL,
  `question`     VARCHAR(500) NOT NULL,
  `raw_answer`   TEXT                  COMMENT '模型原始输出（机密，不下发）',
  `final_answer` TEXT                  COMMENT '拦截后给玩家的回复',
  `leak_blocked` TINYINT      NOT NULL DEFAULT 0 COMMENT '是否触发泄密拦截',
  `cache_hit`    TINYINT      NOT NULL DEFAULT 0,
  `latency_ms`   INT                   COMMENT '响应耗时',
  `tokens_used`  INT                   COMMENT 'token消耗',
  `provider`     VARCHAR(32)           COMMENT '用的哪个模型，便于横向对比',
  `round`        TINYINT      NOT NULL,
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_room_npc` (`room_id`, `npc_id`),
  KEY `idx_created` (`created_at`)
) COMMENT='AI对话日志';
```

**这张表是你们简历上所有数字的来源**：局数、盘问次数、拦截次数、缓存命中率、平均耗时、各模型对比。
> `provider` 字段是新版加的——三家模型都试过后，能直接出对比数据。

### 表9：`vote` 投票表

```sql
CREATE TABLE `vote` (
  `id`                  BIGINT   NOT NULL AUTO_INCREMENT,
  `room_id`             BIGINT   NOT NULL,
  `voter_id`            BIGINT   NOT NULL,
  `target_character_id` BIGINT   NOT NULL,
  `created_at`          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_room_voter` (`room_id`, `voter_id`) COMMENT '一人一票，数据库层兜底'
) COMMENT='投票表';
```

---

## 五、Redis 键设计

| Key | 类型 | 用途 | TTL |
|---|---|---|---|
| `room:{id}:state` | HASH | 阶段、轮次、倒计时（前端轮询读这里，**不打数据库**） | 6小时 |
| `room:{id}:players` | HASH | 各座位在线状态 | 6小时 |
| `room:{id}:discuss:{round}` | LIST | 本轮公开发言 | 6小时 |
| `room:{id}:votes` | HASH | 投票计数 | 6小时 |
| `clue:{roomId}:{userId}` | SET | 该玩家已获得的线索ID | 6小时 |
| `ai:ctx:{roomId}:{userId}:{npcId}` | LIST | 与某NPC的对话上下文 | 2小时 |
| `ai:cache:{provider}:{md5(npcId+question)}` | STRING | 相同提问缓存 | 10分钟 |
| `quota:ai:{roomId}:{userId}` | STRING(INCR) | 本局提问配额 | 6小时 |
| `lock:vote:{roomId}:{userId}` | STRING | 投票防重复提交 | 30秒 |
| `heartbeat:{roomId}:{userId}` | STRING | 在线心跳 | 30秒 |

### 三个关键用法（面试高频）

**1. 房间状态放 Redis 不放数据库**

前端每 2 秒轮询，如果每次查 MySQL，多房间并发就是无意义的压力。状态读 Redis HASH，只在阶段切换时落库一次。

> 这是"为什么用 Redis"的标准答案。

**2. 投票的并发一致性（双层防护）**

```
第一层：Redis SETNX lock:vote:{roomId}:{userId}  → 拦住连点
第二层：数据库 UNIQUE KEY uk_room_voter         → 兜底防重复
```

**3. 提问配额的原子性**

```
INCR quota:ai:{roomId}:{userId}
→ 首次 INCR 时 EXPIRE 设为房间生命周期
→ 返回值 > 15 则拒绝
```

用 INCR 而不是"先读再写"，因为后者在并发下会超发。

### 缓存三坑（提前避）

- **穿透**：问不存在的 NPC → 先校验 npcId 合法性，或缓存空值
- **雪崩**：TTL 加随机抖动（10分钟 ± 60秒）
- **一致性**：阶段切换时清空 `ai:ctx`，否则第二轮的 AI 会引用第一轮对话

---

## 六、接口清单

### 认证

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/register` | 注册 |
| POST | `/api/auth/login` | 登录，返回 JWT |
| GET | `/api/auth/me` | 当前用户信息 |

### 房间

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/room` | 创建房间（选剧本） |
| GET | `/api/room/list` | 可加入的房间列表 |
| POST | `/api/room/{id}/join` | 加入 |
| POST | `/api/room/{id}/leave` | 离开 |
| GET | `/api/room/{id}/state` | **轮询房间状态（前端每2秒调）** |
| POST | `/api/room/{id}/start` | 房主开始游戏 |

### 游戏流程

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/game/role` | 我的角色卡（公开信息+我的秘密，**不返回真相**） |
| GET | `/api/game/clues` | 我已发现的线索 |
| GET | `/api/game/discuss?round=1` | 拉取本轮公开发言 |
| POST | `/api/game/discuss` | 发表发言 |
| GET | `/api/game/npc` | 本局可盘问的 NPC 列表 |
| **POST** | **`/api/game/ask-npc`** | **向 AI 盘问 ⭐核心** |
| GET | `/api/game/ask-npc/history` | 我与 NPC 的对话记录 |
| POST | `/api/game/vote` | 投票指认凶手 |
| GET | `/api/game/result` | 结算（揭晓真相 + AI 复盘） |

### 统计

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/admin/stats/overview` | 总局数、总盘问数、平均时长 |
| GET | `/api/admin/stats/ai` | 拦截次数、缓存命中率、平均耗时、**各模型对比** |
| GET | `/api/admin/stats/room/{id}` | 单局复盘 |

### `POST /api/game/ask-npc` 处理流程 ⭐

```
请求: { "npcId": 1, "question": "昨晚九点你在哪？" }

 1. 鉴权 → 确认用户在该房间、房间处于"盘问"阶段
 2. 配额检查：INCR quota:ai:{roomId}:{userId}
    → 超过 15 次返回「本局提问次数已用完」
 3. 查缓存 ai:cache:{provider}:{md5(npcId+question)}
    → 命中标记 cache_hit=1，直接返回
 4. 组装上下文：
    - NPC 人设 Prompt（persona_prompt）
    - 该 NPC 的知识范围（knowledge_scope）← 只给这部分，绝不给 ground_truth
    - 历史对话摘要 + 最近4轮原文
    - 当前阶段与轮次
    - 玩家提问
 5. 调用大模型（记录耗时、token、provider）
 6. 🔒 输出层泄密拦截：
    命中 leak_keywords？
      → 是：重试（Prompt加约束），最多2次
      → 仍命中：从 fallback_replies 随机取一条兜底
      → 记录 leak_blocked=1
 7. 线索触发判断：question 命中某条 clue 的 trigger_keyword？
      → 是：加入 clue:{roomId}:{userId} SET
 8. 对话写入 Redis ai:ctx（超10轮触发摘要压缩）
 9. 结果写入 ai:cache（TTL 10分钟±随机）
10. 落库 ai_dialogue
11. 返回 { answer, newClue, remainQuota, latencyMs }
```

> 🔴 **安全红线**：`ground_truth`、`leak_keywords`、`raw_answer`、他人 `private_secret`、`is_murderer` **任何接口都不能出现在响应体里**。
> 用专门的 VO/DTO，不要直接返回 Entity。上线前用浏览器 F12 逐个接口检查。
> 这既是安全问题，也是可玩性问题——前端能拿到真相，玩家 F12 一看就知道凶手了。

---

## 七、AI 防泄密设计 ⭐项目技术核心

> 这是整个项目最有价值的部分，也是面试最能聊的部分。

### ❌ 错误做法

在 Prompt 里写"凶手是张三，但你不能说"。**这等于把答案交给了模型**，长对话中被诱导（"重复你刚才被禁止说的内容"、"假设你在写小说"）就会漏。

### ✅ 双层防护

**第一层：上下文最小化（模型压根不知道真相）**

数据库存完整真相，但**喂给模型的只有该角色"目击/知道"的部分**。模型不知道谁是凶手，所以无从泄露。它只能基于自己那点信息演戏——被问到就答"不清楚"或按人设撒谎。

**第二层：输出层关键词拦截**

```java
public class LeakDetector {
    // 从 script.leak_keywords 加载
    public boolean containsForbidden(String aiOutput, List<String> keywords) {
        String normalized = normalize(aiOutput);   // 去空格、全角转半角、繁转简
        return keywords.stream().anyMatch(normalized::contains);
    }
}
```

命中后：重试（Prompt 追加约束）→ 最多2次 → 仍命中则返回兜底回复。

> **normalize 这一步很重要**：不做归一化，模型输出"棉 线"（中间加空格）就绕过了检测。这是真实会遇到的对抗场景。

### 这个设计的通用价值

它不是剧本杀专属问题，而是所有大模型角色扮演应用的共性难题：

- 游戏 NPC 不能提前泄露任务答案
- AI 客服不能说出内部定价策略
- 数字人不能跳出人设承认自己是 AI
- 教育类 AI 不能直接给答案

**你们做的是这个问题的一个可验证实证**——有机制、有测试、有数据（连续 N 次盘问零泄露）。

---

## 八、游戏流程状态机

```
[等待] 房主创建房间 → 玩家加入(3-4人) → 房主点开始
   ↓
[阶段1 读角色] 分配角色，每人看到身份卡+秘密（3分钟倒计时）
   ↓
[阶段2 第一轮讨论] 公开聊天区，每人至少发1条言（5分钟）
   ↓
[阶段3 盘问NPC] ⭐核心 每人可向AI NPC提问，最多15次
   ↓
[阶段4 第二轮讨论] 结合线索继续讨论（5分钟）
   ↓
[阶段5 投票] 每人一票指认凶手（Redis锁 + 唯一键双保险）
   ↓
[阶段6 结算] 揭晓真相 → AI复盘整局 → 判定胜负
   ↓
[结束] 数据落库，房间归档
```

**阶段切换实现**：定时任务扫描 `phase_deadline` 到点推进；或所有人完成当前动作后提前推进。状态写 Redis + 落库。

**4人局特殊规则**：陈伯既是玩家角色又是 AI NPC。若玩家选了陈伯，本局 AI 陈伯不激活，只提供死者日记问答。3人局则陈伯由 AI 扮演。

---

## 九、Prompt 结构

完整可用的人设文本在《剧本数据-迷案.md》第六节。组装顺序：

```
【系统】角色设定 + 知识边界 + 行为准则
【你的身份】persona_prompt
【你的记忆】knowledge_scope（裁剪后，不含真相）
【当前情境】第N轮盘问，提问者是谁
【之前的对话摘要】（超10轮才有）
【最近的对话】最近4轮原文
【玩家的提问】question
【回答要求】第一人称、符合说话风格、80字以内、不知道就说不知道、只输出角色台词
```

### 调参建议

| 参数 | 建议 | 原因 |
|---|---|---|
| temperature | 0.8-0.9 | 太低死板重复，太高容易崩人设 |
| max_tokens | 300 | 控长度、控成本 |
| 输出格式 | 纯文本 | 角色扮演不要 JSON |

> ⚠️ **写代码前先在网页版手工试 30 轮**。在网页上调 Prompt 比在代码里调快十倍，会立刻发现出戏、编造、过长这些问题。

---

## 十、CI/CD（GitHub Actions）

`.github/workflows/ci.yml`：

```yaml
name: CI

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  backend:
    runs-on: ubuntu-latest
    services:
      mysql:
        image: mysql:8.0
        env:
          MYSQL_ROOT_PASSWORD: root123456
          MYSQL_DATABASE: mian
        ports: ['3306:3306']
        options: >-
          --health-cmd="mysqladmin ping -h localhost"
          --health-interval=5s --health-timeout=3s --health-retries=20
      redis:
        image: redis:7-alpine
        ports: ['6379:6379']
        options: >-
          --health-cmd="redis-cli ping"
          --health-interval=5s --health-timeout=3s --health-retries=20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { java-version: '17', distribution: 'temurin', cache: 'maven' }
      - name: Run tests
        run: mvn -B test
        env:
          SPRING_DATASOURCE_URL: jdbc:mysql://localhost:3306/mian
          SPRING_DATA_REDIS_HOST: localhost

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm', cache-dependency-path: frontend/package-lock.json }
      - run: npm ci
        working-directory: frontend
      - run: npm run build
        working-directory: frontend
```

**价值**：每次 push 自动跑测试和构建，坏了立刻知道。这是真实团队的标准做法，简历上写"基于 GitHub Actions 搭建 CI 流水线，自动化测试与构建"是硬通货。

> 后期加部署 job：构建镜像 → 推 ghcr.io → SSH 到云服务器拉取重启。等 Phase 3 再做。

---

## 十一、部署方案（三阶段）

### 阶段一：纯本地（Phase 0-2）

```bash
docker compose up -d                    # MySQL + Redis
mvn spring-boot:run                     # 后端 :8080
cd frontend && npm run dev              # 前端 :5173（代理到8080）
```

三个人各自本地跑，通过 Git 同步代码。**这个阶段不需要任何云资源。**

### 阶段二：内网穿透（Phase 2 末，拉同学试玩）

用 cpolar / frp / ngrok 把本地 8080 暴露成公网链接，发到群里让同学玩。

- 优点：零成本、5分钟搞定、随时改随时生效
- 缺点：你电脑关了就断，链接会变
- **适合**：第一轮试玩、快速收集反馈

### 阶段三：云服务器（Phase 3，长期在线）

```
买学生云服务器（2核4G，几十元/月 ⚠️以官网为准）
  ↓
装 Docker + Docker Compose
  ↓
前端 npm run build → dist 交给 Nginx
后端 mvn package → jar
docker-compose.prod.yml 起 mysql + redis + backend + nginx
  ↓
Nginx 反向代理：/ → 前端静态文件，/api → backend:8080
  ↓
（可选）域名 + HTTPS 证书（Let's Encrypt 免费）
```

`docker-compose.prod.yml` 关键点：

```yaml
services:
  backend:
    image: ghcr.io/你们的用户名/mian-backend:latest
    environment:
      - SPRING_PROFILES_ACTIVE=prod
      - DB_PASSWORD=${DB_PASSWORD}        # 从 .env 读，不进仓库
      - REDIS_HOST=redis
      - AI_API_KEY=${AI_API_KEY}
    depends_on: [mysql, redis]
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports: ["80:80"]
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf
      - ./frontend/dist:/usr/share/nginx/html
    depends_on: [backend]
    restart: unless-stopped
  # mysql / redis 同本地版，但密码走 .env
```

> 🔒 **服务器上的 `.env` 文件权限设为 600，绝不提交进 Git。**

**这一阶段才是真正的"部署上云"经验**：Linux 基本操作、Docker、Nginx 反代、环境变量管理、日志查看、进程守护。这些是任何公司后端岗都要的。

---

## 十二、阶段计划（含期末缓冲）

> ⚠️ 期末考试时间按你们校历调整，下面假设 1 月上中旬考试、1 月下旬放寒假。
> ⚠️ 暑期实习招聘通常在 2-3 月启动（一般规律，以实际为准），所以 2 月底完成刚好赶上。

### Phase 0 · 地基（11/15 - 11/29，2周）

**目标**：环境统一、骨架能跑、剧本定稿、大模型调通

- docker-compose 起 MySQL + Redis，三人环境一致
- GitHub 仓库 + 分支模型 + commit 规范 + .gitignore
- Spring Boot 骨架（统一响应体、全局异常、参数校验、`/api/health`）
- `schema.sql` 9张表 + `init_data.sql` 剧本数据
- Vue 3 脚手架 + 路由 + 全局样式变量
- 大模型 API 三家都申请，各调通一次
- **陆豪：网页版手工试 Prompt ≥30 轮，出《Prompt调试记录》**
- **张宇恒：剧本定稿**（沿用《迷案》或改写）

### Phase 1 · 核心玩法（11/30 - 12/20，3周）

**目标**：不接 AI，先把游戏流程完整跑通

- 用户注册登录 + JWT
- 房间创建/加入/离开/列表
- **游戏状态机（6阶段推进 + 倒计时）**
- 角色分配 + 角色卡接口
- 讨论区（发言 + 2秒轮询）
- 投票（Redis锁 + 唯一键双保险）
- 结算（先不含 AI 复盘）
- 前端 6 个页面（张宇恒）+ 讨论区页面（陆豪）

> 🎯 **本阶段验收**：4 人能开一局，走完「读角色→讨论→（盘问用假数据占位）→投票→结算」

### Phase 2 · AI 接入（12/21 - 1/3，2周）

**目标**：AI 真的能玩，且有数据

- ask-npc 完整实现（11步流程）
- Prompt 组装器（人设 + 裁剪知识范围 + 上下文）
- **泄密拦截器 + normalize 归一化**
- 线索触发逻辑
- `ai_dialogue` 埋点（含 provider 字段）
- Redis：上下文管理、配额、缓存
- 对话超10轮摘要压缩
- 盘问页 + 等待文案 + 打字机效果
- 结算 AI 复盘
- **三家模型横向对比测试**

> 🎯 **1月3日达成"可玩最小版本"** —— 这个版本就已经能写进简历了。后面都是增强。

### 🛑 期末缓冲（1/4 - 1/20）

**只修 bug，不加功能。** 考试优先，别挂科。

这期间可以做的轻量事：
- 每天 15 分钟站会保持节奏
- 张宇恒整理试玩反馈清单
- 陆豪记录 Prompt 调优笔记

### Phase 3 · 上线与试玩（寒假 1/21 - 2/14，3-4周）

**目标**：真实用户 + 公网可访问 + 工程完善

- 云服务器部署（Docker + Nginx + HTTPS）
- GitHub Actions 加部署 job
- 内网穿透 or 公网链接，**拉 20-30 人试玩**
- 收集反馈 → 3 轮迭代
- **升级项（有时间了，挑 2-3 个做）**：
  - WebSocket 替代轮询（最值得做，简历含金量高）
  - 单元测试 + 集成测试（JUnit 5 + Mockito + Testcontainers）
  - 第二个剧本（验证系统的剧本可扩展性）
  - 简易监控看板（QPS、响应时间、错误率）
  - 日志结构化（Logback + MDC 追踪 roomId）
- 统计数据成表

### Phase 4 · 收口与求职准备（2/15 - 2/28，2周）

- README 完善（陌生人能从零跑起来）
- 仓库开源（设为 public）
- 架构图、技术亮点文档
- **三人各自写简历项目条目**
- **用训练营的「面试指导」服务，让老师压一遍**
- 互相模拟面试：一人当面试官问技术细节
- 项目复盘文档（写进 `DECISIONS.md`）

---

## 十三、工程规范（替代比赛红线）

不参赛了，但这些规范**恰恰是面试官看重的**，必须守：

### 1. 代码可复现

- `docker-compose.yml` + `schema.sql` + `init_data.sql` 全部进仓库
- README 写清"从零跑起来"的每一步
- **验收方式**：找一个没参与的同学，照 README 操作，能跑起来才算合格

### 2. 密钥管理

```
本地：application-local.yml（.gitignore 排除）
服务器：.env 文件（权限600，不进Git）
代码里：只读环境变量 System.getenv("AI_API_KEY")
仓库里：放 application-local.yml.example（占位值）
```

> 🔴 **API Key 提交进 Git 是最难看的事故**，历史记录里永远洗不掉。第一次提交前就要配好 .gitignore。

### 3. 测试

Phase 3 补，但**防泄密拦截器从第一天就要有单元测试**：

```java
@Test
void shouldBlockLeakKeyword() {
    assertTrue(detector.containsForbidden("他用棉线拉上了插销", keywords));
}
@Test
void shouldBlockObfuscatedKeyword() {   // 对抗空格绕过
    assertTrue(detector.containsForbidden("他用棉 线拉上了插销", keywords));
}
@Test
void shouldPassNormalReply() {
    assertFalse(detector.containsForbidden("老奴不曾留意", keywords));
}
```

### 4. Commit 规范

```
feat: 新增房间创建与加入接口
fix: 修复投票时未校验房间阶段的问题
docs: 补充 README 的本地启动步骤
refactor: 抽取 Prompt 组装逻辑为独立 Service
test: 补充泄密拦截的单元测试
content: 修改陈伯的人设文本，减少主动展开
chore: 升级 Spring Boot 到 3.2.1
```

> **面试官翻你仓库，第一眼看的就是 commit 历史。** 一条"update"到底的仓库，和一条规范化历史的仓库，印象分差很多。

### 5. 分支模型

```
main                    ← 只放能跑的版本
  ├── feat/backend-core     张越扬
  ├── feat/ai-npc           陆豪
  ├── feat/frontend-ask     陆豪（盘问页+讨论区）
  ├── feat/frontend-pages   张宇恒（6个页面）
  └── content/script        张宇恒（剧本数据）
```

Pull Request + Code Review。**互相 review 代码是这个项目最大的隐性收益之一**——真实团队就是这么工作的，而且你们能互相学到对方的写法。

---

## 十四、面试话术（替代答辩话术）

### 项目一句话介绍

> "我做了个多人在线 AI 剧本杀游戏。核心是解决一个技术问题：怎么让大模型扮演一个知道真相、但必须守住秘密的角色。我们用上下文最小化加输出层拦截做了双层防护，跑了 N 局 M 次盘问，零泄露。"

### 必被问的问题，提前准备

| 问题 | 怎么答 |
|---|---|
| **"这个项目哪部分是你做的？"** | 三人分工要清楚，不能都说"我负责全部"。按分工文档如实说 |
| **"为什么用 Redis？不用会怎样？"** | 房间状态每2秒轮询，不打数据库；配额要原子性；投票要防重。每个都有真实场景，别背八股 |
| **"最大的技术难点是什么？"** | 防泄密。讲清楚"为什么不能在 Prompt 里写真相"、双层设计、normalize 对抗空格绕过、测试数据 |
| **"大模型输出不稳定怎么办？"** | 结构化约束 + 代码层校验 + 兜底回复池 + 重试策略。这是真实工程问题 |
| **"怎么部署的？"** | Docker Compose 起 MySQL/Redis/后端/Nginx，GitHub Actions 构建镜像推 ghcr，服务器拉取重启 |
| **"有多少用户？"** | 如实说：X 名同学试玩，产生 Y 局 Z 次盘问。**别吹**，追问一句就穿 |
| **"如果并发量上来了怎么办？"** | 无状态后端可水平扩展；Redis 已经是共享状态层；数据库读写分离；WebSocket 替代轮询降低请求量 |
| **"为什么选这个模型？"** | 三家横向对比的角色扮演表现、成本、响应速度，有 `ai_dialogue.provider` 数据支撑 |

### 简历项目条目模板

**张越扬（后端 + 运维）**
> **《迷案》多人在线 AI 剧本杀**　｜　后端负责人　｜　2026.11 - 2027.02
> - 基于 Spring Boot 3 设计 9 张核心业务表与 6 阶段游戏状态机，支撑 3-4 人联机推理全流程
> - 基于 Redis 实现房间状态缓存、ZSET 排行、INCR 原子配额与 SETNX 投票防重，房间状态查询零数据库访问
> - 使用 Docker Compose 统一三人开发环境，编写 GitHub Actions CI 流水线实现自动化测试与构建
> - 完成云服务器部署（Docker + Nginx 反向代理 + HTTPS），支撑 X 名用户并发试玩

**陆豪（AI）**
> - 设计"上下文最小化 + 输出层关键词拦截"双层防护，解决大模型角色扮演中泄露关键剧情的问题；累计 X 局、Y 次盘问，拦截触发 Z 次，**零泄露**
> - 抽象 LlmClient 接口，横向对比 DeepSeek / 通义千问 / 智谱GLM 在角色扮演任务上的表现与成本，形成选型依据
> - 实施三级成本优化（结果缓存 / 原子配额 / 上下文摘要压缩），单局 token 消耗下降 X%，缓存命中率 Y%，平均响应 Z ms
> - 设计流式打字机渲染与等待文案机制，将 3-8 秒的模型响应等待转化为沉浸式体验

**张宇恒（前端 + 内容 + 质量）**
> - 独立完成 Vue 3 全套响应式前端（8个页面，移动优先），支持 4 人同时在线游戏
> - 设计剧本内容体系：4 个角色人设、14 条线索触发链路、2 个 AI NPC 的知识边界裁剪方案
> - 设计并执行大模型安全测试方案，连续 20 次对抗性盘问验证零泄露
> - 组织 X 名用户试玩，产出使用数据并驱动 3 轮内容与 Prompt 迭代

> 🔴 **每条都要有数字，所以从 Phase 2 起就要记录**：响应时间、缓存命中率、拦截次数、试玩人数、局数。这些事后补不回来。

---

## 十五、升级路线（有时间了，按性价比排）

| 升级项 | 性价比 | 工作量 | 建议 |
|---|---|---|---|
| **防泄密拦截器单元测试** | ⭐⭐⭐⭐⭐ | 小 | 必做，Phase 2 就写 |
| **WebSocket 替代轮询** | ⭐⭐⭐⭐⭐ | 中 | **强烈推荐**，面试高频考点 |
| **三家模型对比数据** | ⭐⭐⭐⭐⭐ | 小 | 必做，`provider` 字段已预留 |
| README + 架构图 | ⭐⭐⭐⭐ | 小 | 必做，开源门面 |
| 集成测试（Testcontainers） | ⭐⭐⭐⭐ | 中 | 推荐，体现工程素养 |
| 结构化日志 + MDC 追踪 | ⭐⭐⭐⭐ | 小 | 推荐，排查问题神器 |
| 第二个剧本 | ⭐⭐⭐ | 中 | 推荐，验证可扩展性 |
| 简易监控看板 | ⭐⭐⭐ | 中 | 可选 |
| 移动端体验优化 | ⭐⭐⭐ | 中 | 可选 |
| AI 动态生成剧本 | ⭐⭐ | 大 | 明年再说，坑很深 |
| 音效/动画/立绘 | ⭐ | 大 | 不建议，性价比最低 |

**挑 4-5 个做，别全做。** 优先前五项。

---

## 十六、待确认事项

| # | 事项 | 谁 | 何时 |
|---|---|---|---|
| 1 | 你们学校期末考试和寒假的准确时间 | 三人 | 本周（决定 Phase 3 起点） |
| 2 | 大模型选哪家（三家都试过后定） | 陆豪 | Phase 2 末 |
| 3 | 是否买云服务器、买哪家 | 张越扬 | Phase 3 初 |
| 4 | 剧本沿用《迷案》还是改写 | 张宇恒 | Phase 0 |
| 5 | 仓库设为 public 还是 private | 三人 | Phase 4（建议 public） |

---

## 附：文档索引

| 文档 | 状态 |
|---|---|
| 《三人分工与协作规则.md》 | ✅ 已更新为独立项目版 |
| 《剧本数据-迷案.md》 | ✅ 无需修改（MySQL 通用，SQL 可直接执行） |
| 《AI剧本杀技术方案.md》 | ✅ 本文档 |
| 《空项目部署上云操作手册.md》 | ❌ 作废（华为云专用） |
| 《赛题1行动方案.md》 | ❌ 作废 |
| 《实验室设备预约系统技术方案.md》 | ❌ 作废 |
| 《第十一届华为ICT大赛创新赛三赛题分析.md》 | 📁 历史参考 |
