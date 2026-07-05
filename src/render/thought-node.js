/**
 * [INPUT]: pixi.js, src/core/thought, src/persistence/yjs-store, src/sim/force-engine
 * [OUTPUT]: makeThoughtSprite(t, callbacks) → PIXI.Graphics(温度发光 + 拖拽 + 双击删除)
 * [POS]: src/render 下,被 canvas 主循环和 overlay-panel 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import * as PIXI from 'pixi.js';

export function makeThoughtSprite(thought, callbacks) {
  const g = new PIXI.Graphics();
  g.eventMode = 'static';
  g.cursor = 'grab';

  const radius = 14 + Math.sqrt(thought.mass ?? 1) * 4;
  const temp = thought.temperature ?? 1;

  const glowAlpha = 0.18 + temp * 0.55;
  g.beginFill(0x7fe0c9, glowAlpha);
  g.drawCircle(0, 0, radius + 12);
  g.endFill();

  g.beginFill(0x141a33);
  g.lineStyle(1.5, 0x7fe0c9, 0.9);
  g.drawCircle(0, 0, radius);
  g.endFill();

  const label = new PIXI.Text(thought.text.slice(0, 6), {
    fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
    fontSize: 11,
    fill: 0xe9e7f4
  });
  label.anchor.set(0.5);
  label.y = radius + 12;
  g.addChild(label);

  g.position.set(thought.x ?? 0, thought.y ?? 0);

  g.on('pointerdown', (e) => {
    e.stopPropagation();
    g.cursor = 'grabbing';
    const start = { x: e.global.x, y: e.global.y };
    const orig = { x: g.position.x, y: g.position.y };
    const onMove = (ev) => {
      const dx = ev.global.x - start.x;
      const dy = ev.global.y - start.y;
      g.position.set(orig.x + dx, orig.y + dy);
      if (callbacks?.onDrag) callbacks.onDrag(thought.id, g.position.x, g.position.y);
    };
    const onUp = () => {
      g.cursor = 'grab';
      appStage().off('pointermove', onMove);
      appStage().off('pointerup', onUp);
      appStage().off('pointerupoutside', onUp);
      if (callbacks?.onDragEnd) callbacks.onDragEnd(thought.id, g.position.x, g.position.y);
    };
    appStage().on('pointermove', onMove);
    appStage().on('pointerup', onUp);
    appStage().on('pointerupoutside', onUp);
  });

  g.on('click', () => {
    if (callbacks?.onClick) callbacks.onClick(thought);
  });

  g.on('pointertap', (e) => {
    if (e.shiftKey && callbacks?.onShiftClick) callbacks.onShiftClick(thought);
  });

  return g;
}

function appStage() {
  return PIXI.Application && PIXI.Application._instance
    ? PIXI.Application._instance.stage
    : null;
}
