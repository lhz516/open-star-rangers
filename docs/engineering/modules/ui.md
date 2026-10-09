---
type: guide
status: active
phase: all
updated: 2026-10-08
related: [ADR-0015]
---

# UI 模块说明

本文件是[源码结构指南](../source-structure.md)的模块分册，记录 `src/ui/` 中已交付代码的当前 API 与契约要点。目录树、职责边界与 helper 归属以指南为准，行为契约以各任务 spec 为准；修改本模块代码的任务同步更新本文件。

P1-06 交付 `ui/game/` 的投影 store（Zustand vanilla，React 只取得只读句柄）、会话桥接（状态即时写入、10 Hz 投影采样）、命令反馈（Core 接受/拒绝、取消、故障未确认）、会话控制与 React selector hook，以及 `ui/dev/` 的合成开发面板；P1-08 交付 `ui/pages/` 的三个画面组件；`ui/render/` 的合成画面组件与开发面板的渲染诊断已接入页面。菜单、合成画面与开发面板都是工程原型，不是原版界面或飞行 HUD。

## 失败文案

[ui/import/failure-copy.ts](../../../src/ui/import/failure-copy.ts) 是 P2-11 的纯文案模块（[spec 失败反馈](../../plan/p2/11/spec.md#失败反馈)），由 Node 测试覆盖：

- **入口：** `startFailureCopy`、`jobFailureCopy`、`cacheFailureCopy`、`missionFailureCopy` 分别接收启动规则的 `invalid-files`、作业快照的 `ImportErrorData`、P2-10 的 `ResourceCacheFailure` 与任务载入失败。
- **返回：** `{ category, message, details }`。
  - `category` 为 `<层>/<类别>`；
  - `message` 是该类别固定的英文句子；
  - `details` 只含 layer、code、结构位置、失败自带的固定原因与限值（名称、限值、观察值；缓存失败取第一条预算违规）。输入上的其他字段一律丢弃，所以宿主文本与文件名不会进入输出。
- **分类：** 只按 layer 与 code，不依赖 `reason`。
  - 每层的未知 code 用该层的默认句，未知层用全局默认句；
  - `source` 层的默认句与“结构或转换校验”同句，对应 spec 的“其余 code”。
  - `ui/` 不能导入 `original-data`，所以 disc 与 source 的 code 以字面量列出；测试以 `Record<DiscReadErrorData['code'] | SourceErrorCode | ImportErrorCode, …>` 的期望表逐一核对，上游新增 code 时类型检查失败。`import` 层的内部错误类别由 `IMPORT_ERROR_CODES` 派生。
  - 缓存的 13 个 code 各有一句，句子表的类型为 `Record<ResourceCacheFailureCode, string>`。
