---
type: plan
status: active
phase: P1
task: "02"
subtask: "01"
updated: 2026-10-02
---

# 01 — 种子随机数

**契约来源：** [spec](../spec.md) 的 S-04、S-06；AC-05（算法与范围部分）、AC-10；“RNG”一节。
**依赖：** 无。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新增 `src/core/rng.ts`，实现 [goal](../goal.md#代码现状与前提) 选定的 Mulberry32：
  - `type RngState = number`，取值为 uint32；初始状态等于 seed。
  - 纯函数 `nextRandom(state: RngState): { value: number; state: RngState }`，`value ∈ [0, 1)`，返回新状态，不修改任何外部对象。
  - 文件头注释写明算法名称、状态表示、输出公式与范围，以及确定性范围：同一版本/运行时可复现，不承诺跨版本或跨浏览器逐位一致。这就是 spec 要求的“实现说明”。
- seed 的合法性由场景配置校验（02 负责）；本模块假定调用方传入合法 uint32。
- 新增 `src/core/rng.test.ts`：
  - 在测试文件内单独按公开算法描述写一份参考实现，对 seed 0、一个普通种子（如 `123456789`）和上界 `4294967295` 各比较至少 1000 次输出值与状态。期望值不得直接取自被测模块的输出快照。
  - 另以字面常量固定 seed 0 的前几项输出，防止两份实现同时漂移；常量由参考实现计算后写入。
  - 所有输出满足 `0 ≤ value < 1`。场景坐标公式的上界检查属于场景，由 03 负责（见 goal 执行记录）。
  - 相同输入状态得到相同输出与新状态。

## 不包含

- 场景配置、种子校验、RNG 消费规则和坐标生成（02、03）。
- 加密强度、分布质量统计、多流或跳跃（jump）功能；不新增依赖。
- 不在 Core 生产代码中使用 `Math.random` 或其他宿主随机源。

## 关键文件与契约

- 计划新增 `src/core/rng.ts`、`src/core/rng.test.ts`（均尚不存在）。
- 受 [ESLint](../../../../../eslint.config.js) 与 [core 类型配置](../../../../../tsconfig.core.json) 约束；`Math.imul` 属于 ES2015，在 ES2023 lib 中可用。

## 验收标准

- [x] AC-05：三个种子的输出与独立参考实现逐项一致，字面常量 KAT 通过；输出全部在 `[0, 1)`。坐标上界检查已移至 03。
- [x] S-04：状态是单个 uint32 纯数据；`nextRandom` 无副作用，相同输入给出相同结果；无宿主随机源。
- [x] 文件头注释写明算法、状态、输出范围与确定性边界。
- [x] `pnpm exec vitest run src/core/rng.test.ts` 通过；`pnpm check`（含工程边界回归）通过。

## 验证方法

- 运行上述两条命令，记录测试数与结果。
- 只读审阅 `rng.ts`：只用整数运算与 `Math.imul`，无全局状态。
- 对实现 diff 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理后重跑检查。
- 无浏览器、实机或原版对照。

## 完成证据

- 2026-10-01：新增 [rng.ts](../../../../../src/core/determinism/rng.ts)（Mulberry32，uint32 状态，纯函数 `nextRandom` 返回 `{value, state}`，文件头写明算法、状态、范围与确定性边界）与 [rng.test.ts](../../../../../src/core/determinism/rng.test.ts)。
- 测试 8 个：seed 0、123456789、4294967295 各前三项与字面 KAT 常量一致（常量由测试外的参考实现计算）；三种子各 1000 次与测试内独立参考实现逐项一致；状态始终为 uint32、值始终在 `[0, 1)`；相同状态得到相同结果。
- `pnpm exec vitest run src/core/rng.test.ts`：8 通过。`pnpm check`：类型检查（core 程序现含 `rng.ts`）、lint（Core 宿主随机/时间/async 规则）、4 文件/57 测试、build 全部通过。
- simplify 四视角：reuse、efficiency 无发现；simplification 与 altitude 一致指出坐标上界检查属于场景公式，已从 RNG 测试移除并加入 03 的 AC-05 测试范围，重跑上述检查通过。
- 只用整数运算与 `Math.imul`，无全局状态、无宿主随机源；未新增依赖，未读取原版文件。
