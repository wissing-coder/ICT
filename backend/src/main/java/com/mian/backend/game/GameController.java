package com.mian.backend.game;

import com.mian.backend.common.Result;
import java.util.Map;
import org.springframework.web.bind.annotation.*;
import jakarta.servlet.http.HttpServletRequest;

@RestController
public class GameController {
    private final GameService game;
    public GameController(GameService game){this.game=game;}
    @GetMapping("/healthz") Map<String,Object> health(){return Map.of("ok",true,"edition","backend-core-integrated");}
    @GetMapping("/api/bootstrap") Result<?> bootstrap(){return Result.ok(game.bootstrap());}
    @GetMapping("/api/game/role") Result<?> role(@RequestHeader(value="Authorization",defaultValue="") String auth){return Result.ok(game.role(auth));}
    @PostMapping("/api/game/ask-npc") Result<?> askNpc(@RequestHeader(value="Authorization",defaultValue="") String auth,@RequestBody Map<String,Object> body){return Result.ok(game.askNpc(auth,body));}
    @PostMapping("/api/{action}") Result<?> entry(@PathVariable String action,@RequestBody Map<String,Object> body,
            @RequestHeader(value="Authorization",defaultValue="") String auth,HttpServletRequest request){
        return Result.ok(game.entry(action,body,auth,request.getRemoteAddr()));
    }
    @GetMapping("/api/match") Result<?> match(@RequestHeader(value="Authorization",defaultValue="") String auth){return Result.ok(game.matchState(auth,true));}
    @PostMapping("/api/match/cancel") Result<?> cancel(@RequestHeader(value="Authorization",defaultValue="") String auth){return Result.ok(game.cancelMatch(auth));}
    @GetMapping("/api/room/{code}/state") Result<?> state(@PathVariable String code,@RequestHeader(value="Authorization",defaultValue="") String auth){return Result.ok(game.state(code,auth));}
    @PostMapping("/api/room/{code}/{action}") Result<?> action(@PathVariable String code,@PathVariable String action,@RequestBody Map<String,Object> body,
            @RequestHeader(value="Authorization",defaultValue="") String auth){return Result.ok(game.action(code,action,body,auth));}
}
