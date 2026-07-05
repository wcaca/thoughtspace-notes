/**
 * [INPUT]: pixi.js, src/persistence/yjs-store, src/sim/force-engine, src/core
 * [OUTPUT]: PixiJS 应用初始化 + 视口缩放/平移 + 后台渲染循环
 * [POS]: src/render 下,index.html 壳引用的入口
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import * as PIXI from 'pixi.js';

let app = null;

export function createApp(containerEl) {
  if (app) return app;

  app = new PIXI.Application({
    resizeTo: containerEl,
    backgroundAlpha: 0,
    antialias: true
  });
  containerEl.appendChild(app.view);

  const world = new PIXI.Container();
  app.stage.addChild(world);

  setupViewportDrag(world);
  setupZoom(world);

  return { app, world };
}

function setupViewportDrag(world) {
  let panning = false;
  let panStart = { x: 0, y: 0 };

  app.stage.eventMode = 'static';
  app.stage.cursor = 'grab';
  app.stage.on('pointerdown', (e) => {
    if (e.target === app.stage) {
      panning = true;
      panStart = { x: e.global.x, y: e.global.y };
      app.stage.cursor = 'grabbing';
    }
  });
  app.stage.on('pointermove', (e) => {
    if (panning) {
      world.x += e.global.x - panStart.x;
      world.y += e.global.y - panStart.y;
      panStart = { x: e.global.x, y: e.global.y };
    }
  });
  app.stage.on('pointerup', () => {
    panning = false;
    app.stage.cursor = 'grab';
  });
  app.stage.on('pointerupoutside', () => {
    panning = false;
    app.stage.cursor = 'grab';
  });
}

function setupZoom(world) {
  app.view.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const scaleBy = 1.08;
      const oldScale = world.scale.x;
      const newScale = e.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
      const px = e.offsetX;
      const py = e.offsetY;
      world.scale.set(newScale);
      world.x = px - (px - world.x) * (newScale / oldScale);
      world.y = py - (py - world.y) * (newScale / oldScale);
    },
    { passive: false }
  );
}

export function getApp() {
  return app;
}

export function drawBackgroundDust(world) {
  const dust = new PIXI.Graphics();
  world.addChild(dust);
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * 4000 - 2000;
    const y = Math.random() * 4000 - 2000;
    dust.beginFill(0xffffff, Math.random() * 0.25 + 0.05);
    dust.drawCircle(x, y, 1);
  }
  return dust;
}
