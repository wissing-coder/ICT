SET NAMES utf8mb4;

-- Optional game-integration snapshot storage. Run explicitly on the selected database.
-- Does not alter, replace or seed the team's nine existing tables.
-- Hibernate ddl-auto stays none; application code must not execute CREATE TABLE.
CREATE TABLE IF NOT EXISTS echo_rooms (
    code VARCHAR(12) NOT NULL,
    state_json LONGTEXT NOT NULL,
    PRIMARY KEY (code)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
