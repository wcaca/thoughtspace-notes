# src/persistence/
> L2 文档 - 父级: ../CLAUDE.md

## 成员清单

### 数据源与基础
- `yjs-store.js`: Yjs Doc + IndexedDB 持久化 + UndoManager，唯一权威数据源
- `undo-manager.js`: 应用层 UndoManager 包装；trackOrigins 只放 bridge / importer

### Bridge 双向镜像（内存 ↔ Y.Map）
- `thought-bridge.js`: memory thought Map ↔ Y.Map('thoughts') 双向镜像桥
- `edge-bridge.js`: edgeStore (内存态) 与 Y.Map('edges') (权威源) 双向镜像桥
- `zone-bridge.js`: memory zone store ↔ Y.Map('zones') 双向镜像桥
- `crystal-bridge.js`: memory crystals Array ↔ Y.Map('crystals') 双向镜像桥
- `action-bridge.js`: memory action Map ↔ Y.Map('actions') 双向镜像桥
- `note-bridge.js`: Note Yjs 桥接 / `getNotesMap` + `loadSeedIfEmpty` + `addNote`（Note 的持久化层）

### 导入导出与完整性
- `exporter.js`: 把内存/持久化形态转换成可保存 / 可分享的可移植格式
- `importer.js`: 把 JSON payload 推回 Yjs；保护原数据不被 schema 错误污染
- `integrity.js`: 长期可用性防线：扫断链 / 重 id / 强 self-heal

[PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
