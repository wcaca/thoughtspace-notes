/**
 * 无限网格 (z=0 平面)
 * [INPUT]: 无
 * [OUTPUT]: THREE.GridHelper — 主背景层"空间感"承载
 * [POS]: src/render/infinite-grid.js — Round 6
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */
import * as THREE from 'three';

export function createInfiniteGrid() {
  // Round 6 R1 UX 修复: 网格降饱和度 + 降透明度,让节点成为视觉主角
  // color1/color2 改暗,opacity 0.55 → 0.2,让远处网格被 fog 自然淡出
  const grid = new THREE.GridHelper(4000, 160, 0x0a1830, 0x050a18);
  grid.position.y = -30;
  grid.material.opacity = 0.2;
  grid.material.transparent = true;
  grid.material.depthWrite = false;
  return grid;
}