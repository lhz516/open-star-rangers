---
type: plan
status: active
phase: P3
task: "09"
subtask: "31"
updated: 2026-10-14
---

# 31 — 文档与注释的后续同步（修复）

**契约来源：** [spec](../spec.md) 的 S-12、AC-16；goal 执行记录中“26 已集成”的遗留项与“22 已集成”后 22 提出的文档建议。
**依赖：** 22, 26。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 22 引入的测试支持与观察途径：[源码结构指南](../../../../engineering/source-structure.md)（约第 486 行，任务画面证据也经 `e2e/support/map-warp.ts` 以 React fiber 只读读取任务 UI store）；[工程指南](../../../../engineering/README.md)的“观察”（约第 186 行，加入 `map-warp.ts`）与约第 177 行（`missionPackage()` 的合成玩家现在可以完成 Warp）；[original-data 模块分册](../../../../engineering/modules/original-data.md)（约第 152 行，`productionCraftInfo()` 玩家记录的能量与 Warp 字段）。逐条对照代码核实后再写。
- `src/core/systems/area.ts` 第 13 行附近的模块注释仍说玩家 Warp 期间的区域中心“在标记处接入”，实际已由 `rules/active-area.ts` 的 `activeAreaCentre` 实现：更正注释，不改行为。

## 不包含

- 新的规则或测试行为。

## 关键文件与契约

- 22、26 的完成证据；goal 执行记录。

## 写入范围

- `docs/engineering/source-structure.md`、`docs/engineering/README.md`、`docs/engineering/modules/original-data.md`
- `src/core/systems/area.ts`：只改模块注释。

## 验收标准

- [x] 上述文档与代码一致，`updated:` 与链接有效；`pnpm check:compliance` 通过。
- [x] `area.ts` 注释与实现一致，没有行为改动；`pnpm check` 通过。

## 验证方法

- 链接与锚点核对；`pnpm check`；git 审阅。

## 完成证据

- **area.ts：** [area.ts](../../../../../src/core/systems/area.ts) 的模块注释不再说玩家 Warp 期间的区域中心“在标记处接入”，改为指出中心（玩家在 Warp 中时为 Warp 目的地）取自 [active-area.ts](../../../../../src/core/rules/active-area.ts) 的 `activeAreaCentre`；它已由 `checkActiveArea` 与 `spawn.ts` 调用。只改注释，P3-10 的基地报告仍在标记处接入。
- **文档：** [源码结构指南](../../../../engineering/source-structure.md)的 `e2e/support/` 条补 `map-warp.ts` 经 React fiber 只读读取任务 UI store（只调 `getState`/`subscribe`）；[工程指南](../../../../engineering/README.md)的 `missionPackage()` 段注明它与 `worker=mission-startable` 同一场景作业、规则数据取 `productionRuleData()` 的缺省内容、合成玩家可完成一次 Warp（核对链：`production-cache.ts` → `import-scenarios.test-support.ts` → `synthetic-import.test-support.ts` 的 `sliceCoveredFiles` → `productionRuleData()`），“观察”条补 `devState` 的 `viewMode`/`previousViewMode` 与 `map-warp.ts`；[original-data 模块分册](../../../../engineering/modules/original-data.md#规则数据转换)补 `productionCraftInfo()` 的改动字段（+0x0C、炮 +0x14、玩家挂点 1 的交替链接 +0x1C、+0x54 能量上限 100000、成本对 {1000, 10}、+0xA8 基准 14）。三份文档 `updated:` 已为 2026-10-14。
- **检查：** `pnpm check:compliance` 通过（`passed: true`，无 findings）；`pnpm check` 通过（Vitest 299 个文件 8892 个、lint、typecheck、构建）；三份文档的相对链接与锚点脚本核对 0 个失效。
- **rubber-duck：** 无阻塞；一项采纳：+0xA8 是 Warp 过程的基准长度，`transitLength` 按距离缩放为其 0.5–1 倍（[warp-path.ts](../../../../../src/core/rules/warp-path.ts)），两处措辞由“14 s 的 Warp 过程”改为基准 14、按距离缩放。
- **文档影响：** 即本子任务内容；STATUS、`tasks.md` 无需改动。
