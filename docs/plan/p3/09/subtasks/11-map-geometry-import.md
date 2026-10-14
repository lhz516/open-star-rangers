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

## 验收标准

- [ ] AC-02 的内容部分：payload 与转换的每类拒绝都有合成用例，预算先查后分配；切片定义与 `ConverterVersion` 已递增，旧缓存不恢复，失败不产生半包。
- [ ] 应用侧从同一已验证包解码新 payload；`package-check` 的新增核对与独立来源读取一致（私有，只记判定与计数）。
- [ ] `pnpm exec vitest run src/content src/original-data src/platform src/app/resources tools/package-check.test.ts` 与 `pnpm check` 通过。

## 验证方法

- 合成内容测试（不读原版文件）；本机 `node tools/package-check.ts local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}` 的新增结果。

## 完成证据
