---
type: plan
status: active
phase: P3
task: "08"
subtask: "32"
updated: 2026-10-16
---

# 32 — 交战份额的离场条件

**契约来源：** [spec](../spec.md) 的 S-07、AC-06；[executable A9](../../../../original/formats/executable.md#a9-engagement-share-0x632a4c-difficulty-path-5--confirmed-code)；本 goal 的[执行记录](../goal.md#执行记录)中 25 之后的核对。
**依赖：** —
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- A9 写明交战份额 `0x632a4` 在 AI 目标**停放**时请求离场（`0x5e6cc`）；Core 的 [ai-targeting.ts](../../../../../src/core/rules/ai-targeting.ts) 在目标“不是活动”时请求，停靠（+2 = 3）等非活动状态也会触发。切片运行中目标都是停放的基地，结果没有差别。
- 用只读 Ghidra（私有项目副本，`-noanalysis -readOnly`）读取 `0x632a4` 该分支的原生比较（+2 的哪个取值、有无符号），确定原版条件；Core 与原版不同时修正，并加入停靠目标的规则测试；相同时只在完成证据中记录依据。
- 把核实结果补入 executable A9（只记地址、比较语义与置信度）。

## 不包含

- 其他交战份额分支；离场请求的处理（21 已完成）。

## 关键文件与契约

- 已有：[ai-targeting.ts](../../../../../src/core/rules/ai-targeting.ts)、其测试、[executable A9](../../../../original/formats/executable.md)。

## 写入范围

- `src/core/rules/ai-targeting.ts`：离场条件。
- `src/core/rules/ai-targeting.test.ts`：停靠目标的测试。
- `docs/original/formats/executable.md`：A9 的核实结果。
- `local/research/p3-08/share-departure/**`：只读 Ghidra 输出（被忽略）。

## 验收标准

- [x] 原版条件有原生指令依据（已确认，代码），写入 A9。
- [x] Core 的条件与原版一致，有覆盖停放、停靠与活动目标的测试；`pnpm check` 通过。

## 验证方法

- 只读 Ghidra；`pnpm check`；git 审阅。

## 完成证据

- **原生比较（已确认，代码）：** 私有项目副本（`local/research/p3-08/share-departure/`，`-noanalysis -readOnly`）的反汇编：`0x634e7`–`0x63500` 取主体 +0x90，为空或不再解析时到第 8 步；“去”成立后，`0x63552` 以零扩展读目标 +2，`0x63555`/`0x63558` 与 1 比较、不等即转 `0x635a3` 调用 `0x5e6cc`。因此 +2 ≠ 1 的任何取值（停放 0、停靠 3 等）都请求离场，且活动判断先于阵营判断（`0x63562`–`0x6357b` 只对活动目标执行）；`0x5e6cc` 返回 0 时转第 8 步。结果写入 [executable A9](../../../../original/formats/executable.md#a9-engagement-share-0x632a4c-difficulty-path-5--confirmed-code) 第 7 步。
- **Core：** [ai-targeting.ts](../../../../../src/core/rules/ai-targeting.ts) 的 `aiTarget.activity !== 'active'` 与 `if (call.depart()) return true` 已与原版一致，未修改。
- **测试：** [ai-targeting.test.ts](../../../../../src/core/rules/ai-targeting.test.ts) 新增“asks to leave for every +0x90 activity other than active”：停放、停靠（对方与本方阵营）各请求一次离场且不改 +0x8C；活动的对方目标被瞄准、活动的本方目标落到玩家，均不请求离场。把 Core 改为 `=== 'parked'` 时该测试失败（变异检查）；拒绝离场时落到第 8 步由已有测试覆盖。`pnpm check` 通过。
- **rubber-duck：** 无问题。
- **文档影响：** executable A9 已更新；unknowns 无相关条目；engineering、guides 与 STATUS 不受影响。实现代码未改，不需 simplify。
