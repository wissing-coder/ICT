package com.mian.backend.game;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.*;
import com.mian.backend.persistence.RoomStateStore;
import com.mian.backend.persistence.RoomSnapshotRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static com.mian.backend.game.GameService.m;

@SpringBootTest
@ActiveProfiles("test")
class TeammateModelTest {
    @Autowired RoomStateStore store;
    @Autowired RoomSnapshotRepository repository;
    HttpServer provider;volatile String output="{\"option\":0}";volatile long delay;volatile String received;
    @BeforeEach void start() throws Exception {
        provider=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);provider.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
        provider.createContext("/",exchange->{received=new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.UTF_8);try{Thread.sleep(delay);var data=new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsBytes(Map.of("choices",List.of(Map.of("message",Map.of("content",output)))));exchange.sendResponseHeaders(200,data.length);exchange.getResponseBody().write(data);}catch(Exception ignored){}finally{exchange.close();}});provider.start();
    }
    @AfterEach void stop(){provider.stop(0);}
    TeammateModel model(){return new TeammateModel("http://127.0.0.1:"+provider.getAddress().getPort()+"/","test-key","mock");}
    @Test void validSelectionNeverPublishesArbitraryModelText() throws Exception {assertEquals("许可的回答",model().choose("苏明玉","问题",List.of(m("id","C09","body","公开登记")),List.of("许可的回答")));var envelope=new com.fasterxml.jackson.databind.ObjectMapper().readTree(received);var input=new com.fasterxml.jackson.databind.ObjectMapper().readTree(envelope.path("messages").path(1).path("content").asText());assertFalse(input.has("card"));assertFalse(input.has("digest"));assertFalse(input.has("truth"));assertEquals(4,input.size());assertTrue(received.contains("公开登记"));}
    @Test void malformedForeignOrOutOfBoundsResponseFallsBack() throws Exception {for(String invalid:List.of("不是JSON","{\"option\":99}","{\"text\":\"私卡与新证据\"}","{\"option\":0.2}")){output=invalid;String result;try{result=model().choose("林砚秋","问题",List.of(),List.of("许可回答"));}catch(Exception e){result=null;}assertNull(result);}}
    @Test void slowProviderDoesNotHoldPlayerActionsOrPublishLateAcrossPhase() throws Exception {
        var fixture=new GameServiceTest();fixture.store=store;fixture.repository=repository;fixture.setup();var g=fixture.g;g.model=model();var seat=fixture.enter("solo","yu","");fixture.phase(seat,3);var r=g.rooms.get(seat.code());var bot=r.players.stream().filter(p->p.bot).findFirst().orElseThrow();delay=3000;
        long start=System.nanoTime();fixture.act(seat,"message","text","你怎么想","to",bot.id);assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-start)<500);
        assertEquals(1,g.pending.size());g.move(r);Thread.sleep(2800);assertTrue(g.pending.isEmpty());assertEquals(1,r.messages.size());g.modelWorkers.shutdownNow();
    }
    @Test void slowProviderGetsLocalFallbackWithinDeadline() throws Exception {
        var fixture=new GameServiceTest();fixture.store=store;fixture.repository=repository;fixture.setup();var g=fixture.g;g.model=model();var seat=fixture.enter("solo","lin","");fixture.phase(seat,3);var r=g.rooms.get(seat.code());var bot=r.players.stream().filter(p->p.bot).findFirst().orElseThrow();delay=3000;fixture.act(seat,"message","text","时间呢？","to",bot.id);
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(3);while(r.messages.size()<2&&System.nanoTime()<deadline)Thread.sleep(25);
        synchronized(g){assertEquals(2,r.messages.size());assertTrue(((String)r.messages.getLast().get("text")).contains("先核对时间"));}g.modelWorkers.shutdownNow();
    }
}
