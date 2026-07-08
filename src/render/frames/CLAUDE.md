# src/render/frames/
> L2 文档 - 父级: ../CLAUDE.md

## 成员清单

- `note-frame.js`: 左侧 Note 列表框架 (x=-160 垂直面) — 4 条 Note 标题 + 摘要 + 温度条 + 高亮
- `status-frame.js`: 顶部状态框架 (y=+110 水平面) — 今天/本周/本月/总计 念头数 + 进度条
- `detail-frame.js`: 右侧详情框架 (x=+160 垂直面) — 选中 Note 全文(标题/质量/温度/内容)
- `action-frame.js`: 底部操作框架 (y=-110 水平面) — 缩放指示 + 模式切换(观察/整理/静观) + 手动创建按钮

所有框架继承自 [Frame 基类](../frame.js),通过 Plane + CanvasTexture 渲染。

> L3 头部契约: 4 个 frame 文件均已补充 [INPUT]/[OUTPUT]/[POS]/[PROTOCOL] 四字段 (2026-07-08 governance 修复)。

[PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md