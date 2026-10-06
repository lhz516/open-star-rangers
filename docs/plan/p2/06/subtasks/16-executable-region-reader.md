---
type: plan
status: active
phase: P2
task: "06"
subtask: "16"
updated: 2026-10-06
---

# 16 — LE 可执行文件的区域读取

**契约来源：** [spec](../spec.md) 的[效果几何数据](../spec.md#效果几何数据)中“EXE 区域读取”与结构限值；AC-18 的 EXE 部分；错误码中的效果条目。
**依赖：** 14。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。由 2026-10-06 的 spec 修订加入，见 [goal 执行记录](../goal.md#执行记录)。

## 工作范围

- 在 `src/original-data/formats/` 新增 LE 区域读取：
  - 从 MZ 头取 LE 偏移，校验签名、字节序与字序、页大小、对象表、页映射与修正页表；
  - 按对象序号、对象内偏移与长度读出区域，输出为独立副本；
  - 越出对象、跨入不由文件页支持的部分、与修正记录的目标位置重叠，都报 `invalid-payload`；
  - 对象数、页数与区域长度先于分配检查，超出报 `limit-exceeded`（`executableObjects`、`executablePages`、`executableRegion`）。
- 在 [source-error.ts](../../../../../src/original-data/source-error.ts) 追加 spec 的六个效果限值名。
- 在 [synthetic.ts](../../../../../src/original-data/synthetic.ts) 新增代码生成的合成 LE 文件：MZ 头、LE 头、对象表、页映射、修正页表与修正记录，可指定对象内容与修正位置。
- 原版格式的结构写入 [executable](../../../../original/formats/executable.md) §1（只记结构）。

## 不包含

- 区域 locator（15）、效果 payload（17）与步骤（18）。

## 关键文件与契约

- 新增 `src/original-data/formats/le-executable.ts` 及其测试；修改 `source-error.ts`、`synthetic.ts`。
- 测试只用合成 LE 文件，不读取原版 EXE。

## 验收标准

- [ ] AC-18（EXE）：合成 LE 文件上读出的区域与输入逐字节相等，输出不共享缓冲。
- [ ] 签名、字序、页大小、对象表、页映射或修正页表越界，区域越出对象、跨入非文件页、与修正重叠，都报 `invalid-payload`；对象数、页数或区域长度超限报 `limit-exceeded`，限值名正确，只读计数即拒绝。
- [ ] 本地对原版 EXE 运行读取，计划的全部区域都通过，且与修正不重叠（证据只记计数与判定）。
- [ ] `pnpm check` 通过。

## 验证方法

- Node 表驱动测试；本地只读脚本（被忽略的 `local/research/p2-06/`）。
- 完成前按 execute-goal 做 rubber-duck 与 simplify。

## 完成证据
