/**
 * [INPUT]: registry.js + source-chain.js + variant.js + kill-switch.js
 * [OUTPUT]: 公开 API: isOn(name, ctx), getVariant(name, ctx), setOverride(name, value), killSwitch
 * [POS]: src/runtime/flags/index.js
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */
import { FLAG_REGISTRY, getFlagDef, listFlags } from './registry.js';
import { resolve, setOverride, clearOverride, listOverrides } from './source-chain.js';
import { resolveVariant } from './variant.js';
import { killSwitch } from './kill-switch.js';

export class FlagNotDeclaredError extends Error {
  constructor(name) {
    super(`Feature flag "${name}" 未在 spec frontmatter 的 flags: 字段中声明。`);
    this.name = 'FlagNotDeclaredError';
    this.flagName = name;
  }
}

function defaultContext() {
  return { bucket: 0, userId: null, now: Date.now() };
}

function evalGate(name, def, ctx) {
  if (def.kill_switch && killSwitch.isTripped(def.kill_switch)) return false;
  if (Array.isArray(def.depends_on) && def.depends_on.length > 0) {
    for (const dep of def.depends_on) {
      if (!isOn(dep, ctx)) return false;
    }
  }
  if (Array.isArray(def.conflicts_with) && def.conflicts_with.length > 0) {
    for (const c of def.conflicts_with) {
      if (isOn(c, ctx)) return false;
    }
  }
  return true;
}

export function isOn(name, ctx = defaultContext()) {
  const def = getFlagDef(name);
  if (!def) throw new FlagNotDeclaredError(name);
  if (!evalGate(name, def, ctx)) return false;
  const { value: raw } = resolve(name, def);
  if (def.type === 'boolean') return raw === true;
  if (def.type === 'number') return raw !== 0;
  if (def.type === 'enum') return raw !== def.default;
  return Boolean(raw);
}

export function getVariant(name, ctx = defaultContext()) {
  const def = getFlagDef(name);
  if (!def) throw new FlagNotDeclaredError(name);
  if (!evalGate(name, def, ctx)) return def.default;
  const resolved = resolve(name, def);
  if (resolved.explicit) return resolved.value;
  return resolveVariant(def, resolved.value, ctx);
}

export function listEnabledFlags(ctx = defaultContext()) {
  return listFlags().filter((n) => {
    try { return isOn(n, ctx); } catch { return false; }
  });
}

export const _internal = Object.freeze({
  registry: FLAG_REGISTRY,
  setOverride,
  clearOverride,
  listOverrides,
  killSwitch,
});

export { setOverride, clearOverride, killSwitch };

export default Object.freeze({
  isOn,
  getVariant,
  setOverride,
  clearOverride,
  listEnabledFlags,
  listFlags,
  killSwitch,
  FlagNotDeclaredError,
});