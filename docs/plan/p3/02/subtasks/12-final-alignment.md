---
type: plan
status: active
phase: P3
task: "02"
subtask: "12"
updated: 2026-10-09
---

# 12 — 最终对齐

**契约来源：** [spec](../spec.md) 的 S-01 至 S-10、AC-01 至 AC-16。
**依赖：** 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 13, 14, 15。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

只做验证，不交付新的功能代码。发现缺口时，由协调者新增修复子任务（新 ID，插入本项之前并加入依赖）。

- **覆盖：** 按 [goal 的验收覆盖](../goal.md#验收覆盖)，逐项核对 S-01 至 S-10、AC-01 至 AC-16 都有完成证据。
- **契约不变量：**
  - Core 不持有跨 tick 的命令或按键队列；所有合法命令有且仅有一个结果。
  - 没有在 `step()` 之外推进时钟的接口；R-01 没有被写成整帧一致。
  - 正式模块与合成模块互不导入；合成格式与测试未改变（helper 移动除外）。
  - 未就绪分区没有伪造的玩法数据；没有可注入处理器的生产入口。
  - Q-01 至 Q-11 各自达到门槛，或已按 spec 记为阻塞并有恢复条件。
- **工程检查：** `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`；`pnpm check`；`pnpm check:compliance`；若 10 改动了 `tools/baseline/`，运行 `python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'`。
- **文档与原版隔离：** 改动的文档 `updated:`、链接与锚点有效；U 项的负责阶段未改；仓库中没有原版内容、反编译输出、读数或截图，研究输出只在 `local/research/p3-02/`；`node tools/task-state.ts p3/02` 没有计划问题。

## 不包含

- 新功能、规则或文档内容的补写（交给修复子任务）。
- push、合并或部署。

## 关键文件与契约

- [spec](../spec.md)、[goal](../goal.md) 与 01–11 的完成证据。

## 写入范围

无。

## 验收标准

- [x] S-01 至 S-10、AC-01 至 AC-16 逐项有证据，没有未披露的缺口。
- [x] 上列契约不变量逐项核对通过。
- [x] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm check`、`pnpm check:compliance` 通过；适用时 baseline 工具测试通过。
- [x] 文档链接、元数据与原版隔离核对通过；`node tools/task-state.ts p3/02` 没有计划问题。

## 验证方法

- 运行上列命令并记录结果；`git status`、`git diff` 与提交的文件列表审阅。
- 对照 spec 与各 subtask 的完成证据逐项核对。

## 完成证据

2026-10-09，协调者在协调者 checkout（`p3-02-core-contract-spec`）中执行。覆盖与不变量核对由只读审计代理协助，结论由协调者复核。

**两轮：**

- 第一轮（`1d02836`）：工程检查、覆盖与契约不变量都通过。原版隔离一项不通过：10 写入的三处文档逐字引用了出发前页面三个按钮的标签。本项按流程退回 `pending`，新增修复子任务 15（见 [goal 执行记录](../goal.md#执行记录)），15 已集成（`af96bec`）。
- 第二轮（`622df0a`，代码树与 `82056b3` 相同）：下列各项全部通过。

**覆盖：** S-01 至 S-10、AC-01 至 AC-16 在 [goal 的验收覆盖](../goal.md#验收覆盖)中分配的子任务都已勾选相应验收项，完成证据支持结论。覆盖表已补记 13（AC-11）、14（S-02、AC-06）与 15（AC-14）。需要披露的几点如下，都不构成缺口：

- **Q-11：** f32 写回的舍入方向依据 10 的运行时证据与用户批准的决定（就近舍入），不是代码确认。代码推出的“渲染后向零”被运行时推翻，原因未查明，记在 U-009 与 B-007。02 勾选的 Q-11 写于已被取代的先前决定之下，以执行记录为准；06 的完成证据保留当时的向零实现作为历史，现行实现与测试见 14。
- **AC-07：** spec 要求不要把 +0x70 的钳位泛化到 +0x74/+0x78。03 由代码确认 +0x78 有它自己的钳位，07 逐字段按代码实现，不是泛化，符合该条的意图。
- **`RULES_VERSION` = 1：** 08 引入它之后，14 改变了数值语义。此前没有任何录制被导出或提交：仓库中没有录制 fixture，`local/research/` 中也没有录制。因此 1 表示交付时（含 14）的规则，递增规则从集成后开始适用。
- **AC-15：** 方案先写在本地 `local/research/p3-02/runtime/plan.md`（最后修改 15:44，早于 15:48 的烟测和 15:58 的首次运行）；B-007 的草稿同期存在但未跟踪，提交于 `e255a3a`。
- **数据推出的时刻与计数：** scenario、executable 与 B-007 记录了所选任务延迟生成的到期时刻与各记录的请求数，属于 03 批准的“计数、来源编号与时刻”范围。
- **范围外改动：** `.github/github-app.yml`（`7ae4690`）按用户要求让新 worktree 自动链接 `local/`，与本 goal 的契约无关。

**契约不变量（在代码中核对）：**

- Core 不跨 tick 保留命令或按键队列：每个 tick 新建上下文，每条合法命令恰好得到一个结果，有对应测试。
- `step()` 是唯一推进 tick 与时钟的入口：`World` 只有四个方法，有测试锁定；core.md 与 11 的结论把 R-01 写成“单位/调度阈值一致，完整帧行为未在此验证”。
- 正式与合成模块互不导入：由 `osr/core-synthetic-boundary` 规则及其测试保证。`src/core/synthetic`、`determinism`、`mission` 自 `18dcd2b` 起没有改动，没有移动 helper。
- 未就绪分区（flight、map、communications、result）返回 `not-implemented`，没有伪造数据。阶段表冻结，`constructWorld` 不接受处理器，没有可注入处理器的生产入口。`constructWorld` 与 `initialWorldState` 只靠文档约定为内部函数，没有 lint 限制。
- Q-01 至 Q-10 由代码达到门槛，其中 Q-02、Q-04、Q-06 另有运行时确认；Q-11 见上文。

**工程检查（第二轮）：**

- `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`：37 个文件 / 1,046 个测试通过。
- `pnpm check`：181 个文件 / 5,273 个测试，构建通过。其中一次运行时负载从约 7 升到 19，有 2 个合规工具的真实构建集成测试失败（`tools/compliance/build-plugin.test.ts`、`cli.test.ts`；本 goal 未改 `tools/compliance`）；两者单独运行通过，完整复跑通过。
- `pnpm check:compliance`、`pnpm check:original`：退出码 0。
- `python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'`：148 个测试通过（第一轮；`tools/baseline` 未改动）。
- 第一轮的 focused 运行在负载约 20 时有 1 个未识别的失败，随后 3 次复跑都通过。

**文档与原版隔离：**

- 自 `18dcd2b` 起改动的 27 份文档（含本文件）的 `updated:` 都是 2026-10-09，相对链接与锚点检查 0 失败。
- 改动的 U 项（U-009、U-011、U-022、U-023、U-024）的负责阶段与 `18dcd2b` 相同。
- `git ls-files local` 为 0。受跟踪文件中已没有原版界面按钮标签（`git grep -w` 无匹配）。docs/original、B-005 与 B-007 的改动只含地址、偏移、计数、哈希、运行 ID 与判定。
- `node tools/task-state.ts p3/02 --json` 的 `details` 为空。

**清理：** 没有残留的 `exec-p3-02-*` 分支或 worktree；DOSBox-X 已退出，没有服务器或浏览器在运行。
