# Checklist

## P0 验证

- [x] FATAL-001 机器检测:改 .js 不改 L3 头部时 check:geb 报错 exit 1
- [x] FATAL-001 机器检测:增删 .js 不改 L2 CLAUDE.md 时 check:geb 报错 exit 1
- [x] observe-views.js 拆分后每个文件 ≤300 行
- [x] zone-panel.js 拆分后每个文件 ≤300 行
- [x] detail-panel.js 拆分后每个文件 ≤300 行
- [x] main.js 拆分后每个文件 ≤300 行
- [x] copilot-panel.js 拆分后每个文件 ≤300 行
- [x] createThought 返回的对象包含 source 字段(默认 { type: 'manual' })
- [x] detail-panel 展示 source 信息(图标 + 文字)
- [x] quick-add 创建念头时 source.type = 'manual'
- [x] voice-capture 创建念头时 source.type = 'voice'

## P1 验证

- [x] dep-cruiser 规则 4 名称为 `core-no-runtime`(语义对齐 from core to runtime)
- [x] 新规则 `runtime-no-core-entity` 存在且能拦截 runtime→core 直接 import
- [x] check:geb 包含 FATAL-005 自检(depcruise 规则名 ∈ L1 §ARCHITECTURE 声明)
- [x] install-hooks.mjs 重复跑时打印"已最新"或"已更新"提示
- [x] tests/scripts/check-geb.test.mjs 存在且测试通过
- [x] check-non-negotiable.mjs 包含 L1-9 数值化等级 GUARD
- [x] src/core/ 下出现 userLevel 等字段时 check:non-negotiable 报 FATAL-010

## 拆分后文档同步

- [x] src/render/CLAUDE.md 成员清单包含所有新拆出的文件
- [x] src/main.js 或拆分后的 bootstrap.js L3 头部已更新
- [x] src/core/CLAUDE.md 成员清单 thought.js 描述含 source 字段
- [x] 所有新建文件均有 L3 头部([INPUT]/[OUTPUT]/[POS]/[PROTOCOL])

## 全量门禁

- [x] npm run check:all 全绿(13 道门禁通过)
- [x] npm test 全绿(535/535)
- [x] 无 FATAL 级违规

## 后台常驻治理

- [x] Schedule 定时任务已创建(每日 09:00 北京时间跑 10 道门禁 + holo:report)
- [x] 定时任务 message 包含完整执行指令
