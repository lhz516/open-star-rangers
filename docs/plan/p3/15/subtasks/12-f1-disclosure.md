---
type: plan
status: active
phase: "P3"
task: "15"
subtask: "12"
updated: "2026-10-30"
---

# 12 — F1 `cockpit-front` 的缺省披露（修复项）

**契约来源：** [spec](../spec.md) 的 S-08、AC-09、[技术决定](../spec.md#技术决定)末条；09 的审计发现（F1 `cockpit-front` 在 Core 仍为 `not-implemented`，没有标注、清单条目或批准的处置）。处置决定见 [goal 执行记录](../goal.md#执行记录) 2026-10-29“F1 处置”。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 原版事实（已确认，代码，[executable 的按视角分派按键](../../../../original/formats/executable.md)）：F1/Up 在飞行按键上下文把视角设为 0xC；地图、Warp、基地的按键上下文不处理视角键；被毁序列中不轮询按键。P3 只有前视驾驶舱（0xC），被毁视角不轮询按键，因此在 P3 可达的所有状态中原版 F1 都不改变视角，与本构建没有视角或规则差异；差异在于原版在前视中按 F1 仍重选布局并全量重绘驾驶舱（已确认，代码；见完成证据的更正），以及开发可见的命令结果（Core 返回 `rejected`/`not-implemented`）。
- 按已批准的处置把 F1（及 `ArrowUp`、NumLock 与 Shift 状态相同的 `Numpad8` 等前视别名）并入 G-08 披露：F1 的 Core 效果随 G-08 的其他视角在 P4 一并实现；P3 中 F1 仍提交 `cockpit-front`，Core 返回 `not-implemented`，不改为 G-08 拦截（P3-02、P3-05 不允许以 G-08 禁掉 F1）。
- 更新：
  - [P3-01 spec](../../01/spec.md) 的缺省清单 G-08 一行补充 F1 与前视别名的处置，并在其审批节追加修订与批准记录（依据用户对本 goal 执行中修改 spec 与决定的授权）。
  - [slice-gaps](../../../../engineering/slice-gaps.md) 的 G-08 行与说明。
  - [slice-gaps-copy.ts](../../../../../src/ui/mission/slice-gaps-copy.ts) 的 G-08 文案：说明本构建只有前视驾驶舱，F1 与前视别名停留在该视角，其他视角由 P4 补齐；同步 [mission-copy.test.ts](../../../../../src/ui/mission/mission-copy.test.ts) 的期望。
  - [键位文档](../../../../engineering/keyboard-input.md) 与 [core 分册](../../../../engineering/modules/core.md) 中关于 F1 `cockpit-front` 的描述（core 分册现称 P3-12/P3-13 已按原版实现其效果，与代码不符，须更正为本处置）。

## 不包含

- 实现 `cockpit-front` 的 Core 效果、改变命令契约、`RULES_VERSION` 或 replay 版本。
- 改变绑定、拦截或提示行为（F1 不显示 G-08 提示）。

## 关键文件与契约

- [commands.ts](../../../../../src/core/systems/commands.ts)（只读：`cockpit-front` 走默认的 `rejectNotImplemented`）、[bindings.ts](../../../../../src/ui/game-input/bindings.ts)（只读）。

## 写入范围

- `docs/plan/p3/01/spec.md`：G-08 行与修订/批准记录。
- `docs/engineering/slice-gaps.md`：G-08 行与说明。
- `docs/engineering/keyboard-input.md`：F1 描述。
- `docs/engineering/modules/core.md`：F1 描述更正。
- `src/ui/mission/slice-gaps-copy.ts`：G-08 文案。
- `src/ui/mission/mission-copy.test.ts`：G-08 文案期望。

## 验收标准

- [x] G-08 的 UI 文案、slice-gaps、P3-01 清单与工程文档一致地披露 F1 与前视别名的处置，并注明原版事实的置信度与来源；没有声称 F1 已按原版实现。
- [x] 代码行为不变：F1 仍提交 `cockpit-front`，Core 仍返回 `not-implemented`，F1 不显示 G-08 提示。
- [x] `pnpm check` 通过；文档链接与元数据检查通过。

## 验证方法

- `pnpm test -- src/ui/mission/mission-copy.test.ts`，再 `pnpm check`；文档相对链接检查；`git diff` 只含写入范围内的文件。

## 完成证据

- **披露（2026-10-30）：** [slice-gaps-copy.ts](../../../../../src/ui/mission/slice-gaps-copy.ts) 的 G-08 文案（标题不变）写明本构建只有前视驾驶舱，F1 与前视别名（Up、作为 Up 的小键盘 8）停留在该视角、现在按下不改变任何状态，原版还会重绘整个驾驶舱，Core 规则随其他视角归 P4，原版其他视角（含光标与小键盘别名）未实现、由 P4 负责；[mission-copy.test.ts](../../../../../src/ui/mission/mission-copy.test.ts) 逐句核对。[slice-gaps](../../../../engineering/slice-gaps.md#g-08-与-f1-前视) 的 G-08 行与新的“G-08 与 F1 前视”一节、[P3-01 spec](../../01/spec.md#缺省清单) 的 G-08 行、视角范围 F1 一项与审批节的 2026-10-30 修订记录（引用用户授权）、[键位文档](../../../../engineering/keyboard-input.md)的实现状态与绑定表、[core 分册](../../../../engineering/modules/core.md#已知差异)的已知差异与 P3-12/P3-13 交接（删去“`cockpit-front` 的效果按原版”）一致更新。原版事实标注置信度并链接 executable 的按键上下文与视角键、cockpit 的全量重绘。
- **事实复核与更正：** rubber-duck（code-review 子代理）指出本文工作范围与 goal 执行记录中的前提“P3 可达状态中没有可见差异，原版为无变化的执行”不成立。核对本地反编译（只在 `local/`）与已入库事实：`0x216d4` 总是调用 `0x3f158`；新旧视角相同时 `0x3f158` 跳过换模式的部分与 `0x459a0`，但仍按 0xC 经 `0x49848` 选布局 0，而 `0x49848` 每次调用都清黑画面并强制驾驶舱全量重绘（已确认，代码，[executable](../../../../original/formats/executable.md#automatic-views-and-cameras-p3-0109)、[cockpit](../../../../original/formats/cockpit.md#instrument-records-scheduling-and-visible-persistence-p3-1301)）；能否察觉未经运行观察（未确认）。被毁序列中原版不读取该键，不是“无变化的执行”。视角与规则状态仍无差异，处置（披露、不改代码、归 P4）不变；各文档与 G-08 文案按此措辞，补充了呈现差异。
- **行为不变：** `git diff -- src/core src/ui/game-input` 为空；`bindings.ts` 中 F1/`ArrowUp`/`Numpad8` 仍绑定 `cockpit-front`，`commands.ts` 的默认分支仍为 `rejectNotImplemented`；未改命令契约、`RULES_VERSION` 或 replay 版本。e2e 中没有逐字断言 G-08 文案（G-08 只以 `data-gap` 断言；任务流程 E2E 的文案比对取自 `SLICE_GAPS` 且不含 G-08），未运行浏览器测试。
- **检查：** `npx vitest run src/ui/mission/mission-copy.test.ts` 9 项通过；`pnpm check` 通过（445 个测试文件、11900 项测试与生产构建）；改动文档的相对链接与锚点检查 0 个问题；`git diff --check` 无输出。
- **rubber-duck：** 唯一发现（上述事实前提）已采纳并修正；其余核对（行为不变、e2e、授权引文、锚点）无问题。
- **文档影响：** 已更新上述写入范围内的文档；建议协调者在 goal 执行记录中更正“没有可见差异”的前提，并可在 executable 的按键上下文与视角键一段补一句“当前视角的视角键仍重选布局”（不在本子任务写入范围）。
