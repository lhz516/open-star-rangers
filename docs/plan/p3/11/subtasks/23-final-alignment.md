---
type: plan
status: active
phase: P3
task: "11"
subtask: "23"
updated: 2026-10-24
---

# 23 — 最终对齐

**契约来源：** [spec](../spec.md) 的 S-01 至 S-12、AC-01 至 AC-16。
**依赖：** 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 逐项核对 [验收覆盖](../goal.md#验收覆盖)：每个 S 与 AC 都有实现与验证证据，证据指向相应 subtask 的完成证据。
- 核对关键不变量：全清/预结算/锁存/完成四个时点分开；第三次损失才失败；救援恢复顺序；退场后活实体归零；完成后 step 不污染读取；Core 纯度；replay 与占位用时无关；没有未披露的占位或近似规则；没有原版内容进入受跟踪文件。
- 核对 D-01、D-02 的批准记录与实现一致；未运行或 blocked 的分支已如实记录。
- 运行工程检查：`pnpm check`、`pnpm check:compliance`、`pnpm test:e2e`（本任务与受影响的既有 spec）；工具改动时运行 `python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'`；`node tools/task-state.ts p3/11`。
- 不交付新功能代码；缺口交协调者新增修复子任务，插入本行之前。

## 不包含

- 新功能、文档补写（缺口另设子任务）。

## 关键文件与契约

- [goal](../goal.md)、各 subtask 的完成证据、[spec](../spec.md)。

## 写入范围

- 无。

## 验收标准

- [x] S-01 至 S-12、AC-01 至 AC-16 全部有证据，或有明确记录的 blocked 项与恢复条件。
- [x] 关键不变量逐项核实。
- [x] `pnpm check`、`pnpm check:compliance`、相关 `pnpm test:e2e` 与适用的 Python 测试通过。
- [x] `node tools/task-state.ts p3/11` 不报计划问题。

## 验证方法

- 逐项核对证据与上列命令；git 审阅确认没有越界修改或原版内容。

## 完成证据

2026-10-24，协调者在目标分支 `p3-11-mission-events-spec` 上核对（本行不写代码）。

- **验收覆盖：** 01 至 22 的验收复选框全部勾选，均有完成证据，S-01 至 S-12、AC-01 至 AC-16 逐行对应 [验收覆盖](../goal.md#验收覆盖) 所列子任务的证据。AC-15 中按 D-02（D2-4、D2-5）只能顺带取得、本次运行未出现的项保持 blocked，恢复条件写在 [20](./20-original-formal-runs.md#完成证据)、[21](./21-comparison-conclusions.md#完成证据) 与 goal 执行记录：#5 C-13；#6 (a)(b)(c) C-16–C-18；#7 停靠、基地视角与 Warp 中被毁；#8。这些项由用户逐项决定（追加启动 / 代码与 Node 的限定结论 / 继续 blocked），不算作已通过。
- **关卡与实现：** D-01 于 2026-10-22、D-02 于 2026-10-23 由用户明确批准（P3-02、P3-04 与本 spec 的审批节）；实现与之一致：`settlement-failed` 的竞态（10）、锁存当 tick 开始退场并在下一 tick 完成（14）、`mission-ended`（14）、完成后 step 的非锁存 `CoreInputError`（14、15）、选择值只接受 ≤ 0 与 13–19（09）、`rescue.throttle` 故障（12）、不建模扇区预算（12）、`RULES_VERSION` 8 与快照格式 7、replay 格式 3、replay-check 报告 v2（08、15）、会话 `completed` 与终局占位（16、17）。
- **关键不变量：** 全清、预结算、锁存与完成分为四个状态与事件（08、10、14，比较器按 ME-13 强制次序）；只有第三次损失才失败（12）；救援恢复次序按 ME-10（12，21 的单次转移 53/53 一致）；退场后实体表与 AI 解析缓存为空才完成，否则为 Core 故障（14）；完成后 step 不改世界、不污染读取（14、15）；Core 纯度由 `pnpm typecheck`/`pnpm lint` 强制；replay 与占位用时无关（15、16、18 的录制在 Node 中重放一致）；G-02/5 至 G-02/10 与 G-06 的占位都已在 slice-gaps 中披露（22）；`pnpm check:compliance` 未发现原版内容。22 指出的几处措辞为历史性的注释（`projection.ts:307`、`map.ts:32` 的“P3-11 之前不可达”，`systems/radio.ts:130`、`systems/spawn.ts:82` 中“P3-11 添加/清除”）描述的是现状，不是未披露的占位或近似，不另设修复子任务。
- **检查：**
  - `pnpm check`：354 个测试文件、10,302 项通过，构建成功（22 集成时；其后只改文档）。
  - `pnpm check:compliance`：通过，无发现。
  - `pnpm test:e2e`（全部 237 项）：236 通过，1 项失败：`mission-flow.development.spec.ts:451` 的“the held yaw reached the recording”。单独重跑 5/5 通过；连同 `keyboard-input` 两个 spec 整体重跑 24/24 通过。P3-11 对输入路径的唯一改动是 `input-consumer.ts` 中截断帧的判定，只对 `cut: 'completed'` 改变行为，而该测试的运行不会到达终局，所以判为负载下的偶发计时失败，不是回归。
  - `python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'`：231 项通过（20 集成时；其后 `tools/baseline` 未变）。
  - `node tools/task-state.ts p3/11`：无计划问题。
- **git 审阅：** 各子任务的集成提交只含其写入范围内的路径（范围扩大均有协调者的范围提交）；`local/` 为忽略目录，没有原版内容、私有读数或反编译输出被跟踪；没有遗留的 DOSBox-X 进程或 worker 工作树。
