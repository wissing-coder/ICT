-- 🔴 必须首行：官方 mysql 镜像的初始化客户端默认字符集是 latin1，
-- 不加这句，中文内容会被双重编码存成乱码。
SET NAMES utf8mb4;

-- 待剧本定稿后填充（与《剧本数据-迷案.md》第七节的 INSERT 语句配套）
-- 此文件必须存在：docker-compose.yml 挂载了它，缺失会导致 MySQL 初始化失败。
