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

- [x] P2-01 AC-04：生产与合成身份带切片定义版本 2，manifest 身份随之改变；版本 1 的组判为包身份不符，1、2 混装被拒绝；版本 1 的缓存记录在列出与读取时都是 `cache-incompatible`。
- [x] 三个效果角色接受 `data` Asset，`models` 组接受 `data`，其他角色与基数不变。
- [x] AC-18（locator）：合法与规范写法通过；不规范写法、其他文件、非 `data` kind、多个备选报 `invalid-source-mapping`，重复报 `duplicate-mapping`；排序逐项断言；映射核验不读取区域字节，含区域的映射为 `declared`；未覆盖文件报 `path-not-covered`，位置为结构路径。
- [x] `pnpm check` 通过；受影响的 E2E（`resource-cache`、`import-worker`）通过。

## 验证方法

- Node 表驱动测试；`pnpm check`；`pnpm test:e2e e2e/resource-cache.spec.ts e2e/import-worker.spec.ts --project=development`。
- 完成前按 execute-goal 做 rubber-duck 与 simplify。

## 完成证据

- **切片定义：** [slice-definition.ts](../../../../../src/content/slice-definition.ts) 中，`SLICE_DEFINITION_VERSION` 为 2；`projectile`、`missile`、`debris` 允许 `model`、`image`、`data`，`models` 组允许 `data`，其他角色与基数不变（表驱动测试逐项断言）。
- **P2-01 AC-04：**
  - 生产与合成身份都带版本 2（[converter-version.test.ts](../../../../../src/original-data/conversion/converter-version.test.ts)）；
  - 合成 manifest 身份令牌随定义版本改变，派生的 manifest 身份在版本改变时也改变（`manifest-identity.test.ts`）；
  - 版本 1 的组报 `definition-version-mismatch`，混装的包报包身份不符（`completeness.test.ts`）；
  - 版本 1 的缓存记录在 Node 契约测试与 E2E 中，列出与读取时都是 `cache-incompatible`。

  原先把 2 当作“未知版本”的负向样例都改用 1；manifest 身份的固定编码向量仍按版本 1 计算，并显式写出该版本。
- **区域 locator（[source-mapping.ts](../../../../../src/original-data/source-mapping.ts)）：**
  - `OriginalAssetLocator` 改为 `ArchiveEntryLocator | ExecutableRegionLocator`；
  - 新增 `REGION_FILES`（只含 `MAIN/SRANGERS.EXE`）、`REGION_LIMITS`、`isRegionLocator`、`executableRegion` 与 `archiveLocator`；
  - `data` 的条目类型增加 `RENS`；
  - 测试逐项覆盖：规范写法的边界（对象 8、偏移 `0xffffffff`、长度 65,536），11 种不规范写法，其他文件、空子资源、非 `data` kind，正序、逆序与混合的多个备选，重复与乱序，以及条目先于区域、区域按数值排序；
  - 区域映射的来源状态不含 locator 值。
- **只处理封包条目的使用方：** 音频、逻辑、图形、模型转换与生产音效表都显式收窄。这些路径上出现区域 locator 时，各自原有的声明或子资源错误照常报告；已在别处核对过形式的位置用 `archiveLocator`。`EntryReader` 改为只接受 `ArchiveEntryLocator`。
- **映射核验（[verify-source-mappings.ts](../../../../../src/original-data/source/verify-source-mappings.ts)）：** 区域部件只按已验证身份的文件清单核对文件已覆盖，不读取任何字节：测试中读取函数调用 0 次，`sourceReadBytes` 增量为 0；映射为 `declared`，状态为 `unverified`。未覆盖时报 `path-not-covered`，位置为结构路径。最初用 `openFile` 核对，会读取 9,408 字节的目录扇区，已改为按文件清单核对。
- **命令：** `pnpm check` 132 个文件、3,868 项通过，构建通过；`pnpm test:e2e e2e/resource-cache.spec.ts e2e/import-worker.spec.ts --project=development` 33 项通过。
- **Rubber-duck：** 两项阻塞问题已修复：
  1. 区域部件的单一备选规则原先在排序校验之后执行，逆序的多个区域会先报 `mapping-order`；现改为先检查，并补上逆序与混合备选的回归测试；
  2. 合成身份升到版本 2 后，manifest 令牌仍沿用版本 1 的值；现令牌含定义版本。

  审阅者确认：语法、数值排序与基于规范文本的去重一致；`path-not-covered` 的位置正确；收窄后的使用方没有语义回归；`archiveLocator` 的错误文本固定，不泄露 locator 值；AC-04 的每项都有测试。
- **Simplify：** 四个角度各一个审阅代理。
  - **修复：**
    - 核验先按区域分支，去掉可空的“读取”结果与非空断言，覆盖集合只建一次；
    - 图形步骤与逻辑来源只收窄一次，逻辑来源直接把收窄后的 locator 交给读取；
    - 测试用 `archiveLocator` 代替 `entry!`。
  - **跳过：**
    - 用 `openFile` 核对覆盖：会读取字节，违反 spec；
    - 用 `matchesWhole` 匹配：正则已锚定，且需要捕获组；
    - 先完整校验再检查备选数：spec 要求的错误优先级需要预检查；
    - 合成令牌保持不透明：rubber-duck 要求它随版本改变；
    - 把 `REGION_LIMITS` 改为私有：16 的 LE 读取共用它；
    - 缓存解析后的区域：表只有几十个 locator；
    - 泛型化映射表类型：改动面大，现有收窄集中在少数几处。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md)记录切片定义版本 2、判别形式的 locator、区域语法与核验规则。原版文档没有变化。
