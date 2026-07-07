# Tasks

- [x] Task 1: 实现 FATAL-001 机器检测(check-geb.mjs 加 git diff 交叉验证)
  - [x] SubTask 1.1: 在 check-geb.mjs 加 `git diff --name-only HEAD` 获取变更文件列表
  - [x] SubTask 1.2: 对变更的 .js 文件,检查 L3 头部是否同步修改(行变更 ≥3 但头部未变 → FATAL-001)
  - [x] SubTask 1.3: 对新增/删除的 .js 文件,检查所在目录 CLAUDE.md 是否同步修改(未改 → FATAL-004)
  - [x] SubTask 1.4: 跑 check:geb 验证不误报现有代码

- [x] Task 2: 实现 FATAL-005 自检(check-geb.mjs 加 depcruise 规则名校验)
  - [x] SubTask 2.1: 读 dependency-cruiser.config.mjs 提取所有 rule name
  - [x] SubTask 2.2: 读 CLAUDE.md §ARCHITECTURE 段提取声明的约束
  - [x] SubTask 2.3: 比对两组,不一致 → FATAL-005 自检失败

- [x] Task 3: dep-cruiser 规则 4 重命名 + 加反向规则
  - [x] SubTask 3.1: dependency-cruiser.config.mjs 规则 4 从 `runtime-no-core` 改为 `core-no-runtime`
  - [x] SubTask 3.2: 加新规则 `runtime-no-core-entity`: from src/runtime to src/core(禁止 runtime 直接 import core 实体)
  - [x] SubTask 3.3: 跑 check:arch 验证不误报

- [x] Task 4: install-hooks mtime diff 提示
  - [x] SubTask 4.1: install-hooks.mjs 加 fs.statSync 比较 SOURCE 与 .git/hooks/pre-commit 的 mtime
  - [x] SubTask 4.2: mtime 相同 → 打印"hooks 已最新";SOURCE 更新 → 打印"hooks 已更新";.git/hooks 更新 → 打印"hooks 比 SOURCE 新(异常)"

- [x] Task 5: check-geb 反向 fixture 测试
  - [x] SubTask 5.1: 新建 tests/scripts/check-geb.test.mjs
  - [x] SubTask 5.2: 构造临时坏文件(缺 [INPUT] 头部)→ 断言 check-geb exit 1
  - [x] SubTask 5.3: 构造临时目录(无 CLAUDE.md)→ 断言 check-geb exit 1
  - [x] SubTask 5.4: 跑 npm test 验证通过

- [x] Task 6: L1-9 数值化等级 FATAL 守卫
  - [x] SubTask 6.1: check-non-negotiable.mjs 新增 GUARD:Grep src/core/**/*.js 禁止 `userLevel|userExp|points|gradeTier|expPoints`
  - [x] SubTask 6.2: 跑 check:non-negotiable 验证现有代码通过
  - [x] SubTask 6.3: 构造临时违规文件验证 FATAL 触发

- [x] Task 7: 来源锚定 — createThought 加 source 字段
  - [x] SubTask 7.1: src/core/thought.js 的 createThought 加 `source: { type: 'manual'|'voice'|'import'|'copilot-suggest', ref?: string }` 默认 { type: 'manual' }
  - [x] SubTask 7.2: src/persistence/thought-bridge.js 同步 source 字段到 Y.Map
  - [x] SubTask 7.3: src/render/detail-panel.js 展示 source 信息(小图标 + 文字)
  - [x] SubTask 7.4: src/render/quick-add.js 创建念头时传 source.type = 'manual'
  - [x] SubTask 7.5: src/render/voice-capture.js 创建念头时传 source.type = 'voice'
  - [x] SubTask 7.6: tests/core/thought.test.js 加 source 字段测试

- [x] Task 8: 拆分 observe-views.js(714 行 → ≤300 行 × 3 文件)
  - [x] SubTask 8.1: 提取状态管理到 observe-state.js(排序轴 / 层 / 模式状态)
  - [x] SubTask 8.2: 提取渲染逻辑到 observe-render.js(卡片/看板/时间线 DOM 生成)
  - [x] SubTask 8.3: observe-views.js 保留为入口 + 事件绑定 + fireReorder
  - [x] SubTask 8.4: 更新 src/render/CLAUDE.md 成员清单
  - [x] SubTask 8.5: 跑 tests/render/observe-views.test.js 验证通过

- [x] Task 9: 拆分 zone-panel.js(474 行 → ≤300 行 × 2 文件)
  - [x] SubTask 9.1: 提取表单逻辑到 zone-form.js(新建/编辑表单)
  - [x] SubTask 9.2: zone-panel.js 保留列表 + 入口
  - [x] SubTask 9.3: 更新 src/render/CLAUDE.md
  - [x] SubTask 9.4: 跑测试验证

- [x] Task 10: 拆分 detail-panel.js(473 行 → ≤300 行 × 2 文件)
  - [x] SubTask 10.1: 提取 markdown 渲染到 detail-markdown.js
  - [x] SubTask 10.2: detail-panel.js 保留面板结构 + 字段编辑
  - [x] SubTask 10.3: 更新 src/render/CLAUDE.md
  - [x] SubTask 10.4: 跑测试验证

- [x] Task 11: 拆分 main.js(357 行 → ≤300 行 × 2 文件)
  - [x] SubTask 11.1: 提取 bootstrap 序列到 bootstrap.js(initPersistence / scene / camera / 模块实例化)
  - [x] SubTask 11.2: main.js 保留事件绑定 + window.__sp1State 暴露
  - [x] SubTask 11.3: 跑测试验证

- [x] Task 12: 拆分 copilot-panel.js(337 行 → ≤300 行 × 2 文件)
  - [x] SubTask 12.1: 提取预览渲染到 copilot-preview.js(.cp-preview 卡片生成)
  - [x] SubTask 12.2: copilot-panel.js 保留面板结构 + 事件
  - [x] SubTask 12.3: 更新 src/render/CLAUDE.md
  - [x] SubTask 12.4: 跑测试验证

- [x] Task 13: 全量验证 + 后台常驻治理设置
  - [x] SubTask 13.1: 跑 npm run check:all 全绿(13 道门禁 + 535 测试通过)
  - [x] SubTask 13.2: 跑 npm test 全绿(535/535)
  - [x] SubTask 13.3: 用 Schedule 工具创建每日定时治理任务(每日 09:00 北京时间)
  - [x] SubTask 13.4: 更新 L2 CLAUDE.md 文档同步所有拆分变更

# Task Dependencies

- [Task 5] depends on [Task 1] (check-geb 测试需要 FATAL-001 实现后才有意义)
- [Task 8-12] 互相独立,可并行
- [Task 13] depends on [Task 1-12] 全部完成
- [Task 7] 独立于 [Task 1-6],可并行
- [Task 1-6] 互相独立,可并行
