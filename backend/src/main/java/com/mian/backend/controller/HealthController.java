package com.mian.backend.controller;

import com.mian.backend.common.Result;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 健康检查（Phase 0 验收项：/api/health 返回 200）。
 */
@RestController
public class HealthController {

    @GetMapping("/api/health")
    public Result<String> health() {
        return Result.ok("UP");
    }
}
