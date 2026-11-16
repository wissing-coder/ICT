# 《迷案·回声》项目资料

> 本仓库为公开仓库；完整剧本包含案件真相和角色秘密。公开前请先读文末「待决策」。

## 文档

| 文件 | 内容 | 维护 |
|---|---|---|
| `script-mianan.md` | 完整剧本数据：4 角色卡、2 个 AI NPC 人设与知识范围、14 条线索、建库 SQL | 张宇恒 |
| `script-review-and-handoff.docx` | 剧本定稿自查报告：14 条时间线与机密标记、13 个泄密词扫描结果、七项自查表、`play_guide` 拆分说明、交付话术 | 张宇恒 |
| `team-coordination.md` | 三人分工与协作规则（独立项目版，Phase 0-4） | 全员 |
| `Mian_HuiSheng_Game_Design_and_Team_Plan.md` | 游戏设计与团队计划 | 全员 |

## 仓库其它位置

| 路径 | 内容 |
|---|---|
| `DECISIONS.md` | 决策记录，每行一条「日期 · 决策 · 理由」 |
| `sql/init_data_character.sql` | character 表数据（含 `play_guide` 字段），替换 `init_data.sql` 中对应段落 |

## 待决策

- **仓库公开还是私有。** 完整剧本含 `ground_truth`，而「数据进仓库」是可复现的前提。两者在公开仓库里冲突：仓库设 public 就等于公开答案。建议在 Phase 4 决定——若要让人真的来玩，public 之前把 `script-mianan.md` 与 `sql/init_data.sql` 拆到单独私有仓库或私有子模块。
