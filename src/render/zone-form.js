/**
 * [INPUT]: zoneStore / zoneMesh / thoughtById / callbacks / onRenderList
 * [OUTPUT]: createZoneForm({ zoneStore, zoneMesh, thoughtById, callbacks, onRenderList }) → { el, reset, startEdit }
 * [POS]: src/render/zone-form.js — 分区表单子模块;新建 / 编辑表单 DOM + 输入验证 + 提交回调
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */

const PRESET_COLORS = [
  '#7fe0c9', '#e8a865', '#e87aa8', '#9b8cf2', '#7fb6e8',
  '#a3e87f', '#e8e87f', '#e87f7f', '#c47fe8', '#7fe8e0'
];

const PRESET_SIZES = [
  { label: '小(80)', radius: 80 },
  { label: '中(150)', radius: 150 },
  { label: '大(240)', radius: 240 },
  { label: '超大(400)', radius: 400 }
];

/**
 * @typedef {Object} ZoneCallbacks
 * @property {(zone: any) => void} [onCreate]
 * @property {() => void} [onChange]
 * @property {(id: string, patch: any) => void} [onUpdate]
 * @property {(id: string) => void} [onRemove]
 * @property {(id: string) => void} [onJump]
 * @property {() => any[]} [getSelectedThoughts]
 */

/**
 * 构建分区表单(新建 / 编辑),并装配提交 / 取消 / 编辑回调。
 * @param {{zoneStore: any, zoneMesh: any, thoughtById: any, callbacks?: ZoneCallbacks, onRenderList: () => void}} opts
 * @returns {{el: HTMLElement, reset: () => void, startEdit: (zone: any) => void}}
 */
export function createZoneForm({ zoneStore, zoneMesh, thoughtById, callbacks = {}, onRenderList }) {
  const form = document.createElement('div');
  form.className = 'zp-form';

  // name row
  const nameRow = document.createElement('div');
  nameRow.className = 'zp-form-row';
  const nameLabel = document.createElement('div');
  nameLabel.className = 'zp-label';
  nameLabel.textContent = '名称';
  const nameInput = document.createElement('input');
  nameInput.className = 'zp-input';
  nameInput.type = 'text';
  nameInput.placeholder = '如:工作 / 灵感 / 情感';
  nameInput.maxLength = 24;
  nameRow.appendChild(nameLabel);
  nameRow.appendChild(nameInput);
  form.appendChild(nameRow);

  // color row
  const colorRow = document.createElement('div');
  colorRow.className = 'zp-form-row';
  const colorLabel = document.createElement('div');
  colorLabel.className = 'zp-label';
  colorLabel.textContent = '颜色';
  const colorSwatches = document.createElement('div');
  colorSwatches.className = 'zp-color-row';
  let selectedColor = PRESET_COLORS[0];
  for (const c of PRESET_COLORS) {
    const sw = document.createElement('button');
    sw.className = 'zp-color-swatch';
    sw.style.background = c;
    sw.style.color = c;
    sw.title = c;
    if (c === selectedColor) sw.classList.add('is-on');
    sw.addEventListener('click', () => {
      selectedColor = c;
      colorSwatches.querySelectorAll('.zp-color-swatch').forEach((x) => x.classList.remove('is-on'));
      sw.classList.add('is-on');
    });
    colorSwatches.appendChild(sw);
  }
  colorRow.appendChild(colorLabel);
  colorRow.appendChild(colorSwatches);
  form.appendChild(colorRow);

  // size + center row
  const sizeRow = document.createElement('div');
  sizeRow.className = 'zp-form-row';
  const sizeLabel = document.createElement('div');
  sizeLabel.className = 'zp-label';
  sizeLabel.textContent = '半径';
  const sizeSelect = document.createElement('select');
  sizeSelect.className = 'zp-select';
  for (const p of PRESET_SIZES) {
    const opt = document.createElement('option');
    opt.value = String(p.radius);
    opt.textContent = p.label;
    sizeSelect.appendChild(opt);
  }
  sizeSelect.value = String(150);
  sizeRow.appendChild(sizeLabel);
  sizeRow.appendChild(sizeSelect);
  form.appendChild(sizeRow);

  // description row
  const descRow = document.createElement('div');
  descRow.className = 'zp-form-row';
  const descLabel = document.createElement('div');
  descLabel.className = 'zp-label';
  descLabel.textContent = '备注';
  const descInput = document.createElement('input');
  descInput.className = 'zp-input';
  descInput.type = 'text';
  descInput.placeholder = '可选 · 描述分区用途';
  descInput.maxLength = 50;
  descRow.appendChild(descLabel);
  descRow.appendChild(descInput);
  form.appendChild(descRow);

  // actions
  const formActions = document.createElement('div');
  formActions.className = 'zp-form-actions';
  const createBtn = document.createElement('button');
  createBtn.className = 'zp-btn zp-btn-primary';
  createBtn.textContent = '在原点创建';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'zp-btn zp-btn-secondary';
  cancelBtn.textContent = '在选中念头附近';
  formActions.appendChild(createBtn);
  formActions.appendChild(cancelBtn);
  form.appendChild(formActions);

  function resetForm() {
    nameInput.value = '';
    descInput.value = '';
    sizeSelect.value = '150';
    selectedColor = PRESET_COLORS[0];
    colorSwatches.querySelectorAll('.zp-color-swatch').forEach((x, i) => x.classList.toggle('is-on', i === 0));
  }

  /** 进入编辑模式:回填表单并改写按钮文案 / 行为 */
  function startEdit(zone) {
    nameInput.value = zone.name;
    descInput.value = zone.description || '';
    sizeSelect.value = String(zone.radius);
    selectedColor = zone.color;
    colorSwatches.querySelectorAll('.zp-color-swatch').forEach((x) => {
      x.classList.toggle('is-on', /** @type {HTMLElement} */(x).style.background === selectedColor || x.getAttribute('title') === selectedColor);
    });
    createBtn.textContent = '保存修改';
    cancelBtn.textContent = '取消编辑';
    const originalId = zone.id;

    function cleanup() {
      createBtn.removeEventListener('click', onSave);
      cancelBtn.removeEventListener('click', onCancel);
      createBtn.textContent = '在原点创建';
      cancelBtn.textContent = '在选中念头附近';
    }
    function onSave() {
      const patch = {
        name: nameInput.value.trim() || zone.name,
        color: selectedColor,
        radius: parseInt(sizeSelect.value, 10),
        description: descInput.value.trim()
      };
      if (callbacks.onUpdate) callbacks.onUpdate(originalId, patch);
      else zoneStore.update(originalId, patch);
      zoneMesh.updateZone(zoneStore.get(originalId));
      if (callbacks.onChange) callbacks.onChange();
      resetForm();
      cleanup();
      onRenderList();
    }
    function onCancel() {
      resetForm();
      cleanup();
    }
    createBtn.addEventListener('click', onSave);
    cancelBtn.addEventListener('click', onCancel);
  }

  // 创建按钮处理(新建模式)
  createBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      nameInput.style.borderColor = 'rgba(232,122,168,0.6)';
      setTimeout(() => { nameInput.style.borderColor = ''; }, 1200);
      return;
    }
    const zone = zoneStore.add({
      name,
      color: selectedColor,
      center: { x: 0, y: 0, z: 0 },
      radius: parseInt(sizeSelect.value, 10),
      description: descInput.value.trim()
    });
    if (callbacks.onCreate) callbacks.onCreate(zone);
    zoneMesh.updateZone(zone);
    if (callbacks.onChange) callbacks.onChange();
    resetForm();
    onRenderList();
  });

  cancelBtn.addEventListener('click', () => {
    const selected = callbacks.getSelectedThoughts ? callbacks.getSelectedThoughts() : [];
    const name = nameInput.value.trim() || `分区 ${zoneStore.size() + 1}`;
    let center = { x: 0, y: 0, z: 0 };
    if (selected.length > 0) {
      const cx = selected.reduce((s, t) => ({ x: s.x + (t.x || 0), y: s.y + (t.y || 0), z: s.z + (t.z || 0) }), { x: 0, y: 0, z: 0 });
      center = { x: cx.x / selected.length, y: cx.y / selected.length, z: cx.z / selected.length };
    } else {
      // 用所有念头中心
      if (thoughtById.size > 0) {
        const cx = Array.from(thoughtById.values()).reduce((s, t) => ({ x: s.x + (t.x || 0), y: s.y + (t.y || 0), z: s.z + (t.z || 0) }), { x: 0, y: 0, z: 0 });
        center = { x: cx.x / thoughtById.size, y: cx.y / thoughtById.size, z: cx.z / thoughtById.size };
      }
    }
    const zone = zoneStore.add({
      name,
      color: selectedColor,
      center,
      radius: parseInt(sizeSelect.value, 10),
      description: descInput.value.trim()
    });
    if (callbacks.onCreate) callbacks.onCreate(zone);
    zoneMesh.updateZone(zone);
    if (callbacks.onChange) callbacks.onChange();
    selectedColor = PRESET_COLORS[0];
    colorSwatches.querySelectorAll('.zp-color-swatch').forEach((x, i) => x.classList.toggle('is-on', i === 0));
    onRenderList();
  });

  return { el: form, reset: resetForm, startEdit };
}
