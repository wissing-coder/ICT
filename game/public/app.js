const entry = document.querySelector('#entry');
const room = document.querySelector('#room');
const waiting = document.querySelector('#waiting');
const status = document.querySelector('#status');
const stages = ['等待准备', '私密阅读', '初谈与现场', '调查与盘问', '推理与投票', '结算与复盘'];
const shortStages = ['等待准备', '读本', '查现场', '搜证对质', '指认', '复盘'];
const goals = ['', '读完自己的角色卡，再确认进入现场。', '调查书房，找到至少一条证物后与队友交流。', '自由调查，引用证物核对不同说法。', '结合证物指认一名嫌疑人，或选择弃票。'];
let session;
try { session = JSON.parse(localStorage.getItem('echo-session')); } catch { session = null; }
let state, signature, syncTime, waitSince, busy = false, polling = false;
const memo = { discussion: '', question: '', target: 'chen', reply: null, draft: null, vote: '' };
let lastPoll = 0;
let questionRequest;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const btn = (label, action, value = '', disabled = false, secondary = false) => `<button type="button" data-action="${action}" data-value="${esc(value)}" ${disabled ? 'disabled' : ''} class="${secondary ? 'secondary' : ''}">${esc(label)}</button>`;
const sheet = (title, body) => `<article class="sheet"><h2>${title}</h2>${body}</article>`;
function flash(message = '') { status.textContent = message; }
function remember(value) {
  session = value;
  if (value) localStorage.setItem('echo-session', JSON.stringify(value));
  else localStorage.removeItem('echo-session');
}
function entryMode(mode) {
  document.querySelectorAll('[data-entry]').forEach(button => {
    const active = button.dataset.entry === mode;
    button.setAttribute('aria-pressed', String(active));
    button.classList.toggle('secondary', !active);
  });
  for (const id of ['solo', 'friends', 'match']) {
    const panel = document.querySelector('#entry-' + id);
    panel.hidden = id !== mode;
    panel.querySelectorAll('button').forEach(button => { button.disabled = panel.hidden; });
  }
  document.querySelector('#entry-role').hidden = mode === 'friends';
}
const invitation = new URL(location.href).searchParams.get('room')?.toUpperCase();
if (/^[0-9A-F]{8}$/.test(invitation ?? '')) {
  document.querySelector('#entry-form [name="code"]').value = invitation;
  entryMode('friends');
}
entry.addEventListener('click', event => {
  const button = event.target.closest('[data-entry]');
  if (button) entryMode(button.dataset.entry);
});
async function api(action, data) {
  const path = session?.code ? '/api/' + session.code + '/' + action : '/api/' + action;
  const res = await fetch(path, {
    method: data ? 'POST' : 'GET',
    headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), ...(session ? { Authorization: 'Bearer ' + session.token } : {}) },
    body: data ? JSON.stringify(data) : undefined,
  });
  const payload = await res.json();
  if (!res.ok) {
    if (res.status === 401 || (action === 'state' && res.status === 404)) {
      remember(null);
      state = signature = undefined;
      room.hidden = true;
      waiting.hidden = true;
      entry.hidden = false;
    }
    throw Error(payload.error);
  }
  return payload;
}
function timed() {
  if (!waiting.hidden) {
    const seconds = Math.max(0, Math.floor((Date.now() - waitSince) / 1000));
    document.querySelector('#wait-time').textContent = '已等待 ' + seconds + ' 秒';
  }
  if (!state) return;
  const elapsed = state.now - state.since + Date.now() - syncTime;
  const seconds = Math.max(0, Math.ceil((state.limit - elapsed) / 1000));
  const node = document.querySelector('#timer');
  if (node) node.textContent = state.limit ? (seconds ? Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0') : '建议时长已到') : '';
  const advance = room.querySelector('[data-action="advance"]');
  if (advance && state.phase > 0) advance.disabled = elapsed < state.earliest || busy;
}
function renderMessage(message, messages) {
  const question = messages.find(item => item.id === message.replyTo);
  const context = question ? '回复 ' + question.by + '：' + question.body.slice(0, 50) : '';
  const label = message.type === 'teammate' ? 'AI 队友' : message.type === 'draft' ? '已确认的 AI 草稿' : '真人';
  return `<div class="message"><strong>${esc(message.by)}</strong> <small>${label}</small>
    ${message.to ? `<small> → ${esc(message.to)}</small>` : ''}
    ${context ? `<div><small>${esc(context)}</small></div>` : ''}
    <p>${esc(message.body)}${message.cite ? ' ' + btn(message.cite + ' · 查看证物', 'jump-clue', message.cite, false, true) : ''}</p>${state?.phase >= 2 && state.phase <= 4 && message.id ? btn('回复','reply-message',message.id,false,true) : ''}</div>`;
}
function progress(next) {
  const people = next.players.filter(player => !player.bot);
  const ready = next.phaseReady ?? [];
  const done = ready.includes(next.me);
  const waiting = people.filter(player => !ready.includes(player.id)).map(player => player.id === next.me ? '你' : player.name);
  const detail = waiting.length ? '等待 ' + waiting.join('、') : next.phaseBlock || '即将进入下一阶段';
  return `<section class="sheet progress"><p>${goals[next.phase]}</p>
    ${next.phase <= 3 ? `<div class="actions"><strong>${ready.length}/${people.length} 位玩家已完成</strong><span class="muted">${esc(detail)}</span>
    ${btn(done ? '取消完成' : next.phase === 1 ? '我已读完' : '我准备进入下一阶段', 'phase-ready', done ? 'undo' : 'done', false, done)}</div>` : ''}</section>`;
}
function threadFor(next, clueId) {
  return next.messages.filter(message => message.cite === clueId ||
    next.messages.some(parent => parent.id === message.replyTo && parent.cite === clueId));
}
function evidenceBoard(next) {
  const locations = [
    ['书房', ['C01', 'C02', 'C04', 'C08']],
    ['暖阁、阳台与后院', ['C05', 'C07', 'C11']],
    ['口供与卷宗', ['C03', 'C06', 'C09', 'C10', 'C12']],
  ];
  return sheet('共享证据板', locations.map(([title, ids]) => {
    const clues = next.clues.filter(clue => ids.includes(clue.id));
    if (!clues.length) return '';
    return `<h3 class="compact">${title}</h3>${clues.map(c => `<div class="clue" id="evidence-${c.id}" tabindex="-1">
      <h3>${c.id} · ${esc(c.title)}</h3>
      ${c.body ? `<p>${esc(c.body)}</p>${c.question ? `<p class="muted">${esc(c.question)}</p>` : ""}<div class="actions"><small>${esc(c.via)}</small>
        ${next.phase === 3 && next.clues.some(clue => clue.id === 'C12' && clue.body) ? btn('对照日记','read-diary',c.id,false,true) : ''}${next.phase <= 4 ? btn('引用追问', 'cite-clue', c.id, false, true) : ''}</div>` : btn('调查', 'clue', c.id, false, true)}
      ${c.body ? threadFor(next,c.id).map(m => renderMessage(m,next.messages)).join('') : ''}
      ${c.meaning ? `<p class="muted">${esc(c.meaning)}</p>` : ''}</div>`).join('')}`;
  }).join(''));
}
function voteEvidence(next) {
  return `<fieldset><legend>指认依据 · 选 1–2 条</legend>${next.clues.filter(c => c.body).map(c =>
    `<label class="vote-evidence"><input type="checkbox" name="clueIds" value="${c.id}" ${memo.voteClues?.includes(c.id) ? 'checked' : ''}>
      <span>${c.id} · ${esc(c.title)}</span></label>`).join('')}</fieldset>`;
}
function reasoningRecap(next) {
  const groups = [
    ['死因与凶器', ['C02', 'C03']],
    ['密室与进入路线', ['C01', 'C05', 'C07', 'C08']],
    ['人物身份', ['C06', 'C09', 'C10', 'C11']],
  ];
  const own = next.result.myReasoning;
  const cite = id => {
    const clue = next.clues.find(c => c.id === id);
    return clue ? btn(clue.id + ' · ' + clue.title, 'jump-clue', clue.id, false, true) : '';
  };
  return {
    personal: sheet('我的推理', `<p>你的选择：${esc(own.choice)}</p><div class="actions">${own.clueIds.map(cite).join('') || '<span class="muted">没有提交证物</span>'}</div>${own.clueIds.map(id=>`<p>${esc(id)} · ${esc(next.clues.find(c=>c.id===id)?.meaning)}</p>`).join('')}`),
    chain: sheet('关键证据链', groups.map(([title, ids]) => `<h3>${title}</h3><ul>${ids.map(id => {
      const clue = next.clues.find(c => c.id === id);
      return clue ? `<li>${cite(id)} <small>${esc(clue.via)}</small><p>${esc(clue.meaning)}</p>${clue.related ? cite(clue.related) : ""}</li>` : '';
    }).join('')}</ul>`).join('')),
  };
}
function shortWorkspace(next, panels) {
  const names = { evidence: '线索', discussion: '讨论', role: '我的角色' };
  const active = memo.panel || 'evidence';
  const tabs = `<nav class="actions workspace-tabs" aria-label="调查视图">${Object.entries(names).map(([key, label]) => 
    `<button type="button" data-action="workspace" data-value="${key}" aria-pressed="${key === active}" class="${key === active ? '' : 'secondary'}">${label}</button>`).join('')}</nav>`;
  return tabs + Object.keys(names).map(key => `<div class="workspace-panel" ${key === active ? '' : 'hidden'}>${panels[key]}</div>`).join('');
}
function teammateControls(next) {
  const bots = next.players.filter(player => player.bot);
  if (!bots.length || next.phase < 2 || next.phase > 4) return '';
  const pending = next.teammatePending ?? [];
  const options = bots.map(bot => `<option value="${bot.id}" ${memo.askBot === bot.id ? 'selected' : ''}>${esc(bot.name)}</option>`).join('');
  const replying = bots.filter(bot => pending.some(turn => turn.botId === bot.id)).map(bot => bot.name);
  return `<p class="muted" role="status">${replying.length ? esc(replying.join('、')) + '正在回应…' : ''}</p>
    <form data-form="teammate"><label>问队友<select name="targetBot" data-memo="askBot">${options}</select></label>
    <label>问题<input name="text" data-memo="botQuestion" value="${esc(memo.botQuestion)}" required maxlength="220"></label>
    <button class="secondary">提问队友</button></form>`;
}
function showMatch(result) {
  if (result.state) {
    remember({ code: result.state.code, token: session.token });
    flash('匹配成功，已进入读本。');
    return render(result.state, true);
  }
  if (result.cancelled || result.expired) {
    remember(null);
    waiting.hidden = true;
    entry.hidden = false;
    return flash(result.expired ? '排队已结束，请重新匹配。' : '已取消匹配。');
  }
  entry.hidden = true;
  waiting.hidden = false;
  waitSince = result.waiting.since;
  const select = document.querySelector('[name="role"]');
  select.value = result.waiting.role;
  document.querySelector('#wait-role').textContent = '已选 ' + select.selectedOptions[0].textContent;
  timed();
}
function render(next, force = false) {
  const previous = state?.phase;
  state = next;
  syncTime = Date.now();
  if (previous !== next.phase) Object.assign(memo, { recipient: '', replyTo: null, reply: null, draft: null, panel: 'evidence', cite: null, vote: '', voteClues: [] });
  const { now, ...rest } = next;
  const key = JSON.stringify(rest);
  if (!force && key === signature) return timed();
  const field = room.contains(document.activeElement) ? document.activeElement : null;
  const fieldKey = field?.dataset.memo;
  const caret = field?.selectionStart;
  const chatScroll = room.querySelector('.chat');
  const nearBottom = !chatScroll || chatScroll.scrollHeight - chatScroll.scrollTop - chatScroll.clientHeight < 40;
  signature = key;
  entry.hidden = true;
  waiting.hidden = true;
  room.hidden = false;
  const me = next.players.find(p => p.id === next.me);
  const roleName = id => next.roles.find(r => r.id === id)?.name || '未选角';
  const selected = (value, expected) => value === expected ? ' selected' : '';
  const phase = next.phase;
  const revised = next.flowVersion === 2;
  const hostButton = next.host && phase < 5 && (!revised || phase === 0) ? btn(phase === 0 ? '开始调查' : phase === 4 ? '结束投票' : '推进阶段', 'advance', '', phase === 0 && (next.players.length !== 3 || !next.players.every(p => p.ready))) : '';
  const header = `<div class="sheet bar ${revised ? 'stage-bar' : ''}"><h2>${(revised ? shortStages : stages)[phase]}</h2><code>${next.code}</code>${btn(revised ? '复制邀请链接' : '复制房间码', 'copy', '', false, true)}<span id="timer"></span>${hostButton}${phase === 0 ? btn('退出房间', 'leave-lobby', '', false, true) : ''}</div>`;
  const roster = next.players.map(p => `<div class="entry-row">${esc(p.name)} · ${roleName(p.role)} <small>${p.bot ? 'AI 队友' : p.online ? '在线' : '离线'}${phase === 0 && p.ready ? ' · 已准备' : ''}${p.id === me.id ? ' · 你' : ''}</small></div>`).join('');
  const missing = next.botVacancies ?? [];
  const recruitButton = next.vacancy ? (next.recruiting
    ? btn('取消招募', 'cancel-recruit', '', false, true) : btn('招募真人', 'recruit')) : '';
  const botButton = btn(missing.length === 2 ? '添加两名 AI 队友并开局' : '添加 AI 队友', 'add-bot', missing.join(','), false, true);
  const recruitment = phase === 0 && missing.length ? `<div class="entry-row compact"><p>${next.recruiting ? '正在招募' : '还差'}：${missing.map(roleName).join('、')}</p>${next.host ? `<div class="actions">${recruitButton}${botButton}</div>` : ''}</div>` : '';
  const seats = phase ? '' : next.roles.map(r => `<div class="entry-row"><strong>${r.name} · ${r.title}</strong><p>${r.intro}</p>${btn(me.role === r.id ? '已选择' : '选择', 'seat', r.id, next.players.some(p => p.role === r.id), true)}</div>`).join('') + btn(me.ready ? '取消准备' : '准备', 'ready', '', !me.role);
  const prefs = phase >= 1 && phase <= 4 ? `<details class="compact" ${next.prefs ? 'open' : ''}><summary>AI 表达偏好</summary><form data-form="prefs"><label>语气<select name="tone">${['平静','直接','委婉'].map(v => `<option${selected(v, next.prefs?.tone)}>${v}</option>`).join('')}</select></label><label>面对质疑<select name="stance">${['解释','反问','暂不判断'].map(v => `<option${selected(v, next.prefs?.stance)}>${v}</option>`).join('')}</select></label><div class="actions"><button>保存并开启</button>${next.prefs ? btn('关闭','disable','',false,true) : ''}</div></form></details>` : '';
  const story = sheet('案情', next.opening.map(p => `<p>${esc(p)}</p>`).join(''));
  const card = next.card ? sheet('我的角色卡', `${next.brief ? next.brief.map((v,i)=>`<p><strong>${['我是谁','我亲眼知道','我想隐瞒','我最想问谁'][i]}</strong> · ${esc(v)}</p>`).join('') : ''}<details ${phase === 1 && !next.brief ? 'open' : ''}><summary>${roleName(me.role)} · 仅自己可见</summary><p class="card">${esc(next.card)}</p></details>${prefs}`) : '';
  const clueList = next.clues.map(c => `<div class="clue" id="evidence-${c.id}" tabindex="-1"><span class="kind">${c.id} · ${c.kind}</span><h3>${esc(c.title)}</h3>${c.body ? `<p>${esc(c.body)}</p><small>${esc(c.via)}</small>` : btn('调查', 'clue', c.id, phase === 5, true)}${c.body ? threadFor(next,c.id).map(m => renderMessage(m,next.messages)).join('') : ''}
      ${c.meaning ? `<p class="muted">${esc(c.meaning)}</p>` : ''}</div>`).join('');
  const chat = phase >= 2 ? sheet('公开讨论', `<div class="chat">${next.messages.map(m => renderMessage(m, next.messages)).join('') || '<p class="muted">还没有发言。</p>'}</div>${phase <= 4 ? `<form data-form="message">${memo.replyTo ? `<p>回复 ${esc(next.messages.find(m=>m.id===memo.replyTo)?.by)} ${btn("取消回复","clear-cite","",false,true)}</p>` : ""}<label>发言对象<select name="recipient" data-memo="recipient"><option value="">全体</option>${next.players.filter(p=>p.id!==next.me).map(p=>`<option value="${esc(p.id)}"${selected(memo.recipient,p.id)}>${esc(p.name)}</option>`).join("")}</select></label><label>发言<textarea name="text" maxlength="500" required data-memo="discussion">${esc(memo.discussion)}</textarea></label><div class="actions"><button>发送</button>${next.prefs ? btn('整理成草稿', 'draft', '', !next.modelReady || !next.draftRemaining, true) : ''}</div></form>${memo.draft && next.prefs ? `<form data-form="send-draft"><label>草稿预览 · 确认内容后发送<textarea name="text" maxlength="500" required data-memo="draftText">${esc(memo.draft.answer)}</textarea></label><button>确认并发送</button></form>` : ''}` : ''}`) : '';
  const diary = next.clues.find(c => c.id === 'C12' && c.body);
  const ask = phase === 3 ? sheet('盘问与日记', `<p class="muted">${next.modelReady ? 'AI 依据公开记录选取回答，剩余 ' + next.remaining + ' 次。' : '当前使用原始记录。'}</p>${memo.target === 'diary' && diary ? `<blockquote><small>案发当日 · 生前手记</small><p>${esc(diary.body)}</p></blockquote>` : ''}<form data-form="ask"><label>对象<select name="target" data-memo="target"><option value="chen">管家陈伯</option><option value="diary" ${diary ? '' : 'disabled'}${selected(memo.target, 'diary')}>日记回响（解读生前记录）</option></select></label><label>问题<input name="question" maxlength="220" required data-memo="question" value="${esc(memo.question)}"></label><button>提问</button></form>${memo.reply ? `<div class="clue compact"><small>${esc(memo.reply.mode)} ${esc(memo.reply.source)}</small><p>${esc(memo.reply.answer)}</p></div>` : ''}`) : '';
  const vote = phase === 4 ? sheet(revised ? '提交你的判断' : '投票', next.voted ? '<p>已提交。等待其他玩家或时间结束。</p>' :
    `<form data-form="vote"><label>选择嫌疑人<select name="to" data-memo="vote" ${revised ? 'required' : ''}>
    ${revised ? '<option value="">请选择</option>' : '<option value="">弃票</option>'}
    ${next.players.filter(p => p.id !== me.id).map(p => `<option value="${p.id}"${selected(memo.vote, p.id)}>${roleName(p.role)}</option>`).join('')}
    ${revised ? `<option value="abstain"${selected(memo.vote, 'abstain')}>弃票</option>` : ''}
    </select></label>${revised ? voteEvidence(next) : ''}<button>${revised ? '提交指认' : '确认投票'}</button><small>提交后无法修改。</small></form>`) : '';
  const timeline = next.result ? `<ol class="result-list">${next.result.timeline.map(t => `<li><strong>${esc(t.time)}</strong> ${esc(t.event)}</li>`).join('')}</ol>` : '';
  const result = next.result ? sheet(next.result.label, `<p>${next.result.votes.map(v => esc(v.from) + ' → ' + esc(v.to)).join(' · ')}</p>${revised ? `<details><summary>案发时间线</summary>${timeline}</details>` : timeline + btn('返回首页', 'leave', '', false, true)}`) : '';
  if (revised && phase >= 1) {
    const instruction = phase <= 4 ? progress(next) : '';
    const quote = memo.cite ? '<div class="actions quote">' +
      btn(memo.cite + ' · 查看引用', 'jump-clue', memo.cite, false, true) +
      btn('移除引用', 'clear-cite', '', false, true) + '</div>' : '';
    if (phase === 1) room.innerHTML = header + instruction + story + card;
    else if (phase === 5) {
      const recap = reasoningRecap(next);
      room.innerHTML = header + recap.personal + result + recap.chain + sheet('他们当时隐瞒了什么',(next.result.secrets || []).map(s=>`<p><strong>${esc(s.name)}</strong> · ${esc(s.secret)}</p>`).join('')) + evidenceBoard(next) + btn('返回首页', 'leave', '', false, true);
    } else {
      room.innerHTML = header + instruction + vote + shortWorkspace(next, {
        evidence: evidenceBoard(next),
        discussion: quote + chat + (next.players.some(p => p.bot) ? sheet('队友问答', teammateControls(next)) : '') + ask,
        role: card + story,
      });
    }
  } else room.innerHTML = header + `<div class="grid"><div class="col">${result}${phase <= 1 ? story : ''}${card}${vote}${chat}${phase >= 2 && phase <= 4 && next.players.some(p => p.bot) ? sheet('队友问答', teammateControls(next)) : ''}${phase === 0 ? sheet('玩家与角色', roster + seats + recruitment) : ''}</div><div class="col">${ask}${clueList ? sheet('公共证物', clueList) : ''}${phase > 0 ? sheet('房间成员', roster) : ''}${phase > 1 ? story : ''}</div></div>`;
  const renderedChat = room.querySelector('.chat');
  if (renderedChat) renderedChat.scrollTop = nearBottom ? renderedChat.scrollHeight : chatScroll.scrollTop;
  if (fieldKey) {
    const replacement = [...room.querySelectorAll('[data-memo]')].find(node => node.dataset.memo === fieldKey);
    replacement?.focus({ preventScroll: true });
    if (Number.isInteger(caret)) replacement?.setSelectionRange?.(caret, caret);
  }
  timed();
}
document.querySelector('#entry-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  const data = Object.fromEntries(new FormData(event.target));
  const action = event.submitter.value;
  if (session) return;
  if (['match', 'solo'].includes(action) && !data.role) return flash('请先选择角色。');
  busy = true;
  try {
    if (action === 'match') {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const token = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
      remember({ token });
      flash();
      showMatch(await api(action, data));
      return;
    }
    const result = await api(action, data);
    remember({ code: result.state.code, token: result.token });
    flash();
    render(result.state, true);
  } catch (error) { flash(error.message); }
  finally { busy = false; }
});
document.querySelector('#cancel-match').addEventListener('click', async () => {
  if (busy || !session || session.code) return;
  busy = true;
  try { showMatch(await api('match/cancel', {})); }
  catch (error) { flash(error.message); }
  finally { busy = false; }
});
room.addEventListener('input', event => {
  if (event.target.name === 'clueIds') {
    memo.voteClues = [...room.querySelectorAll('[name="clueIds"]:checked')].map(input => input.value);
  }
  const key = event.target.dataset.memo;
  if (key === 'draftText' && memo.draft) memo.draft.answer = event.target.value;
  else if (key) {
    memo[key] = event.target.value;
    if (key === 'target') { memo.reply = null; render(state,true); }
  }
});
async function act(action, data) {
  if (busy || !session) return;
  busy = true;
  try {
    flash();
    const result = await api(action === 'teammate' ? 'message' : action, data);
    if (result.left) {
      remember(null);
      state = signature = undefined;
      room.hidden = true;
      entry.hidden = false;
      return;
    }
    if (action === 'ask') memo.reply = result;
    if (action === 'teammate') {
      memo.botQuestion = '';
      questionRequest = undefined;
    }
    if (action === 'draft') memo.draft = result;
    if (['message', 'send-draft'].includes(action)) memo.discussion = '';
    if (action === 'send-draft') memo.draft = null;
    if (['message', 'teammate', 'send-draft'].includes(action)) { memo.cite = null; memo.replyTo = null; memo.recipient = ''; memo.discussion = ''; }
    render(result.state, true);
  } catch (error) { flash(error.message); }
  finally { busy = false; timed(); }
}
room.addEventListener('click', async event => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const { action, value } = button.dataset;
  if (action === 'copy') {
    const url = new URL('/', location.href);
    url.searchParams.set('room', state.code);
    const invite = state.flowVersion === 2 ? url.href : state.code;
    try { await navigator.clipboard.writeText(invite); flash('邀请已复制。'); }
    catch { flash('邀请：' + invite + '　房间码：' + state.code); }
    return;
  }
  if (['workspace', 'cite-clue', 'jump-clue', 'clear-cite','reply-message','read-diary'].includes(action)) {
    if (action === 'read-diary') {
      memo.target = 'diary';
      memo.question = value === 'C12' ? '这页记载能印证哪些说法？' : '关于 ' + value + '，日记中有哪些直接记载？';
      memo.reply = null;
      memo.panel = 'discussion';
    }
    if (action === 'workspace') memo.panel = value;
    if (action === 'clear-cite') { memo.cite = null; memo.replyTo = null; }
    if (action === 'reply-message') {
      const parent = state.messages.find(m => m.id === value);
      if (!parent) return;
      memo.replyTo = value; memo.cite = parent.cite; memo.panel = 'discussion';
    }
    if (action === 'cite-clue') { memo.replyTo = null; memo.cite = value; memo.panel = 'discussion';
      memo.discussion ||= state.clues.find(c=>c.id===value)?.question || '哪些是你亲眼看到的？'; }
    if (action === 'jump-clue') memo.panel = 'evidence';
    render(state, true);
    if (action === 'cite-clue') room.querySelector('[name="text"]')?.focus();
    if (action === 'read-diary') room.querySelector('[name="question"]')?.focus();
    if (action === 'jump-clue') document.getElementById('evidence-' + value)?.focus();
    return;
  }
  if (action === 'leave') { remember(null); location.reload(); return; }
  if (action === 'add-bot') {
    const names = value.split(',').map(id => state.roles.find(r => r.id === id).name);
    if (!window.confirm('让 AI 扮演' + names.join('、') + '并立即开局？')) return;
  }
  if (action === 'advance' && state.phase === 3 && !window.confirm('进入投票并补发未领取的证物？')) return;
  const actions = {
    seat: { role: value }, ready: {}, advance: { phase: state.phase, since: state.since },
    'phase-ready': { phase: state.phase, since: state.since, done: value === 'done' },
    clue: { id: value }, disable: { enabled: false }, draft: { text: memo.discussion },
    recruit: {}, 'cancel-recruit': {}, 'add-bot': { roles: value.split(',') }, 'leave-lobby': {},
  };
  await act(action === 'disable' ? 'prefs' : action, actions[action]);
});
room.addEventListener('submit', event => {
  event.preventDefault();
  const action = event.target.dataset.form;
  if (!action) return;
  const data = Object.fromEntries(new FormData(event.target));
  let route = action;
  if (action === 'message') {
    if (memo.replyTo) data.replyTo = memo.replyTo;
    const target = state.players.find(p => p.id === data.recipient);
    if (target?.bot) { data.targetBot = target.id; route = 'teammate'; }
    else if (target) data.targetPlayer = target.id;
    delete data.recipient;
  }
  if (action === 'vote') {
    if (!data.to || data.to === 'abstain') data.to = null;
    if (state.flowVersion === 2) data.clueIds = data.to ? new FormData(event.target).getAll('clueIds') : [];
  }
  if (['message', 'teammate', 'send-draft'].includes(action) && memo.cite) data.clueId = memo.cite;
  if (action === 'send-draft') data.draftId = memo.draft?.draftId;
  if (route === 'teammate') {
    const details = [data.targetBot, data.clueId, data.text].join(':');
    if (questionRequest?.details !== details) {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      questionRequest = { details, id: Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('') };
    }
    data.requestId = questionRequest.id;
  }
  act(route, data);
});
async function poll() {
  if (!session || busy || polling) return;
  polling = true;
  lastPoll = Date.now();
  const current = session;
  try {
    const result = await api(current.code ? 'state' : 'match');
    if (!busy && session === current) {
      if (current.code) render(result.state);
      else showMatch(result);
    }
  } catch (error) { if (!busy) flash(error.message); }
  finally { polling = false; }
}
setInterval(timed, 250);
setInterval(() => {
  if (Date.now() - lastPoll >= (state?.teammatePending?.length ? 600 : 2200)) poll();
}, 200);
poll();

