/**
 * Note 数据模型
 * [INPUT]: 无
 * [OUTPUT]: createNote(id, title, content) → Note { id, title, content, createdAt, updatedAt }
 * [POS]: src/core/note.js — Note 是念头的源,提供详情页锚点
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */
export function createNote(id, title, content) {
  return {
    id,
    title,
    content,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// 4 个种子 Note — 必须有温度,不是"测试1"
const NOW = Date.now();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const SEED_NOTES = [
  {
    id: 'note_seed_1',
    title: '通勤路上想到的产品点子',
    summary: '通勤时脑子最乱,但也最有创造力',
    thoughtText: '通勤模式',
    content: '想到一个事:早起通勤的时候脑子最乱,但其实也是最有创造力的,因为没有任何上下文干扰。能不能在 app 里加一个"通勤模式",一键把所有干扰关掉,只留一个语音输入?',
    mass: 0.8,
    temperature: 0.9,
    createdAt: NOW - 2 * HOUR,
  },
  {
    id: 'note_seed_2',
    title: '和老妈的通话',
    summary: '妈腰不好,下周一定要回去看',
    thoughtText: '下周回去',
    content: '妈说她的腰最近不太好。挂了电话我有点后悔没多问几句。下周一定要回去看看。',
    mass: 1.0,
    temperature: 0.7,
    createdAt: NOW - 5 * HOUR,
  },
  {
    id: 'note_seed_3',
    title: '读了一半的书',
    summary: '系统1/2之外的第三种状态:发呆',
    thoughtText: '发呆',
    content: '《思考,快与慢》里说系统1和系统2,但我觉得人其实有第三种状态:发呆。发呆不是不想,是脑子在后台跑批处理。',
    mass: 0.5,
    temperature: 0.4,
    createdAt: NOW - 3 * DAY,
  },
  {
    id: 'note_seed_4',
    title: '工作上的纠结',
    summary: '要不要接外包?钱多但要占周末',
    thoughtText: '接外包',
    content: '要不要接那个外包项目?钱不少但要占周末时间。最近已经很久没休息了,但储蓄也确实见底。',
    mass: 0.9,
    temperature: 0.8,
    createdAt: NOW - 12 * HOUR,
  },
];