---
type: plan
status: active
phase: "P3"
task: "15"
subtask: "02"
updated: "2026-10-29"
---

# 02 — 合成全闭环（production）

**契约来源：** [spec](../spec.md) 的 S-01、S-02（生产部分）、[技术决定](../spec.md#技术决定)；AC-01 的 production 部分、AC-02 中“production 构建不暴露开发录制或诊断能力”。
**依赖：** 01。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新建 `e2e/joint-loop.production.spec.ts`（production 项目、严格 CSP 与网络审计下）：以 [production-cache.ts](../../../../../e2e/support/production-cache.ts) 的 `seedProductionCache` 用 01 的变体包（生产身份）预置并经菜单恢复，走与 01 相同的成功、失败与重试完整用户流程。
- 只经任务画面的只读属性（如 `data-tick`）、可见 UI、结果页与宿主探针观察；不依赖开发面板、事件日志或录制。
- 断言生产 DOM 与可达入口中不存在开发录制导出或诊断能力（与 [mission-flow.production.spec.ts](../../../../../e2e/mission-flow.production.spec.ts) 和 [production-preview.spec.ts](../../../../../e2e/production-preview.spec.ts) 的既有检查一致，不重复其产物扫描）。

## 不包含

- 录制与 Node replay（01）；生命周期与资源平衡（03）。
- 修改 01 的共享支持文件；若需新增仅生产用的辅助，写在本 spec 文件内。

## 关键文件与契约

- 现有：[mission-flow.production.spec.ts](../../../../../e2e/mission-flow.production.spec.ts)、[production-cache.ts](../../../../../e2e/support/production-cache.ts)、[audited-test.ts](../../../../../e2e/support/audited-test.ts)。
- 01 交付：`e2e/support/joint-loop.ts`。
- 计划新增：`e2e/joint-loop.production.spec.ts`。

## 写入范围

- `e2e/joint-loop.production.spec.ts`：production 闭环用例。

## 验收标准

- [x] AC-01（production）：成功与失败均由规则自然产生并到达结果页，各自重试进入新运行（tick 从 0 起）；起飞、选目标、射击、地图/Warp、基地交互的可见结果均有断言。
- [x] AC-02（production 部分）：生产构建中没有开发录制导出或诊断入口。
- [x] 网络审计无违规；不读取原版文件；`pnpm typecheck`、`pnpm lint` 通过，已按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 执行：`pnpm test:e2e e2e/joint-loop.production.spec.ts --project=production`，连续两次通过。

## 完成证据

- **2026-10-29（worker exec/p3-15-02）：**
  - **实现：** 新增 [joint-loop.production.spec.ts](../../../../../e2e/joint-loop.production.spec.ts)，在 production 项目、预览的严格 CSP（响应头等于 `PREVIEW_CONTENT_SECURITY_POLICY`，`securitypolicyviolation` 记录为空）和网络审计下运行。
    - 每个用例在自己的隔离 context 中以 `seedProductionCache(page, await jointLoopPackage(variant))` 用生产身份与预算预置 01 的变体包，刷新后经 “Open saved resources” 恢复并校验，再从主菜单进入任务。
    - 未修改 `e2e/support/` 或其他文件；仅生产用的辅助都写在本 spec 内。
  - **观察面：** 只读任务画面的 `data-owner/run/tick/position`、`mission-status` 的 `data-phase`、占位/基地页/结果页 DOM、浏览器探针（离页监听），以及经 React fiber 只读调用 `getState` 的任务 UI store。
    - UI store 的读法沿用 [mission-flow.production.spec.ts](../../../../../e2e/mission-flow.production.spec.ts) 读地图的先例。读取 Core 投影的 mission/player/combat/motion/communications/result 分区与 recent command results。
    - 不用开发面板、事件日志或录制，也不加查询钩子。
  - **种子与确定性：** 种子由生产应用自取（crypto），测试不读取也不设定。结局的稳定性来自变体本身：01 已在 Node 中用多种子、随机输入延迟验证两种结局。测试只按可见状态推进，例如等目标切换、等占位出现，不依赖固定 tick。
  - **输入：** 只有受信输入：游戏输入区按键、锁定指针下的地图光标移动与点击、页面控件（Start、Skip、Restart、Return、Open saved resources、僚机单选）。没有强制终局或状态写入。占位 G-02/3–G-02/8 均按可见时长自然结束。
  - **成功用例**（有僚机 0 → Restart → 无僚机），每条运行断言：
    1. **起飞：** G-02/2 的 variant 与僚机一致，位于新运行的 tick 0；running，焦点在输入区，tick 前进。store 中 runId 为第 n 次运行，mission 为 group 0 / slot 1 / rawDifficulty 19 / wingman，result in-progress，tick < 300。
    2. **飞行：** Backspace 的 `speed` accepted，玩家 z 增加（如 44 → 94）。
    3. **选目标：** `f` → 目标 mode friendly，kind 14；`t` → mode enemy，kind 7；最后两个结果均为 `target accepted`。
    4. **射击与击毁：** 按住 Alt，炮能从 100 降到 90；目标离开 kind 7 实体。随后地图的 contacts 中既无该实体，也无 kind 7。
    5. **俯仰：** 按住 `]`，store 中玩家朝向矩阵改变。
    6. **地图与 Warp：**
       - `m` 打开地图，view 8、context map，指针锁定。contacts 含 0、14、17 类；1 类是否出现与僚机选择一致；玩家 contact 为起飞时的玩家实体。
       - 锁定光标移到基地 contact 并点击：`map-point` accepted，`warpRequest` accepted。
       - `w` → context warp、view 1，`request-warp` accepted → 回到 flight、地图关闭。玩家距基地 581–619 单位（吸附在基地上方 600），焦点回到输入区。
    7. **对接：** `\` 停船；`c`、2、2 → 最后四个结果依次为 `speed`、`communications`、`select-number`、`select-number`，均 accepted。G-02/3 保持 tick（676–738）期间，store 的 docking 为 `{ docked: true, dockingObject: 基地 }`。之后进入基地页：`data-base` 为该基地，11 行，context base，tick 恢复前进。
    8. **离港：** `l` → G-02/4，`launch` accepted → flight，基地页消失，docking 解除，目标为 kind 8。
    9. **终局：** 按住 Alt → G-02/8 的 variant 为 wingman 或 solo，保持 tick 1404–1410。store 的 result 为 success、all-clear、rescuesUsed 0、playerKills 2、endingGaps `[G-02/8 variant]`，completedTick 等于保持 tick，mission phase 为 completed。
    10. **结果页：** 标题获得焦点，无输入区；内容为 success / all-clear、summary empty、`0 of 2`、`2`；只有 Restart 与 Return 两个按钮。
    11. **重试：** Restart → G-02/1 → 开始页预选上次的僚机，run/tick 为空；下一次起飞为 run 2、tick 0，再完整走一遍。
  - **失败用例**（无僚机 → Restart → 有僚机 0），每条运行断言：
    1. **起飞：** 同上。
    2. **第一次损失：** 第 19 tick 起为摧毁视角 0x11，mission phase 为 destruction-sequence → G-02/5（无 variant）在 tick 260 保持，result 仍为 in-progress → 自然结束，点击输入区后 tick 前进。
    3. **第二次损失：** Backspace accepted，能量从 82 下降 → G-02/6 在 tick 776 保持 → 回到飞行。
    4. **第三次损失：** Backspace accepted → G-02/7 energy 保持 tick 1301–1325。store 的 result 为 failure、third-loss energy、rescuesUsed 2、playerKills 0、endingGaps `[G-02/7 energy]`，completedTick 等于保持 tick。
    5. **结果页：** failure、third-loss:energy、summary failure、`2 of 2`、`0`；只有 Restart 与 Return；重试同上。
  - **收尾：** 两个用例最后都按 Return 回主菜单。任务入口获得焦点，任务画面消失，离页监听为 0，CSP 违规为空。
  - **AC-02（production 部分）：** 在恢复后的主菜单、每个 G-02/2、飞行、打开的地图、G-02/3、基地页、G-02/5、G-02/8、G-02/7 与结果页，都断言 DOM 中没有以下内容：`mission-dev-panel` 或任何 `data-testid^="dev-"`（含开发录制导出 `dev-recording-export`）、`a[download]`，以及名称含 record/export/replay/diagnos 的控件。结果页只有 Restart、Return 两个入口。
    - 构建产物与 source map 的扫描仍由 [production-preview.spec.ts](../../../../../e2e/production-preview.spec.ts) 和 [mission-flow.production.spec.ts](../../../../../e2e/mission-flow.production.spec.ts) 负责，本用例不重复。
  - **网络审计：** 每个用例 `complete: true`，targets `{ page: 1 }`，违规、缺口与缺失声明均为 0。另把生产来源指纹登记为金丝雀。
  - **浏览器验证：** `OSR_E2E_DEV_PORT=5106 OSR_E2E_PREVIEW_PORT=5107 pnpm test:e2e e2e/joint-loop.production.spec.ts --project=production` 连续两次通过：2 passed，分别为 3.8 min 和 3.7 min，成功用例约 113 s，失败用例约 105 s。上面的 tick 与距离取自这两次运行的附件。
  - **工程检查：** `pnpm typecheck` 与 `pnpm lint` 通过，`pnpm build` 通过（两次 `pnpm test:e2e` 也各构建一次）。
    - `pnpm check` 运行两次，Vitest 都只有与本改动无关的 4 个和 7 个用例在 5 s 超时，其中有 cockpit gauges/warp-display、engineering-boundaries 等。当时并行 worker 使机器负载达 43–78。
    - 首次超时的 4 个文件单独重跑全部通过（148 passed）。本改动只有 e2e spec，不在 Vitest 范围内。
    - 已按 simplify 清理：直接传 `flyFailure`，抽出 `fullSpeed`，复用起飞与选目标时已读的 view，证据附件改为 body 写入。
    - 未采纳：本文件的 store 读取器与 `map-warp.ts` 的 `readBridgeView` 部分重复，CSP 记录器与 `mission-flow.production.spec.ts` 重复。合并需要修改共享支持文件，超出写入范围。
  - **不读取原版文件**，提交中没有原版内容。
