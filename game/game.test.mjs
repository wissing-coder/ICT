import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { chooseBotAction, teammateReply } from './teammate.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function gameServer(t, config = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'mian-'));
  let child;
  t.after(async () => {
    if (child?.exitCode === null && child.signalCode === null) {
      child.kill();
      await once(child, 'exit');
    }
    rmSync(directory, { recursive: true, force: true });
  });
  let base;
  async function boot() {
    child = spawn(process.execPath, [fileURLToPath(new URL('./server.mjs', import.meta.url))], {
      env: { ...process.env, PORT: '0', HOST: '127.0.0.1', GAME_MINUTE_MS: '450', GAME_FLOW_VERSION: '1', GAME_DATA: join(directory, 'rooms.json'), AI_KEY: '', ...config },
      windowsHide: true,
    });
    child.stderr.pipe(process.stderr);
    const [started] = await Promise.race([
      once(child.stdout, 'data'),
      once(child, 'exit').then(() => { throw Error('Game server exited before listening'); }),
    ]);
    base = 'http://127.0.0.1:' + String(started).match(/:(\d+)/)[1];
  }
  await boot();
  async function call(path, data, token, status = 200) {
    const response = await fetch(base + '/api/' + path, {
      method: data ? 'POST' : 'GET',
      headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: data ? JSON.stringify(data) : undefined,
    });
    const json = await response.json();
    if (Array.isArray(status)) {
      assert.ok(status.includes(response.status), JSON.stringify(json));
      return { ...json, status: response.status };
    }
    assert.equal(response.status, status, JSON.stringify(json));
    return json;
  }
  return { call, base, restart: async () => {
    child.kill();
    await once(child, 'exit');
    await boot();
  } };
}

test('three authenticated players can finish without AI and recover after restart', async t => {
  const { call, base, restart } = await gameServer(t);
  assert.match(await (await fetch(base)).text(), /迷案·回声/);
  assert.equal((await fetch(base + '/case.mjs')).status, 404);
  const a = await call('create', { name: '甲' });
  const code = a.state.code;
  const b = await call('join', { code, name: '乙' });
  const c = await call('join', { code, name: '丙' });
  const clients = [a, b, c];
  const act = (client, path, data, codeExpected) => call(code + '/' + path, data, client.token, codeExpected);
  await call('join', { code, name: '丁' }, null, 409);
  await call(code + '/state', null, 'wrong', 401);
  await Promise.all(clients.map((player, i) => act(player, 'seat', { role: ['xuan', 'yu', 'lin'][i] })));
  await delay(180);
  await Promise.all(clients.map(player => act(player, 'ready', {})));
  async function advance(phase) {
    const { state } = await act(a, 'state');
    assert.equal(state.phase, phase);
    return act(a, 'advance', { phase, since: state.since });
  }
  await delay(180);
  await advance(0);
  await act(b, 'advance', { phase: 1 }, 403);
  const cards = await Promise.all(clients.map(player => act(player, 'state')));
  assert.match(cards[0].state.card, /你是凶手/);
  for (const p of cards.slice(1)) {
    assert.doesNotMatch(JSON.stringify(p), /你是凶手|丝厂亏空三万/);
    assert.equal(p.state.result, undefined);
  }
  await delay(180);
  await act(a, 'clue', { id: 'C12' }, 403);
  for (let i = 0; i < 4; i++) {
    await delay(570);
    await act(a, 'state');
  }
  await advance(1);
  await act(b, 'message', { text: '先看检验报告。' });
  await delay(1850);
  await advance(2);
  await act(c, 'clue', { id: 'C06' });
  await delay(180);
  assert.equal((await act(c, 'ask', { target: 'chen', question: '昨晚见过谁？' })).mode, '原始记录');
  await delay(2750);
  const evidence = (await act(b, 'state')).state;
  assert.equal(evidence.clues.filter(clue => clue.body).length, 12);
  assert.equal(evidence.clues.find(clue => clue.id === 'C06').via, '玩家调查');
  await advance(3);
  await act(b, 'vote', { to: a.state.me });
  await delay(180);
  await act(b, 'vote', { to: c.state.me }, 409);
  await act(c, 'vote', { to: a.state.me });
  await act(a, 'vote', { to: null });
  const complete = (await act(c, 'state')).state;
  assert.equal(complete.phase, 5);
  assert.equal(complete.result.label, '你们投中了苏明轩。');
  assert.ok(complete.result.timeline.length > 5);
  await restart();
  assert.deepEqual((await act(c, 'state')).state.result, complete.result);
});

const ticket = () => randomBytes(32).toString('hex');
test('matching uses distinct roles, keeps FIFO, and survives refresh and restart', async t => {
  const { call, restart } = await gameServer(t, { GAME_QUEUE_TIMEOUT_MS: '1500' });
  const [a, duplicate, b, c, timeout] = Array.from({ length: 5 }, ticket);
  const queue = (token, role) => call('match', { name: role, role }, token);
  assert.equal((await queue(a, 'xuan')).waiting.role, 'xuan');
  await queue(duplicate, 'xuan');
  await queue(b, 'yu');
  assert.equal((await call('match', null, a)).waiting.role, 'xuan');
  const { state } = await queue(c, 'lin');
  assert.equal(state.phase, 1);
  assert.equal(state.mode, 'quick');
  assert.equal(state.host, false);
  assert.equal(new Set(state.players.map(p => p.role)).size, 3);
  assert.ok(state.players.every(p => !p.bot));
  assert.equal((await call('match/cancel', {}, a)).state.code, state.code);
  assert.equal((await call('match', null, duplicate)).waiting.role, 'xuan');
  assert.equal((await call('match/cancel', {}, duplicate)).cancelled, true);
  await queue(timeout, 'lin');
  await delay(1550);
  assert.equal((await call('match', null, timeout)).expired, true);
  await queue(duplicate, 'lin');
  await restart();
  assert.equal((await call('match', null, duplicate)).expired, true);
  assert.equal((await call('match', null, b)).state.code, state.code);
  assert.match((await call(state.code + '/state', null, a)).state.card, /你是凶手/);
  await delay(1150);
  assert.ok((await call(state.code + '/state', null, c)).state.phase >= 2);
});

test('private rooms recruit by role and reserve a single seat across entry options', async t => {
  const { call } = await gameServer(t);
  const a = await call('create', { name: '甲' });
  const code = a.state.code;
  const b = await call('join', { code, name: '乙' });
  const act = (p, route, data, status) => call(code + '/' + route, data, p.token, status);
  await Promise.all([act(a, 'seat', { role: 'xuan' }), act(b, 'seat', { role: 'yu' })]);
  await delay(180);
  await Promise.all([act(a, 'ready', {}), act(b, 'ready', {})]);
  await delay(180);
  await act(b, 'recruit', {}, 403);
  assert.equal((await act(a, 'recruit', {})).state.recruiting, true);
  await delay(180);
  assert.equal((await act(b, 'ready', {})).state.recruiting, false);
  await delay(180);
  await act(b, 'ready', {});
  await act(a, 'recruit', {});
  assert.equal((await call('match', { role: 'yu', name: '不符' }, ticket())).waiting.role, 'yu');
  const candidate = ticket();
  const { state } = await call('match', { role: 'lin', name: '丙' }, candidate);
  assert.equal(state.code, code);
  assert.equal(state.phase, 1);
  assert.equal(state.recruiting, false);
  await call('join', { code, name: '丁' }, null, 409);
  await delay(180);
  await act(a, 'add-bot', { role: 'lin' }, 409);
});

test('an AI seat investigates, speaks and votes without a model', async t => {
  const { call } = await gameServer(t, { GAME_MINUTE_MS: '300' });
  const a = await call('create', { name: '甲' });
  const code = a.state.code;
  const b = await call('join', { code, name: '乙' });
  const act = (p, route, data) => call(code + '/' + route, data, p.token);
  await Promise.all([act(a, 'seat', { role: 'xuan' }), act(b, 'seat', { role: 'yu' })]);
  await delay(180);
  await Promise.all([act(a, 'ready', {}), act(b, 'ready', {})]);
  await delay(180);
  await act(a, 'recruit', {});
  await delay(180);
  const { state } = await act(a, 'add-bot', { role: 'lin' });
  assert.equal(state.phase, 1);
  assert.equal(state.recruiting, false);
  assert.equal(state.players.find(p => p.bot).role, 'lin');
  assert.doesNotMatch(JSON.stringify((await act(b, 'state')).state), /你是凶手/);
  assert.equal((await call('match', { role: 'lin', name: '候补' }, ticket())).waiting.role, 'lin');
  async function next(phase, duration) {
    for (let waited = 0; waited < duration; waited += 400) {
      await delay(400);
      await act(a, 'state');
    }
    const { state: current } = await act(a, 'state');
    assert.equal(current.phase, phase);
    return (await act(a, 'advance', { phase, since: current.since })).state;
  }
  await next(1, 1500);
  const investigation = await next(2, 1200);
  assert.equal(investigation.messages.filter(m => m.type === 'teammate').length, 1);
  const voting = await next(3, 1800);
  assert.equal(voting.messages.filter(m => m.type === 'teammate').length, 2);
  assert.equal(voting.clues.filter(c => c.via === 'AI 队友调查').length, 2);
  await delay(180);
  await act(a, 'vote', { to: b.state.me });
  const final = (await act(b, 'vote', { to: a.state.me })).state;
  assert.equal(final.phase, 5);
  assert.equal(final.result.votes.find(v => v.from.includes('AI')).to, '甲');
});

test('a solo player can fill both seats and finish with two AI teammates', async t => {
  const { call } = await gameServer(t, { GAME_MINUTE_MS: '250' });
  const host = await call('create', { name: '单人玩家' });
  const code = host.state.code;
  const act = (route, data, status) => call(code + '/' + route, data, host.token, status);
  await act('seat', { role: 'lin' });
  await delay(180);
  await act('add-bot', { roles: ['xuan', 'yu'] }, 409);
  await delay(180);
  const ready = (await act('ready', {})).state;
  assert.deepEqual(ready.botVacancies, ['xuan', 'yu']);
  assert.equal(ready.vacancy, null);
  await delay(180);
  await act('add-bot', { roles: ['xuan'] }, 409);
  await delay(180);
  const start = (await act('add-bot', { roles: ready.botVacancies })).state;
  assert.equal(start.phase, 1);
  assert.deepEqual(start.players.filter(p => p.bot).map(p => p.role), ['xuan', 'yu']);
  assert.doesNotMatch(JSON.stringify(start), /你是凶手/);

  async function advanceAfter(duration) {
    for (let elapsed = 0; elapsed < duration; elapsed += 300) {
      await delay(300);
      await act('state');
    }
    const { state } = await act('state');
    return (await act('advance', { phase: state.phase, since: state.since })).state;
  }
  await advanceAfter(1250);
  const [firstBot, secondBot] = start.players.filter(p => p.bot);
  await delay(200);
  const question = { targetBot: firstBot.id, text: '昨晚的时间能确定吗？', requestId: randomBytes(16).toString('hex') };
  const sentAt = Date.now();
  const sent = (await act('message', question)).state;
  const questionId = sent.teammatePending[0].questionId;
  await act('message', question);
  await delay(600);
  const answered = (await act('state')).state;
  const matchingReplies = answered.messages.filter(m => m.replyTo === questionId);
  assert.equal(matchingReplies.length, 1);
  assert.equal(matchingReplies[0].by, firstBot.name);
  assert.ok(Date.now() - sentAt < 3000);
  assert.equal(answered.messages.filter(m => m.to === firstBot.name).length, 1);
  await advanceAfter(1000);
  for (let i = 0; i < 6; i++) {
    await delay(280);
    await act('state');
  }
  const late = (await act('message', { targetBot: secondBot.id, text: '能确定是谁吗？', requestId: randomBytes(16).toString('hex') })).state;
  await delay(180);
  await act('advance', { phase: late.phase, since: late.since });
  await delay(450);
  assert.ok(!(await act('state')).state.messages.some(m => m.replyTo === late.teammatePending[0].questionId));
  const voting = (await act('state')).state;
  assert.equal(voting.phase, 4);
  const messages = voting.messages.filter(message => message.type === 'teammate' && !message.replyTo);
  assert.equal(messages.length, 4);
  assert.equal(new Set(messages.map(message => message.by)).size, 2);
  assert.equal(voting.clues.filter(clue => clue.via === 'AI 队友调查').length, 4);
  await delay(180);
  const final = (await act('vote', { to: start.players.find(p => p.role === 'xuan').id })).state;
  assert.equal(final.phase, 5);
  assert.deepEqual(final.result.votes.filter(v => v.from.includes('AI')).map(v => v.to), ['苏明玉（AI）', '苏明轩（AI）']);
});

test('recruitment, room-code join and AI cannot claim the last seat twice', async t => {
  const { call } = await gameServer(t);
  const a = await call('create', { name: '甲' });
  const code = a.state.code;
  const b = await call('join', { code, name: '乙' });
  const act = (p, route, data, status) => call(code + '/' + route, data, p.token, status);
  await Promise.all([act(a, 'seat', { role: 'xuan' }), act(b, 'seat', { role: 'yu' })]);
  await delay(180);
  await Promise.all([act(a, 'ready', {}), act(b, 'ready', {})]);
  await delay(180);
  await act(a, 'recruit', {});
  await delay(180);
  const [, , queue] = await Promise.all([
    call('join', { code, name: '持码好友' }, null, [200, 409]),
    act(a, 'add-bot', { role: 'lin' }, [200, 409]),
    call('match', { role: 'lin', name: '排队玩家' }, ticket()),
  ]);
  const { state } = await act(a, 'state');
  assert.equal(state.players.length, 3);
  assert.equal(state.recruiting, false);
  const last = state.players[2];
  assert.equal(Boolean(queue.state), last.name === '排队玩家');
  assert.equal(state.phase, last.name === '持码好友' ? 0 : 1);
});

test('a lobby player can leave and free their seat', async t => {
  const { call } = await gameServer(t);
  const host = await call('create', { name: '甲' });
  const code = host.state.code;
  const guest = await call('join', { code, name: '乙' });
  assert.equal((await call(code + '/leave-lobby', {}, host.token)).left, true);
  assert.equal((await call(code + '/state', null, guest.token)).state.host, true);
  await call(code + '/state', null, host.token, 401);
});

test('AI action selection accepts listed indices and falls back on invalid output or timeout', async () => {
  const options = [{ label: '首选' }, { label: '第二选项' }];
  assert.equal(await chooseBotAction(async () => '2', 'lin', 3, [], options), options[1]);
  assert.equal(await chooseBotAction(async () => '泄露私卡', 'lin', 3, [], options), options[0]);
  assert.equal(await chooseBotAction(async () => { throw new DOMException('超时', 'TimeoutError'); }, 'lin', 3, [], options), options[0]);
});

test('teammate dialogue validates evidence citations and falls back when the model times out', async () => {
  const evidence = [{ id: 'C03', body: '无法精确测定死亡时间' }];
  const question = '什么时间？';
  const reply = (cite) => JSON.stringify({ text: '现在还不能确定。', cite });
  assert.equal((await teammateReply(async () => reply('C03'), 'lin', question, evidence)).text, '现在还不能确定。');
  const fallback = await teammateReply(null, 'lin', question, evidence);
  assert.equal(fallback.cite, 'C03');
  assert.deepEqual(await teammateReply(async () => reply('C12'), 'lin', question, evidence), fallback);
  assert.deepEqual(await teammateReply(async () => { throw new DOMException('超时', 'TimeoutError'); }, 'lin', question, evidence), fallback);
});

async function untilState(read, condition) {
  const deadline = Date.now() + 9000;
  while (Date.now() < deadline) {
    const { state } = await read();
    if (condition(state)) return state;
    await delay(55);
  }
  assert.fail('phase did not reach the expected state');
}

test('short flow supports solo, shared evidence, targeted replies, and personal recap', async t => {
  const { call } = await gameServer(t, { GAME_FLOW_VERSION: '2', GAME_MINUTE_MS: '500' });
  const solo = await call('solo', { name: '玩家', role: 'lin' });
  const act = (route, data, status) => call(solo.state.code + '/' + route, data, solo.token, status);
  const read = () => act('state');
  const done = state => act('phase-ready', { phase: state.phase, since: state.since, done: true });
  assert.equal(solo.state.flowVersion, 2);
  assert.equal(solo.state.phase, 1);
  assert.equal(solo.state.players.filter(p => p.bot).length, 2);
  const scene = (await done(solo.state)).state;
  assert.equal(scene.phase, 2);
  await delay(160);
  await act('message', { text: '能解释吗？', clueId: 'C10' }, 400);
  await delay(160);
  const discovery = await act('clue', { id: 'C01' });
  assert.equal(discovery.state.clues.find(c => c.id === 'C01').via, '玩家调查');
  await delay(160);
  const doneScene = (await done(scene)).state;
  assert.ok(doneScene.phase === 2 || doneScene.phase === 3);
  const investigation = await untilState(read, s => s.phase === 3);
  assert.equal(investigation.clues.filter(c => c.body).length >= 4, true);
  await delay(160);
  const sent = await act('message', {
    text: '门的情况说明什么？', clueId: 'C01', targetBot: solo.state.players.find(p => p.bot).id,
    requestId: randomBytes(16).toString('hex'),
  });
  const questionId = sent.state.messages.find(m => m.to).id;
  const answered = await untilState(read, s => s.messages.some(m => m.replyTo === questionId));
  assert.equal(answered.messages.find(m => m.replyTo === questionId).cite, 'C01');
  const waiting = (await done(investigation)).state;
  assert.equal(waiting.phase, 3);
  const supplemental = await untilState(read, s => s.clues.length === 12 && s.clues.every(c => c.body));
  assert.equal(supplemental.phase, 3);
  assert.match(supplemental.phaseBlock, /阅读时间/);
  const voting = await untilState(read, s => s.phase === 4);
  assert.equal(voting.result, undefined);
  const suspect = voting.players.find(p => p.role === 'xuan');
  await act('vote', { to: suspect.id, clueIds: [] }, 400);
  await delay(160);
  const final = (await act('vote', { to: suspect.id, clueIds: ['C09', 'C10'] })).state;
  assert.deepEqual(final.result.myReasoning, { choice: suspect.name, clueIds: ['C09', 'C10'] });
  assert.equal(final.result.votes.length, 3);
});

test('short-flow matching restores reading confirmations and keeps votes private until timeout', async t => {
  const { call, restart } = await gameServer(t, { GAME_FLOW_VERSION: '2', GAME_MINUTE_MS: '500' });
  const tokens = ['xuan', 'yu', 'lin'].map(() => ticket());
  const pending = tokens.map((token, i) => [token, ['xuan', 'yu', 'lin'][i]]);
  for (const [token, role] of pending) await call('match', { name: role, role }, token);
  const { state: reading } = await call('match', null, tokens[0]);
  const act = (i, route, data, status) => call(reading.code + '/' + route, data, tokens[i], status);
  const ready = await act(0, 'phase-ready', { phase: reading.phase, since: reading.since, done: true });
  assert.equal(ready.state.phaseReady.length, 1);
  await restart();
  const recovered = (await act(0, 'state')).state;
  assert.deepEqual(recovered.phaseReady, ready.state.phaseReady);
  const voting = await untilState(() => act(1, 'state'), s => s.phase === 4);
  const xuan = voting.players.find(p => p.role === 'xuan');
  await act(1, 'vote', { to: xuan.id, clueIds: ['C06'] });
  const other = (await act(2, 'state')).state;
  assert.equal(other.result, undefined);
  assert.equal(other.voted, false);
  assert.equal(other.voteClues, undefined);
  const result = await untilState(() => act(2, 'state'), s => s.phase === 5);
  assert.equal(result.result.myReasoning.choice, '弃票');
});

test('short-flow friend rooms wait for all human readers and reject a stale confirmation', async t => {
  const { call } = await gameServer(t, { GAME_FLOW_VERSION: '2', GAME_MINUTE_MS: '900' });
  const a = await call('create', { name: '房主' });
  const code = a.state.code;
  const people = [a, await call('join', { code, name: '好友一' }), await call('join', { code, name: '好友二' })];
  const act = (p, route, data, status) => call(code + '/' + route, data, p.token, status);
  await Promise.all(people.map((p, i) => act(p, 'seat', { role: ['xuan', 'yu', 'lin'][i] })));
  await delay(160);
  await Promise.all(people.map(p => act(p, 'ready', {})));
  await delay(160);
  const { state: reading } = await act(a, 'advance', { phase: 0, since: a.state.since });
  await delay(160);
  const confirm = { phase: 1, since: reading.since, done: true };
  await act(a, 'phase-ready', confirm);
  assert.equal((await act(people[1], 'phase-ready', confirm)).state.phase, 1);
  assert.equal((await act(people[2], 'phase-ready', confirm)).state.phase, 2);
  await delay(160);
  await act(a, 'phase-ready', confirm, 409);
});
