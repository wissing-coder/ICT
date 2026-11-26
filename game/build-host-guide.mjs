import { writeFileSync } from 'node:fs';
import { roles, clues, opening } from './case.mjs';
import { briefs, questions, corroboration } from './edition.mjs';

const sections = [
  '# 听雨轩主持人手册 · 含剧透',
  '适用版本 tingyuxuan-1.0。此手册供主持人与测试观察员使用。',
  '## 开场',
  ...opening,
  '## 带角色入戏',
  ...roles.map(role => {
    const [identity, observed, hidden, question] = briefs[role.id];
    return '### ' + role.name + '\n\n' + identity + '\n\n亲历：' + observed +
      '\n\n隐情：' + hidden + '\n\n第一句追问：' + question;
  }),
  '## 证物与对质',
  ...clues.map((clue,index) => '### ' + clue.id + ' ' + clue.title + '\n\n' +
    questions[index] + '\n\n推理边界：' + clue.meaning +
    '\n\n对照证物：' + corroboration[index]),
  '## 揭晓与回访',
  '行凶者为苏明轩。先请每人解释自己的选票，再用 C06 的目击、C09 的借衣记录及 C10、C11 的衣物和时间线索核对身份。只引用遗嘱时，先承认它解释了家庭利益，再问哪份证物能补上人物与现场的联系。',
  '最后让明玉和砚秋分别读出隐情。询问每位玩家：哪句发言让你改变或坚持判断？记录他们自己的回答。'
];
writeFileSync(new URL('./主持人手册.md',import.meta.url),sections.join('\n\n')+'\n');
