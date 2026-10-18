---
type: plan
status: active
phase: P3
task: "12"
subtask: "29"
updated: 2026-10-18
---

# 29 — 最终对齐

**契约来源：** [spec](../spec.md) 的 S-01 至 S-15、AC-01 至 AC-23；P3-02 spec 中 D-01 定稿的 P3-12 契约修订。
**依赖：** 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 30, 31, 32, 33, 34, 35, 36。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

只做验证，不交付新的功能代码。发现缺口时，由协调者新增修复子任务：新 ID，插入本项之前，并加入本项的依赖。

- **覆盖：** 按 [goal 的验收覆盖](../goal.md#验收覆盖)逐项核对 S-01 至 S-14、AC-01 至 AC-22 都有完成证据。
- **关卡与批准：** D-01 的批准记录在 [P3-02 spec](../../02/spec.md)，早于 10、11、12 的实现提交；冻结的对照方案早于 25、26 的新版画面。
- **契约不变量：**
  - `src/core` 保持纯净；表现模块不导入 DOM、Three.js 或 WebGL；表现代码不提交命令、不设置意图、不消耗世界 RNG；
  - 没有开放字段、万能载荷、生产状态注入或静默降级；
  - CR-11 的已批准差异、按 tick 的缓动与星云起点的项目选择已写入 render 模块说明；没有新增 G 项；
  - P3-13 接入前的在制提示可见；被毁视角的真实流程明确交 P3-15。
- **候选一致：** 25、26 的候选 `src/` 树与当前一致；不一致时核对差异是否影响所测行为，有影响则新增重跑子任务。
- **研究与证据：** Q-01 至 Q-13 达到所需结论或已按 spec 阻塞；AC-21 的运行记录齐全；仓库中没有原版内容、截图、读数或反编译输出，研究输出只在 `local/research/p3-12/`。
- **工程检查：** `pnpm exec vitest run src/core src/app src/render tools/engineering-boundaries.test.ts`、`pnpm check`、`pnpm check:compliance`；25 的浏览器回归在当前候选上通过；若改动了 `tools/baseline/`，运行其单元测试。
- **文档：** 改动文档的 `updated:`、链接与锚点有效；`node tools/task-state.ts p3/12` 没有计划问题。

## 不包含

- 新功能、规则或文档内容的补写（交给修复子任务）。
- push、合并或部署。

## 关键文件与契约

- [spec](../spec.md)、[goal](../goal.md)、[P3-02 spec](../../02/spec.md) 与 01 至 28 的完成证据。

## 写入范围

无。

## 验收标准

- [x] S-01 至 S-15、AC-01 至 AC-23 逐项有证据，没有未披露的缺口。
- [x] D-01 与对照方案的时序正确；上列契约不变量逐项通过；25、26 的候选与当前一致或差异已处理。
- [x] `pnpm exec vitest run src/core src/app src/render tools/engineering-boundaries.test.ts`、`pnpm check`、`pnpm check:compliance` 与浏览器回归通过；适用时 baseline 工具测试通过。
- [x] 文档链接、元数据与原版隔离核对通过；`node tools/task-state.ts p3/12` 没有计划问题。

## 验证方法

- 运行上列命令并记录结果；审阅 `git status`、`git diff` 与提交的文件列表。
- 对照 spec 与各 subtask 的完成证据逐项核对。

## 完成证据

**2026-10-18 最终对齐（协调者执行；第一次检查发现两处负载敏感测试，经修复子任务 36 后重跑）：**

- **覆盖：** spec 的 23 个 AC 都在已勾选的验收项中出现；S-01 至 S-15 按 [goal 的验收覆盖](../goal.md#验收覆盖)映射到 AC 与实现子任务，除本项外全部 completed，各子任务验收全部勾选。未披露的缺口：无。已披露的缺口与差异见 goal 执行记录：B 组五项与 V02-C 形状为外观证据缺口（用户 2026-10-17/18 决定，见 [spec 审批](../spec.md#审批)）；已批准差异包括按 tick 的运算、星云起点、CR-11 与 FS-10 的激活次序和同步载入、导弹类型越界拒绝、缓冲宽度小于 640 时的点阵网格；25 记录的未自动验证项为运行中改变设备像素比的通知、速度尘埃逐粒子位置、导弹逐像素外观与正式流程暖态 GPU 相等，被毁视角的真实流程交 P3-15。
- **时序：** D-01 定稿 `facbaaf9`（2026-10-17 11:20，经用户批准）早于 10 `a94b1b88`、11 `16529f6c`、12 `8e9ad156`；FS-12 与其实现同在 `4ebd0a68`（文档与实现一起提交）。对照方案在 08 `c6cc4006`（2026-10-16）冻结，附录在 30 `7defa923` 冻结，均早于 25 `16e97125` 与 26 的新版画面；两者指纹在 26、35 中复核未变。
- **候选：** 25、26 的候选 `src/` 与当前只差 36 的测试支持缓存（夹具内容不变）；浏览器回归在当前树上重跑。
- **不变量：** `src/core` 与 `src/render/flight` 的非测试代码没有 `Math.random`、`Date.now`、`performance.now`；表现模块不导入 three 或 `src/app`（lint 边界与 `engineering-boundaries` 测试）；表现代码不提交命令、不设置意图；没有新增 G 项（在制标注见 slice-gaps）；在制提示 `FLIGHT_IN_PROGRESS` 可见；render 模块说明写有按 tick 的运算、星云起点与激活次序差异。
- **检查：** `pnpm exec vitest run src/core src/app src/render tools/engineering-boundaries.test.ts`（214 文件 / 5,441 测试）通过；`pnpm check`（382 文件 / 10,601 测试、lint、typecheck、build）通过；`pnpm check:compliance` passed，无发现；`pnpm test:e2e`（端口 5208/5209，Chrome 155.0.8059.82）247/247 通过，用时 18.8 分钟。`tools/baseline/` 未改动，不适用。
- **文档与隔离：** 本分支相对 main 改动的 67 个 Markdown 文档全部有 `updated:`，链接与锚点（含 HTML 锚点）0 个错误；跟踪文件中没有原版内容、截图或读数，研究输出只在 `local/research/p3-12/`；`node tools/task-state.ts p3/12` 无计划问题。
