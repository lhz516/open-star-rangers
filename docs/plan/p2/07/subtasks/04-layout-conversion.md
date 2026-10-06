---
type: plan
status: active
phase: P2
task: "07"
subtask: "04"
updated: 2026-10-05
---

# 04 — 布局声明、转换与图形步骤的容器来源

**契约来源：** [spec](../spec.md) 的 S-03（子资源经步骤转换）、S-04，S-09 的 source 层；[容器子资源](../spec.md#容器子资源)、[布局转换声明](../spec.md#布局转换声明)、[行为与边界](../spec.md#行为与边界)、[错误码](../spec.md#错误码)；技术决定 1、3、4、10；AC-03 的步骤部分、AC-05、AC-07 的共用读取部分。
**依赖：** 01、03。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **布局声明（扩展 [graphics-declarations.ts](../../../../../src/original-data/conversion/graphics-declarations.ts)）：** `GraphicsKind` 增加 `layout`；字段为 `asset`（kind `layout`）、`role`、`group`（须拥有 `layout`）、`frame`（同 payload 范围）、`elements`（1–16 个 image Asset ID，按存储顺序）。`checkBindings` 增加：每个元素须是同一声明组、同一资源组中的 image 声明，否则 `invalid-declaration`。
- **子资源（扩展 [graphics-step.ts](../../../../../src/original-data/conversion/graphics-step.ts) 的来源解析）：**
  - CCKD `groups/<s>` → layout；`groups/<s>/elements/<i>` → image；
  - MFDD `lists/<l>/records/<i>` → image；
  - 上述记录的 `…/palette` → palette；
  - 序号为不带前导零的十进制；P2-05 的整条目来源与 `fonts/<i>` 不变。子资源与 kind 或条目类型不匹配 → `invalid-declaration`。
- **布局转换（扩展 [convert-graphics.ts](../../../../../src/original-data/conversion/convert-graphics.ts)）：**
  - 布局映射必须是 CCKD 的 `groups/<s>`；第 i 个元素图像的映射必须是同一 CCKD 条目、同一 slot 的 `groups/<s>/elements/<i>`，否则 `invalid-declaration`；
  - 实际元素数与声明不符、元素坐标为负、元素按图像尺寸越出画幅 → `geometry-mismatch`；
  - 产生 01 的布局 payload，描述符依赖为元素图像（ID 升序）；按 P2-01 预算扣除 `assets` 1、`dependencyEdges` 为元素数、`payloadBytes` 为实际长度，扣除先于分配；
  - 布局与元素映射只在整个步骤转换成功后才为 `verified`；任一失败使整个步骤失败、不输出结果。
- **共用读取：** 字库、布局与元素来自同一 CCKD 条目时，经 [step-entry-reader.ts](../../../../../src/original-data/conversion/step-entry-reader.ts) 在一步内只物理读取一次。
- **测试：** 在合成光盘上用 [conversion.test-support.ts](../../../../../src/original-data/conversion/conversion.test-support.ts) 的 `countedVerifiedSource` 与扩展后的合成 CCKD、MFDD 运行步骤：
  - AC-05：画幅、元素顺序、坐标与图像引用逐项符合；依赖恰为元素图像；上列每种 `geometry-mismatch` 与 `invalid-declaration`；`verified` 只在成功后出现；
  - AC-03 的步骤部分：`groups/<s>/elements/<i>` 与 MFDD 记录经步骤转换的图像，与整条目偏移 0 的同一记录逐字节相同；`…/palette` 经步骤得到嵌入调色板；P2-05 的 `fonts/<i>` 测试照常通过；
  - AC-07 的共用读取：字库、布局与元素共用的 CCKD 条目只读一次（计量端口的读取次数与字节）；
  - 错误位置符合 `graphics[<Asset ID>]…` 与 `graphics.declarations[<i>]…` 的语法（`inGraphicsLocationGrammar`）。
- **文档：** 源码结构“图形转换”一节记录布局声明、子资源语法与布局转换。

## 不包含

- TABL `records/<i>` 来源：归 [06](./06-table-records.md)。
- 生产声明、映射与份额：归 [12](./12-production-cockpit-hud.md)。
- 组装、包身份与发送：归 [13](./13-group-assembly.md)。

## 关键文件与契约

- **修改：** [graphics-declarations.ts](../../../../../src/original-data/conversion/graphics-declarations.ts)、[convert-graphics.ts](../../../../../src/original-data/conversion/convert-graphics.ts)、[graphics-step.ts](../../../../../src/original-data/conversion/graphics-step.ts) 及其测试；[conversion.test-support.ts](../../../../../src/original-data/conversion/conversion.test-support.ts)。
- **复用：** 01 的布局编码；03 的容器读取；[source-mapping.ts](../../../../../src/original-data/source-mapping.ts) 的子资源语法与 `assetSourceStates`（layout 已允许 CCKD 来源）；[conversion-budget.ts](../../../../../src/original-data/conversion/conversion-budget.ts)。

## 验收标准

- [x] AC-05 全部条件通过。
- [x] AC-03 的步骤部分：容器内记录与偏移 0 等价，`…/palette` 正确，`fonts/<i>` 回归通过。
- [x] AC-07 的共用读取：同一 CCKD 条目一步只物理读取一次。
- [x] 错误位置符合 spec 的位置语法，诊断不含条目编号、偏移或原版字节。
- [x] `pnpm typecheck`、`pnpm lint` 与聚焦测试通过；源码结构已更新。

## 验证方法

- `pnpm test -- src/original-data/conversion/`。
- 只用代码生成的数据；不涉及浏览器或原版数据。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

2026-10-05：

- **实现：**
  - [graphics-declarations.ts](../../../../../src/original-data/conversion/graphics-declarations.ts) 加入 `LayoutDeclaration`。`frame` 复用 content 的 `layoutFrame`；`elements` 为 1–16 个互不相同的 image ID，`checkBindings` 要求它们是同一声明组、同一资源组中的图像声明。
  - [graphics-step.ts](../../../../../src/original-data/conversion/graphics-step.ts) 按 spec 语法解析子资源：`groups/<s>`、`groups/<s>/elements/<i>`、`lists/<l>/records/<i>`，以及记录路径后的 `/palette`；序号不带前导零。不匹配的组合为 `invalid-declaration`。`checkLayoutElements` 用已导出的 `compareLocators` 要求第 i 个元素图像恰好映射到同一封包、同一 CCKD 条目、同一 slot 的 `groups/<s>/elements/<i>`。
  - [convert-graphics.ts](../../../../../src/original-data/conversion/convert-graphics.ts)：
    - **来源：** 来源可带可选的 `RecordSelector`（CCKD 元素或 MFDD 记录，缺省为偏移 0 的整条目），偏移经 03 的读取函数得到；新增 `cockpit-group` 布局来源；DATA 与嵌入调色板来源分开定义。
    - **布局检查：** 在转换任何 Asset 之前先核对每个布局的分组：元素数、负坐标，以及按记录头尺寸越出画幅，都报 `geometry-mismatch`。
    - **扣除与编码：** 最后依次扣除 `assets` 1、`dependencyEdges` 为元素数、`payloadBytes` 为 `layoutPayloadLength`，再编码；描述符依赖为元素图像（kind `image`）。
- **测试：** 聚焦文件 `graphics-declarations` 43 项、`convert-graphics` 44 项、`graphics-step` 32 项，全部通过。
  - **AC-05：**
    - 正向：合成 CCKD 的两个分组得到布局，画幅、元素顺序、坐标与图像引用逐项符合；依赖恰为元素图像，`payloadIdentity` 与绑定一致；声明顺序与存储元素逐项配对。
    - `geometry-mismatch`：声明少于或多于实际元素（多于时经步骤也报布局 `…elements`，不是元素图像的 `subresource-not-found`）、负 x、负 y、右边或下边越出 1。
    - `invalid-declaration`：布局映射为 `fonts/0`、元素路径或 MFDD；元素图像映射到别的 slot、别的元素或 MFDD 记录。
    - 声明层：画幅越界、0 个或 17 个元素、调色板元素、重复元素、元素不在声明组中或不在同组，都报 `invalid-declaration`。
    - 原子性：核验后容器映射仍为 `declared`，步骤失败时没有结果。
  - **AC-03 步骤部分：**
    - CCKD 元素、MFDD 记录及其 `/palette`，经步骤与 `convertGraphics` 转换，结果与同一记录作为整条目时逐字节相同；
    - 越界与缺失：`lists/2/records/0`、不存在的元素调色板、11 位序号都报 `subresource-not-found`；前导零、图像取 `/palette` 路径、图像取分组、调色板缺 `/palette` 都报 `invalid-declaration`；
    - P2-05 的 `fonts/<i>` 与整条目测试未修改，照常通过。
  - **AC-07 共用读取：** 字库、两个布局、三个元素图像与元素调色板共用的 CCKD 条目，在一步内只读取一次：读取计数为 `{DATA: 1, CCKD: 1, MFDD: 1}`。
  - **组完整性：** 只由步骤结果组成的 `cockpit-hud-map` 组经 `validateGroup` 为 `group-complete`。
  - **预算：** 恰好等于限值时通过；`assets`、`dependencyEdges` 或 `payloadBytes` 少 1 时，最后一个布局报 `budget-exceeded@graphics[layout/map].elements`。
  - **位置：** 所有错误位置都经 `inGraphicsLocationGrammar` 核对，语法加入 `elements[<i>]` 与 `elements[<i>].x|y`；结果 JSON 不含封包路径、条目编号、类型标签或子资源。
- **工程：** `pnpm typecheck`、`pnpm lint` 通过；`pnpm check` 通过，124 个文件、3783 项，构建成功。
- **审查：**
  - **rubber-duck：**
    - 高：声明多于实际元素时，先报元素图像的 `subresource-not-found`。已改为先检查布局，并在转换层与步骤层各补回归测试。
    - 中：布局在扣除前构建元素数组。已改为几何检查不分配；扣除前只构建由声明限定（至多 16 项）的元素列表，payload 在扣除后分配，与 P2-05 图像在扣除前计算 `imagePalettes` 的方式一致。
  - **simplify：**
    - 已采纳：复用并导出 `compareLocators` 与 `layoutFrame`；拆分 DATA 与嵌入调色板来源；`#add` 显式接收依赖 kind；简化负坐标用例；声明测试只收窄一次。
    - 未采纳：
      - 删除步骤层的整条目等价用例：AC-03 明确要求经步骤证明；
      - 泛型化类型分派：沿用 P2-05 的分派方式；
      - 按块缓存容器解析：生产中约 10 个元素 Asset，每次解析至多 8×16 个元素；
      - 表驱动语法：06 只再加一条 TABL 分支。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md)更新了以下内容：
  - 布局声明；
  - 记录选择器与布局来源；
  - 布局转换的检查、扣除与依赖；
  - 步骤的子资源语法与元素映射核对；
  - 位置语法；
  - `layoutFrame`。

  其余文档不受影响，不涉及原版事实或 STATUS。
