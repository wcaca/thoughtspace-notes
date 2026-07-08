/**
 * 右侧详情框架
 * [INPUT]: notes Map + thoughtMeshes Map
 * [OUTPUT]: 渲染选中 Note 的全文 (标题/质量温度/正文)
 * [POS]: src/render/frames/detail-frame.js - Round 7
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 *
 * 默认吸附 x=+160, y=0, z=0 垂直面
 * 未选中时显示 "点击左侧笔记 或 3D 节点查看"
 */
import { Frame } from '../frame.js';

export class DetailFrame extends Frame {
  constructor(notes) {
    super({
      id: 'right-detail',
      title: '💭 详情',
      width: 260,
      height: 360,
      side: 'right',
    });
    this.notes = notes;
    this.selectedNoteId = null;
    this.refresh();
  }

  renderContent(ctx, w, h) {
    if (!this.selectedNoteId) {
      ctx.fillStyle = '#8b90ad';
      ctx.font = '22px "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('点击左侧笔记', w / 2, h / 2 - 16);
      ctx.fillText('或 3D 节点', w / 2, h / 2 + 16);
      ctx.fillText('查看详情', w / 2, h / 2 + 48);
      ctx.textAlign = 'left';
      return;
    }
    const note = this.notes.get(this.selectedNoteId);
    if (!note) {
      ctx.fillStyle = '#8b90ad';
      ctx.font = '20px "PingFang SC", sans-serif';
      ctx.fillText('笔记不存在', 24, 40);
      return;
    }

    // 标题
    ctx.fillStyle = '#e8a865';
    ctx.font = 'bold 26px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textBaseline = 'top';
    const titleLines = wrapText(ctx, note.title || '(无标题)', w - 32);
    titleLines.forEach((line, i) => ctx.fillText(line, 16, 16 + i * 32));

    // 质量 + 温度
    ctx.fillStyle = '#8b90ad';
    ctx.font = '18px "PingFang SC", sans-serif';
    const metaY = 16 + titleLines.length * 32 + 16;
    ctx.fillText(`质量 ${(note.mass ?? 0.5).toFixed(2)}  ·  温度 ${(note.temperature ?? 0.5).toFixed(2)}`, 16, metaY);

    // 分隔线
    ctx.strokeStyle = 'rgba(127, 224, 201, 0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(16, metaY + 28);
    ctx.lineTo(w - 16, metaY + 28);
    ctx.stroke();

    // 内容
    ctx.fillStyle = '#d8d6e6';
    ctx.font = '20px "PingFang SC", sans-serif';
    const lines = wrapText(ctx, note.content || '', w - 32);
    const startY = metaY + 44;
    lines.forEach((line, i) => ctx.fillText(line, 16, startY + i * 28));
  }

  selectNote(noteId) {
    this.selectedNoteId = noteId;
    this.refresh();
  }
}

function wrapText(ctx, text, maxWidth) {
  const str = String(text || '');
  const lines = [];
  let cur = '';
  for (const ch of str) {
    if (ctx.measureText(cur + ch).width > maxWidth) {
      lines.push(cur);
      cur = ch;
    } else {
      cur += ch;
    }
    if (lines.length > 12) {
      lines[lines.length - 1] += '…';
      break;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}