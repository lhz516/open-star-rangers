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

- [ ] AC-04（Node）：每层每个列出的 code 得到正确类别；未知 code 与未知层得到默认句；技术细节完整。
- [ ] 缓存的 13 个码各有一句，其中 `quota-exceeded`、`storage-unavailable`、`not-found` 的句子符合 spec 的说明。
- [ ] 输出不含宿主错误文本或 `MARKER`。
- [ ] `ui/` 不导入 `original-data`；`pnpm check` 通过。

## 验证方法

- `pnpm exec vitest run src/ui`，完成前 `pnpm check`。
- 浏览器部分见 07。完成前按 execute-goal 做 rubber-duck 与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
