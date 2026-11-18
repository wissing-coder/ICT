# 接口缺口与待决事项

> Phase 0 契约对齐用。定完的结论同步写进根目录 `DECISIONS.md`，之后不反复讨论。
> 最后更新：2026-11-18 ｜ 提出人：张宇恒 ｜ 后端：张越扬 ｜ AI：陆豪

## 状态总览

| # | 事项 | 状态 | 结论 / 谁 |
|---|---|---|---|
| ① | `character.play_guide` 有列有接口但无数据 | ✅ 已解决 | 张宇恒（数据侧） |
| ② | 房间页要「准备」，但后端无此能力 | ✅ **已定：方案 A** | 张越扬实现 |
| ③ | `/api/room/{id}/state` 缺 `serverTime` | ✅ **已定：方案 A** | 张越扬实现 |
| ④ | 房间状态与讨论区两个 2 秒轮询 | 💬 **未决** | 张越扬 + 陆豪 |
| ⑤ | 重连凭据（V2 第七节新增要求） | 💬 **未决** | 张越扬 |

> **2026-11-18 结论**：②③ 按方案 A 执行（加 `is_ready` + `/ready`；`/state` 加 `serverTime`）。
> ④⑤ 本轮没谈到，列下一轮——⑤ 是 V2 明确要求的（房间码不能当身份凭据），**不能省**。

---

## ① `play_guide`：已解决，仅存档

**问题**：`character` 表有 `play_guide TEXT`，`/api/game/role` 也返回 `playGuide`，但原剧本 SQL 没这个字段——三段「玩法指引」被塞在 `private_secret` 尾部，以「【玩法指引】」分隔。角色卡页设计好的「秘密 / 玩法指引」分区因此没有数据。

**处理**：V2 版数据 `sql/init_data.sql` 已按 3 角色重做，`private_secret` 与 `play_guide` 分开。
**连带约定**：Prompt 组装只用 `private_secret`，**不带 `play_guide`**（那是玩家攻略，喂给模型它会照着演）。

---

## ② 「准备」：已定方案 A

### 结论

在后端补齐「准备」能力，不做成前端假状态。

### 契约（照这个实现，字段名别改）

```sql
ALTER TABLE `room_player`
  ADD COLUMN `is_ready` TINYINT NOT NULL DEFAULT 0 COMMENT '1=已准备' AFTER `seat`;
```

| 项 | 约定 |
|---|---|
| 接口 | `POST /api/room/{id}/ready` |
| 请求体 | `{ "ready": true }` / `{ "ready": false }`（显式传值，不要 toggle 语义） |
| 返回 | 统一响应体，`data` 里回 `{ "isReady": true }` |
| 状态同步 | `/api/room/{id}/state` 的 `players[]` 每个元素加 `isReady` |
| 落库位置 | **落库**（`room_player.is_ready`），不要只放 Redis |
| 开始条件 | 三人齐且**全部 `is_ready=1`**，仅房主可调 `/start`；不满足返回 `3001` |

两个决定要说明理由：

1. **用显式 `ready: true/false` 而不是 toggle。**toggle 在网络重试时会翻转两次，玩家点了「取消准备」结果变成准备。显式传值是幂等的。
2. **`is_ready` 必须落库，不能只放 Redis。** 因为 V2 要求断线重连后恢复状态（第七节），重连是从库里读 `room_player`；只放 Redis 的话房主刷新一下就看不到谁准备好了。

### 验收

```sql
DESC room_player;        -- 应出现 is_ready
```

1. `POST /api/room/{id}/ready` 连续调两次同值（`true`、`true`），状态保持 `true`，不翻转
2. `/state` 的 `players[]` 里每人都带 `isReady`；三个都为 `true` 时房主才能 `/start`
3. **刷新页面 / 关掉重开，准备态不丢**
4. 非房主调 `/start` 返回 `3001`

---

## ③ `serverTime`：已定方案 A

### 结论

`/api/room/{id}/state` 响应体加 `serverTime` 字段。

### 契约

| 项 | 约定 |
|---|---|
| 字段名 | `serverTime` |
| 格式 | 与 `phaseDeadline` **完全一致**（`2026-11-18T21:35:00`，本地时间、不带时区、不带毫秒） |
| 位置 | 与 `phaseDeadline` 同级（响应体顶层） |
| 含义 | 服务端**生成该响应时**的时刻 |

```json
{
  "roomId": 1,
  "phase": 3,
  "phaseDeadline": "2026-11-18T21:47:00",
  "serverTime":    "2026-11-18T21:39:12",
  "players": [ { "seat": 1, "isReady": true } ]
}
```

### 前端怎么用它（我这侧的实现约定）

```
剩余 = phaseDeadline − serverTime − (本地收到响应后已流逝的毫秒数)
```

`(本地收到响应后已流逝)` 用 `performance.now()` 差值算，不用 `Date.now()` 相减——
这样即使本地时钟整体偏了 3 分钟，倒计时也不受影响。

### 验收

1. 响应体含 `serverTime`，格式与 `phaseDeadline` 一致
2. 与服务端真实时间相差 < 1 秒
3. 把手机系统时间调快 10 分钟，倒计时**不跳**、不出现负数

---

## ④ 两个 2 秒轮询要不要合并（未决）

**现状**：`GET /api/room/{id}/state` 与 `GET /api/game/discuss?round=1` 各自 2 秒轮询，4 人局下每客户端每秒 2 次请求。

**两个选项**：

- **A 合并 tick**：一个定时器里并发拉两个接口，一次渲染
- **B 按阶段轮询**：讨论区只在 `phase 2 / 4` 轮询，其它阶段停掉（更省，但状态切换时要记得开关）

**建议 A**（实现简单、不会漏开关）。**这条要张越扬和陆豪都点头**，因为两人各占一个接口。

---

## ⑤ 重连凭据（V2 明确要求，未决）

V2 第七节原文：「房间码不是身份凭据。创建或加入时服务端签发随机重连凭据，保存在本设备；刷新凭恢复角色、阶段、消息与线索。房间满员后禁止无凭据冒用。」

**为什么必须做**：没有它，房主一刷新就丢角色；有它，断线重连才是真需求而不是「再进一次房间」。

**建议的最小实现**：

| 项 | 约定 |
|---|---|
| 表字段 | `room_player` 加 `reconnect_token_hash VARCHAR(64)` + `reconnect_token_expires_at DATETIME` |
| 签发 | `join` / 建房成功时返回**明文**令牌一次，服务端只存 SHA-256 摘要 |
| 前端 | 存 `localStorage`，每次请求带 `X-Reconnect-Token` 头 |
| 校验 | `/api/room/{id}/state` 无有效令牌时按普通旁观者处理（或直接 `1002`） |
| 过期 | 建议与房间生命周期一致（V2：房间 6 小时量级） |

**要张越扬定**：令牌放请求头还是 query、过期策略、以及「丢失凭据」时的提示文案（V2 说由房主结束重开，不做不安全接管）。

---

## 决策记录格式

定完往 `DECISIONS.md` 追加：

```
2026-11-18  room_player 加 is_ready + POST /api/room/{id}/ready，方案 A。
            理由：三人局中房主误点开始会毁掉一局，成本仅一列一接口；显式传值保证幂等。
```
