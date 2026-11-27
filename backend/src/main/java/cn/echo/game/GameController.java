package cn.echo.game;

import java.util.Map;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import jakarta.servlet.http.HttpServletRequest;

@RestController
public class GameController {
    private final GameService game;
    public GameController(GameService game) { this.game = game; }

    @GetMapping("/healthz") Map<String,Object> health() { return Map.of("ok",true,"edition","formal-2.0"); }
    @GetMapping("/api/bootstrap") Map<String,Object> bootstrap() { return game.bootstrap(); }
    @PostMapping("/api/{action}") Object entry(@PathVariable String action, @RequestBody Map<String,Object> body,
            @RequestHeader(value="Authorization",defaultValue="") String auth, HttpServletRequest req) {
        return game.entry(action,body,auth,req.getRemoteAddr());
    }
    @GetMapping("/api/match") Object match(@RequestHeader(value="Authorization",defaultValue="") String auth) { return game.matchState(auth,true); }
    @PostMapping("/api/match/cancel") Object cancel(@RequestHeader(value="Authorization",defaultValue="") String auth) { return game.cancelMatch(auth); }
    @GetMapping("/api/room/{code}/state") Object state(@PathVariable String code,
            @RequestHeader(value="Authorization",defaultValue="") String auth) { return game.state(code,auth); }
    @PostMapping("/api/room/{code}/{action}") Object action(@PathVariable String code,@PathVariable String action,
            @RequestBody Map<String,Object> body,@RequestHeader(value="Authorization",defaultValue="") String auth) {
        return game.action(code,action,body,auth);
    }
    @ExceptionHandler(GameService.Failure.class) ResponseEntity<?> failure(GameService.Failure ex) {
        return ResponseEntity.status(ex.status).body(Map.of("error",ex.getMessage()));
    }
    @ExceptionHandler(org.springframework.http.converter.HttpMessageNotReadableException.class)
    ResponseEntity<?> invalid() { return ResponseEntity.badRequest().body(Map.of("error","请求格式不正确。")); }
}
