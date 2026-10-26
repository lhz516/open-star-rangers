---
type: plan
status: active
phase: P3
task: "13"
subtask: "07"
updated: 2026-10-25
---

# 07 — 原版事实与对照判据基线

**契约来源：** [spec](../spec.md#表现对照与判定) 的 S-13，Q-01 至 Q-13，AC-07/21/22。
**依赖：** 01, 02, 03, 04, 05, 06。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 将 01–06 的结论写入对应 original 文档，按事实来源标置信度，汇总 Q-13 的全部随机读取及规则/表现边界。
- 预注册 V-04/V-05 的逐元素输入、证据身份、掩码、负对照和容差；区分静态像素、动态图元外观、语义映射、真实节奏。
- 审计旧截图 46/10 与 Warp 066 的身份/资格；先列最小缺证清单，不能为目标零 DOSBox 自动豁免。
- 向 08 交输入/限值/版本候选，向 09 交共享提示的视觉需求；spec 只补事实链接，不改已批准行为。

## 不包含

不做新版候选判定，不实现算法，不把截图拟合参数当 Core 映射证据。

## 关键文件与契约

- [hud](../../../../original/formats/hud.md)、[cockpit](../../../../original/formats/cockpit.md)、[executable](../../../../original/formats/executable.md)。
- [unknowns](../../../../original/unknowns.md) 的 U-029/U-030 及 [证据指南](../../../../guides/original-evidence.md)。

## 写入范围

- `docs/original/formats/hud.md`：绘制和文字事实。
- `docs/original/formats/cockpit.md`：布局和调度。
- `docs/original/formats/executable.md`：读者/调用点。
- `docs/original/formats/comm.md`：菜单及消息事实。
- `docs/original/formats/textures.md`：目标屏背景。
- `docs/original/behavior/B-001-strategic-map.md`：地图观察与事实索引。
- `docs/original/unknowns.md`：相关 U 项状态。
- `docs/plan/p3/13/spec.md`：仅事实引用及关卡输入记录。
- `local/research/p3-13/comparison-plan/**`：私有预注册方案与覆盖。

## 验收标准

- [ ] Q 表逐项有来源/置信度与缺口，原版字节和反编译内容未进入文档。
- [ ] 对照判据在查看候选结果前冻结，负对照可排除错误字形/帧/图元。
- [ ] 缺证项有 AC、最小补采和恢复条件；没有自动豁免或 10% 等无依据阈值。

## 验证方法

交叉核对研究来源、链接、metadata 和证据清单；必要原版取证由 agent 按指南完成，只采剩余必需缺口，不跑应用构建。

## 完成证据
