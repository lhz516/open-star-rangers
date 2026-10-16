---
type: plan
status: active
phase: P3
task: "08"
subtask: "33"
updated: 2026-10-16
---

# 33 — 契约与批准记录的补齐

**契约来源：** 29 的首次核对（goal [执行记录](../goal.md#执行记录) 2026-10-16）；用户 2026-10-15 的常设授权。
**依赖：** —
**执行方式：** 自动。由协调者依用户授权决定并记录。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 两个运行时故障 `ai-firing.lock-gun`（列表 1 当前挂点为 +0x18 ≠ 0 的炮）与 `ai-piloting.main-weapon` 不在已批准契约中：在 P3-02 CR-15 的运行时故障清单中记录二者（切片真实内容不触发，原版越界读取），并作为 CR-24 的决定记录批准与被排除方案；同步 P3-08 spec 第 133 行一带“只剩两个运行时故障”与 `negative-delay` 的过时表述。
- 在 P3-02 的审批节补记 2026-10-15 执行中 P3-08 的契约修订：CR-24 决定 16、17，CR-15 的变化（撤销 `negative-delay`、澄清 `missing-transponder`、加入 `ai-interpreter.channel` 与上项两个故障），CR-23 的 AI 锁定时序更正，`canonicalTextLength` 提高到 2²⁵；CR-25 的版本号注明合并后的实际值（规则 7、快照 6、replay 3）。
- 在 P3-08 spec 的审批节补记 2026-10-16 的两批决定（e-02/wii-01/wii2-01 的窗口计入、已知限制第 11–16 项、b-09 布局更正、27 的四项决定）。
- 把合并 P3-09 与 P3-10 留下的两个联合故障记入 core.md 的已知差异或交接（负责：P3-09 的 MW-04 或 P3-10 的 CB-07），使其在合并到 main 后仍有记录。
- 文字修正：26 的完成证据中已被 2026-10-16 决定取代的“未满足/待定”表述（加注取代说明，不删历史）；B-011 跨任务项补 P3-11 救援与 P3-10 停靠；26 完成证据中引用的单条指令改为“地址加含义”的写法。

## 不包含

- 行为与代码变化；其他任务的契约。

## 关键文件与契约

- [P3-02 spec](../../02/spec.md)、[P3-08 spec](../spec.md)、[core.md](../../../../engineering/modules/core.md)、[B-011](../../../../original/behavior/B-011-ai-wingman.md)、[26](./26-original-formal-runs.md)。

## 写入范围

- `docs/plan/p3/02/spec.md`：CR-15、CR-24、CR-25 与审批节。
- `docs/plan/p3/08/spec.md`：过时表述与审批节。
- `docs/engineering/modules/core.md`：联合故障的记录。
- `docs/original/behavior/B-011-ai-wingman.md`：跨任务项。
- `docs/plan/p3/08/subtasks/26-original-formal-runs.md`：取代说明与指令写法。

## 验收标准

- [x] 两个运行时故障、2026-10-15 与 2026-10-16 的各项决定都在相应 spec 的正文与审批节有记录，引用用户授权原话。
- [x] 联合故障在 core.md 有负责任务的记录；文字修正完成。
- [x] 链接与锚点检查、`pnpm check:compliance` 通过；没有原版内容。

## 验证方法

- 逐项对照 29 的核对报告；链接检查；git 审阅。

## 完成证据

2026-10-16，由协调者依用户 2026-10-15 的常设授权（原话：“approve D-01 and continue working. i authorize you to make decision to approve future decisions.”）决定、本子任务记录；只改文档，没有行为与代码变化，未提交。

- **两个运行时故障（[P3-02 spec](../../02/spec.md)）：** CR-15 的运行时故障清单在 `ai-interpreter.channel` 之后加入 `ai-firing.lock-gun`（AI 锁定 `0x5dfec` 时列表 1 的当前挂点是炮记录 +0x18 字节 ≠ 0 的炮，原版越过炮记录读取；切片中开启 AI 锁定的 AI 机体列表 1 没有炮，P3-08/18）与 `ai-piloting.main-weapon`（提前量模式 5 而列表 0 没有当前的炮，空列表时原版读到栈上的陈旧值；切片不可达，P3-08/17）；新增 [CR-24 决定 18](../../02/spec.md#cr-24-定稿的决定与已批准的差异d-01)，被排除：创建时拒绝（条件取决于运行时的挂点状态）、复现越界读取（不可复现）。[P3-08 spec](../spec.md#ai-输入与可达性) 的定稿一条：原因列表去掉 `negative-delay` 并注明由决定 16 撤销，“只剩两类故障”改为五项运行时故障。[core.md](../../../../engineering/modules/core.md#已知差异) 的 P3-08 项目规则一条注明这两项为决定 18。
- **P3-02 的审批节：** 新增“2026-10-15/16 修订”一条：CR-24 决定 16、17、18；CR-15 的变化（撤销 `negative-delay`、澄清 `missing-transponder`、加入 `ai-interpreter.channel` 与两个故障）；CR-23 的 AI 锁定时序更正（18）；`canonicalTextLength` 提高到 2²⁵（23）；版本实际值。CR-25 的版本一项加注合并后的实际值：`RULES_VERSION` 7、快照格式 6、replay 格式 3、转换器 `osr-import.graphics-5.logic-4.audio-2.models-4`（与 `rules-version.ts`、`snapshot.ts`、`recording.ts`、`production-package.ts` 核对）。
- **P3-08 spec 的审批节：** 新增“2026-10-16 批准”一条。第一批：e-02、wii-01、wii2-01 只计已完整走完的窗口中的合格样本（wii2-01 排除 60 个 `pointer-null`）；wii-01 之后改为约 1 小时修正短运行的重做；已知限制第 11–15 项；b-09 布局更正为 C（第 6 项改为缺布局 A）。第二批是 27 的四项决定：接受窗口结束游戏状态的间接证据；K-07 静止窗口按 Φ_F 判定并改了措辞（如实注明在 27 计算两边结果之后改写，理由是原措辞与规则矛盾）；已知限制第 16 项；接受独立读取的静态操作数。正文原有的决定不变，各条只引用它们。
- **联合故障（core.md）：** [已知差异](../../../../engineering/modules/core.md#已知差异)新增“未决的 P3-09 × P3-10 联合故障”：停靠倒计时到期与 `request-warp` 同 tick（下一 tick 自动离港时 `docking.view-switch` 故障）；同批 `[launch, request-warp]`（Warp 按停靠位置判定、从离港位姿开始，可能 `warp.start-check` 故障）；负责修订 P3-09 的 MW-04 或 P3-10 的 CB-07，附合并说明中的候选方案，P3-08 不修复。交接的 P3-10 一条（来自 P3-09）加入指向它的一项。
- **文字修正：** [26](26-original-formal-runs.md#完成证据)：wii2-01 的“待协调者决定”、b-09 布局的“与 spec 不符”、清单外五项的“交协调者”与第一条验收标准的“未满足”各加取代说明，原文保留；`0x5dda2` 一行改为“`0x5dcd4` 中经控制器 C+0xFC 间接调用所存处理器的返回点”。[B-011](../../../../original/behavior/B-011-ai-wingman.md) 的跨任务联合项补停靠（P3-10，Q3：只看第一个种类 2 对象，活动且在半径内时随之停靠与修理）与救援（P3-11，Q4：不触及控制器），二者都在测量窗口之外、没有原版样本，以及各自的覆盖途径。
- **检查：** 链接与锚点检查（会话脚本 `check_links.py`，覆盖六个改动文件）0 个问题；`git diff --check` 通过；`pnpm check:compliance` 通过（`passed: true`）；`node tools/task-state.ts p3/08`：`execute-goal`，33 进行中。没有原版内容、反汇编或单个读数（只有地址、偏移与含义）。
- **复核：** 一次 rubber-duck 复核。采纳：P3-08 审批条补记 wii-01 之后的重做决定（偏离 2026-10-15“只限偶发失败”的重做规则）并把“补跑”的排除限于 e-02 与 wii2-01 之后；B-011 的停靠改为“只看第一个种类 2 对象”（Q3、`docking.test.ts`）；P3-02 审批条的出处补“或相应子任务的完成证据”（`ai-interpreter.channel` 只在 16 中记录）。复核确认版本值、两个故障的条件与联合故障的描述与代码和合并说明一致。
