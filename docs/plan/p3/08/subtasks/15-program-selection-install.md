---
type: plan
status: active
phase: P3
task: "08"
subtask: "15"
updated: 2026-10-15
---

# 15 — 程序选择、安装与控制器调度

**契约来源：** [spec](../spec.md) 的 S-04、AC-03；[程序选择与安装](../spec.md#程序选择与安装)；01 的研究与 08 定稿的阶段与抽取。
**依赖：** 14。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/core/rules/ai-selection.ts`：`0x5de18`/`0x5dbc8` 的选择（随机起点、完全/部分匹配、内置回退）与 `0x5dc0c` 的控制器初值与限值换算。
- [spawn.ts](../../../../../src/core/systems/spawn.ts) 中 `0x20990` 的位置：安装种类回调与 AI 程序，抽取在实例化扩展中的原版相对位置。
- 计划新增 `src/core/systems/ai.ts`：对象更新中的控制器步 `0x5dcd4` 骨架（期限 +0xF0 与周期、按 08 定稿以活动或停放处理器分派、模式 0/1/2 的调用），由 [pipeline.ts](../../../../../src/core/systems/pipeline.ts) 的 `updateObject` 静态调用；尚未实现的处理器身份已被 14 在创建时拒绝，不建空处理器。
- [area.ts](../../../../../src/core/systems/area.ts) 的停放切换：在原版的状态 5/0 位置移除与重装控制器（停放对象用停放处理器），重装的抽取按原版。
- 测试：选择的支持集与原像计数、优先次序、载入变换、抽取位置与次数、期限比较的等号与跨阈值、停放/恢复/被毁/移除时不漏抽或额外抽取。

## 不包含

- 表程序解释器（16）；具体内置处理器（18 的基地、19 的僚机、21 的停放）；驾驶（17）。

## 关键文件与契约

- 已有：[spawn.ts](../../../../../src/core/systems/spawn.ts)、[area.ts](../../../../../src/core/systems/area.ts)、[pipeline.ts](../../../../../src/core/systems/pipeline.ts)。
- 计划新增：`src/core/rules/ai-selection.ts`、`src/core/systems/ai.ts` 及其测试。

## 写入范围

- `src/core/rules/ai-selection.ts`：选择与控制器初值（新建）。
- `src/core/rules/ai-selection.test.ts`：测试（新建）。
- `src/core/systems/ai.ts`：控制器步（新建）。
- `src/core/systems/ai.test.ts`：测试（新建）。
- `src/core/systems/spawn.ts`：`0x20990`。
- `src/core/systems/spawn.test.ts`：实例化测试。
- `src/core/systems/area.ts`：停放切换时的重装。
- `src/core/systems/area.test.ts`：停放测试。
- `src/core/systems/pipeline.ts`：对象更新中的静态调用。
- `src/core/replay/snapshot.test.ts`：可为 null 的控制器。
- `src/core/replay/combat-replay.test.ts`：选择抽取改变 RNG 次序后的期望。

## 验收标准

- [x] AC-03 的各项由独立期望的测试覆盖。
- [x] 控制器状态全部在 12 定义的形状中，进入快照；没有空处理器或注入回调。
- [x] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 通过。

## 验证方法

- Node 规则与实例化测试，期望由 01 的记录独立推导。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据

- **实现：**
  - `src/core/rules/ai-selection.ts`：`selectProgram`（`0x5dbc8`：选择种类外不抽取；组表 1 次抽取、起点 rand mod 条目数，经 14 的 `scanProgramTable` 取完全匹配、否则最后的部分匹配；都没有时第 2 次抽取扫描内置表；仍无则 `none`），`selectionSubject`、`selectsProgram`；`installedController`（`0x5dc0c` 清零后写周期、限值 a/b（经 `steering.ts` 的 `steeringLimits`，与导弹同一换算）、饱和与滚转阈值位拷贝、`aiLock` false，`0x5c530` 与 `0x5c768(1.0, 1.0, 0)` 的转向块初值；无抽取）；`isControllerDue`（采样 > 期限，经 `isDue`）。
  - `src/core/systems/spawn.ts`：实例化第 13 步在 Warp 计时之后、`0x38cd4` 之前写 `ai.program`（`controller` 为 null）。
  - `src/core/systems/ai.ts`：`0x20c18` 的控制器部分。`controllerCall` 按状态决定安装（0–3：已选择且未安装；停放时停放处理器，否则解释器或内置记录的处理器）、移除（5、6：经安装它的处理器）、AI 步（7），4 与 8 不调用；`installController`/`removeController` 导出给 21 的 Warp 离场。处理器为静态表 `HANDLERS`，本项之后为空（协调者批准的方案 A，见 goal 执行记录）：未接入的处理器不安装（控制器保持 null，不调用、不抽取），已安装控制器的处理器缺失则故障（`ai.unwired`），步的分派与活动不一致则故障（`ai.dispatch`）。
  - `src/core/systems/pipeline.ts`：机体的回调为过境检查 → `updateController` → 通用部分 `0x20ae4`（`requestNextState`）→ P3-10 的 `0x3bed0`；`updateLifecycle`（导弹使用）行为不变。
  - `area.ts` 无需改动：移除在状态 5 的回调中（对象更新），消息 0x20 的停放切换把状态重置为 0/1，下一次回调重装（ai §1），由 `ai.ts` 的状态分派实现。
- **测试（期望由 ai §1、§1.1、A1/A2 与 CR-23 独立推导）：** `ai-selection.test.ts` 14 项：选择种类集合与不抽取；起点 rand mod 3 的原像计数 10,923/10,923/10,922 与完全匹配的扫描次序；0x80000000 取 `NEG` 后仍为负、只剩部分匹配时取扫描中最后一个；完全匹配优先、组表匹配时恰 1 次抽取；有符号比较的等号与 +0x04 = 1 跳过；内置表回退的第 2 次抽取、两表皆无时 2 次抽取后为 none；空表故障；载入变换（掩码 0 → 0x380 只匹配种类位 7、8、9，+0x2C ±0 → 饱和 1.0）；`0x5dc0c` 的全部初值与周期、限值故障；期限比较的等号（等于不到期，+1 到期）。`ai.test.ts` 8 项：实例化只选择（槽有记录、无控制器；玩家与 Xpon 为 none）；各状态 × 活动 × 槽类型的调用与处理器；无控制器时 4–8 不调用；已安装时 0–3 不重装、5/6 经安装处理器移除、7 为步；内置记录无处理器的故障；未接入时安装不改变槽、不抽取、无事件；40 tick 内反复停放/恢复不重选；已安装而处理器未接入、分派不一致的故障。`spawn.test.ts`：选择抽取位于 Warp 计时之后、`0x38cd4` 的台词抽取之前（四条表记录使所选记录区分抽取位置，种子 1）；僚机 2 次抽取选内置记录 3；各既有用例的抽取计数加入选择。
- **交接（协调者批准的方案 A）：** AC-03 中“安装在首次回调且同一调用运行一次更新体及其抽取”与“停放、恢复、被毁与移除时重装/释放的抽取”的端到端抽取证据，由接入处理器的 16（解释器）、18（基地）、19（僚机）、21（停放，含 Warp 离场的立即安装）各自在把处理器加入 `HANDLERS` 时以测试覆盖；本项覆盖调用的决策、位置、配置值与不重选。救援不触及控制器：本项不加任何救援路径的调用（P3-11 接入救援时验证）。
- **范围内的连带修改：** 选择抽取改变 RNG 次序：`snapshot.test.ts` 的叶子遍历把未安装的 `controller` 列为可为 null 的对象；`combat-replay.test.ts` 改用种子 10，使碎片仍击中玩家（默认种子下改为玩家在 tick 107 撞上种类 8 的机体），碰撞受害者断言改为“只有玩家”。
- **检查：** `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 通过；`pnpm check` 通过（9,688 项）。机器高负载（load ≈ 10，其他 worker 并行）时 `budget.test.ts` 与 `snapshot.test.ts` 的两项长测试两次超过 5 s 默认超时；单独运行约 2.2–3 s，与基线提交相同，负载降低后整套通过。
- **rubber-duck：** 无阻塞或非阻塞问题。simplify：采纳 `isControllerDue` 复用 `isDue`、`ai.ts` 复用 `ControllerRecord`、去掉乘 1 的换算；未采纳：合并 `steeringLimits` 的两次调用（需改范围外的 `steering.ts`）、复用 `installHoming` 的周期检查（它不检查 i32 上界）、把 `updateLifecycle` 改为带前置步的形式（导弹路径不需要）。
- **文档影响：** `docs/original/` 无新事实；`docs/engineering/modules/core.md` 的流水线与实例化扩展说明已过时（12、14 已记交 28），本项交 28 补：实例化第 13 步的选择、对象更新中的控制器部分与 `HANDLERS` 的接入规则。
