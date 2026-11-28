package com.mian.backend.game;

import org.junit.jupiter.api.*;
import com.mian.backend.persistence.RoomStateStore;
import com.mian.backend.persistence.RoomSnapshotRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static com.mian.backend.game.GameService.m;

@SpringBootTest
@ActiveProfiles("test")
class GameServiceTest {
    GameService g;
    @Autowired RoomStateStore store;
    @Autowired RoomSnapshotRepository repository;
    @BeforeEach void setup() throws Exception {repository.deleteAll();g=engine();}
    @AfterEach void stopEngine(){if(g!=null)g.shutdown();}
    GameService engine() throws Exception{return new GameService(store,60000,45000,"test","","");}
    record Seat(String code,String auth,String id){}
    @SuppressWarnings("unchecked") Seat enter(String mode,String role,String code){Map<String,Object> e=(Map<String,Object>)g.entry(mode,m("name","同名玩家","role",role,"avatarId",role+"-2","code",code),"","test");Map<String,Object>s=(Map<String,Object>)e.get("state");return new Seat((String)s.get("code"),"Bearer "+e.get("token"),(String)s.get("me"));}
    Map<String,Object> act(Seat s,String a,Object...v){var body=m(v);body.putIfAbsent("phase",g.rooms.get(s.code).phase);return cast(g.action(s.code,a,body,s.auth));}
    @SuppressWarnings("unchecked") Map<String,Object> cast(Object o){return (Map<String,Object>)o;}
    Map<String,Object> state(Seat s){return cast(g.state(s.code,s.auth));}
    void phase(Seat s,int p){var r=g.rooms.get(s.code);r.phase=p;r.since=System.currentTimeMillis();r.phaseReady.clear();}
    List<Seat> friends(){Seat a=enter("create","xuan",""),b=enter("join","yu",a.code),c=enter("join","lin",a.code);return List.of(a,b,c);}
    void allClues(Seat s){var r=g.rooms.get(s.code);for(int i=1;i<=12;i++)g.publish(r,"C%02d".formatted(i),"真人发现");}

    @Test void soloStartsWithTwoBotsAndLockedAppearance(){Seat s=enter("solo","yu","");assertEquals(1,state(s).get("phase"));assertEquals(3,g.rooms.get(s.code).players.size());assertThrows(GameService.Failure.class,()->act(s,"seat","role","yu","avatarId","yu-1"));assertEquals("yu-2",g.rooms.get(s.code).players.getFirst().avatarId);}
    @Test void readyIsExplicitAndIdempotent(){Seat s=enter("create","xuan","");act(s,"ready","ready",true);act(s,"ready","ready",true);assertTrue(g.rooms.get(s.code).players.getFirst().ready);act(s,"ready","ready",false);assertFalse(g.rooms.get(s.code).players.getFirst().ready);}
    @Test void duplicateNamesUseDistinctSpeakers(){var seats=friends();Seat a=seats.getFirst(),b=seats.get(1);phase(a,3);act(a,"message","text","我的观察");act(b,"message","text","另一人的观察");var messages=g.rooms.get(a.code).messages;assertNotEquals(messages.get(0).get("speakerId"),messages.get(1).get("speakerId"));assertEquals(messages.get(0).get("by"),messages.get(1).get("by"));}
    @Test void privateCardsAndCredentialsNeverCrossSeats() throws Exception {var seats=friends();phase(seats.getFirst(),1);for(Seat s:seats){String data=g.json.writeValueAsString(state(s));assertFalse(data.contains("digest"));assertFalse(data.contains("votes\""));assertFalse(data.contains("state_json"));assertTrue(data.contains("card"));assertFalse(data.contains("result"));}assertThrows(GameService.Failure.class,()->g.state(seats.getFirst().code,seats.get(1).auth.replace("Bearer ","Bearer bad")));assertNotEquals(state(seats.get(0)).get("card"),state(seats.get(1)).get("card"));}
    @Test void invalidAvatarAndOccupiedSeatDoNotConsumeNewSlot(){Seat a=enter("create","xuan","");assertThrows(GameService.Failure.class,()->g.entry("join",m("code",a.code,"name","B","role","yu","avatarId","xuan-2"),"","test"));assertEquals(1,g.rooms.get(a.code).players.size());Seat b=enter("join","xuan",a.code);assertNull(g.rooms.get(a.code).players.get(1).role);act(b,"seat","role","yu");assertEquals("yu-1",g.rooms.get(a.code).players.get(1).avatarId);}
    @Test void hiddenChainRequiresAllStepsAndIsOnceOnly() throws Exception {Seat s=enter("solo","yu","");phase(s,3);assertThrows(GameService.Failure.class,()->act(s,"compare","target","coat-fabric"));for(String t:List.of("register","coat","cloth"))act(s,"inspect","target",t);act(s,"present","target","chen","itemId","loan-register");var pool=Executors.newVirtualThreadPerTaskExecutor();try{var tasks=new ArrayList<Future<?>>();for(int i=0;i<12;i++)tasks.add(pool.submit(()->act(s,"compare","target","coat-fabric")));for(var f:tasks)f.get();}finally{pool.close();}assertEquals(1,g.rooms.get(s.code).exploration.stream().filter(e->"H01".equals(e.get("reward"))).count());assertTrue(g.rooms.get(s.code).clues.containsKey("C10"));}
    @Test void repeatRequestDoesNotRepeatQuestionOrAiReply(){Seat s=enter("solo","lin","");phase(s,3);String bot=g.rooms.get(s.code).players.stream().filter(p->p.bot).findFirst().orElseThrow().id;act(s,"message","text","你怎么想？","to",bot,"requestId","retry");act(s,"message","text","你怎么想？","to",bot,"requestId","retry");assertEquals(2,g.rooms.get(s.code).messages.size());assertEquals(1,g.rooms.get(s.code).asked);}
    @Test void unpublishedReferencesAndOtherRoomRepliesRejected(){Seat s=enter("solo","yu","");phase(s,3);assertThrows(GameService.Failure.class,()->act(s,"message","text","未公开证物","clueId","C09"));assertThrows(GameService.Failure.class,()->act(s,"message","text","外房消息","replyTo","not-in-room"));assertTrue(g.rooms.get(s.code).messages.isEmpty());}
    @Test void votesArePrivateAndCannotTargetSelfOrRepeat(){var seats=friends();Seat a=seats.getFirst();phase(a,4);allClues(a);assertThrows(GameService.Failure.class,()->act(a,"vote","target",a.id,"clueIds",List.of("C09")));act(a,"vote","target",seats.get(1).id,"clueIds",List.of("C09","C11"));assertEquals(1,state(seats.get(1)).get("votedCount"));assertFalse(state(seats.get(1)).containsKey("result"));assertFalse(state(seats.get(1)).containsKey("votes"));assertThrows(GameService.Failure.class,()->act(a,"vote","target","","clueIds",List.of()));}
    @Test void stalePhaseConfirmationRejected(){Seat s=enter("solo","lin","");assertThrows(GameService.Failure.class,()->act(s,"phase-ready","phase",2));assertTrue(g.rooms.get(s.code).phaseReady.isEmpty());act(s,"phase-ready","phase",1);assertEquals(2,g.rooms.get(s.code).phase);}
    @Test void timeoutFillsCoreEvidenceAndBotsCompleteWithoutModel(){Seat s=enter("solo","yu","");phase(s,2);var r=g.rooms.get(s.code);r.since-=4*60000;g.tick(r);assertEquals(3,r.phase);assertEquals(4,r.clues.size());r.since-=7*60000;g.tick(r);assertEquals(3,r.phase);assertEquals(12,r.clues.size());r.releasedAt-=31000;g.tick(r);assertEquals(4,r.phase);r.since-=2500;g.tick(r);act(s,"vote","target",r.players.stream().filter(p->p.role.equals("xuan")).findFirst().orElseThrow().id,"clueIds",List.of("C09","C11"));assertEquals(5,r.phase);assertNotNull(state(s).get("result"));}
    @Test void persistedRoomsRestorePrivateCredentialsAndExploration() throws Exception {Seat s=enter("solo","lin","");phase(s,3);act(s,"inspect","target","register");GameService restored=engine();assertNotNull(restored.state(s.code,s.auth));assertTrue(restored.rooms.get(s.code).inventory.contains("loan-register"));restored.rooms.get(s.code).players.getFirst().avatarId=null;assertTrue(restored.json.writeValueAsString(restored.state(s.code,s.auth)).contains("lin-1"));}
    @Test void quickMatchRequiresDistinctRolesAndCancellationReturnsAssignedRoom(){String[] tokens=new String[4];String[] roles={"yu","yu","xuan","lin"};for(int i=0;i<4;i++){var e=cast(g.entry("match",m("name","Q","role",roles[i],"avatarId",roles[i]+"-2"),"","test"));tokens[i]=(String)e.get("token");if(i<3)assertTrue(cast(e.get("match")).containsKey("waiting"));}assertTrue(cast(g.matchState("Bearer "+tokens[1],false)).containsKey("waiting"));assertTrue(cast(g.cancelMatch("Bearer "+tokens[0])).containsKey("state"));assertEquals(1,g.rooms.values().iterator().next().phase);}
    @Test void recruitmentAndBotFillCannotOverbook(){Seat a=enter("create","xuan",""),b=enter("join","yu",a.code);act(a,"ready","ready",true);act(b,"ready","ready",true);act(a,"recruit");act(b,"ready","ready",false);assertEquals(0,g.rooms.get(a.code).recruiting);act(b,"ready","ready",true);act(a,"add-bot");assertThrows(GameService.Failure.class,()->enter("join","lin",a.code));assertEquals(3,g.rooms.get(a.code).players.size());assertEquals(1,g.rooms.get(a.code).phase);}
    @Test void snapshotsRemainStableWhenRoomChanges(){Seat s=enter("solo","yu","");var v=state(s);act(s,"phase-ready");assertEquals(1,v.get("phase"));assertEquals(List.of(),v.get("phaseReady"));assertEquals(2,state(s).get("phase"));}
}
