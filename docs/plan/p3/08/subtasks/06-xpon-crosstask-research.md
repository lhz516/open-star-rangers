---
type: plan
status: active
phase: P3
task: "08"
subtask: "06"
updated: 2026-10-14
---

# 06 — Xpon、b 键与跨任务状态研究

**契约来源：** [spec](../spec.md) 的 S-12、S-13、AC-10、AC-13；[原版研究](../spec.md#原版研究) Q-10、Q-13，Q-12 中本项路径；[Xpon 与 `b`](../spec.md#xpon-与-b)、[与其他任务的接口](../spec.md#与其他任务的接口)。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **Q-10：** Xpon 回调 `0x3897c` 在活动与停放时的行为；`b` 的按键路径、消息 0x200000、`0x38780`、门禁与次数、所建对象的初值、+0x18、名称与模型、移动块重建 `0x218e8`；`b` 是否为正常玩法（键位表已列为非作弊键，Q-10 判定完整用途，不因未查清而排除）；Xpon 对迷雾的作用只记交接。
- **Q-13：** AI 对 P3-07 资源与子系统的读取；僚机在玩家停靠（+2 = 3）、玩家 Warp、玩家被毁与救援时的 AI 处理；+0xE4（记录 +0x78）的读者；救援 `0x67b98` 对 AI 状态与共享状态的重置范围。
- 事实写入 `local/research/p3-08/xpon/findings.md`（英文草稿，带置信度与证据）。
- 完成证据给出交 07、08、09 的摘要：`b` 纳入与否及依据、动态 Xpon 的实体表示需求、交 P3-09/P3-10/P3-11 的状态与调用点。

## 不包含

- 迷雾（P3-09）、停靠（P3-10）、救援（P3-11）的实现；`b` 的绑定（09 定稿后由 22 实现）。

## 关键文件与契约

- [键位表](../../../../original/input/key-map.md)、[两条分配路径](../../../../original/formats/executable.md#two-allocator-paths-native-inputs-and-profile-comparison)、[C3](../../../../original/formats/executable.md#c3-cross-frame-consumption-by-the-main-flow--confirmed-code)、[救援](../../../../original/formats/executable.md#mission-failure-player-loss-and-rescue-p3-0105)。
- 计划新增：`local/research/p3-08/xpon/`（被忽略）。

## 写入范围

- `local/research/p3-08/xpon/**`：Ghidra 脚本、输出与 findings 草稿（被忽略）。

## 验收标准

- [ ] Q-10 达到门槛（已确认，代码；是否为正常玩法的判断可为高概率，附依据）。
- [ ] Q-13 达到门槛（已确认，代码）；属于其他任务的部分只记交接。
- [ ] findings 草稿注明目标文档与节；没有改动跟踪文件，仓库中没有原版内容。

## 验证方法

- 只读 Ghidra，方法同 01；git 审阅；达不到门槛时按 spec 记为阻塞。

## 完成证据
