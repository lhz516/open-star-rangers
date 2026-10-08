---
type: plan
status: active
phase: P2
task: "07"
subtask: "17"
updated: 2026-10-08
---

# 17 — 最终对齐

**契约来源：** [spec](../spec.md) 的全部范围项 S-01 至 S-12 与验收项 AC-01 至 AC-21（S-12、AC-19 至 AC-21 为 2026-10-08 修订）；AC-15、AC-16 的最终核对。
**依赖：** 01、02、03、04、05、06、07、08、09、10、11、12、13、14、15、16、18、19、20、21。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

只做验证，不交付新功能代码。发现缺口时新增修复子任务（新 ID，插入本行之前并加入本行依赖），不在本子任务中修补。

- **覆盖核对：** 逐项核对 [goal 验收覆盖](../goal.md#验收覆盖)中每个 S 与 AC 都有完成证据，证据来自所列子任务。
- **不变量：**
  - 项目中只有一套图像记录转换、调色板展开与布局合成逻辑；
  - 布局 payload 不含 +44/+48（含义已确认为绘制遍与逐帧重绘，按技术决定 1 不进入 payload）或其他目录字段；规范内容中没有机型到图标的查找表；
  - 生产映射没有 `unconfirmed`；地图边框不绑定 DATA，除非 08 的证据证明它就是地图调色板；
  - `PRODUCTION_CONVERTER_VERSION` 含 `graphics` 组件，已有组件不变；协议版本与阶段集合未被本任务改变；
  - 发送第一个组之前完成全部校验；`cockpit-hud-map` 组不含 `models` 分区的 Asset，`models` 组按 P2-06 的规则发送（2026-10-06 前提更新）。
- **边界与隐私（AC-15）：** `content/` 新模块不导入 `original-data`、DOM、Node 或 Three.js；`original-data` 转换不使用 DOM；本任务新增的诊断不含原版字节、条目编号、偏移、文件名或宿主路径；nob-check 只输出计数与失败原因；`workers/` 不使用网络 API；没有新依赖，`package.json`、`pnpm-lock.yaml`、`.nvmrc` 不变。
- **工程检查：** `pnpm check`、`pnpm check:original`、`pnpm test:e2e e2e/import-worker.spec.ts --project=development`。
- **文档（AC-16）：** cockpit、hud、unknowns 记录了 AC-10 至 AC-12、AC-14、AC-17、AC-18 的事实、置信度与观察最大值；源码结构记录布局 payload 字节布局、子资源语法、限值名、错误码与新的 `ConverterVersion`；工具指南记录 nob-check 的新输出；[tasks.md](../../tasks.md) 只有导航；全部改动文档的 `updated:` 为执行日期；链接与元数据检查无问题；文档中没有原版内容。
- **提交范围：** 本任务的提交只触及 `src/`、`e2e/`、`tools/nob-check.ts`、`tools/nob-check.test.ts` 与文档；没有二进制文件、`local/` 路径、长十六进制或 base64 串、反编译标识符。
- **状态：** `node tools/task-state.ts p2/07` 与 tracker 一致；只有阶段摘要、下一步等发生变化时才更新 [STATUS](../../../../STATUS.md)。

## 不包含

- 新功能、研究或修补：缺口转为新的修复子任务。
- P2-12 的最终保真判定与 P2-13 的阶段评审。
- push、部署或其他外部操作。

## 关键文件与契约

- 只读核对全部本任务改动；必要时更新本 goal 的执行记录与 STATUS。

## 验收标准

- [x] 每个 S 与 AC 都有对应子任务的完成证据。
- [x] 上列不变量全部成立。
- [x] AC-15：边界、隐私、依赖与锁文件检查通过；`pnpm check`、`pnpm check:original` 与聚焦 E2E 通过。
- [x] AC-16：文档事实、置信度、源码结构与工具指南齐全，链接与元数据检查通过，没有原版内容。
- [x] 提交范围核对通过；`task-state` 与 tracker 一致。

## 验证方法

- 运行上列命令并记录输出摘要；文档链接与元数据检查；`git diff` 与提交列表审阅。
- 浏览器证据引用 14 的结果；原版对照证据引用 07、08–11、15、16 的记录。

## 完成证据

- **覆盖：** goal 验收覆盖表中 S-01 至 S-11、AC-01 至 AC-18 列出的子任务（01–16、18）都已完成：验收项全部勾选，完成证据非空（逐个文件核对）。研究结论在 cockpit、hud 与 unknowns 中，各子任务的证据链接到相应小节。执行期的三次 spec 修订与前提更新都记录在 goal 执行记录与 spec 审批中：
  - 08：CCKD 分组调色板；
  - 09：10461 的 ID 与角色、11401 的中性 ID、BITM 10467；
  - rebase 后：P2-06 已落地。
- **不变量：**
  - `decodeImageRecord`、`expandImage` 与 `composeLayout` 各只有一个定义；
  - 布局 payload 不含 +44/+48 或其他目录字段；
  - `src/` 中没有机型到图标的查找表（只有生产映射注释提到图标）；
  - P2-07 的生产映射没有 `unconfirmed`（`unconfirmed` 只出现在 P2-06 的歧义贴图上）；
  - 地图边框绑定 `palette/map/screen`，不绑定 DATA；
  - `PRODUCTION_CONVERTER_VERSION` 为 `osr-import.graphics-2.logic-1.audio-1.models-1`，其余组件不变；
  - 本分支没有改动 `import-protocol.ts`，协议版本仍为 5，阶段集合不变；
  - 全部校验都在第一个组发送之前完成（13 的测试）；
  - `cockpit-hud-map` 组不含 `models` 分区的 Asset，`models` 组按 P2-06 的规则发送（2026-10-06 前提更新）。
- **AC-15：**
  - `content/graphics/layout-payload.ts` 与 `compose-layout.ts` 只导入 `content/` 内模块，ESLint 与 TypeScript 边界检查通过；
  - `src/workers/` 的生产代码没有 `fetch`、`XMLHttpRequest`、`WebSocket`、`sendBeacon` 或 `EventSource`；
  - 本分支对 `main` 没有改动 `package.json`、`pnpm-lock.yaml` 或 `.nvmrc`；
  - 新增诊断的 reason 只含格式规则（例如“must be 0 or 1”“must be 768 bytes”），不含原版字节、条目编号、偏移或路径；nob-check 只输出计数与失败原因。
- **工程检查（2026-10-06，rebase 后的最终提交）：**
  - `pnpm check`：134 个文件、4044 个测试与构建通过；
  - `pnpm check:original` 通过；
  - `OSR_E2E_DEV_PORT=4273 OSR_E2E_PREVIEW_PORT=4274 pnpm test:e2e e2e/import-worker.spec.ts --project=development`：16/16 通过；
  - `node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB`：38 个元素、3 个分组调色板、MFDD 每列表至多 9 个、TABL 每列表至多 29 个，失败 0。
- **AC-16：**
  - cockpit、hud 与 unknowns 记录了 AC-10 至 AC-12、AC-14、AC-17 与 AC-18 的事实、置信度与观察最大值（08、09、15、07/18、10、11）；
  - 源码结构记录布局 payload、子资源语法、限值名、错误码、`stepGroupDraft`、`cockpit-hud-map` 组与新的 `ConverterVersion`；
  - 工具指南记录 nob-check 的容器与分组调色板输出；
  - `tasks.md` 只改了导航；
  - 本分支改动的全部文档链接与锚点检查通过；每个文档的 `updated:` 等于其最后一次改动的日期（2026-10-05 或 2026-10-06）。
- **提交范围：**
  - 本分支相对 `main` 只改动 `src/`、`e2e/`、`tools/nob-check.ts`、`tools/nob-check.test.ts` 与 `docs/`，没有二进制文件或 `local/` 下的文件；
  - 新增行中没有反编译标识符（`FUN_`、`DAT_`、`LAB_`、`UNK_`、`unaff_`）、长十六进制串或 base64 串；
  - 文档只以文字提到被忽略的 `local/research/p2-07/` 脚本目录，与既有做法一致。
- **状态：**
  - `node tools/task-state.ts p2/07` 与 tracker 一致；
  - [STATUS](../../../../STATUS.md) 的当前阶段说明、阶段总览与下一步加入 P2-07 已完成及其摘要；P2-06 仍按其 goal 执行，未改动；
  - 没有新增修复子任务。
- **rubber-duck：** 指出 3 项问题，已全部修正：
  - 本子任务范围中 `models` 不变量的旧表述改为前提更新后的表述；
  - 提交范围明确允许 `tools/nob-check.test.ts`；
  - STATUS 开头的当前阶段说明加入 P2-07。

  抽查的验收证据与测试都存在，没有其他阻塞问题。

### 2026-10-08 复核（SNIP 与 DIAG 修订之后）

修订把本行退回 `pending`，19–21 完成后重跑受影响的核对，结果如下。

- **覆盖：** S-12 与 AC-19 至 AC-21 的证据在 [19](./19-snip-diag-research.md#完成证据)、[20](./20-snip-diag-conversion.md#完成证据)、[21](./21-snip-diag-local-check.md#完成证据)；S-08 至 S-11、AC-06、AC-09、AC-14 至 AC-16 的修订部分同样由这三项覆盖。修订记录在 spec 的审批、goal 的执行记录与 P2-01 spec 的审批中。
- **不变量：**
  - 图像记录解码、调色板展开与布局合成仍各只有一个实现；SNIP 帧经 `decodeSnipFrame` 得到普通图像 payload，不另设颜色逻辑；
  - 生产映射没有 `unconfirmed`；SNIP 帧与文字为 confirmed（U-030）；
  - `PRODUCTION_CONVERTER_VERSION` 为 `osr-import.graphics-3.logic-1.audio-1.models-3`，只有 `graphics` 递增；切片定义版本为 3；协议版本与阶段集合未改动；
  - `cockpit-hud-map` 组仍不含 `models` 分区的 Asset，`models` 组按 P2-06 的规则发送。
- **AC-15：** 新的 `content/hud/` 模块只导入 `content/` 内模块；新增诊断的原因只含格式规则，测试断言不回显文字；nob-check 只输出计数；`package.json`、`pnpm-lock.yaml`、`.nvmrc` 未改动。
- **工程检查（2026-10-08）：**
  - `pnpm check`：156 个文件、4,691 项与构建通过；
  - `pnpm --silent check:original`：`passed: true`，0 个发现；
  - `OSR_E2E_DEV_PORT=5163 OSR_E2E_PREVIEW_PORT=5164 pnpm test:e2e`：181 项全部通过（修正前 3 项失败的原因与处理见 20）；
  - `node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB`：失败 0（SNIP 1、DIAG 2 通过）；`MAIN/` 中其余封包失败 0。
- **AC-16：** hud（DIAG 10489 一节、SNIP 的转换与用户观察、资源缺口的状态）、unknowns 的 U-030、源码结构、工具指南与 P2-01 spec 已更新；改动文档的链接与锚点检查 0 个问题，`updated:` 为 2026-10-08；文档中没有原版文字、字节或反编译代码。
- **提交范围：** 只有 `src/`、`e2e/`、`tools/nob-check.ts`、`tools/nob-check.test.ts` 与 `docs/`；没有二进制文件或 `local/` 下的文件。本地脚本与输出在被忽略的 `local/research/p2-07/snip-diag/`。
- **状态：** `node tools/task-state.ts p2/07` 为 `done`，与 tracker 一致。STATUS 归 P2-12 协调者，本修订未改动。
- **残余：** P2-12 须在新候选上复核 SNIP 帧 6 与 `srangers_068.png`；P2-01 与 P2-07 spec 的 `reviewed:` 标记需要 review-spec 重新标记（见 20）。
