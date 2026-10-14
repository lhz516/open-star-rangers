---
type: plan
status: active
phase: P3
task: "09"
subtask: "16"
updated: 2026-10-14
---

# 16 — Warp 能量规则

**契约来源：** [spec](../spec.md) 的 S-07、AC-07；[Warp 能量](../spec.md#warp-能量)。
**依赖：** 12。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/core/rules/warp-energy.ts`：按 05 实现 `0x30d2c` 及其调用者的参数、单位与取整、数值对分段（首个首值 ≥ 参数 ÷ 1000 的对，否则最后一对）、显示百分比的基准、显示最小值与颜色阈值所需的值；光标点与提交点的用途分开。
- 检查量、预计消耗与实际扣费分别具名；整数计算精确核对，i32 与除法语义按 07。
- 测试覆盖每个分段边界、取最后一对、恰够、零值、数值域边界与切片机型的合成数值对。本项只交付纯规则；各阶段的实际扣费在 17、18 中接线。

## 不包含

- 扣费的阶段接线（17、18）与 `map` 分区读数（19）。

## 关键文件与契约

- [craft-info.ts](../../../../../src/content/rule-data/craft-info.ts) 的 `pairs`；[energy.ts](../../../../../src/core/rules/energy.ts) 的能量单位。

## 写入范围

- `src/core/rules/warp-energy.ts`、`src/core/rules/warp-energy.test.ts`

## 验收标准

- [x] AC-07 的规则部分：参数、单位、分段边界/最后一对、显示最小值/阈值与两种点的用途符合 05 的独立期望。
- [x] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 与 `pnpm check` 通过。

## 验证方法

- Node 独立期望与数值边界测试（不调用被测实现生成期望）。

## 完成证据

- **实现：** [warp-energy.ts](../../../../../src/core/rules/warp-energy.ts) 给出 `0x30d2c` 的 `warpCost`（q = n ÷ 1000 有符号向零截断；按表序取首个 q ≤ 首值（有符号）的对，否则最后一对；系数 × n 按 i32 回绕后 ÷ 1000 向零截断；无数值对为 Core 故障）与 `0x56b14` 的未舍入距离 `warpDistance`（复用 `0x56b50` 的 `squaredDistance`）。三种用途分别具名：开始的**检查量** `warpStartCheck`（玩家位置 → 有效目的地，c = cost(trunc(d))，d 未舍入；`affordable` 为 c ≤ E，恰够通过；同时给出 `warp-started` 所需的 R(d)），地图读数的**预计消耗** `warpCostReading`（玩家图标位置 → 光标世界点（z 为 0）或保存的目的地（带 z），返回 MW-11 的 `MapCostReading`；`costPercent` = max(trunc((c ÷ E) × 100)，1)，双精度，E = 0 为 null，即 MW-12 差异 4），完成的**实际扣费** `warpCharge`（D 为到达点 → 出发点距离的 f32 存储，即 steering.ts 的 `vectorDistance`；c = cost(trunc(D))；E := max(trunc(E − (c + c × s × 0.5))，0)；返回 MW-05 `warp-completed` 的 `charge` 四个字段；不调用耗尽处理）。截断超出 i32 时按 `FISTP` 的未屏蔽异常为 Core 故障。只交付纯规则，阶段接线归 17、18，`map` 分区读数归 19；颜色分档（≥ 100、67–99、≤ 66）按 MW-11 由 P3-13 依 `percent` 判定，本规则给出所需的 `percent`。
- **测试：** [warp-energy.test.ts](../../../../../src/core/rules/warp-energy.test.ts) 共 45 例，期望按 executable.md 与 MW-04/08/11 手算，i32 回绕另以 BigInt 核对，不调用被测实现生成期望：仿切片结构的合成三对（首值严格递增且非负、系数递增）的每个分段边界（n = 5999/6000、20999/21000、60999/61000）、超出全部对时取最后一对、表序优先于更近的对、负首值只作为最后一对到达、零系数与零距离、IMUL 回绕（含 −2³¹ 向零截断）、无数值对故障、单调性扫描；未舍入 d 与 f32 D 跨分段边界的差别（trunc(d) = 6999 → 699，trunc(D) = 7000 → 1400）；i32 能容纳的最大截断距离与 2³¹ 处故障；检查的恰够/差 1/零距离零能量/有符号比较；百分比的 100、99、67、66、最小值 1、负消耗、双精度商（29/100 显示 28）、E = 0 为 null，以及 E ∈ [1, 400] 全部 c ≤ 2E 与大能量值上“显示 ≥ 100 ⇔ c ≥ E”；读数分别带与不带 z；扣费的 s = 0、1、0.25（向上取整）、恰够扣到 0、钳到 0（含 −0 归 +0）、零距离、同一距离开始够而完成扣光、负消耗增能与超出 i32 故障。
- **检查：** `pnpm exec vitest run src/core/rules/warp-energy.test.ts`（45 通过）；`pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`（82 文件、2468 例通过）；`pnpm check`（285 文件、8583 例通过，lint、类型与生产构建通过）。
- **审阅：** rubber-duck 对照 executable.md 的 Warp 消耗与开始、完成第 8 步、数值表及 MW-01/04/05/08/11 审阅两文件，未发现问题。simplify（复用、简化、效率、层次四个角度）：开始检查改为只算一次距离；删去与 steering.ts `vectorDistance` 重复的 f32 存储函数，扣费的 D 改为注明由其给出；两个性质扫描改为收集不符项后一次断言。未采纳：把截断辅助函数与 energy.ts 的 `chop` 合并（需改写入范围之外的文件）、去掉可推出的 `affordable`（门禁需要具名结果）、内联具名常数与缩短模块注释（子任务要求三种量分别具名）。
- **文档影响：** `docs/original/` 无新事实（规则均出自 05/07 已写入的记录），U 项不变。`docs/engineering/modules/core.md` 按阶段描述已接线的规则，本规则尚无调用者，暂不需改；交 26：17–19 接线后在 core.md 记入 warp-energy.ts 的三种量（检查量、预计消耗、实际扣费）及其各自的点、D 取 `vectorDistance`、E = 0 的 null 百分比。
