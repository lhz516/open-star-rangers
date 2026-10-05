---
type: plan
status: active
phase: P2
task: "04"
subtask: "05"
updated: 2026-10-05
---

# 05 — 组结果接收、验证与移交

**契约来源：** [spec](../spec.md) 的 S-06，S-08 的部分；[组结果的验证顺序](../spec.md#组结果的验证顺序)、[作业持有者](../spec.md#作业持有者)中的 `takeGroups` 与快照；技术决定 5、6；AC-06。
**依赖：** 04。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 `src/app/import/import-job-owner.ts` 中按 spec 的六步处理 `group` 消息：
  - **消息外层与顺序：** 已由 04 实现。
  - **来源绑定：** `sources.sourceFingerprint` 须等于已识别指纹，否则报 `invalid-result@groups.<组>`。
  - **内容验证：** 用 `validateGroup(CLASSIC_P2_SLICE, input)` 重新验证。
  - **组一致：** 结果中可读的组须等于消息的 `group`，否则报 `protocol-error@message.group`。
  - **记录：**
    - `group-complete` 连同 payload 保留，`assets` 为已验证的描述符个数；
    - `incomplete` 只保留诊断，`assets` 为 null。

  任何不予保留的组，其 payload 引用立即释放。
- **`finished`：** `finished.groups` 须与实际收到的组完全一致（顺序与集合），否则报 `protocol-error`。
- **快照：** `running` 与 `finished` 的 `groups` 项为 `{ group, status, assets, diagnostics }`，不含 `Uint8Array`。`failed` 与 `cancelled` 不含来源身份与组。
- **`takeGroups()`：**
  - 只在 `finished` 后返回一次完整的组 `{ group, manifest, payloads, sources }`，容器冻结，payload 视图归调用者独占；
  - 之后持有者不再引用它们；
  - 再次调用、释放之后、开始新作业之后，以及非 `finished` 状态，都返回 null。
- **测试：** 扩展 `src/app/import/import-job-owner.test.ts`。合成四组由 [synthetic-content.test-support.ts](../../../../../src/content/synthetic-content.test-support.ts) 的 `syntheticGroup` 生成，其清单来源与来源状态集都绑定识别出的合成指纹。
- **文档：** 在[源码结构](../../../../engineering/source-structure.md)的 `app/import/` 条目中补充组结果的验证顺序与移交规则。

## 不包含

- 全包判定与“资源可用”状态（P2-11）；缓存写入（P2-10）。
- 跨线程转移（[07](./07-node-integration.md)）。

## 关键文件与契约

- **修改：** 04 新增的 `src/app/import/import-job-owner.ts` 及其测试。
- **复用：** [completeness.ts](../../../../../src/content/completeness.ts) 的 `validateGroup`（格式错误时返回 `incomplete`、`group: null`，不抛出），以及 [slice-definition.ts](../../../../../src/content/slice-definition.ts) 的 `CLASSIC_P2_SLICE`。

## 验收标准

- [ ] AC-06 结果：
  - 绑定已识别指纹的合成四组都记为 `group-complete`；
  - 篡改一个 payload 的组记为 `incomplete`，带 P2-01 诊断，持有者不再引用它的 payload；
  - 指纹不符时报 `invalid-result@groups.<组>`；
  - `audio` 内容以 `models` 发送时报 `protocol-error@message.group`；
  - `identified` 之前的组、重复的组、外层缺字段或多字段，以及与实际不一致的 `finished.groups`，都报 `protocol-error`；
  - 清单无法读取、来源状态集格式错误、内层有多余字段，都记为 `incomplete`，`assets` 为 null。
- [ ] AC-06 移交：`takeGroups` 只在 `finished` 后返回一次；再次调用、释放之后或开始新作业之后都返回 null。
- [ ] AC-06 快照：任何快照都不含 `Uint8Array`；`failed` 与 `cancelled` 不含来源身份与组。
- [ ] `pnpm exec vitest run src/app/import`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试，使用假端口：深度遍历快照，确认没有 `Uint8Array`。payload 已释放由 `takeGroups` 返回 null 与快照不含字节证明，不依赖观测垃圾回收。
- 不适用 browser-testing；浏览器中的四组转移见 [09](./09-browser-worker-paths.md)。

## 完成证据
