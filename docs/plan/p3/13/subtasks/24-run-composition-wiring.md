---
type: plan
status: active
phase: P3
task: "13"
subtask: "24"
updated: 2026-10-25
---

# 24 — 运行装配与单画面合成

**契约来源：** [spec](../spec.md#接线与生命周期) 的 S-04/S-10/S-11/S-12，AC-08/14/18/19。
**依赖：** 11, 13, 16, 17, 18, 19, 20, 21, 23。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 本项唯一修改应用/运行装配热文件，绑定完整ContentIdentity、owner/run/代际，开始前验证内容与CPU/GPU预算。
- 组合14–22的实际模块和P3-14共享模型，全部tick/Event Bus之后按D-02推进与消费，再合成一帧；不丢瞬时事实。
- 保留唯一画布/上下文，接cockpit槽、地图palette和最终单次闪光；不改世界深度。
- 接23几何与绘制成功凭证，移除生产十字光标，保持设备不可用、回滚、释放锁存及旧run迟到结果处理。

## 不包含

不重复各仪表实现或P3-14模型，不改变Core控制或完整任务流程。

## 关键文件与契约

- [flight-run.ts](../../../../../src/render/flight/renderer/flight-run.ts)、[flight-consumer.ts](../../../../../src/app/mission/flight-consumer.ts)、[use-mission-owner.ts](../../../../../src/app/composition/use-mission-owner.ts)。
- 计划新增 `src/app/mission/cockpit-content.ts` 及 `src/render/cockpit/composition/`。

## 写入范围

- `src/app/mission/flight-content.ts`：内容准备接线。
- `src/app/mission/flight-consumer.ts`：运行消费者接线。
- `src/app/mission/flight-consumer.test.ts`：所有权/失败测试。
- `src/app/mission/cockpit-content.ts`：计划新增HUD内容绑定。
- `src/app/mission/cockpit-content.test.ts`：计划新增绑定测试。
- `src/app/composition/*.ts`：生产装配与相关类型。
- `src/render/flight/renderer/flight-run.ts`：单次tick/帧合成接入。
- `src/render/flight/renderer/flight-run.test.ts`：实际模块集成。
- `src/render/flight/renderer/flight-passes.ts`：计划合并或层接入。
- `src/render/flight/renderer/flight-passes.test.ts`：保留世界pass回归。
- `src/render/cockpit/composition/**`：计划新增合成层与测试。
- `docs/engineering/modules/app.md`：运行/API同步。
- `docs/engineering/modules/render.md`：合成/API同步。

## 验收标准

- [ ] 真实模块在单一管线，帧分组/0tick/恢复不重复推进或播消息。
- [ ] 预算先检查，目标屏不污染深度，闪光只作用游戏像素一次。
- [ ] 首画ready无死锁，设备/旧run/局部分配失败和释放路径完整。

## 验证方法

`pnpm test -- src/app/mission src/app/session src/render/flight/renderer src/render/cockpit`、`pnpm check`；[simplify](../../../../../.agents/skills/simplify/SKILL.md) 限装配，不引入新的通用生命周期框架。

## 完成证据
