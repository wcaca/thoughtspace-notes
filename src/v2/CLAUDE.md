# v2/
> L2 | 父级: /CLAUDE.md

v2新实现根目录，基于空间交互设计.md的全新实现，与v1通过feature flag并存。

## 成员清单
- `main.js` — v2应用入口，被index.html的bootstrap脚本动态加载（?v2=true时）

## 子目录（各自有CLAUDE.md管理成员清单）
- core/ — L1领域核心层（纯逻辑，无渲染），念头/记忆/层/关系/规则/标签/坐标/内容格式
- persistence/ — L0持久化层（Yjs CRDT + IndexedDB + 同步层）
- render/ — L2渲染层（Three.js），晶体空间、层、念头体、相变动画、扭曲投影
- interaction/ — L3交互层，手势识别、菜单、拖拽、多选、搜索、撤销
- platform/ — L4平台适配层，手机/平板手势适配、响应式布局
- server/ — 服务端，同步+AI服务+多设备

[PROTOCOL]: 变更时更新此头部,然后检查 /CLAUDE.md
