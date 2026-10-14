---
type: plan
status: active
phase: P3
task: "09"
subtask: "30"
updated: 2026-10-14
---

# 30 — 方向表改用原版映像常数（修复）

**契约来源：** [spec](../spec.md) 的 S-01、AC-01（共享规则数据与原版一致）；[P3-02 的 P3-09 契约修订](../../02/spec.md#p3-09-的契约修订d-01) MW-03、MW-08、MW-12（`startupRotations` 的前向行取自方向表，R-A 的代码规则分支）；goal 执行记录“28 发现既有方向表偏差，新增修复 30”。
**依赖：** 28。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 把 [random-direction.ts](../../../../../src/core/rules/random-direction.ts) 中方向表的两个常数改为原版映像中的值（28 的完成证据：`0x17210c` 是略大于 π 的十进制 π，`0x172114` 是 1/180 减一个 ulp），以 f64 位模式写出并注明来源地址；运算次序与精度保持原版（28 的 findings 与 [x87 一节](../../../../original/formats/executable.md#x87-precision-rounding-and-trigonometry-p3-0202)）。更正同一文件中“即原版常数”的注释。
- 新增独立期望：以位模式断言两个常数，并以 28 的独立复算（只用判定与散列，不提交表的数值）核对整张表的散列；更正依赖“每个分量非负”的断言（38 个分量为负）。
- 复核方向表的全部既有读者（[firing.ts](../../../../../src/core/rules/firing.ts)、[flight-control.ts](../../../../../src/core/rules/flight-control.ts)、[parked-travel.ts](../../../../../src/core/rules/parked-travel.ts) 及 area 系统）的测试与 replay 金样：只因表值变化而改变的期望按新表更新并在证据中逐项说明；行为分支变化须先查明原因，不用改期望掩盖。
- 不递增 `RULES_VERSION`：本 goal 的 12 已为 P3-09 递增规则版本，本修复与之同属一次未发布的规则变化；若 12 在本项之后才集成，由 12 覆盖；若 12 已集成，在证据中写明本项与 12 的递增同属一版。

## 不包含

- 原版文档的更正（29 一并写入 executable）。
- `startupRotations` 本身（14）。

## 关键文件与契约

- [random-direction.ts](../../../../../src/core/rules/random-direction.ts) 与其测试；28 的完成证据与 `local/research/p3-09/warp-path/findings.md`（含独立复算 `tools/verify.py`、`tools/verify-v8.mjs`）。

## 写入范围

- `src/core/rules/random-direction.ts`、`src/core/rules/random-direction.test.ts`
- `src/core/rules/firing.test.ts`、`src/core/rules/flight-control.test.ts`、`src/core/rules/parked-travel.test.ts`、`src/core/systems/area.test.ts`
- `src/core/replay/motion-replay.test.ts`、`src/core/replay/combat-replay.test.ts`、`src/core/replay/replay.test-support.ts`
- `local/research/p3-09/direction-table/**`：私有复算输出（被忽略）。

## 验收标准

- [x] 方向表的两个常数等于原版映像的位模式，整张表的散列与 28 的独立复算一致；仓库中没有原版表的数值。
- [x] 既有读者的测试与金样已复核：每项改变的期望都只因表值变化，并在证据中说明；没有掩盖的行为分支变化。
- [x] `pnpm check` 通过。

## 验证方法

- 聚焦：`pnpm exec vitest run src/core/rules src/core/systems/area.test.ts src/core/replay`；然后 `pnpm check`。

## 完成证据

- **2026-10-14 — 常数与散列（AC 1）：** 以仓库的 LE 读取器（`openLeExecutable` + `readRegion`，对象 4 偏移 0x210c，16 字节，无重定位修补）从本地映像读出 `0x17210c` = f64 位模式 `0x400921fb5a7ed197`、`0x172114` = `0x3f76c16c16c16c16`，与 28 的 findings 一致（私有脚本与输出在 `local/research/p3-09/direction-table/`，被忽略）。[random-direction.ts](../../../../../src/core/rules/random-direction.ts) 以 `f64FromBits(<64 位模式>n)` 写出两常数（`PI_CONSTANT`、`ONE_180TH_CONSTANT`，注明地址），角度仍按“度 × `0x17210c`，再 × `0x172114`，各积舍入为 double”，其后 `Math.sin`/`Math.cos`、double 积与 `Math.fround` 不变；更正了“即原版常数”与“每个分量非负”的注释。以 28 的独立 x87 模型（`tools/verify.py` 的 `direction_table`）求出整表 361 × 3 个小端 f32 的完整 SHA-256，其前 16 位与 28 记录的 `5060c87d4eb78f56` 及 `tools/verify-v8.mjs`（本机 V8 12.4 复跑）一致，x87 与 JS 模型 0 处不一致；旧表（`Math.PI`、`1/180`）与之有 256 项、348 个分量不同，带符号位的分量 38 个。[random-direction.test.ts](../../../../../src/core/rules/random-direction.test.ts) 新增：两常数的位模式断言、整表 SHA-256 断言（只提交散列）、逐项符号位断言（x 仅在方位 90° 带符号位，含极角 0 的 −0；z 仅在极角 90°；y 从不）与共 38 个；原“每个分量非负”与 `DIRECTION_TABLE[19a]` 为 +0 的断言按新表更正。变异检查：换回 `Math.PI` 与 `1/180` 时 4 项表测试失败。
- **2026-10-14 — 既有读者与金样复核（AC 2）：** `pnpm exec vitest run src/core/rules src/core/systems/area.test.ts src/core/replay`：43 个文件、1237 项通过，读者测试与 replay 无需改期望。以临时插桩（已撤除）统计各测试实际抽到的表项：`flight-control.test` 与 `parked-travel.test` 只用第 0 项（方位与极角 0°，新旧位相同，其字面期望不变）；`firing.test` 用第 0、1 项（新旧位相同，期望由 `DIRECTION_TABLE` 推出）；`systems/area.test` 用第 82 项（不变）与第 205 项（方位 50°、极角 75°，z 分量改变），后者的期望由 `randomDirection` 推出，故随表值变化、断言不变；`motion-replay`、`combat-replay`、`replay` 测试从不抽取随机方向，其检查点是录制与回放的自洽比较而非存档金样，均不变。没有行为分支变化。`replay.test-support.ts` 与其他写入范围内的测试文件未改。
- **2026-10-14 — 规则版本：** 未递增 `RULES_VERSION`：12 已集成并把它从 4 递增到 5，本修复与之同属这一未发布的规则变化（goal 执行记录“12 已集成”）。
- **2026-10-14 — 检查与审查（AC 3）：** `pnpm check` 通过（TypeScript、ESLint、Vitest 284 个文件 8538 项、生产构建）。rubber-duck：无问题（确认位模式字节序、乘法次序、38 个符号位与 `toEqual` 区分 ±0）。simplify：改为单个 64 位 bigint 位模式（与测试同形）并删去两条可由位模式推出的比较；未采纳与 `steering.ts` 的另一对常数（不同地址）合并（超出写入范围）、在测试中钉住个别表项的 f32 值（会提交原版表数值）、删去 38 的计数（它钉住 28 记录的事实）。
- **2026-10-14 — 文档影响：** `docs/original/formats/executable.md` 的更正（常数取自映像、38 个分量为负）属 29；[core.md](../../../../engineering/modules/core.md) 的“随机方向”一条未提常数与符号，仍准确，无需修改。
