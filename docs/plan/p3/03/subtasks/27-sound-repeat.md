---
type: plan
status: active
phase: P3
task: "03"
subtask: "27"
updated: 2026-10-09
---

# 27 — sound payload schema 2 与按次数重复播放

**契约来源：** [spec](../spec.md) 修订 1 的 S-13、AC-10、AC-11（sound payload schema 2）、AC-15、AC-18；[声音 payload schema 2](../spec.md#声音-payload-schema-2)、[字段处理规则](../spec.md#字段处理规则) 10、[持久化与兼容](../spec.md#持久化与兼容)、技术决定 15。
**依赖：** 19。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **payload：** [sound-payload.ts](../../../../../src/content/sound-payload.ts) 的 `SOUND_PAYLOAD_SCHEMA_VERSION` 由 1 递增为 2：
  - 循环码增加 2 = `repeat`；头部偏移 15 由保留字节改为播放次数，`repeat` 时为 2–255，`none` 与 `whole` 时须为 0；其余字段、编码与浮点映射不变；
  - 类型以不可混淆的方式表示次数（例如 `SoundFormat` 增加只在 `repeat` 时存在的 `plays`），写入器与读取器按同一规则校验；
  - 读取器只接受上述组合，循环码未知、`repeat` 的次数小于 2、`none` 或 `whole` 的偏移 15 非零，都为 `invalid-sound-payload`。
- **转换：** [snd.ts](../../../../../src/original-data/formats/snd.ts) 的 `SndFlagRule` 能表达 `repeat` 及其次数；[production-sounds.ts](../../../../../src/original-data/conversion/production-sounds.ts) 的 `PRODUCTION_SND_RULES` 在 0（`whole`）与 1（`none`）之外只增加 8（`repeat`，次数 8），声道数仍为 1；其他值仍为 `unsupported-payload`。更新规则的注释与证据链接（[audio 的播放解释](../../../../original/formats/audio.md#playback-interpretation-p2-08)）。
- **播放：** [audio-controller.ts](../../../../../src/platform/audio/audio-controller.ts) 与 [browser-audio-controller.ts](../../../../../src/platform/audio/browser-audio-controller.ts) 对 `repeat` 共播放 *n* 次后自然结束，与 `none` 一样释放资源，可被提前停止；`none` 与 `whole` 的行为不变。实现方式（例如循环加按时长停止，或逐次排程）由本项决定，须在测试替身中可观察。
- **合成数据：**
  - [production-sounds.test-support.ts](../../../../../src/original-data/conversion/production-sounds.test-support.ts) 中 SND 10181 的合成条目改用 `flags` 8，去掉“待决定”的例外说明；
  - Worker 的合成光盘与合成规则（[synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts)）加入至少一个 `repeat` 声音，供 20 的浏览器断言使用；
  - 合成内容包中的声音描述符随 schema 递增。
- **测试：**
  - AC-11：三种循环方式与 2–255 的次数可往返；每种拒绝项；schema 不是 2 时，音频控制器与转换结果的 schema 断言相应更新；
  - AC-10：`flags` 8 转为 `repeat`、次数 8；`flags` 为 0、1、8 以外的值仍被拒绝；既有 18 个声音的 payload 字节不变（以合成数据证明 `flags` 0 与 1 的输出与递增前逐字节相同）；
  - 音频控制器：`repeat` 的播放次数、自然结束后的释放、提前停止，以及 `none`、`whole` 不变；
  - 固定 schema 1 或旧循环方式的既有测试随之更新，行为断言不放宽。
- **本地核对**（输出只在 `local/research/p3-03/sound-repeat/`）：在基准上运行生产音频阶段，确认 `warp-arrival` 转换成功、次数为 8，其余声音的 payload 指纹与 19 的观测一致；只记结论、计数与哈希。

## 不包含

- `hud-text` 与其装配：归 25、26。
- 浏览器中的重复播放断言：归 20（本项只提供合成数据与 Node 测试）。
- 转换器组件：音频组件已由 19 递增为 `audio-2`；本项不再递增，因为 19 的中间输出没有在真实来源上产生过完整的包（基准作业在 `flags` 8 处失败关闭），证据中写明。
- 文档：由 22 同步（content 与 platform 分册、audio.md）；本项在完成证据中列出 API 与行为变化。

## 关键文件与契约

- [sound-payload.ts](../../../../../src/content/sound-payload.ts)、[snd.ts](../../../../../src/original-data/formats/snd.ts)、[production-sounds.ts](../../../../../src/original-data/conversion/production-sounds.ts)、[audio-conversion.ts](../../../../../src/original-data/conversion/audio-conversion.ts)。
- [audio-controller.ts](../../../../../src/platform/audio/audio-controller.ts)、[browser-audio-controller.ts](../../../../../src/platform/audio/browser-audio-controller.ts)。
- [audio 的播放解释](../../../../original/formats/audio.md#playback-interpretation-p2-08)：`flags` 低字节为 Miles 循环次数（代码已确认）。

## 写入范围

- `src/content/sound-payload.ts`：schema 2。
- `src/content/sound-payload.test.ts`：测试。
- `src/content/synthetic-content.test-support.ts`：合成包中的声音。
- `src/content/completeness.test.ts`：受 schema 影响的断言。
- `src/content/ownership.test.ts`：受 schema 影响的断言。
- `src/content/budget.test.ts`：受 schema 影响的断言。
- `src/original-data/formats/snd.ts`：`repeat` 规则。
- `src/original-data/formats/snd.test.ts`：测试。
- `src/original-data/conversion/**`：生产 SND 规则、音频转换与受影响的测试和合成支持。
- `src/platform/audio/**`：重复播放与测试。
- `src/platform/storage/**`：受 schema 影响的测试。
- `src/workers/**`：合成光盘、合成规则与受影响的测试。
- `src/app/**`：受 schema 影响的测试。
- `e2e/**`：受合成数据影响的既有断言与观察支持。
- `local/research/p3-03/sound-repeat/**`：本地核对输出（被忽略）。

## 验收标准

- [ ] AC-11（sound）：schema 2 的往返与全部拒绝项通过；只接受 schema 2。
- [ ] AC-10：`flags` 8 为 `repeat`、次数 8；其他未列出的值被拒绝；既有 18 个声音的 payload 字节不变；11 个新声音仍符合 Asset 表。
- [ ] 音频控制器对 `repeat` 播放 *n* 次后结束并释放，可提前停止；`none` 与 `whole` 不变。
- [ ] AC-15：旧包中 schema 1 的声音随旧转换器版本不再恢复；缓存与持有者测试通过。
- [ ] 本地核对：基准上 `warp-arrival` 转换成功，结论与哈希只在 `local/`。
- [ ] AC-18：合成数据只由代码生成；诊断不含原版数值。
- [ ] `pnpm check` 与 `pnpm test:e2e` 通过。

## 验证方法

- Node 测试：sound payload、SND 转换、音频转换、音频控制器（测试替身记录排程与停止）、缓存与持有者。
- `pnpm check`、`pnpm test:e2e`（回归）；本地基准核对只在 `local/`。

## 完成证据
