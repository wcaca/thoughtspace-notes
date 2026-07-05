/**
 * [INPUT]: pixi.js, src/core/edge(EDGE_STYLES)
 * [OUTPUT]: makeEdgeLine(fromSprite, toSprite, relationType) → PIXI.Graphics
 * [POS]: src/render 下,被 canvas 每帧重绘调用
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import * as PIXI from 'pixi.js';
import { getEdgeStyle } from '../core/edge.js';

export function makeEdgeLine(fromSprite, toSprite, relationType) {
  const style = getEdgeStyle(relationType);
  const g = new PIXI.Graphics();

  const color = hexToNumber(style.color);
  const alpha = 0.4;

  g.lineStyle(1, color, alpha);

  const fx = fromSprite.position.x;
  const fy = fromSprite.position.y;
  const tx = toSprite.position.x;
  const ty = toSprite.position.y;

  g.moveTo(fx, fy);
  g.bezierCurveTo(fx, fy, tx, ty, tx, ty);

  return g;
}

function hexToNumber(hex) {
  return parseInt(hex.replace('#', ''), 16);
}
