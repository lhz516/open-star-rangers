---
type: plan
status: active
phase: P3
task: "03"
subtask: "25"
updated: 2026-10-09
---

# 25 — HUD 文字的 payload 契约

**契约来源：** [spec](../spec.md) 修订 1 的 S-08、AC-06（HUD 文字）、AC-11、AC-14（结构限值）、AC-18；[规范 payload](../spec.md#规范-payload) 的 `hud-text` 行、[字段处理规则](../spec.md#字段处理规则) 8、[限值的取值](../spec.md#限值与预算)、[错误](../spec.md#错误)、技术决定 14。
**依赖：** 06, 09, 24。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在计划新增的 `src/content/hud/hud-text-payload.ts` 中定义 `data/hud/text`（角色 `hud-text`）的规范内容与 payload，沿用 [view-labels-payload.ts](../../../../../src/content/hud/view-labels-payload.ts) 与 [canonical-json.ts](../../../../../src/content/canonical-json.ts) 的严格读取设施：
  - **键集：** 恰为闭包 #47 的 64 个区域，按 [executable 的 HUD、地图与通讯文字](../../../../original/formats/executable.md#hud-map-and-communications-text-from-the-exe-p3-0324)逐条对应。键名按仪表与用途用中性名（例如目标显示屏的无目标行、地图中种类 0x01 的种类词、种类 0x80 的计数行），不含原版文字。键集与顺序是 schema 常量。
  - **格式常量：** 每个键是否交给格式化，以及预期的转换序列（`%d`、`%.0f`、`%s`、`%%`，按文档逐条），作为与键集并列的 schema 常量导出，供 26 的转换器复用。
  - **payload：** `entries` 为键到字节串的对象，每个字节 1–255，不含结尾 NUL；schema 版本 1。
  - **读取器：** 严格解码、冻结、与输入隔离；缺键、多键、类型错误、非规范编码、字节越界、超长、以及格式化键的转换序列与常量不符，都按 code 拒绝。内容层错误码复用 `invalid-flight-data-payload`（与 `view-labels` 相同）与 `non-canonical-payload`；不新增错误码。
  - **限值：** 单条文字字节数 `textBytes` = 32，即观测最大值 15 字节（含 NUL）的 2 倍向上取整到 2 的幂；payload 字节上限按同一规则由 64 条的上限推导。读取器与转换器共用这组常量，在分配之前判定。
  - **格式核对函数：** 导出纯函数，按 C `printf` 的转换语法扫描字节串，得到转换序列，供读取器与 26 共用；不展开格式，也不实现格式化。
- 测试（`hud-text-payload.test.ts`）：往返逐字节相同；AC-11 的全部拒绝项；`textBytes` 恰为 32 通过、33 拒绝；格式化与非格式化键各自的转换序列核对（含 `%%`、多个转换、无转换却出现 `%`）；结果冻结与隔离。合成文字只由代码生成，不含原版文字。

## 不包含

- EXE 区域的读取、生产映射、图形步骤接线与切片定义：归 26。
- 文字的绘制、格式化与可达性：归 P3-13。
- 文档同步：由 22 完成；本项在完成证据中列出 API、键集的命名规则与限值。

## 关键文件与契约

- [view-labels-payload.ts](../../../../../src/content/hud/view-labels-payload.ts)、[status-messages-payload.ts](../../../../../src/content/hud/status-messages-payload.ts)（只读）：同组 data payload 的先例。
- [canonical-json.ts](../../../../../src/content/canonical-json.ts)、[contract-validation.ts](../../../../../src/content/contract-validation.ts)（只读）：规范 JSON 与错误码。
- [executable 的 HUD、地图与通讯文字](../../../../original/formats/executable.md#hud-map-and-communications-text-from-the-exe-p3-0324)：64 个区域、转换与用途。
- `src/content/hud/hud-text-payload.ts`（新建）。

## 写入范围

- `src/content/hud/hud-text-payload.ts`：键集、格式常量、限值、编码与读取器（新建）。
- `src/content/hud/hud-text-payload.test.ts`：测试（新建）。
- `src/content/hud/hud-text.test-support.ts`：合成内容（新建）。

## 验收标准

- [ ] 键集恰为 64 个，与 executable 的 #47 区域一一对应；格式常量与文档逐条一致（证据列出按仪表的计数核对）。
- [ ] AC-11：往返逐字节相同；缺键、多键、类型错误、非规范编码、字节越界、超长、转换序列不符都按 code 拒绝；结果冻结并与输入隔离。
- [ ] AC-14：`textBytes` 恰等于 32 时通过，超出 1 时被读取器拒绝（错误码与 `view-labels` 的同类拒绝相同）；payload 字节上限在解析前判定。
- [ ] AC-18：源码与测试中没有原版文字；`content/` 不导入 `original-data`。
- [ ] `pnpm exec vitest run src/content tools/engineering-boundaries.test.ts`、`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- Node 单元测试，使用代码生成的字节串。
- 键集与格式常量的核对：对照 executable 的表格逐条，证据只记计数与地址，不记文字。

## 完成证据
