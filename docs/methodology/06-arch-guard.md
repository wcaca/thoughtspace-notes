# 方法 06 · 架构守卫

> **TL;DR**:
> 1. **CI 跑依赖巡航** — dependency-cruiser 守住分层
> 2. **架构约束写在代码外** — 配置文件 + 守卫脚本
> 3. **测试守住行为** — Vitest 守住单元,e2e 守住集成
> 4. **零越层 + 零回归** — 提交前必跑

## §1 为什么要 CI 守卫

**反模式**:靠"代码评审"发现架构破坏 → 评审者疲劳 / 漏掉。

**架构守卫**:把约束写成规则,CI 自动跑,**机器不疲劳**。

## §2 流程

```
代码改动
  ↓
git commit (触发 pre-commit hook)
  ↓
1. check-arch.mjs  → 零越层
2. check-geb.mjs    → L2/L3 注释完整
3. vitest run       → 零回归
  ↓
全部通过 → 允许 commit
失败 → 阻止 commit
```

## §3 dependency-cruiser 配置

```javascript
// dependency-cruiser.config.mjs
export default {
  forbidden: [
    {
      name: 'core-not-import-render',
      from: { path: '^src/core' },
      to: { path: '^src/render' }
    }
  ]
};
```

```bash
# CI 命令
npx depcruise src --no-config --validate '{"forbidden":[...]}'
```

## §4 测试金字塔

```
       ┌──────────┐
       │  E2E     │  ← 慢,少,跨模块
       ├──────────┤
       │ 集成测试 │  ← 中速,跨模块装配
       ├──────────┤
       │ 单元测试 │  ← 快,多,单模块
       └──────────┘
```

| 层 | 数量 | 速度 | 范围 |
|---|---|---|---|
| 单元 | 多(几百) | 快(<10ms) | 单函数 / 单模块 |
| 集成 | 中(几十) | 中(<100ms) | 跨模块装配 |
| E2E | 少(<10) | 慢(>1s) | 完整流程 |

## §5 pre-commit hook

```bash
# scripts/hooks/pre-commit
#!/usr/bin/env bash
set -e
node scripts/check-arch.mjs
node scripts/check-geb.mjs
npx vitest run --reporter=basic
```

## §6 健康指标

| 指标 | 健康范围 | 我们的当前 |
|---|---|---|
| 测试总数 | 持续增长 | 506 ✅ |
| 测试通过率 | 100% | 100% ✅ |
| 架构越层 | 0 | 0 ✅ |
| 模块数 | 稳步增长 | 74 ✅ |
| L2/L3 注释完整 | 100% | 100% ✅ |

## §7 与其他方法的关系

| 上游 | 下游 |
|---|---|
| **02 spec 驱动** | 06 — 改动前查拓扑表 |
| 04 按需笔记 | 06 — 注释链向陷阱 |
| 06 | **05 系统调试** — 测试失败时 |

## §8 我们的实践

- [scripts/check-arch.mjs](../scripts/check-arch.mjs) — 架构守卫
- [scripts/check-geb.mjs](../scripts/check-geb.mjs) — GEB 守卫
- [dependency-cruiser.config.mjs](../dependency-cruiser.config.mjs) — 配置

---

[PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md