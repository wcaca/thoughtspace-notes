/**
 * instanced-thoughts.js · v1 历史遗留 (S2 期间修复)
 *
 * [INPUT]: THREE.Scene, capacity (number)
 * [OUTPUT]: { mesh, capacity, tempArr, radiusArr, idByInstance, update, updateOne, setVisible }
 * [POS]: src/render/instanced-thoughts.js,L2 渲染层,v1 InstancedMesh 渲染路径
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * 背景 (S2 修复 2026-07-08):
 *   - v1 时代存在此文件, 实现 idle 念头的 InstancedMesh 单 draw call 渲染
 *   - v2 S1 重构时未迁移此文件, 导致 src/main.js 第 11/30/70-102/189/252/254/337 行的
 *     import + instancedThoughts.* 调用全部找不到模块
 *   - S2.1 (thought.js) 完成后, 此文件被 check:geb FATAL-007 暴露
 *
 * S2 占位实现 (本 commit):
 *   - 提供 stub 实现, 让 src/main.js 不会因 import 报错
 *   - 实现最小 update/updateOne API, 让 main.js 调用不抛错
 *   - v2 S2 后续 (thought-mesh.js + memory-mesh.js 实施后) 将替换为 v2 渲染路径
 *
 * @note(s2, pitfall, v1-stub-revival, since:2026-07-08)
 *   S2.1+ 修复 v1 → v2 迁移期间漏掉的 instanced-thoughts.js。
 *   下一步 v2 thought-mesh.js (S2.6) 实施后, 此 stub 退役, 替换为基于 Thought 类的 v2 渲染。
 */

import * as THREE from 'three';

/**
 * 创建 instanced thoughts 渲染器 (v1 stub, S2 期间临时)
 *
 * @param {THREE.Scene} scene - Three.js 场景
 * @param {number} capacity - 最大实例数
 * @returns {Object} { mesh, capacity, tempArr, radiusArr, idByInstance, update, updateOne, setVisible }
 */
export function createInstancedThoughts(scene, capacity = 1000) {
  const geometry = new THREE.SphereGeometry(0.5, 8, 6);
  // 添加 instanced attributes (温度 / 半径)
  const tempArr = new Float32Array(capacity);
  const radiusArr = new Float32Array(capacity);
  geometry.setAttribute('aTemp', new THREE.InstancedBufferAttribute(tempArr, 1));
  geometry.setAttribute('aRadius', new THREE.InstancedBufferAttribute(radiusArr, 1));

  const material = new THREE.MeshBasicMaterial({ color: 0x88aaff, transparent: true, opacity: 0.85 });
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.count = 0;
  scene.add(mesh);

  return {
    mesh,
    capacity,
    tempArr,
    radiusArr,
    idByInstance: [],

    /**
     * 全量更新 (v1: 接收 yThoughts Y.Array, v2 stub: 接受任意可迭代)
     * @param {Iterable} _yThoughts
     */
    update(_yThoughts) {
      // v2 stub: S2.6 thought-mesh.js 实施后, 此方法替换为 Thought[] 增量更新
      mesh.count = 0;
      this.idByInstance = [];
    },

    /**
     * 单个实例更新
     * @param {number} _instanceIndex
     * @param {Object} _state
     */
    updateOne(_instanceIndex, _state) {
      // v2 stub: S2.6 实施后, 此方法支持 Thought 实例热更新
    },

    /**
     * 显隐控制
     * @param {boolean} visible
     */
    setVisible(visible) {
      mesh.visible = visible;
    },
  };
}

export default { createInstancedThoughts };