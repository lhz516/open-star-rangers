---
type: plan
status: active
phase: P2
task: "08"
subtask: "02"
updated: 2026-10-08
---

# 02 — 包级 manifest 身份计算

**契约来源：** [spec](../spec.md) 的 S-06（`ManifestIdentity` 部分）、S-12（本子任务部分），AC-06（身份格式、确定性与敏感性）；[包身份](../spec.md#包身份)、[技术决定](../spec.md#技术决定) 6。
**依赖：** 无。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **计算函数：** 在计划新增的 `src/content/manifest-identity.ts` 中提供纯函数。
  - **输入：**
    - 切片定义，取其 `sliceId` 与版本；
    - `schemaVersion`；
    - 包内各组的草稿：组名、按清单顺序排列的描述符，以及来源状态集或 null。
  - **输出：** `manifest:sha256:<64 位小写十六进制>`，且能通过 `readContentIdentity` 的令牌语法。
- **规范序列化：** 确定、无歧义。
  - **内容：** `sliceId`、`sliceDefinitionVersion`、`schemaVersion`；按 `CLASSIC_P2_SLICE.groups` 顺序列出的组；每组的组名、全部描述符（`id`、`kind`、`role`、`group`、依赖、payload 身份）、来源状态集（指纹，以及每项的 `id`、`state`、`unknowns`）。
  - **编码：** 每个字段带类型与长度前缀，或用等价方式防止拼接歧义；不依赖对象属性枚举顺序。
  - **排除：** payload 字节不进入序列化，payload 的变化经 payload 指纹体现。
- **输入校验：** 用 P2-01 的读取器（`readAssetDescriptor`、`readSourceStateSet`、`readResourceGroup`）读取输入，非法输入以 `ContentContractError` 失败；组不得重复，组序须为定义顺序的子序列。
- **哈希：** 复用 [sha256.ts](../../../../../src/content/sha256.ts)，不新增哈希实现。
- **测试：** 相邻的 `src/content/manifest-identity.test.ts`。
- **文档：** 在源码结构指南记录序列化规则与输出格式。

## 不包含

- 生产 `ConverterVersion` 的组成、作业中的调用与填入清单（06）。
- 音频组的描述符与来源状态的产生（04）。

## 关键文件与契约

- **计划新增：** `src/content/manifest-identity.ts` 与 `src/content/manifest-identity.test.ts`。
- **复用：** [asset-contract.ts](../../../../../src/content/asset-contract.ts)、[source-state.ts](../../../../../src/content/source-state.ts)、[content-identity.ts](../../../../../src/content/content-identity.ts)、[slice-definition.ts](../../../../../src/content/slice-definition.ts)、[sha256.ts](../../../../../src/content/sha256.ts)；既有导出不变。

## 验收标准

- [x] AC-06（格式）：结果匹配 `^manifest:sha256:[0-9a-f]{64}$`，能通过 `readContentIdentity` 的 `manifestIdentity` 读取。
- [x] AC-06（确定性）：相同输入两次计算结果相同；以不同属性插入顺序构造的等价输入，结果相同。
- [x] AC-06（敏感性）：以下每项单独变化都会改变结果：任一描述符字段（`id`、`kind`、`role`、`group`、依赖、payload 版本、长度、指纹）、来源状态值、U 项、来源指纹、组的集合（增删一组）、切片定义版本、`schemaVersion`。
- [x] 无歧义：构造两组拼接后文本相同、字段边界不同的输入，结果不同。
- [x] 非法输入（重复组、非定义顺序、非法描述符）以稳定 code 失败。
- [x] `pnpm exec vitest run src/content`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试，使用 [synthetic-content.test-support.ts](../../../../../src/content/synthetic-content.test-support.ts) 的合成描述符与来源状态，逐字段变异。
- 不适用浏览器或原版对照。
- 完成前按 execute-goal 流程，以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **实现：** [manifest-identity.ts](../../../../../src/content/manifest-identity.ts) 的 `computeManifestIdentity(definition, { schemaVersion, groups })`。组草稿 `{ group, assets, sources }` 用 P2-01 读取器读取：描述符经 [manifest.ts](../../../../../src/content/manifest.ts) 新导出的 `readManifestAssets`（`readGroupManifest` 改为复用它），来源状态集经 `readSourceStateSet`，`schemaVersion` 经 [content-identity.ts](../../../../../src/content/content-identity.ts) 新导出的 `readVersion`。规范序列化是带标签 `osr-manifest-identity-1` 的、位置固定的 JSON 数组，按 UTF-16LE 码元交给既有 `Sha256`。[contract-validation.ts](../../../../../src/content/contract-validation.ts) 新增 `duplicate-group`、`group-order`，协议测试的穷举记录同步。
- **测试：** [manifest-identity.test.ts](../../../../../src/content/manifest-identity.test.ts) 的 29 个用例：
  - **格式：** 结果匹配 `^manifest:sha256:[0-9a-f]{64}$`，并经 `readContentIdentity` 读取。
  - **固定值：** 固定输入的结果已钉住。该值另用 `node:crypto` 对同一 UTF-16LE JSON 文本独立计算，结果一致。
  - **确定性：** 两次计算相同；各层属性逆序插入的等价输入，结果相同。
  - **敏感性（16 项）：** 以下每项单独变化都改变结果：Asset ID、ID 连同 kind、role、描述符 group、依赖、payload 版本/长度/指纹、来源状态值、U 项、来源指纹、来源状态集的有无、删除一组、增加一组、`schemaVersion`、切片定义版本。kind 由 ID 首段决定，`readAssetDescriptor` 拒绝不一致，所以 kind 只能随 ID 一起变化。
  - **无歧义：** `sound/a`+`bc` 与 `sound/ab`+`c` 的结果不同；把描述符移到相邻组后，结果也不同。
  - **拒绝（9 项）：** 重复组为 `duplicate-group`，非定义顺序为 `group-order`；未知组、空组列表、kind 与 ID 不符、描述符乱序、非法来源状态、`schemaVersion` 0、多余字段，各以稳定的 code 与路径拒绝。
- **命令：** `pnpm exec vitest run src/content src/workers/import-protocol.test.ts`（580 通过）；`pnpm check` 通过（97 个测试文件、2,862 个测试，构建成功）。
- **rubber-duck：** 无阻塞、无非阻塞问题。
- **simplify：** 采纳两项：版本校验改为复用导出的 `readVersion`；测试改用仓库惯用的 `toThrowError(expect.objectContaining(...))`，去掉重复的辅助函数。效率与层次两个角度无发现。复跑检查通过。
- **文档影响：** 在[源码结构指南](../../../../engineering/modules/content.md#内容基础契约与切片定义)新增目录项与 `manifest-identity.ts` 一条（输入、序列化与输出），`manifest.ts` 一条补记 `readManifestAssets`，content-identity 一条改为指向身份生成者。工程约定无需修改。

- **后续修订：** 2026-10-05 按修订后的 spec，由 [14](./14-shared-mechanism-alignment.md) 改为与 P2-05、P2-09 共享的机制（见 [goal 执行记录](../goal.md#执行记录)）。身份输入增加 `ConverterVersion` 与来源，编码改为 ASCII，固定值随之更新。本条以上的证据记录的是本子任务完成时的状态。
