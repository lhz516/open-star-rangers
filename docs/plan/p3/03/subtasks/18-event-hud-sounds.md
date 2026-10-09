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

- [ ] AC-10（转换部分）：11 个 SND 生成 sound Asset，ID 与角色符合 Asset 表；同一 SND 不属于两个 Asset；与既有表拼接后没有冲突。
- [ ] AC-13（音频映射）：11 行映射能读取，置信度与 U 项符合 Asset 表。
- [ ] 既有声音表与音频转换的测试不改断言即可通过。
- [ ] AC-18：测试只用代码生成的 SND，不读取文件。
- [ ] `pnpm exec vitest run src/original-data/conversion tools/engineering-boundaries.test.ts` 与 `pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试，使用代码生成的 SND 与合成封包。不涉及浏览器或原版数据。

## 完成证据
