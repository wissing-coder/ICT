package cn.echo.game;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import java.security.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Single-instance authoritative game engine. Never serialize Room directly to a client. */
@Service
public class GameService {
    static final String VERSION="tingyuxuan-2.0";
    static final List<String> ROLES=List.of("xuan","yu","lin");
    static final int[] MINUTES={0,2,3,7,4,0};
    static final int[] EARLY={0,0,1,3,0,0};
    static final Map<String,String> NAMES=Map.of("xuan","苏明轩","yu","苏明玉","lin","林砚秋");
    final ObjectMapper json=new ObjectMapper();
    final LinkedHashMap<String,Room> rooms=new LinkedHashMap<>();
    final LinkedHashMap<String,Ticket> queue=new LinkedHashMap<>();
    final Map<String,Map<String,Object>> cases=new HashMap<>();
    final Map<String,long[]> limits=new HashMap<>();
    final Map<String,Pending> pending=new HashMap<>();
    final java.util.concurrent.ExecutorService modelWorkers=java.util.concurrent.Executors.newFixedThreadPool(4);
    TeammateModel model=new TeammateModel();
    final JdbcTemplate db;
    final long minute,presence;
    final String icp,police,policeUrl;

    public static class Player {
        public String id,name,digest,role,avatarId;
        public boolean bot,ready,matched;
        public long seen;
    }
    public static class Room {
        public String code,mode,caseVersion=VERSION;
        public int phase=0,asked=0;
        public long since=System.currentTimeMillis(),recruiting=0,releasedAt=0;
        public List<Player> players=new ArrayList<>();
        public Map<String,String> clues=new LinkedHashMap<>(),votes=new LinkedHashMap<>();
        public Map<String,List<String>> voteClues=new LinkedHashMap<>();
        public Set<String> phaseReady=new HashSet<>(),events=new LinkedHashSet<>(),inventory=new LinkedHashSet<>(),botActions=new HashSet<>();
        public List<Map<String,Object>> messages=new ArrayList<>(),exploration=new ArrayList<>();
        public Map<String,Map<String,Object>> requests=new LinkedHashMap<>();
    }
    static class Ticket { String name,role,avatar,token; long since,seen; }
    record Pending(String botId,String questionId,int phase,long deadline,String fallback,String clue,String to){}
    public static class Failure extends RuntimeException {
        final int status; Failure(int s,String message){super(message);status=s;}
    }
    static void need(boolean ok,String message){ if(!ok) throw new Failure(409,message); }
    static Map<String,Object> m(Object...pairs){Map<String,Object> r=new LinkedHashMap<>();for(int i=0;i<pairs.length;i+=2)r.put((String)pairs[i],pairs[i+1]);return r;}
    static String uid(){return UUID.randomUUID().toString();}
    static String hash(String value){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
    static String clean(Object v,int max){need(v instanceof String,"请填写内容。");String s=((String)v).trim();need(!s.isEmpty()&&s.length()<=max,"输入为空或过长。");return s;}
    static String string(Map<String,Object>b,String key){Object v=b.get(key);return v instanceof String?(String)v:"";}
    static long now(){return System.currentTimeMillis();}
    @jakarta.annotation.PreDestroy void shutdown(){modelWorkers.shutdownNow();}

    public GameService(JdbcTemplate db,@Value("${game.minute-ms}") long minute,@Value("${game.presence-ms}")long presence,
            @Value("${game.icp}")String icp,@Value("${game.police-number}")String police,@Value("${game.police-url}")String policeUrl) throws Exception {
        this.db=db;this.minute=minute;this.presence=presence;this.icp=icp;this.police=police;this.policeUrl=policeUrl;
        try(var in=new ClassPathResource("cases/tingyuxuan-2.json").getInputStream()) {cases.put(VERSION,json.readValue(in,new TypeReference<>(){}));}
        db.execute("CREATE TABLE IF NOT EXISTS echo_rooms (code VARCHAR(12) PRIMARY KEY, state_json LONGTEXT NOT NULL)");
        for(String state:db.query("SELECT state_json FROM echo_rooms",(rs,n)->rs.getString(1))) {
            Room r=json.readValue(state,Room.class);rooms.put(r.code,r);
        }
    }
    Map<String,Object> content(Room r){var c=cases.get(r.caseVersion);need(c!=null,"该房间案件版本需由对应旧版本打开。");return c;}
    @SuppressWarnings("unchecked") List<Map<String,Object>> clues(Room r){return (List<Map<String,Object>>)content(r).get("clues");}
    @SuppressWarnings("unchecked") Map<String,Object> object(Room r,String key){return (Map<String,Object>)content(r).get(key);}
    void save(Room r){try{String s=json.writeValueAsString(r);if(db.update("UPDATE echo_rooms SET state_json=? WHERE code=?",s,r.code)==0)db.update("INSERT INTO echo_rooms(code,state_json) VALUES (?,?)",r.code,s);}catch(Exception ex){throw new IllegalStateException("房间保存失败",ex);}}
    void limit(String key,int maximum){long[] b=limits.computeIfAbsent(key,k->new long[]{now()+60000,0});if(now()>b[0]){b[0]=now()+60000;b[1]=0;}if(++b[1]>maximum)throw new Failure(429,"操作过于频繁，请稍后再试。");}
    String token(String auth){need(auth.startsWith("Bearer ")&&auth.length()<200,"请重新进入房间。");return auth.substring(7);}
    Room room(String code){Room r=rooms.get(code);if(r==null)throw new Failure(404,"未找到房间，请检查房间码。");content(r);return r;}
    Player me(Room r,String auth){String d=hash(token(auth));Player p=r.players.stream().filter(x->!x.bot&&d.equals(x.digest)).findFirst().orElseThrow(()->new Failure(403,"没有该房间的访问权限。"));p.seen=now();return p;}
    Player newPlayer(Room r,String name,String token){Player p=new Player();p.id=uid();p.name=name;p.digest=hash(token);p.seen=now();r.players.add(p);return p;}
    Room create(String mode){need(rooms.size()<500,"当前试玩房间已满。");Room r=new Room();do{r.code=UUID.randomUUID().toString().substring(0,8).toUpperCase();}while(rooms.containsKey(r.code));r.mode=mode;rooms.put(r.code,r);return r;}
    String avatar(String role,String value){need(ROLES.contains(role),"请选择有效角色。");if(value.isBlank())return role+"-1";need(value.equals(role+"-1")||value.equals(role+"-2"),"外观与角色不符。");return value;}
    String avatar(Player p){return p.avatarId!=null?p.avatarId:p.role==null?null:p.role+"-1";}
    void seat(Room r,Player p,String role,String appearance){need(r.phase==0,"开场后角色和外观已固定。");String a=avatar(role,appearance);need(r.players.stream().noneMatch(x->x!=p&&role.equals(x.role)),"角色已被选择。");if(!role.equals(p.role))p.ready=false;p.role=role;p.avatarId=a;r.recruiting=0;}
    void host(Room r,Player p){need(!r.mode.equals("quick")&&r.players.getFirst()==p,"只有房主可以操作。");}
    List<String> vacancies(Room r){return ROLES.stream().filter(role->r.players.stream().noneMatch(p->role.equals(p.role))).toList();}
    boolean botEligible(Room r){return r.phase==0&&!r.mode.equals("quick")&&r.players.size()>=1&&r.players.size()<3&&r.players.stream().allMatch(p->!p.bot&&p.role!=null&&p.ready&&now()-p.seen<presence);}
    void bots(Room r){for(String role:vacancies(r)){Player p=new Player();p.id=uid();p.name=NAMES.get(role);p.role=role;p.avatarId=role+"-1";p.bot=true;p.ready=true;r.players.add(p);}}
    public synchronized Map<String,Object> bootstrap(){return m("roles",cases.get(VERSION).get("roles"),"version",VERSION,"avatars",ROLES.stream().flatMap(r->List.of(r+"-1",r+"-2").stream()).map(id->m("id",id,"role",id.split("-")[0],"portrait","/assets/portraits/"+id+".webp","thumbnail","/assets/portraits/"+id+"-thumb.webp")).toList(),"icp",icp,"police",police,"policeUrl",policeUrl);}
    public synchronized Object entry(String action,Map<String,Object>b,String auth,String ip){
        need(List.of("create","join","solo","match").contains(action),"未知入口。");limit("entry:"+ip,20);
        String name=clean(b.get("name"),20);
        if(action.equals("match")){
            String t=auth.isEmpty()?uid()+uid():token(auth);Object existing=matchState("Bearer "+t,false);
            if(existing instanceof Map<?,?> map&&(map.containsKey("state")||map.containsKey("waiting")))return m("token",t,"match",existing);
            Ticket q=new Ticket();q.name=name;q.role=string(b,"role");q.avatar=avatar(q.role,string(b,"avatarId"));q.token=t;q.since=q.seen=now();queue.put(hash(t),q);matching();return m("token",t,"match",matchState("Bearer "+t,false));
        }
        String requestedRole=string(b,"role"),requestedAvatar=string(b,"avatarId");if(!requestedRole.isEmpty())avatar(requestedRole,requestedAvatar);
        need(!action.equals("solo")||ROLES.contains(requestedRole),"请选择角色。");
        String t=uid()+uid();Room r;
        if(action.equals("join")){r=room(clean(b.get("code"),8).toUpperCase());need(r.phase==0&&r.players.size()<3,"房间已开始或已满。");r.recruiting=0;if(r.players.stream().anyMatch(q->requestedRole.equals(q.role)))requestedAvatar="";}
        else r=create(action.equals("solo")?"solo":"friends");
        Player p=newPlayer(r,name,t);
        if(!requestedRole.isEmpty()&&r.players.stream().noneMatch(q->q!=p&&requestedRole.equals(q.role)))seat(r,p,requestedRole,requestedAvatar);
        if(action.equals("solo")){need(p.role!=null,"请选择角色。");p.ready=true;bots(r);move(r);}
        save(r);return m("token",t,"state",view(r,p));
    }
    public synchronized Object matchState(String auth,boolean heartbeat){
        String d=hash(token(auth));for(Room r:rooms.values())for(Player p:r.players)if(p.matched&&d.equals(p.digest)){if(heartbeat)p.seen=now();tick(r);return m("state",view(r,p));}
        Ticket t=queue.get(d);if(t!=null&&now()-t.seen<presence){if(heartbeat)t.seen=now();return m("waiting",m("role",t.role,"avatarId",t.avatar,"since",t.since,"serverTime",now()));}
        queue.remove(d);return m("expired",true,"message","排队已结束或服务已重启，请重新排队。");
    }
    public synchronized Object cancelMatch(String auth){Object current=matchState(auth,false);if(((Map<?,?>)current).containsKey("state"))return current;queue.remove(hash(token(auth)));return m("cancelled",true);}
    void matched(Room r,Ticket t){Player p=newPlayer(r,t.name,t.token);p.role=t.role;p.avatarId=t.avatar;p.ready=true;p.matched=true;queue.remove(hash(t.token));}
    void matching(){
        queue.values().removeIf(t->now()-t.seen>=presence);
        for(Room r:rooms.values().stream().filter(x->x.recruiting>0).sorted(Comparator.comparingLong(x->x.recruiting)).toList()){
            if(!botEligible(r)||r.players.size()!=2){r.recruiting=0;save(r);continue;}
            Ticket t=queue.values().stream().filter(q->q.role.equals(vacancies(r).getFirst())).findFirst().orElse(null);
            if(t!=null){matched(r,t);move(r);save(r);}
        }
        while(rooms.size()<500){List<Ticket> trio=ROLES.stream().map(role->queue.values().stream().filter(t->t.role.equals(role)).findFirst().orElse(null)).toList();if(trio.contains(null))break;Room r=create("quick");trio.forEach(t->matched(r,t));move(r);save(r);}
    }
    void publish(Room r,String id,String source){r.clues.putIfAbsent(id,source);}
    void move(Room r){
        pending.keySet().removeIf(key->key.startsWith(r.code+":"));
        if(r.phase==2||r.phase==3)for(var c:clues(r))if(((Number)c.get("phase")).intValue()<=r.phase)publish(r,(String)c.get("id"),"系统补发");
        if(r.phase==4)for(Player p:r.players)r.votes.putIfAbsent(p.id,"");
        r.phase++;r.since=now();r.phaseReady.clear();r.releasedAt=0;r.recruiting=0;
    }
    String block(Room r){
        if(now()-r.since<EARLY[r.phase]*minute)return "仍在最短调查时间内";
        if(r.phase==2&&r.clues.isEmpty())return "先调查至少一件现场证物";
        if(r.phase==3&&r.clues.size()<12)return "等待证物齐全";
        if(r.phase==3&&r.releasedAt>0&&now()-r.releasedAt<minute/2)return "请先阅读补发证物";
        return "";
    }
    void message(Room r,String speaker,String by,String text,String clue,String reply,String to){r.messages.add(m("id",uid(),"speakerId",speaker,"by",by,"text",text,"clueId",clue,"replyTo",reply,"to",to,"at",now()));}
    void botVote(Room r,Player p){
        // No access to human choices. Public independent identity evidence is required.
        String target="";if(!p.role.equals("xuan")&&r.clues.keySet().containsAll(List.of("C06","C09","C10","C11")))target=r.players.stream().filter(x->"xuan".equals(x.role)).findFirst().orElseThrow().id;
        // The culprit's private goal also asks him not to blame Mingyu. No invented accusation.
        r.votes.put(p.id,target);r.voteClues.put(p.id,target.isEmpty()?List.of():List.of("C06","C10"));
    }
    String localReply(Room r,Player p,String question,String clue){
        String prefix=switch(p.role){case "xuan"->"这件事不能只凭猜测算在我头上。";case "yu"->"我更想把家里人的说法对照清楚。";default->"先分清我们看见的事实和推断。";};
        String topic="";
        if(question.matches(".*(时间|几点|何时|多久|行踪).*"))topic="先核对时间的范围。";
        else if(question.matches(".*(是谁|谁穿|谁借|认出|人物|关系).*"))topic="人物身份还需要独立记录支持。";
        if(clue==null||!r.clues.containsKey(clue))return prefix+topic+"眼下公开材料还不足，我不知道的部分不能替谁作证。";
        Map<String,String> lines=Map.ofEntries(
            Map.entry("C01","锁舌状态可以说明门怎样关上，还不能单独说明是谁动的手。"),Map.entry("C02","镇纸与伤势需要对照，谁有动机仍是另一回事。"),Map.entry("C03","死亡时段有范围，不能把估计当成精确时刻。"),Map.entry("C04","遗嘱只是草稿，利益冲突能说明动机，却不能独自证明凶手。"),
            Map.entry("C05","路线能走通，不等于已经证明某个人走过。"),Map.entry("C06","陈伯看见明轩从暖阁外门方向走来；方向仍不能证明他在房内做了什么。"),Map.entry("C07","擦痕支持阳台路线，但谁留下的还要继续核对。"),Map.entry("C08","白棉纤维与门锁的关系值得检查，颜色相同还不够。"),Map.entry("C09","登记记下借衣人，仍需确认外套当晚在谁手里。"),Map.entry("C10","外套破口与布片相合，何时挂破还要看阿福的记录。"),Map.entry("C11","工作记录提供了独立时间锚点，可以检验借衣与归还的说法。"),Map.entry("C12","日记只写下生前所想，不能替死者讲述后来发生的事。"));
        return prefix+topic+"【"+clue+"】"+lines.getOrDefault(clue,"还需要另一份记录交叉验证。");
    }
    void reply(Room r,Player bot,String question,String clue,String questionId,String to){
        String fallback=localReply(r,bot,question,clue);
        if(!model.ready()){message(r,bot.id,bot.name,fallback,clue,questionId,to);return;}
        String key=r.code+":"+bot.id;
        var job=new Pending(bot.id,questionId,r.phase,now()+2500,fallback,clue,to);pending.put(key,job);
        List<Map<String,Object>> facts=clues(r).stream().filter(c->r.clues.containsKey(c.get("id"))).map(c->m("id",c.get("id"),"body",c.get("body"))).toList();
        List<String> choices=List.of(fallback,localReply(r,bot,"",clue),localReply(r,bot,"",null));
        java.util.concurrent.CompletableFuture.supplyAsync(()->{try{return model.choose(NAMES.get(bot.role),question,facts,choices);}catch(Exception ex){return null;}},modelWorkers).orTimeout(2500,java.util.concurrent.TimeUnit.MILLISECONDS).whenComplete((answer,error)->finishReply(r,key,job,error==null?answer:null));
    }
    synchronized void finishReply(Room r,String key,Pending job,String answer){
        if(pending.get(key)!=job||r.phase!=job.phase)return;
        pending.remove(key);Player bot=r.players.stream().filter(p->p.id.equals(job.botId)).findFirst().orElseThrow();
        message(r,bot.id,bot.name,answer==null||now()>job.deadline?job.fallback:answer,job.clue,job.questionId,job.to);save(r);
    }
    void tick(Room r){
        if(r.phase<1||r.phase>4)return;boolean changed=false;long elapsed=now()-r.since;
        for(Player p:r.players)if(p.bot){String key=r.phase+":"+p.id;
            if((r.phase==2||r.phase==3)&&elapsed>=1000+(r.players.indexOf(p)%2)*700&&!r.botActions.contains(key)){
                var clue=clues(r).stream().filter(c->((Number)c.get("phase")).intValue()==r.phase&&!r.clues.containsKey(c.get("id"))).findFirst().orElse(null);
                String id=clue==null?null:(String)clue.get("id");if(id!=null)publish(r,id,"AI发现");
                message(r,p.id,p.name,localReply(r,p,"",id),id,null,null);r.botActions.add(key);changed=true;
            }
            if(r.phase==4&&elapsed>=1000&&!r.votes.containsKey(p.id)){botVote(r,p);changed=true;}
        }
        if(r.phase==3&&elapsed>=5*minute&&r.clues.size()<12){for(var c:clues(r))publish(r,(String)c.get("id"),"系统补发");r.releasedAt=now();changed=true;}
        boolean humansDone=r.players.stream().allMatch(p->p.bot||r.phaseReady.contains(p.id));
        if(r.phase<=3&&((elapsed>=MINUTES[r.phase]*minute&&(r.releasedAt==0||now()-r.releasedAt>=minute/2))||(humansDone&&block(r).isEmpty()))){move(r);changed=true;}
        else if(r.phase==4&&(r.votes.size()==3||elapsed>=4*minute)){move(r);changed=true;}
        if(changed)save(r);
    }
    @Scheduled(fixedDelay=250) public synchronized void pulse(){matching();for(var e:List.copyOf(pending.entrySet()))if(now()>=e.getValue().deadline){Room r=rooms.get(e.getKey().split(":")[0]);finishReply(r,e.getKey(),e.getValue(),null);}for(Room r:rooms.values())tick(r);if(limits.size()>1000)limits.entrySet().removeIf(e->e.getValue()[0]<now());}
    public synchronized Object state(String code,String auth){Room r=room(code);Player p=me(r,auth);tick(r);return view(r,p);}
    void citation(Room r,String id){need(id!=null&&r.clues.containsKey(id),"只能引用已公开证物。");}
    String nullable(String s){return s.isBlank()?null:s;}
    void currentPhase(Room r,Map<String,Object>b){need(b.get("phase") instanceof Number&&((Number)b.get("phase")).intValue()==r.phase,"阶段已变化，请刷新后操作。");}

    public synchronized Object action(String code,String action,Map<String,Object>b,String auth){
        Room r=room(code);Player p=me(r,auth);tick(r);limit("action:"+p.id,100);
        if(action.equals("leave")){need(r.phase==0,"开场后请保留房间凭据以便重连。");r.players.remove(p);r.recruiting=0;if(r.players.isEmpty()){rooms.remove(r.code);db.update("DELETE FROM echo_rooms WHERE code=?",r.code);}else save(r);return m("left",true);}
        String req=string(b,"requestId");need(req.length()<=80,"请求标识过长。");String requestKey=p.id+":"+req;
        if(!req.isEmpty()&&r.requests.containsKey(requestKey))return m("state",view(r,p),"outcome",r.requests.get(requestKey));
        Map<String,Object> outcome=m("text","操作已完成。");
        switch(action){
            case "seat" -> seat(r,p,string(b,"role"),string(b,"avatarId"));
            case "ready" -> {need(r.phase==0&&p.role!=null&&b.get("ready") instanceof Boolean,"请先选角。");p.ready=(Boolean)b.get("ready");if(!p.ready)r.recruiting=0;}
            case "start" -> {host(r,p);need(r.phase==0&&r.players.size()==3&&r.players.stream().allMatch(q->q.role!=null&&q.ready),"三人选角并准备后可开始。");move(r);}
            case "add-bot" -> {host(r,p);need(botEligible(r),"所有真人选角并准备后可以补 AI。");bots(r);move(r);}
            case "recruit" -> {host(r,p);need(botEligible(r)&&r.players.size()==2,"需要两位真人准备完成。");if(r.recruiting==0)r.recruiting=now();}
            case "cancel-recruit" -> {host(r,p);r.recruiting=0;}
            case "phase-ready" -> {currentPhase(r,b);need(r.phase>=1&&r.phase<=3,"当前不能确认阶段。");r.phaseReady.add(p.id);tick(r);}
            case "clue" -> {currentPhase(r,b);String id=string(b,"clueId");need((r.phase==2||r.phase==3)&&clues(r).stream().anyMatch(c->c.get("id").equals(id)&&((Number)c.get("phase")).intValue()<=r.phase),"当前不能调查此证物。");publish(r,id,"真人发现");}
            case "message" -> {
                currentPhase(r,b);need(r.phase==2||r.phase==3,"讨论仅在调查阶段开放。");need(r.messages.size()<400,"本局讨论数量已达上限。");
                String clue=nullable(string(b,"clueId")),reply=nullable(string(b,"replyTo")),to=nullable(string(b,"to"));if(clue!=null)citation(r,clue);
                if(reply!=null)need(r.messages.stream().anyMatch(x->reply.equals(x.get("id"))),"回复不属于当前房间。");
                Player recipient=to==null?null:r.players.stream().filter(x->x.id.equals(to)&&x!=p).findFirst().orElseThrow(()->new Failure(400,"请选择其他队友。"));
                if(recipient!=null&&recipient.bot){need(r.asked<60,"本局 AI 追问次数已用完。");need(!pending.containsKey(r.code+":"+recipient.id),"这位队友正在回应上一条提问。");}
                String question=clean(b.get("text"),300);message(r,p.id,p.name,question,clue,reply,to);
                if(recipient!=null&&recipient.bot){String qid=(String)r.messages.getLast().get("id");r.asked++;reply(r,recipient,question,clue,qid,p.id);}
            }
            case "ask" -> {currentPhase(r,b);need(r.phase==2||r.phase==3,"调查阶段才能查阅。");limit("npc:"+p.id,12);String clue=nullable(string(b,"clueId"));if(clue!=null)citation(r,clue);String question=clean(b.get("text"),300);
                String npc=string(b,"npc");need(List.of("chen","diary").contains(npc),"请选择陈伯或日记回响。");
                @SuppressWarnings("unchecked") var dialogues=(Map<String,Map<String,Object>>)object(r,"exploration").get("dialogues");var node=dialogues.get(npc);String id=(String)node.get("record");need(r.clues.containsKey(id),"请先取得对应原始记录，再来询问。");
                String text=npc.equals("diary")?clues(r).stream().filter(c->c.get("id").equals(id)).findFirst().orElseThrow().get("body")+"\n\n读法边界："+node.get("boundary"):(String)node.get(r.clues.containsKey("C09")?"withRegister":"default");
                message(r,p.id,p.name,question,clue,null,(String)node.get("id"));String qid=(String)r.messages.getLast().get("id");message(r,(String)node.get("id"),(String)node.get("name"),text,id,qid,p.id);}
            case "inspect","present","compare" -> {currentPhase(r,b);need(r.phase==3,"请在搜证对质阶段探索账房。");outcome=explore(r,p,action,string(b,"target"),string(b,"itemId"));}
            case "vote" -> {
                currentPhase(r,b);need(r.phase==4&&!r.votes.containsKey(p.id),"当前不能重复指认。");String to=string(b,"target");
                need(to.isEmpty()||r.players.stream().anyMatch(q->q!=p&&q.id.equals(to)),"只能指认另一名角色或弃票。");
                Object ids=b.getOrDefault("clueIds",List.of());need(ids instanceof List<?>,"证物格式不正确。");List<?> list=(List<?>)ids;need(list.size()<=2&&new HashSet<>(list).size()==list.size()&&(to.isEmpty()||!list.isEmpty()),"指认需引用 1–2 件证物。");List<String> chosen=new ArrayList<>();for(Object id:list){need(id instanceof String,"证物格式不正确。");citation(r,(String)id);chosen.add((String)id);}r.votes.put(p.id,to);r.voteClues.put(p.id,chosen);tick(r);
            }
            default -> throw new Failure(404,"没有这个操作。");
        }
        if(!req.isEmpty()){need(req.length()<=80,"请求标识过长。");r.requests.put(requestKey,outcome);if(r.requests.size()>300)r.requests.remove(r.requests.keySet().iterator().next());}
        save(r);matching();return m("state",view(r,p),"outcome",outcome);
    }

    @SuppressWarnings("unchecked") Map<String,Object> explore(Room r,Player p,String action,String target,String item){
        var actions=(List<Map<String,Object>>)object(r,"exploration").get("actions");
        var rule=actions.stream().filter(a->action.equals(a.get("action"))&&target.equals(a.get("target"))).findFirst().orElseThrow(()->new Failure(400,"这个位置没有对应操作。"));
        var requires=(List<String>)rule.getOrDefault("requires",List.of());
        need(r.inventory.containsAll(requires)&&(!rule.containsKey("itemId")||rule.get("itemId").equals(item)),(String)rule.getOrDefault("blocked","尚未满足调查条件。"));
        String text=(String)rule.get("text"),event=(String)rule.get("event"),reward=(String)rule.get("reward");
        boolean first=event!=null&&r.events.add(event);
        if(event==null||first){r.inventory.addAll((List<String>)rule.get("items"));for(String id:(List<String>)rule.get("clues"))publish(r,id,"真人发现");}
        if(first)r.exploration.add(m("event",event,"by",p.id,"at",now(),"text",text,"reward",reward));
        return m("text",text,"firstTrigger",first,"reward",reward);
    }

    @SuppressWarnings("unchecked") Map<String,Object> view(Room r,Player me){
        Map<String,Object> c=content(r);
        List<Map<String,Object>> publicClues=new ArrayList<>();List<String> questions=(List<String>)c.get("questions"),related=(List<String>)c.get("corroboration");
        int i=0;for(var clue:clues(r)){String id=(String)clue.get("id");boolean open=r.clues.containsKey(id);if(((Number)clue.get("phase")).intValue()<=r.phase)publicClues.add(m("id",id,"title",clue.get("title"),"kind",clue.get("kind"),"body",open?clue.get("body"):null,"via",r.clues.get(id),"question",open?questions.get(i):null,"meaning",r.phase==5?clue.get("meaning"):null,"related",r.phase==5?related.get(i):null));i++;}
        Map<String,Object> result=m("code",r.code,"caseVersion",r.caseVersion,"phase",r.phase,"since",r.since,"serverTime",now(),"phaseDeadline",r.since+MINUTES[r.phase]*minute,"phaseReady",r.phaseReady,"phaseBlock",r.phase>=1&&r.phase<=3?block(r):"","mode",r.mode,"host",!r.mode.equals("quick")&&r.players.getFirst()==me,"me",me.id,"recruiting",r.recruiting>0,"canAddBots",botEligible(r),"roles",c.get("roles"),"opening",c.get("opening"),"players",r.players.stream().map(p->m("id",p.id,"name",p.name,"role",p.role,"avatarId",avatar(p),"isReady",p.ready,"isAI",p.bot,"online",p.bot||now()-p.seen<presence)).toList(),"card",r.phase>0?object(r,"cards").get(me.role):null,"brief",r.phase>0?object(r,"briefs").get(me.role):null,"clues",publicClues,"messages",r.messages,"voted",r.votes.containsKey(me.id),"votedCount",r.votes.size(),"inventory",r.phase>=3?r.inventory:List.of(),"events",r.phase>=3?r.events:List.of(),"exploration",r.phase>=3?r.exploration:List.of(),"aiRemaining",60-r.asked,"teammatePending",pending.entrySet().stream().filter(e->e.getKey().startsWith(r.code+":" )).map(e->m("botId",e.getValue().botId,"questionId",e.getValue().questionId)).toList());
        if(r.phase==5){Player winner=r.players.stream().filter(p->r.votes.values().stream().filter(p.id::equals).count()>=2).findFirst().orElse(null);String choice=r.votes.getOrDefault(me.id,"");result.put("result",m("label",object(r,"verdict").get(winner==null?"split":winner.role.equals("xuan")?"solved":"wrong"),"myChoice",r.players.stream().filter(p->p.id.equals(choice)).map(p->p.name).findFirst().orElse("弃票"),"myClueIds",r.voteClues.getOrDefault(me.id,List.of()),"votes",r.players.stream().map(p->m("from",p.id,"target",r.votes.getOrDefault(p.id,""),"clueIds",r.voteClues.getOrDefault(p.id,List.of()))).toList(),"timeline",c.get("timeline"),"secrets",ROLES.stream().map(role->m("name",NAMES.get(role),"secret",((List<?>)object(r,"briefs").get(role)).get(2))).toList()));}
        if(r.phase>=3){result.put("scenes",object(r,"exploration").get("scenes"));result.put("items",object(r,"exploration").get("items"));}
        // Snapshot must be detached before releasing the monitor: the HTTP serializer runs later.
        return json.convertValue(result,new TypeReference<Map<String,Object>>(){});
    }
}
