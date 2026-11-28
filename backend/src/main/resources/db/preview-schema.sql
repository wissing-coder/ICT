-- Preview compatibility table only. Hibernate is never allowed to generate schema.
CREATE TABLE IF NOT EXISTS echo_rooms (
    code VARCHAR(12) PRIMARY KEY,
    state_json LONGTEXT NOT NULL
);
