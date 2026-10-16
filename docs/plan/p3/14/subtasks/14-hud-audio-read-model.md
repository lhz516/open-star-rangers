---
type: plan
status: active
phase: P3
task: "14"
subtask: "14"
updated: 2026-10-15
---

# 14 — 共享 HUD 声音表现读模型

**契约来源：** [spec](../spec.md#锁定提示音与-9-型仪表警告音) 的 S-06、AC-07、AC-08、AC-14。
**依赖：** 07, 08。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 A-06/A-07 和 D-02 实现锁定提示、双警告、采样/闪烁节奏、模式/子系统门禁。
- 输入为 Core 的纯条件、无量纲 lock.progress、任务时钟与独立表现随机；不读播放器是否可用来决定显示事实。
- 每个有效帧推进一次，输出冻结、重复读取不推进；供音效与 P3-13 绘制共同消费。
- 未就绪/无玩家与无威胁分开；隐藏后只提供当前仍持续的状态，旧脉冲不补发。

## 不包含

- 不绘制仪表、不启动声音、不把计时/RNG 放进 Core，不让 render 反向导入 app。

## 关键文件与契约

- 现有 [Projection](../../../../../src/core/projections/projection.ts)及 08 的 ThreatWarnings。
- 计划新增 `src/render/cockpit/audio-cues.ts`、`audio-cues.test.ts`；实际命名由 07 与 P3-13 对齐。

## 写入范围

- `src/render/cockpit/audio-cues.ts`：纯表现模型及读取类型。
- `src/render/cockpit/audio-cues.test.ts`：状态/时钟/随机输入测试。

## 验收标准

- [ ] −1/0/正值变化与保持、目标失效、双警告优先级、门禁/复位正确。
- [ ] 同帧双消费者读取同一结果，不额外推进或抽 RNG；零 tick/静止帧按合同处理。
- [ ] 声音关闭不改变 HUD 输出；纯模块在 Node 程序中且边界检查通过。

## 验证方法

- 固定表现随机序列与合成 projection；`pnpm test -- src/render/cockpit/audio-cues.test.ts tools/engineering-boundaries.test.ts`、`pnpm check`。
- [simplify](../../../../../.agents/skills/simplify/SKILL.md)限定读模型；P3-13 实际消费在 20 验证。

## 完成证据
