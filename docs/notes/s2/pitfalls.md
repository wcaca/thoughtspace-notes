# S2 易错点记录

> **本文件目标**: 记录 S2 念头实体阶段的**已踩坑/易错点**,防止重蹈覆辙。

---

## v1-stub-revival

**易错点**: v1 → v2 迁移期间, `src/render/instanced-thoughts.js` 被遗漏未迁移
**时间**: 2026-07-08
**症状**: S2.1 实施时,模块解析 `instanced-thoughts` 失败,跑 v2 main.js 直接报 module not found
**修复**: 建 stub 文件占位,头部注释明确"v2 实施后此 stub 退役";S2.6 thought-mesh.js 实施后,此 stub 应被移除 (TODO)
**教训**: 跨阶段迁移时,被遗漏的旧文件不会自动报错,直到新代码主动 import 才暴露;列出"必须迁移/必须删除"清单是迁移阶段硬性流程

---

## TODO: v2 thought-mesh 实施后, 删除 v1 instanced-thoughts.js stub

**触发条件**: src/v2/render/thought-mesh.js 完整上线 (S2.6+ 完成 + S2.8 集成 + 实际使用)
**清理动作**: git rm src/render/instanced-thoughts.js, 同步更新 GEB 文档

---

## dont-throw-on-overrun

**易错点**: S2.10 render-pipeline 帧超预算时 throw 会让 render 半截崩溃
**时间**: 2026-07-11
**症状**: 帧 totalMs > 16ms 时如果 throw,后续 stage 不跑、renderer.render 也不调、UI 出现黑屏
**修复**: 超预算 → ctx.warns 收集 (不 throw) + renderer.render 仍调 + getStats().totalOverruns 暴露;`__v2.renderPipeline.getStats()` 让 AI 看到瓶颈
**教训**: 排查基础组件的"错误"必须是"可观察的",不可是"中断流程的"
