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

- [x] AC-09（存储）：提交失败保留新内存包、旧磁盘包不变、重试可保存；真实部分写入 abort 或中断不留完成标记且可恢复旧包；三种恢复失败被拒绝或菜单筛除；不同版本与指纹隔离、不清理。
- [x] AC-09（生命周期）：重入、Fast Refresh、StrictMode、卸载与真实隐藏/恢复符合对应基线；隐藏后声音与待播放意图停止，恢复不补播。
- [x] I-5 在缓存类有一行断言；与 08、09 合计覆盖六类。
- [x] AC-10（本用例）：审计零意外违规，含原生浏览器部分。
- [x] `pnpm typecheck`、`pnpm lint` 与 `pnpm exec playwright test e2e/failure-storage-lifecycle e2e/fast-refresh --project=development` 通过；工作区没有遗留的 Fast Refresh 编辑。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)：合成数据、测试自有的持久 profile 与隔离 context，结束后删除；真实可见性按该 skill 的有界步骤取得，取不到时为 blocked，不用模拟代替。
- 不涉及原版对照。

## 完成证据

- **环境与命令：** 2026-10-07，macOS 26.6，Node 22.22.0，Chrome 155.0.8059.39，开发项目单 worker（端口 5130/5131）。`pnpm exec playwright test e2e/failure-storage-lifecycle e2e/fast-refresh e2e/resource-cache.spec.ts e2e/cache-recovery --project=development`：36 passed（3.0 min），其中新用例 12 条、fast-refresh 3 条，另两组复核本子任务改动的缓存辅助。最终提交前 `pnpm exec playwright test e2e/failure-storage-lifecycle e2e/fast-refresh --project=development`：15 passed（1.9 min）；`pnpm check`（typecheck、lint、Vitest 154 文件 4594 用例、build）通过。用例在 [failure-storage-lifecycle.development.spec.ts](../../../../../e2e/failure-storage-lifecycle.development.spec.ts)，只用合成数据和测试自有 context 或原生浏览器 context。
- **F-13 提交失败（页面反馈）：** 测试入口 `cache=quota-exceeded|storage-unavailable|write-failed` 三条。预置同键合成旧包后导入切片光盘：导入页与菜单为“Held in memory only”，`save-failure` 的类别、句子与 Layer/Code/Location（`database`）/Reason 等于用例中预先固定的 P2-11 文案与 P2-10 reason；旧包记录 exact 读回逐字段不变；查看器身份与像素为新包。Save again 后存储恰为新包记录（Node 中同一 job 转换后由记录构建器生成的期望），刷新后列出、恢复并校验，身份与像素相同。
- **F-13 真实配额：** 首次 IndexedDB 使用前经 CDP 把源配额覆盖为 131072 B（读回 usage 0、`overrideActive`），预置旧包后 usage 86016 B，新包需求估计 208590 B。提交与随后的 Save again 各被 Chrome 以 `QuotaExceededError` 中止，IndexedDB 探针记录 readwrite 事务发出全部写请求后 abort；页面为 `cache/quota-exceeded`（Location `transaction`），记录 exact 不变。刷新后旧包列出、恢复并校验，身份为旧包；重置配额后新导入保存，刷新后恢复。
- **F-13 部分写入 abort 与页面中断：** `armHold` 使提交事务在发出全部写请求后保持未提交。第二次导入替换包时持有者中止第一次提交（探针：transaction → write → abort-call → transaction → write → abort），第二次提交同样保持打开时整页刷新。刷新后记录 exact 等于旧包（无新包记录与 payload，即无完成标记），旧包恢复并校验；随后新导入保存并可恢复。刷新前的释放证据：两个 Worker 各终止一次，菜单只多出进行中的提交的 abort signal 监听、排在打开事务后的列出，以及探针在两个打开事务上的监听（`checkExpecting` 精确核对）。
- **F-13 恢复失败（I-5 缓存类）：** 菜单列出后在测试自有连接上注入：删除该键包与 payload 记录、翻转一个 payload 首字节、包记录改为 formatVersion 2；比较基线是注入后的存储。恢复分别为 `cache/not-found`@`key`、`cache/cache-corrupt`@`groups`、`cache/cache-incompatible`@`record.formatVersion`，句子提示重新导入，不持有资源（无 View resources 与状态列表），存储 exact 不变。再次列出时缺失与不兼容条目不再提供，损坏条目仍提供且再次失败。无包时新导入保存，存储恰为新包，刷新后恢复（I-5）。
- **F-13 隔离：** 同指纹旧转换器版本 `…models-1`、另一指纹 `source:sha256:cdcd…` 与改写为 formatVersion 2 的期望键三条并存；适配器列出 compatible/incompatible/compatible，菜单不提供任何一条。导入只替换期望键，另两键记录 exact 不变，共 3 个包；刷新后只提供新包并恢复。
- **F-14 重入：** `busy` 作业运行中返回菜单，Worker 终止一次并回到菜单基线；再进入后作业持有者 serial 更大、live 为 1，新作业启动后取消。查看器两次在循环音播放中返回，两个 AudioContext 都已关闭且 `close()` resolved、routed 0，回到菜单基线，持有的包与记录不变。
- **F-14 Fast Refresh：** `use-viewer-owner.ts` 三次编辑加还原共 4 次替换。每次 owner 加 1、同一文档、恰一个新连接画布、旧画布断开且上下文丢失、旧音频上下文 close resolved、显示同一项；新所有者的活动登记（按组、元素、类型、阶段计数的监听，观察器，画布 1，Worker 0，未关闭音频 0，routed 0）等于首次打开的查看器，且可试听。最终离开后为菜单基线（4 个上下文全关闭，5 个画布断开且丢失）。`withEdits` 校验文件还原，`git status` 无 `src/` 改动。
- **F-14 StrictMode 与卸载：** 首次挂载的导入页 live 作业持有者为 1；首次打开的查看器 owner 为 1，一个画布、无音频上下文。卸载经离开页面：运行中的作业被终止，试听中的查看器被释放；带待播放意图离开后，被延迟的两次 `resume()` 以已关闭的上下文拒绝，之后无源启动、routed 0、页面 DOM 无变更（MutationObserver 计数 0），回到菜单基线。资源持有者随 App 存活：开发构建在 StrictMode 下其 effect 依赖稳定，Fast Refresh 不重跑（实测编辑 `use-resource-holder.ts` 后持有者与进行中的提交都未替换），文档内没有卸载 App 的步骤；StrictMode 重跑释放的持有者的迟到列出由 09 的 late listing 用例覆盖。
- **F-14 真实隐藏/恢复：** 原生有头 Chrome，CDP 自建 context 的两个标签页，用 `Target.activateTarget` 切换，不派发事件。循环音（`sound/warp` 换成合成循环方波、重新派生包身份后预置）播放时隐藏：控制器 suspended、voices 0、routed 0；恢复后 running，无新源启动。测试侧 resume 闸门只推迟真实 `resume()` 的执行，制造“可见但仍挂起”时的待播放意图：对照中保留的意图在放行后播放一次；隐藏时意图被丢弃，隐藏期间放行后控制器重新挂起，恢复后 running 且无源启动。可见性事件为 4 对 hidden/visible，原生页面无错误。
- **AC-10：** 每条用例 `audit` 无意外违规、无证据缺口、无缺失声明。金丝雀：导入用例的文件名标记，以及每个保存或预置的包的来源指纹、manifest 身份、最大 payload 的裸 SHA-256 与其中 16 字节，均以 `expectCacheArrival` 证明到达缓存。原生浏览器的两个标签页在导航前 `attachTarget`、关闭浏览器前 `audit.close`：报告 complete，3 个页面目标，无违规。
- **辅助改动：** Fast Refresh 编辑与 owner/画布读取提取到 [fast-refresh.ts](../../../../../e2e/support/fast-refresh.ts)，[fast-refresh.spec.ts](../../../../../e2e/fast-refresh.spec.ts) 改用它，3 条用例行为不变并通过。[resource-cache.ts](../../../../../e2e/support/resource-cache.ts) 新增 `comparableRecords`、`expectedRecords`、`damageStoredPackage`；`installIdbProbe` 在事务、open 请求或连接结束时移除自己的监听（否则资源平衡把它们算作应用监听），resource-cache 与 cache-recovery 用例通过。
- **rubber-duck：** 4 项均采纳：重试与再导入后都经刷新恢复；加入包身份与 payload 金丝雀及缓存到达证明；循环音包重新派生 manifest 身份；卸载检查等待被放行的 resume 结清并核对 DOM 无变更。持有者无法在文档内卸载的说明保留。**simplify：** 采纳读取函数与损坏注入提到辅助模块、`importSaved`、复用 `asciiBytes` 与 `sound()`、少量重复读取；未改 08 的私有记录辅助、`evaluate` 适配器的类型与原生点击辅助（均在写入范围外）。
- **文档影响：** 工程约定中的联合用例、失败矩阵与审计说明归 25；本子任务改动的辅助行为由函数注释说明，其余文档无需更新。
