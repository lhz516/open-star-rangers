---
type: plan
status: active
phase: P3
task: "14"
subtask: "20"
updated: 2026-10-15
---

# 20 — 真实相机、EXPL 与共享 HUD 集成

**契约来源：** [spec](../spec.md#需要-p3-12-提供的只读接口) 的 S-05、S-06、AC-05、AC-07、AC-14。
**依赖：** 17。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 外部前提：P3-12 真实相机/效果选择器和 P3-13 实际 HUD 消费接口满足 07 的已批准交接；缺少时不以替身通过。
- 装配同次 EXPL 选择、当前效果和本帧激活，声音/动画用同一个原列表下标；处理短命额外效果及双列表重复来源。
- 将 14 的单实例读模型同时交给实际 HUD 和音效，明确相机/状态/音频的帧后顺序，覆盖地图/基地保留相机与模式门禁。
- 锁定、抢占、静止帧、隐藏恢复、GPU 显示释放均不重抽变体、不增加状态机。

## 不包含

- 不复制相机/选择器、补写仪表画面或修改后续视角范围；生产者缺接口回负责项。

## 关键文件与契约

- 17 所有者、14 audio-cues 和 P3-12/P3-13 在 07 记录的实际公开接口。
- 计划新增 `src/app/flight-audio/presentation.ts`、`presentation.test.ts`，仅消费/适配生产者。

## 写入范围

- `src/app/flight-audio/presentation.ts`：相机/效果/HUD 的装配适配。
- `src/app/flight-audio/presentation.test.ts`：真实模块联合测试。
- `src/app/composition/use-mission-owner.ts`：显式单帧接线顺序。
- `src/render/cockpit/audio-cues.ts`：仅已批准的共享消费接口同步。
- `src/render/cockpit/audio-cues.test.ts`：双消费者回归。

## 验收标准

- [ ] 每个声音尝试与动画同次选择一致；list-1 与原 item 索引正确，失败不重抽。
- [ ] 实际 HUD 与音频每帧读取同一结果，无额外 RNG 或重复推进。
- [ ] 真实相机模式、短命效果、释放和恢复边界通过；外部模块和候选版本可追溯。

## 验证方法

- 真实生产者加合成数据的 Node 测试；`pnpm test -- src/app/flight-audio/presentation.test.ts src/render/cockpit/audio-cues.test.ts`、`pnpm check`。
- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)核对实际表现接线，证据纳入 22；[simplify](../../../../../.agents/skills/simplify/SKILL.md)仅适配层。

## 完成证据
