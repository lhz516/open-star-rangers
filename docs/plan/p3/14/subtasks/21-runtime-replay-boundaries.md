---
type: plan
status: active
phase: P3
task: "14"
subtask: "21"
updated: 2026-10-28
---

# 21 — Runtime 录制一致性与模块边界

**契约来源：** [spec](../spec.md#验证策略) 的 S-04、S-10、AC-03、AC-08、AC-13。
**依赖：** 19, 20。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 使用同版本/内容/种子/输入和可控 SessionHost，分别运行声音启用、禁用、锁定/失败、不同结束通知顺序。
- 比较真实 Runtime 执行的输入、事件和检查点，再使用正式 replay 校验，不单独调用无消费者的 replay 充数。
- 覆盖多 tick、暂停/恢复、非连续放置和消费者失败边界；局部声音序列相等只在表现 RNG 与宿主序列固定时要求。
- 将新 DOM-free 模块、无 Core 回写/新循环、render 不反向导入 app、platform 不导入游戏/解析器纳入已有工程边界回归。

## 不包含

- 不加入新玩法或修改随机数规则；暴露的实现缺口回责任项/新增修复项。

## 关键文件与契约

- 现有 [Session 测试](../../../../../src/app/session/game-session-replay.test.ts)、[replay](../../../../../src/core/replay/replay.ts)、[工程边界](../../../../../tools/engineering-boundaries.test.ts)。
- 计划新增 `runtime-integration.test.ts`、`replay.test.ts` 于 flight-audio。

## 写入范围

- `src/app/flight-audio/runtime-integration.test.ts`：正式通知与输入链。
- `src/app/flight-audio/replay.test.ts`：多音频状态一致性。
- `tools/engineering-boundaries.test.ts`：新模块正反边界测试。
- `eslint.config.js`：如现有规则未覆盖，按相同模式增加限定边界。
- `docs/engineering/README.md`：仅在“lint 规则”列表中加入 flight-audio 边界规则的一条（协调者 2026-10-28 扩展）。

## 验收标准

- [x] 多个音频可用性场景的正式输入/事件/哈希一致，变化回调顺序不影响 Core。
- [x] 新模块被真实 Node 程序覆盖，违反依赖/宿主/调度规则的负例命中对应诊断。
- [x] 版本变更和旧记录处理符合 06；未要求生产音效 replay 逐次一致。

## 验证方法

- `pnpm test -- src/app/flight-audio/runtime-integration.test.ts src/app/flight-audio/replay.test.ts tools/engineering-boundaries.test.ts`、`pnpm check`。
- [simplify](../../../../../.agents/skills/simplify/SKILL.md)仅本项测试/边界代码；不需原版文件或浏览器代理结果。

## 完成证据

- **Runtime/replay 一致性（AC-13）：** [replay.test.ts](../../../../../src/app/flight-audio/replay.test.ts) 以可控 SessionHost 驱动正式 Session/Runtime/Core，接 P3-12 真实表现模块与 16 的消费者（真实控制器 + 平台假能力），在三个合成世界上逐一运行：战斗世界（炮、导弹、选目标、爆炸）、P3-09 地图与 Warp 链（Warp 到达的非连续放置）、P3-11 全清除成功（运行在 tick 647 完成，所有者式 `invalidate`）。每个世界都含 1/2/3/5 tick、0 tick 与被截断的帧，用户暂停与隐藏暂停（控制器门禁与页面生命周期同步跟随），被取消的命令，按住开火与失焦清除输入。场景：只有 Core、声音关闭、启用（两种帧消费者次序）、锁定、不可用、中途发声失败、浏览器中断后恢复、宿主按创建次序/逆序报告发声结束（帧间或帧内、在消费者读取之前）、另一表现随机种子、中途关闭声音。所有场景的导出录制（含中途导出）、检查点与哈希、onAny 事件、取消通知、帧报告与帧请求数都与只有 Core 的运行完全相同；每个场景自己的录制与中途录制都经 JSON 往返后用正式 `replayRecord` 与 `compareReplayResults` 核对一致。非空洞性：锁定/不可用只有 `audio-locked`/`audio-unavailable` 失败，失败、中断场景分别出现 `audio-failed`、`audio-suspended`，关闭后没有决定且无发声；结束报告至少一批多于一个发声，次序升序/逆序且两次运行第一批互为逆序，三种结束场景的声音决定都不同于未结束的运行。
- **通知与输入链：** [runtime-integration.test.ts](../../../../../src/app/flight-audio/runtime-integration.test.ts)：消费者经代理只读取运行的 `runId`、`onFrame`、`ownCleanup`、`renderFrame` 与表现端口的 `ownerId`、`runId`、`camera`、`subscribe`（从不提交命令或意图、读取 projection/快照或推进表现）；假计时器下没有任何计时器、微任务、rAF 或空闲回调，帧请求数与无声音运行相同；玩家提交命令得到的 ID、执行的输入、事件、取消与录制都相同。每个决定都在执行其 tick 的那次帧投递中做出、tick 升序，没有 tick 的帧（静止帧、恢复锚定、0 tick 帧）与帧间（暂停、隐藏、控制）都没有决定。宿主回调在 Session 自己的事件投递、取消通知与状态变化中结束发声、页面生命周期先于 Session 隐藏、中断后恢复时，声音决定改变而执行链不变。在 tick 30 所在帧把同一帧交给消费者两次（违反配对合同）：运行以 `consumer` 阶段的 `FlightSoundConsumerError('pairing')` 故障，声音全部停止且之后无决定；Core 执行的事件与 tick 恰为无声音运行到该帧末尾的前缀，该帧之前与该帧之中（故障之前）导出的录制都是无声音录制的前缀并经正式 replay 核对。
- **版本（06）：** 录制的 `format`、`version`（3）与 `rulesVersion` 等于当前常量，键集合不含任何声音状态，各 tick 的输入形状与无声音运行相同；`rulesVersion` 或 `version` 减一的记录被 `replayRecord` 以 `CoreInputError`（`record.rulesVersion`/`record.version`）拒绝。git 历史核对：P3-14 只在 08（3cd624f8）把 `RULES_VERSION` 7 → 8，之后 P3-14 的提交没有改动 rules-version、recording 或 snapshot（9–11 与快照格式来自 P3-11/12/13 的合并）。固定表现种子与宿主回调时同一运行重复两次的声音决定与表现 tick 相同；换表现种子则 EXPL 选择与声音决定改变而 Core 相同——生产 replay 不要求声音逐次一致。
- **模块边界：** [eslint.config.js](../../../../../eslint.config.js) 新增本地规则 `osr/flight-audio-imports`（`src/app/flight-audio/` 非测试文件只能以相对路径引用 core、content、app、platform/audio 与飞行表现模块，且不得引用任何 `browser-*` 或 `.tsx`；包与计算式导入拒绝）与宿主限制（DOM/网络/音频宿主全局、时间、随机、调度、`async`/`await`；只有顶层 `owner*.ts` 允许 async，供 17 等待上一控制器关闭）。[engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts)：两层目录深度的 lint 正反例（各种导入形式、宿主操作、owner 例外只限顶层，测试/测试支持/其他 app 模块不受限）；沿真实应用程序依赖图核对模块传递可达的没有 ui、original-data、浏览器适配、`.tsx`、包与飞行表现以外的 render 代码，模块自身不出现 `submitCommand`、`setIntent`、`clearIntent`、`requestFrame`、`cancelFrame`、`createGameRuntime`、`createGameSession`、`advance` 及 DOM/调度名称；render、platform、Core、content 不可达 flight-audio；每个 flight-audio 生产模块都在真实 Node 程序中；以上各有夹具反例。平台音频（不导入 app/render/ui/workers/original-data）与表现模块（只到 Core、content 与自身）的既有边界未变，覆盖 DW-02 的增补。
- **命令：** `pnpm exec vitest run src/app/flight-audio/replay.test.ts src/app/flight-audio/runtime-integration.test.ts tools/engineering-boundaries.test.ts` 通过（3 个文件、122 项）；`pnpm check` 通过（typecheck、ESLint、442 个测试文件 11,865 项、build）。此前一次 `pnpm check` 中既有的 `cockpit boundaries` 依赖图测试在满负载下超过默认 5 s（单独运行约 2 s），重跑通过，未改动。变异核对：消费者在某 tick 提交命令使 replay.test 两个世界失败；读取 `run.projection()` 或调用 `setTimeout` 使 runtime-integration 失败。
- **Rubber-duck：** 采纳：(1) flight-audio 默认禁止 `async`/`await`，只对 `owner*.ts` 放开（已告知协调者转 17）；(3) 结束次序改为同时机的正序/逆序对照并记录每批结束的发声；(4) 故障测试增加故障帧内（故障前）的录制核对。未采纳 (2) 沿中间模块扫描禁用名称、禁止传递到达 workers/其他 platform：flight-audio 必然经 Session/Runtime 到达拥有命令与帧请求的代码，经资源持有者到达 Worker 生产包画像与缓存契约（P2-11 S-05），直接导入已由 lint 限定，运行期行为由两份运行测试核对。
- **Simplify：** 反向可达改用已有的 `sourceDependencies` 并去掉逐边数组复制；两个代理合并为一个 `watched`；去掉自比较的 enabled 场景、未用的返回字段与 `audio`。未采纳：把两份测试驱动/声音装置移入 test-support（不在写入范围）、合并三个导入规则为工厂（改动既有规则）、跨测试缓存运行结果（总耗时约 8 s）。
- **文档影响：** [工程约定](../../../../engineering/README.md)的 lint 规则列表增加飞行音效模块一条（协调者扩展的范围）。app 分册的 flight-audio 说明归 17/27；原版事实未变，unknowns 不变；STATUS 与阶段 tasks.md 无需改动。

