---
type: plan
status: active
phase: P3
task: "03"
subtask: "19"
updated: 2026-10-09
---

# 19 — 切片定义版本 4 与生产包装配

**契约来源：** [spec](../spec.md) 的 S-13、S-14、S-15、AC-10（既有声音不变）、AC-12、AC-14（份额与生产包配置）、AC-15（Node）、AC-16、AC-18；[切片定义版本 4](../spec.md#切片定义版本-4)、[限值与预算](../spec.md#限值与预算)、[包身份与转换器版本](../spec.md#包身份与转换器版本)、[持久化与兼容](../spec.md#持久化与兼容)。
**依赖：** 07, 15, 17, 18。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **切片定义：** [slice-definition.ts](../../../../../src/content/slice-definition.ts) 的 `SLICE_DEFINITION_VERSION` 由 3 递增为 4，追加 spec 表中的 13 个必需角色及其组、kind 与数量；`SliceRole` 同步，其余不变。
- **接线：** 修改 [import-job.ts](../../../../../src/workers/import-job.ts) 与各生产表：
  - **logic 组：** logic 步骤在 `convertLogic` 之后运行 15 的 `convertRuleData`，把两者的分区合并为一份 logic 组草稿；
  - **图形：** 把 16 的生产映射与声明并入 `PRODUCTION_GRAPHICS_MAPPINGS`/`DECLARATIONS`；
  - **models 组：** 模型阶段在效果步骤之后运行 17 的 `runFlightDataStep`，结果并入 models 组草稿；
  - **音频：** 把 18 的 11 行并入 `PRODUCTION_SOUND_TABLE`。

  阶段集合与消息形状不变，导入协议保持版本 5。
- **份额与限值：**
  - 用本地脚本（`local/research/p3-03/shares/`）在基准镜像上以不设上限的限值运行各步骤，取得新增 Asset 的实际用量；
  - 按“2 倍，向上取整到 2 的幂”推导，填入 `PRODUCTION_RULE_DATA_SHARE`、`PRODUCTION_FLIGHT_GRAPHICS_SHARE`、`PRODUCTION_FLIGHT_DATA_SHARE`，并接入作业限值；
  - 若 07 记录的事件用量超出现有 logic 份额，同样调整；音频的观测值超出 `AUDIO_BUDGET_LIMITS` 时按同一规则提高；
  - [production-package.ts](../../../../../src/workers/production-package.ts) 的 `limits` 由测试从各份额推导核对。

  观测值与推导结果写入完成证据，只记计数。
- **版本：** 输出发生变化的转换器各自递增组件（预计 `graphics-4`、`logic-2`、`audio-2`、`models-4`，以实际变化为准），`PRODUCTION_CONVERTER_VERSION` 仍是唯一定义。同步更新 `PRODUCTION_PACKAGE.converterVersion` 和固定该字串的测试与 E2E 断言，使它们与推导结果一致。
- **合成数据：**
  - [synthetic-content.test-support.ts](../../../../../src/content/synthetic-content.test-support.ts) 生成版本 4 的完整合成包，覆盖全部新角色；
  - [synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts) 与相关的生产测试支持，用代码生成的 AISTUFF、COMM、CRAFT、DEBRIS 封包、SR.NOB 新条目、新 SND 与 EXE 区域，组成合成光盘与白名单；
  - E2E 夹具随之更新。
- **测试：**
  - **AC-12：** 版本 4 的合成完整包为 `complete`；逐一去掉每个新增必需角色的 Asset，或改变 `event-sound`、`hud-sound` 的数量时为 `incomplete`；版本 3 的包报 `definition-version-mismatch`。
  - **AC-15（Node）：** 旧转换器版本的包不提供恢复，定义版本 3 的记录为 `cache-incompatible`，版本 4 的合成包可提交与恢复。
  - **AC-16：** 生产作业发送四组；读取日志只含映射引用的条目、区域与文件头和目录，每个条目在其步骤内只读一次，不读取闭包之外的条目；转换失败时不发送组，并带完整的 `limit`；协议与 P2-04 的失败矩阵通过。
  - **AC-10：** 既有 18 个声音 Asset 的 ID、角色与 payload 字节不变。
  - [logic-check.ts](../../../../../tools/logic-check.ts) 在版本 4 下继续通过。
- 运行既有 E2E（`pnpm test:e2e`），确认装配没有破坏导入、缓存、查看器与生命周期的回归；新增的浏览器断言归 20。

## 不包含

- 新增的浏览器断言与画面核对：归 20。
- 本地核对 CLI 与外观对照：归 21。
- 模块分册与指南：由 22 同步；本项在完成证据中列出接线、份额、组件与版本的变化。

## 关键文件与契约

- [slice-definition.ts](../../../../../src/content/slice-definition.ts)、[completeness.ts](../../../../../src/content/completeness.ts)（只读）、[converter-version.ts](../../../../../src/original-data/conversion/converter-version.ts)、[production-package.ts](../../../../../src/workers/production-package.ts)、[import-job.ts](../../../../../src/workers/import-job.ts)。
- [resource-cache-records.ts](../../../../../src/platform/storage/resource-cache-records.ts)（只读）：版本不符时为 `cache-incompatible`。
- 15、16、17、18 新增的生产表与步骤。

## 写入范围

- `src/content/**`：切片定义、合成内容包与受影响的测试。
- `src/original-data/conversion/**`：生产表合并、份额、转换器组件与受影响的测试。
- `src/workers/**`：作业接线、生产包配置、合成导入与测试。
- `src/app/**`：受版本与包形状影响的测试。
- `src/platform/storage/**`：缓存记录的测试。
- `tools/logic-check.ts`：版本 4 下的核对。
- `tools/logic-check.test.ts`：对应测试。
- `e2e/**`：版本字串与合成夹具。
- `local/research/p3-03/shares/**`：份额推导脚本与输出（被忽略）。

## 验收标准

- [ ] AC-12：版本 4 完整、逐一缺少角色或数量不符时为 `incomplete`、版本 3 报 `definition-version-mismatch`；生产定义仍只有一份（工程边界回归）。
- [ ] AC-14（份额与生产包配置）：份额由观测值按规则推导，`PRODUCTION_PACKAGE.limits` 由测试从各份额推导一致；观测值与结果已记录。
- [ ] AC-15（Node）：组件已递增，`ConverterVersion` 只有一个生产定义；旧版本记录不恢复，版本 3 为 `cache-incompatible`，版本 4 可提交与恢复。
- [ ] AC-16：生产作业的结果、读取日志、失败行为与协议回归如上。
- [ ] AC-10：既有 18 个声音 Asset 不变，新增 11 个已在包中。
- [ ] AC-18：边界回归与诊断隐私保持；合成数据只由代码生成。
- [ ] `pnpm check` 与 `pnpm test:e2e` 通过。

## 验证方法

- Node 测试（内容、转换、Worker、缓存与持有者），使用代码生成的合成光盘。
- 本地份额推导只在 `local/` 中运行原版数据；不提交读数。
- `pnpm check`；`pnpm test:e2e` 只作回归，不替代 20 的新增断言。

## 完成证据
