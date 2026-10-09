---
type: plan
status: active
phase: P3
task: "01"
subtask: "11"
updated: 2026-10-08
---

# 11 — 运行时测量指南与命令入口

**契约来源：** [spec](../spec.md) 的 S-05、S-11、AC-09、AC-14；[运行时测量](../spec.md#运行时测量)的指南部分。
**依赖：** 02, 07。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **新建指南** `docs/guides/runtime-measurement.md`（中文，guide front matter），按 02 的实际工具与 07 的实际合格运行编写，覆盖：
  - 场景的进入与配置记录（Computer Use 的使用、难度与僚机、私有配置与 cycles）；
  - 工具用法（命令行、配方与报告的位置、退出码与原因码）；
  - 读数的合格条件；
  - 计时：游戏计时与独立参考钟的区分、暂停排除与误差预算；
  - 私有目录中的 Capture 截图与录像；
  - 样本与容差的记录格式（与[行为模板](../../../../original/behavior/_template.md)一致）；
  - 原版文件保护与意外变化时的处理（不自动还原）；
  - 证据的存放与自有资源的清理；同一时间只有一个会话操作基准环境。
- **链接：** 从[原版证据获取](../../../../guides/original-evidence.md)、[基准环境](../../../../guides/baseline-environment.md)、[工具用法](../../../../guides/tools.md)与[文档地图](../../../../README.md)链接新指南。
- **命令表：** 在 [AGENTS.md](../../../../../AGENTS.md) 与[工程约定](../../../../engineering/README.md)的命令部分加入 `python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'`，注明不属于 `pnpm check`。
- 指南只写方法与规则，不复制原版事实（链接 `docs/original/`），不含读数或截图。

## 不包含

- 工具功能本身（01、02）与时基结论（06、07）。
- `docs/engineering/slice-gaps.md`：由首个实现缺省的下游任务新建。

## 关键文件与契约

- 计划新增：`docs/guides/runtime-measurement.md`。
- 修改：`docs/guides/original-evidence.md`、`docs/guides/baseline-environment.md`、`docs/guides/tools.md`、`docs/README.md`、`AGENTS.md`、`docs/engineering/README.md`。

## 写入范围

- `docs/guides/runtime-measurement.md`：新建的指南。
- `docs/guides/original-evidence.md`：链接新指南。
- `docs/guides/baseline-environment.md`：链接新指南。
- `docs/guides/tools.md`：工具用法与链接。
- `docs/README.md`：文档地图条目。
- `AGENTS.md`：命令表。
- `docs/engineering/README.md`：命令表。

## 验收标准

- [ ] AC-09：指南覆盖 spec 列出的全部内容，与 02 的工具和 07 的实际运行一致；由原版证据获取、基准环境、工具用法与文档地图链接。
- [ ] AGENTS.md 与工程约定的命令表列出工具测试命令，并注明不属于 `pnpm check`。
- [ ] 指南不含原版内容、读数或私人绝对路径；修改的文档 `updated:`、链接与锚点有效。

## 验证方法

- 按指南复述 07 的合格运行步骤，核对无遗漏或与工具不符之处。
- 文档链接、锚点与 front matter 检查。不涉及浏览器或基准运行。

## 完成证据
