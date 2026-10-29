---
type: plan
status: active
phase: P3
task: "14"
subtask: "18"
updated: 2026-10-28
---

# 18 — 声音状态、可信激活与开发日志接线

**契约来源：** [spec](../spec.md#声音状态与开发诊断) 的 S-08、S-09、AC-10、AC-11、AC-12。
**依赖：** 17。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 把 17 接到正式 mission 装配，使用现有音频能力；两个消费者列表都把音效消费者放在飞行消费者之后，并传入 `presentation: () => flight?.consumer.presentation() ?? null`（D-02 的 DW-01、DW-13）；开始/Continue/启用声音的可信点击同步请求解锁，p 仍经既有所有者控制。
- 英文项目状态文字区分等待关闭、锁定、可用、游戏暂停、宿主挂起与失败；启用声音不继续游戏或关闭菜单。
- 状态按钮在输入区外可 Tab 到达，成功且满足 P3-05 条件才回到输入区；失败、隐藏或用户已移焦不抢焦点。
- DEV 下保留最近 500 条声音决定，字段按 spec，截断可见；生产编译隔离日志/诊断接线，无 PCM/坐标转储和新导出功能。

## 不包含

- 不新增声音设置、模态框或 Classic DOM HUD；不修改飞行按键含义。

## 关键文件与契约

- 现有 use-mission-owner、MissionScreen、MissionPage、StartConfigPage、MissionMenuPage、MissionShell、use-input-focus 与 mission-diagnostics。
- 计划新增 `ui/mission/AudioStatus.tsx`、`audio-copy.ts`/测试及 `ui/dev/audio-log.ts`/测试；不新增 TSX 单元 runner。

## 写入范围

- `src/app/composition/use-mission-owner.ts`：正式消费者/状态接线。
- `src/app/MissionScreen.tsx`：声音视图传递。
- `src/app/ports.ts`：现有能力声明的必要语义同步。
- `src/app/browser-ports.ts`：仅必要的已存在能力装配。
- `src/ui/mission/**`：声音状态、激活、焦点与相关纯文案测试。
- `src/ui/dev/**`：声音日志及 DEV 面板/测试。
- `src/app/app.css`：必要的状态与可见焦点样式。
- `docs/engineering/modules/ui.md`：状态与 DEV 边界说明。
- `docs/engineering/keyboard-input.md`：声音控件与现有焦点/控制交接。
- `e2e/base-interaction.development.spec.ts`、`e2e/flight-render.development.spec.ts`、`e2e/cockpit-lifecycle.spec.ts`：仅把 `FLIGHT_IN_PROGRESS` 的断言改为状态栏的声音状态（协调者 2026-10-28 扩展）。
- `docs/engineering/slice-gaps.md`：在制标注移除的记录（同上）。
- `docs/engineering/README.md`：测试 ID 列表与开发诊断中的声音日志（同上）。
- `docs/engineering/modules/render.md`：仅外部前提中 `FLIGHT_IN_PROGRESS` 移除的一行状态（同上）。

## 验收标准

- [x] 状态忠实反映能力和播放门禁；同步可信激活不延后，按钮不旁路暂停。
- [x] p/菜单/输入区的既有语义与焦点保持；文案和日志纯模块测试覆盖边界。
- [x] DEV 500 项截断与运行身份正确；生产没有日志或原版敏感输出。

## 验证方法

- 相关纯 `.test.ts` 与 `pnpm check`；按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)做合成状态控件验证，持久完整 E2E 归 22。
- 对本项接线与组件调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)，不扩充设置界面。

## 完成证据

- **接线（2026-10-28）：** [use-mission-owner.ts](../../../../../src/app/composition/use-mission-owner.ts) 在两个消费者列表中都把 `createFlightAudioConsumer({ holder, audio: audio.capability, lifecycle: audio.lifecycle, presentation: () => flight?.consumer.presentation() ?? null, reportError, record })` 放在飞行消费者之后（DW-01、DW-13）；开发装配的 `record` 是诊断的 `recordSound`，生产不传。开始、Continue、继续与 `p` 的激活沿用 17 在所有者中的钩子，未改动；`ports.ts` 只同步 `audio` 的说明，`MissionScreen.tsx` 与 `browser-ports.ts` 无需改动（声音状态经所有者快照 `sound` 到达页面）。
- **状态与按钮：** [audio-copy.ts](../../../../../src/ui/mission/audio-copy.ts) 为七种 `MissionSoundStatus` 各给一句英文（只有 `available` 为 “Sound: on.”；不可用与失败说明任务无声继续），`enableSoundOffered` 只在所有者接受 `enableSound` 的阶段（保持、running、paused、stopped）且声音待启用时提供按钮，浏览器挂起只在未暂停时提供；[AudioStatus.tsx](../../../../../src/ui/mission/AudioStatus.tsx) 以 `role="status"` 的 `mission-sound`（`data-sound`）与按钮 `mission-enable-sound` 显示，在点击处理内同步调用 `owner.enableSound()`（不控制会话、不关闭菜单）。外壳状态栏取代已移除的 `FLIGHT_IN_PROGRESS`，任务菜单显示状态与按钮，开始页只显示状态。
- **焦点：** `enableSoundFocus` 在所有者通知中（早于 React 卸载按钮）决定：用户已移走焦点或页面隐藏时不动；按钮仍在（策略拒绝或待定）时留在按钮上；变为可用且满足 P3-05 条件（飞行、running、可见、窗口有焦点，与 `shellFocusTarget` 共用新的 `zoneFocusable`）时到输入区；否则到本页第一个可用的动作按钮（没有时为标题），不让焦点落到文档。
- **DEV 日志：** [audio-log.ts](../../../../../src/ui/dev/audio-log.ts) 的 `SoundLog` 以 P3-04 的 500 项窗口（与事件日志共用新提取的 `RingLog`）保留 `FlightSoundDecision` 加序号；`describeSoundDecision` 写出 ownerId、runId、tick、时钟、触发序号、Asset、来源键、类别、结果与原因码、初始参数与被切断的声部，无 PCM、名称或坐标。[mission-diagnostics.ts](../../../../../src/ui/dev/mission-diagnostics.ts) 的 `recordSound` 只收本所有者、日志所属运行（运行结束后仍为它，直到下一运行开始）的决定，新运行清空，`clearSoundLog` 独立；面板加 Sound log 区块。
- **测试：** `audio-copy.test.ts`（文案、按钮的状态×阶段全表、焦点的五种结果）、`audio-log.test.ts`（500/502 截断与序号、冻结视图、各字段描述）、`mission-diagnostics.test.ts` 新用例（所有者与运行身份、运行结束后的 stop-all 仍入日志、下一运行清空、独立清空、释放后忽略）；`mission-copy.test.ts` 更新 `MISSION_SKELETON`。`pnpm exec vitest run src/ui` 31 文件 496 项通过。
- **浏览器冒烟（macOS 本机 Chrome，开发服务器 127.0.0.1:5154，合成 `mission-startable`，临时用例已删除）：** Playwright 页面中 Start 的可信点击后外壳为 `available`、无按钮、焦点在输入区；Pause 后 `paused`，菜单 `paused`，Continue 后 `available`（5 次中 1 次首读为 `paused`，未能复现，见下）；`audio=unavailable` 为 “unavailable … continues without sound”；开发面板列出决定（如 `started · volume=127 rate=19000`、`silent (empty-slot)`、`failed (audio-unavailable)`）。另以独立 Chrome（`--autoplay-policy=document-user-activation-required`，原始 CDP 目标，导入与开始全用无激活的脚本点击，`hasBeenActive` 为 false）：运行中为 `needs-activation`、显示 “Enable sound”；可信点击后 `available`，按钮消失，焦点到输入区，日志开始记录。菜单中锁定时点击 “Enable sound”：状态仍 `needs-activation`、按钮与焦点保持、菜单不关、游戏不继续；Continue 后 `available`。修改后的三个 e2e（base-interaction、flight-render、cockpit-lifecycle 的开发项目）12 项通过、2 项按项目跳过。生产构建的 `dist/` 中没有 `dev-sound-log`、“sound decisions” 或 “Clear sound log”。
- **观察（交协调者，不在本项范围）：** (1) 暂停门禁关闭且上下文已锁定时，控制器的 `unlock()` 直接返回，所以菜单或暂停中的 “Enable sound” 不改变状态（Continue 仍会解锁）；(2) 锁定期间日志为 0 条，即锁定时没有记录被阻止的播放；(3) 上述一次未复现的 Continue 后 `paused` 首读。
- **审查：** rubber-duck 指出两项并已修正：`enableSound` 以脱离接收者的方式调用（会抛错；改为 `owner.enableSound?.()`，并以上面的锁定冒烟证实）；失败与菜单时焦点落到标题而非可操作控件、隐藏时仍会移动焦点（改为本页第一个可用动作，隐藏时不动）。simplify：提取 `RingLog` 供事件与声音日志共用、提取 `zoneFocusable` 共用 P3-05 条件；未采纳逐决定发布改为采样（暂停与停止时没有帧，会使决定滞留）、合并 `#logRunId`（`#runId` 在运行结束时须清空以停止快照与导出）、按页面传入回退焦点等。
- **文档影响：** 更新 [ui.md](../../../../engineering/modules/ui.md)（声音状态、诊断 API、声音日志、构建说明）、[keyboard-input.md](../../../../engineering/keyboard-input.md)（按钮与焦点交接）、[README.md](../../../../engineering/README.md)（测试 ID、开发诊断、装配）、[slice-gaps.md](../../../../engineering/slice-gaps.md)（在制提示已移除）与 [render.md](../../../../engineering/modules/render.md) 的一行外部前提；STATUS 与 tasks.md 无需变化。
