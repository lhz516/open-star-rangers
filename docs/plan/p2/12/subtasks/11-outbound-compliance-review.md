---
type: plan
status: active
phase: P2
task: "12"
subtask: "11"
updated: 2026-10-07
---

# 11 — 产物出站能力审阅与来源/许可

**契约来源：** [spec](../spec.md) 的 S-07、[产物出站 API 清单](../spec.md#产物出站-api-清单)；AC-12、AC-13。
**依赖：** 22。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 依赖 22，使审阅对象是呈现修正之后的最终候选构建；之后若再有生产代码变化，由最终对齐判断是否重做。
- **出站能力审阅（AC-12）：** 构建当前候选（`pnpm build`），审阅全部页面与 Worker JavaScript 及其 source map 来源：
  - 检查 `fetch`、`XMLHttpRequest`、`WebSocket`、`EventSource`、`sendBeacon`、`importScripts`、WebRTC、WebTransport、Service Worker、cookie、导航与弹窗，以及 DOM/CSS 的资源 URL、表单与 link ping。字符串搜索只用于定位，须检查别名、属性访问与调用方的数据流。
  - 每处记录 chunk 文件名、API、来源模块、分类（应用自有、构建注入的辅助、依赖）与可达性理由：应用自有的数据外发调用为 0；正常的静态模块 Worker 与模块 URL 单列允许用途；依赖须写明是否可从实际调用到达、参数是否只是静态代码 URL。无法判断的路径记为证据缺口，不默认安全。
  - 定位辅助脚本放在被忽略的 `local/research/p2-12/outbound/`；它只读本项目的构建产物，不读原版数据。
- **来源、许可与原版隔离（AC-13）：**
  - `pnpm check:compliance` 通过，original 与 licenses 两类都完整且 0 条发现；
  - `dist/compliance-inventory.json` 中导入 Worker chunk 及其 map 已归属到来源模块；
  - 自 P1-12 审阅以来依赖集合未变：比较 `pnpm-lock.yaml` 与 P1-12 最终对齐提交（`e5383d8`）的差异，并核对 `THIRD-PARTY-NOTICES.txt`；
  - `git ls-files` 中没有 `local/` 路径、原版截图、采样或解码结果。
- 结论只作一次性审阅证据，不新增持久门禁（spec 技术决定 7）。

## 不包含

- 运行时网络审计（02、06–10）；CI 与持久合规门禁（P5）。
- 修改应用代码；发现可达的外发调用时按 spec 技术决定 15 回到责任任务并阻塞 AC-12。

## 关键文件与契约

- [cli.ts](../../../../../tools/compliance/cli.ts)、[build-plugin.ts](../../../../../tools/compliance/build-plugin.ts)（Worker 资产归属）、[distribution.ts](../../../../../tools/compliance/distribution.ts)；[工程约定的构建许可声明](../../../../engineering/README.md#构建许可声明)。

## 写入范围

- `local/research/p2-12/outbound/**`：定位辅助脚本与审阅明细（被忽略）。

## 验收标准

- [ ] AC-12：候选全部页面与 Worker chunk 的主动与被动出站路径都有来源、调用与数据流、用途结论；应用自有的数据外发调用为 0；没有可达且能携带本地资源外发的依赖调用；没有未判定路径被当作安全。
- [ ] AC-13：`pnpm check:compliance` 通过且两类 0 条发现；Worker chunk 与 map 已归属；依赖集合自 P1-12 未变、声明已核对；跟踪文件中没有原版内容或 `local/` 路径。
- [ ] 证据写明审阅的候选提交与构建指纹。

## 验证方法

- 命令输出与清单写入完成证据；清单只含本项目代码的位置与结论。
- 不涉及浏览器验证或原版对照。

## 完成证据
