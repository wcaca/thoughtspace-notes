# persistence/
> L2 | 父级: src/v2/CLAUDE.md

L0持久化层（Yjs CRDT + IndexedDB + 同步层）。

## 成员清单
yjs-store.js: Yjs CRDT存储
thought-bridge.js: 念头桥接（Y.Map嵌套Y类型，观察者分发）
layer-bridge.js: 层桥接（含mark-system实例持久化）
relation-bridge.js: 关系桥接
rule-bridge.js: 规则桥接
content-bridge.js: 内容格式桥接
undo-manager.js: 撤销管理（追踪8个Y.Map，captureTimeout=100ms）
exporter.js: 导出
importer.js: 导入
clipboard.js: 剪贴板代码中转
sync/websocket-provider.js: WebSocket同步
sync/server-config.js: 服务器配置

[PROTOCOL]: 变更时更新此头部,然后检查 src/v2/CLAUDE.md
