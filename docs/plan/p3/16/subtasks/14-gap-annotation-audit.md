---
type: plan
status: active
phase: "P3"
task: "16"
subtask: "14"
updated: "2026-10-30"
---

# 14 — 缺省与标注审计

**契约来源：** [spec](../spec.md) 的 S-07、AC-13、[缺省与范围判定](../spec.md#缺省与范围判定)。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 逐项核对 G-01 至 G-10（含 G-02/1 至 G-02/10）：已有的范围或批准依据（[P3-01 缺省清单](../../01/spec.md#缺省清单)与审批节、阶段索引），界面标注（`data-gap` 与文案），以及文档（[slice-gaps](../../../../engineering/slice-gaps.md)）。G-09、G-10 引用 P3-06 检查点 C 的既有排除，并核对闭环不依赖自动驾驶或强制调试。G-08 包含 F1 重绘差异的披露。
- 核对临时资源与近似规则：没有未替换的临时资源，也没有未披露的近似规则（[ADR-0007](../../../../decisions/ADR-0007-narrow-p2-overlap-p3.md)）。
- **取证方式：** 在当前候选的开发与生产构建中用合成内容取证，按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)。[P3-15/09](../../15/subtasks/09-annotation-audit.md#完成证据)、[12](../../15/subtasks/12-f1-disclosure.md#完成证据) 的证据只有在其候选到当前候选之间没有 UI 文案或标注的改动时才可复用；04 只改 Core，复用时写明依据。

## 不包含

- 新增或重新定义 G 项；修改标注（漏标时交修复项）。

## 关键文件与契约

- [slice-gaps-copy.ts](../../../../../src/ui/mission/slice-gaps-copy.ts)、[MissionParts.tsx](../../../../../src/ui/mission/MissionParts.tsx)、[slice-gaps](../../../../engineering/slice-gaps.md)。

## 写入范围

- `dist/**`：生产构建（被忽略）。
- `local/research/p3-16/gaps/**`：页面记录（被忽略）。

## 验收标准

- [ ] AC-13：每个 G 项（含 G-02 子项）都有依据、界面位置与文档位置；G-09、G-10 引用既有排除并核对闭环不依赖它们。
- [ ] AC-13：没有漏标、未替换的临时资源或超范围的项；如有则判为失败并交修复。

## 验证方法

- 开发与生产构建的合成页面核对，或写明复用依据；对照权威 G 清单。

## 完成证据
