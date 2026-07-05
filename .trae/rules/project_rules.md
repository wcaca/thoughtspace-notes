# TRAE 项目规则:thoughtspace-notes

> L3 项目规则 - 父级: ../CLAUDE.md(L1 宪法)
> 本文件供 TRAE 直接加载,凡 AI 助手在本项目工作时必须遵守。

## 强制约束(来自 L1)

### 架构(来自 L1 "不可违反的架构约束")
1. `src/core/**` 禁止 import 任何渲染库(pixi.js)
2. `src/core/**` 禁止 import `src/{render, ui, persistence, sim}` 任何模块
3. `src/sim/**` 禁止 import `src/{render, ui}` 任何模块
4. Yjs 文档是唯一权威数据源,SQLite/IndexedDB 只是镜像/索引

### 文档(来自 L1 GEB 协议)
5. 修改代码时:改完必更新该文件的 L3 头部(INPUT/OUTPUT/POS/PROTOCOL)
6. 修改目录时:增/删文件必更新所在目录的 CLAUDE.md 成员清单
7. 修改顶层结构时:必同步 L1(CLAUDE.md)
8. 新建目录时:必创建该目录的 CLAUDE.md(L2)

### 产品(来自 L1 产品灵魂)
9. 不做数值化等级/积分(违背产品灵魂)
10. AI 自动化建议必须以"半透明预览"形式呈现
11. 笔记内容默认不上云

## 工作流(来自 L1 WORKFLOW)
12. 每次代码变更前必跑:`npm run check:arch && npm test`(若已安装)
13. 每次 commit 前 L3 → L2 → L1 三层回环检查
14. commit message 必须含 `spec-id: ...` 与 `task-id: ...` 字段

## 异常处理(来自 L1 FORBIDDEN + Part 9)
15. FATAL-001 孤立代码变更:回滚
16. FATAL-005 架构约束违反:立即中止 + revert + 报用户

## 输出风格(来自 L1 PROTOCOL)
- 思考: 英文
- 交互: 中文(用户输入语言)
- 注释: 中文 + ASCII 分块

[PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
