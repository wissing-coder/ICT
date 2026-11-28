package com.mian.backend.common;

/**
 * 业务异常：Controller/Service 里抛它，GlobalExceptionHandler 统一转成 Result。
 * 用法：throw new BizException(ErrorCode.ROOM_FULL);
 */
public class BizException extends RuntimeException {

    private final ErrorCode errorCode;

    public BizException(ErrorCode errorCode) {
        super(errorCode.message());
        this.errorCode = errorCode;
    }

    /** Safe player-facing detail; never use SQL or provider exception messages. */
    public BizException(ErrorCode errorCode, String detail) {
        super(detail);
        this.errorCode = errorCode;
    }

    public ErrorCode getErrorCode() {
        return errorCode;
    }
}
