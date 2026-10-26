---
type: plan
status: active
phase: P3
task: "13"
subtask: "02"
updated: 2026-10-25
---

# 02 — 角落仪表与雷达研究

**契约来源：** [spec](../spec.md#前视驾驶舱与仪表) 的 S-05/S-13，Q-03/Q-04/Q-13，AC-09/21。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 核对类型 0–3 几何、颜色、子系统分支、满刻度与零/负分母；速度用 atB8，不能误用动态 maximumSpeed。
- 完成 T6 相机平面偏移、零方向、投影、形状/闪烁与严格到期研究；真实点和噪点、目标框的 120 项保护政策分别列出。
- 清点相关显示随机抽取，区分原版越界和已批准保护；交 07 入档、08 定稿。

## 不包含

不改真实接触点筛选、Core RNG，不重做 P3-07 战斗规则。

## 关键文件与契约

- [radar.ts](../../../../../src/core/rules/radar.ts)、[combat.ts](../../../../../src/core/projections/combat.ts)。
- [executable](../../../../original/formats/executable.md) 的 T6/D16，[hud](../../../../original/formats/hud.md)。

## 写入范围

- `local/research/p3-13/02-gauges-radar/**`：私有静态研究与独立期望计算。

## 验收标准

- [ ] 满刻度、方向、容量与到期等号的输入/结果有独立依据。
- [ ] 显示随机与 Core 状态责任明确；未确认语义列为缺口。
- [ ] 对应截图只能证明的外观范围与语义映射证据分开。

## 验证方法

[原版证据指南](../../../../guides/original-evidence.md)：静态优先，复用已有截图；负对照与预期不能由候选画面反推。无代码不运行应用检查。

## 完成证据
