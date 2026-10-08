---
type: plan
status: active
phase: P2
task: "07"
subtask: "20"
updated: 2026-10-08
---

# 20 — SNIP 与 DIAG 的转换

**契约来源：** [spec](../spec.md) 的 S-12、S-08 与 S-09 的修订部分；[状态显示屏文字 payload](../spec.md#状态显示屏文字-payload)、[容器子资源](../spec.md#容器子资源)的 SNIP、DIAG 与区域部件、[生产 Asset 与来源](../spec.md#生产-asset-与来源)、[限值与预算](../spec.md#限值与预算)、[错误码](../spec.md#错误码)；技术决定 13；AC-06、AC-09 的修订部分，AC-19、AC-20。P2-01 的配套修订见 [P2-01 spec](../../01/spec.md#审批)。
**依赖：** 12、13、18、19。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。
**执行方式：** 自动

## 工作范围

- **content：** `src/content/hud/` 中的状态显示屏文字 payload（常量、编码、严格读取、绑定检查）与 `invalid-status-messages-payload`；[slice-definition.ts](../../../../../src/content/slice-definition.ts) 中 `cockpit-hud-map` 组允许 `data`，`SLICE_DEFINITION_VERSION` 为 3。
- **来源映射：** [source-mapping.ts](../../../../../src/original-data/source-mapping.ts) 中 image 允许 SNIP、data 允许 DIAG 条目；图像映射可在封包条目之后加区域部件，只有区域的图像映射被拒绝；区域对 image 不算类型冲突。
- **源结构与转换：** SNIP 帧的读取与解码（`source-graphics.ts`）、DIAG 的读取（`source-messages.ts`）；图形声明加入 `data`（角色 `status-messages`）；转换器加入 `snip-frame` 与 `status-messages` 来源，在解码或编码之前扣除预算；图形步骤要求这两类来源恰有一个合用途的区域部件，经共用的 `stepRegionReader` 读取（效果步骤改用同一读取器）。
- **生产：** 9 个 `image/hud/display-interference/frame-<i>` 与 `data/hud/status-display/messages` 的声明与映射；份额改为 `assets` 112、`imagePixels` 655,360、`payloadBytes` 917,504；`GRAPHICS_CONVERTER_COMPONENT` 为 `graphics-3`，生产 `ConverterVersion` 与生产包配置随之改变；限值名 `snipFrames`、`diagStartupMessages`、`diagTextBytes`。
- **测试与工具：** `synthetic.ts` 的 `syntheticSnip` 与 `syntheticDiag`；合成生产封包含 SNIP、DIAG 与带生产区域的合成 EXE；正负 Node 测试；nob-check 校验 SNIP 帧与 DIAG 结构；依赖版本、份额、映射序号与用量的既有测试同步。
- **文档：** 源码结构、工具指南与 P2-01 spec 的修订记录。

## 不包含

- DIAG 的研究：归 [19](./19-snip-diag-research.md)。本地基准核对：归 [21](./21-snip-diag-local-check.md)。
- 查看器显示文字 payload（查看器只列出效果角色的 `data`，SNIP 帧作为普通图像列出）；文字的排版、颜色与消息选择（P3）。

## 写入范围

- `src/content/`
- `src/original-data/`
- `src/workers/`
- `src/app/import/import-pipeline.test.ts`
- `src/platform/storage/resource-cache-records.test.ts`
- `tools/nob-check.ts`
- `tools/nob-check.test.ts`
- `e2e/import-worker.spec.ts`
- `e2e/import-page.spec.ts`
- `e2e/failure-storage-lifecycle.development.spec.ts`
- `e2e/support/viewer-observations.ts`
- `docs/engineering/source-structure.md`
- `docs/guides/tools.md`
- `docs/plan/p2/01/spec.md`
- `docs/original/formats/mesh.md`

## 验收标准

- [x] AC-19：文字 payload 往返、拒绝与绑定的 Node 测试通过。
- [x] AC-20：SNIP 与 DIAG 的源结构、图形步骤、生产常量与份额的正负测试通过；`cockpit-hud-map` 组允许 `data`、切片定义版本 3 与图像映射的区域部件规则由测试断言。
- [x] AC-06、AC-09（修订部分）：生产声明含 9 帧与文字 Asset；开发项目的真实 Worker 在含 SNIP、DIAG 与 EXE 的合成光盘上通过。
- [x] 合成数据只在代码中生成，测试与源码中没有原版字节或文字；`pnpm check` 通过。

## 验证方法

- `pnpm exec vitest run src/content/hud src/original-data/conversion tools/nob-check.test.ts`；`pnpm check`；`OSR_E2E_DEV_PORT=5163 OSR_E2E_PREVIEW_PORT=5164 pnpm test:e2e`。
- rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **content：**
  - [status-messages-payload.ts](../../../../../src/content/hud/status-messages-payload.ts) 定义 schema 1、`STATUS_MESSAGES_ROLE`、`STATUS_MESSAGES_COUNTS`、`STATUS_MESSAGES_LIMITS`、编码与严格读取（共用 `readRecord`、`requireFields`、`readArray`）、按段长求编码长度的 `statusMessagesLengthOf`、组装 `statusMessagesFrom` 与 `checkStatusMessagesBinding`；`contract-validation.ts` 追加 `invalid-status-messages-payload`。
  - [slice-definition.ts](../../../../../src/content/slice-definition.ts) 中 `cockpit-hud-map` 拥有 `data`，`SLICE_DEFINITION_VERSION` 为 3；完整性与缓存记录测试补上版本 2 的负例。
- **来源映射：** image 允许 SNIP、data 允许 DIAG；`image` 映射只能在封包条目之后带区域部件（只有区域时为 `invalid-source-mapping`），区域对 data 与 image 不算类型冲突。
- **源结构与转换：**
  - `readSnipFrames`/`decodeSnipFrame` 要求条目唯一的重定位在 +0；[source-messages.ts](../../../../../src/original-data/conversion/source-messages.ts) 的 `readStatusMessages` 先比较重定位个数、核对全部结构与各段长度，再经 `reserve` 扣除编码长度，之后才复制文字；列表指针恰在启动消息数为 0 时为 0。
  - 图形声明加入 `data`（角色须为 `status-messages`）；转换器加入 `snip-frame` 与 `status-messages`；图形步骤要求二者恰有一个合用途的区域部件，经共用的 `stepRegionReader` 读取（每个 EXE 打开一次、每个区域读取一次，效果步骤也用它）。
  - 生产：9 帧与文字 Asset，区域地址经新的 [production-executable.ts](../../../../../src/original-data/conversion/production-executable.ts) 换算（效果的生产输入共用其 `objectOffset`）；份额与 `PRODUCTION_PACKAGE.limits` 按 spec 修订；`GRAPHICS_CONVERTER_COMPONENT` 为 `graphics-3`，`PRODUCTION_CONVERTER_VERSION` 为 `osr-import.graphics-3.logic-1.audio-1.models-3`。
- **测试：** payload 往返、拒绝（截断、尾随、缺段、17 条启动消息、0 字节、稀疏列表、未知字段等）与绑定；SNIP 结构、重定位、限值与解码（独立写出的字节内像素顺序）；DIAG 结构、重定位、空列表指针、文字与格式长度及 `reserve` 的时机（以变异核对过空列表指针一例）；步骤级的区域部件规则、只读一次、预算先于解码或复制文字；生产声明、映射（含区域部件）、份额上界、生产结构上的转换与 `validateGroup`；nob-check 的 SNIP 与 DIAG 正负例且不输出文字。依赖版本、份额、映射序号（失败矩阵 F-08 的第 97 个映射）与用量的既有测试同步。
- **检查：** `pnpm check` 通过（156 个文件、4,691 项，构建通过）。`OSR_E2E_DEV_PORT=5163 OSR_E2E_PREVIEW_PORT=5164 pnpm test:e2e` 第一次有 3 项失败，都与本修订有关：空间提示的 MiB 数随份额变化；F-13 列出缓存条目的顺序随转换器版本变化；生产预览中前视布局的一个边缘采样偏了一个像素。第三项在基础提交上通过，原因是查看器条目变多后画面区域落在小数位置，元素截图的裁剪取整与合成器不同。前两项更新期望；第三项把 [viewer-observations.ts](../../../../../e2e/support/viewer-observations.ts) 的 `bufferPixels` 改为在视口截图中按区域的实际位置取样，在本分支与基础提交上都通过。修正后的完整 E2E 结果见 [17](./17-final-alignment.md#完成证据)。
- **rubber-duck：** 整个修订（19–21 与文档）一次审查，3 项阻塞与 2 项非阻塞：
  - 已修正：DIAG 在扣除预算前就复制文字（改为 `reserve` 先于复制，重定位个数先于排序）；SNIP 的重定位没有校验；DIAG 允许数量非 0 而列表指针为 0；P2-01 AC-04 的验证文字仍写版本 2。复核确认修正无误、没有回退。
  - 未改：P2-01 与 P2-07 spec 的 `reviewed:` 标记已与正文不符（P2-01 的在基础提交上已不符）。review-spec 只在明确调用时运行，本次未调用，标记保持“修订后未审阅”的状态，交协调者处理。
- **simplify：** 四个角度各一个审阅代理。
  - 已修正：payload 编码改用共用的 `readRecord`/`requireFields`/`readArray`；内容读取器与 DIAG 读取器共用 `statusMessagesFrom`；DIAG 读取器复用 `source-graphics.ts` 的 `fieldAt` 与 `RelocatedBlock`；测试改为 `it.each`；测试支持用具名常量代替按字节形状查找区域；`stepRegionReader` 缓存区域读取，9 帧只读一次颜色表；EXE 地址换算移到中立的 `production-executable.ts`。
  - 跳过：把多部件映射解析做成通用的 `stepMappingReader`（目前只有两类来源，改动面大）；为 `data` 声明另加格式判别字段（角色 `status-messages` 已是判别）；拆分效果与图形测试支持共用的合成 EXE（目前一份 EXE 同时写入两者的区域，行为正确）。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md)（目录、切片定义版本 3、`ConverterVersion`、状态显示屏文字 payload、来源映射、源结构读取、声明、转换、步骤、生产图形、测试支持、限值名与位置语法、效果步骤共用的区域读取）、[工具指南](../../../../guides/tools.md)（nob-check 的 SNIP 与 DIAG）、[P2-01 spec](../../01/spec.md)（修订记录、组与 locator、AC-04）与 [mesh](../../../../original/formats/mesh.md)（旧版本号改为“引入时”的表述）。工程约定中的 E2E 规则不变。查看器只列出效果角色的 `data`，状态显示屏文字未在查看器中显示；SNIP 帧作为普通图像列出。
