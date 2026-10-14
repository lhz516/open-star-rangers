---
type: plan
status: active
phase: P3
task: "05"
subtask: "35"
updated: 2026-10-10
---

# 35 — 输入接线后的端到端回归修复

**契约来源：** [spec](../spec.md) 的[验证策略](../spec.md#验证策略)；AC-19（`pnpm check` 与既有浏览器套件保持通过）。本项为协调者在 33 之前跑完整 e2e 套件时发现的修复项，不引入新行为。
**依赖：** 25、26、27、28、29。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 背景

协调者在 `ac86ed5c` 上以 `pnpm exec playwright test`（单 worker）运行完整套件：214 通过、7 失败，且在 29 集成前的提交上可复现，来自 25–27 的接线（这些子任务当时只跑了聚焦用例）：

- `e2e/probe-contract.spec.ts:160`（development、production）：所有者资源期望无监听器，实得约 110 条 `group: "keyboard"` 监听器（25 的输入消费者）。
- `e2e/webgl-unavailable.spec.ts:53`（development、production）与 `e2e/production-preview.spec.ts:129`（production）：飞行视图期望 0 个 `canvas`，实得 1 个——17/26 的自绘 2D 地图光标画布（`src/render/map/browser-map-cursor.ts`，`aria-hidden`、默认隐藏）。用例本意是“任务流程不创建 WebGL 表面”。
- `e2e/native-lifecycle.spec.ts:80`（development-headed）：`Application load timed out; last observation: ""`，原因待诊断。
- `e2e/joint-pipeline.development.spec.ts:597`（development，AC-04 的 GPU 计数）：仅在本次完整运行出现，先判断是否为负载噪声。

## 工作范围

- 逐项诊断。用例期望过时（如把 2D 地图光标画布或已登记的键盘监听器当作违规）时，按 spec 已批准的行为更新断言，保留原意：无 WebGL 上下文、退出后监听器与资源全部释放、监听器归属于输入消费者。
- 若诊断为应用缺陷，不在本项修改应用代码，先向协调者申请扩大写入范围并附证据。
- 非确定性失败须以重复运行区分噪声与缺陷，并在证据中记录次数与结果。

## 不包含

- 新行为、文案或 spec 变更；31、34 的阻塞项。

## 写入范围

- `e2e/probe-contract.spec.ts`、`e2e/webgl-unavailable.spec.ts`、`e2e/production-preview.spec.ts`、`e2e/native-lifecycle.spec.ts`、`e2e/joint-pipeline.development.spec.ts`
- `e2e/support/**`

## 验收标准

- [x] 上列 7 个失败均已修复或以证据判定为噪声（附重复运行结果）。
- [x] `pnpm build` 后，完整 `pnpm exec playwright test`（单 worker）全部通过；`pnpm check` 通过。

## 验证方法

- 记录每项的诊断、改动与完整套件的通过数。

## 完成证据

**2026-10-10：** 基于认领提交 `8791fea8362d0f2afc8e68383c3d0c7ede97786f`，只修改本项的浏览器测试与共享观察 helper；未修改应用代码、浏览器配置、超时或性能门槛。环境为 macOS、本机 Chrome `155.0.8059.39`，常规项目 viewport `1280 × 800`、DPR 1；隔离合成 context，开发地址 `http://127.0.0.1:5301`、生产预览 `http://127.0.0.1:5302`。

| 原失败 | 诊断与改动 | 重复及完整运行结果 |
|---|---|---|
| `probe-contract`（development、production） | 聚焦基线在两项目复现过时的“无 keyboard 监听”断言；实际为 9 条（5 个页面事件、4 个同目标输入区事件），不是 110 个泄漏。改为精确断言键盘事件、同一输入区目标、2 条全屏事件与 5 条 Pointer Lock 事件；仍要求唯一帧循环、无 WebGL、无 timer/observer，退出后所有输入/会话/渲染监听、离页保护、帧、timer 与 canvas 全部释放。 | 首轮修改后各 3/3 通过；补充能力监听断言后再各 3/3 通过；完整套件两项通过。 |
| `webgl-unavailable`（development、production）、`production-preview`（production） | 三项均复现“0 canvas，实得 1”。复用 `expectFlightCursorWithoutWebGL`：全页唯一 canvas 位于输入区，具有 2D context、`aria-hidden=true`、不可见与 `pointer-events:none`，WebGL 探针为空；返回菜单须无 canvas。WebGL-off 浏览器的 viewer 两次访问仍核对不可用提示与释放。 | 三项分别 3/3 重复通过；完整套件三项通过。 |
| `native-lifecycle`（development-headed） | 首次聚焦运行成功加载后暴露旧的 SESSION-only 断言；纳入 keyboard 后进一步发现需要计入真实 fullscreen/Pointer Lock 监听，改为完整输入页面资源集合，并把释放过滤扩展到这两组。原“Application load timed out”在本 worker 的 8 次导航中均未复现，判为本轮未复现的环境噪声，不宣称已确认根因；未放宽加载时限。 | 初始 1 次与中间 3 次运行均已加载，但在旧/未补全的监听断言失败；最终 3/3 与完整套件 1/1 通过。真实 `hidden → visible` 两轮切换、出发 tick 0、返回仍暂停与继续不补跑均保留。最终重复运行首次 tick 位于继续首帧后 33.2–34.9 ms，完整运行 33.8 ms。 |
| `joint-pipeline.development` AC-04 GPU 计数 | 初始聚焦运行与随后 3 次重复均通过，完整套件也通过：总计 5/5。保持同文档三轮暖态 GPU 数量相等、Worker 单次终止、AudioContext close resolve、所有 viewer canvas 脱离且 context lost 的原断言，无需改此文件。原单次失败本轮判为未复现的负载噪声，具体来源未确认。 | 5/5 通过；不变更 GPU/Long Tasks 门槛或加入自动 retries。 |

- **完整验收：** 先运行 `pnpm build`，随后 `OSR_E2E_DEV_PORT=5301 OSR_E2E_PREVIEW_PORT=5302 pnpm exec playwright test`：**221/221 通过**，单 worker、无 retries，耗时 15.7 分钟。最终 `pnpm check` 通过：TypeScript、ESLint、Vitest **243 文件 / 7305 测试** 与生产构建全部通过。
- **协调者集成复核（2026-10-10）：** 在已集成 32 的目标分支上应用 worker 提交 `8593d7f765aa39b087f586b8aa0df833d38883c7`；`pnpm check` 与 `pnpm check:compliance` 通过。使用端口 5281/5282，执行 `pnpm exec playwright test e2e/probe-contract.spec.ts e2e/webgl-unavailable.spec.ts e2e/production-preview.spec.ts e2e/native-lifecycle.spec.ts e2e/joint-pipeline.development.spec.ts --workers=1 --reporter=line`：23/23 通过（1.8 分钟），包括 headed 原生隐藏/显示与继续首帧验证。
- **审阅与清理：** rubber-duck 审阅未发现阻断问题；指出日后接入生产地图几何时，合法可见光标需要同步更新当前飞行隐藏断言，该变化属于下游地图接线而非本项。当前几何端口返回 null，隐藏断言正确。限定本项 diff 的 simplify 检查保留共享 canvas helper 与直接事件集合断言，无需进一步抽象。
- **文档影响：** 不改变应用行为、公开接口、操作命令或原版事实；工程指南的监听分组与资源平衡约定仍准确，不需修改指南、STATUS、阶段索引或 goal。这里只记录验收证据。
- **安全与清理：** 全部测试使用现有代码生成的合成内容，不读取原版数据；runner 自有 context/browser/开发与预览服务器在每次运行结束关闭，未停止用户进程或改动用户缓存。日志与浏览器附件仅留在会话 artifacts / ignored 测试输出，不进入提交。
