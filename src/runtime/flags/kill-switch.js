/**
 * [INPUT]: registry.js (kill_switch 字段)
 * [OUTPUT]: 紧急熔断:任何 flag 的 kill_switch 命中时,isOn 一律返回 false
 * [POS]: src/runtime/flags/kill-switch.js
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */

const tripped = new Set();

export const killSwitch = Object.freeze({
  trip(name) {
    if (typeof name !== 'string' || !name.startsWith('KILL_')) {
      throw new Error(`kill_switch 名称必须以 KILL_ 开头,收到: ${name}`);
    }
    tripped.add(name);
  },

  reset(name) {
    if (name) tripped.delete(name);
    else tripped.clear();
  },

  isTripped(name) {
    return tripped.has(name);
  },

  list() {
    return [...tripped];
  },
});