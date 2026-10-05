---
type: plan
status: active
phase: P2
task: "04"
subtask: "12"
updated: 2026-10-05
---

# 12 — P2-04 最终对齐验证

**契约来源：** [spec](../spec.md) 的全部 S-01 至 S-12、AC-01 至 AC-13，重点为 AC-08 至 AC-13 与[风险与恢复](../spec.md#风险与恢复)。
**依赖：** 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 13。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **覆盖核对：** 对照 spec、实际导出、测试与 01–11 的完成证据，逐项形成 S/AC 覆盖表。确认消息表、错误层与 code、验证顺序、命令与快照的每一项都有正负测试。
- **不变量核对：**
  - 至多一个活动作业与一个存活的 Worker；终态后 Worker 已终止、监听已移除；
  - 旧作业的消息不影响新作业；
  - `failed`、`cancelled` 不暴露来源身份与组；`finished` 不表示资源可用；
  - payload 不进入快照，只能一次性移交；
  - 主线程不读取文件字节；
  - 诊断、快照与 console 不含文件名、字节、宿主错误文本或绝对路径；
  - 协议模块与 app、platform 不触及 `original-data`；Worker 只经产品入口取得原版字节。
- **工程检查与提交范围：**
  - 运行 `pnpm check`、完整的 `pnpm test:e2e`、`pnpm check:original`、文档链接与元数据检查，以及 `node tools/task-state.ts p2/04`；
  - 审阅 goal 的全部提交，确认没有原版内容、二进制样本或 `local/` 输出，依赖清单与锁文件没有变化；
  - 确认 P2-01 至 P2-03 的契约测试与 P1 的浏览器回归保持通过。
- **交接核对：** 确认 spec 的范围外说明仍然准确：生产预览、CSP 与 SWA 回退，以及真实 StrictMode 与 Fast Refresh 归 P2-11；网络审计归 P2-12。
- **只核对，不实现：** 本子任务不新增功能代码。发现缺口时按 execute-goal 的补救流程新增子任务。

## 不包含

- 新功能、P2-05 及以后的转换、页面接线（P2-11），以及 P2 阶段退出评审（P2-13）。

## 关键文件与契约

- [spec](../spec.md)、[goal](../goal.md) 及 01–11 的完成证据。
- `src/workers/`、`src/app/import/`、`src/platform/workers/`、[vite.config.ts](../../../../../vite.config.ts)、[eslint.config.js](../../../../../eslint.config.js)、[engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts)、`e2e/import-worker.spec.ts`、[browser-probes.ts](../../../../../e2e/support/browser-probes.ts)。
- [源码结构](../../../../engineering/source-structure.md)、[工程约定](../../../../engineering/README.md)、[阶段索引](../../tasks.md)。

## 验收标准

- [x] S-01 至 S-12、AC-01 至 AC-13 逐项有实现与验证证据，没有未解释的缺口，也没有用代理证据替代要求；AC-08 至 AC-10 的证据来自真实 Chromium Worker，AC-12 的证据来自真实的本地基准运行。
- [x] `pnpm check`、完整的 `pnpm test:e2e` 与 `pnpm check:original` 通过；依赖清单与锁文件没有变化；仓库没有新增二进制样本或 `local/` 文件。
- [x] 文档、源码边界与测试发现一致，文档链接与元数据检查通过；`node tools/task-state.ts p2/04` 在标记完成后输出 `done`。

## 验证方法

- 运行上述命令，审阅 goal 范围内的 diff，并做文档链接与锚点检查。
- 浏览器与本地基准证据由 09、10、11 取得；本子任务核对其适用性，不以截图或模拟替代。

## 完成证据

- **第一次最终对齐（2026-10-05）：未通过。**
  - **工程检查：** `pnpm check`（93 个文件、2669 项测试、构建）、完整的 `pnpm test:e2e`（33 项）、`pnpm check:original`、文档链接与 `updated` 元数据都通过。
  - **提交审计：** `b1c7025..HEAD` 共 11 个提交、41 个文件，没有二进制文件，没有 `local/` 文件，依赖清单与锁文件没有变化。
  - **覆盖审计：** 由独立的 rubber-duck 逐项核对 S/AC 与不变量。S-02 至 S-11、AC-02 至 AC-12 与全部不变量都有直接证据；AC-08 至 AC-10 来自真实 Chromium Worker，AC-12 来自真实的本地基准运行。
  - **缺口：**
    - S-01/AC-01 要求“校验结果冻结”。`readImportWorkerMessage` 对 `group` 消息只冻结 `input` 外层，`manifest`、`payloads`、`sources` 及其内部容器仍可修改；协议测试把它们排除在冻结检查之外。源码结构“读取函数返回冻结的副本”的说法与此不符。
    - 04 与 06 的工作范围把端口和 Worker 形状写成带 `transfer` 参数，spec 与实现都只有单参数的 `post(message)`、`postMessage(message)`。
  - **处理：** 按 execute-goal 的补救流程，新增 [13](./13-freeze-group-input.md) 并插在本行之前，本行改为依赖 13，回到 pending。
- **第二次最终对齐（2026-10-05）：通过。**
  - **补救：** [13](./13-freeze-group-input.md) 完成，提交 `d037df4`。协议读取就地冻结收到的组输入中可达的普通对象与数组，持有者只冻结自建的移交容器；04、06 的签名与源码结构的说法已更正。
  - **工程检查（HEAD）：**
    - `pnpm check` 通过：93 个文件、2671 项测试、构建，含 typecheck 与 lint；
    - 完整的 `pnpm test:e2e` 通过：development、production、development-headed 共 33 项；
    - `pnpm check:original` 通过（passed）；
    - goal 范围内全部文档的链接检查通过，`updated` 均为 2026-10-05；
    - `node tools/task-state.ts p2/04` 在标记完成后输出 `done`。
  - **提交审计：** `b1c7025..HEAD` 共 12 个提交。没有二进制文件，没有 `local/` 文件，`package.json` 与 `pnpm-lock.yaml` 没有变化。`pnpm check:original` 检查了索引与工作树，不含原版内容。
  - **复核：** 由独立的 rubber-duck 复核，S-01、AC-01、S-12、AC-13 均为 met；S-06、AC-06、AC-07 没有回归；结论为对齐。其余各项沿用第一次审计的 met 结论，相关代码在补救中未改动。
  - **覆盖汇总：**

    | 范围项/验收项 | 实现 | 验证证据 |
    |---|---|---|
    | S-01、AC-01 | 01、13 | 协议表驱动测试（含深度冻结，无豁免）；07 的结构化克隆往返 |
    | S-02、AC-02 | 02 | 宿主假端点与 `MessageChannel` 测试 |
    | S-03、AC-03 | 03 | 作业测试；09 的浏览器生产入口；11 的本地基准 |
    | S-04 | 06 | 适配单元测试；09、10 的真实 Chromium |
    | S-05、AC-04、AC-05 | 04 | 持有者状态机与隔离测试；10 的浏览器取消、重试与释放 |
    | S-06、AC-06 | 05、13 | 组结果、移交与不可变测试；07 的转移；09 的四组 |
    | S-07 | 04 | 迟到消息与顺序测试；10 的重试隔离 |
    | S-08 | 01、02、04、05 | 错误转换；07 与 10 的隐私标记 |
    | S-09、AC-11 | 06、08 | lint 与依赖图的正负样本；`vite.config.ts`；`pnpm check`；依赖不变 |
    | S-10 | 02–10 | 全部测试只用代码生成的合成数据；不新增二进制样本 |
    | S-11、AC-12 | 11 | 本地基准 Node 运行，结论 passed |
    | AC-07 | 07 | Node `MessageChannel` 集成 |
    | AC-08 | 09 | Playwright 开发项目（真实 Chromium Worker） |
    | AC-09、AC-10 | 10 | Playwright 开发项目，事件顺序与探针证据 |
    | S-12、AC-13 | 01–10、13 | 源码结构与工程约定；阶段索引链接；文档检查 |

  - **不变量：** 以下都有直接证据（详见第一次审计与各子任务证据）：
    - 至多一个活动作业与一个存活的 Worker，终态后 Worker 已终止、监听已移除；
    - 旧消息不影响新作业；
    - `failed` 与 `cancelled` 不含身份与组，`finished` 不表示资源可用；
    - payload 不进入快照，只一次性移交，且移交前不可修改；
    - 主线程只读取 `Blob.size`；
    - 诊断、快照与 console 不含文件名、字节、宿主错误文本或绝对路径；
    - 协议、app 与 platform 不触及 `original-data`，Worker 只经产品入口。
  - **交接核对：** spec 的范围外说明仍然准确。生产构建中的 Worker、生产预览、CSP、SWA 回退、真实 StrictMode 与 Fast Refresh 归 P2-11；06 的构建探针已确认引用工厂时会产出独立的 ES 模块 Worker chunk。网络审计归 P2-12。Firefox/WebKit 与实机归 P5。

