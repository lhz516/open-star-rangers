---
type: plan
status: active
phase: P3
task: "05"
subtask: "04"
updated: 2026-10-10
---

# 04 — 键盘研究的事实记录（Q-01、Q-02、Q-04）

**契约来源：** [spec](../spec.md) 的 S-01、[文档影响](../spec.md#文档影响)（键位表、executable、unknowns）、[执行检查点](../spec.md#执行检查点)“先完成”一栏；AC-01。
**依赖：** 01、02。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 把 01、02 的结论写入[键位表](../../../../original/input/key-map.md)：四个按键上下文、修饰组合与 CapsLock、小键盘（NumLock/Shift）、`p` 与 Esc、通讯与能量页、基地按键；删去“待试玩补充”中已由代码解决的项；未确认项保留并写明缺什么证据。
- 在 [executable](../../../../original/formats/executable.md) 增加相应代码地标（函数地址、角色、结构），沿用该文档的英文与现有节结构；不写码表原文或反编译。
- 更新 [unknowns](../../../../original/unknowns.md) 的 U-011：已确认的部分改为已确认并链接证据，其余写明剩余项（负责阶段仍为 P0）。
- 每条事实标置信度与证据；与 P3-06、P3-07 已有记录冲突时，在事实处如实记录并注明交接对象。P3-07 尚未合入时，对其 T3、W3、D10、CR-05 已覆盖的事实只写带分支与提交的交叉引用，不复制正文（合入后由 32 改为正式链接）。
- 更新各文档 front matter 的 `updated:`。

## 不包含

- 地图鼠标事实（05）；运行样本与自动重复（06、07）；K 定稿与 spec 修订（08）。

## 关键文件与契约

- [docs/original/input/key-map.md](../../../../original/input/key-map.md)、[docs/original/formats/executable.md](../../../../original/formats/executable.md)、[docs/original/unknowns.md](../../../../original/unknowns.md)。
- 输入：`local/research/p3-05/flight/` 与 `local/research/p3-05/contexts/` 的摘要。
- 注意：executable 也被 P3-06、P3-07 分支修改，合并时按“一个事实一个位置”消解，不重复记录。

## 写入范围

- `docs/original/input/key-map.md`：按键事实。
- `docs/original/formats/executable.md`：代码地标。
- `docs/original/unknowns.md`：U-011。

## 验收标准

- [ ] Q-01、Q-02、Q-04 的结论都已入库，每条带置信度与证据；未确认项写明所缺证据。
- [ ] 仓库中没有原版码表原文、读数、反编译或原版文字；`pnpm check:compliance` 通过。
- [ ] U-011 的状态与剩余项准确；与 P3-06/P3-07 的冲突或交叉引用已注明。
- [ ] 相对链接与锚点可解析，`updated:` 已更新。

## 验证方法

- 逐条对照 01、02 的摘要；`pnpm check:compliance`；以脚本或人工检查改动文档的相对链接与锚点。

## 完成证据
