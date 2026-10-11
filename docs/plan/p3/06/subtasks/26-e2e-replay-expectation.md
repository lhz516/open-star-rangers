---
type: plan
status: active
phase: P3
task: "06"
subtask: "26"
updated: 2026-10-11
---

# 26 — 合并 P3-07 后的浏览器重放用例期望

**契约来源：** [spec](../spec.md) 的 AC-08、AC-12；20 的最终对齐发现。
**依赖：** 18。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 背景

协调者在最终对齐（20）中新增本项（2026-10-11，依用户对新增子任务的预先授权，不需审阅）。合并 P3-07 后，完整 `pnpm test:e2e` 为 195 通过、1 失败：`e2e/browser-replay.spec.ts` 断言重放事件的类型集合恰为 `command-result`、`object-instantiated`、`speed-assist-toggled`，而 P3-07 的自动选择目标使事件中多出 `target-changed`。这是该用例对已合并规则的期望过时，不是 Core 或重放缺陷（Node 与浏览器的重放仍逐项相等：同一断言之前的 `compareReplayResults` 通过）。

## 工作范围

- 更新该用例的事件类型期望，使其包含 `target-changed`，并核对 `target-changed` 的出现确为 P3-07 自动选择目标所致（读 P3-07 的事件定义与该用例的脚本），不放宽比较或删去断言。
- 单独运行该用例，再运行 `pnpm check`；完整 e2e 在 20 中重跑。

## 不包含

- Core、重放与 P3-07 规则的任何改动；其他 e2e 用例。

## 写入范围

- `e2e/browser-replay.spec.ts`

## 验收标准

- [x] `pnpm test:e2e e2e/browser-replay.spec.ts --project=development` 通过，且断言仍精确（事件类型集合相等，不是子集）。
- [x] `pnpm check` 通过；改动只在写入范围内。

## 验证方法

- 上述命令；审阅 diff。

## 完成证据

2026-10-11，worker 在认领提交 `842a9815` 上完成；仅修改该用例的一行期望与本项证据，不修改 Core、其他用例或 goal tracker。

- **复现与修正：** 修改前单独运行该用例，唯一失败为事件类型集合多出 `target-changed`；加入该类型后仍使用 `Set` 的 `toEqual` 精确相等，不改事件、检查点、版本拒绝或浏览器与 Node 的逐项比较。
- **来源核对：** [脚本](../../../../../e2e/browser-replay.spec.ts) 只发送 `fire`、`select-number`、`map-point` 与 `speed`，没有 `target` 命令。[targeting.ts](../../../../../src/core/systems/targeting.ts) 的 `selectAutomaticTarget` 在玩家没有目标时投递 `origin: 'automatic'` 的 `select-target` 请求；`applySelectTarget` 应用请求并发出 `target-changed`。[pipeline.ts](../../../../../src/core/systems/pipeline.ts) 在可用玩家的命令与操纵处理后调用自动选择。另一投递入口 `judgeTargetCommand` 不会由本脚本触发，因此新增类型来自 P3-07 自动选择，而不是重放差异。
- **浏览器验证：** `OSR_E2E_DEV_PORT=5178 OSR_E2E_PREVIEW_PORT=5179 pnpm test:e2e e2e/browser-replay.spec.ts --project=development` 为 1/1 通过。macOS，Node `v22.22.0`，Chrome `155.0.8059.39`（Chromium、headless），隔离测试 context，视口 1280×800，开发 origin `http://127.0.0.1:5178`。仅用既有合成内容，320 tick 的录制经 JSON 往返后浏览器与 Node 的事件、检查点及最终结果相等；篡改检查点和五种不兼容记录的拒绝断言仍通过。测试自有浏览器与两台服务器已关闭，5178/5179 无监听。
- **工程验证：** `pnpm check` 通过：TypeScript、ESLint、264 个文件中的 7,878 项测试及生产构建。`git diff --check` 通过。完整 e2e 按分工留给 20。
- **审查与整理：** rubber-duck 审查无阻塞或非阻塞问题；对单行 diff 直接执行 simplify 检查，无重复逻辑、额外复杂度、无效计算或抽象层次问题，无需整理。
- **文档影响：** 核对工程测试约定与重放说明；本项只更新已合入规则下的测试期望，不改变 API、命令、测试步骤、原版事实或冻结决定，除本项证据外无需同步文档。
