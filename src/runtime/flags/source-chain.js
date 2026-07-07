/**
 * [INPUT]: registry.js (default 字段) + override 来源(URL/localStorage/test/记忆)
 * [OUTPUT]: 4 层 source chain resolve(name) → raw value
 * [POS]: src/runtime/flags/source-chain.js
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */

const FLAG_PREFIX_URL = '__flag__';
const FLAG_PREFIX_LS = 'tsn.flag.';
const memoryOverrides = new Map();

function safeReadLocalStorage() {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage && typeof globalThis.localStorage.getItem === 'function') {
      return globalThis.localStorage;
    }
  } catch {}
  return null;
}

function safeReadURL() {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.location && globalThis.location.search) {
      return new URLSearchParams(globalThis.location.search);
    }
  } catch {}
  return null;
}

export function setOverride(name, value) {
  memoryOverrides.set(name, value);
}

export function clearOverride(name) {
  if (name) memoryOverrides.delete(name);
  else memoryOverrides.clear();
}

export function listOverrides() {
  return [...memoryOverrides.entries()];
}

export function resolve(name, def) {
  if (memoryOverrides.has(name)) {
    return { value: memoryOverrides.get(name), source: 'memory/test', explicit: true };
  }

  const ls = safeReadLocalStorage();
  if (ls) {
    const raw = ls.getItem(FLAG_PREFIX_LS + name);
    if (raw !== null) {
      try {
        return { value: coerceType(raw, def.type, def.values), source: 'localStorage' };
      } catch {}
    }
  }

  const params = safeReadURL();
  if (params) {
    const raw = params.get(FLAG_PREFIX_URL + name);
    if (raw !== null) {
      try {
        return { value: coerceType(raw, def.type, def.values), source: 'URL' };
      } catch {}
    }
  }

  return { value: def.default, source: 'registry.default' };
}

function coerceType(raw, type, values) {
  if (type === 'boolean') {
    if (raw === 'true' || raw === '1') return true;
    if (raw === 'false' || raw === '0') return false;
    throw new Error(`无法将 ${raw} 转为 boolean`);
  }
  if (type === 'number') {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`无法将 ${raw} 转为 number`);
    return n;
  }
  if (type === 'enum') {
    if (!Array.isArray(values)) throw new Error('enum 类型必须提供 values');
    if (!values.includes(raw)) {
      throw new Error(`enum 值 ${raw} 不在 values 列表内: ${values.join(',')}`);
    }
    return raw;
  }
  if (type === 'json') {
    return JSON.parse(raw);
  }
  return raw;
}