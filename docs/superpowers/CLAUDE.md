# docs/superpowers/
> L2 文档 - 父级: ../../CLAUDE.md

## 成员清单
- `specs/` - 设计 spec 目录,每个重大决策一份(命名前缀 YYYY-MM-DD-<topic>-design.md)
- `plans/` - 实施 plan 目录,每个 spec 转一份可执行 plan(命名前缀 YYYY-MM-DD-<feature>.md)
- `backlog.md` - Fable5 任务队列,由 AI agent 自动维护(In Progress / Up Next / Done)

## 引用原则
- spec 是"为什么这么做",plan 是"具体怎么做"
- 任何 spec 重大修改前必须先在 docs/superpowers/specs/ 下建立新版本,而不是直接改旧 spec
- backlog.md 的每次变更后,需 grep 整个仓库确认无引用了已删 task id

[PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
