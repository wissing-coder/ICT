import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync,createWriteStream,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
const base='http://127.0.0.1:19879';
const java=process.env.JAVA_HOME?resolve(process.env.JAVA_HOME,'bin/java.exe'):resolve('.tools',readdirSync('.tools').find(n=>n.startsWith('jdk-')),'bin/java.exe');
const jar=resolve(process.argv[2]||'release/formal-2.0/mian-echo.jar');
const data=resolve('.tools',`smoke-${Date.now()}`).replaceAll('\\','/');
const standalone=resolve('.tools/formal-standalone');mkdirSync(standalone,{recursive:true});
mkdirSync('.tools',{recursive:true});let child;const log=createWriteStream('.tools/formal-smoke.log');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function request(path,body,token,expected=200){const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'content-type':'application/json'}),...(token?{authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});assert.equal(r.status,expected,await r.clone().text());return r.json()}
async function start(){child=spawn(java,['-jar',jar,'--server.port=19879'],{cwd:standalone,env:{...process.env,GAME_MINUTE_MS:'1000',DB_URL:'jdbc:h2:file:'+data+';DB_CLOSE_ON_EXIT=FALSE'},stdio:['ignore','pipe','pipe']});child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});for(let n=0;n<100;n++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await wait(100)}throw Error('Server did not start; see .tools/formal-smoke.log')}
async function stop(){const ended=new Promise(r=>child.once('exit',r));child.kill();await ended;}
async function until(session,predicate){for(let n=0;n<120;n++){const s=await request(`/api/room/${session.state.code}/state`,undefined,session.token);if(predicate(s))return s;await wait(100)}throw Error('Phase wait timed out')}
try{
 await start();
 const bootstrap=await request('/api/bootstrap');assert.match(bootstrap.icp,/苏ICP备/);assert.equal(bootstrap.avatars.length,6);
 for(const path of ['/','/assets/portraits/yu-2.webp','/assets/scenes/account.webp'])assert.equal((await fetch(base+path)).status,200);
 const head=await fetch(base+'/assets/music/reading.mp3',{method:'HEAD'});assert.equal(head.status,200);assert.match(head.headers.get('content-type'),/audio\/mpeg/);
 const range=await fetch(base+'/assets/music/reading.mp3',{headers:{range:'bytes=0-99'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,100);
 await request('/api/room/12345678/state',undefined,'bad',404);
 const solo=await request('/api/solo',{name:'测试玩家',role:'yu',avatarId:'yu-2'});let s=solo.state;
 const act=(action,b={})=>request(`/api/room/${solo.state.code}/${action}`,{phase:s.phase,requestId:crypto.randomUUID(),...b},solo.token);
 assert.equal(s.phase,1);assert.equal(s.players.filter(p=>p.isAI).length,2);assert.equal(s.players.find(p=>p.id===s.me).avatarId,'yu-2');
 s=(await act('phase-ready')).state;assert.equal(s.phase,2);
 for(const id of ['C01','C02','C03','C04'])s=(await act('clue',{clueId:id})).state;
 await act('phase-ready');s=await until(solo,x=>x.phase===3);
 for(const target of ['register','coat','cloth'])s=(await act('inspect',{target})).state;
 s=(await act('present',{target:'chen',itemId:'loan-register'})).state;
 s=(await act('compare',{target:'coat-fabric'})).state;assert.ok(s.events.includes('coat-fabric'));assert.ok(s.inventory.includes('comparison-note'));
 const bot=s.players.find(p=>p.isAI&&p.role==='lin');const began=performance.now();s=(await act('message',{text:'这件外套能证明是谁吗？',clueId:'C10',to:bot.id})).state;const latency=performance.now()-began;assert.ok(s.messages.some(m=>m.speakerId===bot.id&&m.replyTo));assert.ok(latency<3000);
 for(let i=5;i<=12;i++)s=(await act('clue',{clueId:`C${String(i).padStart(2,'0')}`})).state;
 await act('phase-ready');s=await until(solo,x=>x.phase===4);const suspect=s.players.find(p=>p.role==='xuan');s=(await act('vote',{target:suspect.id,clueIds:['C09','C11']})).state;s=await until(solo,x=>x.phase===5);assert.equal(s.result.myClueIds.length,2);assert.equal(s.result.votes.length,3);
 await stop();await start();s=await request(`/api/room/${solo.state.code}/state`,undefined,solo.token);assert.equal(s.phase,5);assert.ok(s.inventory.includes('comparison-note'));assert.equal(s.players.find(p=>p.id===s.me).avatarId,'yu-2');
 const friends=await request('/api/create',{name:'同名',role:'xuan',avatarId:'xuan-2'});const friend=await request('/api/join',{name:'同名',role:'yu',code:friends.state.code,avatarId:'yu-1'});assert.notEqual(friends.state.me,friend.state.me);assert.equal(friend.state.players.length,2);
 for(const player of [friends,friend])await request(`/api/room/${friends.state.code}/ready`,{ready:true},player.token);
 const filled=await request(`/api/room/${friends.state.code}/add-bot`,{},friends.token);assert.equal(filled.state.phase,1);assert.equal(filled.state.players.filter(p=>p.isAI).length,1);
 const quick=[];for(const role of ['xuan','yu','lin'])quick.push(await request('/api/match',{name:'匹配测试',role,avatarId:role+'-2'}));const matched=await request('/api/match',undefined,quick[0].token);assert.equal(matched.state.phase,1);assert.ok(matched.state.players.every(p=>p.avatarId.endsWith('-2')));
 console.log(JSON.stringify({http:'PASS',coreFlow:'PASS',exploration:'PASS',restartReconnect:'PASS',friendsAiFill:'PASS',roleMatch:'PASS',audioHeadRange:'PASS',localAiReplyMs:Math.round(latency)},null,2));
}finally{if(child&&child.exitCode===null)await stop();log.end()}
