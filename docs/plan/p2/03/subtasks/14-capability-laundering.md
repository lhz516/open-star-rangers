---
type: plan
status: active
phase: P2
task: "03"
subtask: "14"
updated: 2026-10-05
---

# 14 — 补救：经允许模块转手的底层能力

**契约来源：** [spec](../spec.md) 的 S-07、S-13、AC-13、AC-14 与[风险与恢复](../spec.md#风险与恢复)中的“绕过把关”：底层能力只供来源模块自身、测试与 `tools/` 使用，产品代码只能经产品入口取得镜像、文件与封包。来自 [10](./10-final-alignment.md) 第二次最终对齐发现的缺口。
**依赖：** 11。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **缺口：** 边界只判定导入的直接目标。来源族模块、`*.test-support.ts` 与 `tools/` 模块本身被放行，因此 Worker 或转换模块可以经它们再导出或包装的 `openDiscImage`、`openImfatArchive`、`identifySource` 取得底层能力；真实 ESLint 配置对这三类探针都不报告。
- **共用分类：** [original-data-capabilities.ts](../../../../../tools/original-data-capabilities.ts) 改为默认拒绝：
  - 来源族只公开三个模块：产品入口 `open-verified-source.ts`、`verify-source-mappings.ts`（只接受已验证来源句柄）与 `source-catalog.ts`（白名单数据与读取，不携带打开能力）。其他来源族模块，包括 `identify-source.ts` 与今后新增的模块，都只供来源族自身使用。
  - 测试、测试支持与 `tools/` 模块对受检的生产模块（Worker 与 `original-data` 中来源族以外的模块）都是受限目标。
- **执行：** lint 规则与依赖图共用上述分类，消息区分“经产品入口读取”与“生产代码不得依赖测试或工具”。纯类型导入的既有放行不变。
- **测试：** lint 与依赖图 fixture 增加经来源族 barrel、测试支持 barrel 与 `tools/` barrel 转手的拒绝项（再导出与包装函数），以及导入三个公开来源模块的放行项；当前仓库无违规。

## 不包含

- 修改 spec、产品入口的行为或其他层的既有消费者限制。其他层经中间模块到达 `original-data` 已由既有的传递检查拒绝。

## 关键文件与契约

- **修改：** [original-data-capabilities.ts](../../../../../tools/original-data-capabilities.ts)、[eslint.config.js](../../../../../eslint.config.js)、[engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts)、[工程约定](../../../../engineering/README.md)，必要时更新[源码结构](../../../../engineering/source-structure.md)。

## 验收标准

- [ ] AC-14：Worker 与 `original-data` 中来源族以外的模块，经来源族非公开模块、测试支持或 `tools/` 转手取得底层能力时，lint 与依赖图都拒绝；导入三个公开来源模块、错误类型、`DiscPath` 语法检查与来源映射读取，以及纯类型导入，仍然放行。
- [ ] AC-13/S-13：工程约定对能力边界的描述与实际执行一致。
- [ ] `pnpm exec vitest run tools/engineering-boundaries.test.ts`、`pnpm lint`、`pnpm typecheck` 与 `pnpm check` 通过。

## 验证方法

- 扩展边界 fixture；变异检查：把来源族全部公开，或让测试支持与 `tools/` 不再受限，对应测试都失败。
- 不适用 browser-testing 或原版对照。

## 完成证据
