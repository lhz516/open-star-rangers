---
type: plan
status: accepted
phase: P1
task: "02"
updated: 2026-10-01
---

# P1-02：最小纯 Core 与合成场景契约 — Goal

## 目标与来源

落实 [spec](./spec.md) 中 S-01 至 S-06、AC-01 至 AC-10：在 `src/core/` 建立明确标记为合成演示的纯 Core，包括带种子 RNG、统一创建入口、同步 `step()`、单轴移动、添加/移除标记命令与事件、三种隔离只读输出，以及严格输入校验。本文件不重新定义行为契约。

> **前提已满足：** spec 已于 2026-10-01 由用户批准（含技术决定 5、7、8），可以执行。

## 代码现状与前提

- `src/core/` 目前不存在。[core 类型配置](../../../../tsconfig.core.json)已包含该目录，只提供 ES2023 lib、无 DOM/Node 声明；[ESLint](../../../../eslint.config.js) 对 `src/core/**/*.{ts,tsx}` 禁止宿主随机/时间/调度/async 及 UI/渲染/存储依赖；[工程边界回归](../../../../tools/engineering-boundaries.test.ts)持续验证这些规则。新代码不得放宽任何一项。
- [Vite/Vitest](../../../../vite.config.ts) 已在 Node 环境发现 `src/**/*.test.ts`，[node 类型配置](../../../../tsconfig.node.json)检查这些测试；无需新增依赖或 runner。
- 可参考的模式：[imfat.ts](../../../../src/original-data/imfat.ts) 的命名错误类型（`ImfatError extends Error`）。不复用解析器模型。[App](../../../../src/app/App.tsx) 与 [main](../../../../src/main.tsx) 保持不变，本任务不接任何消费者。
- **计划新增文件**（均尚不存在）：
  - `src/core/rng.ts`、`src/core/rng.test.ts`：种子随机数。
  - `src/core/errors.ts`：`CoreInputError`。
  - `src/core/synthetic-scene.ts`：合成场景类型、常量、创建入口、`step()` 与只读输出。
  - `src/core/synthetic-scene.test.ts`、`src/core/synthetic-scene-step.test.ts`、`src/core/synthetic-scene-input.test.ts`：按子任务划分的测试，避免多个子任务反复修改同一测试文件。
- **spec 授权 goal 决定的实现选择：**
  - **PRNG 为 Mulberry32。** 状态是单个 uint32，初始状态等于 seed；每次抽取先令状态加 `0x6D2B79F5`（模 2^32），再经整数混合输出 uint32，结果 `r = output / 2^32 ∈ [0, 1)`。理由：只用 `Math.imul` 与位运算，状态是一个纯数据数字，seed=0 合法，无需依赖；按公开算法描述自行实现，不是加密随机数。坐标上界：`r` 最大为 `1 - 2^-32`，`-5 + 10r` 的最大值约 4.9999999977，满足 `< 5`。
  - **输出所有权：** 事件、UI projection、Render State 和状态检查副本每次都是新建的纯数据对象，并递归 `Object.freeze`。ES 模块为严格模式，外部写入会抛 `TypeError`；后续 tick 也不会改动旧对象。
  - **错误定位：** `CoreInputError` 带只读 `path: string`，例如 `config.seed`、`tickInput.input.moveX`、`tickInput.commands[2].type`、`tickInput.commands[1].extra`。
  - **对外入口：** `createSyntheticScene(config)` 返回 `SyntheticScene`，提供 `step(tickInput)`、`inspect()`、`uiProjection()`、`renderState()`。内部状态为私有可变字段，不暴露引用。
- **跨任务前提：** P1-01 已完成，证据见其 [最终对齐](../01/subtasks/06-final-alignment.md#完成证据)。[spec](./spec.md) 已于 2026-10-01 批准。
- **下游：** P1-03（replay/哈希）基于状态检查副本；P1-04 至 P1-07 消费 `step()` 与投影。本任务不实现、不预建这些消费者。
- **原版证据：** 不适用。所有行为、数值和坐标都是合成演示，不作保真证据，也不新增 U/B 结论。
- **验证命令：** 迭代时用 `pnpm exec vitest run src/core`；每个代码子任务完成前用 `pnpm check`。本任务不改 Python 工具，不需运行 Python 测试。代码清理按 [simplify](../../../../.agents/skills/simplify/SKILL.md) 限定在当前子任务 diff；本任务无浏览器验收。

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
|---|---|---|
| S-01 | 02 | 02 创建入口与初始状态测试；05 复核没有第二套世界 |
| S-02 | 03、04 | 03 tick/移动测试；04 moveX 契约校验；05 |
| S-03 | 03 | 03 命令、事件与 ID 测试；05 |
| S-04 | 01、03 | 01 KAT 与范围；03 只在成功添加时消耗三次；05 |
| S-05 | 02、03 | 02 初始输出隔离；03 tick 之后的隔离与一致性；05 |
| S-06 | 01、02、03、04 | 各子任务的同目录测试；05 运行 `pnpm check` |
| AC-01 | 02 | 默认/显式频率、seed=0 的完整初始检查与两种投影；纯模块类型/lint 通过 |
| AC-02 | 03 | 60/120 Hz 运行一秒，moveX 为 -1/0/0.5/1，误差 ≤ 1e-12；空 tick |
| AC-03 | 03 | 四种状态/命令组合，拒绝不消耗 RNG/ID 但 tick 与移动仍推进 |
| AC-04 | 03 | add/add/remove/add 精确序列，反向顺序及跨 tick 对照 |
| AC-05 | 01、03 | 01 独立参考实现 KAT；03 抽取次数、非消耗操作不移位、ID 不复用 |
| AC-06 | 02、04 | 02 配置非法输入；04 TickInput 非法输入、整批原子性、位置溢出测试、tick/ID 守卫审阅 |
| AC-07 | 03 | 两个独立实例逐 tick 一致；JSON 往返；`step` 无回调参数 |
| AC-08 | 02、03 | 冻结写入抛错；旧事件/投影在后续 tick、增删后不变 |
| AC-09 | 02、03 | 初始/有标记/移除/同 tick 增删时 UI 与 Render 一致；读取无副作用 |
| AC-10 | 01–04 | 05 汇总：`pnpm check`、无新依赖、无消费者接线、无原版读取 |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。验收结果与证据写在各 subtask，不复制到阶段索引。最终对齐为最后一行，依赖全部其他项。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-seeded-rng.md](./subtasks/01-seeded-rng.md) | — | completed |
| [02-scene-contract-and-outputs.md](./subtasks/02-scene-contract-and-outputs.md) | 01 | pending |
| [03-step-behavior.md](./subtasks/03-step-behavior.md) | 02 | pending |
| [04-input-validation-and-guards.md](./subtasks/04-input-validation-and-guards.md) | 03 | pending |
| [05-final-alignment.md](./subtasks/05-final-alignment.md) | 01, 02, 03, 04 | pending |

依赖是真实前提：02 的状态检查副本包含 RNG 状态；03 需要场景状态；04 的校验包在 `step()` 前面。03 只处理类型合法的输入，04 补全非法输入的拒绝与原子性。03 提交后到 04 完成前的中间状态不对非法输入作任何保证，不得被视为可交付。ID 保持稳定；最终对齐发现缺口时新增修复项，插在 05 之前并加入其依赖，不复用编号。

## 执行记录

- **2026-10-01 — Subtask 01 范围调整：** simplify 审阅指出场景坐标公式 `-5 + 10r < 5` 的上界检查属于场景而非 RNG；已从 `rng.test.ts` 移除，改由 03 的 AC-05 测试覆盖。覆盖关系不变。

## 审批

**2026-10-01 用户批准本 Goal 并开始执行。** 用户调用 execute-goal 并写明 “approve.”，回应上一轮对 spec 与本 goal 的批准请求；批准范围为本文件的覆盖表、五项子任务及其依赖与实现选择。`accepted` 仅表示计划获批，执行状态以 tracker 与各子任务证据为准。
