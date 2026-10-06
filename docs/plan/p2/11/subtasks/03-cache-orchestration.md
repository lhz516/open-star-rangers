---
type: plan
status: active
phase: P2
task: "11"
subtask: "03"
updated: 2026-10-06
---

# 03 — 缓存编排与操作代际

**契约来源：** [spec](../spec.md) 的 S-04、S-12（异步结果）、AC-05（缓存部分）、AC-06（旧提交）、AC-07（Node）、AC-08（条目筛选）、AC-09（超预算），以及[缓存编排](../spec.md#缓存编排)、[操作与代际](../spec.md#操作与代际)、[包预算与生产身份](../spec.md#包预算与生产身份)、技术决定 2、3。
**依赖：** 02。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在资源持有者中接入 P2-10 的 `ResourceCache` 端口（构造时注入），以及 01 的预期包配置：
  - **列出：** 创建后调用 `list()`，并提供“重新列出”供回到菜单时调用（06 接线）。只采用最近一次发起的结果。按预期包配置筛选可恢复的条目：`original-import`、指纹与 `ConverterVersion` 都相等。
  - **核对保存状态：** 已保存的资源包在列表中不再存在时，缓存状态改为 `not-saved`（`not-found`），资源仍可使用。
  - **空间检查：** 提供导入前的建议性空间检查，需求为包预算的 `payloadBytes`（导入前没有组输入，`measure` 无法给出元数据估计，见 goal 执行记录）；结果只用于提示，不阻止导入。
  - **自动提交：** 资源包来自导入且全包判定为 `complete` 时，以包预算调用 `commit(inputs, limits, { signal })`，状态为 `saving`，成功后为 `saved`，失败时为 `not-saved` 并附 code。部分结果与来自缓存的资源包从不提交。
  - **重新保存：** 对同一资源包再次提交；保存中不允许重复发起。
  - **恢复：** 只对筛选出的条目调用 `restore(key, limits)`。成功后核对身份与预期包配置，不一致时为 `cache-incompatible`，不持有。一致时替换资源包（`origin: cache`，状态 `saved`）。同一时刻至多一个恢复。
  - **代际与释放：** 每个列出、提交与恢复的结果都带发起时的代际与持有者实例，过期即丢弃。替换资源包时中止旧提交，旧提交的任何终态都不改变新资源包。释放持有者时中止进行中的提交。
- Node 测试，用伪造的缓存与可控 Promise：
  - 13 个失败码中，提交与恢复各自可能返回的码都得到 `not-saved` 或恢复失败的结果，并附 code；
  - 提交失败后重试成功；`over-budget` 时为“仅在内存中”；
  - 恢复成功；条目筛选（生产配置拒绝合成身份，反之亦然）；
  - 列出、提交、恢复的结果逆序完成；
  - 替换时旧提交的三种终态：写事务开始前取消、被中止、已提交；
  - 释放后迟到的结果；
  - 已保存的键从列表中消失。

## 不包含

- 页面上的按钮与文案（06、07、05）；真实 IndexedDB 的浏览器验证（07、12）。
- 缓存迁移、清理与持久存储申请（P5）。

## 关键文件与契约

- 修改 02 新增的持有者模块及其测试。
- 复用：[browser-resource-cache.ts](../../../../../src/platform/storage/browser-resource-cache.ts) 的 `ResourceCache` 接口（类型导入）；[resource-cache-contract.ts](../../../../../src/platform/storage/resource-cache-contract.ts) 的结果形状与 `cacheKeyOf`；01 的预期包配置。

## 验收标准

- [x] AC-05（缓存部分）：“已保存”只在 `committed` 或 `restored` 之后、且列表中该键仍在时成立；逆序完成与释放后到达的结果按代际丢弃。
- [x] AC-06（旧提交）：替换时进行中的旧提交，三种终态都不改变新资源包的缓存状态。
- [x] AC-07（Node）：完整导入包自动以包预算提交；部分结果从不提交；`quota-exceeded`、`storage-unavailable`、`write-failed`、`cancelled` 各得到“仅在内存中”并附 code；重试成功后为“已保存”；空间检查为 `insufficient` 时只提示。
- [x] AC-08（Node）：恢复只提供与预期包配置一致的条目；恢复结果的身份不一致时为 `cache-incompatible`。
- [x] AC-09（超预算）：超出包预算的合成包提交得到 `over-budget`，状态为“仅在内存中”。
- [x] `pnpm check` 通过。

## 验证方法

- `pnpm exec vitest run src/app`，完成前 `pnpm check`。
- 浏览器部分见 07 与 12。完成前按 execute-goal 做 rubber-duck 与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **实现：** [resource-holder.ts](../../../../../src/app/resources/resource-holder.ts) 在 02 的持有者上接入缓存编排：
  - **注入：** 持有者构造时接收 `ResourceCachePort`（P2-10 `ResourceCache` 的结构子集，只用 DOM-free 的契约类型）、01 的预期包配置与只用于显示耗时的页面时钟 `now`。真实 `ResourceCache` 满足该端口，已用临时类型检查确认。
  - **列出：** 创建时列出，`relist()` 每次先显示 `checking`；只采用最近一次的结果，发起后资源包被替换则丢弃并重新列出。
  - **条目筛选：** `restorableEntry` 只接受元数据兼容、键等于 `original-import`、预期指纹与预期转换器版本的条目。
  - **保存状态核对：** 已保存的键从列表中消失时，改为 `not-saved`（`not-found`）；列出发起后缓存状态变化过的结果不做此判定。
  - **提交：** 完整的导入包自动以 `profile.limits` 加 `AbortSignal` 提交。`save()` 用于重试或重新保存。
  - **恢复：** `restore()` 单飞，只在未持有资源包时进行。身份不符为 `cache-incompatible@identity`，重新校验不完整为 `cache-corrupt@groups`；成功时以来源 `cache`、`saved` 替换资源包。
  - **替换与释放：** 替换时中止旧提交、立即结束进行中的恢复；释放时中止提交。迟到的结果都被丢弃，不发布。
  - **空间检查：** `checkSpace()` 以包预算的 `payloadBytes` 调用 `checkCapacity`，结果原样返回。
  - **耗时与意外拒绝：** 成功与失败的提交、恢复都记录页面时钟耗时；意外拒绝交给 `reportError`，并分别报 `read-failed@list`、`write-failed@commit`、`read-failed@restore`。
- **测试：**
  - [resource-holder-cache.test.ts](../../../../../src/app/resources/resource-holder-cache.test.ts) 共 50 条，用 [test support](../../../../../src/app/resources/resource-holder.test-support.ts) 中各操作都由测试决定何时完成的伪造缓存；
  - [resource-holder.test.ts](../../../../../src/app/resources/resource-holder.test.ts) 按新的快照形状更新。

  覆盖的验收：
  - **AC-05（缓存部分）：**
    - “已保存”只在 `committed` 或 `restored` 之后成立；
    - 键从列表消失后为“仅在内存中”，资源仍被持有，可重新保存（含来自缓存的资源包）；
    - 两次列出逆序完成时只采用后一次；
    - 先于提交完成而发起的列出不误判已保存的包；
    - 替换后迟到的列出被丢弃并重新列出；
    - 替换后迟到的恢复（成功或失败）不发布也不持有，恢复状态在替换时即回到 `idle`；
    - 释放后迟到的列出、提交与恢复都不改变状态、不通知。
  - **AC-06（旧提交）：** 替换时旧提交的 signal 已中止；旧提交以 `cancelled`、`write-failed` 或 `committed` 结束时，快照保持同一对象，不通知订阅者，新包仍为 `saving` 并只随自己的提交改变。另确认之后的释放仍中止新包的提交。
  - **AC-07（Node）：**
    - 完整导入包以 `profile.limits` 提交，提交的组就是持有的组，耗时由页面时钟得出；
    - 部分结果从不提交，`save()` 返回 false；
    - 能由提交返回的 9 个失败码逐一得到“仅在内存中”，附 code 与耗时，重试成功后为“已保存”，保存中不能重复发起；
    - `checkSpace()` 以包预算 `payloadBytes` 询问，`insufficient` 原样返回而不改变状态；
    - 提交前后 payload 逐字节不变。
  - **AC-08（Node）：**
    - 其他转换器版本、其他指纹、合成来源，以及不兼容、损坏或键不可读的条目都不提供恢复；
    - 生产配置拒绝合成条目，合成配置拒绝生产条目；
    - 恢复结果身份不符时为 `cache-incompatible`；
    - 9 个恢复失败码逐一得到失败并附耗时，不持有，可再试；
    - 持有资源包（保存中或部分）时不能恢复。
  - **AC-09（超预算）：** 预期配置限值收紧为 3 个 Asset 时，伪造缓存以 P2-10 适配器自己的 `chargeDeclaredBudget` 判定，得到 `over-budget`，状态为“仅在内存中”。
  - **证伪：** 分别去掉缓存状态版本号的判定、恢复的代际判定、提交 controller 的判定、替换时结束恢复的语句、恢复的“已持有”判定、列出的代际判定，每次都有相应测试失败。
- **检查：**
  - `pnpm exec vitest run src/app tools/engineering-boundaries.test.ts`：21 个文件，534 条测试通过；
  - `pnpm check`：143 个文件 4,318 条测试，构建通过。
- **Rubber-duck：** 四项阻塞问题，采纳三项：
  - 被替换的恢复会停留在 `restoring`，迟到的结果仍会发布：改为替换时结束恢复，迟到结果静默丢弃；
  - 跨代际的列出结果仍会更新目录：改为丢弃并重新列出；
  - 持有资源包时仍可恢复：已禁止。

  未采纳一项：“`save()` 不应提交来自缓存的资源包”。spec 行为表规定，已保存的包在列表中没有该键时提供重新保存，恢复的包正是已保存的包；“来自缓存时不重复提交”只针对自动提交。已补测试覆盖这一路径。

  另采纳一项非阻塞问题：失败的提交与恢复也记录耗时。
- **Simplify：** 采纳五项：
  - 预期键与身份比较改用 `sameCacheKey`、`cacheKeyOf`；
  - 删去测试中的 `holder()` 别名；
  - 未被外部使用的测试支持改为模块私有；
  - 拆开参数化测试中重复的不变断言；
  - 提交回调不再捕获被替换的资源包。

  未采纳：
  - 跳过持有者的全包校验或身份核对：spec S-03、状态阶梯与缓存编排都要求持有者自己判定与核对；
  - 跨代际仍采用列出结果：违反 spec 操作与代际；
  - 合并代际与各计数器：代际是资源包契约的一部分；
  - 与 `import-host.test.ts` 共用 `deferred`：需要改动无关测试；
  - 删去缓存测试中的状态阶梯断言：它们是 AC-05 缓存部分的证据。
- **spec 澄清：** 导入前空间检查的需求取包预算的 `payloadBytes`，见 [goal 执行记录](../goal.md#执行记录)。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md)的“应用资源持有者”一节补充以下内容：
  - 缓存端口、列出、提交、恢复、空间检查与释放；
  - 新的快照形状，并说明 spec 中的 `checking`、`unavailable` 对应列出状态。

  工程约定与 STATUS 无需改动。
