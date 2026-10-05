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

- [ ] AC-10（空间判定部分）：Node 测试覆盖足够、刚好相等、不足、`usage` 大于 `quota`、缺失、`NaN`、`Infinity`、负数与非法 `requiredBytes`。
- [ ] AC-10（浏览器部分）：缺失工厂、打开时抛出 `SecurityError`、抛出 `InvalidStateError` 三种注入下，提交、列出、恢复都返回 `storage-unavailable`，提交从不返回 `committed`；`StorageManager` 缺失、`estimate()` 拒绝、返回非有限数时空间检查为 `unknown`。
- [ ] AC-05：调用时已取消 → `cancelled`，记录不变；写请求已发出、事务仍可中止时取消 → 探针观测到原生 `abort()` 与 `abort` 事件，返回 `cancelled`，同键旧包仍能恢复，没有新包的记录；事务已进入提交阶段或 `complete` 后取消 → `committed`，新包可恢复。证据至少包含一次写请求发出后的原生 `abort`。
- [ ] AC-06：默认配额下提交旧包；经 CDP 把配额设为高于当前用量、低于新包需求后，空间检查为 `insufficient`，数值与页面内 `navigator.storage.estimate()` 一致；提交新包返回 `quota-exceeded`，旧包仍能恢复，没有新包的记录；恢复默认配额后同一提交成功。若 CDP 方法不可用或没有产生真实配额错误，本项不通过，子任务保持 blocked 并记录探测结果。
- [ ] AC-16（本子任务部分）：工程约定记录 CDP 配额覆盖、工厂注入与配额覆盖不可用时的处理。
- [ ] `pnpm check` 与 `pnpm test:e2e resource-cache.spec.ts --project=development` 通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 在隔离 context 中运行；注入只用于表示“能力缺失”或“打开失败”，不用于证明事务或配额行为。
- AC-05 的取消时机由探针控制与记录：在探针观测到写请求后再触发 signal；“提交阶段”用 `complete` 之后取消与 `abort()` 抛出 `InvalidStateError` 两种观测之一证明。
- AC-06 证据记录 CDP 方法可用性、配额、用量、需求与宿主错误名。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
