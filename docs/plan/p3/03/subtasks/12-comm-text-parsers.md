---
type: plan
status: active
phase: P3
task: "03"
subtask: "12"
updated: 2026-10-09
---

# 12 — 通讯菜单、基地修理项目与程序文字解析器

**契约来源：** [spec](../spec.md) 的 S-06、S-07、S-08（`flight-messages`）、S-15、AC-06、AC-14（结构限值）、AC-18；[字段处理规则](../spec.md#字段处理规则) 6、8。
**依赖：** 08。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 `original-data/formats/` 中新增 3 个解析器：
  - **COMM 菜单：** 按 04 的结构解析 TABL 2003、2005、2007、2009、2013，产出 08 的 `comm-menus` 内容。菜单键名由调用者按条目给出；项目文字为字节串（1–255），须在块内以 NUL 结束。
  - **TABL 10165 的选择值：** 按 04 的结构定位 11 条 0x7C 字节的记录，只读取 +0x6C，并按值域核对，值域外为 `unsupported-payload`。图像、+0x70–+0x78 与文字不读取也不转换，只检查定位所需的结构。产出 `base-repair-items` 内容。
  - **EXE 字串：** 读取 7 个 EXE 区域，每个区域恰好覆盖字串及其 NUL。NUL 不在区域末尾、区域内提前出现 NUL、超长或越界都按 code 拒绝。产出 `flight-messages` 内容，键名由调用者给出。
- 沿用 payload-block 的规则；EXE 区域的读取沿用 [le-executable.ts](../../../../../src/original-data/formats/le-executable.ts) 与已有的区域 locator 约定。结构超限用 06 的限值名。
- 用代码生成的合成 COMM 表、TABL 10165 块与 EXE 区域编写测试：项目数、128–255 字节的文字、非对齐指针；缺少 NUL、超长、越界、值域外与超限的拒绝；TABL 10165 中不属于本任务的字段即使改变也不影响结果。

## 不包含

- TABL 10399 的视角标签与 RENS 头部：归 13。
- 来源映射与转换：归 15。
- 菜单状态机与消息显示：归 P3-10、P3-11、P3-13。
- 模块分册：由 22 同步。

## 关键文件与契约

- [payload-block.ts](../../../../../src/original-data/formats/payload-block.ts)、[le-executable.ts](../../../../../src/original-data/formats/le-executable.ts)（只读）。
- 08 新增的 `src/content/rule-data/` 类型；04 的 `docs/original/formats/comm.md`、[hud](../../../../original/formats/hud.md) 与 [executable](../../../../original/formats/executable.md)。
- 计划新增：`src/original-data/formats/comm.ts`、`base-repair.ts`、`executable-text.ts` 与它们的测试和合成支持。

## 写入范围

- `src/original-data/formats/comm.ts`：COMM 菜单解析（新建）。
- `src/original-data/formats/comm.test.ts`：测试（新建）。
- `src/original-data/formats/comm.test-support.ts`：合成 COMM 表（新建）。
- `src/original-data/formats/base-repair.ts`：TABL 10165 选择值解析（新建）。
- `src/original-data/formats/base-repair.test.ts`：测试（新建）。
- `src/original-data/formats/executable-text.ts`：EXE 字串读取（新建）。
- `src/original-data/formats/executable-text.test.ts`：测试（新建）。

## 验收标准

- [ ] AC-06（解析部分）：5 张菜单、11 个选择值与 7 条消息转换正确，文字为字节串并保留 128–255 的字节；缺少 NUL、超长、区域越界与值域外按 code 拒绝；TABL 10165 中不属于本任务的部分不出现在结果中。
- [ ] AC-14：每个结构限值恰等于上限时通过，超出 1 时为 `limit-exceeded`。
- [ ] AC-18：诊断不回显文字；测试不读取文件。
- [ ] `pnpm exec vitest run src/original-data/formats tools/engineering-boundaries.test.ts` 与 `pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 表驱动测试，使用代码生成的合成数据。不涉及浏览器或原版数据。

## 完成证据
