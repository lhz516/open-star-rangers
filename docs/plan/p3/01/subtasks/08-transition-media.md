---
type: plan
status: active
phase: P3
task: "01"
subtask: "08"
updated: 2026-10-08
---

# 08 — 衔接媒体

**契约来源：** [spec](../spec.md) 的 S-07、AC-11、AC-14；[衔接媒体](../spec.md#衔接媒体)、[缺省清单](../spec.md#缺省清单)的 G-02、[标注规则](../spec.md#标注规则)。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **静态：** 用只读 Ghidra 分析过场播放器 `0x39f34`、它的 12 字节表与调用它的流程，找出闭环各衔接播放的 Smacker 文件（按 [manifest](../../../../original/manifest.md) 的文件名）与播放条件；同时确认哪些衔接是引擎内画面。
- **衔接逐条记录：** 出发（L-02）、入港与离港（L-08）、Warp 的开始与结束（L-07）、任务结束（L-09）、玩家被毁与救援（L-09）。每条写明：入口与出口状态、媒体类型（Smacker 文件名、引擎内画面，或两者先后）、触发时机、输入门禁、过场期间模拟是否推进、原版是否允许跳过，以及 G-02 项目占位与原版的区别。原版跳过能力不能只凭新战役介绍外推。
- **基准运行：** 由协调者用 Computer Use 在私有副本中观察所选任务的这些衔接，核对静态结论与跳过行为；参考视频只作线索。截图只在 `local/`。
- **G-02 实例：** 列出 G-02 的全部实例、前后状态与下游负责任务；引擎内画面不是缺省，交 P3-09、P3-10、P3-11、P3-12、P3-13 实现。救援画面的归属（Smacker 或引擎内）必须定类。
- **阻塞：** 必需衔接的媒体归属或逻辑语义缺失时本项 blocked，写明缺口与恢复条件。
- **记录：** 代码事实写入 executable（英文）；衔接的观察写入相关行为文档（B-001 的 Warp、B-003 的出发与结束、B-004 的停靠、B-005 的救援）；U-010 的媒体部分更新，负责阶段不改。脚本与输出在 `local/research/p3-01/transitions/`。

## 不包含

- Smacker 解码、帧处理与播放器实现（ADR-0005，P4）。
- 精确时长与完整衔接规则：归下游负责任务。
- 自动相机的归属：归 09（依赖本项的媒体定类）。

## 关键文件与契约

- [executable §4](../../../../original/formats/executable.md#4-code-landmarks)（`0x39f34`）；[manifest](../../../../original/manifest.md) 的 `FLICS/`；[B-001](../../../../original/behavior/B-001-strategic-map.md)、[B-003](../../../../original/behavior/B-003-campaign-flow.md)、[B-004](../../../../original/behavior/B-004-base-communications.md)、[B-005](../../../../original/behavior/B-005-campaign-rescue.md)；[unknowns](../../../../original/unknowns.md) 的 U-010。

## 写入范围

- `docs/original/formats/executable.md`：过场播放与衔接的代码事实。
- `docs/original/behavior/B-001-strategic-map.md`：Warp 衔接。
- `docs/original/behavior/B-003-campaign-flow.md`：出发与任务结束衔接。
- `docs/original/behavior/B-004-base-communications.md`：入港与离港衔接。
- `docs/original/behavior/B-005-campaign-rescue.md`：被毁与救援衔接。
- `docs/original/unknowns.md`：U-010 的媒体部分（负责阶段不改）。
- `local/research/p3-01/transitions/**`：研究脚本、Ghidra 输出、私有运行目录与截图（被忽略）。

## 验收标准

- [ ] AC-11：每条衔接的媒体类型、前后状态、输入与模拟推进、原版跳过能力与项目占位行为都有可引用依据（至少高概率）与负责任务。
- [ ] G-02 实例齐全；没有用缺媒体隐藏逻辑变化，也没有把引擎内过程归为过场；救援画面已定类。
- [ ] U-010 已更新，负责阶段未改；必需归属缺失时本项 blocked。
- [ ] 没有反编译代码、原版文字或画面；修改的文档 `updated:`、链接与锚点有效。

## 验证方法

- 只读 Ghidra 的表与调用分析；私有基准运行的观察（任务身份依据写入证据）。
- 文档链接与锚点检查。不涉及浏览器。

## 完成证据
