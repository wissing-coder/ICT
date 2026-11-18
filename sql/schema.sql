-- ============================================================
-- 《迷案》AI 剧本杀 · 数据库表结构（9 张表）
-- 数据库 mian 由 docker-compose.yml 的 MYSQL_DATABASE 自动创建，
-- 本文件不要写 CREATE DATABASE / USE 语句。
-- 编码 utf8mb4 由 compose 的 command 指定。
-- 来源：《AI剧本杀技术方案.md》第四节，原样复制。
-- ============================================================

-- 🔴 必须首行：官方 mysql 镜像的初始化客户端默认字符集是 latin1，
-- 不加这句，中文 COMMENT 会被双重编码存成乱码。
SET NAMES utf8mb4;

-- 表1：user 用户表
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

-- 表2：script 剧本表
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

-- 表3：character 玩家角色表
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

-- 表4：npc AI 角色表（核心）
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

-- 表5：clue 线索表
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

-- 表6：game_room 房间表
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

-- 表7：room_player 房间玩家表
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

-- 表8：ai_dialogue AI 对话记录表（数据埋点）
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

-- 表9：vote 投票表
CREATE TABLE `vote` (
  `id`                  BIGINT   NOT NULL AUTO_INCREMENT,
  `room_id`             BIGINT   NOT NULL,
  `voter_id`            BIGINT   NOT NULL,
  `target_character_id` BIGINT   NOT NULL,
  `created_at`          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_room_voter` (`room_id`, `voter_id`) COMMENT '一人一票，数据库层兜底'
) COMMENT='投票表';
