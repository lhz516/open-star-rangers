---
type: plan
status: active
phase: P3
task: "12"
subtask: "36"
updated: 2026-10-18
---

# 36 — 修复：最终对齐发现的负载敏感测试

**契约来源：** [spec](../spec.md) 的 AC-22（`pnpm check` 与浏览器回归通过）。
**依赖：** 23, 25, 34。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

29 在 2026-10-18 的检查中发现两处负载敏感的失败（各自单独重跑通过）：

- `src/workers/failure-matrix.test.ts` 的“names the fingerprint each scenario identifies …”用例：main 上约 0.7 秒，本分支约 1.8 秒，负载下达到 5 秒超时。时间增长来自 23、34 放大的合成生产包夹具（例如 128×128 星云、更多模型部件）。在不改变断言含义、不提高超时的前提下恢复其速度（例如避免重复构建大夹具，或缓存场景来源），并量化前后耗时。
- `e2e/ai-wingman.development.spec.ts` 的“an AI fault shows through the Runtime …（AC-17）”：在负载下轮询未见到 `departure` 时运行已在 tick 1 结束（`position: ended`）。查明 P3-12 的飞行渲染是否使此竞争更易发生；在不削弱断言的前提下让等待对该时序稳健（例如以运行开始的可观察证据代替只出现一瞬的 `departure`），或修正引起竞争的实际原因。

## 不包含

- 改变被测行为或放宽断言。

## 写入范围

- `src/workers/failure-matrix.test.ts`：用例的构造方式。
- `src/original-data/conversion/*.test-support.ts`、`src/workers/*.test-support.ts`：必要的夹具缓存或构造（不改夹具内容）。
- `e2e/ai-wingman.development.spec.ts`、`e2e/support/**`：等待方式。

## 验收标准

- [x] failure-matrix 用例在正常负载下回到接近 main 的耗时（记录前后数值），断言不变。
- [x] ai-wingman 的 AC-17 用例对该时序稳健（说明原因与改法），在并发 `pnpm check` 的负载下连续通过。
- [x] `pnpm check` 与受影响的 E2E 通过。

## 验证方法

- Node 与 Playwright；记录耗时与负载。

## 完成证据

- **failure-matrix 原因（已确认，剖析）：** 用例逐个场景两次构建覆盖文件（用例本身一次，`scenarioEntryProfile` 内一次）。每次 `sliceCoveredFiles` 约 25 ms，其中约 20 ms 是 `productionFlightGraphicsEntries` 生成 15 张 128×128 星云，并且它在 `productionSliceEntries` 里被调用两次（经图形条目与飞行数据条目）。其余是每次重建 `MAIN/SR.NOB`。
- **failure-matrix 改法：** 只缓存构造，不改内容。[production-flight-graphics.test-support.ts](../../../../../src/original-data/conversion/production-flight-graphics.test-support.ts) 在进程内只生成一次默认条目，每次调用返回副本（`data`、`relocations` 都复制），`replace` 的语义不变。[synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts) 的 `sliceCoveredFiles` 按 `corruptMesh` 缓存 SR.NOB（它与场景、战役、规则数据参数无关），与已有的 `sliceExecutable` 一样返回 `.slice()`。用例和断言没有改动。
- **failure-matrix 耗时（同一时段交替测量，负载约 3）：** 修复前 1,716–1,784 ms，修复后 722–761 ms，main 653–688 ms。修复后 `sliceCoveredFiles` 每次约 6 ms。剩余差距是对更大夹具做哈希，这由内容决定。
- **AC-17 原因（已确认，trace 与页内探针）：** 第一次轮询就看到了 `departure`。超时发生在 `endPlaceholder` 点 Skip 之后的 `waitForFrame(position === 'flight')`（trace 指向 mission-observations.ts 的该行；两处等待报同一条错误文本，29 记录把它归到了 departure 等待）。本用例的运行进入 flight 后 1–2 个 tick 就因 AI 预算故障结束，`flight` 只持续约 80–140 ms。P3-12 在进入 flight 时增加了约 55 ms 的主线程长任务（绑定飞行区并首次绘制），开始时另有约 75 ms 的准备任务（不影响 departure）。高负载下，25 ms 一次的 `page.evaluate` 轮询在长任务期间得不到响应，长任务之后运行很快追到故障，于是轮询看不到 `flight`。
- **P3-12 是否使竞争更易发生（已确认）：** 是。同样的压力（并发 `pnpm check` 加 8 个占满 CPU 的进程，负载 10–100）下，本分支未修复的用例 8 次失败 7 次；main 上相同的用例 5/5 通过，flight 进入处没有长任务，flight 持续约 70–85 ms。原因是测试等待一个瞬时状态，产品代码没有缺陷，所以不需要申请扩大范围。
- **AC-17 改法：** [mission-observations.ts](../../../../../e2e/support/mission-observations.ts) 把 `endPlaceholder` 的跳过动作拆成导出的 `skipPlaceholder`，前置检查不变（data-gap、`timing` 状态、Skip 获得焦点），`endPlaceholder` 的行为和返回值不变。新增 `watchedPositions`，读取已有 `watchPositions` 在页内用 MutationObserver 记录的位置序列。[ai-wingman.development.spec.ts](../../../../../e2e/ai-wingman.development.spec.ts) 的 AC-17 用例在 Start 前安装 `watchPositions`，仍以轮询等待带运行的 `departure`（它是 3 s 墙钟占位）。按钮跳过后，等故障结束出现，再断言位置序列恰为 `config → departure → flight → ended`，然后停止记录。其后的断言（故障文案、`expectStableTick` 为 1 等）不变。新断言比原来更强：顺序完整，且不允许中间出现其他位置。超时没有提高。
- **AC-17 验证：** 修复后在同样的压力下单用例 6/6 通过；simplify 之后的最终代码在压力下又测 3 次，3/3 通过，同时运行的 `pnpm check` 也通过。整个 ai-wingman spec 单独运行两次各 5/5，与 `pnpm check` 并发运行两次各 5/5（两次 check 也都通过）。其他使用 `endPlaceholder`、`watchPositions` 或 `startFlight` 的 12 个 spec（development 与 production 共 53 个用例）全部通过。
- **检查：** `pnpm typecheck`、ESLint 通过。`vitest run src/workers src/original-data/conversion` 36 个文件、1,162 个测试通过。`pnpm check`（382 个文件、10,601 个测试，含构建）在本子任务改动下多次通过，其中包括 8 进程压力下的一次。
- **rubber-duck：** 未发现问题。它独立复核了 SR.NOB 与 ruleData 无关，以及调用方没有原地修改条目。
- **simplify：** 采纳：SR.NOB 缓存从 `Map<boolean>` 改为两个 `??=` 变量，与 `sliceExecutable` 的写法一致。曾试用 `structuredClone` 代替 `copyEntry`，但 original-data 的 tsconfig 不含该 API，已恢复。未采纳：
  - 返回共享条目而不复制。调用方可以改动返回值，复制每次不到 1 ms。
  - 把 `endPlaceholder` 全局改为按日志等待。这会改变其他调用方依赖的“当前所示帧”返回值。
  - 把位置序列断言放宽为 `toContain('flight')`。
- **文档影响：** 无须更新维护文档。helper 的用法写在代码注释里，测试约定不变。建议（不在写入范围内）：可在 `docs/engineering/README.md` 的 E2E 约定中加一句，只持续几个 tick 的位置用 `watchPositions`/`watchedPositions` 验证，不要用轮询等待。
