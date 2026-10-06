---
type: plan
status: active
phase: P2
task: "06"
subtask: "15"
updated: 2026-10-06
---

# 15 — 切片定义版本 2 与区域 locator

**契约来源：** [P2-01 spec](../../01/spec.md) 2026-10-06 修订（`OriginalAssetLocator`、`models` 组、AC-04）；[spec](../spec.md) 的[效果几何数据](../spec.md#效果几何数据)中“区域 locator”，以及 AC-18 的 locator 部分。
**依赖：** 14。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。由 2026-10-06 的 spec 修订加入，见 [goal 执行记录](../goal.md#执行记录)。

## 工作范围

- **切片定义（`content/`）：**
  - [slice-definition.ts](../../../../../src/content/slice-definition.ts) 中，`projectile`、`missile`、`debris` 允许 `model`、`image`、`data`；`models` 组的 kind 增加 `data`；`SLICE_DEFINITION_VERSION` 为 2；
  - 同步依赖版本的测试与测试支持：合成内容、完整性、身份、缓存记录与 E2E 的不兼容样例。负向样例改用 1 或 3。
- **区域 locator（`original-data/`）：**
  - [source-mapping.ts](../../../../../src/original-data/source-mapping.ts) 的 `OriginalAssetLocator` 改为判别形式，`entry` 为 null 时为区域；
  - 语法、规范写法、文件与 kind 限制、排序、去重与单一备选，都按 spec；
  - `data` kind 接受 RENS 条目 locator 与区域 locator。
- **映射核验：** [verify-source-mappings.ts](../../../../../src/original-data/source/verify-source-mappings.ts) 对区域 locator 只核对文件已覆盖，不读取字节；含区域的映射为 `declared`；`path-not-covered` 按 P2-03 的规则改写到结构路径。现有条目 locator 的行为不变。

## 不包含

- LE 读取（16）、效果 payload（17）、效果步骤与生产输入（18）。

## 关键文件与契约

- 修改：`src/content/slice-definition.ts` 及其测试与依赖版本 1 的测试支持；`src/original-data/source-mapping.ts`、`verify-source-mappings.ts` 及其测试；必要时 `e2e/resource-cache.spec.ts` 的不兼容样例。
- 生产代码不新增调试 API。

## 验收标准

- [ ] P2-01 AC-04：生产与合成身份带切片定义版本 2，manifest 身份随之改变；版本 1 的组判为包身份不符，1、2 混装被拒绝；版本 1 的缓存记录在列出与读取时都是 `cache-incompatible`。
- [ ] 三个效果角色接受 `data` Asset，`models` 组接受 `data`，其他角色与基数不变。
- [ ] AC-18（locator）：合法与规范写法通过；不规范写法、其他文件、非 `data` kind、多个备选报 `invalid-source-mapping`，重复报 `duplicate-mapping`；排序逐项断言；映射核验不读取区域字节，含区域的映射为 `declared`；未覆盖文件报 `path-not-covered`，位置为结构路径。
- [ ] `pnpm check` 通过；受影响的 E2E（`resource-cache`、`import-worker`）通过。

## 验证方法

- Node 表驱动测试；`pnpm check`；`pnpm test:e2e e2e/resource-cache.spec.ts e2e/import-worker.spec.ts --project=development`。
- 完成前按 execute-goal 做 rubber-duck 与 simplify。

## 完成证据
