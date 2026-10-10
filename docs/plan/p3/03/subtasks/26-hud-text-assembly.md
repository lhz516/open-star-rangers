---
type: plan
status: active
phase: P3
task: "03"
subtask: "26"
updated: 2026-10-09
---

# 26 — HUD 文字的转换与装配

**契约来源：** [spec](../spec.md) 修订 1 的 S-08、S-14、S-15、AC-06（HUD 文字）、AC-12、AC-13、AC-14、AC-16、AC-18；[Asset 与角色](../spec.md#asset-与角色)的 `data/hud/text` 行、[切片定义版本 4](../spec.md#切片定义版本-4)、[来源映射与核验](../spec.md#来源映射与核验)、[限值与预算](../spec.md#限值与预算)、技术决定 14。
**依赖：** 25, 27。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **读取与核对：** 用 [executable-text.ts](../../../../../src/original-data/formats/executable-text.ts) 的 `readExecutableText`（必要时推广为按区域表读取）读取闭包 #47 的 64 个区域：每个区域恰好覆盖字串及其 NUL；字节须为 1–255；超长在读取前按区域长度判定。用 25 的格式核对函数与格式常量核对每条：转换序列或是否交给格式化与常量不符时为 `source` 层的 `unsupported-payload`，位置为区域 locator 与键的结构路径，不回显文字。
- **生产映射：** 计划新增的 `production-hud-text.ts` 定义 `data/hud/text` 的映射（64 个 EXE 区域，locator 按 [executable 的 HUD、地图与通讯文字](../../../../original/formats/executable.md#hud-map-and-communications-text-from-the-exe-p3-0324)，顺序与 25 的键集一致）与声明，置信度 `confirmed`，附 U-030、U-026 的说明。
- **图形步骤：** 生成 cockpit-hud-map 组的图形步骤产出 `data/hud/text`（无依赖），与该步骤既有的 EXE 区域读取共用步骤内读取；映射在转换成功后升为 `verified`，来源状态绑定指纹。
- **切片定义：** [slice-definition.ts](../../../../../src/content/slice-definition.ts) 的版本 4 增加必需角色 `hud-text`（cockpit-hud-map，data，恰为 1）。版本号仍为 4。
- **份额与限值：** 在基准上以不设上限的限值运行图形步骤，取得 `data/hud/text` 的实际用量，按“2 倍向上取整到 2 的幂”推导份额（新增常量或并入既有的飞行图形份额，由本项决定并说明），`PRODUCTION_PACKAGE.limits` 由测试从份额推导一致。观测值与结果写入完成证据，只记计数。脚本与输出在 `local/research/p3-03/shares/`，使用新文件名，不覆盖 19 的输出。
- **合成数据：** 合成内容包加入 `data/hud/text`；Worker 的合成光盘的 EXE 加入 64 个代码生成的区域；读取日志断言包含这些区域。
- **测试：**
  - AC-06：64 条正向转换、保留 128–255 的字节；缺少 NUL、超长、区域越界与转换序列不符的拒绝；
  - AC-12：去掉 `data/hud/text` 时为 `incomplete`；
  - AC-13：区域映射核验与 `verified` 时机；
  - AC-14：新增份额维度恰等于份额通过、超出 1 为 `budget-exceeded`；
  - AC-16：合成作业的四组结果与读取日志。
- **本地核对：** 27 已使 `warp-arrival` 可转换；本项在基准上运行生产作业，确认得到 `complete` 的版本 4 包（含 `data/hud/text`），只记结论、计数与哈希，输出只在 `local/research/p3-03/shares/`。正式的本地核对由 21 完成。

## 不包含

- payload 契约、键集与格式常量：归 25（只读使用）。
- sound payload：归 27。
- 浏览器断言：归 20；本地 CLI 与独立读取：归 21；文档：归 22。
- 转换器组件：图形组件已由 19 递增为 `graphics-4`。本项不再递增，因为 19 的中间输出没有在真实来源上产生过完整的包（基准作业在 `flags` 8 处失败关闭），证据中写明。

## 关键文件与契约

- 25 的 `src/content/hud/hud-text-payload.ts`（只读）。
- [executable-text.ts](../../../../../src/original-data/formats/executable-text.ts)、[step-entry-reader.ts](../../../../../src/original-data/conversion/step-entry-reader.ts)、[graphics-step.ts](../../../../../src/original-data/conversion/graphics-step.ts)、[convert-graphics.ts](../../../../../src/original-data/conversion/convert-graphics.ts)、[production-graphics.ts](../../../../../src/original-data/conversion/production-graphics.ts)。
- [slice-definition.ts](../../../../../src/content/slice-definition.ts)、[production-package.ts](../../../../../src/workers/production-package.ts)、[import-job.ts](../../../../../src/workers/import-job.ts)。
- 计划新增：`src/original-data/conversion/production-hud-text.ts` 及其测试。

## 写入范围

- `src/content/slice-definition.ts`：新必需角色。
- `src/content/slice-definition.test.ts`：测试。
- `src/content/synthetic-content.test-support.ts`：合成包。
- `src/content/completeness.test.ts`：受角色影响的断言。
- `src/content/manifest-identity.test.ts`：受包形状影响的断言。
- `src/content/graphics/graphics-binding.test.ts`：受包形状影响的断言。
- `src/original-data/formats/executable-text.ts`：按区域表读取（如需推广）。
- `src/original-data/formats/executable-text.test.ts`：测试。
- `src/original-data/conversion/**`：映射、图形步骤、份额与受影响的测试。
- `src/workers/**`：合成光盘、生产包限值与受影响的测试。
- `src/app/**`：受包形状影响的测试。
- `src/platform/storage/**`：受包形状影响的测试。
- `tools/logic-check.ts`：受包形状影响时。
- `tools/logic-check.test.ts`：对应测试。
- `e2e/**`：受包形状影响的既有断言。
- `local/research/p3-03/shares/**`：份额推导与本地作业核对的新输出（被忽略）。

## 验收标准

- [ ] AC-06（HUD 文字）：64 条转换正确，拒绝项按 code 与位置报告，诊断不回显文字。
- [ ] AC-12：版本 4 含 `hud-text`；缺少时为 `incomplete`。
- [ ] AC-13：64 个区域的映射核验与 `verified` 时机正确，来源状态绑定指纹。
- [ ] AC-14：份额由基准观测推导并记录，`PRODUCTION_PACKAGE.limits` 由测试推导一致。
- [ ] AC-16：合成作业四组 `group-complete`，读取日志只含映射的条目与区域。
- [ ] 本地：基准上的生产作业得到 `complete` 的版本 4 包，结论只在 `local/`。
- [ ] AC-18：合成文字只由代码生成；源码、测试与诊断中没有原版文字。
- [ ] `pnpm check` 与 `pnpm test:e2e` 通过。

## 验证方法

- Node 测试：转换、映射、图形步骤、切片定义、作业与持有者，使用代码生成的合成光盘。
- 本地基准运行只在 `local/`；`pnpm check`、`pnpm test:e2e`。

## 完成证据
