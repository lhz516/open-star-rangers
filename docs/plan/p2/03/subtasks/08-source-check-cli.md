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

- [x] AC-12（自动化部分）：用自有临时目录中的合成 CloneCD 文件组（注入合成白名单与研究封包列表）测试：
  - 成功报告的身份、各封包计数与读取用量正确；
  - 识别失败、封包或条目校验失败、研究封包缺失、打开失败、关闭失败、用法错误，各自输出稳定的 code 与对应的退出码；
  - 所有路径都关闭已取得的句柄；
  - 输出不含临时目录路径或植入的标记。
- [x] 未注入时，CLI 使用生产白名单与研究封包 `MAIN/COMMFACE.NOB`、`MAIN/COMMFAC2.NOB`。
- [x] AC-13（工具指南部分）：[工具指南](../../../../guides/tools.md)写明命令、参数、输出字段、退出码与“只用于本地原版数据”的约束。
- [x] `pnpm exec vitest run tools/source-check.test.ts tools/disc-check.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- `tools/` 相邻测试只操作自有临时目录，不读取 `local/`；用注入的打开函数模拟关闭失败。
- 不适用 browser-testing；真实基准盘运行在 09。

## 完成证据

- **实现：** [source-check.ts](../../../../../tools/source-check.ts) 的 `runSourceCheck(paths, options)`：
  - **打开输入：** 只读打开每个输入，句柄打开后立即登记，任何情况下都会关闭。
  - **识别：** 默认经产品入口 `openVerifiedSource` 识别；测试注入合成白名单时，使用它所封装的 `openDiscImage` + `identifySource`。
  - **封包：** 经已验证来源打开每个覆盖范围内的 `.NOB`，读取全部条目；再用同一组输入另开一个底层镜像句柄，检查研究封包（默认 `MAIN/COMMFACE.NOB`、`MAIN/COMMFAC2.NOB`）。
  - **报告：** 输出 `osr-source-check`/1：首个错误（只含 code 与位置）、关闭失败数、身份、每个封包的计数与最大值，以及各句柄 `sourceReadBytes` 之和。
  - **`main`：** 退出码为 0/1/2，Ctrl-C 取消；测试可传入检查选项。
  - `disc-check.ts` 未修改。
- **测试：** [source-check.test.ts](../../../../../tools/source-check.test.ts) 在自有临时目录写入合成 CloneCD 文件组，含未读填充文件，使默认预算等于输入大小：
  - **通过：** 身份为合成版本与相应指纹；3 个封包的计数、类型分布、已读条目数与最大值逐项正确；全部句柄关闭。
  - **默认路径：** 使用生产白名单，在 `file:/MAIN/AISTUFF.NOB` 返回 `unsupported-version`，句柄全部关闭。
  - **条目失败：** 在 `archive:/MAIN/R.NOB#30001.relocations[0]` 返回 `invalid-entry`，报告显示该封包已读 0 条。
  - **研究封包缺失：** 返回 `path-not-found`。
  - **输入与关闭：** 第二个输入打开失败报 `read-failed@input[1]`，已打开的句柄被关闭；关闭失败时计数为 1，并使原本通过的核对失败；关闭失败也不掩盖先前的 `invalid-entry`。
  - **取消与宿主错误：** 预先取消，以及在打开封包的读取期间取消，都返回 `cancelled`；植入标记的宿主读错误映射为 `read-failed`，输出不含标记与临时目录路径。
  - **`main` 与子进程：** `main` 对通过、失败、用法错误分别返回 0、1、2；子进程运行的退出码为 2 与 1，stdout 为 JSON 且不含临时路径。
- **变异检查：** 去掉研究封包循环后，有 3 个测试失败。
- **检查：**
  - `pnpm exec vitest run tools/source-check.test.ts`：10 个测试通过；
  - `pnpm check`：86 个测试文件 2,312 个测试与构建通过。
- **Rubber-duck：** 采纳两项阻塞意见与一组覆盖意见：
  - 默认路径改为真正经过产品入口；
  - `main` 接受测试选项，覆盖退出码 0，并增加子进程退出码测试；
  - 补充识别失败后关闭句柄、读取期间取消、错误与关闭失败并存、宿主读错误脱敏的用例。
- **Simplify（两个代理覆盖四个角度）：**
  - 采纳：坏封包 fixture 与白名单只定义一次。
  - 未采纳：
    - 与 `disc-check.ts` 共享打开与关闭句柄的 helper（需要改动 P2-02 工具，重复的逻辑很少）；
    - 消除相邻条目共享扇区的重复读取：真实盘约 4 MiB，约 5%，改动会改变计量语义。
- **文档影响：** [工具指南](../../../../guides/tools.md#来源核对)新增表格行与“来源核对”一节，写明命令、核对内容、输出字段、退出码、句柄与只用于本地原版数据的约束。工程约定无受影响内容。

