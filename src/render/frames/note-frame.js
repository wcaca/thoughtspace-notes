/**
 * 左侧 Note 列表框架
 * [INPUT]: notes Map { id → Note }
 * [OUTPUT]: 渲染 4 条 Note 标题 + 摘要 + 温度条
 * [POS]: src/render/frames/note-frame.js - Round 7
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 *
 * 默认吸附 x=-160, y=0, z=0 垂直面
 * 点击 Note 项 → 高亮 + 触发 detail-frame 同步
 */
import { Frame } from '../frame.js';

export class NoteFrame extends Frame {
  constructor(notes, onSelectNote) {
    super({
      id: 'left-notes',
      title: '📝 笔记',
      width: 240,
      height: 360,
      side: 'left',
    });
    this.notes = notes;
    this.selectedNoteId = null;
    this.onSelectNote = onSelectNote || (() => {});
    this.refresh();
  }

  renderContent(ctx, w, h) {
    const notesArr = Array.from(this.notes.values());
    if (notesArr.length === 0) {
      ctx.fillStyle = '#8b90ad';
      ctx.font = '20px "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('暂无笔记', w / 2, h / 2);
      ctx.textAlign = 'left';
      return;
    }

    const itemH = 100; // 2x 分辨率
    notesArr.forEach((note, i) => {
      const y = i * itemH;
      const isActive = note.id === this.selectedNoteId;

      // 条目背景
      if (isActive) {
        ctx.fillStyle = 'rgba(232, 168, 101, 0.15)';
        ctx.fillRect(8, y, w - 16, itemH - 8);
        // 左侧橙色高亮条
        ctx.fillStyle = '#e8a865';
        ctx.fillRect(8, y, 4, itemH - 8);
      }

      // 标题
      ctx.fillStyle = '#e9e7f4';
      ctx.font = 'bold 22px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText(truncate(note.title, 14), 24, y + 28);

      // 摘要
      ctx.fillStyle = '#8b90ad';
      ctx.font = '18px "PingFang SC", sans-serif';
      ctx.fillText(truncate(note.summary || '', 18), 24, y + 52);

      // 温度条
      const t = note.temperature ?? 0.5;
      ctx.fillStyle = 'rgba(127, 224, 201, 0.12)';
      ctx.fillRect(24, y + 72, w - 48, 4);
      const warmR = 255, warmG = Math.round(80 + t * 80), warmB = Math.round(60 + t * 60);
      const coolR = Math.round(80 + (1 - t) * 100), coolG = Math.round(120 + (1 - t) * 80), coolB = 200;
      const isWarm = t > 0.5;
      ctx.fillStyle = isWarm
        ? `rgb(${warmR}, ${warmG}, ${warmB})`
        : `rgb(${coolR}, ${coolG}, ${coolB})`;
      ctx.fillRect(24, y + 72, (w - 48) * t, 4);

      // 分隔线 (除最后一项)
      if (i < notesArr.length - 1) {
        ctx.strokeStyle = 'rgba(127, 224, 201, 0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(8, y + itemH - 4);
        ctx.lineTo(w - 8, y + itemH - 4);
        ctx.stroke();
      }
    });
  }

  selectNote(noteId) {
    this.selectedNoteId = noteId;
    this.refresh();
  }

  // [通过屏幕坐标选中最接近的 Note] - 用于 canvas 交互
  pickNoteByScreen(screenX, screenY) {
    const notesArr = Array.from(this.notes.values());
    const itemH = 50; // 屏幕坐标 (canvas 是 2x,内容区是 480-100=380 / 4 ≈ 95 但屏幕上是 50)
    const idx = Math.floor((screenY - this._canvasTop) / itemH);
    if (idx >= 0 && idx < notesArr.length) {
      return notesArr[idx];
    }
    return null;
  }
}

function truncate(s, n) {
  const str = String(s || '');
  return str.length > n ? str.slice(0, n) + '…' : str;
}