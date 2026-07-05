/**
 * [INPUT]: 全体 src/ 模块(render/canvas, persistence/yjs-store, sim/force-engine, core, ui/toolbar, render/*) + pixi.js
 * [OUTPUT]: 全站运行,one-time bootstrap + 持续帧循环
 * [POS]: 顶层入口,被 index.html 引用
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */
import * as PIXI from 'pixi.js';
import { createApp, drawBackgroundDust } from './render/canvas.js';
import { initPersistence, getDoc, getThoughts, getEdges, transact, getUndoManager } from './persistence/yjs-store.js';
import { createSimulation, restartSimulation, pinNode, unpinNode } from './sim/force-engine.js';
import { createThought, decayTemperature, refreshTemperature } from './core/thought.js';
import { createEdge, RelationType } from './core/edge.js';
import { makeThoughtSprite } from './render/thought-node.js';
import { makeEdgeLine } from './render/edge-line.js';
import { createOverlayPanel } from './render/overlay-panel.js';
import { createToolbar } from './ui/toolbar.js';

await initPersistence('thoughtspace-notes-phase0');
const ydoc = getDoc();
const yThoughts = getThoughts();
const yEdges = getEdges();
const undoManager = getUndoManager();

const { app, world } = createApp(document.getElementById('stage'));
drawBackgroundDust(world);

const nodeLayer = new PIXI.Container();
const edgeLayer = new PIXI.Container();
world.addChild(edgeLayer);
world.addChild(nodeLayer);

const spriteById = new Map();
let simState = null;
let shiftSelecting = null;

const statT = document.getElementById('stat-thoughts');
const statE = document.getElementById('stat-edges');
const statFPS = document.getElementById('stat-fps');
let fpsAcc = 0;

app.ticker.add(() => {
  fpsAcc++;
  redrawEdges();
});

setInterval(() => {
  statFPS.textContent = fpsAcc;
  fpsAcc = 0;
  statT.textContent = yThoughts.size;
  statE.textContent = yEdges.size;
}, 1000);

function redrawEdges() {
  edgeLayer.removeChildren();
  for (const e of yEdges.values()) {
    const a = spriteById.get(e.fromId);
    const b = spriteById.get(e.toId);
    if (!a || !b) continue;
    edgeLayer.addChild(makeEdgeLine(a, b, e.relationType));
  }
}

function rebuildScene() {
  nodeLayer.removeChildren();
  spriteById.clear();
  for (const t of yThoughts.values()) {
    const s = makeThoughtSprite(t, {
      onDrag: (id, x, y) => {
        if (simState) pinNode(simState.idToNode, id, x, y);
      },
      onDragEnd: (id, x, y) => {
        const node = simState?.idToNode?.get(id);
        if (node) unpinNode(simState.idToNode, id);
        transact(() => {
          const t = yThoughts.get(id);
          if (t) yThoughts.set(id, { ...t, x, y });
        }, 'user');
      },
      onClick: (thought) => {
        createOverlayPanel(thought, document.body, {
          onSave: (id, text) => {
            transact(() => {
              const t = yThoughts.get(id);
              if (t) yThoughts.set(id, { ...t, text });
            }, 'user');
          },
          onDelete: (id) => {
            transact(() => {
              yThoughts.delete(id);
              for (const [eid, e] of yEdges) {
                if (e.fromId === id || e.toId === id) yEdges.delete(eid);
              }
            }, 'user');
          }
        });
      },
      onShiftClick: (thought) => {
        if (!shiftSelecting) {
          shiftSelecting = thought.id;
          return;
        }
        if (shiftSelecting !== thought.id) {
          const eid = `e_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          transact(() => {
            yEdges.set(eid, createEdge(eid, shiftSelecting, thought.id, RelationType.PARALLEL));
          }, 'user');
        }
        shiftSelecting = null;
      }
    });
    spriteById.set(t.id, s);
    nodeLayer.addChild(s);
  }
}

function rebuildSim() {
  const thoughts = Array.from(yThoughts.values());
  const edges = Array.from(yEdges.values());
  simState = createSimulation(thoughts, edges);
  simState.sim.on('tick', () => {
    if (simState.sim.alpha() < 0.05) return;
    transact(() => {
      for (const n of simState.nodes) {
        const t = yThoughts.get(n.id);
        if (t && (Math.abs(t.x - n.x) > 0.1 || Math.abs(t.y - n.y) > 0.1))
          yThoughts.set(n.id, { ...t, x: n.x, y: n.y });
      }
    }, 'sim');
  });
  restartSimulation(simState.sim, 0.6);
}

yThoughts.observeDeep(() => { rebuildSim(); requestAnimationFrame(rebuildScene); });
yEdges.observeDeep(() => { rebuildSim(); requestAnimationFrame(rebuildScene); });

app.stage.on('pointerdown', (e) => {
  if (e.target !== app.stage) return;
  if (e.shiftKey) return;
  const local = world.toLocal(new PIXI.Point(e.global.x, e.global.y));
  const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  transact(() => {
    yThoughts.set(id, createThought(id, '', local.x, local.y));
  }, 'user');
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    if (undoManager) undoManager.undo();
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    e.preventDefault();
    if (undoManager) undoManager.redo();
  }
});

createToolbar(document.body, {
  onAdd: () => {
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const x = (Math.random() - 0.5) * 600;
    const y = (Math.random() - 0.5) * 400;
    transact(() => { yThoughts.set(id, createThought(id, '新念头', x, y)); }, 'user');
  },
  onReset: () => { if (simState) restartSimulation(simState.sim, 1); },
  onSample: () => {
    if (yThoughts.size > 0) return;
    seedSample();
  },
  onClear: () => { transact(() => { yThoughts.clear(); yEdges.clear(); }); }
});

if (yThoughts.size === 0) seedSample();

function seedSample() {
  const seed = [
    { id: 't_seed_0', text: '想开始一个新项目', x: -180, y: -80 },
    { id: 't_seed_1', text: '但不知道从哪开始', x: 80, y: -120 },
    { id: 't_seed_2', text: '也许先做个原型', x: -40, y: 80 },
    { id: 't_seed_3', text: '验证手感', x: 200, y: 60 },
    { id: 't_seed_4', text: '克制的游戏化', x: -260, y: 120 },
    { id: 't_seed_5', text: '照料念头田野', x: 120, y: 200 }
  ];
  transact(() => {
    for (const s of seed) yThoughts.set(s.id, createThought(s.id, s.text, s.x, s.y));
    yEdges.set('e_seed_0', createEdge('e_seed_0', 't_seed_0', 't_seed_1', RelationType.SEQUENCE));
    yEdges.set('e_seed_1', createEdge('e_seed_1', 't_seed_1', 't_seed_2', RelationType.CAUSE));
    yEdges.set('e_seed_2', createEdge('e_seed_2', 't_seed_2', 't_seed_3', RelationType.PARALLEL));
    yEdges.set('e_seed_3', createEdge('e_seed_3', 't_seed_5', 't_seed_0', RelationType.CAUSE));
  });
}

setTimeout(() => {
  const hint = document.getElementById('hint');
  if (hint) hint.classList.add('fade');
}, 8000);
