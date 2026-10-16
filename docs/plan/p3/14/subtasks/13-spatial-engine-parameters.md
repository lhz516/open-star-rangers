---
type: plan
status: active
phase: P3
task: "14"
subtask: "13"
updated: 2026-10-15
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

- [ ] 获批公式逐输入/边界可断言，单位与数据源没有替换。
- [ ] 事件位置与当前持续状态用途分开，placementSerial 改变不造成虚假高速。
- [ ] 非有限值和契约缺失显式失败；输出适合 start 前应用，无 Core/RNG 写入。

## 验证方法

- 合成听者、运动读数和规范内容，期望独立于被测函数；`pnpm test -- src/app/flight-audio/parameters.test.ts`、`pnpm check`。
- 调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)限定参数模块；替身不能充当 20 的真实相机集成。

## 完成证据
