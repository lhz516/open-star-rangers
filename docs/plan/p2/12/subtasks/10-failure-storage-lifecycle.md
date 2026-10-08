---
type: plan
status: active
phase: P2
task: "12"
subtask: "10"
updated: 2026-10-07
---

# 10 — 失败矩阵：存储失败与生命周期（F-13、F-14）

**契约来源：** [spec](../spec.md) 的 S-04、S-03（生命周期回归）、[失败矩阵](../spec.md#失败矩阵) F-13、F-14 与[失败不变量](../spec.md#失败不变量)；AC-09、AC-10。
**依赖：** 01, 02, 04, 05。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

计划新增 `e2e/failure-storage-lifecycle.development.spec.ts`：

- **F-13 存储失败与隔离：**
  - 提交返回 `quota-exceeded`、`storage-unavailable`、`write-failed` 时，新包保留在内存（“仅在内存中”及 code），失败前已有的有效磁盘记录逐字段不变，重试后保存成功。页面注入的故障只证明反馈。
  - 回滚与中断用真实 IndexedDB 证明：真实配额（[resource-cache.ts](../../../../../e2e/support/resource-cache.ts) 的 `withQuotaOverride`、`withPersistentProfile`）与事务已写入部分请求时的 abort 或页面中断（`installIdbProbe`、`armHold`），不留完成标记，旧包可恢复。
  - 恢复返回 `not-found`、`cache-corrupt`、`cache-incompatible` 时显示重新导入提示，不持有资源；比较基线是注入删除或损坏之后的存储状态。
  - 不同来源指纹与转换器版本的条目并存（`seedPackage` 覆盖参数），按键隔离，不删除旧版本；元数据不兼容的条目在菜单筛除，元数据通过但内容不兼容的由恢复拒绝。
  - I-5 在缓存类至少一行：恢复失败且无包时可重新导入。
- **F-14 重入与生命周期：**
  - 作业运行中离开再进入、试听中返回菜单：对应所有者基线正确，新作业与新查看可以开始。
  - 查看器 Fast Refresh：比较新所有者的活动基线，不要求画布为 0；最终离开才验菜单基线。复用 [fast-refresh.spec.ts](../../../../../e2e/fast-refresh.spec.ts) 的可还原编辑；需要共享时把辅助提取到计划新增的 `e2e/support/fast-refresh.ts`，原用例行为不变，测试结束后还原文件。
  - StrictMode 与卸载：卸载后不再通知。
  - 真实 `hidden → visible`：用 [native-lifecycle.ts](../../../../../e2e/support/native-lifecycle.ts) 的原生浏览器（与 [audio-playback.spec.ts](../../../../../e2e/audio-playback.spec.ts) 相同的做法），在查看器中有声音播放与待播放意图时隐藏标签页：声音停止、意图取消，恢复后不补播。不用派发事件代替真实隐藏；02 的采集器附加到该浏览器。
- 全部用例启用 02 的审计并以零意外违规结束。

## 不包含

- 底层缓存适配的事务语义本身（P2-10 已验证）；输入、内容与 Worker 失败（08、09）。
- 修改生产代码；发现缺陷时回到责任任务。

## 关键文件与契约

- [resource-cache-contract.ts](../../../../../src/platform/storage/resource-cache-contract.ts) 的失败码；[resource-cache.spec.ts](../../../../../e2e/resource-cache.spec.ts) 的真实配额与中断做法；[cache-recovery.spec.ts](../../../../../e2e/cache-recovery.spec.ts)。

## 写入范围

- `e2e/failure-storage-lifecycle.development.spec.ts`：F-13、F-14 的浏览器用例。
- `e2e/support/resource-cache.ts`：按需补充的存储辅助。
- `e2e/support/fast-refresh.ts`：按需提取的 Fast Refresh 辅助。
- `e2e/fast-refresh.spec.ts`：改用提取后的辅助，行为不变。

## 验收标准

- [ ] AC-09（存储）：提交失败保留新内存包、旧磁盘包不变、重试可保存；真实部分写入 abort 或中断不留完成标记且可恢复旧包；三种恢复失败被拒绝或菜单筛除；不同版本与指纹隔离、不清理。
- [ ] AC-09（生命周期）：重入、Fast Refresh、StrictMode、卸载与真实隐藏/恢复符合对应基线；隐藏后声音与待播放意图停止，恢复不补播。
- [ ] I-5 在缓存类有一行断言；与 08、09 合计覆盖六类。
- [ ] AC-10（本用例）：审计零意外违规，含原生浏览器部分。
- [ ] `pnpm typecheck`、`pnpm lint` 与 `pnpm exec playwright test e2e/failure-storage-lifecycle e2e/fast-refresh --project=development` 通过；工作区没有遗留的 Fast Refresh 编辑。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)：合成数据、测试自有的持久 profile 与隔离 context，结束后删除；真实可见性按该 skill 的有界步骤取得，取不到时为 blocked，不用模拟代替。
- 不涉及原版对照。

## 完成证据
