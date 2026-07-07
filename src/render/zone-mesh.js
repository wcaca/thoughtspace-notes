/**
 * [INPUT]: zoneStore / scene / camera
 * [OUTPUT]: createZoneMesh(zoneStore, scene) → { rebuild, updateZone, removeZone, dispose, highlight }
 * [POS]: src/render/zone-mesh.js — 用户自定义分区的 3D 可视化(半透明球体 + 中心文字标签)
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */

import * as THREE from 'three';

const GEOMETRY_SEGMENTS = 24;

export function createZoneMesh(zoneStore, scene) {
  const group = new THREE.Group();
  group.name = 'zone-group';
  scene.add(group);

  const meshes = new Map(); // zoneId -> { sphere, wire, label }
  const labelCache = new Map(); // zoneId -> { sprite, canvas, ctx }

  function makeWireMaterial(color) {
    return new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.45,
      depthWrite: false
    });
  }

  function makeSurfaceMaterial(color) {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.07,
      side: THREE.DoubleSide,
      depthWrite: false
    });
  }

  function makeSphere(zone) {
    const geo = new THREE.SphereGeometry(zone.radius, GEOMETRY_SEGMENTS, GEOMETRY_SEGMENTS / 2);
    const mat = makeSurfaceMaterial(zone.color);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(zone.center.x, zone.center.y, zone.center.z);
    mesh.userData.zoneId = zone.id;
    return mesh;
  }

  function makeWireframe(zone) {
    const geo = new THREE.SphereGeometry(zone.radius, GEOMETRY_SEGMENTS, GEOMETRY_SEGMENTS / 2);
    const edges = new THREE.EdgesGeometry(geo);
    const mat = makeWireMaterial(zone.color);
    const lines = new THREE.LineSegments(edges, mat);
    lines.position.set(zone.center.x, zone.center.y, zone.center.z);
    lines.userData.zoneId = zone.id;
    return lines;
  }

  function makeLabel(zone) {
    const canvas = document.createElement('canvas');
    const size = 256;
    canvas.width = size;
    canvas.height = size / 2;
    const ctx = canvas.getContext('2d');
    drawLabel(ctx, canvas, zone);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(zone.center.x, zone.center.y + zone.radius + 16, zone.center.z);
    sprite.scale.set(120, 60, 1);
    sprite.userData.zoneId = zone.id;
    return { sprite, canvas, ctx, tex };
  }

  function drawLabel(ctx, canvas, zone) {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    // 背景胶囊
    ctx.fillStyle = hexToRgba(zone.color, 0.85);
    roundRect(ctx, 16, 8, w - 32, h - 16, 14);
    ctx.fill();
    // 文字
    ctx.font = '500 28px "PingFang SC", sans-serif';
    ctx.fillStyle = '#0b0f1d';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(truncate(zone.name, 10), w / 2, h / 2 + 2);
  }

  function truncate(s, n) {
    if (!s) return '';
    if (s.length <= n) return s;
    return s.slice(0, n - 1) + '…';
  }

  function hexToRgba(hex, a) {
    if (!hex || typeof hex !== 'string') return `rgba(127,224,201,${a})`;
    const h = hex.replace('#', '');
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return `rgba(127,224,201,${a})`;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function addZone(zone) {
    if (meshes.has(zone.id)) return;
    const sphere = makeSphere(zone);
    const wire = makeWireframe(zone);
    const label = makeLabel(zone);
    group.add(sphere);
    group.add(wire);
    group.add(label.sprite);
    meshes.set(zone.id, { sphere, wire, label });
    labelCache.set(zone.id, label);
  }

  function updateZone(zone) {
    const entry = meshes.get(zone.id);
    if (!entry) {
      addZone(zone);
      return;
    }
    // 重建(geometry 受 radius 影响;material 受 color 影响)
    removeZone(zone.id);
    addZone(zone);
  }

  function removeZone(zoneId) {
    const entry = meshes.get(zoneId);
    if (!entry) return;
    group.remove(entry.sphere);
    group.remove(entry.wire);
    group.remove(entry.label.sprite);
    if (entry.sphere.geometry) entry.sphere.geometry.dispose();
    if (entry.sphere.material) entry.sphere.material.dispose();
    if (entry.wire.geometry) entry.wire.geometry.dispose();
    if (entry.wire.material) entry.wire.material.dispose();
    if (entry.label.tex) entry.label.tex.dispose();
    if (entry.label.sprite.material) entry.label.sprite.material.dispose();
    meshes.delete(zoneId);
    labelCache.delete(zoneId);
  }

  function rebuild() {
    // 清空所有现有 mesh
    for (const id of Array.from(meshes.keys())) {
      removeZone(id);
    }
    // 重新创建
    for (const zone of zoneStore.list()) {
      addZone(zone);
    }
  }

  function highlight(zoneId, on = true) {
    const entry = meshes.get(zoneId);
    if (!entry) return;
    if (entry.sphere.material) entry.sphere.material.opacity = on ? 0.18 : 0.07;
    if (entry.wire.material) {
      entry.wire.material.opacity = on ? 0.9 : 0.45;
      entry.wire.material.linewidth = on ? 2 : 1;
    }
  }

  function getMeshes() {
    return meshes;
  }

  function dispose() {
    rebuild();
    scene.remove(group);
  }

  return {
    rebuild,
    updateZone,
    removeZone,
    highlight,
    getMeshes,
    dispose
  };
}