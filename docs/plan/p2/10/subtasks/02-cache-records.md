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

- [ ] S-01：常量值与 spec 一致；由合成包构建的包记录只含规定字段，组顺序与定义一致，计数与字节数等于清单声明之和；构建结果经读取后与原清单、来源状态相等。
- [ ] AC-08（读取判定部分）：在 Node 中逐项构造记录：缺字段、多余字段、组缺失或乱序、键与身份不一致、四组身份不一致、计数或字节数不符、P2-01 读取错误、payload 记录形状损坏，都为 `cache-corrupt`；未知格式标识、`formatVersion` 为 2、内容 schema 为 2、切片定义版本为 2，都为 `cache-incompatible`。列出状态与之一致。
- [ ] AC-13：`payloadBytes` 为精确和；同一输入两次估算相同且非负；`requiredBytes = payloadBytes + metadataBytes`；非法输入与超出安全整数返回 `invalid-request`。
- [ ] `pnpm exec vitest run src/platform/storage`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- `resource-cache-records.test.ts` 用 `syntheticPackage`、`syntheticOriginalGroup` 构造正常记录，再逐项改写成负向样本；表驱动断言 code 与 location。
- 不适用 browser-testing；真实存储中的读回在 03、06 中验证。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
