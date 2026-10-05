---
type: plan
status: active
phase: P2
task: "01"
subtask: "04"
updated: 2026-10-04
---

# 04 — 资源组与完整性验证

**契约来源：** [spec](../spec.md) 的 S-07、S-08；AC-06、AC-07。
**依赖：** 02、03。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 实现纯验证入口，检查唯一 ID、kind/role、依赖存在、重复依赖、自引用/环、角色基数、来源/研究状态、payload identity 和组身份。
- 区分 `group-complete` 与 package `complete`；组级结果保留规范有序、无重复的跨组外部要求，全包只在四组身份一致且所有要求解析时通过。
- 使用稳定错误 code 和安全路径诊断；失败不补默认资源、不写可伪造 complete 标志、不产生成功形回退。

## 不包含

- 不解析原版字节、不执行转换、不写 IndexedDB、不接入 Core/Renderer/Audio。
- 不实现 P2-11 查看器或 P2-12 联合浏览器验证。

## 关键文件与契约

- 依赖 02 的 `content/` 类型和 03 的来源状态/映射。
- 计划新增 `src/content/` 验证模块与邻接测试。

## 验收标准

- [x] 每个必需组能独立输出闭包结果；全包能拒绝缺失或不一致的跨组身份。
- [x] 环、重复、缺失引用、payload/版本/manifest/source 不一致和未确认必需来源均返回稳定诊断。
- [x] 完整性由输入推导，调用者无法通过传入或修改 `complete` 绕过验证。

## 验证方法

- Node/Vitest 表驱动正负 fixture，覆盖每个组、3/4 组和跨组引用。
- 不适用 browser-testing；浏览器接线归 P2-11/12。

## 完成证据

- **实现：** [completeness.ts](../../../../../src/content/completeness.ts) 提供纯入口 `validateGroup` 与 `validatePackage`，两者返回不同的判别联合：组级为 `group-complete`/`incomplete`，全包为 `complete`/`incomplete`。组级结果从切片定义、组清单（身份、组、按 ID 升序的描述符）、实际 payload 记录和来源状态集推导，检查以下各项：
  - 定义版本、组归属，以及角色所属的组与允许的 kind；
  - 角色数量，敌机超出范围时报错，不截断列表；
  - 组内依赖存在、无自引用、无环；
  - payload：[sha256.ts](../../../../../src/content/sha256.ts) 重算指纹，并按 schema 版本、长度、指纹的顺序比对；
  - 来源就绪。

  依赖的 kind 若不属于本组（定义新增的 `groupKinds`），作为规范有序、无重复的类型化外部要求返回，不判为本组缺失。来源方面：
  - [source-state.ts](../../../../../src/content/source-state.ts) 的状态集带来源指纹；
  - `original-data` 的 `assetSourceStates` 从来源映射推导状态集，并保留映射表的指纹；
  - 原版导入要求状态集指纹与清单一致，且每个 Asset 均为 verified；
  - 合成内容的来源输入必须为 null。

  [payload.ts](../../../../../src/content/payload.ts) 要求 payload 记录按 ID 升序且唯一，避免重复记录被静默覆盖。`validatePackage` 每次都从原始输入重新验证，不接受已有结果。只有同时满足以下条件时才返回 `complete`：每组恰好一份、六项身份一致、ID 跨组唯一、外部要求全部解析，且无跨组环。

  诊断带稳定 code、最终结构路径、规范 ID、U 项与原因，按路径排序并深度冻结。为复用，`contract-validation.ts` 新增 `readOrderedArray`/`compareText`；描述符与身份读取器改为接受调用者路径。08 的依赖错误优先级保持不变。
- **测试：**
  - [completeness.test.ts](../../../../../src/content/completeness.test.ts) 共 60 项，组级覆盖：
    - 四组各自独立完整，并给出预期外部要求（逻辑组要求模型，模型组要求音效）；
    - 按定义逐个角色缺失；0 个或 3 个敌机；
    - 23 种变异各返回固定的 code@path：缺失组内依赖、自引用、环、重复 ID、乱序、组外 kind、角色 kind 错误、跨组角色/组、缺失/交换/截断/同长度错误/版本不符/多余/重复/乱序 payload、非法或重复依赖、定义版本或 schema 不符、伪造 `complete` 字段、合成内容带来源；
    - 原版导入的未确认来源（带 U 项）与缺失来源；
    - 来源指纹不符、为 null 或整个缺失。
  - 全包覆盖：
    - 合成包与原版导入包均完整；
    - 逐组缺失，以及重复组；
    - 不完整组时不返回部分成功；
    - 跨清单身份、converter、origin、定义版本、schema、切片 ID 的六种混装；
    - 组级完整但跨组要求缺失；
    - 同一 Asset 跨组、跨组环；
    - 伪造的组结果输入被拒，验证后修改原输入不影响已冻结的结果。
  - [sha256.test.ts](../../../../../src/content/sha256.test.ts) 用 NIST 向量，以及跨块边界长度和子数组视图与 Node 的一致性来验证 SHA-256。
  - 切片定义测试断言各角色的 kind 都在所属组的 `groupKinds` 内。
  - 来源映射测试覆盖 `assetSourceStates` 的状态推导、严重度合并、指纹保留与无 locator 输出。
- **审查：** rubber-duck 提出 2 个阻塞问题和 1 个其他问题，均已修复：
  - ①（阻塞）来源状态未绑定导入指纹，可用另一张光盘的状态通过验证。已改为带指纹的状态集，并新增指纹不符、为 null、缺失三项回归。
  - ②（阻塞）重复的 payload 记录会被后者静默覆盖。已要求按 ID 升序且唯一，并新增重复和乱序回归。
  - ③ 非法描述符诊断丢失清单索引。已改为传入调用者路径，并新增依赖 ID 非法的回归。

  同一审查者只读复核三项，确认均已解决、无剩余问题。随后对照 AC-06/AC-07 补充两组仅测试用例，没有改动实现：经验证入口的重复依赖，以及定义版本、schema、切片 ID 的全包混装。
- **simplify：** 采纳以下清理，无跳过项：
  - SHA-256 按整块就地计算，减少分配；
  - payload 记录与比对抽为独立模块；
  - 全包验证传入根路径，每个问题只在最终路径报告一次；
  - 角色计数改为单次遍历；
  - 身份比较改为单个比较键；
  - 来源状态直接从映射事实推导；
  - 内部常量与读取器不再导出。
- **验证：**
  - `pnpm exec vitest run src/content src/original-data tools/engineering-boundaries.test.ts` 为 11 个文件 352 项通过；
  - `pnpm check` 为 64 个文件 1571 项通过，四个 TypeScript 程序、lint 与生产构建均通过；
  - 依赖与锁文件未变；
  - 不适用 browser-testing。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md#内容基础契约与切片定义)新增 content 的 `source-state.ts`、`sha256.ts`、`payload.ts`、`completeness.ts`，以及完整性、SHA-256、来源状态、`readOrderedArray`、`groupKinds` 与 `assetSourceStates` 说明。工程约定、guides、架构决策与 STATUS 不受影响：本项没有新增命令、lint 规则或模块边界，P2-01 仍在执行。原版事实与 U 项状态不变。
