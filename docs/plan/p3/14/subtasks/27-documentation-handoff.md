---
type: plan
status: active
phase: P3
task: "14"
subtask: "27"
updated: 2026-10-28
---

# 27 — 工程说明、检查与 V-06 交接

**契约来源：** [spec](../spec.md#验证策略) 的 S-10、AC-01、AC-13、AC-15、AC-16。
**依赖：** 21, 23。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 汇总 app 的触发/账本/所有权、platform 参数与进度、Core 输出/版本、render 的表现接口增补（DW-02，无共享 HUD 读模型）、UI 状态/日志与浏览器边界说明；原版事实只链接 audio。
- 同步源码结构、输入/本地导入指南和受影响缺省说明，不以音效交付声称其他缺失功能完成。
- 给 P3-15 提供 V-06 逐项结论、参考/候选身份、置信度和残留差异的链接；声明受共享契约变化影响而需重验的历史项，不改写旧通过证据。
- 在集成候选上核对 pnpm check、合规和本任务相关 E2E；缺口形成修复任务，不在文档项新增功能。

## 不包含

- 不作 P3 退出评审、不改 STATUS/tasks/goal tracker，不生成新独立审阅报告，不发布或推送。

## 关键文件与契约

- 现有工程 modules/app、platform、core、render、ui 分册、source-structure、keyboard-input、slice-gaps 与 local-import。
- 21–26 的证据是输入；本项完成证据保存交接目录和工程检查结果。

## 写入范围

- `docs/engineering/modules/app.md`：消费者接口与交接。
- `docs/engineering/modules/platform.md`：播放器能力及错误。
- `docs/engineering/modules/core.md`：只读输出与版本。
- `docs/engineering/modules/render.md`：D2-05 的表现接口扩展与 P3-14 交接（无共享 HUD，D-02 修订）。
- `docs/engineering/modules/ui.md`：状态/DEV 边界。
- `docs/engineering/source-structure.md`：实际模块落点。
- `docs/engineering/keyboard-input.md`：激活与焦点说明。
- `docs/engineering/slice-gaps.md`：受影响说明，不扩张 G-05。
- `docs/guides/local-import.md`：声音状态与操作。

## 验收标准

- [ ] 接口、版本、错误、释放和缺省说明与实际实现一致，updated 与链接正确。
- [ ] V-06 自动/感知结论可追溯，研究置信度和实施验收分开；历史重验范围明确。
- [ ] 集成候选的工程/合规/相关浏览器检查通过，无本任务未处理的功能或证据缺口。

## 验证方法

- `pnpm check`、`pnpm check:compliance`；运行 22/23 列出的相关 E2E，使用 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)核对记录适用性。
- 工程说明只记录当前接口，事实仍引用原版记录；检查仓库变更与原版隔离，不修改合同以适应失败结果。

## 完成证据
