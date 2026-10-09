---
type: plan
status: active
phase: P3
task: "01"
subtask: "09"
updated: 2026-10-09
---

# 09 — 闭环中的自动视角

**契约来源：** [spec](../spec.md) 的 S-09、AC-12、AC-14；[视角范围](../spec.md#视角范围)、[缺省清单](../spec.md#缺省清单)的 G-08；技术决定 5。
**依赖：** 08。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **区分媒体与引擎相机：** 以 08 的媒体定类为准，对所选任务的玩家被毁、救援、停靠与 Warp，判断原版是否使用引擎内的非 F1 相机（至少高概率）。Smacker 过场中的画面不转为引擎相机需求。
- **结论：** 列出需要保留的非 F1 自动相机及其负责任务（P3-12，只为该自动流程实现，不开放为可选视角），或有依据说明不需要。B-002 与 B-005 的观察只在各自范围内使用，不互相外推；未能定类的必需画面不通过。
- **基准运行：** 由协调者用 Computer Use 在私有副本中观察上述流程；必要时用只读 Ghidra 追踪视角切换的代码。截图只在 `local/`。
- **键位文档：** 按 spec 的视角范围更新[键位文档 §7](../../../../engineering/keyboard-input.md#7-尚未实现的键盘能力)：F1 与 F1–F9 的拦截在 P3；F2–F9 视角在 P4；闭环自动相机（如需要）在 P3-12。写明页面层 `preventDefault` 不能保证拦截系统组合键，G-08 不解决 Alt+F4 风险。
- **记录：** 视角的观察写入相关行为文档（B-001、B-004、B-005），代码事实写入 executable（英文）。脚本与输出在 `local/research/p3-01/views/`。

## 不包含

- 相机的实现与 G-08 标注的实现：归 P3-05、P3-12、P3-13。
- F2–F9 视角与其他驾驶舱布局（U-029，P4）。

## 关键文件与契约

- 08 的完成证据；[键位表](../../../../original/input/key-map.md)、[B-002](../../../../original/behavior/B-002-practice-mode.md)、[B-005](../../../../original/behavior/B-005-campaign-rescue.md)；[键位文档](../../../../engineering/keyboard-input.md)。

## 写入范围

- `docs/original/behavior/B-001-strategic-map.md`：Warp 时的视角。
- `docs/original/behavior/B-004-base-communications.md`：停靠时的视角。
- `docs/original/behavior/B-005-campaign-rescue.md`：被毁与救援时的视角。
- `docs/original/formats/executable.md`：视角切换的代码事实（如有）。
- `docs/engineering/keyboard-input.md`：§7 的视角接入时机。
- `docs/original/formats/cockpit.md`：CCKD 组目录 +0x00 的含义（视角布局编号）。
- `docs/original/unknowns.md`：U-029、U-011 的线索（状态与负责阶段不改）。
- `local/research/p3-01/views/**`：研究脚本、私有运行目录与截图（被忽略）。

## 验收标准

- [ ] AC-12：所选任务的自动画面已区分媒体与引擎相机（至少高概率）；需保留的非 F1 自动相机与负责任务已列出，或有依据说明不需要；没有未定类的必需画面。
- [ ] 键位文档 §7 已按视角范围与浏览器限制更新，没有把观察外推为全程事实。
- [ ] 没有原版画面或文字；修改的文档 `updated:`、链接与锚点有效。

## 验证方法

- 私有基准运行的观察（任务身份依据写入证据）与必要的只读 Ghidra 追踪。
- 文档链接与锚点检查；键位文档与 spec 的视角范围逐条对照。不涉及浏览器。

## 完成证据
