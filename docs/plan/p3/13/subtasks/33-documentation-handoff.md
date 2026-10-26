---
type: plan
status: active
phase: P3
task: "13"
subtask: "33"
updated: 2026-10-25
---

# 33 — 模块文档与 P3-14/P3-15 交接

**契约来源：** [spec](../spec.md#验收标准) 的 S-14，AC-20/24。
**依赖：** 32。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 对实际API同步render/app/ui/core/content分册、结构、输入/ready、G-03/G-05与导入版本说明；规划路径改为真实落点。
- 交P3-14实际共享模型读者/顺序/生命周期证据，交P3-15真实闭环、尚需联合复验及本任务明确限制。
- 对照S/AC与代码/证据，清理过时“待P3-13”标注，不删除仍真实存在的音效/媒体缺省。

## 不包含

不维护另一份执行tracker，不修改STATUS/phase tasks或旧评审，不宣称P3退出。

## 关键文件与契约

- [source-structure](../../../../engineering/source-structure.md)、[slice-gaps](../../../../engineering/slice-gaps.md)。
- 08/09的实际合同、32判定与27–29浏览器证据。

## 写入范围

- `docs/engineering/modules/render.md`：绘制API。
- `docs/engineering/modules/app.md`：Runtime/装配。
- `docs/engineering/modules/ui.md`：基地桥接/反馈。
- `docs/engineering/modules/core.md`：只读事实。
- `docs/engineering/modules/content.md`：payload与版本。
- `docs/engineering/source-structure.md`：目录与所有权。
- `docs/engineering/README.md`：受影响检查/模块边界。
- `docs/engineering/keyboard-input.md`：右键/资格/恢复。
- `docs/engineering/slice-gaps.md`：标注状态。
- `docs/guides/local-import.md`：新导入与真实功能入口。

## 验收标准

- [ ] 每个API/命令/字段/路径与实际实现一致，来源事实链接不重复转抄。
- [ ] 与P3-14/P3-15交接分清已验证、外部前提与联合范围。
- [ ] 链接/日期/元数据正确，没有残留无依据的在制或已完成声明。

## 验证方法

文档对实际导出/入口与证据逐项核对，链接/metadata检查；文档-only不运行无关构建。

## 完成证据
