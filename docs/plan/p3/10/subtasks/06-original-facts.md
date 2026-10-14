---
type: plan
status: active
phase: P3
task: "10"
subtask: "06"
updated: 2026-10-14
---

# 06 — 原版事实入档与 U 项更新

**契约来源：** [spec](../spec.md) 的 S-11、AC-16；[原版研究](../spec.md#原版研究)的“U 项”一条；[当前实现与依据](../spec.md#当前实现与依据)中起草时的有界数据核对。
**依赖：** 01, 02, 03, 04, 05。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 把 01 至 05 的 findings 草稿并入跟踪的原版文档：[executable](../../../../original/formats/executable.md)（新节，英文，沿用 P3-07 各节的写法）、[comm](../../../../original/formats/comm.md)（菜单状态机、可达键闭包与项数上界）、[hud](../../../../original/formats/hud.md)（TABL 10165 选择值的含义）与 [B-004](../../../../original/behavior/B-004-base-communications.md)（中文，原版行为结论与置信度）。每条带置信度与证据，只记地址、结构与行为。
- 归档起草时的数据核对：复核 `local/research/p3-10/spec/` 的记录，把结论（只有布尔值与计数）写入 comm，记录证据位置。
- 更新 [unknowns](../../../../original/unknowns.md) 的 U-010（停靠规则细节）、U-022（基地操作的精确条件）、U-030（TABL 10165 选择值的含义）；U-031 等其他任务的发现只写交接，负责阶段不改。
- 汇总交 07、08 的输入：字段与单位、写入阶段与重置、与 spec 方向的冲突。

## 不包含

- 关卡定稿（07、08、10）；任何实现。
- 改写已冻结评审或其他任务的结论；与已记录事实冲突时按“已确认事实以新证据更正”的方式补写，并注明更正来源。

## 关键文件与契约

- 01 至 05 的 `local/research/p3-10/*/findings.md`。
- [原版证据获取的记录规则](../../../../guides/original-evidence.md#记录)。

## 写入范围

- `docs/original/formats/executable.md`：新节与交叉引用。
- `docs/original/formats/comm.md`：菜单状态机与可达性结论。
- `docs/original/formats/hud.md`：TABL 10165 选择值的含义。
- `docs/original/behavior/B-004-base-communications.md`：行为结论与置信度。
- `docs/original/unknowns.md`：U-010、U-022、U-030 的状态与交接。
- `local/research/p3-10/spec/**`：起草时数据核对的复核记录（被忽略）。

## 验收标准

- [ ] Q-01 至 Q-11 的事实都已写入对应原版文档，带置信度与证据；达不到门槛的项写明已尝试的途径与恢复条件，并在完成证据中列出受影响的 AC。
- [ ] 起草时的数据核对已复核并归档到 comm；“所有菜单至多 5 项”之类与 comm §5 矛盾的说法没有出现。
- [ ] U-010、U-022、U-030 已更新；其他任务的发现已写交接。
- [ ] 各文档 `updated:` 为修改日期；链接与锚点有效；`pnpm check:compliance` 通过；仓库中没有原版内容、反编译输出或读数。

## 验证方法

- 逐条对照 01 至 05 的 findings 与入档文本；检查链接、锚点与元数据。
- `pnpm check:compliance`；git 审阅只改写入范围内的文件。

## 完成证据
