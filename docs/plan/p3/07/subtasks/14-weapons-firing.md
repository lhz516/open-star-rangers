---
type: plan
status: active
phase: P3
task: "07"
subtask: "14"
updated: 2026-10-09
---

# 14 — 挂点、开火与发射

**契约来源：** [spec](../spec.md) 的 S-04、AC-05、AC-06；[武器与开火](../spec.md#武器与开火)、技术决定 9。
**依赖：** 02, 12。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **选择：** `cycle-main-weapon` 与 `select-missile` 按 02 的 Q-03 结论作用于对应列表；空、单项、多项列表、弹药耗尽与不可用挂点的处理；子系统 5、8 对列表的作用作为本模块的函数供 15 调用；原因码按 08 定稿。
- **开火：** `fire` 命令按数组次序逐个判定，读取当时的选择、目标、冷却与资源；按 Q-04 的检查次序给出 `accepted` 或稳定原因码；扣费按 Q-04 的实际时机，重复请求不多扣或漏扣。主炮电平与次要单次请求按 spec 与技术决定 9，Core 不保存跨 tick 的按住标志。
- **自动挂点与 AI 入口：** 自动挂点按 Q-04 的调用者、目标与射界开火；提供 Core 内部的开火入口供 P3-08 的 AI 调用，用内部合成状态测试，不新增生产注入 API。
- **发射：** 射出时投递发射请求，在本 tick 的请求处理中由弹丸与导弹的构造规则（Q-04 的 `0x25b0c`、`0x2b00c`）创建实体：初始位置为挂点偏移经发射者位姿变换（含 craft §3.8 的长度加成）、初速、寿命、表现选择器与抽取；导弹以弹体记录得到初值（12 的 `combat-init`）。创建后发出 `shot-fired`；新实体本 tick 不运动、不参与碰撞。
- **测试：** `fire → cycle-main-weapon → fire` 等交错次序；冷却等号与跨阈值；充能与弹药不足；损伤、射界、无目标、上下文与未活动门禁；失败不扣费且无 `shot-fired`；自动挂点；发射时机与事件内容；挂点变换的独立期望。

## 不包含

- 弹丸运动与命中（17）、导弹制导（20）、伤害（15）；AI 何时开火（P3-08）；音效（P3-14）；按住采样与清键（P3-04、P3-05）。

## 关键文件与契约

- `src/core/systems/weapons.ts`（11 新建）：命令判定、玩家触发与发射请求处理。
- 计划新增：`src/core/rules/mounts.ts`、`src/core/rules/firing.ts`、`src/core/systems/launch.ts` 及相邻测试。

## 写入范围

- `src/core/systems/weapons.ts`：选择、开火与发射请求。
- `src/core/systems/weapons.test.ts`：武器系统测试（新建）。
- `src/core/rules/mounts.ts`：挂点列表与选择（新建）。
- `src/core/rules/mounts.test.ts`：挂点测试（新建）。
- `src/core/rules/firing.ts`：开火条件、冷却与扣费（新建）。
- `src/core/rules/firing.test.ts`：开火测试（新建）。
- `src/core/systems/launch.ts`：弹丸与导弹的构造（新建）。
- `src/core/systems/launch.test.ts`：构造测试（新建）。

## 验收标准

- [ ] AC-05：`cycle-main-weapon` 与 `select-missile` 覆盖空、单项、多项列表、弹药耗尽、禁用挂点、循环方向与子系统特例。
- [ ] AC-06：逐命令判定与次序；冷却、资源、损伤、射界、目标、上下文与未活动门禁的原因码；扣费时机正确；未发射时无 `shot-fired`。
- [ ] AC-06：AI 与自动挂点复用同一规则；实际创建后的 `shot-fired` 含完整快照；发射帧不运动、不碰撞；挂点变换符合 craft §3.8。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试：经正式 `step` 断言命令结果、事件与新实体；规则函数的期望由 Q-04 独立推导。
- 不涉及浏览器；原版对照见 26、27。

## 完成证据
