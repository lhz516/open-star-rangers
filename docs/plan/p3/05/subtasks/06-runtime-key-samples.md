---
type: plan
status: active
phase: P3
task: "05"
subtask: "06"
updated: 2026-10-10
---

# 06 — 原版运行样本（Q-05）

**契约来源：** [spec](../spec.md) 的 S-01、S-15，[原版研究](../spec.md#原版研究) Q-05，[执行检查点](../spec.md#执行检查点)“运行样本与重开”；AC-01，R-23 的样本部分。
**依赖：** 04。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **前提：** goal 的 P3-06 集成已满足——本工作树具备 P3-06 交付的 BIOS 键盘缓冲注入与读回工具（`tools/baseline/`）。未满足时本项记为 blocked。基准环境由协调者操作，同一时间一个 DOSBox-X，与 P3-06、P3-07 的会话协调。
- 每个按键上下文至少一个样本，并包括：上方向键切换前视而不转向、Shift+数字的档位、按住 Alt 时按字母键的结果、地图中的 `p` 与 Esc、能量页的 `s`/`g`。
- 每个样本记录注入的码、处理函数收到的值与可观察结果，并与 04 入库的 Q-01–Q-04 结论比较。
- 明确每个样本证明的是“给定码到动作”还是“物理键到码”：BIOS 码注入只证明前者。若某条结论需要后者（如 Alt+字母、NumLock 下的小键盘），先尝试经模拟器的宿主输入路径（例如以 Computer Use 向 DOSBox-X 窗口送键）并核实该路径；仍无法取得时保持未确认，不以注入代替。
- 把样本结论写入[键位表](../../../../original/input/key-map.md)、[executable](../../../../original/formats/executable.md)（如有新的代码地标）与 [unknowns](../../../../original/unknowns.md)；读数与原始输出只在 `local/research/p3-05/runtime/`。
- 若样本推翻 04 的静态结论，在事实处如实更正并单列冲突，供 08 定稿时采用；若 08 已完成，由协调者按 K 的重开规则新增修复子任务。
- 确需扩展基准工具时，按[运行时测量](../../../../guides/runtime-measurement.md)更新文档并运行其 unittest。

## 不包含

- BIOS 自动重复与节奏（07）；K 定稿（08）；项目实现。

## 关键文件与契约

- 输入：04 入库的事实；P3-06 的注入方法与 `tools/baseline/`（集成后）。
- [key-map.md](../../../../original/input/key-map.md)、[executable.md](../../../../original/formats/executable.md)、[unknowns.md](../../../../original/unknowns.md)。

## 写入范围

- `local/research/p3-05/runtime/**`：样本输出（不入库）。
- `docs/original/input/key-map.md`、`docs/original/formats/executable.md`、`docs/original/unknowns.md`：样本结论。
- `tools/baseline/**`：仅在必须扩展注入或读回工具时。
- `docs/guides/runtime-measurement.md`：工具改动的用法。

## 验收标准

- [x] Q-05 达到门槛：每个上下文至少一个样本，含 spec 列出的五类，均给出注入码、处理函数收到的值与可观察结果，并与 Q-01–Q-04 一致或已单列冲突。（**基地除外**：基地上下文的样本移交 [34](./34-base-runtime-sample.md)，见完成证据。）
- [x] 每个样本标明证明的是“码到动作”还是“物理键到码”；未取得物理路径证据的结论保持未确认。
- [x] 仓库中没有读数原文或原版内容；`pnpm check:compliance` 通过；改动 `tools/baseline/` 时 `python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'` 通过。

## 验证方法

- 样本记录与入库事实逐项对照；`git status --short` 确认 `local/` 输出未被跟踪。

## 完成证据

- **运行（基准私有副本，agent 独自，模拟器内输入，`--evidence local/research/p3-05/runtime`）：** A `q05-a-01`（飞行、能量页、地图：85/85 检查通过）、B `q05-b-01`（地图左键 → Warp、Warp 中的 Esc/`p`/`m`：46/46）、D `q05-d-01`（Esc → 选项页 → Esc 回飞行：12/12）；三次运行均 `complete`，完整性与回收检查通过。B 原先的 46/47 中失败的一项是检查器把侦察当作检查（`f` 在本任务没有友方候选，目标不变，与代码一致），改为侦察后重核为 46/46。
- **spec 列出的五类：** 上方向键切回前视而不转向；Shift+`5`、Shift+`0` 的档位（指令速度精确等于预测值）；按住 Alt 时 Alt+`E` 的码为 0、主炮电平为 1；地图中 `p`（暂停循环中 Esc 不结束、`p` 结束）与 Esc 关闭地图；能量页 `s`、Shift+`s`、`g`、Shift+`g` 的档位变化与规则推算一致。全部与 Q-01–Q-04 一致，没有冲突；选项页以 Esc 继续由高概率改为已确认。
- **证明类型：** 全部为“码到动作”。物理键到码没有取得（Computer Use 不能向 DOSBox-X 送键，`AUTOTYPE` 已排除，用户操作的探针未做），宿主物理键一步在键位表、executable 与 U-011 中保持未确认。
- **基地缺口：** 探索运行 `q05-c1-02`（与 P3-06 的 17 交替）经 Warp 到达离基地约 9300 处，停靠闸门超时，不计为完整运行；D 读到所选任务的三个基地类对象状态字节 +2 都为 0，而 `0x394c4` 要求为 1。按 goal 执行记录的决定，基地样本移交 34；K 的基地按键以 Q-04 代码证据为依据，不受影响。中断的 `q05-c1-01`（电脑重启）不计。
- **记录：** [键位表的运行样本](../../../../original/input/key-map.md#运行样本q-05p3-0506)、[executable 的 Runtime samples](../../../../original/formats/executable.md#runtime-samples-p3-0506)、[unknowns U-011](../../../../original/unknowns.md)。
- **检查：** `pnpm check:compliance` 通过；`git diff --check` 无问题；`git status --short` 确认 `local/` 输出未被跟踪；未改 `tools/baseline/`。rubber-duck 审阅三项发现均已修正（Q-05 对基地标为未达到；executable 中宿主映射的置信度改为未确认；Warp 路径与基地不可停靠的结论限定在测得的状态）。
