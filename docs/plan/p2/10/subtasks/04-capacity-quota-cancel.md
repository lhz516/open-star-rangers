---
type: plan
status: active
phase: P2
task: "10"
subtask: "04"
updated: 2026-10-05
---

# 04 — 空间检查、配额、取消与存储不可用

**契约来源：** [spec](../spec.md) 的 S-04、S-07（取消、配额、写失败与存储不可用部分）、S-12，AC-05、AC-06、AC-10、AC-16（验证路线部分）；[行为与边界](../spec.md#行为与边界)、[技术决定](../spec.md#技术决定) 2、6、9。
**依赖：** 03。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **空间判定（DOM-free）：** 在 `resource-cache-records.ts` 中增加纯函数：输入 `requiredBytes` 与估算结果（`{ usage, quota }`、缺失或失败）：
  - `requiredBytes` 不是非负安全整数 → `invalid-request`；
  - `usage` 或 `quota` 缺失、非有限数或为负 → `unknown`：`{ requiredBytes }`；
  - 否则 `availableBytes = max(0, quota − usage)`，不小于需求为 `sufficient`，否则为 `insufficient`，都附 `{ requiredBytes, availableBytes, usage, quota }`。
- **空间检查（适配器）：** 调用注入或全局的 `StorageManager.estimate()`；没有 `StorageManager` 或 `estimate()` 抛出、拒绝时为 `unknown`。结果只作建议，不阻止提交。
- **取消：** 提交接受可选 `AbortSignal`：
  - 调用时已取消，或在写事务开始前取消 → `cancelled`，不开启写事务；
  - 写事务仍可中止时取消 → 调用原生 `abort()`，事务以 `abort` 结束后才返回 `cancelled`；
  - `abort()` 抛出 `InvalidStateError`（已进入提交阶段）或事务已 `complete` → 等待最终事件，`complete` 返回 `committed`，`abort` 按其原因返回；
  - 结束后移除对 signal 的监听。
- **写事务中止的分类：** 非取消引起的中止按宿主错误名分类：`QuotaExceededError` → `quota-exceeded`，其他 → `write-failed`。
- **存储不可用：** 注入缺失的工厂，或打开时抛出 `SecurityError`、`InvalidStateError` 的工厂，使提交、列出、恢复都返回 `storage-unavailable`，没有内存回退。
- **文档：** 在工程约定中记录空间检查的语义、CDP 配额覆盖与工厂注入的验证路线，以及配额覆盖不可用时的处理。

## 不包含

- `versionchange`、强制关闭、删除、更高版本与中断（05）。
- 导入前是否提示、是否继续的界面决定（P2-11）。
- `navigator.storage.persist()`（P5）。

## 关键文件与契约

- **修改：** `src/platform/storage/resource-cache-records.ts` 与其测试、`src/platform/storage/browser-resource-cache.ts`、`e2e/resource-cache.spec.ts`、`e2e/support/resource-cache.ts`（均由 01–03 新增）、[engineering/README.md](../../../../engineering/README.md)。
- **CDP：** 页面级 CDP session 的 `Storage.overrideQuotaForOrigin`（省略 `quotaSize` 即恢复默认），origin 为开发服务器的 origin。

## 验收标准

- [x] AC-10（空间判定部分）：Node 测试覆盖足够、刚好相等、不足、`usage` 大于 `quota`、缺失、`NaN`、`Infinity`、负数与非法 `requiredBytes`。
- [x] AC-10（浏览器部分）：缺失工厂、打开时抛出 `SecurityError`、抛出 `InvalidStateError` 三种注入下，提交、列出、恢复都返回 `storage-unavailable`，提交从不返回 `committed`；`StorageManager` 缺失、`estimate()` 拒绝、返回非有限数时空间检查为 `unknown`。
- [x] AC-05：调用时已取消 → `cancelled`，记录不变；写请求已发出、事务仍可中止时取消 → 探针观测到原生 `abort()` 与 `abort` 事件，返回 `cancelled`，同键旧包仍能恢复，没有新包的记录；事务已进入提交阶段或 `complete` 后取消 → `committed`，新包可恢复。证据至少包含一次写请求发出后的原生 `abort`。
- [x] AC-06（2026-10-05 修订后）：默认配额下提交旧包；在临时持久 profile 中重启浏览器、首次使用 IndexedDB 之前，经 CDP 把配额设为高于当前用量、低于新包需求。覆盖期间，默认适配器的空间检查结果与随即独立读取的 `estimate()` 按公式算出的结果完全一致（`status`、`requiredBytes`、`availableBytes`、`usage`、`quota`）；提交新包返回 `quota-exceeded`，旧包仍能恢复，没有新包的记录；恢复默认配额后同一提交成功。另把页面中一次真实 `estimate()` 的读数注入空间检查：刚好相等为 `sufficient`，多 1 字节为 `insufficient`，数值与该读数及输入需求一致；默认适配器直接读取 `navigator.storage` 得到同一 `quota`。若 CDP 方法不可用或没有产生真实配额错误，本项不通过。
- [x] AC-16（本子任务部分）：工程约定记录 CDP 配额覆盖、工厂注入与配额覆盖不可用时的处理。
- [x] `pnpm check` 与 `pnpm test:e2e resource-cache.spec.ts --project=development` 通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 运行：普通用例在隔离 context 中，AC-06 的真实配额错误用例在测试自有的临时持久 profile 中跨两个浏览器会话。注入只用于表示“能力缺失”或“打开失败”，以及把真实 `estimate()` 读数注入空间判定，不用于证明事务或配额行为。
- AC-05 的取消时机由探针控制与记录：在探针观测到写请求后再触发 signal；“提交阶段”用 `complete` 之后取消与 `abort()` 抛出 `InvalidStateError` 两种观测之一证明。
- AC-06 证据记录 CDP 方法可用性、CDP 报告的配额与用量、`estimate()` 读数、需求与宿主错误名。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **实现：**
  - [resource-cache-contract.ts](../../../../../src/platform/storage/resource-cache-contract.ts) 新增 DOM-free 的 `evaluateCapacity`。工作范围原定放在 `resource-cache-records.ts`，simplify 认为它属于结果与请求校验的契约，故改放此处。
  - [browser-resource-cache.ts](../../../../../src/platform/storage/browser-resource-cache.ts) 新增 `storage` 注入（默认 `navigator.storage`）与 `checkCapacity`：非法输入不读取估算，没有估算、估算抛出或拒绝时为 `unknown`。
  - **取消：** 提交入口先检查已取消的 signal，避免复制与哈希。写事务的 `abort()` 记录唯一原因，后续请求错误不能覆盖；`abort()` 抛出 `InvalidStateError` 时等待事务的最终事件；结束时移除监听。
- **测试支持：** [support/resource-cache.ts](../../../../../e2e/support/resource-cache.ts) 的探针记录中止时的宿主错误名，并提供 `onEvent`（记录后、应用处理器之前同步运行）；`modelBytes` 改为 xorshift 生成的不可压缩字节；新增 `restoredTag` 与 `withQuotaOverride`。
- **Node 证据（AC-10 空间判定）：** [resource-cache-contract.test.ts](../../../../../src/platform/storage/resource-cache-contract.test.ts) 覆盖足够、刚好相等、差 1 字节、用量超过配额（需求为 0 与 1）；缺 quota、缺 usage、`NaN`、`Infinity`、负数、字符串与非对象估算为 `unknown`；7 种非法 `requiredBytes` 为 `invalid-request`。
- **浏览器证据**（本机 Chrome 154，`pnpm test:e2e resource-cache.spec.ts --project=development` 9 个用例全部通过；临时 profile 无残留）：
  - **AC-10：** 缺失工厂、打开时抛出 `SecurityError`、抛出 `InvalidStateError` 三种注入下，提交、列出、恢复都返回 `storage-unavailable`，结果不含宿主消息，页面没有创建缓存数据库；`StorageManager` 缺失、`estimate()` 拒绝、同步抛出、返回 `NaN` 时为 `unknown`；默认适配器读真实估算为 `sufficient`。
  - **AC-05：**
    - 调用时已取消：返回 `cancelled`，没有读写事务或写请求，记录不变。
    - 写请求发出后取消：探针记录到成功的原生 `abort()` 与 `readwrite` 的 `abort` 事件，没有 `complete`；返回 `cancelled`，旧包可恢复，记录不变。
    - 在 `complete` 时取消：`abort()` 抛出 `InvalidStateError`，返回 `committed`，新包可恢复。
    - 提交返回后取消：返回 `committed`，且没有 `abort()` 调用，证明监听已移除。
  - **AC-06（按 2026-10-05 修订后的条款）：**
    - 在临时持久 profile 的第一个会话按默认配额提交旧包，重启后在首次使用 IndexedDB 前经 CDP 设置配额 524,288 字节：高于 CDP 报告的用量 0，低于新包需求 8,406,461 字节，也低于单个 1 MiB payload。CDP `Storage.getUsageAndQuota` 报告 `overrideActive: true`。
    - 覆盖期间，默认适配器的空间检查结果与按公式由随即独立读取的 `estimate()` 算出的结果完全相等：`status`、`requiredBytes`、`availableBytes`、`usage`、`quota` 五项一致（`estimate()` 的配额为 10,737,418,240，不反映覆盖，所以是 `sufficient`）。
    - 提交新包返回 `quota-exceeded`，探针记录 `readwrite` 中止且宿主错误为 `QuotaExceededError`；旧包仍可恢复，记录与第一个会话结束时完全相同。
    - 重置覆盖后同一提交返回 `committed` 并可恢复。
    - 边界用例把页面中真实 `estimate()` 的读数注入空间检查：需求刚好等于剩余空间为 `sufficient`，多 1 字节为 `insufficient`，两次结果的数值都与该读数及输入需求一致；默认适配器直接读取 `navigator.storage`，得到同一 `quota`。
    - 补上覆盖期间完整结果的断言后，e2e 程序的类型检查与 ESLint 通过，配额与边界两个用例连续 3 次运行通过。
  - **阻塞历史：** 修订前的 AC-06 要求覆盖期间返回 `insufficient`。Chrome 154 的 `estimate()` 不反映 CDP 配额覆盖，该条款无法成立，本子任务曾按 spec 风险与恢复保持阻塞；用户批准修订后解除，见 [goal 执行记录](../goal.md#执行记录)。
- **检查：** `pnpm check`：89 个测试文件 2,483 个测试、lint、类型检查与构建全部通过。
- **Rubber-duck（修订前）：** 确认没有实现缺陷，也找不到可行且不空洞的字面满足 AC-06 的方式，同意保持阻塞。采纳 3 项非阻塞建议：已取消的 signal 在复制与哈希前返回；断言提交返回后再取消不会调用 `abort()`；断言配额覆盖值高于用量、低于需求和单个 payload。
- **Rubber-duck（修订后关闭）：**
  - 确认修订后的 AC-06 已由现有用例加上新的完整结果断言证明，没有空洞断言。
  - 采纳的修正：完成证据统一为修订后的结论；勾选项列出完整结果的全部五项，边界数值与输入需求一致；验证方法区分隔离 context 与临时持久 profile；05 中过时的 AC-07 验证方式同步更新。
- **Simplify：** 关闭时只改了测试断言与文档，没有生产实现修改，不另做代码清理。此前的清理如下。
  - 采纳：
    - `evaluateCapacity` 移到契约模块；
    - `checkCapacity` 用 `readEstimate` helper；
    - 恢复标记的解析改为共用的 `restoredTag`；
    - 大包只构建一次；
    - 噪声字节改为循环填充；
    - CDP 覆盖流程抽成 `withQuotaOverride`；
    - 容量用例只取一次真实估算并注入。
  - 未采纳：去掉配额用例中独立的 `estimate()` 调用（该断言的目的就是比较检查结果与独立估算）。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md)补充 `evaluateCapacity`、`storage` 注入、`checkCapacity` 与取消语义；[工程约定](../../../../engineering/README.md)的资源缓存 E2E 说明加入存储不可用的注入、`onEvent` 取消时机，以及 Chrome 154 下 CDP 配额覆盖的实测行为与用例做法。关闭时把工程约定中配额用例的说明改为修订后的断言方式。
