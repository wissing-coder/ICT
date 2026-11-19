import { readFileSync } from 'node:fs';

const script = readFileSync(new URL('../迷案回声_网页剧本杀完整方案.md', import.meta.url), 'utf8');
function section(start, end) {
  const a = script.indexOf(start);
  const b = script.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw Error('剧本章节缺失');
  return script.slice(a, b).trim();
}
const plain = text => text.replace(/\*\*/g, '');
export const opening = section('## 三、', '## 四、').split(/\r?\n/)
  .filter(line => line.startsWith('> ') && line.length > 2).map(line => line.slice(2));
export const roles = [
  { id: 'xuan', name: '苏明轩', title: '长子', intro: '经营丝厂的苏家长子' },
  { id: 'yu', name: '苏明玉', title: '次女', intro: '协助家中管账的苏家次女' },
  { id: 'lin', name: '林砚秋', title: '医生', intro: '昨夜前来复诊的家庭医生' },
];
export const cards = Object.fromEntries(roles.map((role, i) => [
  role.id, plain(section('### 4.' + (i + 1), i === 2 ? '## 五、' : '### 4.' + (i + 2)).split(/\r?\n/).slice(2).join('\n').trim()),
]));
export const clues = [...script.matchAll(/^\| (C\d{2}) (.*?) \| (.*?) \| (.*?) \| (.*?) \|/gm)]
  .map(([, id, kind, body, title, meaning], i) => ({ id, kind, body, title: title.replace('，初谈开放', ''), meaning, phase: i < 4 ? 2 : 3 }));
export const timeline = [...section('### 5.1', '### 5.2').matchAll(/^\| ((?:次日 )?\d[^|]*) \| (.*?) \| (.*?) \|/gm)]
  .map(([, time, event]) => ({ time: time.trim(), event }));
if (clues.length !== 12 || new Set(clues.map(c => c.id)).size !== 12 || !timeline.length || !opening.length) {
  throw Error('剧本线索或时间线格式无效');
}
export const verdict = {
  solved: '你们投中了苏明轩。',
  wrong: '你们达成了共识，但投错了人。行凶者是苏明轩。',
  split: '你们没有形成两票一致的结论。行凶者是苏明轩。',
};
