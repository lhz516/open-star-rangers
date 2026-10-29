---
type: plan
status: active
phase: P3
task: "14"
subtask: "23"
updated: 2026-10-28
---

# 23 — 原生隐藏、重开与音频资源平衡

**契约来源：** [spec](../spec.md#模式与生命周期) 的 S-08、S-10、AC-10、AC-12。
**依赖：** 22。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 复用 22 的探针，在 native-lifecycle 中以真实标签页隐藏/page 生命周期验证：暂停中隐藏也丢弃声音，可见后仍需显式恢复。
- 三次任务往返/重开检查 owner/run 隔离、上下文关闭、声音/参数节点、监听和待处理意图回到基线。
- 覆盖结果页、容量停止、错误、退出，以及 StrictMode/Fast Refresh；不让旧回调重放新 run 音效。
- Viewer 的既有声音/关闭行为纳入相关回归，资源失败如实记录，不把逻辑失效当作物理关闭已完成。

## 不包含

- 不用合成 visibility 事件代替真实隐藏，不新建浏览器 runner 或全站缓存清理。

## 关键文件与契约

- 现有 [native-lifecycle.spec.ts](../../../../../e2e/native-lifecycle.spec.ts)、[joint-resources.spec.ts](../../../../../e2e/joint-resources.spec.ts)、[fast-refresh.spec.ts](../../../../../e2e/fast-refresh.spec.ts)。
- 现有 resource-balance/browser-probes 和 22 新增输出探针；不改变 production 应用逻辑。

## 写入范围

- `e2e/native-lifecycle.spec.ts`：headed 原生隐藏。
- `e2e/joint-resources.spec.ts`：往返/重开资源平衡。
- `e2e/fast-refresh.spec.ts`：HMR 隔离。
- `e2e/support/resource-balance.ts`：音频资源计数。
- `e2e/support/browser-probes.ts`：清理/节点探针。
- `e2e/support/flight-audio.ts`：22 新建支持的生命周期读取。
- `e2e/joint-pipeline.development.spec.ts`：飞行音效接入后上下文计数的回归（协调者 2026-10-28 扩展）。
- `src/app/flight-audio/owner.ts`、`src/app/flight-audio/owner.test.ts`、`src/platform/audio/**`：仅当上述两条回归查明为真实的资源或监听泄漏时的修复与测试（同上）。

## 验收标准

- [x] 原生隐藏确实停止所有发声，visible/pageshow 不自动恢复游戏或过期声音。
- [x] 往返、重开、结果/退出与 HMR 后资源平衡，创建与真实关闭一一对应。
- [x] 悬置上下文和 analyser 旧值按 spec 判定，失败未被静默忽略。

## 验证方法

- 使用 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)；`pnpm test:e2e --project=development-headed e2e/native-lifecycle.spec.ts`。
- `pnpm test:e2e --project=development --project=production e2e/joint-resources.spec.ts e2e/fast-refresh.spec.ts e2e/audio-playback.spec.ts`（既有配置自动排除不适用项目）；`pnpm check`。
- 对测试改动调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)，不以 UI 外观替代资源证据。

## 完成证据

- **2026-10-28 两条转交回归的结论（均为预期的新资源，不是泄漏）：**
  - `fast-refresh.spec.ts`（键盘组 12 ≠ 9）：探针按登记次序给 document `visibilitychange`、window `pagehide`/`pageshow` 分组，第一个为 `session`，其后一律记为 `keyboard`。18 接入后，所有者的飞行声音控制器在关闭屏障的续延中也登记这三类（S-08 的所有者级控制器），于是被误记为键盘。开发页面里按调用栈核实，次序固定为会话宿主 → `input` 阶段的键盘源 → `media` 阶段的音频控制器；StrictMode 的首个所有者在屏障通过前已释放，不建控制器。修正在 [browser-probes.ts](../../../../../e2e/support/browser-probes.ts)：新增 `audio` 组，按序取三组中第一个尚无活动回调的组。各组计数和回到基线的检查都保持严格。同一原因也使 `probe-contract.spec.ts:160` 在两个构建中失败，本修正后通过，未改该文件。
  - `joint-pipeline.development.spec.ts`（任务后上下文 2 ≠ 1）：可信的 Start 点击按 S-08 解锁所有者唯一的上下文，属于预期行为。`runMission` 改为断言恰好新增一个上下文，且返回后为 `closed`、`close()` 已兑现。
  - 两条都无需修改 `src/app/flight-audio/owner.ts` 或 `src/platform/audio/**`。
- **原生隐藏（[native-lifecycle.spec.ts](../../../../../e2e/native-lifecycle.spec.ts)，development-headed，Chrome 156，CDP 双标签页 `Target.activateTarget`）：** CDP 页面注入音频探针，读数用共享的 `audioReading`（[flight-audio.ts](../../../../../e2e/support/flight-audio.ts)）：上下文状态与关闭结果、时钟、已启动源、仍连接的源、仍连到 destination 的节点（`routed`）。
  - 介绍页：音频组 3 条监听，无上下文。
  - 出发时隐藏：上下文 `suspended`，无源，400 ms 内时钟不变。
  - 飞行中隐藏：`live` 由 `[0,1,2]` 变为 `[]`，`routed` 为 0，上下文 `suspended`，时钟停在 0.4876；可见后游戏仍暂停（`pause=hidden`、`sound=paused`），读数与隐藏时完全相同。显式 Resume 后只有新源 `[3,4]`。
  - 用户暂停：上下文 `suspended`，保留声音 `[3,4]`，`routed` 大于 0。暂停中隐藏后 `live` 为 `[]`、`routed` 为 0、时钟不变；可见后仍暂停，读数不变。Resume 后只有新源 `[5,6]`。
  - 退出：上下文 `closed:resolved`，`owned`（含 `audio` 组）为空，错误为空。
- **往返、重开与结果页（[joint-resources.spec.ts](../../../../../e2e/joint-resources.spec.ts)，development 与 production）：** 余额要求音频探针。
  - 每个所有者位置都有 3 条音频监听。每次访问在 Start 时恰好新建一个上下文，且有发声、有 `routed`。
  - 重开：保留同一上下文，未关闭；第 1 轮的声音与节点全部断开；第 2 轮只有重开后启动的源。返回后全部 `closed:resolved`，三轮菜单余额均平衡。
  - 新测试：播种 `success` 结局变体（[mission-result.ts](../../../../../e2e/support/mission-result.ts)），经恢复后飞行至有声。G-02/8 时 `live` 为 `[]`、`routed` 为 0；结果页上没有新启动的源，tick 稳定。Return 后上下文 `closed:resolved`，余额平衡。
- **HMR 与 StrictMode（[fast-refresh.spec.ts](../../../../../e2e/fast-refresh.spec.ts)，development）：**
  - 编辑 `use-mission-owner.ts` 与 `MissionScreen.tsx` 时都在飞行中：旧所有者的上下文先 `closed:resolved`，源和节点断开；新所有者的控制器监听登记在旧的之后，Start 之前不建上下文；新 Start 恰好新增一个上下文。
  - 应用外壳的 Fast Refresh 也关闭运行中的上下文。两处余额都改为要求音频，不再是 `audio: false`。
- **仅由 Node 覆盖：** 录制容量 `stopped`、`faulted`、关闭失败与同步抛错，见 [owner.test.ts](../../../../../src/app/flight-audio/owner.test.ts) 的“the run's sound”与“the close barrier”两组。测试入口没有到达这些路径的选项，本子任务也不改生产逻辑。
- **analyser 旧值：** 所有静音判定都只用上下文状态、时钟、`live` 与 `routed`，不读 analyser。
- **检查：**
  - `pnpm test:e2e`（完整套件）：286 通过、9 跳过、3 失败。失败的是 `browser-replay.spec.ts:47`（Core 事件集多了子任务 08 引入的 `object-retired`）、`flight-render.development.spec.ts:63`（像素）和 `mission-flow.development.spec.ts:353`（`/favicon.ico` 网络审计）。三者在基线提交 78b9e4c4（暂存本改动后）上同样失败，与本改动无关，已转报协调者。
  - 评审与精简修改后，development、production、development-headed 三个项目下的 `fast-refresh`、`joint-resources`、`joint-pipeline.development`、`probe-contract`、`audio-playback`、`flight-audio`、`flight-audio.development`、`native-lifecycle` 共 32 项全部通过。
  - `pnpm check` 通过（Vitest 445 个文件、11900 项）。
- **rubber-duck：**
  - 采纳：读数加入 `routed` 以检查参数节点；重开前后断言精确的上下文状态；出发时隐藏断言无启动、`suspended`、时钟不变。
  - 未采纳：用来源而非次序分组。已用调用栈核实次序；生产包没有可靠的来源；注释已写明“没有任务所有者时只按登记次序编号”的限制。
- **simplify：** 三处音频读数合并为 [flight-audio.ts](../../../../../e2e/support/flight-audio.ts) 的 `audioReading`/`closedContexts`。未做：让 `ResourceBalance` 自动安装音频探针（会改变众多用例的语义）；把 `restore` 抽到 `cockpit-lifecycle.ts`（超出写入范围）。
- **文档影响：** [engineering/README.md](../../../../engineering/README.md) 的“监听分组”一条需补 `audio` 组（第三个生命周期登记者为任务所有者的飞行声音控制器）。该文件不在本子任务写入范围，已作为提议转交协调者（27）。其余文档无需更新。
