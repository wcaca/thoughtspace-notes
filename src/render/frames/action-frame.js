/**
 * 底部操作框架
 * [INPUT]: { camera, onAdd }
 * [OUTPUT]: 渲染 缩放指示 + 模式切换 + 手动创建按钮
 * [POS]: src/render/frames/action-frame.js - Round 7
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 *
 * 默认吸附 x=0, y=-110, z=0 水平面(向上)
 */
import { Frame } from '../frame.js';

export class ActionFrame extends Frame {
  constructor({ camera, onAdd }) {
    super({
      id: 'bottom-action',
      title: '🛠 操作',
      width: 480,
      height: 90,
      side: 'bottom',
    });
    this.camera = camera;
    this.onAdd = onAdd || (() => {});
    this.currentMode = '观察'; // 观察 / 整理 / 静观
    this.refresh();
  }

  renderContent(ctx, w, h) {
    // [缩放指示]
    const dist = this.camera ? this.camera.position.length() : 200;
    const zoom = (200 / dist).toFixed(2);
    ctx.fillStyle = '#7fe0c9';
    ctx.font = 'bold 36px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(`× ${zoom}`, 24, h / 2);
    const zoomW = ctx.measureText(`× ${zoom}`).width;
    ctx.fillStyle = '#8b90ad';
    ctx.font = '18px "PingFang SC", sans-serif';
    ctx.fillText('缩放', 24 + zoomW + 8, h / 2);

    // [模式切换]
    const modes = ['观察', '整理', '静观'];
    const modeStartX = 160;
    const modeW = 80;
    modes.forEach((m, i) => {
      const x = modeStartX + i * (modeW + 6);
      const active = this.currentMode === m;
      ctx.fillStyle = active
        ? 'rgba(232, 168, 101, 0.25)'
        : 'rgba(127, 224, 201, 0.12)';
      ctx.fillRect(x, h / 2 - 20, modeW, 40);
      ctx.strokeStyle = active
        ? 'rgba(232, 168, 101, 0.6)'
        : 'rgba(127, 224, 201, 0.4)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, h / 2 - 20, modeW, 40);
      ctx.fillStyle = active ? '#e8a865' : '#e9e7f4';
      ctx.font = 'bold 20px "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(m, x + modeW / 2, h / 2 + 2);
    });
    ctx.textAlign = 'left';

    // [手动创建按钮]
    const btnW = 110;
    const btnX = w - btnW - 24;
    ctx.fillStyle = '#e8a865';
    ctx.fillRect(btnX, h / 2 - 22, btnW, 44);
    // 按钮圆角 (简化)
    ctx.fillStyle = '#1a1d2e';
    ctx.font = 'bold 20px "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('+ 念头', btnX + btnW / 2, h / 2 + 2);
    ctx.textAlign = 'left';

    // [提示]
    ctx.fillStyle = '#8b90ad';
    ctx.font = '16px "PingFang SC", sans-serif';
    ctx.fillText('点击空白投念头 · 拖框架可移动', 24, h - 16);
  }

  setMode(mode) {
    this.currentMode = mode;
    this.refresh();
  }

  setCamera(camera) {
    this.camera = camera;
  }
}