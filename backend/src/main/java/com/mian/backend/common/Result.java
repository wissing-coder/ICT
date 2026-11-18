package com.mian.backend.common;

/**
 * 统一响应体（接口契约 5.1，见 README）。
 * 前端只判断 code === 0。
 */
public record Result<T>(int code, String msg, T data) {

    public static <T> Result<T> ok(T data) {
        return new Result<>(ErrorCode.SUCCESS.code(), "success", data);
    }

    public static Result<Void> ok() {
        return new Result<>(ErrorCode.SUCCESS.code(), "success", null);
    }

    public static <T> Result<T> fail(ErrorCode errorCode) {
        return new Result<>(errorCode.code(), errorCode.message(), null);
    }

    public static <T> Result<T> fail(ErrorCode errorCode, String detail) {
        return new Result<>(errorCode.code(), detail, null);
    }
}
