---
type: plan
status: active
phase: P3
task: "05"
subtask: "26"
updated: 2026-10-10
---

# 26 — 接通 K 地图定稿的生产策略

**契约来源：** [spec](../spec.md) 的[执行检查点](../spec.md#执行检查点)规则 4、[战略地图输入](../spec.md#战略地图输入)“初始位置”“命令顺序”（经 05 定稿）；S-11；AC-02 的地图项、AC-12 的具体输入。
**依赖：** 05、25。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/ui/game-input/map-input-policy.ts`：按 05 定稿给出生产地图策略——每次进入地图的起点公式（主地图逻辑像素宽高 W、H 与左上 (left, top)：列 ⌊(W−1)/2⌋、行 ⌊(H−1)/2⌋，自逻辑画面原点量起，钳制到主地图像素范围后取像素中心归一化）与左键按住的重复间隔 8 个时钟单位，并注明来源（spec 定稿记录与事实记录的锚点）。
- 在装配中把该策略交给 22 的地图输入；生产几何仍为 null（P3-13 提供），因此本项不改变生产画面的可见行为，但使 P3-13 接入几何后即按定稿行为工作。
- Node 测试：策略值与定稿一致；地图输入在该策略下的起点（以合成几何，含钳制与像素中心）与左键按住的重复间隔。
- 若 05 只部分放行，仅接通已放行的项；未放行项保持无默认值并在输入状态中报告。

## 不包含

- 生产几何与原版布局（P3-13）；地图规则（P3-09）。

## 关键文件与契约

- 05 的 spec 定稿记录；22 的 `map-input.ts`；25 的装配（`src/app/composition/`）。
- 计划新增：`map-input-policy.ts`、`map-input-policy.test.ts`。

## 写入范围

- `src/ui/game-input/map-input-policy.ts`、`src/ui/game-input/map-input-policy.test.ts`
- `src/ui/game-input/map-input.ts`、`src/ui/game-input/map-input.test.ts`
- `src/app/composition/**`
- `src/ui/game-input/map-input-entry.test-support.tsx`：隔离入口改用生产策略，避免与生产值漂移（2026-10-10 协调者依 26 的 scope-request 加入，与进行中的 28、34 不重叠）。

## 验收标准

- [x] 生产策略只来自 05 的定稿，带来源注释；未放行项没有默认值。
- [x] Node 测试证明定稿的起点公式与左键重复间隔生效。
- [x] `pnpm exec vitest run src/ui/game-input` 与 `pnpm check` 通过；按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 检查本项改动。

## 验证方法

- Node 测试；定稿值与 spec 记录逐项对照。

## 完成证据

- **实现：** 新增 [map-input-policy.ts](../../../../../src/ui/game-input/map-input-policy.ts)，生产起点委托 `mapStartPosition(mainMap)`，重复间隔为 8 个模拟时钟单位；注释链接 P3-05 检查点 K 定稿与 executable 地图轮询事实。任务所有者装配注入此策略；隔离浏览器测试入口也复用同一策略。生产几何仍为 null，因此生产任务画面仍显示地图输入未就绪。
- **Node 验证：** `pnpm exec vitest run src/ui/game-input` 通过（10 文件、217 项）。策略测试覆盖按屏幕原点计算、像素中心与地图边界钳制；`map-input.test.ts` 用实际生产策略验证按下时钟 10、时钟 17 前无重复、时钟 18 首次重复。
- **工程与浏览器验证：** `pnpm check` 通过（typecheck、lint、243 文件 / 7,305 项测试、生产构建；Vite 对超过 500 kB 的 chunk 给出非阻塞提示）。`OSR_E2E_DEV_PORT=5231 OSR_E2E_PREVIEW_PORT=5232 pnpm exec playwright test e2e/map-input.development.spec.ts --project=development` 在隔离合成入口通过 9 项，覆盖 DPR 1 与 2；Playwright 启动的开发与预览服务器已关闭。
- **Rubber-duck：** 对本项 diff 与定稿、验收标准完成一次审查，没有发现有效问题。
- **Simplify：** 复用审查发现隔离入口原先重复起点适配与间隔常量，已改为直接导入生产策略，消除测试策略漂移。保留生产策略在 `MapInput` 中的行为测试（证明策略确实生效）、含边界钳制的策略用例（验收要求）及显式输入几何类型（避免隐式 any）；未采纳“空几何仍有轻微读取开销”的建议，因为生产策略须先于 P3-13 的几何接通，端口此时只返回 null。
- **文档影响：** 未发现需要更新工程说明、指南或原版事实；本子任务文档补入执行证据。
