---
type: plan
status: active
phase: P2
task: "06"
subtask: "21"
updated: 2026-10-08
---

# 21 — MESH 贴图坐标块的读取补救

**契约来源：** [spec](../spec.md) 的 S-03、AC-03 与[持久化与兼容](../spec.md#持久化与兼容)（2026-10-08 修订，见 spec [审批](../spec.md#审批)）。
**依赖：** 02。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。由 2026-10-08 经用户批准的修订加入，见 [goal 执行记录](../goal.md#执行记录)。

## 工作范围

- **追踪（前提）：** 只读追踪原版 MESH 载入路径（类型回调表 `0x1766b4` 的 MESH 行），确定贴图坐标块按两个连续数组还是每顶点一对使用。结论相反或不能确定时停下，不改代码。Ghidra 输出只放在被忽略的 `local/research/p2-06/mesh-uv/`，文档只记地址与作用。
- **读取：** `readMesh` 把贴图坐标块读为两个连续数组（先全部 u，后全部 v），输出仍为每顶点一对；浮点逐位保留与有限性检查不变。payload schema 与布局不变。
- **测试数据与测试：** 合成 MESH 构建器按原版布局写入贴图坐标块，输入仍为每顶点一对；增加一条区分两种布局、不依赖构建器的测试；其余测试同步。
- **版本：** 模型转换器组件 `models-2` → `models-3`，生产 `ConverterVersion`、主线程生产包配置与相关断言同步。
- **文档：** mesh §1 的置信度、追踪地址与读取器状态；executable 的代码地标；unknowns 的 U-001；源码结构中 MESH 读取、合成构建器与转换器版本的说明。
- **本地复核：** 复跑 09 的本地基准与全量 nob-check，并用独立于 `readMesh` 的解码核对全部 MESH 的贴图坐标。

## 不包含

- 呈现约定与查看器（P2-11）；模型贴图的视觉复核（P2-12/29）。
- 源码结构“呈现约定”一节与[本地导入指南](../../../../guides/local-import.md)“呈现限制”中的模型贴图说明，以及 STATUS：由 P2-12 在新候选上复核后更新。
- u、v 轴向与原版贴图环绕方式的进一步研究。

## 关键文件与契约

- [formats/mesh.ts](../../../../../src/original-data/formats/mesh.ts)、[synthetic.ts](../../../../../src/original-data/synthetic.ts)、[convert-models.ts](../../../../../src/original-data/conversion/convert-models.ts) 的 `MODEL_CONVERTER_COMPONENT`、[production-package.ts](../../../../../src/workers/production-package.ts)，以及断言转换器版本的测试。
- 原版证据：[mesh §1](../../../../original/formats/mesh.md#texture-coordinate-block-order-confirmed)。

## 写入范围

- `src/original-data/formats/mesh.ts`、`src/original-data/formats/mesh.test.ts`：读取与布局测试。
- `src/original-data/synthetic.ts`：合成 MESH 构建器。
- `src/original-data/conversion/convert-models.ts`、`src/original-data/conversion/convert-models.test.ts`、`src/original-data/conversion/converter-version.test.ts`：模型转换器组件与版本断言。
- `src/workers/production-package.ts`、`src/workers/import-job.test.ts`：生产包配置与版本断言。
- `src/app/import/import-pipeline.test.ts`、`e2e/import-worker.spec.ts`：依赖 `ConverterVersion` 的断言。
- `docs/engineering/source-structure.md`：MESH 读取、合成构建器与转换器版本的说明，不含呈现约定一节。
- `docs/original/formats/mesh.md`、`docs/original/formats/executable.md`、`docs/original/unknowns.md`：追踪结论与读取器状态。
- `local/research/p2-06/mesh-uv/`：Ghidra 输出与本地核对（被忽略，不提交）。

## 验收标准

- [x] 原版 MESH 载入路径的追踪确认贴图坐标块为两个连续数组；地址与作用写入 mesh §1，置信度为已确认，轴向保持高概率。
- [x] `readMesh` 对第 i 个顶点读出（块中第 i 个值，第 V + i 个值）；各值互异的块能区分两种布局，按每顶点一对读取时该测试失败；非有限值在两个数组中都被拒绝。
- [x] 合成 MESH 构建器按两个连续数组写入，现有往返测试不改期望值即通过。
- [x] 模型转换器组件为 `models-3`，生产 `ConverterVersion` 为 `osr-import.graphics-2.logic-1.audio-1.models-3`，生产包配置、Node 与 E2E 断言一致；payload schema 不变。
- [x] 本地基准：全量 nob-check 通过；09 的脚本通过；全部 MESH 的贴图坐标与独立解码一致。
- [x] `pnpm check`、全部 E2E 与 `pnpm check:original` 通过。

## 验证方法

- 聚焦 Node 测试与证伪；`pnpm check`；`pnpm test:e2e`；`pnpm --silent check:original`。
- 本地：`node tools/nob-check.ts`、09 的 `base-check.ts` 与独立解码脚本，证据只记命令、计数与判定。
- 完成前按 execute-goal 做 rubber-duck 与 simplify。

## 完成证据

2026-10-08 完成。

- **追踪（已确认，代码）：** 只读 Ghidra（`-readOnly -noanalysis`，未重新导入），输出在被忽略的 `local/research/p2-06/mesh-uv/`。
  - 回调表 `0x1766b4` 的 MESH 行（`0x1766d4`）的载入回调为 `0x663ac`，它排队完成函数 `0x663f4`，后者以 `0x6a7b4` 构建网格。
  - `0x6a7b4` 按 mesh §1 的字段顺序定位：位置之后为贴图坐标块，块内 2 × V 个浮点之后为着色槽数，其后为法线、面数与面；它把位置、法线与面交给 `0x80c14`，再对每个顶点 i 调用 `0x8159c`，参数为（i，块[i]，块[V + i]），两个指针从块首与块首之后 V 个浮点开始同步前进。`0x8159c` 只有这一个调用者，把两个值存入该顶点 48 字节记录的 +0x10 与 +0x14。
  - 结论与 P2-12/22 一致，没有需要停下的相反证据。两个字段中哪一个沿贴图列使用经 `0x7db10` 进入驱动分派的代码，未追踪；轴向仍为高概率（截图对照）。
- **实现：**
  - [mesh.ts](../../../../../src/original-data/formats/mesh.ts) 的 `readMesh` 对每个顶点读取块[i] 与块[V + i]，经同一个有限性检查，输出每顶点一对；
  - [synthetic.ts](../../../../../src/original-data/synthetic.ts) 的 `syntheticMesh` 输入不变，写入时存为先 u 后 v 的两个数组；UV 个数不是顶点数的 2 倍时抛出 `RangeError`，不再写出缺值；
  - `MODEL_CONVERTER_COMPONENT` 为 `models-3`，[production-package.ts](../../../../../src/workers/production-package.ts) 与 5 处断言同步。
- **测试：** [mesh.test.ts](../../../../../src/original-data/formats/mesh.test.ts) 新增“pairs the stored u array and v array per vertex”：直接把 1–6 写入块中的贴图坐标位置，期望读出 `[1, 4, 2, 5, 3, 6]`；字段位置测试断言构建器写入的六个值为两个数组；非有限值分别放在 u 数组与 v 数组中。现有往返测试的期望值未改。
  - **证伪：** 暂时把读取改回每顶点一对，恰有 4 个测试失败（新测试、两条往返与模型转换测试），其余通过；还原后通过。
- **检查：**
  - 聚焦：`src/original-data`、`src/workers`、`src/app/import` 与 `tools/nob-check.test.ts`，51 个文件 1,861 个测试通过；
  - `pnpm check` 通过：154 个文件，4,596 个测试，构建成功；审阅与 simplify 的修改之后复跑全部 Vitest（154 个文件，4,596 个测试）、`typecheck`、`lint` 与 `build`，都通过；
  - `OSR_E2E_DEV_PORT=5160 OSR_E2E_PREVIEW_PORT=5161 pnpm test:e2e`：在最终代码上 181 个全部通过（development 146、production 34、development-headed 1），含 `e2e/import-worker.spec.ts` 的版本断言。首次运行时 180 个通过、1 个失败：运行期间修改了 `synthetic.ts`，开发服务器重载页面，`resource-cache.spec.ts` 的一条用例报执行上下文被导航销毁；不改文件复跑全部通过；
  - `pnpm --silent check:original` 通过，0 个发现。
- **本地基准（只记计数与判定）：**
  - `node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB`：MESH 486 个、MODL 19 个全部通过，失败 0；
  - 独立解码：脚本直接按原始字节把每个 MESH 的贴图坐标块解为两个数组，与 `readMesh` 的结果逐位比较。486 个 MESH、26,332 个值，不一致 0 个；459 个 MESH 与每顶点一对的读法不同，其余 27 个的坐标全部相同；
  - 09 的脚本 `local/research/p2-06/base-check.ts`：`passed: true`。6 个模型与绑定一致、结构等价、失败 0，两次运行 126 个 payload 的哈希相同；作业以 `finished` 结束，logic、models、cockpit-hud-map、audio 四组都为 `group-complete`，诊断 0。
  - **运行方式：** 被忽略的 `local/` 是指向主仓库的符号链接。Node 默认按真实路径解析导入，脚本会加载主仓库的 `src/`，而不是本工作树的代码。上述两条本地脚本都加 `--preserve-symlinks --preserve-symlinks-main` 运行，独立解码在不加该参数时确实得到主仓库旧读取的结果。
- **Rubber-duck：** 没有阻断问题。非阻断四项：
  - 构建器在 UV 个数与顶点数不符时会写出缺值：已加长度检查，现有调用都符合；
  - spec 的 `reviewed:` 标记与当前文本不符：不采纳。基点提交上的标记已与当时文本不符（2026-10-06 的执行中修订之后未重算），路由只对 draft spec 使用该标记；本次修订由用户直接批准，没有重新走 review-spec；
  - E2E 尚未完成时证据已写通过：已改为结果出来后再填写；
  - 审批记录把“先 u 后 v”整体写成已确认：已在 goal 与 spec 中注明只有布局为已确认，轴向为高概率。
- **Simplify：** 复用与层次两个角度没有发现。采纳两项：构建器改为按分量逐个写出 u 数组与 v 数组；新测试只建一个 `DataView`。不采纳一项：读取中每个浮点多一次闭包调用，切片每次导入只有约 3,500 个顶点，开销可忽略。
- **文档影响：**
  - [mesh §1](../../../../original/formats/mesh.md#texture-coordinate-block-order-confirmed)：表格行与小节改为已确认，补记追踪地址与读取器状态，轴向保持高概率；§3 的引用与 §4 的未决问题同步。小节标题改名后，旧锚点 `texture-coordinate-block-order-likely-p2-12` 以 HTML 锚点保留，P2-12 与 STATUS 的既有链接仍然有效；
  - [executable](../../../../original/formats/executable.md) 代码地标增加 `0x6a7b4` 一行，指向 mesh §1；
  - [unknowns](../../../../original/unknowns.md) 的 U-001 改为已确认并注明读取已修复；
  - [源码结构](../../../../engineering/source-structure.md)：当前转换器版本、MESH 读取、`syntheticMesh` 与模型转换器版本；呈现约定一节与本地导入指南的模型贴图限制按范围外处理，由 P2-12/29 复核后更新；
  - 工程约定与工具指南的命令和规则不变，无需更新。
