---
type: plan
status: active
phase: P2
task: "05"
subtask: "05"
updated: 2026-10-05
---

# 05 — 图形转换步骤

**契约来源：** [spec](../spec.md) 的 S-06，S-09 的步骤部分，S-07 的共用读取；[步骤结果](../spec.md#步骤结果)、[限值与预算](../spec.md#限值与预算)；技术决定 3、8、10；AC-09，AC-10 的共用读取与迟到拒绝部分。
**依赖：** 04。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **步骤内条目读取（`src/original-data/conversion/`，计划新增）：**
  - 以（光盘路径、条目类型、条目 ID）为键，经 `VerifiedSource.openArchive` 与封包句柄的 `read` 读取，并缓存读取结果；
  - 同一条目在一次步骤中只物理读取一次，缓存随步骤结束释放；
  - 不建立跨步骤或通用的封包缓存；
  - 转换器只读取缓存的字节，不修改、不转移。
- **扩展 [verify-source-mappings.ts](../../../../../src/original-data/source/verify-source-mappings.ts)：** 增加可选的条目读取参数。传入时用它读取每个定位；不传时行为与现在完全相同。等价备选核对、错误改写到 `sources.mappings[i].parts[j].alternatives[k]`、首个错误终止、不修改输入，这些语义都不变。
- **计划新增步骤函数：** 输入为已验证来源、映射表、声明组与预算限值。
  1. 用共用读取核验映射表；
  2. 核对声明与映射一一对应，不一致报 `invalid-declaration`；
  3. 解析子资源：整条目为 null，此外只接受 `palette`（整条目图像记录的嵌入调色板）与 `fonts/<i>`（CCKD 字体目录）。其他子资源，或子资源与 kind 不匹配，报 `invalid-declaration`。等价备选已证明字节相同，从第一个备选取字节；
  4. 调用 04 转换；
  5. 转换成功后，把含子资源的映射置为 `verified`，再用 `assetSourceStates` 得到不带定位的来源状态；
  6. 返回冻结的结果：只含有 Asset 的组，按 `RESOURCE_GROUPS` 顺序；每组的描述符、payload 与来源状态都按 Asset ID 升序、一一对应；外加转换用量。

  任一失败都抛出，不返回部分结果，也不输出任何 Asset 的状态或 payload。读取错误保持 P2-02/P2-03 的层、code 与位置。
- **测试：** 用 [disc.test-support.ts](../../../../../src/original-data/disc/disc.test-support.ts) 的 `syntheticFileDisc`、[synthetic.ts](../../../../../src/original-data/synthetic.ts) 的 `buildImfat`，以及 [source.test-support.ts](../../../../../src/original-data/source/source.test-support.ts) 的 `catalogFor` 构造已验证来源。端口带计量。
  - **AC-09：**
    - 整条目映射经核验后为 `verified`；含 `palette` 或 `fonts/<i>` 的映射只在转换成功后为 `verified`；
    - 损坏的字体使步骤失败、无结果；
    - 结果分区、排序与一一对应；两个共用 DATA 定位的调色板 Asset 字节相同、ID 不同、各在本组；
    - 用步骤输出的 `cockpit-hud-map` 部分，加上满足其余角色的合成 Asset（在 [synthetic-content.test-support.ts](../../../../../src/content/synthetic-content.test-support.ts) 的原版导入形状上替换），组成的组经 `validateGroup` 得到 `group-complete`；
    - 结果中不含定位、条目编号或原版字节。
  - **AC-10：**
    - DATA 被两个映射共用、CCKD 被三个字库共用时，各只物理读取一次（计量端口的读取次数与字节）；
    - 读取已发生后转换才因预算被拒：已发出的读取仍计入 `sourceReadBytes`，结果全部丢弃；
    - P2-03 现有的 `verify-source-mappings` 测试不改即通过。
- **文档：** 在[源码结构](../../../../engineering/source-structure.md)记录步骤、共用读取、子资源语法与结果形状；在“版本识别与已验证来源”一节注明核验的可选读取参数。

## 不包含

- 生产声明与映射：归 [06](./06-production-graphics.md)。
- 作业接入、阶段进度与用量合并：归 [07](./07-worker-integration.md)。
- 组清单、`ContentIdentity` 与组消息：归 P2-06/07/11。

## 关键文件与契约

- **修改：** [verify-source-mappings.ts](../../../../../src/original-data/source/verify-source-mappings.ts) 及其测试（只增加用例）。
- **计划新增：** `src/original-data/conversion/` 下的条目读取、步骤函数与相邻测试（尚不存在）。
- **复用：** [source-mapping.ts](../../../../../src/original-data/source-mapping.ts) 的 `assetSourceStates`；[identify-source.ts](../../../../../src/original-data/source/identify-source.ts) 的 `VerifiedSource` 类型；[archive-reader.ts](../../../../../src/original-data/archive/archive-reader.ts) 的类型，只能纯类型导入。

## 验收标准

- [x] AC-09 全部条件通过，包括 `group-complete`。
- [x] AC-10 共用读取：共用条目只物理读取一次；迟到拒绝时读取用量保留、结果丢弃。
- [x] `verifySourceMappings` 不传读取参数时行为不变，P2-03 测试全部通过。
- [x] 能力规则无违规：`original-data/conversion/` 不值导入 `archive/` 或 `imfat.ts`；`pnpm exec vitest run src/original-data tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 合成光盘测试，带计量端口，不读取 `local/`。
- 不适用 browser-testing 或原版对照。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **实现（2026-10-05）：**
  - [verify-source-mappings.ts](../../../../../src/original-data/source/verify-source-mappings.ts) 增加可选参数 `readEntry`（导出 `EntryReader` 类型）。默认读取是模块私有函数，保持原先的顺序：先打开封包（每次核验缓存句柄），再查 u32 ID，再读取。错误改写与等价备选核对不变。
  - 新增 [graphics-step.ts](../../../../../src/original-data/conversion/graphics-step.ts) 的 `runGraphicsStep(source, mappings, declarations, limits, usage)`：
    - 私有的步骤内读取经 `VerifiedSource.openArchive` 读取，按（光盘路径、类型、ID）缓存 Promise，随步骤释放；
    - 先核验映射，再核对声明与映射一一对应；
    - 只接受单部件映射与 `null`/`palette`/`fonts/<i>` 三类子资源，取第一个备选的字节交给 04 的转换器；
    - 转换成功后才把全部映射置为 `verified` 并推导状态；
    - 结果按 `RESOURCE_GROUPS` 分区，各列表按 ID 升序且一一对应，并全部冻结。
  - [conversion.test-support.ts](../../../../../src/original-data/conversion/conversion.test-support.ts) 新增合成封包（DATA、TEX、CCKD）与映射构造，以及按 spec 编写的转换位置语法 `inGraphicsLocationGrammar`，`expectSourceError` 自动核对 `graphics…` 位置。
- **测试：** `pnpm exec vitest run src/original-data/conversion src/original-data/source` 9 个文件 261 项通过。[graphics-step.test.ts](../../../../../src/original-data/conversion/graphics-step.test.ts) 在合成光盘上经 `identifySource` 得到已验证来源，并对封包句柄的 `read` 计数：
  - **AC-09 结果：** 6 个 Asset 分到 `models` 与 `cockpit-hud-map`，描述符、payload 与状态按 ID 升序一一对应，全部 `verified` 且冻结。两个飞行调色板字节相同、ID 不同、各在本组。payload 可同时转移。序列化后的结果不含光盘路径、条目编号、条目类型、`fonts/` 或 locator 字段。用量为 assets 6、paletteEntries 520、glyphs 512，`sourceReadBytes` 为 0。
  - **AC-09 来源状态：** 单独核验时，含 `palette` 与 `fonts/<i>` 的映射仍为 `declared`；损坏的 4×6 字体（高 9）使步骤以 `limit-exceeded@graphics[font/hud/4x6].glyphs` 失败，没有结果。
  - **AC-09 group-complete：** 步骤输出的 `cockpit-hud-map` 部分，加上满足 front-cockpit、hud-mfd 与 strategic-map 的合成原版导入 Asset（布局依赖改为 `font/hud/8x8-1`），经 `validateGroup` 得到 `group-complete`。
  - **AC-10 共用读取：** 步骤中 DATA（两个映射共用）、TEX（整条目与 `palette`）、CCKD（两个字库）各只读取一次；不共用读取的默认核验各读两次，读取字节更多。
  - **AC-10 迟到拒绝：** `glyphs` 限值 256 时在第二个字库报 `budget-exceeded`（observed 512）。此时 `sourceReadBytes` 的增量与成功步骤相同，各条目仍只读一次，没有结果。
  - **配对与子资源：**
    - `invalid-declaration` 情形：声明缺映射报在 `graphics.declarations[5]`，映射缺声明报在 `graphics.declarations`；未知子资源与前导零的字库序号报在 `.fonts`；整条目 TEX 作调色板报在 `.palette`；CCKD 整条目作图像与双部件映射报在 `.record`。
    - `fonts/3` 与 11 位序号到达读取，报 `subresource-not-found`。
    - 读取失败保持 P2-03 的 `entry-not-found@sources.mappings[2].parts[0].alternatives[0]`。
  - [verify-source-mappings.test.ts](../../../../../src/original-data/source/verify-source-mappings.test.ts) 原有用例不改即通过。新增的用例证明传入的读取按映射、部件、备选顺序被调用，结果与默认读取相同，读取错误仍改写到定位路径。
- **工程：** `pnpm exec vitest run src/original-data tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 与 `pnpm check` 通过。`conversion/` 只值导入公开的 `verify-source-mappings.ts` 与 `source-mapping.ts`，对 `archive-reader.ts` 与 `open-verified-source.ts` 只做纯类型导入。
- **Rubber-duck：** 三项发现均已处理：
  - **High：** 公开模块导出了读取封包的 `archiveEntryReader`。现改为模块私有，步骤自带读取，公开模块只导出类型。未新增静态导出面回归：现有规则只为产品入口检查导出面，扩大规则超出本任务范围。
  - **Medium：** 字库序号原先限制位数。现改为任意不带前导零的十进制，越界由读取报 `subresource-not-found`。
  - **Medium：** `graphics.declarations` 根位置不在 spec 语法内。已按授权澄清 spec，见 [goal 执行记录](../goal.md#执行记录)，并新增语法检查。
- **Simplify：** 采纳步骤读取改为私有（测试改由句柄计数证明共用）、字库序号只解析一次、测试用显式句柄包装代替 Proxy、复用 `kindOf`，以及去掉多余的类型断言与重复的映射构造。未采纳：
  - 核验后修剪未使用的备选：缓存按 spec 只在步骤内，生产映射只有一个备选；
  - 并发解析来源：会削弱确定的首错顺序；
  - 不重读映射表：P2-03 也用 `readSourceMappingTable` 构造新表；
  - 单遍分组：只有 4 个组。
- **文档影响：**
  - [源码结构](../../../../engineering/source-structure.md#图形转换)补充转换步骤（共用读取、配对、子资源语法、结果形状与失败语义）、测试支持中的位置语法，以及“版本识别与已验证来源”一节的可选读取参数；目录树加入 `graphics-step.ts`。
  - [spec](../spec.md#错误码) 的位置语法按授权澄清，见 goal 执行记录。
  - 工程约定、工具指南与原版文档无需更新。

