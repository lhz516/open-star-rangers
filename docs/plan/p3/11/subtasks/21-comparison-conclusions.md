---
type: plan
status: active
phase: P3
task: "11"
subtask: "21"
updated: 2026-10-17
---

# 21 — 对照结论

**契约来源：** [spec](../spec.md) 的 S-11、AC-14、AC-15；[对照方法与判据](../spec.md#对照方法与判据)；07 定稿的 D-02。
**依赖：** 19, 20。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 D-02 判定 R-20、R-21、R-22：单次转移层（原版前态交给 Core 内部规则函数，后态比较）与默认步长连续层（19 的新版运行）分别报告；随机选择核对支持集与取模映射，不以少数样本证明分布。
- 逐分支覆盖矩阵：代码证据、Node 独立期望、已有/新取得的运行、判定（一致/不一致/blocked）与候选、内容身份。不一致回到研究或实现（交协调者新增修复子任务），不放宽判据。
- 原版事实写入 [B-003](../../../../original/behavior/B-003-campaign-flow.md) 与 [B-005](../../../../original/behavior/B-005-campaign-rescue.md) 的测量结果；按实际覆盖更新 [unknowns](../../../../original/unknowns.md) 的 U-031（只升级实得证据支持的部分），必要时更正 [executable](../../../../original/formats/executable.md)。

## 不包含

- 新的原版运行（20）；实现修复（另设子任务）。

## 关键文件与契约

- 19、20 的私有报告；[P3-01 对照方式与判定](../../01/spec.md#对照方式与判定)。

## 写入范围

- `local/research/p3-11/comparison/**`：比较脚本与私有结果。
- `docs/original/behavior/B-003-campaign-flow.md`：成功链结论。
- `docs/original/behavior/B-005-campaign-rescue.md`：救援与失败结论。
- `docs/original/unknowns.md`：U-031 等的状态更新。
- `docs/original/formats/executable.md`：运行发现的更正。

## 验收标准

- [ ] R-20 至 R-22 的离散与连续层各有结论；成功与失败可达性的证据链完整，或明确 blocked。（AC-15）
- [ ] B-003 不因决定而升级置信度；U-031 只升级实得证据支持的部分。（AC-14、AC-15）
- [ ] 没有原版内容、私有路径以外的读数或反编译输出进入受跟踪文件。

## 验证方法

- 比较脚本的期望独立于被测实现；结论逐项对照 D-02。
- 文档链接与元数据检查；`pnpm check:original`。

## 完成证据
