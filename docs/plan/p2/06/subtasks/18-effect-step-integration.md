---
type: plan
status: active
phase: P2
task: "06"
subtask: "18"
updated: 2026-10-06
---

# 18 — 效果步骤、生产输入与作业集成

**契约来源：** [spec](../spec.md) 的[效果几何数据](../spec.md#效果几何数据)中“来源”“步骤、预算与组”“完整性”；生产 Asset 中的效果几何数据行；错误码与失败边界一览中的效果条目；AC-20，以及 AC-08 至 AC-10 的同步。
**依赖：** 15, 16, 17。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。由 2026-10-06 的 spec 修订加入，见 [goal 执行记录](../goal.md#执行记录)。

## 工作范围

- **效果步骤（`original-data/conversion/`）：** 在 `convert-models` 阶段内、模型步骤之后运行：
  - 读取 RENS 弹丸记录表与 EXE 区域，校验格式规则；
  - 编码三个 payload，按模型份额扣除 `assets`、`dependencyEdges`、payload 字节，以及展开后的 `vertices` 与 `triangles`（每面角数 − 2）；
  - 把映射标为 `verified`，结果并入 `models` 组；
  - 失败位置按 spec 的效果位置语法，没有部分结果。
- **生产输入：** 三个 `data` Asset 的声明与映射。RENS 条目与 EXE 区域清单（对象、偏移、长度、用途）只放在生产常量中；置信度为 likely，带 U-027。
  - 区域按 17 的 payload 字段取：弹丸两套模板各自的 6 个宽度标记与长度标记（每轴一对比较立即数，见 executable）、导弹的 7 个常量与旋转缩放、附加元素与碎片的颜色立即数（含 8 位压栈，按符号扩展）；
  - 不读取模式字与碎片的平面映射参数（spec 技术决定 17）。
- **作业：** [import-job.ts](../../../../../src/workers/import-job.ts) 在同一阶段调用效果步骤，协议版本与阶段不变。
- **合成光盘：** 加入合成 RENS 与合成 EXE（区域位置与生产常量一致），更新 `sliceCoveredFiles`、Worker 场景、作业与管线测试，以及 E2E 的 `models` 用例与期望用量。
- **文档：** 同步[源码结构](../../../../engineering/source-structure.md)与[工程约定](../../../../engineering/README.md)。

## 不包含

- 本地基准（19）；歧义贴图（12）。

## 关键文件与契约

- 新增效果步骤与生产效果输入模块；修改 `import-job.ts`、合成测试支持、作业、管线与 E2E 测试。
- 生产代码不新增调试 API；仓库中没有原版值。

## 验收标准

- [x] AC-20：合成光盘上效果步骤得到三个 `data` Asset，`models` 组不再有效果角色的 `role-cardinality`；用量恰等于按 payload 布局与展开规模计算的期望，并计入模型份额；上界计算以常量与测试断言。
- [x] 失败按失败边界一览逐行验证：区域或记录损坏时步骤失败、位置正确、没有部分结果。
- [x] 作业阶段与协议版本不变；`pnpm test:e2e e2e/import-worker.spec.ts --project=development` 与全部项目通过。
- [x] `pnpm check` 通过。

## 验证方法

- Node、`MessageChannel` 集成与 E2E。
- 完成前按 execute-goal 做 rubber-duck 与 simplify。

## 完成证据

2026-10-06 完成。

- **执行中修订（见 goal 执行记录）：** 在本地基准上试运行时，碎片模板含 6 角与 5 角的面，未通过“角数为 3 或 4”的规则。按用户授权，把 spec 的格式规则与 AC-19 改为“3 至该形状的顶点数”，同步修改内容层校验、executable 与测试。
- **实现：**
  - [effect-declarations.ts](../../../../../src/original-data/conversion/effect-declarations.ts)：效果声明，按角色列出区域用途。每个用途给出精确的区域长度：立即数按指令宽度为 1 或 4 字节；类型表为 1 至 32 条记录。
  - [effect-step.ts](../../../../../src/original-data/conversion/effect-step.ts) 的 `runEffectStep` 依次：
    - 配对声明与映射，检查部件；
    - 核验映射；
    - 每个 EXE 只打开一次，读取区域（每个 Asset 内并行）；
    - 按格式规则读出三个 payload；RENS 的指针须等于头部长度，记录须恰好填满条目；
    - 按 ID 升序逐个扣除后编码，最后把映射标为 `verified`。
  - [production-effects.ts](../../../../../src/original-data/conversion/production-effects.ts)：49 个生产区域（地址与长度）、声明与映射（likely，U-027），以及 `PRODUCTION_EFFECT_PAYLOAD_BOUND`。
  - [import-job.ts](../../../../../src/workers/import-job.ts)：在 `convert-models` 阶段内，于模型步骤之后运行效果步骤；`ModelStepInput` 增加 `effects`；`modelsGroupDraft` 改为接收步骤结果列表；最终用量取效果步骤的累计用量。阶段与协议版本不变。
  - 合成光盘：`sliceCoveredFiles` 加入合成 `SRANGERS.EXE`，`productionSliceEntries` 加入合成 RENS。[production-effects.test-support.ts](../../../../../src/original-data/conversion/production-effects.test-support.ts) 先用任意数值生成期望 payload，再写入生产区域位置；面表字数与生产区域一致，含五边形与六边形。
- **AC-20：**
  - [effect-step.test.ts](../../../../../src/original-data/conversion/effect-step.test.ts) 共 28 个测试：
    - 三个 `data` Asset 的 payload 与期望 payload 逐字节相等，读回逐项相等；
    - 依赖为 `image/model-texture/16`、`image/missile` 与无；来源状态为 `verified`，带 U-027；
    - 用量等于起始用量加 `PRODUCTION_EFFECT_USAGE`；EXE 只打开一次。
  - **失败边界逐行验证：**
    - 声明与映射不配对、部件不符、区域长度不合用途：`invalid-declaration`；
    - EXE 未覆盖：`path-not-covered`，位置为映射路径；
    - LE 结构损坏、区域与修正重叠：`invalid-payload`；
    - RENS 记录数为 0 或 65：`effectRecords`；指针错位、记录不填满条目、缺少重定位、记录颜色为 NaN：`invalid-payload`；
    - 类型数 33：`missileTypes`；类型数与表不符、部件数 5、25 位颜色、NaN 标志：`invalid-payload`；段数 2：`ringSegments`；
    - 常量无穷、8 位立即数作为浮点是 NaN、面表越界或缺少结束标记、顶点无穷、缩放无穷：`invalid-payload`；
    - 预算：`budget-exceeded@effects[data/missile-visuals]`，限值正确。

    位置都符合测试中按 spec 写出的效果位置语法，失败时没有部分结果。
  - [production-effects.test.ts](../../../../../src/original-data/conversion/production-effects.test.ts) 共 6 个测试：
    - 声明、角色与贴图；
    - 映射为 likely、U-027，只有弹丸带 RENS；
    - 按 executable 独立写出的 49 个区域的地址、长度与立即数宽度，与生产常量逐项相等；
    - 区域互不重叠；
    - 结构限值下三个 payload 合计不超过 16 KiB，展开上界为 5,534 个顶点。
  - **作业：**
    - [import-job.test.ts](../../../../../src/workers/import-job.test.ts) 的 `models` 组等于 Node 由图形、模型与效果步骤推导的草稿，诊断中没有 `role-cardinality`，用量加入 `PRODUCTION_EFFECT_USAGE`；
    - [import-pipeline.test.ts](../../../../../src/app/import/import-pipeline.test.ts) 经结构化克隆通道，`models` 组只剩 `source-not-ready`；
    - E2E [import-worker.spec.ts](../../../../../e2e/import-worker.spec.ts) 的 `models` 场景同步，Asset 数与用量计入效果 Asset，且没有 `role-cardinality`。
- **本地预检（只记计数与判定）：**
  - 生产读取器在本地 EXE 上读出全部 49 个区域；另检查 25 个逐轴标记比较与颜色压栈的操作码，全部相符。
  - 生产效果步骤在本地基准上通过：三个 Asset 都为 `verified`，每个形状都能展开；用量为 3 个 Asset、392 个顶点、448 个三角形、2,145 字节 payload。

  正式的本地基准由 19 记录。
- **Rubber-duck：** 2 个阻断项与 1 个非阻断项，均已修复：
  - 阻断：RENS 未要求指针等于头部长度、记录恰好填满条目。已收紧，并补充指针错位与多余记录两个测试。
  - 阻断：立即数宽度与类型表上限过宽。已改为每个用途的精确宽度，类型表为 1–32 条。
  - 非阻断：生产地址的测试是自我比较。已加入独立写出的完整区域表。
- **Simplify（4 路）：**
  - 已采纳：
    - `checkParts` 返回区域 locator，去掉不可能的分支；
    - 载荷按角色 `switch`；
    - 每个 Asset 的区域并行读取；
    - 标记长度复用 `imm32`；
    - 测试支持缓存默认的合成 EXE，复用 `bitsOf`，加入 `floatFromBits`；
    - 测试改用元组类型。
  - 未采纳：
    - 效果步骤单列阶段与输入：spec 技术决定 16 规定在 `convert-models` 内运行；
    - 区域用途改为按 locator 绑定：生产常量同时生成声明与映射，顺序由同一来源决定；
    - `EFFECT_ARCHIVE` 的位置：沿用 `MODEL_ARCHIVE` 的现有模式；
    - 移动组装函数、抽取声明读取与配对的公共代码：涉及模型与图形模块，待 P2-07 合入后统一；
    - 改用 `PayloadBlock`：它的诊断位置含条目编号，违反效果位置语法；
    - 在测试支持中复用 `ByteWriter`：本地写入函数更直接。
- **检查：**
  - `pnpm check` 通过（137 个文件，4,024 个测试）。
  - `pnpm test:e2e e2e/import-worker.spec.ts` 通过（15 个）。simplify 之前的全部 E2E 也通过（61 个）。
- **文档：** [源码结构](../../../../engineering/source-structure.md#效果步骤)新增“效果步骤”一节，并同步作业、注入点、合成光盘与组草稿；[工程约定](../../../../engineering/README.md)同步 E2E 模型场景。
