# persistence/
> L2 | 父级: ../CLAUDE.md

L0持久化层（Yjs CRDT + IndexedDB + 同步层）。

## 成员清单
- `layer-bridge.js` — 层配置持久化桥接（Yjs CRDT双向同步，origin='layer-bridge'便于UndoManager追踪）

## 待创建（后续阶段）
yjs-store.js / thought-bridge.js / relation-bridge.js / rule-bridge.js / content-bridge.js / undo-manager.js / exporter.js / importer.js / clipboard.js / sync/websocket-provider.js / sync/server-config.js

[PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
