---
type: plan
status: active
phase: P1
task: "02"
subtask: "05"
updated: 2026-10-02
---

# 05 — 完整契约最终对齐

**契约来源：** [spec](../spec.md) 的 S-01 至 S-06、AC-01 至 AC-10，包含“不包含”范围与技术决定 5、7、8。
**依赖：** 01, 02, 03, 04。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 逐条对照已批准的 spec、[goal](../goal.md#验收覆盖) 覆盖表、01–04 的完成证据与实际代码，确认每个 S/AC 都由当前有效的测试或审阅结果支持。
- 重新运行 `pnpm check`，确认 `src/core` 的全部测试与工程边界回归通过，既有测试未被删除或跳过。
- 复核技术决定 7 的 tick/ID 守卫审阅证据仍与最终代码一致。
- 范围检查：
  - 未新增依赖，`package.json` 与 `pnpm-lock.yaml` 未变。
  - 未接入 Runtime、UI、渲染或应用（[App](../../../../../src/app/App.tsx) 未变）。
  - 没有序列化、哈希或存档实现。
  - 未读取原版文件。
- 全部通过后，更新 [STATUS](../../../../STATUS.md#运行骨架) 中“独立 Core”一项的证据链接并勾选。其余运行骨架项与 P1 退出条件保持不变。
- 本项只做验证与文档证据；发现实现缺口时新增修复子任务（新 ID，插在本项之前并加入依赖），不在此实现代码。

## 不包含

- 新功能或行为变更；修改 spec。
- P1 阶段评审；宣称 replay、Runtime 或浏览器集成已完成。
- push、CI 或部署。

## 关键文件与契约

- [spec](../spec.md)、[goal](../goal.md) 与同目录 01–04：契约、覆盖与证据。
- 01–04 交付的 `src/core/` 文件，以及 [STATUS](../../../../STATUS.md)。

## 验收标准

- [x] S-01 至 S-06、AC-01 至 AC-10 都有匹配且当前有效的证据；spec 行为没有增删。
- [x] 最新 `pnpm check` 通过；`src/core` 测试与工程边界回归均运行并通过。
- [x] 技术决定 7 的审阅证据与最终代码一致。
- [x] 范围检查全部通过：无新依赖、无消费者接线、无序列化/存档、无原版读取。
- [x] STATUS 中“独立 Core”一项仅在以上通过后勾选，并链接本子任务证据；其他阶段项不被误勾。

## 验证方法

- `pnpm check`；`git diff` 核对本任务提交范围。
- 逐条审阅 01–04 证据与代码；仅文档变更时检查链接与元数据。
- 无浏览器、实机或原版对照。

## 完成证据

- 2026-10-02：以 `f11d675`（04 的提交）为最后一个实现提交执行最终对齐。
- **工程检查：** `pnpm check` 退出码 0。Vitest 7 文件、143 测试，无失败、跳过或 todo：
  - P1-02 新增：`rng.test.ts` 8、`synthetic-scene.test.ts` 27、`synthetic-scene-step.test.ts` 31、`synthetic-scene-input.test.ts` 28。
  - 既有：`imfat.test.ts` 5、`payloads.test.ts` 16、`engineering-boundaries.test.ts` 28，均未改动。
  - core 类型程序纳入 `src/core/errors.ts`、`rng.ts`、`synthetic-scene.ts`，无 DOM lib 与 Node 声明，诊断为 0；工程边界回归在这三个文件存在时仍通过。
  - 计数用的 Vitest JSON 报告器在仓库内生成了 `.vitest/` 目录，读取后已删除。
- **逐项对齐**（证据均为当前有效的测试或审阅）：

| Spec 项 | 结论与证据 |
|---|---|
| S-01、AC-01 | 唯一入口 `createSyntheticScene`，`Scene` 类不导出；初始状态与默认/显式频率 → [02](./02-scene-contract-and-outputs.md#完成证据) |
| S-02、AC-02 | 每次有效调用推进一个 tick；60/120 Hz 积分误差 ≤ 1e-12 → [03](./03-step-behavior.md#完成证据)；moveX 契约校验 → [04](./04-input-validation-and-guards.md#完成证据) |
| S-03、AC-03、AC-04 | 四种命令情形、拒绝不消耗 RNG/ID、同 tick 顺序决定结果 → [03](./03-step-behavior.md#完成证据) |
| S-04、AC-05 | Mulberry32 KAT 与独立参考 → [01](./01-seeded-rng.md#完成证据)；只在成功添加时抽三次、非消耗操作不移位、ID 不复用、坐标在范围内 → [03](./03-step-behavior.md#完成证据) |
| S-05、AC-08、AC-09 | 三种输出冻结且与内部状态脱离、旧输出不受后续 tick 影响、UI/Render 一致 → [02](./02-scene-contract-and-outputs.md#完成证据)、[03](./03-step-behavior.md#完成证据) |
| AC-06 | 17 种非法配置 → [02](./02-scene-contract-and-outputs.md#完成证据)；22 种非法 TickInput、整批原子性、恢复、位置溢出测试 → [04](./04-input-validation-and-guards.md#完成证据) |
| AC-07 | 独立实例逐 tick 一致、事件可 JSON 往返 → [03](./03-step-behavior.md#完成证据)；`synthetic-scene.ts` 无 emit/subscribe/listener/callback |
| S-06、AC-10 | 上述测试均由现有 Node Vitest 入口发现并通过；范围检查见下 |
| 技术决定 5、7、8 | 状态检查副本 `inspect()` 已实现；tick/ID 守卫的审阅证据（第 217、219 行，都在第 228 行首次修改之前）与最终代码一致；额外字段一律拒绝 |

- **范围检查**（`48acc35..HEAD`）：
  - 只改动 `src/core/` 的 7 个新文件与 P1-02 规划文档（另含阶段索引的导航链接）。
  - `package.json`、`pnpm-lock.yaml`、`src/app`、`src/main.tsx`、`index.html`、Vite/ESLint/TS 配置、`tools/`、`src/original-data/` 与 `docs/original/` 均未改变：无新依赖、无消费者接线。
  - Core 生产代码中没有 localStorage/indexedDB/文件读取/fetch/序列化/哈希，也未引用 `local/`：没有存档或 P1-03 的实现，未读取原版文件。
- **合成行为声明：** 所有数值与规则都标注为合成演示，不作原版保真证据。
- **STATUS：** “独立 Core”一项已勾选并链接本证据，另更新了下一步。replay、Runtime、浏览器集成与整个 P1 退出条件仍未勾选。
- 全部 S/AC 对齐，无需新增修复子任务。无 push、CI 或部署。
