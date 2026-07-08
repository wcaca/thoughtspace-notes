/**
 * 框架对象基类 - 3D Plane + CanvasTexture + 吸附盒 + 拖拽手柄
 * [INPUT]: { id, title, renderCanvas, snapPoints, attachPosition, side, width, height }
 * [OUTPUT]: { mesh, plane, canvas, ctx, update, setSnapPosition, destroy }
 * [POS]: src/render/frame.js - Round 7
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * 框架不是 HTML 浮窗,是 3D Plane + CanvasTexture 渲染的卡片。
 * 有自己的吸附盒 (80px)、拖拽手柄 (右上 6-dot grip)、和沿空间分布能力。
 *
 * 视觉对比:
 *  - 空间对象 (念头/引力线): 完整沉浸感,无边界
 *  - 框架对象 (Note 列表/详情/操作台): 有边界 + 圆角 + 半透明背景
 *
 * 吸附位 4 个 (top/bottom/left/right), 重力井 30px snap。
 */
import * as THREE from 'three';

export class Frame {
  constructor({
    id,
    title,
    width = 220,
    height = 280,
    side = 'left',
  }) {
    this.id = id;
    this.title = title;
    this.width = width;
    this.height = height;
    this.side = side;

    // [Canvas 绘制内容] - 用 2x 分辨率避免模糊
    this.canvas = document.createElement('canvas');
    this.canvas.width = width * 2;
    this.canvas.height = height * 2;
    this.ctx = this.canvas.getContext('2d');

    // [3D Plane + CanvasTexture]
    const tex = new THREE.CanvasTexture(this.canvas);
    tex.needsUpdate = true;
    tex.anisotropy = 4;

    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthTest: false,
    });

    this.plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
    this.plane.renderOrder = 100;
    this.plane.userData.isFrame = true;
    this.plane.userData.frameId = id;
    this.plane.userData.frameSide = side;

    // [外层 Group] - 方便整体旋转 + 位置
    this.mesh = new THREE.Group();
    this.mesh.add(this.plane);
    this.mesh.userData.isFrame = true;
    this.mesh.userData.frameId = id;
    this.mesh.userData.frameSide = side;

    this.attachedPosition = null;
    this._texture = tex;
    this._drawBase();
  }

  // [基础绘制] - 圆角背景 + 边框 + 标题栏 + 拖拽手柄
  _drawBase() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    // [圆角背景]
    const r = 32; // 8px * 2 (因 canvas 是 2x)
    ctx.fillStyle = 'rgba(8, 12, 24, 0.88)';
    this._roundRect(ctx, 0, 0, w, h, r);
    ctx.fill();

    // [边框] - 微妙青色边
    ctx.strokeStyle = 'rgba(127, 224, 201, 0.3)';
    ctx.lineWidth = 2;
    this._roundRect(ctx, 1, 1, w - 2, h - 2, r);
    ctx.stroke();

    // [标题栏] - 顶部 56px
    ctx.fillStyle = 'rgba(127, 224, 201, 0.12)';
    ctx.fillRect(0, 0, w, 56);
    // 标题栏底分隔线
    ctx.strokeStyle = 'rgba(127, 224, 201, 0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 56);
    ctx.lineTo(w, 56);
    ctx.stroke();

    // [标题文字]
    ctx.fillStyle = '#7fe0c9';
    ctx.font = 'bold 26px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.title, 20, 28);

    // [拖拽手柄] - 右上 6-dot grip
    this._drawGrip(ctx, w - 30, 28);

    this._texture.needsUpdate = true;
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  _drawGrip(ctx, cx, cy) {
    ctx.fillStyle = 'rgba(127, 224, 201, 0.6)';
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        ctx.beginPath();
        ctx.arc(cx - 6 + c * 6, cy - 3 + r * 6, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // [子类覆盖此方法绘制自己的内容] - 默认占位
  renderContent(ctx, w, h) {
    ctx.fillStyle = '#8b90ad';
    ctx.font = '20px "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('(空)', w / 2, h / 2);
    ctx.textAlign = 'left';
  }

  // [刷新 texture] - 重画背景 + 标题 + 内容
  refresh() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    this._drawBase();
    // 内容区从 (0, 56) 开始, 高 h - 56 (canvas 是 2x)
    this.ctx.save();
    this.ctx.translate(0, 56);
    this.renderContent(this.ctx, w, h - 56);
    this.ctx.restore();
    this._texture.needsUpdate = true;
  }

  // [贴到吸附位] - 设置位置 + 旋转 (面向内 / 面上)
  attachTo(position) {
    this.attachedPosition = position;
    this.mesh.position.set(position.x, position.y, position.z);
    // 垂直面朝内,水平面朝上
    if (this.side === 'left') {
      this.mesh.rotation.y = Math.PI / 2;
    } else if (this.side === 'right') {
      this.mesh.rotation.y = -Math.PI / 2;
    } else if (this.side === 'top') {
      this.mesh.rotation.x = -Math.PI / 2;
    } else if (this.side === 'bottom') {
      this.mesh.rotation.x = Math.PI / 2;
    }
  }

  // [销毁] - 释放 GPU 资源
  destroy() {
    if (this.plane.geometry) this.plane.geometry.dispose();
    if (this.plane.material) {
      if (this.plane.material.map) this.plane.material.map.dispose();
      this.plane.material.dispose();
    }
  }

  // [获取吸附盒边界] - 80px 范围内,节点拖近时吸附
  getSnapBox() {
    // 框架边缘外扩 80 像素
    const w = this.width;
    const h = this.height;
    return {
      side: this.side,
      width: w + 160,
      height: h + 160,
    };
  }
}