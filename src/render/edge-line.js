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

function writeDirect(arr, from, to) {
  if (arr.length < 6) return;
  arr[0] = from.x; arr[1] = from.y; arr[2] = from.z ?? 0;
  arr[3] = to.x; arr[4] = to.y; arr[5] = to.z ?? 0;
}

function writeZigzag(arr, from, to, segments = 8, amplitude = 8) {
  const totalPoints = segments + 2;
  if (arr.length < totalPoints * 3) return;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = (to.z ?? 0) - (from.z ?? 0);
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 0.001) {
    for (let i = 0; i < totalPoints; i++) {
      arr[i * 3] = from.x;
      arr[i * 3 + 1] = from.y;
      arr[i * 3 + 2] = from.z ?? 0;
    }
    return;
  }
  const nx = dx / len;
  const ny = dy / len;
  const nz = dz / len;
  const perpX = -ny;
  const perpY = nx;
  const perpZ = 0;
  const perpLen = Math.sqrt(perpX * perpX + perpY * perpY + perpZ * perpZ);
  let px = 0, py = 0, pz = 0;
  if (perpLen > 0.001) {
    px = perpX / perpLen;
    py = perpY / perpLen;
    pz = perpZ / perpLen;
  } else {
    px = 1;
  }
  for (let i = 0; i < totalPoints; i++) {
    const t = i / (totalPoints - 1);
    const baseX = from.x + dx * t;
    const baseY = from.y + dy * t;
    const baseZ = (from.z ?? 0) + dz * t;
    const isEnd = i === 0 || i === totalPoints - 1;
    const offset = isEnd ? 0 : (i % 2 === 0 ? 1 : -1) * amplitude;
    arr[i * 3] = baseX + px * offset;
    arr[i * 3 + 1] = baseY + py * offset;
    arr[i * 3 + 2] = baseZ + pz * offset;
  }
}

function writeRightAngle(arr, from, to) {
  if (arr.length < 9) return;
  arr[0] = from.x; arr[1] = from.y; arr[2] = from.z ?? 0;
  arr[3] = from.x; arr[4] = to.y; arr[5] = from.z ?? 0;
  arr[6] = to.x; arr[7] = to.y; arr[8] = to.z ?? 0;
}

export const __test__ = { writeDirect, writeZigzag, writeRightAngle };
