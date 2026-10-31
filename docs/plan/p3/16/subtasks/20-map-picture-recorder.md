---
type: plan
status: active
phase: "P3"
task: "16"
subtask: "20"
updated: "2026-10-31"
---

# 20 — 修复：map-picture 用例的标签记录器锚点（P3-13 AC-17）

**契约来源：** [spec](../spec.md) 的 S-05、AC-04、AC-15，以及[技术决定](../spec.md#技术决定) 9、10；被修复的验收为 [P3-13 spec](../../13/spec.md) 的 AC-17。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 来源

[11](./11-render-test-risks.md#完成证据) 确认 `e2e/map-picture.development.spec.ts:211` 的失败与负载无关（单独 7 过 3 败），产品符合 DC-09：`installLabelRecorder` 把 `projection` 初始化为 null，记录器第一帧总被当作发布帧与精确锚点，而 store 约每 100 ms 才发布一次，该锚点可能过时若干 tick，按键也可能早于第一帧；由此在 :231、:234、:235 误报。只把第一帧当作非发布帧重算后，18 次探针运行全部符合 16 tick 周期且不符合 20。原责任 P3-13/28。

## 工作范围

- **修复测试测量：** 记录器以装好时 store 已有的 projection 为初值，第一帧不算发布；按键前等到记录器已有一个发布帧与一个无标签帧。不放宽判据、不加重试、不删断言。
- **验证：** 修复后单独与满载下各 `--repeat-each 10` 全部通过；用同一私有诊断确认判据仍能拒绝 20 tick 周期（例如对记录数据断言 `fitsPeriod(held, 20)` 为 false 的路径仍在）。
- **前提记录：** 11 指出“关图与重开合计 ≤ 4 个图内 tick”的前提在严重节流下不满足，属执行速度前提；本项不改它，只在完成证据写明适用条件。

## 不包含

- 产品代码；其他用例。

## 关键文件与契约

- [map-picture.development.spec.ts](../../../../../e2e/map-picture.development.spec.ts)、`e2e/support/map-picture.ts`。

## 写入范围

- `e2e/support/map-picture.ts`：记录器初值与就绪等待。
- `e2e/map-picture.development.spec.ts`：只在按键前的就绪等待需要时修改。

## 验收标准

- [x] 修复后 `:211` 单独与满载下各 `--repeat-each 10` 全部通过，没有放宽判据或加重试。
- [x] 判据仍区分 16 与 20 tick 周期，首读与携带计数的断言不变。
- [x] `pnpm typecheck`、`pnpm lint` 通过；没有产品代码改动。

## 验证方法

- `pnpm build` 后 `pnpm exec playwright test e2e/map-picture.development.spec.ts --project development --repeat-each 10`（单独与满载各一次）；`pnpm typecheck`、`pnpm lint`。

## 完成证据

- **2026-10-31（worker `exec-p3-16-20`，基于 `d9da02ec`）：** 只改 `e2e/support/map-picture.ts`，用例文件与产品代码未改。环境：本机 Chrome 156（headless）、Apple M2（8 核），开发源端口 5160、预览 5161。私有日志与诊断脚本在 `local/research/p3-16/map-recorder/`，只用合成内容。
  - **改动：**
    - **记录器初值：** `installLabelRecorder` 以装好时 store 已有的 projection 为初值，第一帧只有在此后 store 真的发布了新 projection 时才算发布帧（锚点）。
    - **就绪等待：** `recordLabels` 装好记录器后，等到记录中已有一个发布帧，且在它之后（含它本身）有一个无标签帧（`shown === false`），才返回。这样按键之后各帧的 tick 区间都以一次真实发布为界，第一次变化也有可比较的前一帧。
    - **共用判定：** 锚点判定抽为 `isAnchor`，由 `frameTicks` 与就绪等待共用。`frameTicks`、`labelChanges`、`fitsPeriod`、`tickAfter` 的判据，以及用例中首读（:233、:234）、16/20 周期（:235、:236）与携带计数（:270–:284）的断言均未改动。
    - **没有重试：** 就绪等待只同步记录器的起点，被测动作没有重做。同一 spec 中另外两处 `recordLabels` 调用（:481、:614）也在其后才按键，同样受益。
  - **验证（`pnpm build` 通过后）：**
    - **单独运行：** `pnpm exec playwright test e2e/map-picture.development.spec.ts:211 --project development --repeat-each 10`，先后两次（`simplify` 前与最终代码）均为 10/10 通过。修复前，11 在同一本机上为 7 过 3 败。
    - **满载运行：** 用 8 个忙线程（`cpu-load.mjs 8`）。`simplify` 前的代码 10/10 通过（3.6 分钟）。最终代码在其他会话没有重负载时（起跑前负载均值约 3）10/10 通过（4.6 分钟，`load8-r10-run4.log`）。
    - **整个 spec 文件：** 单独运行一次，9/9 通过。
    - **`pnpm typecheck`、`pnpm lint`：** 通过。
  - **另有三批满载运行不全过，失败都在 :284 的执行速度前提（不在本项修改范围）：**
    - **环境：** 这三批运行时，除 8 个忙线程外，其他会话同时在跑重负载（真实内容的 replay-check、比较脚本与 E2E），负载均值 23–186。
    - **结果：** 三批分别为 4/10、6/10、9/10，11 次失败都是 :284 `a close and reopen within 4 in-map ticks`：每次的 6 个循环预算都在 5–11，没有一次 ≤ 4。
    - **未受影响的断言：** :284 之前的断言全部通过，包括首读、“不早于按键”、`fitsPeriod(held, 16)`、`fitsPeriod(held, 20) === false` 与松开后不再切换。也就是说，在全部 50 次运行中，11 记的那几类失败（变化序列 :230、首读 :234、16 周期 :235；11 按当时行号记为 :231、:234、:235）一次都没再出现。
  - **判据仍拒绝 20 tick 周期（私有诊断 `period-check.ts`，输出 `period-check.txt`）：** 诊断直接调用本工作树的 `labelChanges`/`fitsPeriod`。
    - **(a) 历史记录重判：** 11 的 18 次探针记录（单独 8 次、满载 10 次），按新记录器的语义（第一帧不算发布）重判，16 周期 18/18 符合，20 周期 0/18 符合。其中 9 次的首个变化落在任何锚点之前，正是按键早于记录器就绪的情形；本修复的就绪等待在按键前排除了这种情形。
    - **(b) 合成记录：** 已知真实 tick，按 16 或 20 tick 周期切换，帧间隔分常规 16.7 ms 与节流两种（最多 8 帧合一），发布间隔约 100 ms，每种 500 次。真周期为 16 时，`fitsPeriod(·, 16)` 500/500、`fitsPeriod(·, 20)` 0/500；真周期为 20 时，前者 0/500、后者 500/500。判据双向区分 16 与 20。
  - **执行速度前提（未改动，记录适用条件）：** 携带计数部分要求“关图前的切换到关图”与“重开到再按”合计 ≤ 4 个图内 tick（每次最多尝试 6 个循环）。
    - **成立条件：** 页面主线程与 Playwright 往返没有被拖慢，一次关图与重开的按键往返在约 125 ms（4 tick）内完成。本机单独运行，以及只有 8 个忙线程时，都满足。
    - **不成立的情形：** 叠加其他会话的重负载（如上三批），或严重 CPU 节流（11 的 6 倍节流，预算 11–19）时，不满足。
    - **失败的判读：** :284 的失败应先按此前提查因，不判为产品违约，也不是本项所修的测量缺陷。09 的全量 E2E 应在没有其他重负载时运行。
  - **复审（rubber-duck）：** 无阻断问题，无建议。复审确认了以下几点：
    - **就绪条件足够：** 无标签帧落在锚点本身也可以，因为锚点的区间是精确的。
    - **`shown === null` 的帧：** 只会放宽区间，不会使区间无界。
    - **第一帧分类：** 装好后、第一帧前若有发布，仍正确记为发布帧。
    - **其他：** `restartLabelRecorder` 与其他调用者不受影响，判据没有被削弱。
  - **simplify：** 四个角度审查后，采纳“锚点判定共用 `isAnchor`”，并把 `projection` 的类型收窄为 `State['projection']`。未采纳“把就绪判断移入页面内执行以减少往返”：等待通常不到一秒，开销不实质，而且要在页面函数里重复同一判定。改后重跑 typecheck、lint、period-check、单独 10 次与满载 10 次。
  - **文档影响：** [工程约定](../../../../engineering/README.md)对该用例覆盖面的描述仍然准确，`docs/original/`、unknowns、ADR 与 spec 均无需改动。“≤ 4 个图内 tick”的执行速度前提目前只记在本证据中；是否写入工程约定的 E2E 运行条件，交协调者决定（不在本项写入范围）。
