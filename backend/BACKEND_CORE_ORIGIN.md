# 后端基线来源

本工程以用户指定的团队后端 `feat/backend-core/backend/` 为基线继续开发，不再保留另一套独立 Spring Boot 应用。

- 仓库：<https://github.com/wissing-coder/ICT/tree/feat/backend-core/backend>
- 骨架提交：`adee58765c9670dbbee6b1b2f6570e0dc6b16af5`
- 本次对齐的分支头：`6dd2bd8ed57e0c2927d182ecf7437bea7aeeea5a`
- 基线包含 14 个文件：Maven Wrapper、`com.mian:backend:0.0.1-SNAPSHOT`、启动类、统一响应体、错误码、业务异常、全局异常、健康接口、数据库配置及上下文测试。

## 原样沿用

`BackendApplication.java`、`Result.java`、`ErrorCode.java`、`HealthController.java`、Maven Wrapper 与版本 4.1.2 / Java 25。错误码数值和语义不重新定义。

## 基于基线扩展

- 游戏代码迁至 `com.mian.backend.game`，由原 `BackendApplication` 扫描启动；删除独立的 `cn.echo` 启动入口。
- 沿用原 JPA / Redis / Validation / WebMVC 依赖。增加游戏案件解析所需 Jackson 2 和独立试玩用 H2；前端与素材打入原 backend JAR。
- 游戏接口使用 `{code,msg,data}`，业务错误通过原 `BizException` 与全局异常组件处理。`BizException` 只扩展受控的玩家提示构造器；不把数据库或模型异常原文返回前端。
- 默认使用原 MySQL/Redis 路线，账号信息从环境变量覆盖；`ddl-auto=none`。不在业务代码里建表，不修改团队已有九张表。
- 当前游戏快照经 Spring Data JPA 存入 `echo_rooms`。MySQL 需明确执行 `sql/migrations/20261128_room_snapshot.sql`；完整九表业务映射仍是后续任务。
- `preview` 和 `test` 显式 profile 使用 H2 及专用 SQL，供无数据库环境的试玩和自动化检查；不是替代默认 MySQL 配置。
- `phaseDeadline` 恢复团队约定的上海本地时间字符串，另加 `phaseDeadlineMs` 给候选页面使用；`serverTime` 保持毫秒时间戳，前端通过 `performance.now()` 推进倒计时。

源码合并同时保留团队分支的提交祖先关系。公网旧服务不因本次代码同步自动替换。
