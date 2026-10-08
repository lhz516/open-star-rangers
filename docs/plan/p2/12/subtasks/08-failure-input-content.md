---
type: plan
status: active
phase: P2
task: "12"
subtask: "08"
updated: 2026-10-07
---

# 08 — 失败矩阵：输入、版本、内容与任务（F-01 至 F-10）

**契约来源：** [spec](../spec.md) 的 S-04、[失败矩阵](../spec.md#失败矩阵) F-01 至 F-10 与[失败不变量](../spec.md#失败不变量) I-1 至 I-6；AC-06、AC-07 的浏览器部分、AC-10。
**依赖：** 01, 02, 04, 05。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

计划新增 `e2e/failure-input-content.development.spec.ts`，经真实页面的文件选择控件触发 F-01 至 F-10：

- **I-1：** 页面的类别文字、layer、code、位置与限值等于 05 写定的预期表；任务失败显示为 `MissionLoadState` 的 Core/content 诊断，部分包显示完整性诊断，都不伪装成 import 层错误。
- **I-2：** 按失败所在层核对状态：作业异常不接受本次组、保留已有包（部分行先持有一个包再触发）；正常结束的部分包替换为其已完整的组但不保存；完整新包的任务失败照常保存，但不显示“任务可载入 Core”。每行证据写明前置状态与预期终态。
- **I-3、I-4：** 用 04 的辅助核对 Worker 与登记。
- **I-5：** disc、source、content 三类各至少一行：可查看按 I-2 应持有的包（原包须保留的行核对身份与像素不变），并能开始新作业。
- **I-6：** 页面诊断、控制台与快照不含私人文件名、原始异常或内容标记；文件输入控件自身显示的名称不算泄露；P2-11 允许显示的 Asset ID、包身份与结构摘要可以出现。
- **F-04：** 恰等于与超出 1 成对；**F-08：** 两种坏引用分别命中来源引用错误与全包 `incomplete` 诊断；**F-10：** 两种情况分别核对。
- 全部用例启用 02 的审计并以零意外违规结束。

## 不包含

- Worker 故障、取消与迟到结果（09）；存储与生命周期（10）；Node 预期（05）。

## 关键文件与契约

- 参照 [import-page.spec.ts](../../../../../e2e/import-page.spec.ts) 的失败场景用例与 [viewer-page.spec.ts](../../../../../e2e/viewer-page.spec.ts) 的任务不可载入用例；05 的预期表与 fixture；[resource-status.ts](../../../../../src/app/resources/resource-status.ts) 的状态成立条件。

## 写入范围

- `e2e/failure-input-content.development.spec.ts`：F-01 至 F-10 的浏览器用例。

## 验收标准

- [x] AC-06：F-01 至 F-06 的每行满足适用的 I-1 至 I-4 与 I-6；F-04 覆盖 disc 限值与转换预算的边界与超限。
- [x] AC-07：F-07 至 F-10 的每行满足适用的不变量；坏 payload/引用在通过来源识别后命中目标校验；部分包只供诊断、不保存；完整新包的任务失败如实显示。
- [x] I-5 在 disc、source、content 三类各有一行断言。
- [x] AC-10（本用例）：审计零意外违规。
- [x] `pnpm typecheck`、`pnpm lint` 与 `pnpm exec playwright test e2e/failure-input-content --project=development` 通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)：合成数据、隔离 context；浏览器断言与 05 的 Node 断言使用同一预期表。
- 不涉及原版对照。

## 完成证据

- **用例与运行（2026-10-07）：** [failure-input-content.development.spec.ts](../../../../../e2e/failure-input-content.development.spec.ts) 对 05 的 `FAILURE_MATRIX` 每一项生成一个用例（20 个，覆盖 F-01 至 F-10），经测试入口 `?worker=<场景>` 与导入页文件选择控件触发。`OSR_E2E_DEV_PORT=5124 OSR_E2E_PREVIEW_PORT=5125 pnpm exec playwright test e2e/failure-input-content --project=development`：20 passed（约 2.5 min），连续多次运行均通过。环境：macOS 26.6、Google Chrome 155.0.8059.39（Playwright `channel: 'chrome'`，headless）、Node 22.22.0、视口 1280×800、DPR 1、来源 `http://127.0.0.1:5124`，每个用例独立 context。
- **前置状态与终态（I-2，每行记入 `failure-row` 注解）：** 每行先持有一个已保存的包：
  - `models` 场景（F-01、F-02、F-03、F-04 两个 disc 用例、F-05、F-06）先导入切片光盘；
  - `content-invalid`（测试入口保持生产 profile）恢复 `seedProductionCache` 预置的 `models` 包；
  - 其余场景恢复按其 profile 用 `seedPackage` 预置的合成包。

  终态按表的 `holder` 断言：
  - `unchanged`（14 行）：菜单状态逐字不变（含恢复/保存耗时），查看器身份行不变；IndexedDB 记录（包记录与每个 payload 的长度、摘要）与行前相同。
  - `partial-unsaved`（F-04 预算恰等于、F-08 跨组依赖缺失、F-10 部分包）：部分包替换已持有的包，导入页与菜单显示“Partial conversion”、按切片组顺序的组状态与部分包说明，无“Save again”；查看器列出其组状态；磁盘记录仍是原预置包。
  - `complete-saved`（F-04 目录恰等于、F-10 任务不可载入）：新包替换并保存；存储记录等于 Node 中同一场景作业对同一文件转换后、用适配器自己的记录构造函数得到的包记录与 payload 摘要。F-10 显示“Mission does not load into Core”与 `mission/core-input` 诊断（位置 `input.wingmanRoster.content.options[0].craftType`），不显示 import 层错误。
- **I-1：** 失败行的 `data-category` 与类别句子来自独立写定的 P2-11 文案表；技术细节的 Layer/Code/Location/Limit 与表中 `expected.error` 逐项相等（Limit 按页面格式，Reason/Time 不在表中故不比较）。完成行的状态、组状态与任务结果按表断言。部分包的整包诊断路径（code/path/assetId）在 P2-11 页面上不显示，浏览器断言“Partial conversion”、组状态与部分包说明；路径由 05 的 Node 用例断言。
- **F-04 与识别顺序：** disc 目录记录 1,024（恰等于，完整保存）与 1,025（`disc/limit-exceeded`，`directoryRecords` 1,024/1,025）、图形 payload 预算 9,210（恰等于，部分包）与 9,209（`source/budget-exceeded`，`payloadBytes` 9,209/9,210）成对。超限前未读取/分配的证据在 05 的 Node 用例；浏览器经探针的 Worker 消息类型断言：
  - 作业自报结果的行：结果是唯一且最后的终态消息，所有消息属同一作业；
  - source/content 校验失败（F-04 预算、F-07、F-08 贴图缺失、F-09 内容）与完成行恰有一次 `identified`，即先通过来源识别再命中目标校验；
  - disc 失败与 F-05、F-06 的 `unsupported-version` 没有 `identified`。
- **I-3、I-4：** 用 04 的 `ResourceBalance` 在同一文档的菜单基线上检查（每行 3 至 4 次，均无问题）：Worker 各终止一次且至多一个作业，监听/观察器/画布/帧/音频回到基线，缓存键集合精确。行内：本次作业恰构造一个新 Worker、一个作业且离开导入页前已终止；导入页上应用的监听与观察器回到开始前的空闲集合。
- **I-5：** 下列行（disc 类 F-01、F-02、F-03、F-04 超限，source 类 F-05、F-06，content 类 F-09 `content-invalid`）在失败前后各打开一次查看器：身份行相同，第一张图像的像素样本与 Node 转换的同一包逐字节相同。随后开始新作业：切片光盘完整替换并保存，`content-invalid` 再次给出同一 content 错误且原包保留。两次作业各一个已终止的 Worker。
- **I-6：** 结果显示时、查看器打开时与用例结束时，页面文本与完整标记（含折叠的技术细节）都不含文件名标记 `MARKER`（`EXCEPTION_MARKER` 包含它）。页面与 Worker 的控制台、资源平衡快照也不含该标记。作业与持有者快照本身的隐私由 05 的 Node 用例断言。
- **AC-10：** 全部用例使用 02 的审计并登记文件名金丝雀。最终运行的 JSON 报告中，每个用例的 `network-audit` 附件均为 `complete: true`，页面与全部 Worker 目标已覆盖，违规 0、证据缺口 0、未发生的声明请求 0；`browser-errors` 为 0。
- **反证：** 临时改动表中 F-03 的位置、F-07 的场景与 F-08 跨组用例的任务预期后，对应用例失败；改动已还原。
- **检查：** `pnpm exec tsc -p tsconfig.e2e.json`、`pnpm exec eslint e2e/failure-input-content.development.spec.ts` 与 `pnpm check`（typecheck、lint、Vitest 154 files / 4589 tests、build）通过。
- **Rubber-duck：** 采纳四项：
  - 结果显示时立即做页面隐私检查；
  - 缓存比较从键/Asset ID 加强为完整包记录与 payload 摘要；
  - 识别须先于唯一终态消息；
  - 类别句子改用独立写定的文案表。

  浏览器无法读取作业/持有者快照，已注明由 05 的 Node 断言覆盖。
- **Simplify：** 已采纳：
  - 文案表改为普通常量；
  - 前置方式只计算一次；
  - 完整导入状态合为常量；
  - 行后只取一次探针快照；
  - 隐私检查改为一次页面求值。

  未采纳：
  - 复用 `readStoredRecords(page, true)`：会把全部 payload 字节传出页面；
  - 缓存 `expectedRecords` 或用 `modelsPackage()` 代替 F-04 恰等于用例的转换：节省可忽略，且预期应来自该行自己的文件；
  - 把前置方式、文案表或记录比较移入共享支持模块：超出写入范围。
- **文档影响：** 无需修改本写入范围内的文档。联合用例、失败矩阵与网络审计的运行说明归 25（工程约定）；本用例不产生原版事实或未知项变化。
