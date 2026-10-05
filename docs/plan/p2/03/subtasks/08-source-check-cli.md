---
type: plan
status: active
phase: P2
task: "03"
subtask: "08"
updated: 2026-10-05
---

# 08 — 本地来源核对 CLI

**契约来源：** [spec](../spec.md) 的 S-13（CLI 部分）；AC-12（自动化部分），以及 AC-13 的工具指南部分。
**依赖：** 05。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **CLI：** 新增 `tools/source-check.ts`，参数为 CloneCD 文件组路径（`.ccd`、`.img`，可选 `.sub`、`.cue`）。
  - 用 [NodeByteSource](../../../../../tools/node-byte-source.ts) 打开文件，经 05 的产品入口识别（生产白名单）；
  - 经已验证来源打开每个覆盖范围内的 NOB，并读取、校验其全部条目；
  - 另经 03 的底层打开函数，以同样方式检查研究用封包 `MAIN/COMMFACE.NOB` 与 `MAIN/COMMFAC2.NOB`；
  - 程序化入口允许测试注入白名单、研究封包列表与打开函数。
- **输出：** stdout 只有一份 `osr-source-check`/1 JSON：
  - `passed`、`error`（结束核对的首个失败，只含 code 与位置）、`closeFailures`；
  - `identity`（版本 ID、指纹、覆盖文件数）；
  - 每个封包的规范路径、来源（已验证或研究）、条目数、按类型的计数、读取并通过的条目数、最大数据块与最大重定位个数；
  - `sourceReadBytes`。

  不输出宿主路径、文件内容或宿主错误文本。
- **行为：**
  - 退出码：通过为 0，失败为 1，用法错误为 2；
  - 在成功、打开失败、识别失败、读取失败与取消时都关闭已取得的句柄；关闭失败单独计数，不被先前错误掩盖；
  - 复用 [disc-check.ts](../../../../../tools/disc-check.ts) 的模式，必要时抽出共用 helper，但不改变 disc-check 的行为。
- **文档：** 在[工具指南](../../../../guides/tools.md)中补充表格行与“来源核对”一节。

## 不包含

- 在基准盘上实际运行，以及原版事实记录（09）。
- 修改产品入口、白名单或封包规则。

## 关键文件与契约

- **计划新增：** `tools/source-check.ts`、`tools/source-check.test.ts`。
- **复用：** [node-byte-source.ts](../../../../../tools/node-byte-source.ts)、[disc-check.ts](../../../../../tools/disc-check.ts) 的报告与关闭模式；05 的产品入口与底层识别；03 的封包打开函数；04 的合成白名单 helper。
- **文档：** [工具指南](../../../../guides/tools.md)。

## 验收标准

- [ ] AC-12（自动化部分）：用自有临时目录中的合成 CloneCD 文件组（注入合成白名单与研究封包列表）测试：
  - 成功报告的身份、各封包计数与读取用量正确；
  - 识别失败、封包或条目校验失败、研究封包缺失、打开失败、关闭失败、用法错误，各自输出稳定的 code 与对应的退出码；
  - 所有路径都关闭已取得的句柄；
  - 输出不含临时目录路径或植入的标记。
- [ ] 未注入时，CLI 使用生产白名单与研究封包 `MAIN/COMMFACE.NOB`、`MAIN/COMMFAC2.NOB`。
- [ ] AC-13（工具指南部分）：[工具指南](../../../../guides/tools.md)写明命令、参数、输出字段、退出码与“只用于本地原版数据”的约束。
- [ ] `pnpm exec vitest run tools/source-check.test.ts tools/disc-check.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- `tools/` 相邻测试只操作自有临时目录，不读取 `local/`；用注入的打开函数模拟关闭失败。
- 不适用 browser-testing；真实基准盘运行在 09。

## 完成证据
