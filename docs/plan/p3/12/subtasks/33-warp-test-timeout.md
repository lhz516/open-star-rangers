---
type: plan
status: active
phase: P3
task: "12"
subtask: "33"
updated: 2026-10-17
---

# 33 — 修复：Warp 隧道层测试的超时

**契约来源：** [spec](../spec.md) 的 AC-15、AC-22（`pnpm check` 通过）。
**依赖：** 22。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 集成时发现：22 的 `src/render/flight/warp/warp-tunnel-layer.test.ts` 中“projects with the stored rows …”用例在低负载下约 3 秒，机器负载较高时超过 Vitest 默认的 5 秒超时，使 `pnpm check` 不稳定。原因是对 640×480 像素数组做了四次深度 `toEqual` 比较。
- 改为等价但高效的比较（例如按字节逐一比较后断言布尔值，失败时报告首个不同的下标），保持断言的含义与覆盖不变；不提高超时、不删断言。

## 不包含

- 改动 Warp 隧道层的实现。

## 写入范围

- `src/render/flight/warp/warp-tunnel-layer.test.ts`：比较方式。

## 验收标准

- [ ] 该用例在正常负载下明显短于 1 秒，断言含义不变（仍能区分存储行与绘制行两种投影）。
- [ ] `pnpm exec vitest run src/render/flight/warp` 与 `pnpm check` 通过。

## 验证方法

- Node 测试，记录用例耗时。

## 完成证据
