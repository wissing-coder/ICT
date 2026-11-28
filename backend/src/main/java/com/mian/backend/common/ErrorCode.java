package com.mian.backend.common;

/**
 * 错误码表（接口契约 5.2，见 README）。🔴 只增不改。
 * 新增码必须同步更新 README 的错误码表。
 */
public enum ErrorCode {

    SUCCESS(0, "success"),
    PARAM_INVALID(1001, "参数错误"),
    UNAUTHORIZED(1002, "未登录或token失效"),
    ROOM_NOT_FOUND(2001, "房间不存在"),
    ROOM_FULL(2002, "房间人数已满"),
    ALREADY_IN_ROOM(2003, "已在其他房间中"),
    PHASE_NOT_ALLOWED(3001, "当前阶段不允许此操作"),
    QUOTA_EXHAUSTED(3002, "盘问配额已用完"),
    ALREADY_VOTED(3003, "已投过票"),
    AI_UNAVAILABLE(4001, "AI服务暂时不可用"),
    SERVER_ERROR(5000, "服务器内部错误");

    private final int code;
    private final String message;

    ErrorCode(int code, String message) {
        this.code = code;
        this.message = message;
    }

    public int code() {
        return code;
    }

    public String message() {
        return message;
    }
}
