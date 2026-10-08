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

- [ ] 开火、导弹、Warp、爆炸各有一个注明的、直接对照原版的 Asset 及判定；连同 21 的记录，AC-18 的全部条件满足。
- [ ] 证据只含文字结论、Asset ID、文件名与判定；文档链接与元数据有效，`pnpm --silent check:original` 通过。

## 验证方法

- 用户确认；agent 记录与文档检查。

## 完成证据
