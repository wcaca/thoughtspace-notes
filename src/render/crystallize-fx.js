/**
 * [INPUT]: pixi.js, src/core/structure(isCrystallized), src/render/thought-node
 * [OUTPUT]: animateCrystallization(world, selectedNodes, coords) → 粒子动画
 * [POS]: src/render 下,被用户触发(Shift+右键或工具栏 Crystallize 按钮)
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import * as PIXI from 'pixi.js';

export function animateCrystallization(world, sprites, coords, onDone) {
  const particles = new PIXI.Graphics();
  world.addChild(particles);

  let elapsed = 0;
  let frame = null;

  const originPositions = sprites.map((s) => ({ x: s.position.x, y: s.position.y }));

  const ticker = (delta) => {
    elapsed += delta * 16.67;

    if (elapsed < 500) {
      const t = elapsed / 500;
      sprites.forEach((s, i) => {
        s.scale.set(1 - t * 0.4);
      });
    } else if (elapsed < 1500) {
      sprites.forEach((s, i) => {
        s.position.set(originPositions[i].x, originPositions[i].y);
        s.alpha = Math.max(0, 1 - (elapsed - 500) / 500);
      });
      particles.clear();
      const cx = coords.centroid?.x || 0;
      const cy = coords.centroid?.y || 0;
      for (let i = 0; i < 12; i++) {
        const a = (Math.PI * 2 * i) / 12 + (elapsed * 0.002);
        const r = 20 + 10 * Math.sin(elapsed * 0.005 + i);
        particles.beginFill(0x7fe0c9, 0.6);
        particles.drawCircle(cx + r * Math.cos(a), cy + r * Math.sin(a), 2);
      }
    } else {
      world.removeChild(particles);
      sprites.forEach((s) => (s.alpha = 0));
      if (ticker.handle) PIXI.Ticker.shared.remove(ticker.handle);
      if (onDone) onDone();
    }
  };

  ticker.handle = ticker;
  PIXI.Ticker.shared.add(ticker);
}
