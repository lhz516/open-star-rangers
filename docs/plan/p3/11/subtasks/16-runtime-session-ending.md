---
type: plan
status: active
phase: P3
task: "11"
subtask: "16"
updated: 2026-10-17
---

# 16 — Runtime 与会话：救援保持与终局

**契约来源：** [spec](../spec.md) 的 S-09、AC-11；[运行中与终局衔接](../spec.md#运行中与终局衔接)；D-01 写入 [P3-04 spec](../../04/spec.md) 的修订。
**依赖：** 15。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **救援保持：** [game-session.ts](../../../../../src/app/session/game-session.ts) 的运行中衔接接受 G-02/5、G-02/6；有限序列上限与同 tick 组合按 D-01；逐次 `transitionId` 与凭证、未执行命令取消一次、两帧折叠、结束重锚不补跑。
- **完成截断：** [game-runtime.ts](../../../../../src/app/runtime/game-runtime.ts) 依据成功 step 的有类型完成输出截断，事件派发前立起完成屏障；`FrameReport` 的新截断原因与实际 tick 数；监听器不能重入。
- **结果阶段：** 会话进入结果阶段，按冻结结果逐项保持终局占位（G-02/7；G-02/8 与可选 G-02/9），每项凭证绑定 ownerId/runId/transitionId；完成与普通衔接同 tick 时按 D-01 的有限序列，绝不恢复模拟；故障、退出、释放、完成与隐藏的优先级按 D-01；健康完成的录制在重试/退出前可导出。
- **任务所有者：** [mission-flow.ts](../../../../../src/app/mission/mission-flow.ts) 加入结果位置与相应输入、`FLOW_SESSION_PHASES` 与重开/返回的允许位置；[mission-owner.ts](../../../../../src/app/mission/mission-owner.ts) 的终局占位计时、结果后的重试（P3-04 重开路径：新 runId、重新抽取种子、预选上次僚机）与返回主菜单；同步全部 phase 白名单与消费者。
- 测试：Runtime、Session、owner 的竞态与故障矩阵（hidden/pagehide、重复跳过、旧凭证、退出/释放、StrictMode 式重复挂载、消费者/计时器/清理失败），沿用既有资源平衡测试。

## 不包含

- 结果页、占位文案与总结文字（17）；浏览器验证（18）。

## 关键文件与契约

- [session-errors.ts](../../../../../src/app/session/session-errors.ts)、[mission-ports.ts](../../../../../src/app/mission/mission-ports.ts)、[mission-slot.ts](../../../../../src/app/composition/mission-slot.ts)、[game-runtime-transition.test.ts](../../../../../src/app/runtime/game-runtime-transition.test.ts)、[game-session-transition.test.ts](../../../../../src/app/session/game-session-transition.test.ts)、[mission-owner-transition.test.ts](../../../../../src/app/mission/mission-owner-transition.test.ts)。

## 写入范围

- `src/app/runtime/**`：完成截断与测试。
- `src/app/session/**`：救援保持、结果阶段与测试。
- `src/app/mission/**`：结果位置、终局占位计时、重试与返回及测试。
- `src/app/composition/**`：任务槽的接线与测试。

## 验收标准

- [ ] 救援保持复用运行中衔接；未执行命令恰好取消一次；结束重锚不补跑。（AC-11）
- [ ] 完成后没有额外 tick、输入或重入；终局占位每项恰好结束一次后进入结果；旧 run 与旧项的凭证被拒绝。（AC-11）
- [ ] 重试产生新 runId 的新世界，返回主菜单释放所有者；清理失败沿用锁存。（AC-11）
- [ ] `pnpm exec vitest run src/app src/ui`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 中的 Runtime/Session/owner 测试与资源平衡。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据
