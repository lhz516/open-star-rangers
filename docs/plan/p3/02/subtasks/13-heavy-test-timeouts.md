---
type: plan
status: active
phase: P3
task: "02"
subtask: "13"
updated: 2026-10-09
---

# 13 — 重负载测试的超时修复

**契约来源：** [spec](../spec.md) 的 AC-11（规范文本上限）；[工程约定](../../../../engineering/README.md)的测试约定；`pnpm check` 作为每次集成的门槛。
**依赖：** 04。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 背景

集成 05 时 `pnpm check` 有两个测试超过 Vitest 默认的 5 秒而失败（系统负载约 12，其他会话同时运行）。两者单独运行时都通过，重跑完整检查也通过：

- `src/core/contracts/canonical-text.test.ts` 的“accepts a text of exactly 16777216 characters and rejects one more”：单独运行约 0.7 秒，完整检查中约 6.9 秒。06 的 worker 在负载 16–28 时也遇到同一超时。
- `tools/engineering-boundaries.test.ts` 的“checks every DOM-free render module in the Node program and no browser module there”：单独运行约 0.5 秒，完整检查中约 7.6 秒。该文件最近一次由 04 修改。

后续的 07、08 每次集成都要运行 `pnpm check`，偶发超时会拖慢集成并在 CI 上误报。

## 工作范围

- 查明两个测试在完整并行运行时变慢的原因（大字符串分配、TypeScript 程序构建、并行文件间的 CPU 与内存争用等），并对照 04 之前的提交判断渲染边界测试是否因 04 的改动变慢。
- 修复为在负载下稳定通过，不削弱断言：
  - 优先减少重复的重计算或大分配（如复用已构建的程序或字符串），保持对上限两侧和每种输入形式的覆盖；
  - 仍然需要较长时间的，给该测试或该组设置显式超时，并在代码旁用一句话写明依据与实测时间。
- 不改被测实现，不改 Vitest 的全局默认超时。

## 不包含

- 被测的 `canonical-text.ts` 与 ESLint 规则本身的行为。
- 其他测试的性能优化。

## 关键文件与契约

- [canonical-text.test.ts](../../../../../src/core/contracts/canonical-text.test.ts)、[engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts)。
- [vite.config.ts](../../../../../vite.config.ts) 的 `test` 节：项目划分与全局设置（只读）。

## 写入范围

- `src/core/contracts/canonical-text.test.ts`：上限测试的超时与重计算。
- `tools/engineering-boundaries.test.ts`：渲染边界测试的超时与重计算。
- `docs/engineering/README.md`：测试一节中关于负载下超时的说明（只改这一处）。

## 验收标准

- [ ] 两个测试的变慢原因已查明并记入完成证据，包括渲染边界测试是否因 04 变慢。
- [ ] 断言覆盖不变：上限两侧、字符串与数组两种输入、渲染边界的全部检查仍在。
- [ ] 在并行负载下（例如同时运行两份 `pnpm test`，或在 load average 不低于 8 时运行 `pnpm check`）两个测试都通过；完成证据记录修改前后的单独与负载下耗时。
- [ ] `pnpm typecheck`、`pnpm lint` 通过；完成前运行 `pnpm check`。

## 验证方法

- `pnpm exec vitest run src/core/contracts/canonical-text.test.ts tools/engineering-boundaries.test.ts --reporter=verbose` 记录单独运行耗时。
- 在负载下运行完整检查并记录两个测试的耗时。

## 完成证据
