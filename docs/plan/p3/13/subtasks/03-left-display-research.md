---
type: plan
status: active
phase: P3
task: "13"
subtask: "03"
updated: 2026-10-25
---

# 03 — 状态、能量与 Warp 页研究

**契约来源：** [spec](../spec.md#左显示屏) 的 S-06/S-13，Q-05/Q-06/Q-13，AC-10/21。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 核对 MFDD 背景比例、叠加次序、Core 已有 blink/字段 1/5/8 与显示相位的边界。
- 核对 DIAG 换行、评级越界、启动消息计数、零间隔的每调用单字符上限；MessageTiming 字段单位明确为原版时钟语义。
- 核对能量条、Warp 三读数与有界历史、页/子系统到期以及 SNIP 切换与随机抽取。

## 不包含

不研究菜单/来电文字（05），不改变页面切换和 Warp 规则。

## 关键文件与契约

- [displays.ts](../../../../../src/core/systems/displays.ts)、[status-messages-payload.ts](../../../../../src/content/hud/status-messages-payload.ts)。
- [hud](../../../../original/formats/hud.md) 的 DIAG/SNIP 与 [executable](../../../../original/formats/executable.md) 的 D9/D15。

## 写入范围

- `local/research/p3-13/03-left-display/**`：私有字段、时序、像素依据与随机清单。

## 验收标准

- [ ] 各页读数、满刻度、颜色与节奏来源可追溯，DIAG 非法索引不以任意文字替代。
- [ ] Core 已有闪烁事实与纯显示缓存分开，Warp 新序号重置有明确边界。
- [ ] 供 07/08 的必需字段、容量和未知项完整。

## 验证方法

按[原版证据指南](../../../../guides/original-evidence.md)复用截图 066/068/100 与损伤样本、只读代码；原始素材不入本文。无新增代码不跑构建。

## 完成证据
