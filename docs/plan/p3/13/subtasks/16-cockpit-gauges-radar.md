---
type: plan
status: active
phase: P3
task: "13"
subtask: "16"
updated: 2026-10-25
---

# 16 — 前视框架、角落仪表与雷达

**契约来源：** [spec](../spec.md#前视驾驶舱与仪表) 的 S-04/S-05，AC-07/08/09。
**依赖：** 14, 15。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 实现框架元素/调度描述及类型 0–3、5 的独立绘制模块，未到期保留上次画面。
- 满刻度、受损读数与颜色按 02/08；状态 3 按每个原版读取者规则而非全局夹取。
- 雷达只读 Core 接触点，投影使用已确认相机输入；严格 due、Warp 停建、120 总项及噪点策略精确实现。

## 不包含

不改世界感知/目标筛选，不改应用装配（24）。

## 关键文件与契约

- [radar.ts](../../../../../src/core/rules/radar.ts)、12 的读模型与 14/15 的纯模块。
- 计划新增 `src/render/cockpit/gauges/`、`radar/`、`frame/`。

## 写入范围

- `src/render/cockpit/gauges/**`：类型 0–3 与测试。
- `src/render/cockpit/radar/**`：投影/噪点/缓冲与测试。
- `src/render/cockpit/frame/**`：框架合成描述与静态像素测试。

## 验收标准

- [ ] 框架遍次/仪表顺序、强制重绘与缓存保持正确。
- [ ] 速度内容基准不与动态上限混同，零分母按批准合同。
- [ ] 独立世界位置/朝向期望通过，容量临界/零方向/状态1/2/3及Warp覆盖。

## 验证方法

`pnpm test -- src/render/cockpit/gauges src/render/cockpit/radar src/render/cockpit/frame`、`pnpm check`；[simplify](../../../../../.agents/skills/simplify/SKILL.md) 限这三类模块。私有截图验收归31。

## 完成证据
