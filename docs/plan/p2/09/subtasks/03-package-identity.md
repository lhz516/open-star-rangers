---
type: plan
status: active
phase: P2
task: "09"
subtask: "03"
updated: 2026-10-05
---

# 03 — 包身份与生产转换器版本

**契约来源：** [spec](../spec.md) 的 S-07、AC-08（推导部分）；[包身份与转换器版本](../spec.md#包身份与转换器版本)。
**依赖：** 无。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **开始前核对：** 确认 P2-05、P2-06、P2-08 没有已落地的等价机制；若已有，按 S-07 对齐为一份，并在证据中说明。
- **`ManifestIdentity` 推导：** 在 `content/` 新增纯函数，输入为：
  - 身份基础：schema 版本、切片 ID、切片定义版本、`ConverterVersion` 与来源（`ContentOrigin`）；
  - 作业产生的组草稿列表：每项为组名、按 Asset ID 升序的描述符（ID、kind、role、组、依赖、payload 身份）与来源状态集（或 null）。

  对输入做确定性的 ASCII 编码后计算 SHA-256，结果为 `manifest:sha256:<64 位小写十六进制>`，并通过 `readContentIdentity` 的 token 语法。组按 `RESOURCE_GROUPS` 顺序编码，与传入顺序无关；重复的组、未知组或格式错误的草稿以 `ContentContractError` 拒绝。
- **身份写入：** 提供把同一身份写入每个组清单的纯函数，输出 P2-01 `GroupInput` 形状（`{ manifest: { identity, group, assets }, payloads, sources }`）。返回值冻结，不改变调用者的草稿或 payload 视图的所有权。
- **生产转换器版本：** 在 `original-data/conversion/` 新增唯一的生产常量 `PRODUCTION_CONVERTER_VERSION`，值为符合 `readConverterVersion` 语法的 ASCII 标识，并注明任一生产转换器输出变化都要递增。
- **测试：** 相同输入结果相同；任一描述符字段、依赖、payload 身份、来源状态、`ConverterVersion`、来源类别或令牌变化，结果都不同；组的传入顺序不影响结果；结果能被 `readContentIdentity` 读取；写入身份后的每个组都能以合成内容通过 `validateGroup`。
- **文档：** 在[源码结构](../../../../engineering/source-structure.md#内容基础契约与切片定义)中记录推导函数、写入函数与生产常量的位置与用途。

## 不包含

- 作业中收齐全部组并统一写入身份（10）；`logic` 组的转换（09）。
- P2-10 缓存键的任何变化（spec 规定 `ManifestIdentity` 不入键）。

## 关键文件与契约

- **修改：** 无既有生产文件需要修改；必要时在 [contract-validation.ts](../../../../../src/content/contract-validation.ts) 复用既有错误码。
- **复用：** [content-identity.ts](../../../../../src/content/content-identity.ts)、[asset-contract.ts](../../../../../src/content/asset-contract.ts) 的 `RESOURCE_GROUPS` 与描述符读取、[source-state.ts](../../../../../src/content/source-state.ts)、[sha256.ts](../../../../../src/content/sha256.ts)。
- **计划新增：** `src/content/manifest-identity.ts` 及相邻测试；`src/original-data/conversion/converter-version.ts`。
- **测试支持：** [synthetic-content.test-support.ts](../../../../../src/content/synthetic-content.test-support.ts) 的合成组。

## 验收标准

- [x] AC-08（推导部分）：确定性、敏感性、组顺序无关与 token 语法测试全部通过；写入身份后的合成组通过 `validateGroup`，全包以同一身份通过 `validatePackage`。
- [x] `PRODUCTION_CONVERTER_VERSION` 在生产代码中只有一个定义（源码搜索证据）；常量通过 `readConverterVersion`。
- [x] 推导与写入函数位于 `content/`，不导入 `original-data`；`pnpm exec vitest run src/content tools/engineering-boundaries.test.ts`、`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- 表驱动 Node 测试；源码搜索 `PRODUCTION_CONVERTER_VERSION` 与 `converterVersion:` 的生产定义。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。
- 不适用 browser-testing。

## 完成证据

- **开始前核对：** `node tools/task-state.ts p2/05`、`p2/06`、`p2/08` 都输出 `generate-spec`；`src` 中没有已落地的 manifest 身份推导或生产转换器版本，无需对齐。
- **实现：**
  - [manifest-identity.ts](../../../../../src/content/manifest-identity.ts)：`deriveManifestIdentity`、`applyManifestIdentity`、`GroupDraft`、`IdentifiedGroup`；
  - [content-identity.ts](../../../../../src/content/content-identity.ts)：`readContentIdentityBasis` 与 `ContentIdentityBasis`；`readContentIdentity` 的检查顺序与输出不变；
  - [manifest.ts](../../../../../src/content/manifest.ts)：`readAssetDescriptors`；
  - [converter-version.ts](../../../../../src/original-data/conversion/converter-version.ts)：`PRODUCTION_CONVERTER_VERSION`。

  编码为带版本前缀的紧凑 JSON 文本，只含整数与读取器限定的 ASCII 令牌；组按 `RESOURCE_GROUPS` 排序。推导不读取 payload。写入返回冻结副本，只共享 payload 字节视图。
- **测试：** `pnpm exec vitest run src/content src/original-data/conversion` 368 个测试通过。其中 [manifest-identity.test.ts](../../../../../src/content/manifest-identity.test.ts) 覆盖：
  - **确定性与令牌：** 结果确定，符合 `manifest:sha256:` 格式并能被 `readContentIdentity` 读取；
  - **固定向量：** 版本 1 编码的固定向量，另用 Python 按同一布局独立计算核对，锁定包括 kind 在内的全部字段位置；
  - **组顺序无关；**
  - **敏感性（20 项变化都改变结果）：** Asset ID、role、描述符组、依赖增删、payload schema 版本、长度、指纹、Asset 或组的增删、来源状态、状态 Asset ID、U 项、状态指纹、来源集为 null、转换器版本、切片定义版本、来源指纹、来源类别、合成 fixture 令牌；
  - **拒绝：** 空列表、重复组、未知组、未知字段、错误 Asset ID、降序 Asset、错误来源状态，以及身份基础中多出 `manifestIdentity`、错误转换器版本或不支持的 schema；
  - **写入：** 四组按定义顺序得到同一身份，各组 `validateGroup` 为 `group-complete`，`validatePackage` 为 `complete` 且身份一致；结果冻结；调用者草稿不变，之后修改草稿不影响结果；payload 字节为同一视图；已转移的 payload 以调用者草稿序号报 `payload-detached`。

  [converter-version.test.ts](../../../../../src/original-data/conversion/converter-version.test.ts) 证明常量能作为身份基础的转换器版本。
- **源码搜索：** `grep -rn "PRODUCTION_CONVERTER_VERSION\s*[:=]" src --include=*.ts` 排除测试后只有 `converter-version.ts` 一处定义；生产代码中没有其他转换器版本字面量。
- **边界与工程检查：**
  - `content/` 不导入 `original-data`，由 `pnpm lint` 与边界回归覆盖，均通过；
  - `pnpm typecheck` 通过；
  - `pnpm check` 通过：97 个测试文件、2834 个测试与生产构建。
- **rubber-duck：** 无阻塞。唯一意见是 AC-08 敏感性覆盖不全：缺少来源状态 ID、合成 fixture 令牌与 kind 位置。已采纳，新增两项变化测试与固定向量。
- **simplify（四个角度）：**
  - **已采纳：**
    - 推导只读身份相关字段，payload 只在写入时读取；
    - 推导与写入共用一个准备步骤，用 `Map` 代替重复过滤；
    - 写入返回带类型的 `IdentifiedGroup`，测试去掉强制转换；
    - 测试改用 `toThrowError(objectContaining)`；
    - 转换器版本测试改为有意义的身份基础核对。
  - **未采纳：**
    - 把 `readAssetDescriptors` 移到 asset-contract：它与 `visitGroupManifest` 共用排序码；
    - 流式哈希与把编码器移到各契约旁：规模有界，固定向量已锁定编码；
    - 在完整性验证中跳过重复读取：验证边界按设计重新读取。
- **文档影响：** 已更新[源码结构](../../../../engineering/source-structure.md#内容基础契约与切片定义)：目录树、身份基础读取、`readAssetDescriptors`、推导与写入、生产转换器版本。工程约定、工具指南与 STATUS 无需更新：没有新命令、检查规则或阶段变化。
