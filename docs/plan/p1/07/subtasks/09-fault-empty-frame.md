---
type: plan
status: active
phase: P1
task: "07"
subtask: "09"
updated: 2026-10-02
---

# 09 — 故障收尾空帧的 Node 证据

**契约来源：** [spec](../spec.md) 的 AC-05（“故障收尾后为空帧……故障路径在 Node 中沿用现有 Vitest 创建边界注入，生产代码不加故障后门”）与“行为与边界”中 exit、故障或 owner 释放导致运行结束的行。
**依赖：** 03。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在渲染器测试中用 Vitest 模块替换在 Core 场景创建边界注入 step 异常，令真实 Session 因 runtime 故障结束运行，断言渲染器在收尾中移除该运行的全部实体对象并恰好绘制一次空帧，自身保持 ready，会话为 faulted。
- 断言故障之后迟到的旧运行帧不再绘制，restart 后新运行在 tick 0 正常绘制。

## 不包含

- 不修改生产代码，不新增故障入口；浏览器中不复现 Core 故障。

## 关键文件与契约

- 新增 [synthetic-renderer-fault.test.ts](../../../../../src/render/synthetic/synthetic-renderer-fault.test.ts)，复用 [render-surface.test-support.ts](../../../../../src/render/scene/render-surface.test-support.ts) 与 [synthetic-ui.test-support.ts](../../../../../src/ui/game/synthetic-ui.test-support.ts)。

## 验收标准

- [x] Core 故障结束运行时恰好绘制 1 次空帧（无实体对象），渲染器仍 ready，Session 为 faulted，错误为 runtime 故障。
- [x] 故障后旧运行帧不绘制；restart 后新运行接线绘制 tick 0。
- [x] 目标 Vitest 与 `pnpm check` 通过。

## 验证方法

- Vitest `vi.mock` 包装 `createSyntheticScene`，在第 N 次 step 抛错；真实 Session/bridge/渲染器与记录表面。

## 完成证据

- **测试：** `vi.mock` 包装 `createSyntheticScene`，在设定的下一次 Core step 抛错（生产代码无注入入口）。真实 Session（50 Hz）+ bridge + 渲染器 + 记录表面：先绘制 mover 与 marker 两个对象，注入后下一帧使 Session 进入 faulted（runId 1，错误出口收到 runtime 阶段的 operation-failed），渲染器恰好新增 1 次绘制且对象为空，仍为 ready，诊断 runId/drawnTick 为 null、实体 0；重放旧运行帧不绘制；restart 恰好新增 1 次绘制，内容为 run 2 的 mover，drawnTick 0。
- **反证：** 临时删去运行收尾中的空帧绘制后该测试失败，恢复后通过。
- **检查：** `pnpm check` 通过（41 个测试文件/1030 个测试、构建）。
- **审阅：** rubber-duck 确认 mock 实现完整 `SyntheticScene` 接口、断言非空泛；按其建议把 goal 的 AC-05 实现列改为 03、06，09 只作为验证。本子任务只新增测试，无实现代码，未运行 simplify；文档影响：工程约定已描述运行结束空帧，无需更新。
