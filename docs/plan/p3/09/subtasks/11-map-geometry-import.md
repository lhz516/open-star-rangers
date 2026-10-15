---
type: plan
status: active
phase: P3
task: "09"
subtask: "11"
updated: 2026-10-14
---

# 11 — 地图几何的内容导入

**契约来源：** [spec](../spec.md) 的 S-02、AC-02；[地图几何的内容输入](../spec.md#地图几何的内容输入)、[持久化与兼容](../spec.md#持久化与兼容)；D-01 写入 P3-03 的修订。
**依赖：** 08。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 D-01 定稿的 schema 新增地图几何的规范 payload 与读取器（`src/content/` 中的位置按 D-01）：只含规则与 P3-13 需要的最小字段，带 schema 版本与限值；内容错误为 `ContentContractError`，诊断只有结构路径与原因。
- 生产转换：从已验证来源定向读取 CCKD 10103 布局 6 的 10 型仪表记录，先核对来源、类型、数量、偏移与完整读取范围再分配；加入唯一切片定义（版本递增）、`validatePackage`、完整性与所有权检查，递增 `ConverterVersion`，导入协议按需递增。
- 缓存：旧版本缓存不恢复、须重新导入；取消、坏输入、配额不足或事务失败不留下半包，已有有效包不被覆盖为部分结果；沿用现有 IndexedDB 事务，不改数据库 schema。
- 应用侧在 [mission-input.ts](../../../../../src/app/resources/mission-input.ts) 中从同一已验证包解码新 payload，交给 12 接入 `createWorld`。
- 本机核对：扩展 [package-check.ts](../../../../../tools/package-check.ts) 覆盖新增 payload，并以独立的来源读取（不调用同一解码器）比较；私有结果只记判定与计数。
- 合成测试覆盖合法、截断、越界、类型不符、重复/缺失角色、退化几何与超限，以及先检查后分配。

## 不包含

- Core 的输入、校验与 setupHash（12）。
- 地图画面与生产几何端口（P3-13）。

## 关键文件与契约

- [layout-payload.ts](../../../../../src/content/graphics/layout-payload.ts)、[slice-definition.ts](../../../../../src/content/slice-definition.ts)、[source-graphics.ts](../../../../../src/original-data/conversion/source-graphics.ts)、[production-graphics.ts](../../../../../src/original-data/conversion/production-graphics.ts)、[converter-version.ts](../../../../../src/original-data/conversion/converter-version.ts)、[mission-input.ts](../../../../../src/app/resources/mission-input.ts)、[synthetic.test-support.ts](../../../../../src/original-data/synthetic.test-support.ts)。
- 计划新增：地图几何的 payload 模块与测试（路径按 D-01）。

## 写入范围

- `src/content/**`：新 payload、读取器、切片定义、完整性与测试。
- `src/original-data/conversion/**`、`src/original-data/formats/**`：定向读取、生产转换、版本与测试。
- `src/workers/**`：导入协议版本（如需）。
- `src/platform/storage/**`：缓存版本回归测试（如需）。
- `src/app/resources/**`：解码新 payload。
- `tools/package-check.ts`、`tools/package-check.test.ts`：本机核对。
- `e2e/support/**`：合成包版本同步（如需）。
- `docs/engineering/modules/content.md`、`docs/guides/local-import.md`、`docs/guides/tools.md`：导入、版本与工具用法。
- `local/research/p3-09/import-check/**`：私有核对输出（被忽略）。
- `src/app/import/import-pipeline.test.ts`、`e2e/import-worker.spec.ts`：转换器版本、资产数量与映射次序的固定断言（协调者 2026-10-14 扩大范围）。
- `src/original-data/source-error.ts`：仪表记录数量的专用限值名（同上）。
- `src/original-data/source-mapping.ts`、`src/original-data/source-mapping.test.ts`：`data` 类来源允许 CCKD（同上）。
- `docs/engineering/modules/workers.md`、`docs/engineering/modules/original-data.md`：新来源类型与版本的说明（同上）。

## 验收标准

- [x] AC-02 的内容部分：payload 与转换的每类拒绝都有合成用例，预算先查后分配；切片定义与 `ConverterVersion` 已递增，旧缓存不恢复，失败不产生半包。
- [x] 应用侧从同一已验证包解码新 payload；`package-check` 的新增核对与独立来源读取一致（私有，只记判定与计数）。
- [x] `pnpm exec vitest run src/content src/original-data src/platform src/app/resources tools/package-check.test.ts` 与 `pnpm check` 通过。

## 验证方法

- 合成内容测试（不读原版文件）；本机 `node tools/package-check.ts local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}` 的新增结果。

## 完成证据

- **2026-10-14，worker（分支 `exec-p3-09-11`，基于 16cc7778）：** 按 [P3-03 修订 2](../../03/spec.md#p3-09-的修订地图几何修订-2) 与 [P3-02 MW-01](../../02/spec.md#mw-01-世界创建输入与静态规则数据) 的输入形状实现，未改动契约。
  - **Payload：** [map-geometry-payload.ts](../../../../../src/content/hud/map-geometry-payload.ts) 定义 `data/hud/map-geometry`（角色 `map-geometry`，schema 1，`payloadBytes` 256），字段恰为 `rectangle`、`redrawInterval`、`informationLineHeight`；读取器的约束与 spec 相同，错误为 `invalid-flight-data-payload`，与其他字段相关的约束只用固定原因文字。[map-geometry-payload.test.ts](../../../../../src/content/hud/map-geometry-payload.test.ts) 覆盖边界值、越界、退化（边长 1、无右侧条带、反向矩形）、类型与字段错误、规范编码、描述符与冻结隔离。
  - **转换：** [source-graphics.ts](../../../../../src/original-data/conversion/source-graphics.ts) 的 `readCockpitInstrument` 先核对头部与目录在块内、恰一个布局号 6 的目录项，再按上限 32 检查记录数（新限值名 `cockpitInstruments`）、核对 48 字节记录数组在块内，最后要求恰一个 10 型记录；字体 1 沿用 `readCockpitFont`。映射为 CCKD 10103 的 `fonts/1` 与 `layouts/6/instruments/type-10` 两个部件（规范 locator 顺序），`SOURCE_ENTRY_TYPES.data` 加入 CCKD；编码在分配前扣除预算，读取器拒绝的来源值转为 `unsupported-payload`。[map-geometry-step.test.ts](../../../../../src/original-data/conversion/map-geometry-step.test.ts)（24 例）覆盖合法转换（一次读取、`verified`）、缺少或重复的布局号目录项与 10 型记录、记录数 33 先于数组越界报 `limit-exceeded`、数组越出 1 字节、头部截断与目录越界、六种不合规矩形（诊断不含任何坐标值）、字体高 9、预算差 1 字节失败且无结果，以及五种错误映射形状。
  - **版本与预算：** `SLICE_DEFINITION_VERSION` 4 → 5（新增 `cockpit-hud-map` 组恰为 1 的 `map-geometry`），`GRAPHICS_CONVERTER_COMPONENT` `graphics-4` → `graphics-5`，`PRODUCTION_CONVERTER_VERSION` 为 `osr-import.graphics-5.logic-2.audio-2.models-4`；`PRODUCTION_MAP_GEOMETRY_SHARE` 为 1 个 Asset 与 256 字节，`PRODUCTION_PACKAGE.limits` 为 813 个 Asset 与 16,568,576 字节。导入协议与 IndexedDB 不变。
  - **缓存：** [resource-cache-records.test.ts](../../../../../src/platform/storage/resource-cache-records.test.ts) 加入切片定义版本 4 的记录读为 `cache-incompatible`；[resource-holder-cache.test.ts](../../../../../src/app/resources/resource-holder-cache.test.ts) 加入 `graphics-4` 的生产条目不提供恢复。失败不留半包沿用既有事务与作业测试（导入作业、失败矩阵与导入管线的既有用例按新映射次序与数量更新后全部通过）。
  - **应用侧：** [mission-input.ts](../../../../../src/app/resources/mission-input.ts) 的 `mapGeometryInput(groups)` 从同一包的 `cockpit-hud-map` 组按角色解码，测试覆盖解码结果、缺组或缺 Asset 时为 undefined、解码错误位于 `cockpit-hud-map[data/hud/map-geometry].…`。
  - **本机核对：** [package-check.ts](../../../../../tools/package-check.ts) 解码地图几何，并与工具自己重新打开光盘、按 cockpit 与 hud §1 的布局自行解析的来源读取比较（不调用转换器的读取器；计数先按上限检查）；合成测试覆盖一致、payload 被改（`source-mismatch`）与来源记录数超限（`source-unreadable`，去掉上限的负对照会失败）。`node tools/package-check.ts local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}`：`passed` true，切片定义版本 5，组 Asset 数 9、266、105、29，`map-geometry` 1 个 Asset、`sourceMatches` 1、payload 在 256 字节限值内，包用量 409 个 Asset，在 813 之内；私有报告在 `local/research/p3-09/import-check/`。
  - **检查：** 上列 vitest 命令 118 个文件 4,033 例通过；`pnpm check` 通过（283 个文件 8,453 例，类型检查、lint 与构建）；另跑 `e2e/import-worker.spec.ts` 与 `e2e/viewer-page.spec.ts` 29 例通过。
  - **Rubber-duck：** 无阻断问题；采纳三条：独立来源读取在遍历前检查计数上限与数组范围（加测试与负对照），诊断不回显测试改为按用例的全部坐标判定，schema 1 的行高上限改为本 payload 的格式常量并测试与字体上限一致。
  - **Simplify：** 去掉转换器中的重复严格读取（改为在编码处转换错误）、合并来源选择分支、仪表结果复用 `MapRectangle`、读取器去掉被其他约束覆盖的两条检查、包核对按记录比较；未采纳为一处改动改写 `Measure` 签名与映射辅助函数的建议。
  - **文档：** 更新 [content.md](../../../../engineering/modules/content.md)（切片定义版本 5、转换器版本、地图几何 payload 一节）、[original-data.md](../../../../engineering/modules/original-data.md)（仪表记录读取、来源类型、生产映射与份额、合成封包、限值名）、[workers.md](../../../../engineering/modules/workers.md)（转换器版本与包限值）、[local-import.md](../../../../guides/local-import.md)（须重新导入）与 [tools.md](../../../../guides/tools.md)（包核对的独立比较）。`docs/original/` 没有新事实（记录取值只在私有输出中），U 项不变。
