---
type: plan
status: active
phase: P2
task: "11"
subtask: "13"
updated: 2026-10-06
---

# 13 — StrictMode、Fast Refresh 与往返

**契约来源：** [spec](../spec.md) 的 S-12、AC-16，以及 AC-01 的往返部分；方法沿用 [P1-08 AC-12](../../../p1/08/spec.md)。
**依赖：** 07, 11。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 开发项目 E2E（测试入口，合成数据）：
  - **首次挂载：** StrictMode 下，至多一个作业持有者、一个查看器画布与一个音频上下文。
  - **作业运行中的编辑：** 保留应用外壳，做至少 3 次可还原、确实重跑目标 effect 的 Fast Refresh 编辑。每次稳定后：旧 Worker 已终止；导入页面能启动新作业。
  - **查看器打开时的编辑：** 同样至少 3 次。每次稳定后：旧画布已断开，旧音频上下文已关闭；新所有者与画布的身份不同于旧的，恰好一个已连接的画布；查看器重新显示当前项并能试听合成音效。
  - **不算替换成功：** 整页重载、只更新 JSX 而不重跑 effect，或画面被清空。
  - **往返：** 菜单、导入、查看器与演示之间往返 3 轮后，监听、观察器、Worker、画布与帧请求都回到基线。
- 每次编辑由测试还原；测试结束后检查工作区没有遗留改动。
- 若发现实现缺口，回到相应子任务（06、07、10、11）修正，并在本子任务记录。

## 不包含

- 生产预览（14）；缓存恢复（12）。

## 关键文件与契约

- 计划新增 E2E 用例；复用 [browser-probes.ts](../../../../../e2e/support/browser-probes.ts)、[joint-resources.spec.ts](../../../../../e2e/joint-resources.spec.ts) 的基线比较，以及 P1-08 用例中可还原编辑的做法。

## 验收标准

- [x] AC-16：首次挂载、作业运行中与查看器打开时的编辑、往返 3 轮的结果都如上。
- [x] 替换成功有新旧身份的证据；整页重载等不计入。
- [x] 测试结束后工作区没有遗留改动；开发项目的相关 E2E 通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 运行 `pnpm exec playwright test <新用例> --project=development`。
- 本子任务只新增测试时，不需要 simplify；若修改实现代码，按 execute-goal 做 rubber-duck 与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)，并运行 `pnpm check`。

## 完成证据

- **发现的实现缺口（回到 06、10、11 修正）：**
  - **外壳的资源持有者：** 它在 `App` 自己的 effect 中创建，`App.tsx` 的任何 Fast Refresh 都会重建它并丢掉持有的资源包，不能“保留应用外壳”。[ImportScreen](../../../../../src/app/ImportScreen.tsx) 与 [ViewerScreen](../../../../../src/app/ViewerScreen.tsx) 因此从 `App.tsx` 移到各自的模块。编辑它们或它们的 hook 只刷新该画面。
  - **StrictMode 下 effect 不重跑：** React 19.3 刷新时第一遍渲染忽略旧依赖，但 StrictMode 的第二遍（`renderWithHooksAgain`）重置了这一标志，所以依赖都是 props 与 state 的 effect 不会重跑。只有依赖刷新重建的 `useCallback`、`useMemo` 结果的 effect 会重跑；`useImportJob` 的移交正是如此，所以它原本就有效。浏览器中以日志确认：查看器 hook 重新渲染，但 effect 不运行。

    [use-viewer-owner.ts](../../../../../src/app/composition/use-viewer-owner.ts) 改以 memo 化的 `optionsFor` 构建所有者选项，effect 依赖它。
  - **接续当前项：** 被替换的所有者原先从未选中开始，不能“重新显示当前项”。hook 在 effect 清理时记下所选条目、变体与视图，交给下一个所有者作为 `ViewerOwnerOptions.initial`；离开查看器后再打开仍从未选中开始。
  - **所有者身份的诊断：** 查看器槽位为所有者编号（`ViewerOwner.serial`，画面区域的 `data-owner`）。作业持有者在页面中编号，并计数尚未释放的（`ImportJobOwner.serial`、`liveImportJobOwners()`，导入页面的 `data-job-owner` 与 `data-live-job-owners`）。计数放在不会被编辑的 [import-job-owner.ts](../../../../../src/app/import/import-job-owner.ts)：被编辑的模块重新求值时，其中的计数会归零。
- **Node 测试：**
  - [viewer-owner.test.ts](../../../../../src/app/viewer/viewer-owner.test.ts)：起始状态恢复所选条目、变体与视图；已不在列表中的条目只恢复视图；槽位依次编号。
  - [import-job-owner.test.ts](../../../../../src/app/import/import-job-owner.test.ts)：作业持有者按创建顺序编号，释放后不再计数，重复释放只计一次。
- **用例：** [fast-refresh.spec.ts](../../../../../e2e/fast-refresh.spec.ts) 共 3 条，只在开发项目运行。
  - **编辑方式：** 在运行中的开发服务器上编辑 hook 源文件，每次追加一行不同的注释，以写临时文件再改名的方式替换。`finally` 中还原并读回核对，所以测试结束后工作区没有遗留。
  - **替换的证据：** 文档标记不变，排除整页重载；所有者编号递增；新画布的身份不同于旧画布。只重渲染、整页重载或画面被清空都满足不了这些检查。

  浏览器为本机 Chrome（Playwright `channel: 'chrome'`，无头），开发服务器 `http://127.0.0.1:4173`，1280×800，DPR 1，只用合成数据：

  | 准则 | 设置与操作 | 期望 | 观察到的证据 | 结果 |
  |---|---|---|---|---|
  | 首次挂载 | StrictMode 下导入后打开查看器；打开 `busy` 场景的导入页面 | 至多一个所有者、一个画布与一个音频上下文；一个尚未释放的作业持有者 | 所有者 1，已连接画布 1 个，点击前音频上下文 0 个；`data-live-job-owners` 为 1，一次开始只有一个 Worker | 通过 |
  | 查看器打开时编辑 3 次 | 选中模型、部件列表 1 并向右转，试听后编辑 `use-viewer-owner.ts` | 每次稳定后：新所有者（编号加 1）与新画布，旧画布断开且上下文丢失，恰好一个已连接画布；同一文档；仍显示同一条目、变体与视图；旧音频上下文已关闭，新所有者能试听 | 3 次都如期望 | 通过 |
  | 作业运行中编辑 3 次 | `busy` 场景开始作业后编辑 `use-import-job.ts` | 每次稳定后：旧 Worker 已终止，作业持有者编号加 1 且只有 1 个未释放，同一文档，能开始新作业 | 3 次都如期望；还原文件引起的第 4 次刷新也结束了最后一个作业 | 通过 |
  | 往返 3 轮 | 菜单 → 导入（每轮开始一个作业后离开）→ 查看器（选中图像）→ 演示 → 菜单 | 监听、观察器、Worker、画布与帧请求回到基线 | 每轮都创建一个新 Worker，离开后都已终止；各项都回到基线 | 通过 |

- **检查：**
  - `pnpm exec playwright test e2e/fast-refresh.spec.ts --project=development`：先以 `--repeat-each=3` 运行 9 条通过，复审修正后以 `--repeat-each=2` 运行 6 条通过；
  - `pnpm exec playwright test --project=development`：81 条通过，耗时 13.5 分钟（本机负载很高）。
  - **`pnpm check`：** 起初通过（152 个文件 4,497 条测试）。复审修正后，本机负载升到 13–27（VS Code 与 copilot 运行时），整体运行中启动子进程的工具测试超时。分项核对都通过：
    - `pnpm typecheck`、`pnpm lint`、`pnpm build` 通过；
    - `pnpm exec vitest run src`：133 个文件 4,242 条通过；
    - `tools` 的测试用更长的超时（`--testTimeout=120000`）运行，只有两条自带 30 秒与 45 秒超时的合规集成测试仍超时；临时调高它们的超时后通过，随即以 `git checkout` 还原。本子任务没有改动 `tools/`。
- **Rubber-duck：** 3 个阻塞问题与 2 个非阻塞问题，均已修正：
  - **阻塞：**
    - 第一次编辑前没有试听，旧音频上下文已关闭的检查在第一次空真：现在先试听，并逐次核对上一个上下文已关闭、新的为 `running`；
    - 只以画布证明替换，不能证明所有者的身份与“至多一个作业持有者”：新增上述编号与计数，并断言；
    - 往返中没有作业，Worker 基线空真：每轮开始一个作业，核对新 Worker 出现、离开后已终止。
  - **非阻塞：**
    - 画布的轮询可能停在清空的瞬间：改为等到恰好一个已连接、且不是旧画布；
    - 还原的核对只在成功时进行、写入非原子：改为原子写入，并在 `finally` 中核对。
- **Simplify：** 采纳：
  - 改为在 effect 清理时读取所有者快照，不再另行订阅；
  - 所有者选项改为中性的 `initial`；
  - 共享的 `smallFile`（导入页面用例同样改用）；
  - 轮询所得的诊断直接复用。

  未采纳：与导入页面用例共用探针快照的筛选，两者所取的字段不同。
- **文档影响：** [工程约定](../../../../engineering/README.md)新增“画面模块与 Fast Refresh”一节（StrictMode 下的重跑、接续与诊断）。[源码结构](../../../../engineering/source-structure.md)的目录树加入两个画面模块。
