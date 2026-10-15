---
type: plan
status: active
phase: P3
task: "10"
subtask: "23"
updated: 2026-10-15
---

# 23 — 浏览器回归

**契约来源：** [spec](../spec.md) 的 AC-14；[验证策略](../spec.md#验证策略)的“浏览器验证”。
**依赖：** 20, 22。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 在本机 Chrome 用合成任务包与独立 E2E runner 验证：输入区 `c`/数字 → 停靠 → G-02/3（自然结束与跳过各一次）→ G-05 → 服务实际变化 → `L` → G-02/4（自然结束与跳过各一次）→ 飞行。
- 断言：上下/Enter 每次只提交一次，服务选择/状态/读数与 projection 一致；保持、暂停与隐藏期间无 tick，恢复无旧按键；Tab 离区不执行命令；焦点与 4:3 布局；故障可见；标注可见；网络审计与资源平衡通过。
- 只用测试侧可读诊断，不新增生产状态修改 API；正式 MFD 未接入时只验菜单协议，不宣称生产通讯画面通过；合成键不作为系统快捷键拦截证据。

## 不包含

- 驾驶舱画面（P3-13）；P3-05 的实机绑定（不重复宣称已重验）。

## 关键文件与契约

- 现有 [e2e/](../../../../../e2e/) runner 与合成包支持（`e2e/support/`）；[browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)。
- 计划新增：`e2e/base-interaction.spec.ts`。

## 写入范围

- `e2e/**`：新增用例与支持代码。
- `local/research/p3-10/browser/**`：截图与日志（被忽略）。
- `src/workers/synthetic-import.test-support.ts`、`src/workers/import-scenarios.test-support.ts`、`src/workers/mission-scenarios.test.ts`：可停靠的合成场景 `mission-docking`（仅测试数据）。

## 验收标准

- [x] AC-14 的完整浏览器流程与各项断言通过，含 DOM、键盘、Core 读模型与生命周期的联合断言。
- [x] 网络审计与资源平衡通过；页面不含原版内容。
- [x] `pnpm test:e2e`（或其针对本用例的运行）通过。

## 验证方法

- `pnpm test:e2e`；失败时保留 trace 于 `local/research/p3-10/browser/`。

## 完成证据

2026-10-15，worker 分支 `exec-p3-10-23`（基于 9728b718）。本机 Chrome 155（Playwright `channel: chrome`），macOS，视口 1280×800，DPR 1，开发源 `http://127.0.0.1:5169`。

- **合成场景：** 现有合成包的通讯菜单没有列出基地的类别，也没有停靠命令（代码 9）；Node 探查确认 `c` 之后只能选到玩家自身与只有退出项的菜单，所以按协调者批准扩大写入范围（9728b718）。新增 `mission-docking`（[synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts) 的 `dockingRuleDataContents`、`dockingScenarioSpec`，`sliceCoveredFiles` 新增 `ruleData` 选项；在 [import-scenarios.test-support.ts](../../../../../src/workers/import-scenarios.test-support.ts) 注册）。改动有四项：类别为玩家、基地种类 17、退出；基地的门控菜单为 1 状态（7）、2 停靠（9）、`x`；把 TABL 20985 的一张脸并入 TABL 20011，使基地脸池的 5 张脸都有停靠回复与状态回复；玩家与基地的 +0xB8 为 0，区域 2 缩小，使基地起始就在停靠范围内。只是合成测试数据，不是原版事实。[mission-scenarios.test.ts](../../../../../src/workers/mission-scenarios.test.ts) 验证包完整且能加载，验证菜单、脸表与速度，并用 4 个种子在第 60 tick 按 `c`、2、2 停靠，均无取消。
- **E2E：** [base-interaction.development.spec.ts](../../../../../e2e/base-interaction.development.spec.ts)。测试入口只在开发服务器上提供，所以文件名按配置约定带 `.development`，计划中的名称是 `base-interaction.spec.ts`。支持代码为 [base-interaction.ts](../../../../../e2e/support/base-interaction.ts)；`endPlaceholder` 扩展到 G-02/3、G-02/4（[mission-observations.ts](../../../../../e2e/support/mission-observations.ts)）。
  - 主流程（无头 Chrome，网络审计全程，加 `file-name` 与源指纹 canary）跑两个 run。第 1 run 停靠占位自然结束（可见时长 ≥2.9 s），离港占位用 Enter 跳过；第 2 run 停靠用 Esc 跳过，离港自然结束。每次输入区里的 `c`、`2`、`2` 都各只有一条 command-result；事件日志显示 `left-page-changed` 为 2、4，然后是 `command-delivered` code=9、`docking-requested`、`docked`、`transition gap=G-02/3`。保持期间 tick 600 ms 不变，结束后焦点回到输入区并继续推进。
  - 真实服务：停靠前用 Space 发射一枚导弹。MutationObserver 记录基地页首次渲染为导弹 3、“能量与导弹已满”为否，随后变为 4、是。
  - 按键次数：上、下逐次只提交一条，光标依次为 1、2、1，与 `base-navigated` 的 row 一致。按住 Enter（加 3 次重复）只有一次 `confirm-selection` 和 `base-confirmed row=1`。`M` 显示 `toggle-map: rejected (not-implemented)`。
  - Tab 离开输入区后，再按 上、下、`l`、`m`、`c`，8 tick 内没有 command-result，光标不变。`P` 暂停时 tick 不变；暂停中按 下、Enter、`l`，恢复后不执行。
  - 读模型：暂停时导出录制，在 Node 用同一个包重放（`createWorld` + 逐 tick）。最终 tick 等于页面 tick；页面的光标、11 行（record/selector/state/inService/selected）、三个完成标志与能量、船体、导弹读数，都等于 `basePageView(projection)`。菜单协议只在这个测试读模型上验证：`c` 后为类别菜单 [1, 0x20000, exit]；`2` 后为该基地的门控菜单 [7, 9, exit]；`2` 后菜单关闭，停靠子状态为 3，对象是该基地。没有宣称生产通讯画面通过（MFD 归 P3-13）。
  - 故障可见：一个任务内 257 次合成的 下 撑满命令队列。基地页显示 `role="alert"` 的 `base-command-error`，包含 `command-queue-full`；焦点留在输入区，run 继续，光标停在最后一行 10。
  - 布局与标注：`mission-view` 宽高比与 4:3 的差小于 0.01，输入区四边与其相差不超过 2 px。G-02/3、G-02/4、G-05 的说明可见，文字等于 `SLICE_GAPS`。
  - 收尾：返回主菜单后资源平衡 `check` 通过（不含音频）。页面文本不含合成标记。
- **原生 hidden/visible（有头 Chrome，CDP 自有上下文两个标签，两者都接入审计）：**
  - 停靠占位显示时切到后台：状态变为 `waiting`，3.5 s 内 tick 不变；切回前台后跳过，进入基地页仍为 `paused`，tick 不变，按 `P` 才继续。
  - 在基地按住 下，然后隐藏：run 自动暂停（`pause=hidden`），光标与 tick 不变；可见后仍然暂停；按 `P` 恢复 20 tick 后，光标与 `base-navigated` 计数不变，松开按键后也不变（恢复无旧按键）。
  - 没有页面错误。上下文与浏览器都已销毁。
- **检查：**
  - `pnpm check` 通过（303 个文件、8944 项）。
  - 新 spec 连跑两遍（`--repeat-each 2`）均通过。
  - `OSR_E2E_DEV_PORT=5169 OSR_E2E_PREVIEW_PORT=5170 pnpm test:e2e` 第一遍 225 项全部通过（含本 spec 的早期版本）。清理后的第二遍 224 通过，1 项失败：`joint-pipeline.development` 的 responsiveness 记到一个 66 ms 长任务（与本改动无关的 canary 场景）；单独重跑该 spec 2 项通过。日志与该失败的 trace 保存在 `local/research/p3-10/browser/`（被忽略）。
  - 合成键不作为系统快捷键拦截的证据；P3-05 的实机绑定没有重新宣称。
- **rubber-duck：** 采纳 4 项：用队列满产生真实的提交失败并断言 alert（原先只看拒绝结果）；菜单协议改为测试读模型上的 projection 断言（原先只看事件）；两个用例都加 canary；服务变化的首个读数用 MutationObserver 从挂载起记录（保持帧就是停靠 tick 的 projection，基地页挂载时同步渲染它）。
- **simplify：** 采纳：停靠与离港共用 `throughHold`；服务观察移到支持文件（`watchService`、`serviceLog`）；固定等待改为 tick 屏障 `afterTicks`；原生用例复用缓存的合成盘；`DOCKING_BASE_KIND` 派生掩码与静止种类；`sliceCoveredFiles` 单一出口；Node 测试把运行配置提到循环外，并在 `docked` 时提前结束。未采纳：把 Node 端的世界输入组装与 `mission-scenarios.test.ts`、`tools/replay-check.ts` 合并为共享 test-support，因为需要超出写入范围的新文件或工具改动，而且放进 Worker 会打包的 `import-scenarios.test-support.ts` 会把 Core/app 引入 Worker 包；把原生按键封装进 `NativeTarget`，与 `keyboard-input` 用例的现有写法一致，留待需要时再做。
- **文档影响：** 工程与指南文档没有列出合成任务场景或 e2e 用例清单，无需更新；STATUS 与阶段索引无变化。建议 27 在交接文档中提及 `mission-docking` 场景与本 spec。

