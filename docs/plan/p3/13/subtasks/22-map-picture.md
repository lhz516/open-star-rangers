---
type: plan
status: active
phase: P3
task: "13"
subtask: "22"
updated: 2026-10-25
---

# 22 — 战略地图逻辑画面

**契约来源：** [spec](../spec.md#战略地图画面) 的 S-10，AC-16/19。
**依赖：** 14, 15。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 实现地图palette、框架绘制遍、网格、覆盖/迷雾、标记、标签/威胁闪烁、连线、信息行、zoom错开/方框/距离、目的地/光标读数与指针。
- 只读同tick map分区；零能量项目标记、计数行越出小窗但不越出屏幕按合同。
- 实现06/08确定的距离标签纯状态与双调用去抖端口，实际鼠标电平由23接入。
- 输出当前几何/绘制身份与GPU计划，ready只有实际合成成功后由24确认；消息行使用18的独立层组合，不另造队列。

## 不包含

不改变Core可见性/能量/选点，不画额外系统指针或可交互侧边按钮。

## 关键文件与契约

- [map.ts](../../../../../src/core/projections/map.ts)、[map-geometry-payload.ts](../../../../../src/content/hud/map-geometry-payload.ts)。
- 计划新增 `src/render/cockpit/map-picture/` 的地图内容与纯呈现状态。

## 写入范围

- `src/render/cockpit/map-picture/**`：地图图元/标记/标签、状态、GPU计划与测试。

## 验收标准

- [ ] 各元素按权威顺序与palette输出，不重推可见性。
- [ ] 选中多图标、计数行超窗、零能量和分区null/未就绪明确。
- [ ] 去抖双调用、重开保留计数及本地指针/确认代价边界可独立断言。

## 验证方法

`pnpm test -- src/render/cockpit/map-picture`、`pnpm check`；[simplify](../../../../../.agents/skills/simplify/SKILL.md) 限地图表现；28/31验证生产像素。

## 完成证据
