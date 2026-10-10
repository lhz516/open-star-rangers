---
type: plan
status: active
phase: P3
task: "04"
subtask: "15"
updated: 2026-10-09
---

# 15 — 工程文档、缺省清单与退役记录

**契约来源：** [spec](../spec.md) 的 S-11（文档部分）、S-12、[文档影响](../spec.md#文档影响)、[缺省与标注](../spec.md#缺省与标注)、[合成演示退役](../spec.md#合成演示退役)的“文档与历史链接”；AC-19（文档）、AC-21，AC-18 的退役记录。
**依赖：** 13。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- [工程约定](../../../../engineering/README.md)：以正式 Runtime、会话、UI 桥接、任务流程与开发诊断取代“合成 Runtime”“会话端口与错误”“UI 投影与指令反馈”“合成渲染”“页面流转与演示生命周期”中的合成内容；E2E 与针对性检查命令同步（含新增与删除的用例）；记录生产缓存预置与测试入口新增查询键。
- 模块分册：[app](../../../../engineering/modules/app.md)、[ui](../../../../engineering/modules/ui.md)、[platform](../../../../engineering/modules/platform.md)、[render](../../../../engineering/modules/render.md)、[core](../../../../engineering/modules/core.md)（删除合成模块与 `osr/core-synthetic-boundary` 的说明；交接中 P3-04 一项改为指向已交付的接口与运行中衔接的下游责任）。
- [源码结构指南](../../../../engineering/source-structure.md)：当前目录与职责表；新增“P3-04 合成演示退役记录”：列出删除的路径、删除前最后一个包含它们的提交（取自 13 的完成证据）与替代模块，供 16 的历史链接指向。
- [键位文档](../../../../engineering/keyboard-input.md)：当前构建没有游戏键绑定（原版键位由 P3-05 加入）；占位的 Enter/Space/Esc 属于项目界面按键；保留平台键盘源的通用规则；§7 中的离页确认改为已实现。
- [本地导入指南](../../../../guides/local-import.md)：开始任务的条件与流程、缺省说明；[工具指南](../../../../guides/tools.md)：`tools/replay-check.ts` 的用法、文件上限、错误码与退出码。
- 计划新增 `docs/engineering/slice-gaps.md`：按 G ID 记录当前构建中 G-01、G-02/1、G-02/2、G-04、G-06（重开与返回）、G-07 的呈现方式与位置（含 `src/ui/mission/slice-gaps-copy.ts`），G-02 不计时与基准设置的差异并链接 Core 的已知差异；描述当前构建，不是任务状态表。加入[文档地图](../../../../README.md)。
- 每份改动文档更新 `updated:`。在基线上 P3-03 已同步的模块分册、源码结构指南、本地导入指南、工具指南与文档地图之上增量修改，保留其内容（例如 package-check 与重新导入的说明）。

## 不包含

- 历史任务文档、评审与 ADR 的链接改写（16）；`docs/plan/p3/tasks.md` 与 `docs/STATUS.md`（协调者）。

## 关键文件与契约

- 修改：上列 `docs/engineering/`、`docs/guides/` 文档与 `docs/README.md`；计划新增 `docs/engineering/slice-gaps.md`。

## 写入范围

- `docs/engineering/**`：工程约定、模块分册、源码结构指南、键位文档与新增的 `slice-gaps.md`。
- `docs/guides/local-import.md`：开始任务的说明。
- `docs/guides/tools.md`：replay 核对工具。
- `docs/README.md`：文档地图。

## 验收标准

- [ ] AC-21：[文档影响](../spec.md#文档影响)所列文档已同步，不再把合成演示写成当前构建的一部分；`updated:`、链接与锚点正确。
- [ ] AC-19（文档）：`slice-gaps.md` 按 G ID 与代码一致，含 G-02 差异。
- [ ] 退役记录列出删除路径、删除前提交与替代模块，锚点稳定。
- [ ] 文档链接与锚点检查通过；`pnpm check:compliance` 通过。

## 验证方法

- 本地链接与锚点检查（与 P3-01/P3-02 相同的检查脚本，放在 `local/` 或会话目录中运行）、`git diff` 审阅、`pnpm check:compliance`。
- 不适用浏览器与原版对照。

## 完成证据
