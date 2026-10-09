---
type: plan
status: active
phase: P3
task: "03"
subtask: "18"
updated: 2026-10-09
---

# 18 — 按 ID 播放的音效与 HUD 音效

**契约来源：** [spec](../spec.md) 的 S-13、AC-10、AC-13（音频映射）、AC-18；[Asset 与角色](../spec.md#asset-与角色)的 `event-sound` 与 `hud-sound` 行、[字段处理规则](../spec.md#字段处理规则) 10。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 [audio-conversion.ts](../../../../../src/original-data/conversion/audio-conversion.ts) 中：
  - 为 `SOUND_ROLES` 增加 `event-sound` 与 `hud-sound`；
  - 规定 Asset ID 规则：`sound/event/<名称>`、`sound/hud/<名称>`，名称为 kebab-case；
  - 读取声音表时，同一 SND 不得属于两个 Asset 的检查继续生效。

  不改变既有角色的规则，不递增 `AUDIO_CONVERTER_COMPONENT`（由 19 递增）。
- 在计划新增的 `production-flight-sounds.ts` 中定义 11 行，SND 条目、Asset ID 与角色依次按 spec 的 Asset 表：
  - 8 个 `event-sound`，置信度为 `confirmed`；10055 附 U-004 的可达性说明；
  - 3 个 `hud-sound`，置信度为 `likely`，U-004。

  证据链接 [audio](../../../../original/formats/audio.md#sounds-played-by-id-and-hud-sounds-p3-0110)。本项不把这些行并入 `PRODUCTION_SOUND_TABLE`，由 19 合并。
- 循环方式按 P2-08 的既有规则，不按播放方式改变。
- 测试覆盖：
  - 新角色的 ID 规则正反例；
  - 11 行的读取与形状；
  - 与 `PRODUCTION_SOUND_TABLE` 在测试中拼接后，`readSoundTable` 通过且没有重复的 SND；
  - 用代码生成的 SND 转换出 11 个 sound Asset，角色正确；
  - 既有 18 个声音 Asset 的映射不变。

## 不包含

- 并入生产声音表、转换器组件、音频限值与包装配：归 19。
- 音效的触发与播放：归 P3-14。
- 模块分册：由 22 同步。

## 关键文件与契约

- [audio-conversion.ts](../../../../../src/original-data/conversion/audio-conversion.ts)：`SOUND_ROLES`、`ROLE_IDS`、`readSoundTable`。
- [production-sounds.ts](../../../../../src/original-data/conversion/production-sounds.ts)（只读）：既有声音表。
- 计划新增：`src/original-data/conversion/production-flight-sounds.ts` 与其测试。

## 写入范围

- `src/original-data/conversion/audio-conversion.ts`：新角色与 ID 规则。
- `src/original-data/conversion/audio-conversion.test.ts`：测试。
- `src/original-data/conversion/production-flight-sounds.ts`：11 行声音表（新建）。
- `src/original-data/conversion/production-flight-sounds.test.ts`：测试（新建）。

## 验收标准

- [x] AC-10（转换部分）：11 个 SND 生成 sound Asset，ID 与角色符合 Asset 表；同一 SND 不属于两个 Asset；与既有表拼接后没有冲突。
- [x] AC-13（音频映射）：11 行映射能读取，置信度与 U 项符合 Asset 表。
- [x] 既有声音表与音频转换的测试不改断言即可通过。
- [x] AC-18：测试只用代码生成的 SND，不读取文件。
- [x] `pnpm exec vitest run src/original-data/conversion tools/engineering-boundaries.test.ts` 与 `pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试，使用代码生成的 SND 与合成封包。不涉及浏览器或原版数据。

## 完成证据

- **实现：**
  - [audio-conversion.ts](../../../../../src/original-data/conversion/audio-conversion.ts)：`SOUND_ROLES` 增加 `event-sound` 与 `hud-sound`（`SoundRole` 随之扩大），由新的 `NAMED_ROLE_STEMS` 派生；ID 规则为 `sound/event/<名称>`、`sound/hud/<名称>`，恰好一个 kebab-case 名称段。既有角色的规则不变；`readSoundTable` 的同一 SND 检查对全部角色生效；`AUDIO_CONVERTER_COMPONENT` 仍为 `audio-1`，`AUDIO_BUDGET_LIMITS` 不变。
  - 新建 [production-flight-sounds.ts](../../../../../src/original-data/conversion/production-flight-sounds.ts)：导出 `PRODUCTION_FLIGHT_SOUND_TABLE`（11 行，经 `readSoundTable` 读取，按 Asset ID 升序）。8 个 `event-sound` 为 `confirmed`，其中 `transponder-created`（10055）的 unknowns 为 U-004；3 个 `hud-sound` 为 `likely`、U-004。证据均为 [audio](../../../../original/formats/audio.md#sounds-played-by-id-and-hud-sounds-p3-0110)，resolution 为 `declared`。没有生产代码导入该表，`PRODUCTION_SOUND_TABLE` 与生产包输出不变，合并归 19。
- **AC-10（转换部分）：** [production-flight-sounds.test.ts](../../../../../src/original-data/conversion/production-flight-sounds.test.ts)：
  - 用代码生成的 SND 转换出 11 个 sound Asset，ID、kind、角色、组与依赖都等于表，来源状态为 `verified` 并带各行的 U 项；
  - 各 payload 的循环方式只来自其合成块的 `flags`（`flags` 与角色交错，`overlay-loop` 与 `instrument-9-loop` 的结果不同），即 P2-08 的既有规则；
  - 与 `PRODUCTION_SOUND_TABLE` 按 ID 拼接后 `readSoundTable` 通过，29 行的 SND 互不相同；两表合并转换时，18 个既有 Asset 的描述符与 payload 字节与单独转换时完全相同。
- **AC-13（音频映射）：** 测试逐行断言 11 行的角色、ID、整条 SND 定位、置信度、U 项、证据与 resolution，映射投影能经 `readSourceMappingTable` 读取，ID 中没有条目编号。
- **ID 规则正反例：** [audio-conversion.test.ts](../../../../../src/original-data/conversion/audio-conversion.test.ts) 读取两种新角色与核心行混排的表；拒绝无名称、两段名称、事件角色用核心词干、HUD 角色用事件词干，以及既有 SND 被事件音效重用（`duplicate-mapping`）。
- **既有测试：** `production-sounds.test.ts` 与 `audio-conversion.test.ts` 的既有断言未改，全部通过。
- **AC-18：** 新测试只用 `syntheticSnd` 与 `productionSoundEntries()` 生成的合成块，经合成光盘读取，不读文件；源码只含条目 ID，不含原版数值、字节或文字。
- **检查：** `pnpm exec vitest run src/original-data/conversion tools/engineering-boundaries.test.ts`（23 个文件、614 项）、`pnpm typecheck`、`pnpm lint` 与 `pnpm check`（157 个文件、4703 项，构建成功）通过。
- **rubber-duck：** 未发现问题。simplify：采纳以一张词干表派生新角色及其 ID 规则、删去可推导的断言与重复用例、合并测试共用一个已核验来源；保留对 `readSourceMappingTable` 的显式断言，作为 AC-13 证据，与 `production-sounds.test.ts` 一致。
- **文档影响：** 没有新的原版事实或 U 项变化；工程约定与指南不受影响。交 22 同步模块分册的接口变化：`SOUND_ROLES`/`SoundRole` 增加 `event-sound`、`hud-sound` 及其 ID 规则；新增 `PRODUCTION_FLIGHT_SOUND_TABLE`（19 并入生产声音表前不参与生产作业）。
