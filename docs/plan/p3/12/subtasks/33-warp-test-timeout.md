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
- 18 的集成检查又发现 19 的 `nebula-blit`“diagonal step”与 `nebula-selection`“same number of rand values”在负载下各需 7–11 秒，一并处理。
- 改为等价但高效的比较（例如按字节逐一比较后断言布尔值，失败时报告首个不同的下标），保持断言的含义与覆盖不变；不提高超时、不删断言。

## 不包含

- 改动 Warp 隧道层的实现。

## 写入范围

- `src/render/flight/warp/warp-tunnel-layer.test.ts`：比较方式。
- `src/render/flight/nebula/nebula-blit.test.ts`、`src/render/flight/nebula/nebula-selection.test.ts`：同类慢用例（“diagonal step”与“same number of rand values”）。
- `src/render/flight/warp/warp-tunnel-image.test.ts`：同类慢用例（“draws the same image again from the same input”）。

## 验收标准

- [x] 这四个用例（warp-tunnel-layer、warp-tunnel-image 与 nebula 的两个）各自在正常负载下明显短于 1 秒，断言含义不变（仍能区分存储行与绘制行两种投影）。
- [x] `pnpm exec vitest run src/render/flight/warp` 与 `pnpm check` 通过。

## 验证方法

- Node 测试，记录用例耗时。

## 完成证据

- **Warp 图层用例（`warp-tunnel-layer.test.ts` “projects with the stored rows …”）：** 新增 `firstDifference(actual, expected)`，逐字节比较两幅图像，返回首个不同的下标；长度不同时返回较短长度，相同时返回 −1。四次比较改为断言 `toBe(-1)`（三处相等）与 `not.toBe(-1)`（存储行与绘制行两种投影不同），操作数与顺序不变。耗时：修改前在负载约 11 时超过 5 秒超时；修改后在负载约 11 时为 15 ms，负载约 6 时为 9 ms。
- **Warp 图像用例（`warp-tunnel-image.test.ts` “draws the same image again from the same input”）：** 对约 0.8 MB `Uint8Array` 的深度 `toEqual` 改为 `toHaveLength` 加 `findIndex` 首个不同下标 `toBe(-1)`，仍是逐字节相等。耗时：修改前 1245 ms（负载约 7）；修改后 7 ms（负载约 6）。
- **星云选择用例（`nebula-selection.test.ts` “gives every start the same number of rand values …”）：** 原写法对 5 种长度的每个可接受值（共约 16.4 万次）都经 `ids()` 重新构建并校验列表。现改为每种长度只构建一次列表（选择只读列表，不改动它），每个值仍新建 `controlledRand` 并放入该值，再用 `indexOf` 取起点（合成 id 后缀即其下标）。遍历的值完全相同，未缩减样本，覆盖不变。耗时：修改前 2317 ms（负载约 7），负载约 24 时单独运行 6.9 秒超时；修改后 132 ms（负载约 6）。
- **星云 blit 用例（`nebula-blit.test.ts` “… diagonal step, leaving no hole”）：** 原写法对 729 个角度各生成全部写入对象，再拼成 `"x,y"` 字符串集合。现改为一张 640×480 的 `Uint8Array` 标记表，用与 `writes()` 默认值相同的参数 `(θ, 320, 240, 479)` 直接调用 `blitNebula` 标记写入，再检查同一半径 60 的圆盘。写入距中心不超过 ±91，下标都在屏内，不会混叠。角度与检查范围不变。耗时：修改前 2401 ms（负载约 7），负载约 24 时单独运行 6.4 秒超时；修改后 196 ms（负载约 6）。
- **未改动：** 实现文件与超时设置未改，也未删减断言。
- **检查：** `pnpm exec vitest run src/render/flight/nebula src/render/flight/warp --reporter=verbose` 64/64 通过。`pnpm check` 通过：类型检查、ESLint、370 个测试文件共 10460 个用例、构建，运行期间负载约 6–8。
- **Rubber-duck：** 两轮审查均无阻塞或非阻塞问题。确认以下几点：两侧均为 `Uint8Array`，逐字节比较等价于 `toEqual`；长度不同也能检出；`at()` 复制图层数据，`reference()` 使用独立像素，二者不混叠；`selectNebulaImages` 不改动列表，`indexOf` 等于原 id 后缀；`blitNebula` 参数与 `writes()` 默认值一致，写入均在屏内。
- **文档影响：** 只改了测试的比较与构建方式；工程约定、指南、原版事实与 STATUS 都不受影响，无需更新。
