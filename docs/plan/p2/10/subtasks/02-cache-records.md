---
type: plan
status: active
phase: P2
task: "10"
subtask: "02"
updated: 2026-10-05
---

# 02 — 记录布局与存储需求

**契约来源：** [spec](../spec.md) 的 S-01、S-04（存储需求部分）、S-06（记录读取部分），AC-08（读取判定部分）、AC-13；[记录布局](../spec.md#记录布局)、[操作与结果](../spec.md#操作与结果)、[持久化与兼容](../spec.md#持久化与兼容)。
**依赖：** 01。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **兼容常量：** 数据库名 `osr-resource-cache`、数据库版本 1、记录格式标识 `osr-resource-cache`、格式版本 1，以及实现选定的两个对象仓库名，都作为导出常量；测试与 E2E 只按这些常量访问。
- **包记录构建：** 输入为四组已读取的 `GroupManifest` 与 `SourceStateSet | null`，输出 `{ format, formatVersion, key, groups, payloadCount, payloadBytes }`：
  - `groups` 按 `CLASSIC_P2_SLICE.groups` 的顺序，每组只含 `manifest` 与 `sources`；
  - `payloadCount`、`payloadBytes` 为四组清单声明之和；
  - 不含调用方输入的多余字段、完成布尔值、时间戳、宿主路径或原版定位。
- **包记录读取（不可信）：** 按以下顺序判定，任何失败都不返回部分结果：
  1. 非对象、缺少 `format` 或 `formatVersion` → `cache-corrupt`；`format` 未知或 `formatVersion` 不为 1 → `cache-incompatible`。
  2. 字段集合不符、组的数量或顺序不符 → `cache-corrupt`。
  3. 各组清单用 `readGroupManifest`、来源用 `readSourceStateSet` 读取；P2-01 读取错误 → `cache-corrupt`，诊断保留其 code 与路径。`unsupported-schema`，以及切片定义版本不等于 `CLASSIC_P2_SLICE.version` → `cache-incompatible`。
  4. 记录键与由各组身份推导的键不一致、四组身份不一致、`payloadCount` 或 `payloadBytes` 与清单不符 → `cache-corrupt`。
- **列出用元数据状态：** 基于同一读取，输出 `compatible`（附身份与 `payloadBytes`）、`incompatible` 或 `corrupt`；元数据不可读时身份与字节数为 null。
- **payload 记录：** 值 `{ schemaVersion, bytes: ArrayBuffer }` 的构建与读取；形状不符（缺字段、`bytes` 不是 `ArrayBuffer`、版本非正安全整数）→ `cache-corrupt`。与清单的版本、长度、哈希核对由 03 的恢复经 `validatePackage` 完成。
- **存储需求：** 输入四组 `GroupInput`，经 P2-01 读取器读取后返回 `{ payloadBytes, metadataBytes, requiredBytes }`：
  - `payloadBytes` 为实际 payload 字节的精确和；
  - `metadataBytes` 由实现固定的确定性规则估算（例如按包记录与 payload 记录的元数据规模计），规则写入工程文档；
  - 任一值超出安全整数或输入读取失败 → `invalid-request`。
- 模块不依赖 DOM 类型，测试在 Node 中运行。

## 不包含

- IndexedDB 读写、事务与浏览器验证（03–06）。
- 空间检查与 `StorageManager.estimate()`（04）。
- 迁移与旧版本升级路径：本任务只识别并报告不兼容。

## 关键文件与契约

- **计划新增：** `src/platform/storage/resource-cache-records.ts`、`src/platform/storage/resource-cache-records.test.ts`。
- **依赖 01：** `resource-cache-contract.ts` 的键与失败结果。
- **只读复用：** [manifest.ts](../../../../../src/content/manifest.ts)、[source-state.ts](../../../../../src/content/source-state.ts)、[payload.ts](../../../../../src/content/payload.ts)、[content-identity.ts](../../../../../src/content/content-identity.ts)、[slice-definition.ts](../../../../../src/content/slice-definition.ts)。

## 验收标准

- [x] S-01：常量值与 spec 一致；由合成包构建的包记录只含规定字段，组顺序与定义一致，计数与字节数等于清单声明之和；构建结果经读取后与原清单、来源状态相等。
- [x] AC-08（读取判定部分）：在 Node 中逐项构造记录：缺字段、多余字段、组缺失或乱序、键与身份不一致、四组身份不一致、计数或字节数不符、P2-01 读取错误、payload 记录形状损坏，都为 `cache-corrupt`；未知格式标识、`formatVersion` 为 2、内容 schema 为 2、切片定义版本为 2，都为 `cache-incompatible`。列出状态与之一致。
- [x] AC-13：`payloadBytes` 为精确和；同一输入两次估算相同且非负；`requiredBytes = payloadBytes + metadataBytes`；非法输入与超出安全整数返回 `invalid-request`。
- [x] `pnpm exec vitest run src/platform/storage`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- `resource-cache-records.test.ts` 用 `syntheticPackage`、`syntheticOriginalGroup` 构造正常记录，再逐项改写成负向样本；表驱动断言 code 与 location。
- 不适用 browser-testing；真实存储中的读回在 03、06 中验证。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **实现：** [resource-cache-records.ts](../../../../../src/platform/storage/resource-cache-records.ts)（DOM-free）：
  - **常量：** `RESOURCE_CACHE_DATABASE`（名称 `osr-resource-cache`、版本 1、对象仓库 `packages` 与 `payloads`）、`RESOURCE_CACHE_FORMAT`、`RESOURCE_CACHE_FORMAT_VERSION`。
  - **构建：** `readGroupInputs` 经 P2-01 读取器读取各组输入（失败按调用方给出的 code，非数组为 `invalid-request`），`inDefinitionOrder` 要求每个定义组恰好一次并按定义排序，`buildPackageRecord` 只写 6 个规定字段与各组的 `manifest`/`sources`，`buildStoredPayload` 写出恰为 payload 长度的 `ArrayBuffer`（视图不覆盖整个缓冲时用 `exclusiveBytes` 复制）。
  - **读取：** `readPackageRecord` 按顺序检查：格式标识与版本（缺失为 corrupt，未知为 incompatible）→ 字段集合、组容器为稠密普通数组、组外壳字段与原始组名顺序（corrupt）→ 各组 P2-01 读取（`unsupported-schema` 与切片定义版本不符为 incompatible，其余为 corrupt 并附诊断）→ 记录键与身份键、四组身份（`contentIdentityKey`）、声明的计数与字节数（corrupt）→ 可选的存储键一致性。`readStoredPayload` 读取 payload 记录为新的 P2-01 payload 记录。`cacheEntryOf` 只读存储键与包记录给出列出状态，存储键不可读时 `key` 为 null。
  - **存储需求：** `measureStorageRequirement` 返回 `{ payloadBytes, metadataBytes, requiredBytes }`，payload 为实际字节精确和，元数据按包记录与各 payload 记录键的 JSON 文本每字符 2 字节、每条记录另加 64 字节估算；输入非法或总数超出安全整数为 `invalid-request`。
- **content 增量：** 六项身份比较键由 `completeness.ts` 的私有 `identityKey` 移为 [content-identity.ts](../../../../../src/content/content-identity.ts) 导出的 `contentIdentityKey`，全包验证与缓存读取共用，行为不变。01 的 `readCacheKey` 增加可选 failure code，存储中的键报 `cache-corrupt`。
- **测试：** [resource-cache-records.test.ts](../../../../../src/platform/storage/resource-cache-records.test.ts)：
  - S-01：常量；记录只含规定字段、组按定义顺序（输入倒序也一样）、计数与字节数等于清单声明；多余的调用方字段不进入记录；读回后清单与来源状态相等；偏移视图与 Node `Buffer` 都只存自身字节；读回的包可通过 `validatePackage`。
  - AC-08（读取判定）：19 种 `cache-corrupt`（含非记录、缺格式、缺版本、缺字段、多余字段、缺组、组乱序、组外壳多余字段、键不一致、键非法、四组身份不一致、计数或字节数不符、P2-01 读取错误、来源状态损坏、组容器带额外字段、稀疏组容器、清单非记录、组乱序且兼有新 schema），5 种 `cache-incompatible`（未知格式、格式版本 2、另一形状的未来格式、内容 schema 2、切片定义版本 2），列出状态与之一致；存储键与记录键不符为 corrupt；6 种 payload 记录形状损坏为 corrupt。
  - AC-13：精确和、两次及输入倒序结果相同、`requiredBytes` 为两者之和、payload 增大时元数据基本不变；非数组、缺组、清单非法、组为 null 为 `invalid-request`；用覆盖 `byteLength` 的 `Uint8Array` 子类构造超出安全整数的总数，返回 `invalid-request`。
- **检查：** `pnpm exec vitest run src/platform/storage src/content` 通过；`pnpm check`：89 个测试文件 2,450 个测试、lint、类型检查与构建全部通过。
- **Rubber-duck：** 采纳两项：复制分支原用 `bytes.slice()`，对 Node `Buffer` 会得到共享池的视图（改为不依赖子类的复制并加回归测试）；组顺序原在 P2-01 读取之后才检查，组乱序且兼有新 schema 会误报 incompatible，组容器也接受带额外字段的数组（改为先做结构预检并加回归测试）。
- **Simplify：**
  - 采纳：共用 `contentIdentityKey`；`cacheEntryOf` 只解析一次存储键；计数与字节数只计算一次；复制分支复用 `exclusiveBytes`；`estimateMetadataBytes` 改为私有。
  - 未采纳：去掉记录中的 `payloadCount`/`payloadBytes`（spec 的记录布局规定了这两个字段及其不符时为 corrupt）；对组输入对象做严格字段读取（与 `validatePackage` 保持一致，spec 规定多余字段被丢弃而不是拒绝）。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md)的目录树加入 `resource-cache-records.ts`，`platform/storage/` 说明补充常量、读取顺序与分类、存储需求估算规则，并记录 `contentIdentityKey`。工程约定的命令与测试规则无受影响内容；浏览器验证说明由 03 起补充。
