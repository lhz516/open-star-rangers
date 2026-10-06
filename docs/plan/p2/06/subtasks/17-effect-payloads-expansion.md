---
type: plan
status: active
phase: P2
task: "06"
subtask: "17"
updated: 2026-10-06
---

# 17 — 效果 payload 与展开函数

**契约来源：** [spec](../spec.md) 的[效果几何数据](../spec.md#效果几何数据)中“规范表示”“展开函数”“测试数据”与格式规则；AC-19；[executable 的构建规则](../../../../original/formats/executable.md#effect-geometry-data-p2-0614-research)。
**依赖：** 14。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。由 2026-10-06 的 spec 修订加入，见 [goal 执行记录](../goal.md#执行记录)。

## 工作范围

- 在 `src/content/` 新增效果 payload 模块：
  - 三种 payload（弹丸、导弹、碎片）的 schema 1 编码器与严格读取器；
  - 浮点逐位保留，记录按源顺序，标记与常量都作为字段；
  - 与描述符依赖的一致性校验；
  - content code `invalid-effect-payload`。
- 纯展开函数：按 executable 的构建规则展开每条弹丸记录、每个导弹类型与每种碎片形状。
  - 输出顶点、面表、颜色、模式字与可选的贴图引用和映射参数；
  - 以 64 位浮点计算，分量舍入为 32 位；
  - 不生成法线、明暗或贴图坐标。
- 字节布局写入[源码结构](../../../../engineering/source-structure.md)。

## 不包含

- 读取原版数据（16、18）；渲染与贴图坐标（P2-11）。

## 关键文件与契约

- 新增 `src/content/effects/` 下的模块与测试；修改 `contract-validation.ts`（content code）。
- 测试只用代码生成的任意数值，不出现原版的模板、常量、类型表或展开结果。

## 验收标准

- [ ] AC-19：三种 payload 编码再读取逐项相等，浮点逐位相等；截断、尾随字节、计数越界、面表角数不为 3 或 4、序号越界、缺少结束标记、非有限浮点报 `invalid-effect-payload`；schema 2 报 `unsupported-payload-schema`；依赖不符报 `binding-mismatch`。
- [ ] 展开函数对代码生成的任意输入，每个形状的顶点、面表、颜色与模式等于测试中按规则写成的计算式；同一输入两次结果相同。
- [ ] 源码检查：仓库中没有原版值或由其得到的快照；`content/` 不导入 `original-data`、Three.js 或 DOM。
- [ ] `pnpm check` 通过。

## 验证方法

- Node 表驱动测试；源码检查。
- 完成前按 execute-goal 做 rubber-duck 与 simplify。

## 完成证据
