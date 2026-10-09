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

- [x] AC-06（解析部分）：5 张菜单、11 个选择值与 7 条消息转换正确，文字为字节串并保留 128–255 的字节；缺少 NUL、超长、区域越界与值域外按 code 拒绝；TABL 10165 中不属于本任务的部分不出现在结果中。
- [x] AC-14：每个结构限值恰等于上限时通过，超出 1 时为 `limit-exceeded`。
- [x] AC-18：诊断不回显文字；测试不读取文件。
- [x] `pnpm exec vitest run src/original-data/formats tools/engineering-boundaries.test.ts` 与 `pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 表驱动测试，使用代码生成的合成数据。不涉及浏览器或原版数据。

## 完成证据

2026-10-09，worker `exec-p3-03-12`，基于认领提交 f777547。

- **实现：**
  - [comm.ts](../../../../../src/original-data/formats/comm.ts)：`parseCommMenus(archive, reads): CommMenus`，`reads` 为 `CommMenuReads`（按内容键给出 5 个条目读取，由调用者配对，模块内没有条目 ID）。命令表与类别表从偏移 0 按 8 字节读取项目，直到首个 +0x04 为 0 的项目并包含它（comm §1）；每项先查项目在块内（否则 `invalid-payload`，`/items`），再查 `commMenuItems`（观测值为序号 + 1），再读 u32 值。文字指针须已登记且目标在块内；目标落在项目表内（含末项）为 `unsupported-payload`（字段处理规则 4）。文字在 `COMM_MENUS_LIMITS.textBytes`（32）内以 NUL 结束，重定位不得覆盖文字或 NUL，字节 1–255 原样保留，空文字按内容契约接受。TABL 2009 只读第 0 项的文字，其 +0x04 非零为 `unsupported-payload`（字段处理规则 6）。末项之后的项目、未被指向的字节与其中的重定位不检查。共享文字、指向另一文字中部的指针与 2007 项目的文字长度都不另加限制：格式文档没有这类规则，按存储值保留，菜单如何使用归 P3-10/P3-13。导出 `COMM_MENU_ENTRY_BYTES`（512）与 `CommMenuReads`。
  - [base-repair.ts](../../../../../src/original-data/formats/base-repair.ts)：`parseBaseRepairItems(archive, read): BaseRepairItems`。要求 11 × 0x7C = 1,364 字节在块内（否则 `invalid-payload`，`/records`），只以 `PayloadBlock.u32` 读取各记录 +0x6C（重定位覆盖为 `invalid-payload`）；值域为代码接受的 0–31、33、34，其外为 `unsupported-payload`（`/subsystemSelectors[k]`）。图像、+0x70–+0x78、文字与记录之后的数据既不转换也不检查。导出 `BASE_REPAIR_RECORD`（`bytes` 0x7C、`selector` 0x6C）与 `BASE_REPAIR_ENTRY_BYTES`（262,144）。
  - [executable-text.ts](../../../../../src/original-data/formats/executable-text.ts)：`readExecutableText(read, { locator, path }, textBytes)` 与 `parseFlightMessages(regions, read): Promise<FlightMessages>`。`read` 为 `ExecutableRegionRead`，即 `(locator, path) => Promise<Uint8Array>`，与 `stepRegionReader` 兼容；`regions` 为 `FlightMessageRegions`，每个键给出 `LocatedRegion`（区域 locator 与诊断位置，例如映射路径），键由调用者配对。读取前按 locator 的长度判定 `textBytes`（观测值为区域长度 − 1，上限 `FLIGHT_MESSAGES_LIMITS.textBytes` 128）；越界、对象不存在与被 fixup 修补由 LE 读取器拒绝（`invalid-payload`，位置为给定路径）；首个 NUL 必须恰是区域的最后一字节，否则（没有 NUL、NUL 在区域内提前出现、区域越过 NUL）为 `invalid-payload`。7 个区域按内容顺序逐个读取，首个失败确定。`executableRegion` 限值仍由 LE 读取器判定（65,536）；对飞行消息，`textBytes` 先于它触发。
- **限值（AC-14）：** 限值名沿用 06：`commMenuItems`、`textBytes`、`payloadEntryBytes`。COMM 条目 512（最大的 TABL 2013 为 166 字节，2 倍取 2 的幂），项目 16、文字 32 与飞行消息文字 128 沿用 08 的内容限值（读取器共用常量），TABL 10165 条目 262,144（69,407 的 2 倍取 2 的幂）。测试以同一公式由观测值重算这些常量。恰等于上限通过、超出 1 为 `limit-exceeded`（含 `limit` 与 `observed`）：COMM 列表 16/17 项、2007 与 2009 的文字 32/33 字节、COMM 条目 512/513、TABL 10165 条目 262,144/262,145、飞行消息文字 128/129（以及任意上限 4/5），超限时不读取区域（读取日志为空）。
- **测试（AC-06、AC-18）：** 共 47 例，数据全部由代码生成。
  - [comm.test.ts](../../../../../src/original-data/formats/comm.test.ts)（19 例），合成支持 [comm.test-support.ts](../../../../../src/original-data/formats/comm.test-support.ts)：`syntheticCommTable(items)`、`syntheticCommTables(menus)`、`commMenuReads(tables)`、`defaultCommMenus()`、`COMM_NOB`、`COMM_MENU_IDS`、`COMM_ITEM_BYTES`，每段文字从奇数偏移开始（非对齐指针），重定位表乱序，可供 15 组装合成 COMM.NOB。用例：5 张菜单按存储值转换（含末项、0x80/0xFF、空文字、位 31 置位的命令码），结果深度冻结并经 `readCommMenus` 往返；另一组合成值与互换的表证明数据来自输入、键由调用者配对；末项之后的项目、尾随字节与其中的重定位、TABL 2009 第 0 项之后的项目都不影响结果；拒绝：块内没有末项、值字段上的重定位、文字指针未登记、为空、越界、指向项目表内（含表的最后一字节），重定位落在文字内、文字的 NUL 上或从前一字节伸入文字，文字在块内没有 NUL，2009 的值非零（`unsupported-payload`）或其上有重定位；指向表后第一个字节的指针可以接受。
  - [base-repair.test.ts](../../../../../src/original-data/formats/base-repair.test.ts)（17 例）：11 个选择值按记录顺序转换且结果只有 `subsystemSelectors`；不同种子与尾随长度、只有记录且其余全为 0xFF、在不覆盖选择值的每个位置都登记重定位、多出的第 12 条记录，结果都不变；0、31、33、34 通过，32、35、0x7FFFFFFF、0x80000000、0xFFFFFFFF 在第 0 与第 10 条记录都为 `unsupported-payload`；重定位从 −3 到 +3 覆盖选择值为 `invalid-payload`；块恰为 1,364 字节通过，少 1 字节拒绝。
  - [executable-text.test.ts](../../../../../src/original-data/formats/executable-text.test.ts)（11 例）：合成 LE 文件（`syntheticLeExecutable` 与 `openLeExecutable`）中的 7 段字串，从奇数偏移开始，长度 0–128，含 0x01、0x7F、0x80、0xFF；结果深度冻结并经 `readFlightMessages` 往返，读取按内容顺序；另一组字节与互换的区域证明数据来自输入、键由调用者配对；区域在 NUL 之前结束、越过 NUL、从字串中部开始、内含提前的 NUL、越过对象末尾、对象不存在、被 fixup 修补，都为 `invalid-payload`，位置为给定的映射路径；两个区域都坏时报告内容顺序中的第一个。
  - **隐私：** 合成文字含 `MARKER`（COMM 的被破坏表、TABL 10165 的尾随数据、飞行消息），各拒绝用例经 `expectSourceError` 或 `sourceFailure` 核对位置语法且诊断不含 MARKER。
- **变异核对：** 分别去掉以下检查，测试都会失败：COMM 文字目标须在项目表之后、`commMenuItems` 限值、2009 值为零、保留末项、先查项目在块内、文字的重定位覆盖范围；选择值值域与 32 的边界、选择值的重定位检查、记录在块内；EXE 的提前 NUL、缺少 NUL、`textBytes` 预检与键的配对。
- **检查：**
  - `pnpm exec vitest run src/original-data/formats tools/engineering-boundaries.test.ts`：13 个文件 560 例通过；
  - `pnpm typecheck`、`pnpm lint` 通过；
  - `pnpm check`：类型检查、ESLint、171 个文件的测试与生产构建通过；
  - `pnpm check:original` 为 `passed: true`。
- **Rubber-duck：** 审阅 7 个文件与 spec、格式文档、协调者决定，没有发现问题。
- **Simplify：** 4 个角度。
  - **采纳：** 测试改用 08 的 `syntheticBaseRepairItems` 与 `syntheticFlightMessages`；TABL 10165 合成块只写选择值并在指针字段登记重定位，去掉指针目标的计算；去掉 `layout` 未用的参数与测试读取器多余的 `async`；只验证夹具的单独用例并入拒绝用例；EXE 的两项 NUL 检查合并为一项（变异核对显示前一项被后一项包含）。
  - **未采纳：** 项目宽度在测试支持中另设 `COMM_ITEM_BYTES`，作为独立于解析器的对照（与 `craft.test-support.ts` 相同）；`executableRegion(locator)` 在预检与 `stepRegionReader` 中各解析一次（每条消息一次正则，可忽略；读取器接口以 locator 为键）；以下涉及写入范围之外的共用模块，交协调者考虑：NUL 结尾字节串的读取（`comm.ts`、`craft.ts`、`view-labels.ts`、`scen.ts` 各有一份）可作为 `PayloadBlock` 的共用方法；`BlockWriter`、`resized` 与 `expectSourceError` 位于 craft 的测试支持，可移入 `formats.test-support.ts`。
- **文档影响：** 只按 comm、hud 与 executable 已记录的结构实现，格式事实、U 项、工程约定与命令不变；STATUS 与阶段索引无须改动。交 22 的原版数据分册条目：`formats/comm.ts`（`parseCommMenus`、`CommMenuReads`、`COMM_MENU_ENTRY_BYTES` 512 及其推导，项目与文字限值共用 `COMM_MENUS_LIMITS`）、`formats/base-repair.ts`（`parseBaseRepairItems`、`BASE_REPAIR_RECORD`、`BASE_REPAIR_ENTRY_BYTES` 262,144 及其推导）、`formats/executable-text.ts`（`readExecutableText`、`parseFlightMessages`、`ExecutableRegionRead`、`LocatedRegion`、`FlightMessageRegions`，文字限值共用 `FLIGHT_MESSAGES_LIMITS.textBytes`），以及错误码与位置（`/items`、`/items[i]/text`、`/items[i]/command`、`/items[i]/kindMask`、`/items[0]/value`、`/records`、`/subsystemSelectors[k]`，EXE 为调用者给出的路径）。
