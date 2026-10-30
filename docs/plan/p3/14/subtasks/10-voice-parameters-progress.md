---
type: plan
status: active
phase: P3
task: "14"
subtask: "10"
updated: 2026-10-17
---

# 10 — 逐发声参数与源采样进度

**契约来源：** [spec](../spec.md#控制器扩展边界) 的 S-03、AC-04、AC-06。
**依赖：** 06。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 D-01 实现完整参数的播放前校验、初始应用、更新和发声状态查询；浏览器节点在 start 前取得正确参数。
- none/whole/repeat 的进度以源采样量解释，初始或运行中变速后仍按遍数停止；不按 repeats 复制缓冲。
- 同步更新假能力和浏览器能力；非法值/旧句柄/宿主失败分开，半途节点取得失败全部清理。
- 旧 play(id) 的采样率、路由与错误默认行为保持，查看器透传能力同步但不增加玩法逻辑。

## 不包含

- 任务暂停/隐藏竞态由 11，原版类别分配由 12；不实现混音规则或声音设置。

## 关键文件与契约

- 现有 [audio-controller.ts](../../../../../src/platform/audio/audio-controller.ts)、[browser-audio-controller.ts](../../../../../src/platform/audio/browser-audio-controller.ts)和假能力。
- 如需进度辅助，计划新增平台内 `voice-progress.ts` 及邻接测试，具体字段遵循 06。

## 写入范围

- `src/platform/audio/**`：参数、进度、浏览器能力及测试。
- `src/app/viewer/viewer-audio.ts`：能力包装透传。
- `src/app/viewer/viewer-audio.test.ts`：查看器兼容回归。
- `docs/engineering/modules/platform.md`：端口契约说明。

## 验收标准

- [x] start 前应用参数；非法参数不分配半个发声，旧句柄不影响新声音。
- [x] 变速后的有限重复恰播放指定遍数，提前 stop 不续播；未中断的 warp-arrival 为 8 遍。
- [x] 自然结束/stop 清理幂等，资源上限不被绕过，查看器旧行为回归通过。

## 验证方法

- 假上下文时间与独立源采样进度断言，速率边界/重复次数/迟到结束；`pnpm test -- src/platform/audio src/app/viewer/viewer-audio.test.ts`、`pnpm check`。
- 调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)限定本项；真实输出信号另由 22 取得，不以假 start 证明可听。

## 完成证据

- **实现：** [voice-progress.ts](../../../../../src/platform/audio/voice-progress.ts)（`AUDIO_RATE_LIMIT` = 44,100、整数参数的全对象校验与缺省、A-09 线性平衡表映射、按源帧计的 `RepeatProgress.retarget`）；[audio-controller.ts](../../../../../src/platform/audio/audio-controller.ts) 的 `play(id, parameters?)`、`update`、`voiceState`、`stop(voice, reason?)`、四种结束原因与 `AUDIO_ENDED_HISTORY`（256）；[browser-audio-controller.ts](../../../../../src/platform/audio/browser-audio-controller.ts) 的“源 → 音量增益 → 两声道增益 → 合并 → 输出”（立体声源先分离），初值在 `start()` 前写入，构造中途失败断开已建节点；假能力记录初始参数与每次设置；[viewer-audio.ts](../../../../../src/app/viewer/viewer-audio.ts) 透传第三个参数。
- **AC 1（start 前应用，非法不分配，旧句柄）：** `audio-controller.test.ts` 的 “applies initial parameters … before it starts”“rejects invalid parameters without a handle, a node or a count”（边界 0/127/1/44,100 及其外侧 1、小数、NaN、null；之后的合法 play 句柄恰为前一个 +1）、“rejects an update for a fixed, unknown or ended voice and after disposal”“disconnects a voice whose end listener the host cannot add”“fails and releases every voice when the host cannot apply an update”；`voice-progress.test.ts` 覆盖全对象校验、缺省与声像 0/32/63/64/96/127 的映射。
- **AC 2（变速后遍数、提前 stop、8 遍）：** “plays exactly the passes at the initial rate, eight for an uninterrupted warp arrival”（8 × 1000 帧 @ 11,025 Hz，固定、22,050、5,000 Hz 各自的停止时间，缓冲只有一遍）；“reschedules the stop from the source frames left at every rate change, and only then”（1 → 2 → 0.5 倍时的精确停止时间，同速率更新不重排）；“consumes no passes while the context time stands still, and never resumes a voice stopped early”；“keeps the passes within 128 output frames times each rate step …”（四次变速各自准时或晚一个渲染量子的 16 种组合，误差 > 0 且 ≤ Σ 128 × |Δ playbackRate| × 存储速率 ÷ 上下文速率）。
- **AC 3（清理幂等、上限、查看器）：** “reports playing voices and keeps each voice's first end reason, whatever arrives later”（natural/stopped/preempted/stopAll/隐藏 released，迟到的 ended 回调不改原因，每个参数发声恰断开一次、监听全部撤销，读取不调用宿主）；“releases voices on disposal and keeps the end reasons of the last AUDIO_ENDED_HISTORY voices only”（第 256 个保留、第 257 个挤出最早的）；“counts parameterised voices toward the voice limit”；查看器 “plays fixed voices exactly as before voice parameters”（无初始参数、无 `setParameters`、调用只有 `start`）及既有查看器用例全部通过。
- **命令：** `pnpm exec vitest run src/platform/audio src/app/viewer/viewer-audio.test.ts` 3 个文件 104 项通过；`pnpm check` 通过（340 个测试文件 10,069 项，typecheck、lint、build 均通过）。
- **浏览器抽查（非 22 的输出证据）：** 在开发服务器（5132）中用 `OfflineAudioContext` 替换 `AudioContext` 驱动 `BROWSER_AUDIO`：声像 (1, 0)/(0, 1)、音量 0.5、`playbackRate` 2 使 1000 帧在第 499 帧结束、立体声源两声道分别进入两个声道增益、`setParameters` 在 256 帧处生效、固定发声与修订前相同且无 `setParameters`、构造中途抛错时源与已建节点全部断开。真实输出信号仍由 22 取得。
- **范围说明：** 按本文件“不包含”，`pause`/`resume` 门禁、`paused` 控制器状态与 `audio-paused` 错误码留给 11；本项的 `voiceState` 已在“存活而上下文未运行”时返回 `paused`，进度只随上下文时间前进。缺省速率取存储速率（spec 原文），所以存储速率高于 44,100 Hz 的声音在不给速率时照常以 `playbackRate` 1 播放，只有给出的速率受上限检查。
- **rubber-duck：** 采纳“半途取得节点失败须全部清理”（控制器在注册结束监听失败时断开端口；浏览器图构造失败时断开源与已建节点）与“误差界测试应独立模拟每次变速的延迟并计入存储速率 ÷ 上下文速率”；“缺省存储速率可高于上限”按 spec 原文保留并写入测试与模块文档。
- **simplify：** 采纳 `RepeatProgress.retarget` 统一变速重排、`#end` 由原因决定是否 `stop`、浏览器适配单一断开路径、去掉参数个数记录、合并后不变的 `update` 不调用宿主；未采纳把音量并入声道增益（spec 规定节点链）与先登记再注册监听（会对未开始的源调用 `stop` 并为未返回的句柄记原因）。
- **文档影响：** 更新 [平台模块说明](../../../../engineering/modules/platform.md) 的音频端口、参数、`update`、`voiceState`、`repeat` 遍数、浏览器节点与测试说明；原版事实与 unknowns 无变化（只引用 A-09）；STATUS 与 tasks.md 无需变化。
