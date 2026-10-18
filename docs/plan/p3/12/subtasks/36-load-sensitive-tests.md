---
type: plan
status: active
phase: P3
task: "12"
subtask: "36"
updated: 2026-10-18
---

# 36 — 修复：最终对齐发现的负载敏感测试

**契约来源：** [spec](../spec.md) 的 AC-22（`pnpm check` 与浏览器回归通过）。
**依赖：** 23, 25, 34。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

29 在 2026-10-18 的检查中发现两处负载敏感的失败（各自单独重跑通过）：

- `src/workers/failure-matrix.test.ts` 的“names the fingerprint each scenario identifies …”用例：main 上约 0.7 秒，本分支约 1.8 秒，负载下达到 5 秒超时。时间增长来自 23、34 放大的合成生产包夹具（例如 128×128 星云、更多模型部件）。在不改变断言含义、不提高超时的前提下恢复其速度（例如避免重复构建大夹具，或缓存场景来源），并量化前后耗时。
- `e2e/ai-wingman.development.spec.ts` 的“an AI fault shows through the Runtime …（AC-17）”：在负载下轮询未见到 `departure` 时运行已在 tick 1 结束（`position: ended`）。查明 P3-12 的飞行渲染是否使此竞争更易发生；在不削弱断言的前提下让等待对该时序稳健（例如以运行开始的可观察证据代替只出现一瞬的 `departure`），或修正引起竞争的实际原因。

## 不包含

- 改变被测行为或放宽断言。

## 写入范围

- `src/workers/failure-matrix.test.ts`：用例的构造方式。
- `src/original-data/conversion/*.test-support.ts`、`src/workers/*.test-support.ts`：必要的夹具缓存或构造（不改夹具内容）。
- `e2e/ai-wingman.development.spec.ts`、`e2e/support/**`：等待方式。

## 验收标准

- [ ] failure-matrix 用例在正常负载下回到接近 main 的耗时（记录前后数值），断言不变。
- [ ] ai-wingman 的 AC-17 用例对该时序稳健（说明原因与改法），在并发 `pnpm check` 的负载下连续通过。
- [ ] `pnpm check` 与受影响的 E2E 通过。

## 验证方法

- Node 与 Playwright；记录耗时与负载。

## 完成证据
