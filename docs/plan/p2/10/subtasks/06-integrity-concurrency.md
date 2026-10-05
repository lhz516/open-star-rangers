---
type: plan
status: active
phase: P2
task: "10"
subtask: "06"
updated: 2026-10-05
---

# 06 — 存储损坏、不兼容与并发

**契约来源：** [spec](../spec.md) 的 S-05、S-06、S-07（损坏部分），AC-08、AC-11；[行为与边界](../spec.md#行为与边界)的损坏、不兼容与并发行，[持久化与兼容](../spec.md#持久化与兼容)。
**依赖：** 03。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **损坏与不兼容的端到端验证：** 在隔离 context 中按 02 导出的常量直接改写真实记录（故障注入，表示存储损坏或旧构建写入），确认恢复与列出经 02 的读取和 `validatePackage` 得到预期结果，且不删除、不修改任何记录。发现的缺口在 `browser-resource-cache.ts` 或 `resource-cache-records.ts` 中修正，并补对应 Node 测试。
- **恢复预算：** 清单声明的 payload 字节超出恢复限值时返回 `over-budget`，并由探针证明没有发出 payload 记录的读取请求。
- **并发：** 验证 03 的事务设计满足 spec 的快照与原子性：同键并发提交、提交进行中的并发恢复，覆盖“已有旧包”与“首次导入”两种情况。需要时修正适配器，不引入锁或额外记录。

## 不包含

- 记录格式迁移、自动删除损坏记录或修复（P5 或后续任务）。
- 提交前校验（03）、取消与配额（04）、连接生命周期（05）。

## 关键文件与契约

- **修改：** `e2e/resource-cache.spec.ts`、`e2e/support/resource-cache.ts`；必要时 `src/platform/storage/browser-resource-cache.ts`、`src/platform/storage/resource-cache-records.ts` 与其测试（均由 01–03 新增）。
- **只读复用：** [completeness.ts](../../../../../src/content/completeness.ts) 的 `validatePackage`、[synthetic-content.test-support.ts](../../../../../src/content/synthetic-content.test-support.ts)。

## 验收标准

- [ ] AC-08（`cache-corrupt`）：包记录缺字段、键与身份不一致、计数与清单不符、payload 记录缺失、payload 记录多余、payload 同长度改写、payload 长度改变、来源状态改为未验证，恢复都返回 `cache-corrupt`，有 P2-01 诊断时附上。
- [ ] AC-08（`cache-incompatible`）：格式标识未知、`formatVersion` 为 2、内容 schema 为 2、切片定义版本为 2，恢复都返回 `cache-incompatible`。
- [ ] AC-08（预算）：清单声明的 payload 字节超出恢复限值时返回 `over-budget`，探针显示没有读取 payload 记录。
- [ ] AC-08（共同）：以上任何情况都不返回部分包，改写后的记录在操作前后逐条相同；列出把元数据层面的损坏与不兼容条目标为 `corrupt` 与 `incompatible`，payload 层面的损坏不影响列出状态。
- [ ] AC-11：同键两个不同的包并发提交后，恢复完整等于其中之一；已有有效包时，提交进行中并发恢复得到完整旧包或完整新包；该键此前不存在时，并发恢复得到 `not-found` 或完整新包；都不混合。两个适配器句柄各自持有连接。
- [ ] `pnpm check` 与 `pnpm test:e2e resource-cache.spec.ts --project=development` 通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 在隔离 context 中运行；改写记录是对存储损坏的合成故障注入，证据中注明，按实际导出常量定位记录。
- 并发用例比较恢复结果与两个候选包的 payload 指纹，断言只等于其中一个；多次运行并记录各次观测到的结果分布。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查；有代码修改时运行 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
