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

- [x] AC-11（sound）：schema 2 的往返与全部拒绝项通过；只接受 schema 2。
- [x] AC-10：`flags` 8 为 `repeat`、次数 8；其他未列出的值被拒绝；既有 18 个声音的 payload 字节不变；11 个新声音仍符合 Asset 表。
- [x] 音频控制器对 `repeat` 播放 *n* 次后结束并释放，可提前停止；`none` 与 `whole` 不变。
- [x] AC-15：旧包中 schema 1 的声音随旧转换器版本不再恢复；缓存与持有者测试通过。
- [x] 本地核对：基准上 `warp-arrival` 转换成功，结论与哈希只在 `local/`。
- [x] AC-18：合成数据只由代码生成；诊断不含原版数值。
- [x] `pnpm check` 与 `pnpm test:e2e` 通过。

## 验证方法

- Node 测试：sound payload、SND 转换、音频转换、音频控制器（测试替身记录排程与停止）、缓存与持有者。
- `pnpm check`、`pnpm test:e2e`（回归）；本地基准核对只在 `local/`。

## 完成证据

2026-10-09，worker `exec-p3-03-27`，基于认领提交 c496e5f。

- **sound payload schema 2（AC-11）：** [sound-payload.ts](../../../../../src/content/sound-payload.ts) 的 `SOUND_PAYLOAD_SCHEMA_VERSION` 为 2；`SOUND_LOOP_MODES` 增加 2 = `repeat`，`SOUND_PAYLOAD_OFFSETS.reserved` 改名为 `plays`（偏移 15），新增 `SOUND_REPEAT_PLAYS`（2–255）。类型 `SoundPlayback` 是 `{ loop: 'none' | 'whole' }` 与 `{ loop: 'repeat', plays }` 的可辨识联合，`SoundFormat`、`SoundPayloadInput`、`SoundPayload` 都由它组成，只有 `repeat` 带 `plays`。写入器与读取器按同一规则校验：
  - 写入器：`repeat` 须有 2–255 的整数 `plays`；`none`、`whole` 不得有自有的 `plays` 属性（含值为 `undefined`）；
  - 读取器：循环码只接受 0–2；`repeat` 的次数小于 2、`none` 或 `whole` 的偏移 15 非零都为 `invalid-sound-payload`，路径为 `payload.plays`，消息不回显值；
  - 字节本身不带 schema 版本，因此只接受 schema 2 由持有记录的一方核对：音频控制器拒绝 schema 1 与 3 的记录（见下）。

  [sound-payload.test.ts](../../../../../src/content/sound-payload.test.ts)：三种循环方式与 2、255 次往返后逐字节相同，读出的对象只在 `repeat` 时有 `plays`；`none`、`whole` 的写出结果与按 schema 1 布局独立构造的字节逐字节相同；读取拒绝循环码 3、`none` 与 `whole` 的非零次数、`repeat` 的 0 与 1 次；写入拒绝未知或继承名的循环方式、`none`/`whole` 带次数（含 `undefined`）、`repeat` 缺次数、1、256、2.5 与字符串次数。
- **转换（AC-10）：** [snd.ts](../../../../../src/original-data/formats/snd.ts) 的 `SndFlagRule` 为 `SoundPlayback` 加 `value` 与 `channels`，`convertSnd` 按规则写出循环方式与次数。[production-sounds.ts](../../../../../src/original-data/conversion/production-sounds.ts) 的 `PRODUCTION_SND_RULES` 在 0（`whole`）与 1（`none`）之外只增加 `{ value: 8, channels: 1, loop: 'repeat', plays: 8 }`，注释链接 audio.md 的播放解释与字段处理规则 10。测试：
  - [snd.test.ts](../../../../../src/original-data/formats/snd.test.ts)：单声道与立体声的 `repeat` 规则（5 次、255 次）转换正确，未列出的值仍为 `unsupported-payload`；
  - [production-sounds.test.ts](../../../../../src/original-data/conversion/production-sounds.test.ts)：规则恰为三项且冻结；`flags` 8 转为 `repeat`、次数 8；2、7、9、16、255 与低字节为 8 的 0x108 都为 `unsupported-payload`；合成光盘上 29 个声音中只有 `sound/event/warp-arrival` 为 `repeat`（8 次），5 个为 `whole`；每个声音的 payload 都等于测试中不经转换器、由 SND 头部独立构造的 schema 1 布局（`flags` 0 → 循环码 1、1 → 0，偏移 15 为 0），只有 `flags` 8 的一个为循环码 2、次数 8，且不在 P2-08 的 18 行之中；
  - 递增前后的合成数据逐字节对照（一次性脚本，在 c496e5f 的导出树与本工作树各运行一次生产音频阶段，未入库）：29 个声音中 28 个 payload 的 SHA-256 相同，只有 `warp-arrival` 不同，且把两者的偏移 14、15 置零后相同；
  - 11 个新声音的 ID、角色与映射仍由 [production-flight-sounds.test.ts](../../../../../src/original-data/conversion/production-flight-sounds.test.ts) 核对（未改，通过）。
- **播放：** 重复播放放在不依赖 DOM 的 [audio-controller.ts](../../../../../src/platform/audio/audio-controller.ts) 中，使测试替身能记录排程与停止（Node 测试不带 DOM 类型，浏览器模块不在 Node 中测试）。端口变化：`AudioContextPort` 增加 `currentTime`，`AudioVoicePort.start`/`stop` 增加可选的上下文时间 `when`；`createVoice(buffer, loop)` 不变。载入时 `repeat` 的发声循环整段缓冲，并记下 `plays × frames / sampleRate` 秒；`play()` 读取一次 `currentTime`，以同一时间调用 `start(when)` 与 `stop(when + 时长)`，由宿主的 `ended` 自然结束并像 `none` 一样释放；提前 `stop()` 不带参数，按 Web Audio 取代尚未到达的预定停止。缓冲只含一遍采样，不按次数复制（否则解码内存最多放大 255 倍，超出 `audioSamples` 预算的含义）；不用 `start()` 的 `duration` 参数，因为各引擎对循环源的处理不一致。`none`、`whole` 的调用与之前相同。[browser-audio-controller.ts](../../../../../src/platform/audio/browser-audio-controller.ts) 只把 `currentTime` 与 `when` 透传；[viewer-audio.ts](../../../../../src/app/viewer/viewer-audio.ts) 的能力包装同样透传 `currentTime`。[audio-controller.test.ts](../../../../../src/platform/audio/audio-controller.test.ts)：
  - 3 次、每遍 0.125 s 的声音只建一份 1,000 帧的缓冲，发声为循环，在上下文时间 1.5 与 2 开始时分别记录 `start 1.5`/`stop 1.875` 与 `start 2`/`stop 2.375`；
  - 宿主报告结束后只断开、不再停止，发声数归零；提前停止记录 `stop` 后断开；读取 `currentTime` 失败时控制器为 `failed` 并释放发声；
  - `none` 不循环、`whole` 循环、调用只有 `start`，与之前相同；schema 1（字节与 schema 2 相同）与 schema 3 的记录为 `invalid-sound-payload`。

  实际浏览器（Chrome 155，headless，开发服务器 `http://127.0.0.1:5183`，独立上下文，合成波形，未入库的一次性脚本）：
  - 0.2 s 方波按 3 次播放时记录到 `loop = true`、`start(t)` 与 `stop(t + 0.6)`；在 100、300、500 ms 采样输出峰值均为 0.5、发声数为 1，800 ms 时峰值 0、发声数 0；约一遍后提前停止，发声数立即为 0；
  - 逐帧计数（静音的 ScriptProcessor 统计高于 0.25 的帧，主线程在两次之间加入 0–9 ms 忙等）：24 次 8 遍播放每次恰为 35,296 帧（= 8 × 4,412），24 次单遍每次恰为 4,412 帧，没有截断。

  控制台只有页面请求 `/favicon.ico` 的 404（与本项无关）；服务器与浏览器已关闭。
- **持久化与兼容（AC-15）：** 音频组件保持 `audio-2`，不再递增：19 的中间输出没有在真实来源上产生过完整的包（基准作业在 `flags` 8 处失败关闭），因此不存在带 schema 1 声音的 `audio-2` 包；旧转换器版本的包已由 19 的 [resource-holder-cache.test.ts](../../../../../src/app/resources/resource-holder-cache.test.ts) 证明不提供恢复（通过）。合成内容包的 sound 描述符改为 schema 2（[synthetic-content.test-support.ts](../../../../../src/content/synthetic-content.test-support.ts)），[resource-cache-records.test.ts](../../../../../src/platform/storage/resource-cache-records.test.ts) 的往返按描述符声明的 schema 版本重建 payload 记录，`validatePackage` 为 `complete`；读取器与音频控制器只接受 schema 2。
- **合成数据（AC-18）：** [production-sounds.test-support.ts](../../../../../src/original-data/conversion/production-sounds.test-support.ts) 中 SND 10181 改用 `flags` 8，去掉“待决定”的说明，样本仍按行号生成。Worker 的合成音频光盘（[synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts)）加入测试含义的 `flags` 9 = 播放 3 次（与生产的 8 不同，证明次数来自规则），由第 2 个事件声音 `SYNTHETIC_REPEATED_SOUND`（`sound/event/synthetic-2`）使用；[import-job.test.ts](../../../../../src/workers/import-job.test.ts) 核对音频作业只把它转为 `repeat`、3 次，其余 14 个为 `none`。E2E 使用的合成包中的 `repeat` 声音：`models`/`production`/canary 场景（生产规则）的 `sound/event/warp-arrival` 播放 8 次，片段为几帧，8 遍共几毫秒；`audio` 场景的 `sound/event/synthetic-2` 播放 3 次。20 若需要能计时或中途停止的 `repeat` 声音，可在 E2E 夹具中写入较长的合成 payload（如 `audio-playback` 的页面声音）。[audio-playback.ts](../../../../../e2e/support/audio-playback.ts) 的页面声音改用模块的 `SOUND_PAYLOAD_SCHEMA_VERSION`。合成样本都由代码生成，诊断只含 code 与字段路径。
- **本地核对（只在 `local/research/p3-03/sound-repeat/`）：** `node local/research/p3-03/sound-repeat/check.ts <工作树> <c496e5f 导出树>` 在基准镜像上运行本工作树的生产音频阶段与完整生产作业，并与 19 的代码（只为计量把 `flags` 8 当作播放一次）逐个对照 payload，结果在 `out/check.json`，只含计数、循环方式与哈希：
  - 29 个声音全部 `verified`，schema 2；`none` 23 个、`whole` 5 个、`repeat` 1 个，即 `sound/event/warp-arrival`，次数 8；
  - 28 个 payload 与 19 的代码逐字节相同；`warp-arrival` 只有头部偏移 14、15 不同；
  - 用量 29 个 Asset、470,861 字节、304,035 个采样点，与 19 的观测相同，在 `AUDIO_BUDGET_LIMITS` 之内；
  - 完整生产作业得到版本 4 的 `complete` 包（logic 9、models 266、cockpit-hud-map 103、audio 29 个 Asset），转换器版本 `osr-import.graphics-4.logic-2.audio-2.models-4`，包预算在 `PRODUCTION_PACKAGE.limits` 之内，音频组的 payload 与单独运行的音频阶段相同。
- **检查：** `pnpm check` 通过（类型检查、ESLint、180 个文件 5,722 个 Vitest 测试、生产构建）。`OSR_E2E_DEV_PORT=5181 OSR_E2E_PREVIEW_PORT=5182 pnpm test:e2e` 181 个全部通过；此前一次完整运行中 `audio-playback` 的真实隐藏用例（返回后的 `whole` 循环峰值）与 `joint-pipeline` 的长任务用例在并行 worker 的负载下各失败一次，单独重跑两项都通过，最终完整运行无失败。`pnpm check:original` 无发现。
- **rubber-duck：** 两项发现。
  - `none`/`whole` 的输入可带值为 `undefined` 的 `plays`：已改为按自有属性拒绝，并加测试；
  - 以主线程读到的 `currentTime` 排程，若宿主晚于该时间才开始，最后一遍会被截短：未改。Chrome 中 `currentTime` 是下一个未渲染量子的起点，上面的逐帧计数 24 次都恰为 8 遍；改为提前到将来的时间会给 `repeat` 声音加上其他声音没有的启动延迟。Firefox 与 WebKit 未实测，代码注释写明“开始准时时恰为各遍”，作为残余风险报告给协调者。
- **simplify：** 去掉只为一处使用而导出的 `soundPlayback`，`convertSnd` 直接构造循环方式；合成光盘的重复声音改为在声明处显式传入 `flags`；测试中每个 payload 只读取一次。曾为浏览器计时把 SND 10181 的合成样本改为 0.1 s 方波，按审阅意见撤回，保持生产夹具按行号生成。未采纳：删除按 schema 1 布局逐字节对照的转换测试（它是 AC-10“既有声音字节不变”的证据）。
- **文档影响：** 按工作范围由 22 同步，本项未改文档。需要更新的位置：
  - [content 分册](../../../../engineering/modules/content.md) 的 sound-payload 一节：schema 2、偏移 15 为次数、`repeat` 与 `SOUND_REPEAT_PLAYS`、`SoundPlayback` 与写入/读取规则；
  - [platform 分册](../../../../engineering/modules/platform.md)：`currentTime`、`start`/`stop(when)` 与 `play()` 对 `repeat` 的排程；
  - [original-data 分册](../../../../engineering/modules/original-data.md)：`SndFlagRule` 的循环方式与次数，生产规则为 0、1、8，音频组描述符为 schema 2；
  - [audio.md](../../../../original/formats/audio.md)：`flags` 8 出现在切片中（SND 10181），表示为 `repeat` 8 次；
  - [本地导入指南](../../../../guides/local-import.md) 的试听说明：`repeat` 声音按次数播放，不是“播放一次”。
