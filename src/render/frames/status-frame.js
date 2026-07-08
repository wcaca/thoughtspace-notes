/**
 * 顶部状态框架
 * [INPUT]: thoughts Map
 * [OUTPUT]: 渲染 "今天 N 念头 · 本周 M 念头 · 本月 K 念头" 分布条
 * [POS]: src/render/frames/status-frame.js - Round 7
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 *
 * 默认吸附 x=0, y=+110, z=0 水平面(向下)
 */
import { Frame } from '../frame.js';

export class StatusFrame extends Frame {
  constructor(thoughts) {
    super({
      id: 'top-status',
      title: '✨ 念头田野',
      width: 480,
      height: 80,
      side: 'top',
    });
    this.thoughts = thoughts;
    this.refresh();
  }

  renderContent(ctx, w, h) {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    let today = 0;
    let week = 0;
    let month = 0;
    for (const t of this.thoughts.values()) {
      const age = now - (t.createdAt || now);
      if (age < day) today++;
      if (age < 7 * day) week++;
      if (age < 30 * day) month++;
    }

    const total = this.thoughts.size || 1;
    ctx.textBaseline = 'middle';
    const items = [
      { label: '今天', val: today, color: '#e8a865', key: 'TODAY' },
      { label: '本周', val: week, color: '#7fe0c9', key: 'WEEK' },
      { label: '本月', val: month, color: '#9fc8ff', key: 'MONTH' },
      { label: '总计', val: total, color: '#e87aa8', key: 'TOTAL' },
    ];
    const startX = 24;
    const colW = (w - startX * 2) / items.length;
    items.forEach((it, i) => {
      const x = startX + i * colW;

      // 数值
      ctx.fillStyle = it.color;
      ctx.font = 'bold 36px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${it.val}`, x, h / 2 - 8);

      // 标签
      const numW = ctx.measureText(`${it.val}`).width;
      ctx.fillStyle = '#8b90ad';
      ctx.font = '20px "PingFang SC", sans-serif';
      ctx.fillText(it.label, x + numW + 8, h / 2 - 8);

      // 微小横条
      ctx.fillStyle = 'rgba(127, 224, 201, 0.15)';
      ctx.fillRect(x, h / 2 + 18, colW - 32, 3);
      const barW = (colW - 32) * Math.min(1, it.val / Math.max(1, total));
      ctx.fillStyle = it.color;
      ctx.fillRect(x, h / 2 + 18, barW, 3);
    });
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
  }

  // [刷新] - 当 thoughts 数量变化时调用
  refresh() {
    super.refresh();
  }
}