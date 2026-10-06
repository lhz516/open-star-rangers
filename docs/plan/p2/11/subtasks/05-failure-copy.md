---
type: plan
status: active
phase: P2
task: "11"
subtask: "05"
updated: 2026-10-06
---

# 05 — 失败文案

**契约来源：** [spec](../spec.md) 的 S-02（失败反馈）、AC-04（Node），以及[失败反馈](../spec.md#失败反馈)。
**依赖：** 无。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新增纯模块（`src/ui/import/` 中），按来源、layer 与 code 选择固定的英文句子：
  - **启动规则：** `invalid-files`；
  - **作业：** disc、source、content、import 四层，按 spec 表中的类别归组；
  - **缓存：** P2-10 的 13 个码各一句；
  - **任务载入：** `CoreInputError` 与 `ContentContractError` 各一句。
- 未知 code 用所在层的默认句；层也未知时用全局默认句。
- 输出另带“技术细节”：layer、code、结构位置与限值（名称、限值、观察值）。不包含 `reason` 以外的宿主文本，不依赖 `reason` 分类。
- 表驱动 Node 测试：
  - 每个已列出的 code 得到所在类别的句子；
  - 每层的未知 code 得到该层的默认句；未知层得到全局默认句；
  - 技术细节的字段完整；
  - 输入中含 `MARKER` 的非结构字段不会出现在输出中。

## 不包含

- 页面布局与展示（06、07、11）。
- 面向发布的文案打磨与本地化（P5）。

## 关键文件与契约

- 计划新增 `src/ui/import/` 中的文案模块与相邻测试。
- 类型来源：[import-protocol.ts](../../../../../src/workers/import-protocol.ts) 的 `ImportErrorData` 与 `IMPORT_ERROR_LAYERS`；[resource-cache-contract.ts](../../../../../src/platform/storage/resource-cache-contract.ts) 的 `RESOURCE_CACHE_FAILURE_CODES`；04 的任务载入失败形状（类型可在本子任务先按 spec 定义，04 复用）。

## 验收标准

- [x] AC-04（Node）：每层每个列出的 code 得到正确类别；未知 code 与未知层得到默认句；技术细节完整。
- [x] 缓存的 13 个码各有一句，其中 `quota-exceeded`、`storage-unavailable`、`not-found` 的句子符合 spec 的说明。
- [x] 输出不含宿主错误文本或 `MARKER`。
- [x] `ui/` 不导入 `original-data`；`pnpm check` 通过。

## 验证方法

- `pnpm exec vitest run src/ui`，完成前 `pnpm check`。
- 浏览器部分见 07。完成前按 execute-goal 做 rubber-duck 与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **实现：** [failure-copy.ts](../../../../../src/ui/import/failure-copy.ts) 是纯文案模块：
  - **入口：** `startFailureCopy`、`jobFailureCopy`、`cacheFailureCopy`、`missionFailureCopy` 共用一张按层的类别表，返回 `{ category, message, details }`。
  - **类别：**
    - 启动规则：`file-rules`；
    - disc：`file-set`、`structure`、`limits`、`read-failed`；
    - source：`version`、`checks`、`limits`；
    - content：只有层默认句；
    - import：`worker-start`、`worker-stopped`、`internal`；
    - 缓存：13 个 code 各一类；
    - 任务载入：`core-input`、`content`。
  - **默认句：** 未知 code 用层默认句，未知层用全局默认句。
  - **技术细节：** 只取 layer、code、结构位置、固定原因与限值，缓存失败取第一条预算违规作为限值。
  - **特定句子：**
    - 启动规则的句子说明同名的 `.ccd` 与 `.img`、可选的 `.sub` 与 `.cue`、至多 4 个文件，以及名称至多 255 个 UTF-16 码元；
    - `quota-exceeded` 提示释放空间，`storage-unavailable` 说明资源只保存在当前页面，`not-found` 提示重新导入。
- **测试：** [failure-copy.test.ts](../../../../../src/ui/import/failure-copy.test.ts) 共 25 条。
  - **disc、source、import：** 期望表的类型分别为 `Record<DiscReadErrorData['code'], …>`、`Record<SourceErrorCode, …>` 与 `Record<ImportErrorCode, …>`，上游新增 code 时类型检查失败。每个 code 得到 spec 表中的类别，每个类别一句。
  - **content 与未知值：** content 的代表 code 都得到内容校验句；四层各自的未知 code 得到本层默认句，且与其他层不同；未知层得到全局默认句。
  - **缓存与任务载入：** 缓存的 13 个 code 各一句、互不相同；三个说明性句子符合 spec；第一条预算违规成为限值；任务载入的两类与未知类都附路径与原因。
  - **技术细节与隐私：** 技术细节字段完整；输入上带 `MARKER` 的 `message`、`stack`、文件名与限值的多余字段都不出现在输出中；`reason` 文本不影响分类；跨所有层没有两类共用一句。
- **检查：**
  - `pnpm exec vitest run src/ui/import`：25 条测试通过；
  - `pnpm check`：145 个文件 4,358 条测试，构建通过；
  - lint 确认 `ui/` 不导入 `original-data`。
- **Rubber-duck：** 没有阻塞问题。两项非阻塞问题已采纳：
  - 名称上限改为说明 UTF-16 码元；
  - disc 期望表改为覆盖 DTO 的全部 code（含四个预算形状 code），这些 code 明确归入层默认句。
- **Simplify：** 采纳五项：
  - 每层的类别改为声明式的 `{ message, codes }`，查找表由它派生；
  - `import` 层的内部类别由 `IMPORT_ERROR_CODES` 派生；
  - 缓存句子表的类型改为 `Record<ResourceCacheFailureCode, string>`，code 来自 `RESOURCE_CACHE_FAILURE_CODES`；
  - `FailureLayer` 改为模块私有；
  - 唯一性检查改为集合大小比较。

  未采纳：
  - 复用协议的 `readLimit`：它是私有的，并且对多余字段抛错，而此处须丢弃多余字段；
  - 删去尚无生产调用方的入口：07 使用它们；
  - 测试期望表与生产表的重复：期望表提供生产代码无法得到的类型完备性检查；
  - 启动文案的单例：开销可忽略。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md)的当前目录加入 `ui/import/`，新增“失败文案”一节。工程约定与 STATUS 无需改动。
