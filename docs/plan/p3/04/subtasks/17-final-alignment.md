---
type: plan
status: active
phase: P3
task: "04"
subtask: "17"
updated: 2026-10-10
---

# 17 — 最终对齐

**契约来源：** [spec](../spec.md) 的全部 S-01 至 S-12 与 AC-01 至 AC-22。
**依赖：** 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 18, 19。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 只做验证，不交付新的功能代码；发现缺口时由协调者新增修复子任务。
- 按 [goal 的验收覆盖](../goal.md#验收覆盖)逐项核对每个 S 与 AC 的实现与证据，包括 01–16 的完成证据。
- 核对 spec 的关键不变量：
  - 只有一条游戏循环；非 running 无游戏帧请求；Core 状态不触发 Runtime 暂停；没有每 tick 外部检测器或 Core 写回入口。
  - 故障后不读取新快照、不导出；容量停止可导出；结果不明的命令不报取消。
  - 占位不推进 Core、不补计时间；隐藏保护不被自动倒计时绕过。
  - 资源包代际与 holder 销毁顺序；清理失败锁存；离页登记只在有运行时存在。
  - 生产构建不含开发诊断与测试支持；生产代码不读 URL 参数或全局开关。
  - Core 契约、`RULES_VERSION` 与录制格式未被修改；Core 纯度与边界规则保持。
  - 原版隔离：仓库中没有原版内容、派生输出或原版界面文字；`local/research/p3-04/` 未被跟踪。
- 运行工程检查与浏览器回归，核对文档与元数据。

## 不包含

- 新功能代码、重写证据或放宽 spec；push、部署或阶段切换。

## 关键文件与契约

- [spec](../spec.md)、[goal](../goal.md) 与 01–16 的完成证据。

## 写入范围

无。

## 验收标准

- [x] 每个 S-01 至 S-12、AC-01 至 AC-22 都有对应实现与证据，AC-17 的真实内容证据与 AC-20 的对照记录存在且不越界。
- [x] 上列不变量逐项核对通过。
- [x] `pnpm check`、`pnpm check:compliance`、`pnpm test:e2e`（development、production、development-headed）通过。
- [x] `git grep` 确认受跟踪源码、测试与文档中没有对已删合成模块的引用（协调者拥有的 `tasks.md` 已处理或列明）。
- [x] 改动文档的 `updated:`、链接、锚点与元数据正确；`node tools/task-state.ts p3/04` 无计划问题。

## 验证方法

- 上列命令与审阅；逐项记录结果、命令输出摘要与披露项。

## 完成证据

协调者于 2026-10-10 在 goal 分支 `p3-04-runtime-session-spec` 上执行（第二轮；第一轮因 `audio-playback.spec.ts` 的回归未通过，见 goal 执行记录与修复子任务 19）。核对时的代码与 `7825ec2d` 相同（其后只有本文件、goal 与 STATUS 的改动）。

### 范围与验收覆盖

| 项 | 实现与证据 | 结果 |
|---|---|---|
| S-01、AC-01、AC-02 | 02 的 Runtime 与 Node 测试（时间序列、读模型、意图、队列 256/257、每 tick 64/65、自动开火占额、逐 tick 映射） | 通过 |
| S-02、AC-03、AC-04、AC-05（会话）、AC-06 | 02、03 的失败帧与容量停止、P1-05 关键边界、初始出发保持、录制 JSON 往返 replay | 通过 |
| S-03、S-04、AC-05（所有者）、AC-07、AC-08、AC-09、AC-10 | 05 的流程、资格、所有者、槽位与收尾顺序的 Node 测试；10 的开发与生产浏览器流程、四种不能开始、原生 `beforeunload`；11 的 Fast Refresh 与资源平衡 | 通过 |
| S-05 | 04 的端口与平台适配器；05 的两级所有权；09 的接线 | 通过 |
| S-06、AC-11 | 06 的 store、桥接与命令反馈 | 通过 |
| S-07、AC-22 | 07 的诊断模型与导出；10 的开发下载与资源释放；12 的生产产物与 DOM 中没有诊断 | 通过 |
| S-08、AC-16 | 08 的工具与 Node 用例；10 的浏览器下载后核对；14 的生产 CLI 真实内容成功路径 | 通过 |
| S-09 | 01 的 `mission-*` 合成场景，经 10 的测试入口与生产缓存使用 | 通过 |
| S-10、AC-18 | 09 断开引用；10–12 迁移（每个旧用例的去向见 11、12 的完成证据）；13 删除 57 个文件与 lint 规则；15 的退役记录；16 改写 420 个历史链接；18、19 修复两处由 09 的开发期顶层 `await` 引起的测试就绪竞争 | 通过 |
| S-11、AC-19 | 09 的 `slice-gaps-copy.ts` 与页面标注（10 在浏览器中逐项读取）；15 的 `slice-gaps.md` 与代码的 G ID 一致 | 通过 |
| S-12、AC-17、AC-20、AC-21 | 14 的私有真实内容实验（输出只在 `local/research/p3-04/`）与 R-13 控制子集、L-01/L-02/L-10 流程部分的对照记录，未关闭 U-010、U-021、U-031；15、16 的文档同步 | 通过 |

### 不变量

- **单一游戏循环：** 帧请求只经会话的宿主（`game-session.ts`），开发帧计时只包装该宿主；11 的资源平衡确认飞行中至多一个游戏 rAF，暂停、保持与任务菜单中为零。会话不读取 Core 状态来暂停，没有每 tick 检测器或 Core 写回（`game-session.ts` 与其类型测试）。
- **故障与容量：** 故障后不提供新快照或导出，容量停止可导出，结果不明的命令不报取消（02、03 的测试）。
- **占位：** 不推进 Core（出发期间 tick 0，10 的两种构建都核对）、不补计时间；隐藏保护不被自动结束绕过（05、11）。
- **代际与收尾：** `beforeReplace` 与 holder 销毁两条路径、清理失败锁存、离页登记只在有运行时存在（05 的 Node 测试，10、11 的浏览器证据）。
- **生产边界：** 生产代码不读 URL 参数或全局开关（`git grep` 只见 `navigator.storage` 的平台读取）；`dist/` 与 source map 不含开发诊断、测试入口或测试支持（12 的产物检查；`grep` 生产包中的面板与测试入口标识为 0）。
- **Core 未改：** 自基线 `bb639ef` 起 `src/core/` 只有 `src/core/synthetic/` 的删除，契约、`RULES_VERSION` 与录制格式不变；Core 纯度与其余边界规则保留（13 只删除 `osr/core-synthetic-boundary` 及其回归，属于已批准的删除）。
- **原版隔离：** 没有跟踪 `local/` 下的文件或原版格式文件；`pnpm check:original` 与 `pnpm check:compliance` 均通过、无发现。

### 检查

- `pnpm check`：通过（213 个测试文件、6,268 个测试与构建，在 19 集成时运行，之后没有代码改动）。
- `pnpm test:e2e`（development、production、development-headed）：196/196 通过（12.2 分钟，Chrome 155.0.8059.39，端口 5190/5191）。
- `pnpm check:compliance`、`pnpm check:original`：通过，无发现。
- `git grep` 已删除模块的路径与导入：`src`、`tools`、`e2e` 与配置中没有引用。例外是 `e2e/production-preview.spec.ts` 中断言生产 source map 不含已退役路径的负向正则（协调者按 13 的选项 A 保留，作为防止重新引入的检查）。测试中说明退役的注释，以及测试数据中作为字符串的合成名称（如 `osr-synthetic-snapshot`、`data/synthetic-scene`），都不是模块引用。阶段 `tasks.md` 与 `goal.md` 中的失效源码链接已由协调者改指退役记录。
- 链接与锚点：全仓库 12,394 个链接中 33 个失败，与 16 记录的既有失效逐项相同，都与本 goal 无关；本 goal 改动的文档没有失效链接。执行期间改动的每份文档 `updated:` 为 2026-10-10。
- `node tools/task-state.ts p3/04` 无计划问题；P1、P2、P3-02、P3-03 中受 16 影响的任务路由仍为 done。
- 没有残留的 `exec-p3-04-*` 分支或 worktree。

### 披露与残余

- `src/app/app-version.ts` 固定写入版本 0.0.1（导入 `package.json` 会被开发网络审计拒绝），没有与 `package.json` 的漂移检查。
- 以 `getOwnPropertyDescriptor` 陷阱抛错的 Proxy 提交命令时，Runtime 原样抛出该错误，会话把它当作内部错误使运行故障，而不是以 `invalid-argument` 拒绝；类型化调用者不会遇到，spec 没有要求处理恶意对象。
- 根 README 第 13 行“功能可用不代表 P2 已通过退出评审”在 P2 退出评审通过后已过时，不属于本 goal 的契约。
- 全仓库仍有 33 个与本 goal 无关的既有失效链接或锚点（STATUS 的两个锚点、mesh/textures 锚点、skill 模板占位、p2/13 子任务 07）。
- `src/platform/input/browser-keyboard-source.ts` 当前没有导入者，保留给 P3-05。
