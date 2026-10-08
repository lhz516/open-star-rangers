---
type: plan
status: active
phase: P2
task: "12"
subtask: "04"
updated: 2026-10-07
---

# 04 — 资源平衡快照与控制样本

**契约来源：** [spec](../spec.md) 的 S-03、AC-04 与[资源平衡与主页面响应](../spec.md#资源平衡与主页面响应)中的“每轮返回菜单后”“逐轮相等”；本项交付辅助与控制样本，06–10 使用。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **快照与比较（计划新增 `e2e/support/resource-balance.ts`）：**
  - 每个文档一份快照：应用监听与观察器（React、Vite、测试分组单独归属并保持基线，未知分组不得直接忽略）、画布与上下文丢失、空闲观察窗口内应用的待处理与新增 rAF、Worker（按 ID 与作业关联：每个已启动作业至多一个 Worker，成功构造者在终态恰好终止一次，活动 Worker 为 0；构造即抛错时不要求存在 Worker）、AudioContext 状态（以 `close()` 的可观察终态为准）、查看器 GPU 计数、IndexedDB 的包与 payload 键集合。
  - 比较：返回菜单后与同文档菜单基线相等；同一查看项的暖态 GPU 计数逐轮相等；退出后自有资源为 0；包记录与 payload 键集合与完整清单一致，无孤儿或未完成记录。
  - 刷新前把旧文档的释放证据序列化到测试进程，刷新后重新建立基线；不能用刷新清空探针来证明释放。
  - 只有 `WEBGL_lose_context` 缺失时允许标注“未验证”，其他必测能力缺失直接失败。
- **探针扩展（按需修改 [browser-probes.ts](../../../../../e2e/support/browser-probes.ts)、[audio-playback.ts](../../../../../e2e/support/audio-playback.ts)）：**
  - 记录 Worker 发往页面的消息的 `type` 与 `stage`（不保留 payload 或其他内容），供 06 断言阶段顺序；
  - 补足作业关联与音频 `close()` 终态所需的字段。既有快照字段与语义不变，[probe-contract.spec.ts](../../../../../e2e/probe-contract.spec.ts) 与所有既有用例照常通过。
- **控制样本（计划新增 `e2e/resource-balance-controls.spec.ts`）：** 用例故意泄漏一个监听、一个观察器、一个持续 rAF、一个未终止的 Worker、一个未关闭的 AudioContext，辅助逐项报告；干净路径通过。

## 不包含

- 联合闭环与失败矩阵中的使用（06–10）。
- 改变应用代码的释放行为；发现释放缺陷时按 spec 技术决定 15 回到责任任务。

## 关键文件与契约

- [joint-resources.spec.ts](../../../../../e2e/joint-resources.spec.ts)：3 轮往返、计数逐轮相等的参照。
- [viewer-observations.ts](../../../../../e2e/support/viewer-observations.ts) 的 `viewerDiagnostics`；[resource-cache.ts](../../../../../e2e/support/resource-cache.ts) 的 `readStoredRecords`（只读使用，不修改）。
- 计划新增的两个文件见上。

## 写入范围

- `e2e/support/resource-balance.ts`：快照与比较。
- `e2e/support/browser-probes.ts`：消息类型/阶段与作业关联字段。
- `e2e/support/audio-playback.ts`：音频关闭终态字段。
- `e2e/resource-balance-controls.spec.ts`：控制样本。

## 验收标准

- [ ] 控制样本中 5 类故意泄漏各被报告，干净路径通过；两个项目都通过。
- [ ] 探针记录 Worker 消息的类型与阶段，不保留消息内容；既有探针字段不变，`probe-contract.spec.ts`、`joint-resources.spec.ts`、`import-worker.spec.ts`、`audio-playback.spec.ts` 照常通过。
- [ ] 辅助支持刷新前保存释放证据与刷新后重建基线；GPU 暖态计数比较要求相等。
- [ ] `pnpm typecheck`、`pnpm lint` 与受影响 E2E 通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 使用合成数据：`pnpm exec playwright test e2e/resource-balance-controls e2e/probe-contract e2e/joint-resources --project=development` 与 `--project=production`，再运行 `e2e/import-worker e2e/audio-playback --project=development`。
- 不涉及原版对照。

## 完成证据
