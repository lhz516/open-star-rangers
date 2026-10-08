---
type: plan
status: active
phase: P2
task: "12"
subtask: "28"
updated: 2026-10-08
---

# 28 — 修复：补记 A-1 各角色的原版直接对照

**契约来源：** [spec](../spec.md) 的 S-09；AC-18 的“四个角色各有一次直接对照原版”。由 [26](./26-final-alignment.md) 第一次运行新增（execute-goal §5）。
**依赖：** —。
**执行方式：** 需用户：用户注明开火、导弹、Warp、爆炸各自直接对照原版的 Asset；若未逐一对照，在基准 DOSBox-X 中补做（需要时由 agent 启动 DOSBox-X）。agent 记录。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- [21](./21-user-comparison-session.md#完成证据) 中用户已完成 12 个核心 Asset 的试听（与 WAV 一致，完整播放与 Stop 正常），并表示已在原版中对照，但没有注明各角色对照的 Asset。本项只补这一点：
  - 导弹与 Warp 各只有一个核心 Asset，用户确认已对照即可；
  - 开火（4 个）与爆炸（6 个）由用户各注明至少一个直接对照过的 Asset；
  - 用户没有对照过的角色，在基准 DOSBox-X 中补做该角色的一次直接对照。
- 在被忽略的 `local/research/p2-12/session/record.md` 的 A-1 表中补记，并在 [audio 的播放路径节](../../../../original/formats/audio.md#viewer-playback-path-p2-12)把“未记录”改为实际结论。

## 不包含

- 重做 21 的其余试听项；声音触发规则（P3）。

## 关键文件与契约

- [21](./21-user-comparison-session.md#完成证据) 的 A-1 记录；[14](./14-sound-baseline-equivalence.md#完成证据) 的 WAV 对应；[本地导入指南](../../../../guides/local-import.md)。

## 写入范围

- `local/research/p2-12/session/**`：A-1 补记（被忽略）。
- `docs/original/formats/audio.md`：播放路径节的原版直接对照结论。

## 验收标准

- [x] 开火、导弹、Warp、爆炸各有一个注明的、直接对照原版的 Asset 及判定；连同 21 的记录，AC-18 的全部条件满足。
- [x] 证据只含文字结论、Asset ID、文件名与判定；文档链接与元数据有效，`pnpm --silent check:original` 通过。

## 验证方法

- 用户确认；agent 记录与文档检查。

## 完成证据

- **用户注明（2026-10-08，协调者会话中由用户回答）：** 21 的会话中，用户已在基准 DOSBox-X 的第一关直接对照原版；本次注明各角色对照的 Asset，判定都为一致：开火 `sound/fire/player`、导弹 `sound/missile`、Warp `sound/warp`；爆炸按组对照 `sound/explosion/blast-v1` 至 `blast-v4`（原版每次播放其中一个，未逐个注明是哪一个）。结论、置信度与一条未确认的观察（`sound/explosion/other` 本次基本没听到）只记在 [audio 的播放路径节](../../../../original/formats/audio.md#viewer-playback-path-p2-12)。
- **AC-18：** spec 要求四个角色各有一次直接对照原版。爆炸角色的组级对照满足这一角色级要求，但不表示四个变体都逐个对照过。连同 [21](./21-user-comparison-session.md#完成证据) 的 12 项试听记录，AC-18 的全部条件满足。21 中 AC-18 的勾选框保留 21 完成时的状态，由本项补记；最终对齐应同时引用 21 与 28。
- **记录：** 被忽略的 `local/research/p2-12/session/record.md` 的 A-1 表已补记“原版直接对照”一列：开火、导弹、Warp 各一项为“是”，四个 blast 为“组级对照”，其余为“否”并写明原因。
- **检查：** 改动文档与引用 audio 的文档做链接、锚点与 front matter 检查，0 个问题；`pnpm --silent check:original` 通过，0 条发现。证据中没有原版声音、采样值或文字。
- **rubber-duck：** 没有阻塞问题，2 项非阻塞问题都已处理：爆炸改为组级对照，不把四个变体逐个记为已直接对照；原版事实只留在 audio，本文件与 goal 执行记录改为链接。
