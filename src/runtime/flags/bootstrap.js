/**
 * [INPUT]: registry.js + index.js + src/core/shape-resolver.js
 * [OUTPUT]: 一次性把 flag resolver 注入到 shape-resolver,触发 flag 治理
 * [POS]: src/runtime/flags/bootstrap.js
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */
import { getVariant } from './index.js';
import { setShapeFlagResolver } from '../../core/shape-resolver.js';

let bootstrapped = false;

export function bootstrapFlags() {
  if (bootstrapped) return;
  setShapeFlagResolver(getVariant);
  bootstrapped = true;
}