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

- [ ] AC-08（推导部分）：确定性、敏感性、组顺序无关与 token 语法测试全部通过；写入身份后的合成组通过 `validateGroup`，全包以同一身份通过 `validatePackage`。
- [ ] `PRODUCTION_CONVERTER_VERSION` 在生产代码中只有一个定义（源码搜索证据）；常量通过 `readConverterVersion`。
- [ ] 推导与写入函数位于 `content/`，不导入 `original-data`；`pnpm exec vitest run src/content tools/engineering-boundaries.test.ts`、`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- 表驱动 Node 测试；源码搜索 `PRODUCTION_CONVERTER_VERSION` 与 `converterVersion:` 的生产定义。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。
- 不适用 browser-testing。

## 完成证据
