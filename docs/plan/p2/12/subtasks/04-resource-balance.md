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

- [x] 控制样本中 5 类故意泄漏各被报告，干净路径通过；两个项目都通过。
- [x] 探针记录 Worker 消息的类型与阶段，不保留消息内容；既有探针字段不变，`probe-contract.spec.ts`、`joint-resources.spec.ts`、`import-worker.spec.ts`、`audio-playback.spec.ts` 照常通过。
- [x] 辅助支持刷新前保存释放证据与刷新后重建基线；GPU 暖态计数比较要求相等。
- [x] `pnpm typecheck`、`pnpm lint` 与受影响 E2E 通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 使用合成数据：`pnpm exec playwright test e2e/resource-balance-controls e2e/probe-contract e2e/joint-resources --project=development` 与 `--project=production`，再运行 `e2e/import-worker e2e/audio-playback --project=development`。
- 不涉及原版对照。

## 完成证据

- **探针扩展（[browser-probes.ts](../../../../../e2e/support/browser-probes.ts)，既有字段与语义不变，只增字段）：**
  - `document`：每次安装生成的随机文档 ID，刷新后必然不同；
  - `workers[]` 增加 `jobs`（页面发出的 `start` 消息的 `jobId`）、`messages`（Worker 发往页面的每条消息只留协议记号形式的 `type`/`stage`、安全整数 `jobId` 与探针序号 `at`，不留 payload 或其他内容）与 `terminatedAt`；消息由构造时以原生方法挂上的监听记录，不计入监听登记；
  - `listeners[]` 增加 `element` 与 `detached`：React DOM 在单个元素上注册、且永不移除的非委托监听（如文件输入的 `invalid`、`<details>` 的 `toggle`）在开发中落入 `test` 分组、生产中落入 `other` 分组。探针只在注册之后 React 自己的 `__reactEvents$…` 集合才出现 `<type>__bubble` 时标为 `react`，因此之后应用在同一元素上的同类监听不会被误归属；
  - [audio-playback.ts](../../../../../e2e/support/audio-playback.ts) 增加 `records()`：每个 AudioContext 的状态与每次 `close()` 的结局（`pending`/`resolved`/`rejected`）。本机 Chrome 实测调用 `close()` 后 `state` 同步变为 `closed`，早于 promise 完成，所以“已关闭”以某次 `close()` 已 resolve 为准。
- **辅助（[resource-balance.ts](../../../../../e2e/support/resource-balance.ts)）：**
  - 快照：探针在 400 ms 空闲窗口后的状态、音频记录，以及经独立只读连接读取的缓存键（与窗口并行；库不存在时中止升级，不会创建库）。读取只用导出常量，开发与生产预览都可用。
  - 比较（`compareBalance`，逐项列出全部差异）：
    - 所有分组的活动监听逐项等于同文档基线，未知分组不忽略；React 元素监听按类型计数比较仍在文档中的元素，随元素离开文档的视为随元素释放；
    - 有目标的观察器与基线相同；连接中的画布与基线相同，离开文档且有 `WEBGL_lose_context` 的画布必须已丢失上下文，缺该扩展的只记为未验证并加 annotation；
    - 空闲窗口内应用的待处理 rAF 最大值为 0（窗口开始时已挂起、窗口内送达的一次性帧也算）；
    - 每个 Worker 恰好终止一次、至多一个作业。作业 ID 属于各自的导入 owner，新导入页面重新从 1 开始，所以不跨 Worker 比较 ID；
    - 默认要求音频探针，每个上下文 `closed` 且 `close()` 已 resolve，应用音频节点不再接到 destination；
    - 期望包：用 `expectedPackage` 经缓存自身的 `readGroupInputs`/`inDefinitionOrder` 独立构造。包键集合、记录自身键、各组 Asset ID、声明数与 payload 键集合都必须完全一致，截断但自洽的记录也报告为不完整，其余 payload 报告为孤儿。
  - `ResourceBalance`：`start` 取菜单基线；`measure` 轮询至平衡或超时并返回报告；`check` 断言；`beforeReload` 在旧文档内检查并保存释放证据；`rebaseline` 只在文档已替换且证据已保存时取新基线，否则抛错；不同文档的比较只报告 `document`。`warm` 要求同一文档内同一项的暖态 GPU 计数与首轮相等，诊断缺失即失败；`attach` 附上全部基线、报告与暖态读数。
- **控制样本（[resource-balance-controls.spec.ts](../../../../../e2e/resource-balance-controls.spec.ts)，两个项目）：**
  - 泄漏由路由提供的同源模块 `/assets/osr-balance-leak.js` 发起，探针按应用代码归属。监听、观察器、持续 rAF、未终止 Worker、未关闭 AudioContext 各自只报告对应类别；撤销后 `check` 通过。另在 React 渲染的文件输入上挂应用 `invalid` 监听并保留已离开文档的元素，返回菜单后仍报告为 `other` 分组的新增监听。
  - 干净路径（生产入口）：
    1. 生产尺寸合成文件识别失败两次，每个 Worker 各有作业 1、终止一次；消息序列为 `ready, progress/identify-source ×23, failed`，消息对象只有 `at,jobId,stage,type`，全部早于终止；
    2. 预置生产身份合成缓存，`beforeReload` 后刷新：旧基线只报告 `document`，`rebaseline` 成功；
    3. 菜单恢复后检查；同一文档内 3 轮查看同一模型（暖态 GPU 相等）、试听、返回，每轮音频上下文 `closed` 且 `close()` 已 resolve，画布数逐轮加 1 且都已脱离、丢失上下文；
    4. 启动并退出演示后检查；
    5. 在测试 context 中删一个 payload、加一个孤儿，分别报告缺失与孤儿；
    6. 未经 `beforeReload` 再次刷新，`rebaseline` 被拒绝。
  - 纯比较用例：分组、React 元素监听、Worker、音频、画布、帧窗口、缓存（含自洽截断记录）与暖态 GPU 的正反样本。
- **检查：**
  - `pnpm check` 通过：类型检查、lint、152 个文件 4,531 条测试、构建；
  - `pnpm exec playwright test e2e/resource-balance-controls e2e/probe-contract e2e/joint-resources --project=development --project=production`：18 条通过；
  - `e2e/import-worker e2e/audio-playback --project=development`：最终版本 19 条通过（负载均值约 16 时）；
  - 审阅修正前的 `pnpm test:e2e` 全量 108 条通过。最终版本的全量运行中 107 条通过，唯一失败是 `audio-playback.spec.ts` 的真实隐藏用例：恢复可见 300 ms 后分析节点仍保留挂起前的峰值 0.5。机器负载均值约 20–30（并行 worker 会话）时，暂存本项全部改动、在基线提交上重复 8 次，同一断言失败 5 次（本项版本 7/8），属既有的环境时序问题，与本项改动无关；负载回落后最终版本上该用例通过（见上一条）。
- **Rubber-duck：** 采纳：
  - 作业 ID 按 owner 局部，不跨 Worker 判重；
  - 缓存按独立构造的期望清单核对；
  - React 归属只认注册后才出现的标记；
  - rAF 用窗口内最大待处理数；
  - 默认要求音频探针；
  - 暖态 GPU 账本按文档区分。

  未采纳“退出后 GPU 计数归零”：退出后查看器的 three.js 计数不可读，WebGL 层的存活对象即使应用正确释放也不为 0（three.js 自建空纹理）。按 spec 以画布脱离文档并丢失上下文为退出证据，以暖态计数逐轮相等证明不增长。
- **Simplify：** 采纳：
  - 复用 `readGroupInputs`/`inDefinitionOrder`、`frameWindow` 与 `enterDemo`；
  - 去掉报告中与快照重复的字段，暖态首轮由读数日志推出；
  - `readBalance` 改为模块私有，缓存读取与空闲窗口并行；
  - 缓存 React 标记键名。

  未采纳：
  - 把生产导入步骤提升为共享支持（需改写入范围外的文件）；
  - 把 Worker 协议从探针移出、对 React 标记另设通用来源（spec 要求作业关联，应用每个作业一个导入 Worker；打包代码中 React 帧不可按 URL 区分，标记失效时监听照常计入，用例会失败而不是漏报）；
  - 消息历史设上限（每个作业约 25 条）。
- **文档影响：** 现有工程约定对探针 `workers` 字段的描述仍然准确，只是未列新增字段。辅助与新字段的用法属 25 的写入范围，已在报告中提出，本项不改文档。不涉及 STATUS、阶段索引或原版文档。
