---
type: plan
status: active
phase: P1
task: "03"
subtask: "07"
updated: 2026-10-02
---

# 07 — 完整契约最终对齐

**契约来源：** [spec](../spec.md) 的 S-01 至 S-06、AC-01 至 AC-11，包含“不包含”范围与技术决定 1–10。
**依赖：** 01, 02, 03, 04, 05, 06。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 逐条对照已批准的 spec、[goal](../goal.md#验收覆盖) 的覆盖表、01–06 的完成证据与实际代码，确认每个 S/AC 都有当前有效的测试支持。
- 重新运行 `pnpm check`，确认 `src/core` 全部测试与工程边界回归通过，且没有测试被删除、跳过或放宽。
- **不变量复核：**
  - 规范文本字段顺序与 spec 数据模型一致。
  - 快照与输入记录都有格式和版本。
  - 恢复不改变 P1-02 的守卫语义。
  - 只录制正常返回的 step。
  - 比对只报告可观察差异，并保留采样边界的反例测试。
- **范围检查：**
  - `package.json` 与 `pnpm-lock.yaml` 未变。
  - `SyntheticScene` 接口与 P1-02 现有测试断言未放宽。
  - Core 生产代码中没有 `TextEncoder`、`crypto`、`Buffer`、async 或浏览器存储。
  - 未接入 Runtime、UI、渲染或 [App](../../../../../src/app/App.tsx)。
  - 未读取原版文件或 `local/`。
- 全部通过后，在 [STATUS](../../../../STATUS.md#运行骨架) 中勾选“同一输入记录 replay 后事件流与状态哈希一致”，链接本子任务证据，并注明一致性仅限同一版本、同一运行时；同时更新下一步。其他退出条件保持不变。
- 本项只做验证与文档证据。发现实现缺口时新增修复子任务（使用新 ID，插在本项之前并加入依赖），不在本项中实现代码。

## 不包含

- 新功能或行为变更；修改 spec。
- P1 阶段评审；宣称 Runtime、浏览器复用记录（P1-10）或跨浏览器一致已经完成。
- push、CI 或部署。

## 关键文件与契约

- [spec](../spec.md)、[goal](../goal.md) 与同目录 01–06 的完成证据。
- 01–06 交付的 `src/core/` 文件，以及 [STATUS](../../../../STATUS.md)。

## 验收标准

- [x] S-01 至 S-06、AC-01 至 AC-11 都有匹配且当前有效的证据；spec 行为没有增删。
- [x] 最新 `pnpm check` 通过；`src/core` 测试与工程边界回归都运行并通过，没有测试被删除或跳过。
- [x] 不变量复核与范围检查全部通过。
- [x] 只在以上各项通过后，才勾选 STATUS 中的 replay 一项，并附上证据链接与适用范围；其他阶段项不被误勾。

## 验证方法

- 运行 `pnpm check`；用 `git diff` 核对本任务的提交范围。
- 逐条审阅 01–06 的证据与代码；只改文档时检查链接与元数据。
- 无浏览器、实机或原版对照。

## 完成证据

本项只做验证，未改动代码。核对范围为提交 `7892b6a`…`26ea8a3`，对照基线 `b48bf1d`（goal 获批时）。

- **S/AC 对照**（逐条核对 spec、[goal 覆盖表](../goal.md#验收覆盖)、01–06 的完成证据与当前代码）：

  | 契约项 | 当前证据 |
  |---|---|
  | S-01、AC-01 | [02](./02-snapshot-and-hash.md#完成证据)：完整快照、深冻结、读取隔离、无副作用、JSON 往返 |
  | S-02、AC-02 | [01](./01-fnv1a64.md#完成证据) 公开向量；[02](./02-snapshot-and-hash.md#完成证据) 两个手写规范文本字面量、`-0`、键序；[03](./03-strict-restore.md#完成证据) 恢复后键序无关 |
  | S-03、AC-03–AC-06 | [03](./03-strict-restore.md#完成证据)：四种来源往返并行运行；60 个负向用例与继承字段、getter 用例；11 个字段的敏感性；tick 与 ID 上限及其原子性 |
  | S-04、AC-07 | [04](./04-recording-session.md#完成证据)：与普通场景对照；非法调用与守卫失败不入记录；检查点规则；调用者隔离；导出冻结且互不影响 |
  | S-05、AC-08 | [05](./05-replay.md#完成证据) 2 频率 × 2 seed × 2 间隔精确相等，空记录、JSON 往返、导出后继续录制、重复 replay、特征锁定；[06](./06-result-comparison.md#完成证据) 比对返回一致 |
  | AC-09 | [06](./06-result-comparison.md#完成证据)：各类合法偏差的 tick 与类别、`events` 优先、间隔 4 的检查点与无检查点 tick、间隔 2 采样边界反例、`-0`/`0` |
  | AC-10 | [05](./05-replay.md#完成证据) 22 个记录负向用例及校验顺序回归；[06](./06-result-comparison.md#完成证据) 29 个结果负向用例 × `expected`/`actual` |
  | S-06、AC-11 | 下方的检查与范围核对 |

  spec 行为没有增删。实现层面相对 goal 的偏离已记入 goal 执行记录：`CoreInputError` 新增 `reason`，`synthetic-scene.ts` 新增几个 Core 内部导出。
- **工程检查：** 最终依次运行 `pnpm typecheck`、`pnpm lint`、`pnpm exec vitest run`、`pnpm build`，与 `pnpm check` 覆盖相同，全部通过。
  - 14 个测试文件共 420 项，包括 [engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts)（28 项）。
  - P1-02 的 `synthetic-scene*.test.ts`（27/31/28 项）与 `rng.test.ts`（8 项）仍按原数量运行。
  - `src/core` 测试中没有 `.skip`、`.only` 或 `.todo`。
- **不变量复核：**
  - 规范字段顺序由手写字面量测试锁定，与 spec 数据模型一致。
  - 快照（`osr-synthetic-snapshot`/1）与输入记录（`osr-synthetic-replay`/1）都带格式和版本，不匹配时拒绝。
  - 恢复只构造状态，P1-02 守卫由 03 的边界测试验证，语义不变。
  - 录制只在 step 正常返回后追加。
  - 比对只报告可观察差异，间隔 2 的反例测试保留在 [synthetic-replay-compare.test.ts](../../../../../src/core/synthetic-replay-compare.test.ts)。
- **范围检查：**
  - `git diff b48bf1d..HEAD` 只涉及 `docs/plan/p1/03/` 与 `src/core/`。
  - `package.json`、`pnpm-lock.yaml`、P1-02 测试文件、`src/app`、`tools`、ESLint/tsconfig/Vite 配置都没有变化。
  - `SyntheticScene` 接口行未改动。
  - Core 生产代码中，`TextEncoder|crypto|Buffer|async|await|localStorage|indexedDB|Date.now|performance.now|Math.random|fetch|readFile|local/` 只命中注释里的 “cryptographic”。
  - 未接入 Runtime、UI、渲染或 App；没有读取原版文件；`local/` 仍被忽略，未进入提交。
- **STATUS：** 已勾选“同一输入记录 replay 后事件流与状态哈希一致”，链接本证据，并注明只限同一代码版本与同一 JS 运行时、只覆盖合成 Core；同时更新了阶段说明与下一步。其他退出条件未改动。
