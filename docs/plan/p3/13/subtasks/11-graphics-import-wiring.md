---
type: plan
status: active
phase: P3
task: "13"
subtask: "11"
updated: 2026-10-28
---

# 11 — 图形导入与版本全链

**契约来源：** [spec](../spec.md#共享契约修订d-01) 的 S-01，AC-02。
**依赖：** 10。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 将 CCKD 已核实字段转换到 10 的 payload，仍经验证来源、步骤读取、先预算后分配；slot 2 与 map-geometry 同源且一致。
- 唯一角色/切片、payload 验证、生产源映射、Worker 装配、合成任务包、缓存恢复资格一起更新，按 D-01 递增必要版本。
- 扩展现有本地核对工具以输出结构/计数/哈希，不输出内容；查看器旧功能与合法旧 schema 消费不误改。

## 不包含

不增加新导入格式、缓存迁移、媒体或通用资源编辑器。

## 关键文件与契约

- [source-graphics.ts](../../../../../src/original-data/conversion/source-graphics.ts)、[convert-graphics.ts](../../../../../src/original-data/conversion/convert-graphics.ts)、[production-graphics.ts](../../../../../src/original-data/conversion/production-graphics.ts)。
- [slice-definition.ts](../../../../../src/content/slice-definition.ts)、[production-package.ts](../../../../../src/workers/production-package.ts)。

## 写入范围

- `src/original-data/conversion/*graphics*.ts`：读取/转换/源映射及合成测试。
- `src/content/**/*.ts`：仅新角色包验证、合成包及受影响读者测试，不改无关规则。
- `src/workers/*.ts`：新内容装配、版本及导入测试。
- `src/platform/storage/*.test.ts`：旧 converter/schema 拒绝与重导入。
- `tools/nob-check.ts`：结构核对扩展。
- `tools/nob-check.test.ts`：合成工具测试。
- `tools/package-check.ts`：包核对扩展。
- `tools/package-check.test.ts`：合成工具测试。
- `docs/engineering/modules/content.md`：新角色与版本。
- `docs/guides/local-import.md`：重新导入条件。
- `src/original-data/conversion/converter-version.test.ts`、`src/app/import/import-pipeline.test.ts`、`src/app/resources/resource-holder-cache.test.ts`：版本与资产计数断言（11 的范围请求）。
- `src/core/replay/comm-replay.test.ts`、`src/core/replay/ai-replay.test.ts`、`src/core/replay/combat-replay.test.ts`、`src/core/replay/map-warp-replay.test.ts`：仅切片定义版本引起的摘要字面量（11 的范围请求）。
- `e2e/import-worker.spec.ts`、`e2e/ai-wingman.development.spec.ts`、`e2e/support/version-4.ts`：版本与角色断言（11 的范围请求）。
- `docs/engineering/modules/original-data.md`、`docs/engineering/modules/workers.md`、`docs/guides/tools.md`、`src/original-data/source-error.ts`：文档与注释同步（11 的范围请求）。
- `src/original-data/conversion/production-hud-text.ts`：观察距离表的 EXE 区域读取（08 增补）。
- `src/original-data/conversion/production-hud-text.test.ts`：合成测试（08 增补）。
- `src/original-data/conversion/production-executable.ts`：EXE 区域规则（08 增补）。
- `src/original-data/conversion/production-executable.test.ts`：合成测试（08 增补）。

## 验收标准

- [x] 实际生产转换得到 10 的有效 payload，slot 2 不漂移；来源映射和坏输入拒绝完整。
- [x] 旧缓存不静默复用，新导入可恢复；唯一切片定义与 converter 同步。
- [x] 公共测试全合成，查看器既有回归不变。

## 验证方法

`pnpm test -- src/original-data/conversion src/content src/workers src/platform/storage`，再 `pnpm check`；[simplify](../../../../../.agents/skills/simplify/SKILL.md) 限新角色导入链。真实原版核对归 30。

## 完成证据

2026-10-28，worker 分支 `exec/p3-13-11`（基线 `9edbcaf2`，按协调者指示快进到 `86d01066` 后完成，含子任务 12 的 Core 变更）。写入范围经协调者在 `86d01066` 扩大。

- **转换：** `source-graphics.ts` 新增 `readCockpitInstrumentSlot({ bytes, relocations }, layout)`（与 `readCockpitInstrument` 共用槽查找与记录数组检查：恰一个槽否则 `unsupported-payload@…groups`；记录数先按 32 检查再核对数组在块内）与 `readCockpitLayoutNumbers`。参数表项数先按 4 检查（`limit-exceeded`，沿用 `payloadItems`），+0x24 为空当且仅当项数为 0（否则 `unsupported-payload`），非空指针须在条目重定位中、表在块内（否则 `invalid-payload`）。`graphics-step.ts` 的 `cockpitInstrumentsSource` 要求映射恰为同一 CCKD 条目的 `layouts/0`、`layouts/6`、`layouts/8` 加一个 EXE 区域，地图几何与已声明的槽布局（`groups/<槽>`）须为同一条目（否则 `invalid-declaration@….messages`）；条目经步骤共用读取只读一次（与地图几何同一次，测试断言 CCKD 读取次数为 1）。区域长度须为 80（否则 `unsupported-payload`），经带 fixup 的区域读取，读取器接受的 fixup 修补区域即 `unsupported-payload`。元素图像取映射到 `groups/<槽>/elements/<i>` 的已声明图像，所以缺少布局的集合仍能转换，由包验证报告角色缺失（保持 import-pipeline 既有“reports each missing role”）。`convert-graphics.ts` 的 `Conversion.instruments` 检查槽的目录序号为 0、2、7，经 `readCockpitInstruments` 严格读取，编码前扣除预算；集合同时含两个布局与地图几何时最后以 `checkCockpitInstruments` 核对（不一致为 `unsupported-payload`），slot 2 的 10 型记录因此与 `data/hud/map-geometry` 逐字段一致。读取器拒绝的取值都报 `graphics[data/hud/instruments].cockpitInstruments.<路径>`，不回显数值（测试断言）。
- **角色、版本与预算：** `SLICE_DEFINITION_VERSION` 6 → 7，新增 `cockpit-instruments`（`cockpit-hud-map`，data，恰为 1）；`GRAPHICS_CONVERTER_COMPONENT` 为 `graphics-6`，`PRODUCTION_CONVERTER_VERSION` 为 `osr-import.graphics-6.logic-4.audio-2.models-4`。`production-graphics.ts` 声明 `data/hud/instruments`，映射 CCKD 10103 `layouts/0|6|8` 与 `TARGET_VIEW_DISTANCES`（`executableRegionAt(0x175424, 80)`，LE 对象 4，confirmed），份额 `PRODUCTION_COCKPIT_INSTRUMENTS_SHARE`（1 个 Asset、8,192 字节）；`PRODUCTION_GRAPHICS_SHARE` 为 673 个 Asset、5,796,096 字节，`PRODUCTION_PACKAGE.limits` 为 814 个 Asset、16,576,768 字节（`production-package.test.ts` 由份额推导核对）。
- **缓存：** `resource-cache-records.test.ts` 新增切片定义版本 6 的记录为 `cache-incompatible`，以及同键重新导入的当前包为 `compatible`；`resource-holder-cache.test.ts` 新增 `osr-import.graphics-5.logic-4.audio-2.models-4` 不提供恢复。IndexedDB 版本、记录格式与缓存键不变。
- **合成测试与夹具：** 新文件 `instruments-graphics-step.test.ts`（23 项：成功转换、槽缺失/重复/序号不符、常重绘标志、类型、绘制参数、类型 9 范围、参数项数上限、空指针与无项、未重定位、越界、遍 1 非逐帧元素、非有限距离、fixup、区域长度、映射形状、缺少地图几何或布局、元素缺图像、预算、与地图几何不一致的核对）。`production-graphics.test-support.ts` 新增 `cockpitInstrumentsBlock`、8 槽 `PRODUCTION_COCKPIT_INSTRUMENTS`、`SYNTHETIC_COCKPIT_INSTRUMENTS`、`COCKPIT_INSTRUMENTS_USAGE`、`productionCockpitEntry`（带重定位）与距离区域写入；`synthetic-import.test-support.ts` 的合成驾驶舱光盘加入仪表 Asset（地图边框元素的标志改为 [1, 1]）；`SYNTHETIC_ASSETS` 的 `data/synthetic-instruments` 携带规范编码（每次读取新字节），新增 `syntheticPayloadBytes`。受影响的计数与版本字面量随之更新：Worker、failure matrix（F-08 映射序号 288 → 289）、import-pipeline、converter-version、e2e（`import-worker`、`ai-wingman.development`、`support/version-4.ts`；只经 typecheck，未运行 E2E）。四个 Core replay 的 gameplay 摘要只因合成身份带切片定义版本而改变（规则与抽签不变），在合入子任务 12 后的状态上重算：comm `4b00850ff1f53eb7`、ai `7632c121056ead31`、combat `56c22f944206d99b`、map-warp `bf36a0af037e3a2c`。查看器不列出该 data 角色，既有查看器与 import-pipeline 回归均通过。
- **本机工具：** `tools/package-check.ts` 新增 `cockpit-instruments` 角色：解码、以包中布局与地图几何运行 `checkCockpitInstruments`、与不共用转换器代码的独立 CCKD 读取比较（`source-unreadable`/`source-mismatch@roles.cockpit-instruments`），只输出计数、限值与摘要；`tools/nob-check.ts` 逐槽经 `readCockpitInstrumentSlot` 读取并输出计数。两者均有合成测试（不回显坐标）。
- **检查：** `npx vitest run src/original-data/conversion src/content src/workers src/platform/storage tools` 通过；`pnpm check` 通过（typecheck、lint、402 个测试文件 11,063 项、build）。
- **本机原版核对（只记计数，输出在 `local/research/p3-13/11-import/`）：** `node tools/package-check.ts local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}` 通过：切片定义 7、`graphics-6`，cockpit-hud-map 106 个 Asset；`data/hud/instruments` payload **2,351 字节**（≤ 8,192，按 2 倍取整到 2 的幂恰为 8,192），3 槽、1 个常重绘槽、8 个元素、13 条记录、5 个参数表共 8 项、20 个距离，真实内容通过 `checkCockpitInstruments` 且与独立读取一致。`node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB`：3 个 CCKD 全部通过，17 个仪表槽、66 条记录、17 个参数表（最多 4 项），全部重定位核对通过。
- **rubber-duck：** 只读 code-review 代理按修订 4、DC-02 与验收标准审查，唯一发现：格式不合或跨越区域边界的 fixup 由共用 LE 读取器先报 `invalid-payload`，不是修订 4 所写的 `unsupported-payload`。处置：读取器接受的、位于区域内的 fixup 报 `unsupported-payload`；畸形或跨界的 fixup 按协调者决定保留 `invalid-payload`（`le-executable.ts` 不在范围内，与 HUD 文字区域同一规则，均被拒绝、不会静默接受），已加测试固定跨界情形。其余（同次读取、预算顺序、错误码、诊断、版本与缓存、工具独立读取）确认无问题。simplify 按四个角度自查：`f32Bytes` 改用 `ByteWriter.f32`，其余无改动。
- **文档影响：** 更新 `docs/engineering/modules/content.md`（版本 7、`graphics-6`、驾驶舱仪表调度 payload 一节）、`docs/engineering/modules/original-data.md`（仪表槽读取、转换、份额）、`docs/engineering/modules/workers.md`（转换器版本与包限值）、`docs/guides/tools.md`（两个工具的新核对）与 `docs/guides/local-import.md`（须重新导入）；`source-error.ts` 注释记录 `payloadItems` 的沿用。不新增原版事实；观测 payload 大小 2,351 字节交 07/32 记入 cockpit §3。
- **私有输出：** `local/research/p3-13/11-import/`（package-check.json、nob-check.txt、pnpm-check.log）。
