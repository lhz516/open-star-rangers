---
type: plan
status: active
phase: P2
task: "06"
subtask: "17"
updated: 2026-10-08
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
  - 输出顶点、面表、颜色与可选的贴图引用，以及碎片的每顶点表与导弹元素的旋转参数；不含模式字与碎片的平面映射（spec 技术决定 17，执行中修订）；
  - 以 64 位浮点计算，分量舍入为 32 位；
  - 不生成法线、明暗或贴图坐标。
- 字节布局写入[源码结构](../../../../engineering/source-structure.md)。

## 不包含

- 读取原版数据（16、18）；渲染与贴图坐标（P2-11）。

## 关键文件与契约

- 新增 `src/content/effects/` 下的模块与测试；修改 `contract-validation.ts`（content code）。
- 测试只用代码生成的任意数值，不出现原版的模板、常量、类型表或展开结果。

## 验收标准

- [x] AC-19：三种 payload 编码再读取逐项相等，浮点逐位相等；截断、尾随字节、计数越界、面表角数不在 3 至该形状顶点数之间、序号越界、缺少结束标记、非有限浮点报 `invalid-effect-payload`；schema 2 报 `unsupported-payload-schema`；依赖不符报 `binding-mismatch`。
- [x] 展开函数对代码生成的任意输入，每个形状的顶点、面表与颜色等于测试中按规则写成的计算式；同一输入两次结果相同。
- [x] 源码检查：仓库中没有原版值或由其得到的快照；`content/` 不导入 `original-data`、Three.js 或 DOM。
- [x] `pnpm check` 通过。

## 验证方法

- Node 表驱动测试；源码检查。
- 完成前按 execute-goal 做 rubber-duck 与 simplify。

## 完成证据

2026-10-06 完成。

- **执行中修订（见 goal 执行记录）：** 逐个核对构建函数的渲染器调用后，按用户授权修订了 spec 的字段表、展开函数与 AC-19，并新增技术决定 17：
  - 模式字与碎片平面映射不导入；
  - 弹丸标记按构建函数与坐标轴分别保存；
  - 颜色按参数顺序保存；
  - 展开结果非有限时报错。

  [executable](../../../../original/formats/executable.md#effect-geometry-data-p2-0614-research) 补记“Builder arguments”（只记结构与地址），[18](./18-effect-step-integration.md) 的生产输入范围同步。
- **实现：**
  - [effect-payload.ts](../../../../../src/content/effects/effect-payload.ts) 给出三种 schema 1 布局：
    - 编码器、严格读取器与绑定检查共用一套校验；
    - `effectPayloadLength` 只按计数计算长度；
    - `faceTriangles` 不分配地校验面表并计数；
    - 面表不超过 `MAX_FACE_WORDS`（65,535）。
  - [expand-effects.ts](../../../../../src/content/effects/expand-effects.ts) 有三个展开函数和 `effectExpansionSize`。
  - [contract-validation.ts](../../../../../src/content/contract-validation.ts) 追加 `invalid-effect-payload`，[import-protocol.test.ts](../../../../../src/workers/import-protocol.test.ts) 同步。
  - 字节布局与展开规则写入[源码结构](../../../../engineering/modules/content.md#效果-payload)。
- **AC-19（payload）：** [effect-payload.test.ts](../../../../../src/content/effects/effect-payload.test.ts) 共 66 个测试。
  - 三种 payload 编码再读取逐项相等：负零与次正规数逐位保留，64 位常量取最大值与最小次正规数；结果冻结且为独立副本，再编码字节相同。
  - 读取器的 31 个负例都报 `invalid-effect-payload` 与结构路径：截断、尾随字节、记录数与类型数的 0 和上限 + 1、部件数 0 与 5、段数 2 与 65、25 位颜色、面的角数 2 与 5、序号越界、缺少结束标记，以及各位置的 NaN 与无穷。
  - 编码器另有 19 个负例，包括非 32 位浮点、稀疏数组、尾翼数与部件数不符、缺少常量、结束标记之后仍有字。
  - 面表恰为 65,535 字时通过，超过时拒绝。
  - schema 2 报 `unsupported-payload-schema`，已转移的字节或数组报 `payload-detached`，依赖或角色不符报 `binding-mismatch`（5 例）。
- **AC-19（展开）：** [expand-effects.test.ts](../../../../../src/content/effects/expand-effects.test.ts) 共 12 个测试。期望值在测试中按 executable 的规则写成计算式或逐项列出：
  - **弹丸：** 每轴标记、宽度乘积存回后再比较长度标记、非零选择取模板 1。
  - **导弹：** 机身的四边形环面与颜色缩放；尾翼 9 个顶点（含负零参数）；元素按标志选模板；附加元素在标志为 1.5 和 −0 时生成，为 0 时不生成。
  - **碎片：** 两类缩放、颜色、贴图与每顶点字。
  - 同一输入两次结果相同，修改结果不影响 payload；`effectExpansionSize` 与实际展开的顶点数、三角形数一致。
  - e2 为 0、宽度或颜色乘积超出 32 位时报 `invalid-effect-payload`。
- **源码检查：**
  - 测试与合成数据只用任意数值：检索已知原版立即数的位模式与十进制形式，没有命中；一个巧合相同的合成值已改掉。
  - `src/content/effects/` 不导入 `original-data`、Three.js 或 DOM，`pnpm lint` 通过。
- **Rubber-duck：** 1 个阻断项与 2 个非阻断项，均已修复：
  - 阻断：面表字数可能超出 `u16` 计数。已加上限与边界测试。
  - 非阻断：本子任务的范围仍写着模式字；spec 的 content 错误表未包括展开结果。两处文档已更正。
- **Simplify（4 路）：**
  - 已采纳：
    - 面表改为不分配的 `faceTriangles` 校验，展开时每个面表只解析一次并共享；
    - 机身的面直接生成；坐标直接写入，不经元组与双重类型转换；
    - 导弹面表显式构造；颜色舍入改用小函数；
    - 加入 `projectileTemplate`，长度计算改用命名的字节常量；
    - 测试改用已有的 `set8`/`set16`/`set32` 与 `floatBits`。
  - 未采纳：
    - 读取后去掉 `checkEffect`：与模型 payload 一致，payload 很小；
    - 改用 `readRecord`：它的错误码是 `invalid-record`，与 payload 错误码不同，模型 payload 也用本地检查；
    - 把 ASCII 工具移到中立模块：会改动无关模块；
    - 测试偏移改用游标：现有命名常量已能说明位置。
- **检查：** `pnpm check` 通过（135 个文件，3,990 个测试）。
- **2026-10-06 文档对齐（13 复跑）：** 上面两条验收原先写着“面表角数不为 3 或 4”和“颜色与模式”，早于 18 执行中的角数修订与技术决定 17，现已改为修订后的 AC-19 措辞。实现与测试已经按修订后的规则执行：[effect-payload.test.ts](../../../../../src/content/effects/effect-payload.test.ts) 接受 5 个角的面（角数等于顶点数），拒绝 2 个角的面与角数多于顶点数的面；合成碎片模板含五边形与六边形（见 18）。
