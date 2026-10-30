---
type: plan
status: active
phase: P3
task: "14"
subtask: "13"
updated: 2026-10-28
---

# 13 — 空间与引擎播放参数

**契约来源：** [spec](../spec.md#位置处理与引擎音) 的 S-05、AC-06。
**依赖：** 07, 08, 10。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 用 05 已核实公式把事件位置/真实运动量和 07 听者输入转换成 10 的播放参数。
- 玩家引擎使用获批机型字段和实际速度；非玩家使用规定的相机时间点、距离/投影与速率输入。
- 覆盖零距离、阈值、不可投影、钳位、非连续放置、缺少已要求字段和非法数值；不以位置差/静止默认值掩盖缺字段。
- 导出的类型只表达本模块所需输入/输出，后续 20 适配真实 P3-12，不复制相机或 EXPL 选择器。

## 不包含

- 不改变 Core 速度、不引入声学模拟或任意后备曲线；不直接操作 Web Audio 节点。

## 关键文件与契约

- 现有 [MotionPlayer](../../../../../src/core/projections/projection.ts)、[CraftRecord](../../../../../src/content/rule-data/craft-info.ts)及 08 扩展输出。
- 计划新增 `src/app/flight-audio/parameters.ts`、`parameters.test.ts`。

## 写入范围

- `src/app/flight-audio/parameters.ts`：纯参数计算与听者需求类型。
- `src/app/flight-audio/parameters.test.ts`：独立公式和边界测试。

## 验收标准

- [x] 获批公式逐输入/边界可断言，单位与数据源没有替换。
- [x] 事件位置与当前持续状态用途分开，placementSerial 改变不造成虚假高速。
- [x] 非有限值和契约缺失显式失败；输出适合 start 前应用，无 Core/RNG 写入。

## 验证方法

- 合成听者、运动读数和规范内容，期望独立于被测函数；`pnpm test -- src/app/flight-audio/parameters.test.ts`、`pnpm check`。
- 调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)限定参数模块；替身不能充当 20 的真实相机集成。

## 完成证据

- **实现：** [parameters.ts](../../../../../src/app/flight-audio/parameters.ts)：`nonPlayerParameters`（A-04：曼哈顿距离音量、`|R2ₛ·R2| ≥ 1e−6` 时由径向相对速度算绝对速率、相机行 1 平面上曼哈顿归一化的声像，不可投影为 64）、`engineParameters`（A-05：指令速度 c 与机型记录 +0xB8 的 M，c < 1 静音且不改速率）、`START_PARAMETERS`（127/64/存储速率）、`audioListener`（DW-05：`afterStep` 相机与 `motion.player.speed`）、`entityReading`（Render State 的位置、`orientation` 6–8 与 `speed`）、`shotReading`/`hitReading`（D1-04/DW-05：本 tick 仍列出的实体优先，否则 FA-05 快照）。f32 存储点按原生指令逐一复现（含相对速度 y 分量的源乘积不先存储），整数转换向零截断，速率钳位 0–44,100 后按 D1-13 取至少 1 Hz。结果是控制器的 `Partial<VoiceParameters>`，只含原版本次设置的值，可直接作为 `play` 的初始参数（start 前应用）或 `update`。
- **AC 1（公式与边界）：** `parameters.test.ts` 的期望按 audio A-04/A-05/A-09 手算，输入选为 f32 存储精确：曼哈顿而非欧氏（124 对 125）；d = 0.03125 → 127、0.0625 → 126、3770 → 1、3771 → 音量 0 但仍设声像与速率、≥ 3800 只设音量 0；速率 13781/8268/11025/15159、听者速度 13230/8820、曼哈顿归一化、钳位 44,100 与 0 → 1 Hz、1e−6 门限两侧（f32(1e−6) 不算、下一个 f32 算，正负对称）；声像 127/0/63（前后同）/64（行 1 方向）/95（平面内曼哈顿）、非原点相机与转向的行、未归一化行的钳位、零行相机得 63 且不算速率；引擎 19000/11000/3160/43960/44100、1 Hz 下限、32 位加法回绕、低于 1 静音。另有三组非精确回归向量（相对速度 y 分量的存储次序：11293，先存储为 11294；一般位姿速率 11430；声像 83；距离存储使音量为 0 而非 1），经变异检查（改存储次序、去掉距离存储）确认测试会失败。
- **AC 2（事件位置与持续状态分开）：** 速度只取移动块（Render State `speed`、事件 `*Speed`），不取位置差；同一实体位置跳变且 `placementSerial` 改变后的参数与一直在该处的实体相同（速率 13781）；一次性来源在本 tick 列出时用实体、否则用快照（13781 对 8268），ID 不符报 `entity-mismatch`。
- **AC 3（显式失败、start 前、无 Core/RNG）：** 非有限输入按路径报 `non-finite`；`motion` 未实现报 `not-implemented`，ready 而缺 `player` 项、快照无速度（停放受害者）报 `missing-field`；D1-06 只覆盖零距离（127/64、不设速率）、无玩家、M = 0；会使原版 f32 存储或整数转换陷入的超大输入（如径向速度使速率超出 32 位）报 `out-of-range`，不静默保留速率。所有结果冻结且通过控制器的 `mergeVoiceParameters`；输入深冻结、`Math.random` 未被调用；模块不导入 Core 的可变状态，只读类型。
- **命令：** `pnpm exec vitest run src/app/flight-audio/parameters.test.ts` 32 项通过；`pnpm check` 通过（436 个测试文件 11,730 项，typecheck、lint、build）。
- **rubber-duck：** 采纳四项：ready 的 `motion` 缺 `player` 项不得当作无玩家；有限输入经中间 f32 溢出不得产出 NaN 参数（改为 `out-of-range`）；整数溢出不扩展 D1-06 而显式失败；补非精确回归向量保护存储次序。确认相对速度 y 分量的不对称、引擎 32 位加法与部分结果语义与原生指令一致。
- **simplify：** 采纳曼哈顿长度共用、行检查只在失败时构造路径、声像平面投影直接传行分量、`player` 读取去掉多余可选链、模块注释精简；未采纳复用 `core/rules/movement-builders.ts` 的 `rowOf`（返回 Vec3，收益小）、复用 render 层测试夹具（无 `speed` 选项且跨模块）、删除 `START_PARAMETERS`（16 需要可更新的参数化发声，无参数 `play` 是固定发声）、去掉 `nonPlayerParameters` 内的听者复检（手工构造的听者仍须校验）。
- **文档影响：** 原版事实无新增（公式、常量与陷入条件都已在 audio A-04/A-05/A-09 与 executable 的 x87 精度节）；unknowns 无变化。app 分册的 flight-audio 一节按执行记录由 27 统一补写，本项建议列入 `parameters.ts` 的导出与 `FlightSoundParameterError` 的五种失败；STATUS 与 tasks.md 无需变化。替身测试不代替 20 的真实相机集成（`PresentationExplosion` 的 `forward`/`speed` 由 20 增补后经 `SourceReading` 适配）。
