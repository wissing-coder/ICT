# 团队后端接口契约来源

原文来自 `feat/backend-core` 的 README，随本次后端对齐保留，供后续页面与后端协作参考。源文件：<https://github.com/wissing-coder/ICT/blob/feat/backend-core/README.md>。

本次沿用统一响应体、原错误码、健康接口以及角色/盘问路径；候选版扩展与尚未实现的九表映射见根目录 `FORMAL_VERSION.md`，不把本节示例视为所有字段都已实现。

## 九、🔴 接口契约（Phase 0 定死，之后不许单方面改）

> 学生团队散伙的第一原因不是能力不够，是**两个人对同一个接口的理解不一样**。
> 改契约必须先开 PR 讨论，三人同意后才能改。

### 9.1 统一响应体

```json
{
  "code": 0,
  "msg": "success",
  "data": { }
}
```

`code` = 0 成功，非 0 为业务错误码；`data` 失败时为 `null`。**前端只判断 `code === 0`。**

### 9.2 错误码表（只增不改）

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

### 9.3 三个关键接口

#### `GET /api/room/{id}/state`

前端每 2 秒轮询。**张越扬写，另两人用。**

```json
{
  "roomId": 1,
  "status": 1,
  "phase": 3,
  "currentRound": 2,
  "phaseDeadline": "2026-12-05T21:35:00",
  "serverTime": 1763468400000,
  "players": [
    {"seat":1, "userId":10, "nickname":"小明", "characterName":"苏明轩",
     "avatarColor":"#c0392b", "isConnected":true}
  ],
  "npcList": [{"npcId":1, "name":"陈伯（管家）", "type":1, "remainQuota":15}],
  "myClueCount": 3
}
```

**`serverTime` 说明（2026-11-18 新增，决策 D-25）**

- **含义**：服务器当前时间，**epoch 毫秒**（如 `1763468400000`）。不给格式化字符串，避免时区解析歧义。
- **为什么需要**：`phaseDeadline` 是服务器时钟上的时刻。前端若用玩家本机时钟算"剩余时间"，本机时钟快慢几分钟就会导致倒计时与服务器阶段不同步——玩家可能看到还有时间、投票却被 `3001` 拒绝；或倒计时已走完、服务器仍在收发言。
- **前端用法**：`offset = serverTime + 往返耗时/2 − Date.now()`；`剩余 = phaseDeadline − (Date.now() + offset)`。两次轮询之间用 `performance.now()`（单调时钟）推进，**不要用 `Date.now()`**，否则系统校时（NTP 跳变）会让倒计时跳一下。
- 该字段随 2 秒轮询持续刷新，因此**不需要**单独的 `/api/time` 校准接口。

> ⚠️ **待 PR 内讨论（Q-08）**：`phaseDeadline` 目前是不带时区与毫秒的格式化字符串，前端解析它时仍存在时区歧义——这正是引入 `serverTime` 要规避的问题。是否也改为 epoch 毫秒，请三人在 PR 内讨论后定，**未经同意不单方面改**（D-13）。

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

### 9.4 🔴 防泄密红线

**以上三个接口响应体里绝对不能出现：**

- `groundTruth`（完整真相）
- `leakKeywords`（泄密关键词）
- `isMurderer`（凶手标记）
- 他人的 `privateSecret`（别人的秘密）

实现要求：

1. **用专门的 VO，不要直接返回 Entity**
2. 凶手标记只存服务端
3. 上线前**张宇恒用 F12 逐个接口检查**

### 9.5 并行开发约定：陆豪不等张越扬

Phase 2 陆豪做 `ask-npc` 时，后端房间/状态机可能还没就绪。解决办法：

```
陆豪用假数据先调通：
  - roomId、userId 写死
  - 阶段校验先跳过
  - Redis 配额先用本地变量代替
等张越扬的接口就绪，替换成真实调用
```

---
