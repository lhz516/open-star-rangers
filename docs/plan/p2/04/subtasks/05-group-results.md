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

- [x] AC-06 结果：
  - 绑定已识别指纹的合成四组都记为 `group-complete`；
  - 篡改一个 payload 的组记为 `incomplete`，带 P2-01 诊断，持有者不再引用它的 payload；
  - 指纹不符时报 `invalid-result@groups.<组>`；
  - `audio` 内容以 `models` 发送时报 `protocol-error@message.group`；
  - `identified` 之前的组、重复的组、外层缺字段或多字段，以及与实际不一致的 `finished.groups`，都报 `protocol-error`；
  - 清单无法读取、来源状态集格式错误、内层有多余字段，都记为 `incomplete`，`assets` 为 null。
- [x] AC-06 移交：`takeGroups` 只在 `finished` 后返回一次；再次调用、释放之后或开始新作业之后都返回 null。
- [x] AC-06 快照：任何快照都不含 `Uint8Array`；`failed` 与 `cancelled` 不含来源身份与组。
- [x] `pnpm exec vitest run src/app/import`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试，使用假端口：深度遍历快照，确认没有 `Uint8Array`。payload 已释放由 `takeGroups` 返回 null 与快照不含字节证明，不依赖观测垃圾回收。
- 不适用 browser-testing；浏览器中的四组转移见 [09](./09-browser-worker-paths.md)。

## 完成证据

- **实现：** [import-job-owner.ts](../../../../../src/app/import/import-job-owner.ts) 的 `#receiveGroup` 按 spec 顺序处理：
  - 识别之后、每组一次；
  - `sources.sourceFingerprint` 等于已识别指纹，否则报 `invalid-result@groups.<组>`；
  - `validateGroup(CLASSIC_P2_SLICE, input)`；可读的组等于消息的组，否则报 `protocol-error@message.group`；
  - 完整的组连同 payload 放入作业的 `kept`，摘要的 `assets` 为描述符个数；不完整的组只留摘要与诊断。

  其余改动：
  - `finished.groups` 与收到的组逐项比较，不一致时报 `protocol-error@message.groups`。
  - 作业以任何方式结束都清空 `kept`。完成时，结果移入新的列表，所有容器递归冻结（跳过 payload 视图，按已访问集合防止重复），在端口终止之后与 `finished` 快照一起发布。
  - `takeGroups()` 只在 `finished` 时返回一次。开始新作业与释放都丢弃未移交的结果。
  - [synthetic-content.test-support.ts](../../../../../src/content/synthetic-content.test-support.ts) 新增 `syntheticSourceGroup(group, sourceFingerprint)`，`syntheticOriginalGroup` 改为调用它；保持单参数，因为既有调用写作 `.map(syntheticOriginalGroup)`。
- **测试：** [import-job-owner.test.ts](../../../../../src/app/import/import-job-owner.test.ts) 的 “group results” 共 24 项，全文件 79 项，`pnpm exec vitest run src/app/import` 通过。
  - **结果：**
    - 绑定已识别指纹的四组都记为 `group-complete`，`assets` 分别等于合成描述符个数；运行中的快照逐组增加摘要；
    - 改动 `models` 一个 payload 字节后该组记为 `incomplete`，诊断为 `payload-mismatch@payloads[0]`，移交只含 `audio`；
    - 以下 4 种组记为 `incomplete`，`assets` 为 null，带诊断，作业继续并以 `finished` 结束，移交为空：清单为 null、来源状态集的 `states` 格式错误、来源状态集多余字段、清单多余字段。
  - **失败（9 种）：** 都使作业失败，快照只有 `status, jobId, stage, error`，`takeGroups` 为 null，端口终止一次，不含标记：
    - 他源指纹与非指纹字符串，报 `invalid-result@groups.audio`；
    - `audio` 内容以 `models` 发送，报 `protocol-error@message.group`；
    - 缺 `sources`（`message.input.sources`）、`input` 多余字段（`message.input`）、消息多余字段（`message`）；
    - `finished.groups` 顺序不同、缺少一组、多出一组（都在 `message.groups`）。

    识别前的组与重复的组已由 04 覆盖。
  - **移交：**
    - `takeGroups` 只在 `finished` 后返回一次：组与 payload 记录为同一引用，所有容器深度冻结；
    - 首个容器已被浅冻结时，其子数组也被冻结；
    - 端口的 `terminate` 中调用返回 null，`finished` 订阅者取得结果，再次调用返回 null；
    - 以下情况都返回 null：`idle`、`starting`、`running`、`cancelled`、`failed`、开始新作业之后、释放之后。
  - **快照：** 任何快照都不含 `Uint8Array`，且全部深度冻结。
- **变异检查：** 以下 18 项变异都至少使 1 项测试失败：
  - 来源绑定、组一致、只保留完整的组；
  - `assets` 计数与不完整的诊断；
  - 重复组；`finished.groups` 的顺序与长度；
  - 冻结与递归冻结（含已冻结的父容器）；
  - 结果的设置、清空、移交与开始/释放时的丢弃；
  - 运行与结束快照中的组，以及验证输入。

  “在终止后发布”与“`takeGroups` 按状态把关”两项防护各自单独去掉时测试仍通过，因为另一项仍能阻止提前移交；两项同时去掉时，终止中的调用测试失败。
- **检查：** `pnpm check`（91 个文件、2659 项测试、构建）、`pnpm check:original`（passed）与文档链接检查都通过。
- **Rubber-duck：**
  - **阻塞问题 1：** 结果在端口终止之前发布，`terminate()` 若重入就可能在 `running` 时取走结果。已改为终止之后与快照一起发布，`takeGroups` 另按 `finished` 把关，并补测试。
  - **阻塞问题 2：** `#results` 与作业的 `kept` 是同一数组，失败、取消与释放时也不清空，payload 引用未真正移交或丢弃。已改为结束时清空 `kept`，完成时移入新的列表。
  - **非阻塞：** 冻结在遇到已冻结的容器时停止递归。已改为总是递归，并补测试。
- **Simplify：**
  - **已采纳：** 冻结检查复用测试中的 `isDeepFrozen`（豁免 payload 视图）；合并重复的订阅者移交测试。
  - **未采纳：**
    - 合并 `groups` 与 `kept`：两者生命周期不同，摘要留在快照中，payload 在结束时释放；
    - 测试用 `diagnosticCodes`：它的类型是完整性结果，不接受摘要；
    - 免去主线程的重复哈希：spec 技术决定 5 要求接收方重新验证；
    - 把冻结移到 `content/`：会改变已批准的 P2-01 接口。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md)的作业持有者条目新增组结果与移交，释放说明补充丢弃结果；合成内容包说明补充 `syntheticSourceGroup`。工程约定没有需要更新的规则或命令；STATUS 不变。

