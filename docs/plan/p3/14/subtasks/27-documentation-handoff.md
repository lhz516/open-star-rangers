---
type: plan
status: active
phase: P3
task: "14"
subtask: "27"
updated: "2026-10-30"
---

# 27 — 工程说明、检查与 V-06 交接

**契约来源：** [spec](../spec.md#验证策略) 的 S-10、AC-01、AC-13、AC-15、AC-16。
**依赖：** 21, 23。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 汇总 app 的触发/账本/所有权、platform 参数与进度、Core 输出/版本、render 的表现接口增补（DW-02，无共享 HUD 读模型）、UI 状态/日志与浏览器边界说明；原版事实只链接 audio。
- 同步源码结构、输入/本地导入指南和受影响缺省说明，不以音效交付声称其他缺失功能完成。
- 给 P3-15 提供 V-06 逐项结论、参考/候选身份、置信度和残留差异的链接；声明受共享契约变化影响而需重验的历史项，不改写旧通过证据。
- 在集成候选上核对 pnpm check、合规和本任务相关 E2E；缺口形成修复任务，不在文档项新增功能。

## 不包含

- 不作 P3 退出评审、不改 STATUS/tasks/goal tracker，不生成新独立审阅报告，不发布或推送。

## 关键文件与契约

- 现有工程 modules/app、platform、core、render、ui 分册、source-structure、keyboard-input、slice-gaps 与 local-import。
- 21–26 的证据是输入；本项完成证据保存交接目录和工程检查结果。

## 写入范围

- `docs/engineering/modules/app.md`：消费者接口与交接。
- `docs/engineering/modules/platform.md`：播放器能力及错误。
- `docs/engineering/modules/core.md`：只读输出与版本。
- `docs/engineering/modules/render.md`：D2-05 的表现接口扩展与 P3-14 交接（无共享 HUD，D-02 修订）。
- `docs/engineering/modules/ui.md`：状态/DEV 边界。
- `docs/engineering/source-structure.md`：实际模块落点。
- `docs/engineering/keyboard-input.md`：激活与焦点说明。
- `docs/engineering/slice-gaps.md`：受影响说明，不扩张 G-05。
- `docs/guides/local-import.md`：声音状态与操作。
- `docs/engineering/README.md`：22、23、29 提议的探针、监听分组与网络审计说明（协调者 2026-10-29 扩展）。
- `docs/original/formats/audio.md`：仅 12 提议的 A-03 漂移边缘补注（同上）。

## 验收标准

- [x] 接口、版本、错误、释放和缺省说明与实际实现一致，updated 与链接正确。
- [x] V-06 自动/感知结论可追溯，研究置信度和实施验收分开；历史重验范围明确。（感知一栏按 goal 的依赖调整标为“待 26”，由 26 补齐）
- [x] 集成候选的工程/合规/相关浏览器检查通过，无本任务未处理的功能或证据缺口。

## 验证方法

- `pnpm check`、`pnpm check:compliance`；运行 22/23 列出的相关 E2E，使用 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)核对记录适用性。
- 工程说明只记录当前接口，事实仍引用原版记录；检查仓库变更与原版隔离，不修改合同以适应失败结果。

## 完成证据

2026-10-29，worker（分支 `exec-p3-14-27`，基线 `5326958e`）。26 因待开发者的人耳判定而受阻；按 goal 执行记录 2026-10-29 的依赖调整，本项照常完成，V-06 的感知一栏标为“待 26”，不代写判定。原版事实与置信度只在 [audio](../../../../original/formats/audio.md#flight-sound-presentation-p3-14)；本文只汇总结论并链接来源。

### 文档更新

| 文档 | 更新 |
|---|---|
| [app 分册](../../../../engineering/modules/app.md#飞行音效) | 飞行音效一节补齐运行级模块：content.ts 的 `bindFlightSounds`、`craftSounds`、`explosionSound` 与 `FlightSoundPackageError`；voices.ts 的声部账本；parameters.ts 的导出与 `FlightSoundParameterError` 的 5 种失败；hud-cues.ts 的 `createHudCues(ledger)` 与 `beforeDispatch`/`afterDispatch`；events.ts 的 `readTickEventSounds`、`readEventSound`、`dispatchTypeOfKind` 与 `EVENT_SOUNDS`；consumer.ts 的 `attachRunAudio`、预算、错误与开发决定。所有者级连接另记 17 的四项解释、装配位置，边界规则 `osr/flight-audio-imports`（只有 `owner*.ts` 可异步）与测试；新增“交接（P3-14）”。引言加入 `app/flight-audio/` |
| [render 分册](../../../../engineering/modules/render.md) | 表现模块加入 DW-02 的增补（`PresentationTick.explosions`、`PresentationExplosion.forward`/`speed`）；P3-13 交接的“可达性冲突”按 24 的运行时检查改写（不支持 P3-13 的截图推断，A-07 的“不可达”仍为高概率并有运行时支持；32 的记录不改写）；P3-12 交接的 P3-14 一条标为已接入，09 的接口差异指向 D-02 的决定 |
| [core 分册](../../../../engineering/modules/core.md#交接) | P3-14 交接注明已实现、声音不改变 Core；9 型可达性冲突已回答；P3-15 列表加入“来自 P3-14” |
| [platform 分册](../../../../engineering/modules/platform.md#音频播放) | 初值在任何 `connect()` 与 `start()` 之前写入（30）；消费者改为指名 P3-14 |
| [工程约定](../../../../engineering/README.md) | 只读探针加入分声道分接、`capture()`、`initial`/`setAfterConnection`/`end` 与 WeakRef 跟踪，“不保留节点”改为“不强持”（22、30）；监听分组加入 `audio` 组（23）；网络审计的使用要点加入 Chrome 156 首次出声后的 favicon 探测与 `settleAudibleProbe`（29）；本地浏览器 runner 加入 P3-14 飞行音效回归一条 |
| [audio](../../../../original/formats/audio.md#voice-pool-and-classes-a-03) | A-03 漂移边缘补注：从一致的计数出发，分配、抢占、回收、句柄停止与全部停止都到不了该边缘（高概率：代码规则推理 + 模拟，12） |
| [源码结构](../../../../engineering/source-structure.md) | 目录树加入 `app/flight-audio/` 七个模块、`platform/audio/voice-progress.ts`、`ui/dev/audio-log.ts`、`ui/mission/AudioStatus.tsx` 与 `audio-copy.ts`；职责表加入 `app/flight-audio/` 一行；app 分册与 P3 阶段的说明 |
| [键位文档](../../../../engineering/keyboard-input.md#8-项目界面按键) | 声音的可信激活来源（Start、Continue、暂停控件或 `p` 的继续、Enable sound），锁定时从输入区 Tab 一次到按钮（22） |
| [切片缺省清单](../../../../engineering/slice-gaps.md#在制标注非-g-项) | 音效不补齐 G-01、G-03（来电与音乐回调按 D1-09 不播放），基地按键音不改变 G-05 的替代性质 |
| [本地导入指南](../../../../guides/local-import.md#开始任务) | 删去“没有音效”，写明声音状态、Enable sound、暂停与隐藏、开发声音日志与“任务中没有声音”的处理 |

[UI 分册](../../../../engineering/modules/ui.md) 已由 18 写入声音状态、按钮焦点、开发决定与声音日志，核对与实现一致，未改。STATUS 与 tasks.md 不在本项范围，变更建议见 worker 报告。

### V-06 交接目录

判据按 [spec 的对照方法](../spec.md#对照方法与判据)：研究置信度（原版事实，audio）、离散/量化结论（实施验收，[25](./25-private-candidate-comparison.md#逐关系的离散量化结果)）与感知结论（人耳，[26](./26-listening-verdicts.md)）分列。候选与内容身份统一见 [25 的候选、内容身份与录制方法](./25-private-candidate-comparison.md#候选内容身份与录制方法)（基于 `cf702ef3`，内容身份 `classic-p2-slice` 定义 7，转换器 `osr-import.graphics-6.logic-4.audio-2.models-4`）；30 之后只有初值写入次序改变，不需重录。原版参考来自 [24](./24-original-reference-coverage.md#计入的运行全部-complete基准配置fixed-40000-cyclesscen-3019-组-0-槽-1难度-19输入全部为配方刺激) 与 25 的补录；试听项是 25 的私有试听包条目。

| 关系 | 原版参考（适用性） | 研究置信度 | 离散/量化结论 | 感知 | 差异处理 |
|---|---|---|---|---|---|
| 参数到输出（A-09）、声道 → 扬声器 | 24 的 R-06、R-07（偏差：僚机引擎作离中声源） | 已确认（代码；输出格式与声道为运行时） | 一致：增益、声像与 playbackRate 相对误差 ≤ 6e−8；左右 RMS 比等于声像表比；一个开始增益读数为 getter 竞争、可闻增益正确（30） | 待 26（wingman-pan） | D1-12 绝对电平、D1-13 重采样与量化（已批准） |
| 玩家引擎 10679（A-05） | a-03 R-10（11 档） | 已确认（代码与运行时） | 一致：速率与 11 档读数整数相同；速度 0 音量 0；被毁视角继续 | 待 26（engine-steps、destroyed） | — |
| 其他槽 0：11023、10319 | c-04 NCC；k2-01 声部读数 | 已确认（代码与运行时） | 一致：类别 5 上限 2 的竞争；A-04 参数 | 待 26（enemy-engine、enemy2-engine） | — |
| 玩家主炮 10669 | h-01、P2 | 已确认（代码） | 一致：固定声部 | 待 26（player-gun） | — |
| 敌方/基地主炮 10179、10037、10155 | 10179 c-04；10037 g-01、k2-01；10155 无录音 | 已确认（代码；10179 音高为运行时） | 10179、10037 一致：10179 按 11025 × (1 + r/800)；10155 只确认采样同一性与离散触发，整体为证据缺口 | 待 26（enemy-fire、enemy2-fire）；10155 不判 | 10155 为经批准的证据缺口 |
| 导弹 10647 | 玩家：同字节的 10401 与 P2；非玩家：无录音 | 已确认（代码） | 玩家导弹一致（起始值）；非玩家只确认采样同一性与 A-04 参数，整体为证据缺口 | 待 26（player-missile）；非玩家不判 | 非玩家发射为经批准的证据缺口 |
| 槽 3 受击 11071、10035、10665 | a-03；base-01；10665 无录音 | 已确认（代码） | 11071、10035 一致：前一受击未结束时重开、已结束时无声；玩家槽 3 为空；10665 只确认采样同一性与离散规则，整体为证据缺口 | 待 26（kill、base-hit）；10665 不判 | 10665 为经批准的证据缺口 |
| 槽 4 10175、10177 与 EXPL | a-03、h-01（R-16）；能认定的原版爆炸全是 10213 | 已确认（代码与运行时） | 10175、10177、10213 的规则一致：爆炸首放抢占 10177、额外爆炸再抢占、存活期内不抢占地重放；10215/10217 只确认采样同一性，10219 候选与原版都未出现，整体为证据缺口 | 待 26（kill、kill-2、destroyed）；10215/10217/10219 不判 | 10177 到爆炸首放的间隔：原版约 180–280 ms，候选 37–80 ms（原版那一帧推进 20–42 单位，原因未确定），须 26 判定或明确批准；10215/10217/10219 为经批准的证据缺口 |
| 按 ID：11087、11381、10485、10463、10401、10181、10055、10167、10169 | a-03、b-03、e-03、g-01、g3-01 | 已确认（代码与运行时） | 一致：触发与不触发的条件、10181 恰 8 遍、救援 5 次 11381 中 2 次播完 | 待 26（target-select、weapon-select、rescue、page-keys、comm-keys、map-click、warp-start、warp-arrival、xpon、base-keys） | — |
| 锁定音 10455/10457（A-06） | a-03 R-02、R-03a，f-01 R-03b | 已确认（代码与运行时） | 一致：Core 录制逐 tick 重放的期望与浏览器决定完全相同；地图中继续、Warp 开始停止 | 待 26（lock-tone、lock-map、warp-lock-stop） | — |
| 9 型警告 10409（A-07） | 不可达 | 不可达：高概率（代码与数据，24 的运行时支持） | 真实运行中没有 9 型决定；按 D1-11 由合成离散测试验收（14、20） | 不适用 | P3-13 的截图推断不被支持，见 [render 的 P3-13 交接](../../../../engineering/modules/render.md#交接p3-13) |
| 模式与生命周期（A-08） | b-03、g-01 | 已确认（代码；被毁视角为运行时 R-13） | 一致：停靠全停、离港重开引擎、地图与 Warp 中继续、被毁视角到失利处理；暂停保留进度由 22 的合成浏览器证据覆盖 | 待 26（docking、departure、destroyed） | R-11（原版暂停中可闻继续）为可选、未确立；D2-04、D2-10、D2-13 为已批准差异 |
| 停放命中无声 | 真实运行未遇到 | 已确认（代码，A-01） | 由 15/19 的 Node 测试覆盖 | 不适用 | — |
| 声音不可用、失败时无声继续 | 不适用（项目行为） | 不适用 | 由 17 的 Node 测试与 22 的浏览器证据覆盖 | 不适用 | — |
| 声部池的漂移边缘（A-03） | — | 不可达：高概率（代码规则推理 + 模拟，12） | 账本不建模残留类别槽，与原版规则逐步等价（12 的模型比对） | 不适用 | — |

经批准的证据缺口（10155、10665、10215/10217、10219、非玩家导弹发射）依用户 2026-10-28 的授权由协调者按“采样同一性 + 离散结论”验收，记为缺口而不是一致（[25 的参考缺口](./25-private-candidate-comparison.md#参考缺口选项-b由协调者记录接受)）。26 完成后由协调者在 26 的完成证据中补齐感知一栏；不一致项另开修复子任务。

### 历史重验范围

P3-14 改变的共享契约与受影响的历史证据如下。旧的通过结论保持原样，不改写；所列为 P3-15 或后续维护须在当前代码上重验或已由本任务重验的范围。

| 共享变化 | 影响的历史项 | 状态 |
|---|---|---|
| P3-02 FA-05（`shot-fired`/`hit` 的位姿快照）、FA-07（`object-retired`）、FA-08（`RULES_VERSION` 7 → 8；合并后为 11，快照格式 9） | P3-07 至 P3-13 证据中的录制、检查点哈希与 replay-check 报告不能在当前代码上重放（[Core 的快照与 replay](../../../../engineering/modules/core.md#快照录制replay-与比较)）；需要时以当前代码重新录制 | 已在本任务中更新的断言：`browser-replay.spec.ts:47` 的事件集合（29）、P3-11 测试中的事件次序（2026-10-24 合并） |
| P3-02 FA-01（警告移到分区级 `communications.warnings`）与 D1-03（尾随警告的攻击者遍历，撤销 CB-17 决定 11 的差异部分） | P3-13 的 AC-14 类型 9 机体标签与 AC-21；P3-10 的尾随来电与 P3-08 的僚机回复的对照 | 待 P3-14 合入 main 后端到端复验（[render 的 P3-13 交接](../../../../engineering/modules/render.md#交接p3-13)） |
| 24 对 A-07 可达性的运行时检查 | P3-13/32 的 I9、Q-13 中“两项 9 型警告在所选任务中出现过”的推断 | 不改写 32；该推断未得到运行时支持，P3-15 不应把类型 9 警告当作所选任务中可达的项 |
| P3-12 FS-07 的 DW-02 增补（只加输出） | P3-12 的表现与画面判定 | 不受影响：增补不改变选择、相机或绘制（20 的测试）；无需重验 |
| P2-08 控制器扩展（参数、暂停门禁，10、11）与浏览器参数图的写入次序（30） | P2-08/P2-11/P2-12 的查看器试听与样本等价 | 固定发声路径不变；22 重跑 `audio-playback`、`version-4-viewer` 通过；30 重跑 `audio-playback` 时参数无关的用例通过，有头的真实隐藏用例在未改动的基线上同样失败（窗口一开始即为 hidden，环境问题），本项复跑见“检查”；当前包的样本等价由 25 重新确认（29 个 Asset 逐样本相等） |
| P3-04 任务音频接线（`media` 阶段的声音、`sound` 快照、`enableSound`） | P3-04 与后续任务的资源平衡、联合流水线、离页与 HMR 用例 | 已由 23（`audio` 组、每次 Start 一个上下文）与 29（favicon 探测）更新；P3-15 的完整闭环资源平衡须带音频探针（`audio: false` 只在音频不属范围时） |
| 既有失败（不是 P3-14 引入） | `flight-render.development.spec.ts:63` 在 main 上同样失败（Chrome 156 后，缩放 0.7578125 时 12 像素差，原因未确认）；`keyboard-input.development.spec.ts:45` 在高负载下偶发 | 归 P3-12/P3-13 后续或 P3-15（[29 的完成证据](./29-full-e2e-remediation.md#完成证据)） |

### 检查

环境：macOS，Chrome 156（Playwright channel `chrome`），端口 5181/5182；全部只用合成内容。本项只改文档，`src`、`e2e` 与 `tools` 与基线 `5326958e` 相同。

- `pnpm check`：通过（445 个测试文件、11,900 项，含生产构建）。
- `pnpm check:compliance`：`passed: true`，无发现（工作树与索引各 2,061 个文件）。
- 文档链接与锚点：对 11 个改动文档逐个解析相对链接与标题锚点（GitHub 规则，含 `<a id>`），问题 0；改动文档的 `updated` 均为 2026-10-29。公开文档只含 Asset/SND 编号、整数、计数与时长，没有原版字节、文字、波形或反汇编。
- `pnpm test:e2e --project=development --project=production e2e/flight-audio.spec.ts e2e/flight-audio.development.spec.ts e2e/joint-resources.spec.ts e2e/fast-refresh.spec.ts e2e/joint-pipeline.development.spec.ts e2e/audio-playback.spec.ts e2e/mission-flow.development.spec.ts e2e/browser-replay.spec.ts e2e/probe-contract.spec.ts e2e/version-4-viewer.spec.ts`：41 通过、2 失败。两项失败都是自行启动 headed 浏览器的真实隐藏用例：`audio-playback.spec.ts:86`（载入时 `visibility` 已为 `hidden`，解锁超时）与 `mission-flow.development.spec.ts:847`（CDP `Runtime.evaluate` 超时）。
- `pnpm test:e2e --project=development-headed e2e/native-lifecycle.spec.ts`：1 失败（`native-lifecycle.spec.ts:101`，CDP `Runtime.evaluate` 超时）。上面两项单独复跑同样失败。
- **headed 失败的原因（环境，已确认）：** 运行时本机屏幕已锁定（`CGSSessionScreenIsLocked` 为真，无输入约 4.8 小时），headed 窗口一开始即为 hidden、不渲染，与 30 记录的同一用例在未改动基线上的失败相同；本项不改代码，所以不是本项引入。按 browser-testing，未用合成可见性事件代替。**仍未满足：** 30 之后的代码上，原生隐藏（native-lifecycle 与上述两例）尚未在可见桌面上复跑；须在屏幕解锁时以 `pnpm test:e2e --project=development-headed e2e/native-lifecycle.spec.ts` 与 `pnpm test:e2e --project=development e2e/audio-playback.spec.ts e2e/mission-flow.development.spec.ts` 复跑，因此第三项验收暂不勾选。
- **Rubber-duck：** 4 项阻塞、5 项非阻塞，全部采纳：补本节检查结果；历史表中 30 的 `audio-playback` 结果如实写为 headed 用例的环境失败；源码结构不再写“P3-14 已交付”，改为“实现已交付，感知待 26”；V-06 表中含证据缺口的行不再整体写“一致”；`START_PARAMETERS` 只含音量与声像；“Sound: on.” 只表示已启用、可播放；隐藏后会重启持续声音与仍在进行的爆炸；app 与 render 分册不再复述原版地址与运行时读数，改为链接 audio 与 24；“停放命中”与“声音不可用”分行，后者研究置信度为不适用。
- 本项启动的浏览器与 Playwright 服务器均随 runner 结束，无残留进程。

### 有头真实隐藏用例复验（2026-10-30，协调者）

屏幕未锁定，在 main `9abf6cfb`（P3-14 代码自 30 之后未变，另含 P3-15 的验证代码与文档）上 `pnpm build` 后运行：`npx playwright test --project=development-headed e2e/native-lifecycle.spec.ts` 1 通过（Chrome 156.0.8078.74；hidden → visible 三轮，departure 停在 tick 0，暂停于 tick 12，恢复后不追赶）；`npx playwright test --project=development e2e/audio-playback.spec.ts e2e/mission-flow.development.spec.ts` 12 通过，含 `audio-playback.spec.ts:86` 的真实隐藏停声与恢复不重放，以及 `mission-flow.development.spec.ts:847` 的 Warp 中真实隐藏。2026-10-29 记录的三项窗口初始隐藏失败均已消失，第 3 项验收满足。V-06 的感知一栏仍待 26。
