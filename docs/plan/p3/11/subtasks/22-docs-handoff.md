---
type: plan
status: active
phase: P3
task: "11"
subtask: "22"
updated: 2026-10-24
---

# 22 — 文档与交接

**契约来源：** [spec](../spec.md) 的 S-12、AC-16；[与其他任务的接口](../spec.md#与其他任务的接口)、[缺省与标注](../spec.md#缺省与标注)。
**依赖：** 17, 18, 21。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- [Core 模块说明](../../../../engineering/modules/core.md)：任务流程、段 2、全清、损失、救援、失败、退场与完成的 API、阶段与状态所有权、事件、上限与版本；已知差异（G-02 零媒体时间对救援的适用、项目结果摘要）；对 P3-12（被毁视角进出时机）、P3-13（消息事件与 Q-09 常量、视角标签）、P3-14（结局与救援的事件）、P3-15（闭环复验与逐分支覆盖矩阵）的交接。
- [app](../../../../engineering/modules/app.md) 与 [ui](../../../../engineering/modules/ui.md) 分册：完成截断、结果阶段、终局占位、结果页、重试与返回。
- [slice-gaps](../../../../engineering/slice-gaps.md)：G-02/5 至 G-02/10 与 G-06（含 P3 不判定勋章、项目摘要）的呈现与位置。
- [tools](../../../../guides/tools.md)：`replay-check.ts` 对完成结束录制的说明（如有变化）；[键盘输入指南](../../../../engineering/keyboard-input.md) 中被毁序列与结果页的输入说明（如有变化）。
- 上游共享契约修订影响 P3-02、P3-04、P3-07 至 P3-10 的既有 goal/subtask 时，只记录需重验的范围，不改写历史结论。

## 不包含

- 原版事实（04、21）；STATUS 与阶段索引（协调者）。

## 关键文件与契约

- 上述文档；本任务各实现子任务的完成证据。

## 写入范围

- `docs/engineering/modules/core.md`：Core API、已知差异与交接。
- `docs/engineering/modules/app.md`：会话与所有者。
- `docs/engineering/modules/ui.md`：结果页与占位。
- `docs/engineering/slice-gaps.md`：G 项记录。
- `docs/engineering/keyboard-input.md`：输入说明的更新（如有）。
- `docs/guides/tools.md`：工具用法的更新（如有）。
- `docs/engineering/README.md`、`docs/engineering/source-structure.md`：E2E 合成数据与观察辅助（18 的交接）。
- `src/core/world/player-state.ts`、`src/core/rules/radio.ts`：仅过时注释（`heavyDamage` 只供 P4 勋章，ME-18；radio 的“P3-11 adds it”）。

## 验收标准

- [x] 文档与实际代码、契约一致；G 项与界面一致；交接对象与责任明确。（AC-16、S-12）
- [x] 文档 `updated:` 已更新，链接与锚点有效。
- [x] 需重验的历史范围已记录，没有改写历史结论。

## 验证方法

- 文档链接与元数据检查；对照代码中的 G ID 常量与注释。

## 完成证据

**2026-10-24（worker，基于认领提交 885e3017）**

- **核对方式：** 以 goal 执行记录中给 22 的交接（08–18、20、21）为清单，每条都对照实际代码（`src/core/systems/` 的 mission-flow、mission-events、player-loss、rescue、wingman-loss、mission-teardown 与 pipeline，`rules/` 的 all-clear、mission-summary、rescue，world-state、world、setup-check、domain-events、limits、projection、snapshot、recording、replay、compare；app 的 game-runtime、game-session、mission-flow、mission-owner、mission-texts、mission-input；ui 的 bridge、页面、page-keys、input-consumer、event-log；tools/replay-check.ts 与 e2e 支持）与 P3-02 的 ME-01–ME-19、P3-04 的终局与救援衔接，不照抄交接文字。与交接不同之处：P3-04/14 的录制是当时规则版本 1（不是 7）；F1 的 `cockpit-front` 在被毁序列中仍为 `not-implemented`，地图开关在视角 0x11 中为 `player-unavailable`。
- **[core.md](../../../../engineering/modules/core.md)：** 正式 Core 的 P3-11 概述；世界创建第 3 步的总结选择值拒绝（含 ME-02 位置偏差）与创建结果的流程初值；完成后 `step` 的非锁存拒绝；`mission-ended` 原因、11 种事件、`transition`/`radio-flushed` 的新取值与 tick 内次序；`MissionStatus`、`missionEvents`、`flow` 的字段；阶段表 `mission-flow`（`runMissionFlow`）、`object-update`、`request-handling`、`energy`、`parked-update` 与 `mission-teardown` 各行；新节“任务事件、结果、救援与退场（P3-11）”；projection 的 `mission.phase` 与就绪的 `result`；快照格式 7、`RULES_VERSION` 8（replay 格式 3 不变）、录制的完成、`after-completion` 与比较器的阶段与 P3-11 次序；上限（9,593，约 3.4 倍）；扩展规则；已知差异（救援的 G-02 零媒体时间与 C3 区分、ME-17 决定 2–4、6–9、11、项目结果摘要、不判定勋章、P3-11 的对照结论与仍 blocked 的机会项）；更正过时的 0x32d74、0x33464、0x32dec、0x339cc、退场“空”、`heavyDamage`、感谢计数、地图标记与 MW-11 可达性；交接中的 P3-11（已交付）条目、P3-04 的运行中衔接、对 P3-12、P3-13、P3-14、P3-15 的交接，以及“上游契约修订与重验范围（P3-11 的 D-01）”（沿用 P3-10 的先例，只记录 P3-02、P3-04、P3-07–P3-10 需重验的范围，不改写其历史结论）；针对性检查。
- **[app.md](../../../../engineering/modules/app.md)、[ui.md](../../../../engineering/modules/ui.md)：** 完成截断、`completed` 错误、会话 `completed` 阶段与终局序列、`result`、取消原因、流程位置 `ending`/`result`、`endingPlaceholder`、离页保护、`flightMessagesInput` 与 `missionTexts`；桥接的 `mission.phase` 与结果字段、完成后保持附着、终局占位、结果页（测试 ID）、`SLICE_GAPS`/`MISSION_OBJECTIVES`/`PLACEHOLDER_PAGES`/`RESULT_PAGE`、`placeholderTakesFocus` 的 `placement`、输入消费者对完成截断的处理、事件日志的 P3-11 字段。
- **[slice-gaps.md](../../../../engineering/slice-gaps.md)：** G-02/5–G-02/10 各行、G-04 的复核、G-06（结果页、重开与返回）、各页面的 G 项，以及救援与终局的不计时说明。G ID 与 `slice-gaps-copy.ts`、各页面的 `GapNote`/`GapNotes` 一致。
- **其他：** [tools.md](../../../../guides/tools.md) 的 replay-check 报告版本 2（`completed`）、上限推导中的 P3-11 事件样本（`recordingSizeBound()` 仍为 534,251,135）与 20 加入的 `at`/`jump`；[keyboard-input.md](../../../../engineering/keyboard-input.md) 的被毁序列、锁存后命令、终局与结果页按键；[README.md](../../../../engineering/README.md) 的 `seedRecords`/`storeSeed`、P3-11 的 E2E 回归与任务画面（`MissionScreenParts.texts`、结果页、焦点、测试 ID）；[source-structure.md](../../../../engineering/source-structure.md) 的目录树（P3-11 新文件）、模块分册表、会话职责与 `e2e/support/` 说明。代码只改注释：`player-state.ts` 的 `heavyDamage`（只供 P4 勋章，ME-18）与 `shots`，`rules/radio.ts:27`。
- **检查：** 改动的 9 份文档相对链接与锚点检查 0 处失效（私有脚本按 GitHub 规则计算标题锚点，先以人造坏链接验证能报错）；全部改动文档的 `updated:` 为 2026-10-24。`pnpm check` 通过（354 个测试文件、10,302 项，构建成功）；`pnpm check:original` 通过（exit 0）。
- **rubber-duck：** 两项发现均已修正：core.md 世界创建一节仍写“Core 不解释或调度事件触发”（改为 P3-11 起的检查、计数与总结选择）；重验范围中 P3-04/14 的录制误写为规则版本 7（应为 1）。其余核对无问题。只有文档与注释改动，不需要 simplify。
- **文档影响与范围外的发现：** STATUS 与阶段索引不在本项范围。仍留在写入范围外的过时注释（不影响行为）：`src/core/projections/projection.ts:307` 与 `map.ts:32` 的“unreachable before P3-11”（现已可达）、`systems/radio.ts:130`、`systems/spawn.ts:82` 的将来时措辞；P3-04 spec 数据模型表的 `version: 1` 已由其终局与救援衔接一节取代，未改历史正文。
