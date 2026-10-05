---
type: plan
status: active
phase: P2
task: "09"
subtask: "07"
updated: 2026-10-05
---

# 07 — 条件交付：非封包参数 locator

**契约来源：** [spec](../spec.md) 的 S-12、AC-12；[非封包参数 locator](../spec.md#非封包参数-locator)。
**依赖：** 02。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **判定是否适用：** 依据 02 的结论。只有结论 1 且必需参数只存在于白名单覆盖的非 `.NOB` 文件时适用。不适用时，本子任务只在证据中记录 02 的结论与依据，不修改代码，然后完成。
- **适用时：**
  - 在 [source-mapping.ts](../../../../../src/original-data/source-mapping.ts) 为 `OriginalAssetLocator` 追加 `{ discPath, range: { offset, byteLength } }` 变体，`byteLength` 为 1–64；只允许 `data` 类 Asset 使用；已有封包条目 locator 的形状、排序、等价备选规则与校验不变；
  - 在 [verify-source-mappings.ts](../../../../../src/original-data/source/verify-source-mappings.ts) 经 `VerifiedSource.openFile` 读取并校验范围：`discPath` 必须是覆盖的非 `.NOB` 文件，范围位于文件之内；等价备选必须逐字节相同；
  - 按 02 的研究记录解释数值的类型与字节序，校验为有限值，交给 09 转换为 `StrategicMapFrame`；
  - 失败沿用 P2-03 的错误码与 `sources.mappings[i]…` 结构路径，不回显范围值或字节。
- **文档（适用时）：** 在[源码结构](../../../../engineering/source-structure.md#原版来源映射)中记录新变体与核验规则。

## 不包含

- 数值写入仓库：范围的偏移来自研究记录，数值本身只在导入时读取。
- 封包条目 locator 的任何行为变化；地图框架的规范化（09）。

## 关键文件与契约

- **修改（仅适用时）：** [source-mapping.ts](../../../../../src/original-data/source-mapping.ts)、[verify-source-mappings.ts](../../../../../src/original-data/source/verify-source-mappings.ts) 及其测试。
- **复用：** [identify-source.ts](../../../../../src/original-data/source/identify-source.ts) 的 `openFile`；P2-03 的合成光盘与白名单测试支持。

## 验收标准

- [ ] AC-12（适用时）：合法范围能读取与核验；越界、非覆盖文件、`.NOB` 文件、非 `data` 类、长度为 0 或超过 64、等价备选字节不同都失败，code 与位置正确；已有 locator 的测试全部不变地通过。
- [ ] AC-12（不适用时）：证据记录 02 的结论及不适用依据，代码无改动。
- [ ] 适用时 `pnpm exec vitest run src/original-data`、`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- 适用时：表驱动 Node 测试，使用合成光盘中的非封包覆盖文件与记录读取的端口。
- 适用时，完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。
- 不适用 browser-testing。

## 完成证据
