---
type: plan
status: active
phase: P2
task: "07"
subtask: "13"
updated: 2026-10-06
---

# 13 — 组装与发送 cockpit-hud-map 组

**契约来源：** [spec](../spec.md) 的 S-07，S-08 的作业限值；[组结果与包身份](../spec.md#组结果与包身份)、[行为与边界](../spec.md#行为与边界)中作业与持有者各行、[持久化与兼容](../spec.md#持久化与兼容)；技术决定 4、8；AC-06、AC-07 的作业部分、AC-08。
**依赖：** 04。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **组装（修改 [import-job.ts](../../../../../src/workers/import-job.ts)）：**
  - 保留图形步骤结果中的 `cockpit-hud-map` 分区，转为 `GroupDraft`（`assets` 为描述符，`sources` 为带已识别指纹的来源状态集）；`models` 组保持 P2-06 已落地的装配与发送；
  - 与 `logic`、`audio` 草稿一起交给 [manifest-identity.ts](../../../../../src/content/manifest-identity.ts) 的 `applyManifestIdentity`，身份基础为 `productionIdentityBasis`；
  - 全部组草稿、包身份、`checkPackageTransfers` 与结束用量在发送第一个组之前完成；发送顺序按 `main` 上的现有规则；第一个 `group` 之后没有进度；
  - 协议版本与阶段集合不变。
- **`ConverterVersion`（修改图形转换模块的 `GRAPHICS_CONVERTER_COMPONENT`）：** P2-06 已加入 `graphics-1`（2026-10-06 前提更新），本任务把它递增为 `graphics-2`，即 `osr-import.graphics-2.logic-1.audio-1.models-1`。其他组件不变。本任务后续的图形输出变化不再逐次递增（见 [goal](../goal.md#代码现状与前提)）。
- **在 12 之前完成时：** 生产图形步骤的 `cockpit-hud-map` 分区只有 P2-05 的调色板与字库（P2-06 的切片贴图在 `models` 分区），作业会发送一个角色不足的 `cockpit-hud-map` 组，持有者记为 `incomplete`（`role-cardinality`）。这是合规的中间状态；受影响的生产路径测试明确断言它，由 12 改为 `group-complete`。
- **测试（Node，使用结构化克隆端口与真实的宿主和持有者）：** 以合成的 `GraphicsStepInput`（合成映射与声明，满足 `cockpit-hud-map` 全部角色）运行作业，注入合成识别：
  - AC-06：发送的组含 P2-05 与本任务形状的 Asset，描述符、payload、来源状态按 ID 升序一一对应，payload 独占缓冲；持有者为 `group-complete`、外部要求为空，`takeGroups()` 在 `finished` 后返回；删去前视布局、删去全部 `strategic-map` Asset、删去全部 `hud-mfd` Asset → `role-cardinality`；把一个映射改为 `unconfirmed` → `source-not-ready`；`converterVersion` 含 `graphics` 组件且其他组件不变，能被 P2-01 读取器读取；同一作业各组的 `manifestIdentity` 相同，改变任一描述符、payload 身份或来源状态时身份改变；`cockpit-hud-map` 组不含 `models` 分区的 Asset，`models` 组仍按 P2-06 发送；
  - AC-07 的作业部分：作业限值为读取限值 + 图形份额 + 逻辑份额 + 模型份额（P2-06 已落地的组合）；超出 → `budget-exceeded`，带维度、`limit` 与 `observed`，不发送组；`finished.usage` 等于最终读取用量与各转换用量逐维之和；
  - AC-08：消息依次为识别进度、`identified`、各转换阶段进度、各组的 `group`（含 `cockpit-hud-map`）、`finished`；`readBytes` 不减少；识别、图形阶段读取、转换三类失败保持 P2-05 的层、code 与位置且不发送组；组草稿或结束用量校验失败不发送组；仿照 [import-pipeline.test.ts](../../../../../src/app/import/import-pipeline.test.ts) 的“发送后失败”用例，注入发送开始后的失败，持有者丢弃已收的组、`takeGroups()` 返回 null；图形阶段取消后状态为 `cancelled` 且不再改变。
  - 更新 [synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts) 与既有作业、管线测试中对组集合与身份的期望。
- **文档：** 源码结构“导入 Worker”一节记录 `cockpit-hud-map` 组的装配与新的 `ConverterVersion` 值。

## 不包含

- 生产声明、映射与份额：归 [12](./12-production-cockpit-hud.md)。
- 真实 Chromium Worker：归 [14](./14-browser-worker-group.md)。
- `models` 组的装配：归 P2-06。

## 关键文件与契约

- **修改：** [import-job.ts](../../../../../src/workers/import-job.ts)、[converter-version.ts](../../../../../src/original-data/conversion/converter-version.ts) 及其测试；图形转换模块（新增 `graphics` 组件常量）；[synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts)；[import-job.test.ts](../../../../../src/workers/import-job.test.ts)、[import-pipeline.test.ts](../../../../../src/app/import/import-pipeline.test.ts)。
- **不修改：** [import-protocol.ts](../../../../../src/workers/import-protocol.ts) 的版本与阶段、[import-host.ts](../../../../../src/workers/import-host.ts)、[import-job-owner.ts](../../../../../src/app/import/import-job-owner.ts) 的状态机。

## 验收标准

- [x] AC-06 全部条件通过。
- [x] AC-07 的作业部分通过。
- [x] AC-08 全部条件通过，包括发送后失败与取消。
- [x] `ConverterVersion` 为 `osr-import.graphics-2.logic-1.audio-1.models-1`（P2-06 已加入 `graphics-1`，本任务递增），已有组件不变；协议版本不变。
- [x] `pnpm typecheck`、`pnpm lint` 与 `pnpm test -- src/workers/ src/app/import/ src/original-data/conversion/` 通过；源码结构已更新。

## 验证方法

- Node 集成测试，使用 `MessageChannel` 与真实的宿主、持有者；只用代码生成的数据。
- 不涉及浏览器；真实 Worker 归 14。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **实现：**
  - [graphics-step.ts](../../../../../src/original-data/conversion/graphics-step.ts) 新增 `stepGroupDraft(group, results, sourceFingerprint)`：按 Asset ID 合并各步骤结果中该组的分区，语义与原 `modelsGroupDraft` 相同；`modelsGroupDraft` 改为对它的一行包装，P2-06 的调用者不变。
  - [import-job.ts](../../../../../src/workers/import-job.ts) 把图形步骤的 `cockpit-hud-map` 分区装配为组草稿，总是发送（没有 Asset 时为空组）。身份、转移列表与结束用量的校验都在第一个组之前完成。`applyManifestIdentity` 按 `RESOURCE_GROUPS` 排列各组，发送顺序为 `logic`、`models`、`cockpit-hud-map`、`audio`，即 `main` 上的现有规则。
  - `GRAPHICS_CONVERTER_COMPONENT` 递增为 `graphics-2`，`PRODUCTION_CONVERTER_VERSION` 为 `osr-import.graphics-2.logic-1.audio-1.models-1`；协议版本与阶段集合不变。
- **测试：** [synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts) 新增合成光盘 `cockpitCoveredFiles` 与图形输入 `cockpitGraphics`。`cockpit-hud-map` 分区经真实转换满足全部角色：前视布局恰 1 个，另有 `hud-mfd`、字库与 `strategic-map`；另带一个小的 `models` 分区，用来验证两组分开。
  - AC-06：管线测试“sends the complete cockpit-hud-map group apart from the models partition…”逐项核对：
    - 按 ID 升序、payload 独占缓冲；
    - `group-complete`、外部要求为空，`takeGroups()` 在 `finished` 后返回；
    - 版本含 `graphics-2`，各组身份相同；
    - 组内没有 `models` 分区的 Asset，`models` 组照常发送。

    “reports each missing role and an unconfirmed source…”（7 种）：删去前视布局、全部 `strategic-map` 或全部 `hud-mfd` → `role-cardinality`；`unconfirmed` → `source-not-ready`；改变描述符、payload 或来源状态 → 身份改变。作业测试另核对没有图形时发送空组。
  - AC-07：作业测试“limits the graphics step to the read limit plus the graphics, logic and model shares…”：恰等于限值时通过，超出 1 → `budget-exceeded`（维度、`limit`、`observed`），不发送组。`finished.usage` 等于读取用量加转换用量，由管线测试断言。
  - AC-08：
    - 消息顺序、`readBytes` 不减少、第一个组之后没有进度；
    - 识别、读取与转换失败（新增损坏的合成元素）保持层、code 与位置，不发送组；
    - 组草稿被拒（“fails before sending any group when a group draft is rejected”）与结束用量被拒不发送组；
    - 发送开始后失败，持有者丢弃已收的完整组，`takeGroups()` 返回 null；
    - 图形阶段取消后状态保持 `cancelled`。
  - 生产路径测试明确断言：在 12 之前，`cockpit-hud-map` 组只因 `role-cardinality` 而为 `incomplete`。
- **检查：**
  - `pnpm check` 通过（134 个文件、4026 个测试与构建）；
  - simplify 之后 `pnpm typecheck`、`pnpm lint` 与 `pnpm test -- src/workers/ src/app/import/ src/original-data/conversion/` 通过；
  - `OSR_E2E_DEV_PORT=4273 OSR_E2E_PREVIEW_PORT=4274 pnpm test:e2e e2e/import-worker.spec.ts --project=development` 15/15 通过；端口 4173 被其他工作树占用，所以改用其他端口。
- **rubber-duck：** 没有阻塞问题。两项非阻塞问题已采纳：spec 中 `ConverterVersion` 的当前值与递增规则改为 P2-06 落地后的值；共用限值的组合（含模型份额）与“`cockpit-hud-map` 分区只有 P2-05 调色板与字库”的措辞已在 spec、本子任务与源码结构中更正。
- **simplify：**
  - 已修正：管线测试只解析一次收到的清单；作业测试只构建一次合成光盘；未在外部使用的 `CockpitGraphicsChanges` 不再导出。
  - 跳过：
    - 把步骤结果类型与 `stepGroupDraft` 移到中立模块（P2-06 已把模型步骤结果定义为图形步骤的形状，移动超出本子任务）；
    - 删除 `modelsGroupDraft` 包装（保留 P2-06 的 API 名称）；
    - 把管线测试拆到更低层（AC-06 要求经真实宿主与持有者）；
    - 取消测试中 20 ms 的等待（沿用本文件的既有做法）。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md)已记录 `stepGroupDraft`、`cockpit-hud-map` 组的装配与发送顺序、新的 `ConverterVersion` 与合成夹具。spec 与 goal 的前提更新记录了 P2-06 落地后的变化。工具指南与 STATUS 不受影响。
