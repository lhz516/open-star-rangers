---
type: plan
status: active
phase: "P3"
task: "15"
subtask: "01"
updated: "2026-10-29"
---

# 01 — 合成全闭环与 replay（development）

**契约来源：** [spec](../spec.md) 的 S-01、S-02、[行为与边界](../spec.md#行为与边界)前两行、[技术决定](../spec.md#技术决定)；AC-01 的 development 部分、AC-02。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新建 `e2e/support/joint-loop.ts`：在 Node 中由合成光盘转换结果构造联合闭环变体包（沿用 [mission-result.ts](../../../../../e2e/support/mission-result.ts) 的做法：替换 `mission-startable` 的任务与机型 payload，经严格逻辑编码器写回），使所选切片配置（group 0 / slot 1 的项目映射、原始难度 19、有/无僚机）下的运行能经正式输入自然经过起飞、飞行、选目标、射击、地图与 Warp、基地停靠/离港，并分别由规则到达成功（全清结算）与失败（被毁→救援→…→第三次损失）。可多个变体或多条运行合计覆盖；失败链不必经过成功独有的步骤。内容全部由代码生成，不含原版字节或解码内容。
- 新建 `e2e/joint-loop.development.spec.ts`（development 项目、网络审计下）：经开发测试入口恢复变体包，只用游戏输入区的受信输入和页面自身控件推进；逐步骤断言实际 UI/任务状态与开发事件日志中的正式 Core 事件（目标切换、开火/命中/被毁、`map-toggled`/`warp-*`、停靠/离港、`player-loss-started`/`player-rescued`、`settlement-started`/`result-latched`），以及结果页的结果值；每种结果页选择重试，断言新运行从任务初始状态与 tick 0 开始。
- 成功与失败两种完整运行各下载一份正式录制，在测试进程中以 [replay-check.ts](../../../../../tools/replay-check.ts) 的 `runReplayCheck`（同一合成光盘白名单）或 `replayRecord`/`compareReplayResults` 重放，断言事件序列、周期检查点与最终结果完全匹配（`{ match: true }`），并在证据中记录规则/内容身份、种子、运行时与事件/检查点摘要。
- 不注入终态、不直接改写 Core 状态、不 mock 结果；闭环步骤只经游戏输入区与地图光标的正式输入推进，不用开发命令编辑器提交玩家命令；开发面板只用于读取事件与导出录制。

## 不包含

- production 构建流程（02）、真实隐藏与资源平衡（03）、类型 9 警告（04）。
- 修改 `src/` 产品代码。若闭环某步因产品缺陷不可达，记录现象并作为差异交回责任任务（由协调者追加修复项），不在本任务补功能。

## 关键文件与契约

- 现有：[mission-result.ts](../../../../../e2e/support/mission-result.ts)、[production-cache.ts](../../../../../e2e/support/production-cache.ts)、[map-warp.ts](../../../../../e2e/support/map-warp.ts)、[base-interaction.ts](../../../../../e2e/support/base-interaction.ts)、[mission-observations.ts](../../../../../e2e/support/mission-observations.ts)、[keyboard-input.ts](../../../../../e2e/support/keyboard-input.ts)、[audited-test.ts](../../../../../e2e/support/audited-test.ts)、[recording.ts](../../../../../src/core/replay/recording.ts)、[replay.ts](../../../../../src/core/replay/replay.ts)、[compare.ts](../../../../../src/core/replay/compare.ts)。
- 计划新增：`e2e/support/joint-loop.ts`、`e2e/joint-loop.development.spec.ts`。

## 写入范围

- `e2e/support/joint-loop.ts`：联合闭环变体包与共享观察。
- `e2e/joint-loop.development.spec.ts`：development 闭环与 replay 用例。
- `e2e/support/mission-result.ts`：仅在需要把变体构造抽成可复用导出时修改，行为不变。

## 验收标准

- [x] AC-01（development）：在有/无僚机配置下，起飞、飞行、选目标、射击、地图/Warp、基地交互、成功、失败与各自重试在一条或多条自然运行中全部出现，均有 UI/Core 事件/结果值断言；没有以画布存在、mock 事件或强制终态作为证据。
- [x] AC-02：成功与失败两份开发录制的 Node 重放均为 `{ match: true }`；证据记录身份、种子、运行时与摘要，并只声明同一运行时一致。
- [x] 合成包只由代码生成，测试不读取 `local/` 或原版文件；网络审计无违规。
- [x] 已按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本子任务新增的测试代码；`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 执行：`pnpm test:e2e e2e/joint-loop.development.spec.ts --project=development`，连续两次通过；附每条运行的步骤断言清单与种子。
- 若某步不可达，保留开发事件日志与录制，写明受影响步骤与责任任务。

## 完成证据

- **2026-10-29（worker exec/p3-15-01）：**
  - **实现：** 新增 [joint-loop.ts](../../../../../e2e/support/joint-loop.ts)，在 Node 中由 `mission-startable` 合成转换结果构造 `success`/`failure` 两个变体。它替换任务、机型信息、通讯菜单与通讯消息 payload，后两者取 P3-10 合成对接盘的 `dockingRuleDataContents()`。
    - 两个变体的共同布局：玩家前方 1,000 单位有一架静止的 7 类目标；约 8,300 单位外有一座零转向的 17 类基地；离港线上 500 单位处有一架 8 类目标。玩家机炮一发即可击毁目标；玩家 +0xA8 设为 3，使 Warp 隧道短而直，到达点吸附在基地上方。
    - `failure` 让 14 类友机以巨大船体与玩家重合，使玩家开局即被撞毁；玩家能量只有 1%，救援后两次耗尽。
    - 导出的可复用部分：变体构造器 `jointLoopPackage`；Node 重放与比较 `replayJointLoop`；受信输入辅助 `pressInZone`/`holdGun`/`requestDocking`/`openLockedMap`/`selectContact`；页面观察 `awaitPlaceholder`/`holdEnded`/`resultPage`。浏览器侧辅助不依赖开发面板。
    - 新增 [joint-loop.development.spec.ts](../../../../../e2e/joint-loop.development.spec.ts)，在网络审计下运行。`mission-result.ts` 未修改。
  - **单一运行时内的确定性预检（仅 Node，不计入验收）：** 删除前的临时脚本在 Node 世界中，用 30 个种子、随机输入延迟（每步至多 400 tick）、有/无僚机各跑两个变体，成功/失败均为 30/30。
  - **浏览器验证：** `OSR_E2E_DEV_PORT=5103 OSR_E2E_PREVIEW_PORT=5104 pnpm test:e2e e2e/joint-loop.development.spec.ts --project=development` 连续两次通过，每次 2 passed，约 3.9 min。
    - 输入只来自游戏输入区按键、地图光标的锁定指针移动与点击，以及页面自身控件（Start、Restart、Return）。
    - 开发面板只用于 Refresh state、Clear log 和导出录制，不用命令编辑器。
    - 衔接占位均按可见时长自然结束。
  - **成功用例**（种子 `0x0eed1501` 带僚机 0，`0x0eed1502` 无僚机，原始难度 19，group 0 / slot 1），每条运行逐步断言：
    1. **起飞：** G-02/2 位于新运行的 tick 0 → running，焦点在输入区；面板 run/seed/wingman 与 0/7/8/14/17 类实体一致。
    2. **飞行：** Backspace 的 `speed` accepted，store 中玩家 z 增加。
    3. **选目标：** `f` → `target-changed` mode=friendly origin=command；`t` → mode=enemy、kind 7、origin=command。
    4. **射击：** 按住 Alt，`shot-fired` 全部来自玩家主炮；对该实体的 `hit` 与 `object-destroyed` 的 attacker 为玩家。
    5. **俯仰：** `]` 的俯仰轴在录制中可见。
    6. **地图与 Warp：** `m` → `map-toggled` open=true、view 8，指针锁定；锁定光标移到基地 contact 并点击 → `warp-destination-set` iconKindBit=17，store 显示 `warpRequest` accepted；`w` → `warp-started`、context warp；`warp-completed` arrived=true，snapped 为基地，之后回到 flight。
    7. **对接：** `\` 停船；`c`、2、2 → `docking-requested` 与 `command-delivered` code=9；`docked` 与 `transition` G-02/3，占位保持 tick；随后基地页 11 行，`data-base` 为该基地。
    8. **离港：** `l` → `launch` accepted、`departed`、`transition` G-02/4 → flight；`target-changed` 指向 kind 8。
    9. **终局：** 按住 Alt → kind 8 由玩家击毁 → `all-clear` → `settlement-started` success → G-02/8 保持 tick；`result-latched` 为 success、all-clear、rescuesUsed 0、playerKills 2、endingGaps `G-02/8 wingman|solo`；`mission-completed` 的 tick 等于保持 tick。
    10. **结果页：** success / all-clear、summary empty、`0 of 2` 救援、`2` 击毁。
    11. **重试：** Restart 后 G-02/1，开始页预选上次的僚机；第二条运行同样从 G-02/2 的 tick 0 开始，run+1，种子为下一个，再完整走一遍。
  - **失败用例**（种子 `0x0eed1511` 无僚机，`0x0eed1512` 带僚机 0），每条运行逐步断言：
    1. **起飞：** 同成功用例。
    2. **第一次损失：** `player-loss-started` destroyed → `player-rescued` rescues=1 → G-02/5 保持 tick 260 → 回到飞行，点击输入区。
    3. **第二次损失：** Backspace accepted → `player-loss-started` energy → G-02/6，rescues=2，保持 tick 776。
    4. **第三次损失：** `player-loss-started` energy → G-02/7 energy → `result-latched` failure、third-loss energy、rescuesUsed 2、kills 0 → `mission-completed`。
    5. **结果页：** failure、third-loss:energy、summary failure、`2 of 2`、`0`。
    6. **重试：** 新运行从 tick 0 开始，救援计数重新从 1 起。
  - **录制与 Node 重放：** 每条运行在结果页下载正式录制，在测试进程中经 `replayRecord`（种子化包内容）与 `compareReplayResults` 比较，结果为 `{ match: true }`，且 `completedRun` 为真。录制中 run 为 `{ rawDifficulty: 19, wingman, seed, clockUnitsPerTick: 2 }`，mission 为 `mission/first-campaign`，ticks 数等于 finalTick。
    - 成功录制含 speed、target friendly/enemy、fire、toggle-map、map-point、request-warp、communications、select-number、launch 与非零俯仰轴；重放事件依次为 kind 7 击毁 → map-toggled → warp-started/completed → docking-requested → docked → G-02/3 → departed → G-02/4 → kind 8 击毁 → all-clear → settlement-started → result-latched → mission-completed。
    - 失败重放依次为 destroyed、rescued、G-02/5、energy、rescued、G-02/6、energy、result-latched、mission-completed。
    - 身份（第二次连续运行）：rulesVersion 11，producer `open-star-rangers 0.0.1 development`。成功包的 manifest 前缀为 `sha256:83ddb0abbc5116…`，setupHash `4a6883b8184f09e5`；失败包为 `sha256:ff12fdd1c5b796…`，setupHash `7489f455ec380ad2`；converter `osr-import.graphics-6.logic-4.audio-2.models-4`，origin original-import（测试入口 profile 的合成光盘指纹）。checkpointInterval 32。
    - 各运行摘要（finalTick / 事件 / 检查点 / 末检查点哈希）：

      | 运行 | finalTick | 事件 | 检查点 | 末检查点哈希 |
      |---|---|---|---|---|
      | 成功 1（僚机 0） | 1412 | 106 | 46 | `455114c2d53ff395` |
      | 成功 2（无僚机） | 1409 | 103 | 46 | `6f20031249c8cb87` |
      | 失败 1（无僚机） | 1345 | 53 | 44 | `56354b25caf7088f` |
      | 失败 2（僚机 0） | 1326 | 56 | 43 | `9887b04901df894f` |

    - 录制于 Chromium 156.0.8078.74，重放于 Node v22.22.0。只声明同一代码版本、内容身份与这两个运行时下一致，不作跨浏览器逐位一致结论。
  - **合规：** 包只由代码生成，测试不读取 `local/` 或原版文件。审计 canary 为测试入口的源指纹；两次运行均无网络违规。
  - **审查与清理：** rubber-duck（code-review 子代理）未发现会使断言空过的问题，提出两点，均已采纳：证据补记录制所用 Chromium 版本；救援后改为点击输入区，不再用脚本 focus。
    - 第二次连续验证时，占位在 3 s 后自然结束，与 Skip 竞争而失败一次；已改为等待占位自然结束（`holdEnded`），之后连续两次通过。
    - simplify 四角度审查已采纳：复用 `replayedEnding` 与 `COMM_MENUS_ASSET`，因而 `mission-result.ts` 无需改动；合并两个用例为 `runCase`；页面辅助移入 support；按页面保存鼠标位置；合并 map 读取。
    - 未采纳：步骤日志的进一步抽象（可读性取舍），以及把驱动输入从断言中拆出（交给 02 按需复用 support 中的辅助）。
  - **工程检查：** `pnpm typecheck`、`pnpm lint` 通过。`pnpm check` 第一次在机器高负载（load ≈ 9，并行 worker）下有 1 个无关测试超时：`tools/engineering-boundaries.test.ts` 中 cockpit boundaries 的 5 s 限制，该文件单独运行 113/113 通过；重跑后完整通过，445 个文件、11,900 个测试，构建成功。
  - **文档影响：** `docs/engineering/README.md` 的 E2E 说明归子任务 10，建议的措辞已写入 worker 报告；其他文档无需更新。
