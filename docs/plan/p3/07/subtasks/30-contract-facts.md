---
type: plan
status: active
phase: P3
task: "07"
subtask: "30"
updated: 2026-10-10
---

# 30 — 契约依据的两项原版事实

**契约来源：** [spec](../spec.md) 的 S-11、AC-15；P3-02 spec 的 [CR-09](../../02/spec.md#cr-09-与-p3-06-的接口d-03)（导弹构造中的 `0x21a3c`）与 [CR-10](../../02/spec.md#cr-10-帧尾的驾驶舱显示步d-01)（驾驶舱显示步的视角集合，事实待写入 cockpit）；[08 的完成证据](./08-shared-contract-gate.md#完成证据)中 08 自行补取、尚未写入 `docs/original/` 的两项事实。
**依赖：** 08。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **`0x21a3c` 的原生语义：** 在私有的 Ghidra 项目副本上以 `-noanalysis -readOnly` 读取原生指令（可沿用 02 的私有副本，或在 `local/research/p3-07/contract-facts/` 中另建一份；不 `-overwrite`），核实 08 的读数，写入 [executable 的 W11](../../../../original/formats/executable.md#w11-launch-message-8-and-the-two-constructors--confirmed-code)（目前只写到速度取 min(对象 +0x78, 发射者速度)）：
  - 模式 0：置到达标志；速度与指令速度都为 min(对象 +0x78, 发射者移动块 +8)；+0x70 为 0 时取机型 +0xB8；再求速度比；
  - 其他模式：只写速度。
  同时核对 [移动块字段表](../../../../original/formats/executable.md#movement-stage-and-integration-p3-0601)中列出的 `0x21a3c` 读写与此一致；不一致时以原生指令为准更正，并在完成证据中写明。
- **CCKD 的仪表类型：** 只读本地 `SR.NOB` 的 CCKD 条目 10103、10101、10097 的组目录与 48 字节仪表记录的类型字段（+0），按条目、槽与布局号列出仪表类型的次序与个数，写入 [cockpit 的组目录](../../../../original/formats/cockpit.md#group-directory-confirmed-structure-on-all-three-entries)（或其下的新小节）：
  - 08 的读数：类型 6、7 只出现在布局 0、5 与 10097 的槽 0；外部视角的布局 1–4、8 只有类型 8；地图的布局 6 有类型 10、8；
  - 类型 6、7 分别是左、右显示屏的绘制例程（[T8](../../../../original/formats/executable.md#t8-left-display-no-target-reads-confirmed-code)、[T7](../../../../original/formats/executable.md#t7-right-target-display-confirmed-code)，已确认）；本项只链接，不重复；
  - 记录次序供 16 的帧尾显示步决定右显示屏清除与状态显示步的先后。
- **证据与置信度：** 每项事实标注 Confirmed / Likely / Unconfirmed 及依据（地址、条目号、计数）。完成证据写明 [CR-10](../../02/spec.md#cr-10-帧尾的驾驶舱显示步d-01) 中“高概率”的依据能否改为已确认，交协调者处理，不修改 spec。
- 私有脚本、Ghidra 输出与读数只存放在 `local/research/p3-07/contract-facts/`。

## 不包含

- 修改 P3-02 或本任务的 spec 与 goal（协调者负责）。
- `docs/original/unknowns.md`（不在写入范围）：若 U-029 等的状态需要改变，在完成证据中写明，交协调者。
- 仪表的绘制、位置与像素（P3-13）；CCKD 的图像与其他字段。
- 实现代码（13、14、16 使用这两项事实）。

## 关键文件与契约

- [executable 的 Combat rules](../../../../original/formats/executable.md#combat-rules-p3-07)（W11、T7、T8）与 [P3-06 的运动一节](../../../../original/formats/executable.md#movement-stage-and-integration-p3-0601)的移动块字段表。
- [cockpit](../../../../original/formats/cockpit.md) 的 CCKD 一节。
- 08 的完成证据；goal 的环境约定（Ghidra 只读副本，研究输出只在 `local/research/p3-07/<主题>/`）。
- 结构工具：`node tools/nob-list.ts`（只列目录）；计数脚本写在 `local/research/p3-07/contract-facts/`。

## 写入范围

- `docs/original/formats/executable.md`：W11 中 `0x21a3c` 的原生语义；必要时更正移动块字段表的写入者说明。
- `docs/original/formats/cockpit.md`：按条目、槽与布局的仪表类型及其次序与个数。
- `local/research/p3-07/contract-facts/**`：私有脚本、Ghidra 输出与读数（被忽略）。

## 验收标准

- [ ] executable 的 W11 记录 `0x21a3c` 在模式 0 与其他模式下的写入，带置信度与地址证据，与移动块字段表一致。
- [ ] cockpit 记录 10103、10101、10097 各槽的仪表类型、次序与个数（只含类型、计数、布局号与条目号），带置信度；类型 6、7 所在的布局与 CR-10 视角集合的对照结论写在完成证据中。
- [ ] 所改文档的 `updated:`、链接与锚点正确；仓库中没有原版内容、反编译或反汇编输出；私有输出只在 `local/research/p3-07/contract-facts/`。
- [ ] `pnpm check:compliance` 通过；`node tools/task-state.ts p3/07` 没有计划问题。

## 验证方法

- 完成证据写明原生指令的读取命令（`-noanalysis -readOnly`）与 CCKD 计数脚本的命令；计数由脚本从本地数据独立得出，再与 08 的读数对照。
- 文档的链接与元数据检查；git 审阅确认只改写入范围内的文件。

## 完成证据
