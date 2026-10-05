---
type: plan
status: active
phase: P2
task: "01"
subtask: "06"
updated: 2026-10-04
---

# 06 — 合成契约测试与工程边界

**契约来源：** [spec](../spec.md) 的 S-12；AC-02 至 AC-09、AC-11、AC-12。
**依赖：** 02、03、04、05。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在生产契约旁维护代码生成的合成清单、来源、payload identity、预算和依赖 fixture；自动测试不得读取 `local/`。
- 覆盖正向完整包、单组结果和全部负向路径：角色基数、ID、版本、来源、payload、闭包、身份、预算、所有权和原版隔离。
- 补足 02 模型粒度验收在字节层面的验证：对同一模型只改动内部几何字节，其已声明的 payload 身份须被 04 的核验拒绝；两个模型共享同一源网格时，发布给各模型的二进制视图须满足 05 的独占/隔离规则。
- 将测试发现、纯模块边界和现有 IMFAT/payload 回归纳入可运行命令；不添加新依赖或第二套 schema。

## 不包含

- 不做浏览器、真实 Worker、File、IndexedDB、GPU、Audio 或原版本地视觉/听觉对照。
- 不替其他子任务实现生产逻辑或修改 spec 契约。

## 关键文件与契约

- 复用 [synthetic.ts](../../../../../src/original-data/synthetic.ts)的测试数据生成模式，但新增内容 fixture 归 `src/content` owner。
- 计划新增邻接 `*.test.ts`；测试不输出原版 payload。

## 验收标准

- [x] 所有 S/AC 的纯数据正负路径都有可重复断言，错误按 code 而非 message 分类。
- [x] `src/content` 保持无 DOM/Node/Three.js/Web Audio/IndexedDB 依赖，P1 现有测试保持通过。
- [x] 合成测试和构建产物不包含原版内容或研究输出。

## 验证方法

- `pnpm exec vitest run src/content src/original-data`
- `pnpm exec vitest run tools/engineering-boundaries.test.ts`
- 完成前按 07 运行 `pnpm check` 与 `pnpm check:original`。
- 不适用 browser-testing；真实浏览器证据归后续 P2 任务。

## 完成证据

- **合成 fixture：** [synthetic-content.test-support.ts](../../../../../src/content/synthetic-content.test-support.ts) 在代码中生成覆盖 `CLASSIC_P2_SLICE` 全部角色的四组清单、实际 payload、原版导入变体的来源状态，以及按 `code@path` 断言诊断的辅助函数。
  - 它从完整性测试中提取而来，与生产契约同处纯模块程序（ES2023，无 DOM/Node 类型），所以不用 `TextEncoder` 或 `node:crypto`，而是用生产 SHA-256（[sha256.test.ts](../../../../../src/content/sha256.test.ts) 另与 Node 对照）。
  - 所有 ID 都是 `*/synthetic-*`，来源为 `synthetic` 或 `source:synthetic-disc`。
  - 完整性测试与预算测试改用这份 fixture，不再各自维护清单身份。
- **02 委托的字节层验证：** [synthetic-package.test.ts](../../../../../src/content/synthetic-package.test.ts) 用 `original-data` 的合成字节写入器构造“标签加顶点几何”的模型 payload。
  - **几何身份：** 只改动玩家模型的一个顶点坐标，长度不变。
    - 组级与全包分别报告 `payload-mismatch@payloads[6]` 和 `payload-mismatch@groups[1].payloads[6]`。
    - 按新几何重新声明后，描述符只有指纹不同，Asset ID、kind、角色、组与依赖都不变。
  - **共享源网格：** 两个敌机模型来自同一个源网格。
    - 直接发布源视图会被拒绝：偏移视图报 `payload-not-exclusive`，同一 buffer 报 `payload-aliased`。
    - 改为各自的独占副本后可以转移，两个 Asset 有相同的 payload 身份但仍各自独立。
    - 修改其中一个副本只让该模型报 `payload-mismatch`，另一个模型和源网格都不受影响。
- **跨契约组合：** 同一合成包依次经过以下步骤：
  - 全包验证为 `complete`；
  - 按组清单累计预算：等于合计时通过，payload 字节少 1 时在最后一个音效 Asset 处失败，并给出 code/limit/observed；
  - 发布独占副本并转移，接收方从原始输入重新验证，结果与原包相同；
  - 发送方已转移的 payload 在每组都报 `payload-detached`，生产方自己的源字节未被转移，仍然完整。
- **按 code 分类：** 以下原先只断言错误类的负向用例，改为断言稳定的 code 与 path：
  - 来源判别 17 例：`invalid-origin`、`invalid-record`、`invalid-identity`；
  - 类实例、accessor、隐藏字段、非 DTO 描述符/引用、各种非法依赖容器、`Uint8Array` 形式的 payload 身份、伪造的 `complete` 字段；
  - mesh kind 的 `invalid-kind`；
  - 伪造组结果改为断言精确诊断 `group-missing@groups.audio` 与 `invalid-record@groups[3].manifest`；
  - 宿主拒绝再次转移时断言 `DataCloneError`。

  内容测试中唯一的 message 断言用于确认诊断不回显未知键名，属于隐私检查，不是分类依据。
- **类型级断言：** 新增两组，并用临时探针确认违反时 `tsc` 报 TS2554。
  - 两种来源都不能取另一来源的字段形状，普通字符串也不是来源指纹；
  - 组级成功结果不能赋值给全包结果，两者的判别值不同。
- **工程边界：** [engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts) 新增测试数据守卫。
  - **范围：** `src/content` 与 `src/original-data` 的测试和 test-support 文件，只能导入 `vitest`、作为哈希对照的 `node:crypto`，以及按真实路径解析后仍在这两层内的模块。
  - **另外拒绝：** `require`、`process`、`vi` 与 `import.meta` 这类绕过 import 的加载方式。
  - **fixture 证明：** 能拒绝文件系统、工具脚本、计算型 import、借符号链接逃逸、`process.getBuiltinModule`、`vi.importActual`、`require` 与 `import.meta.glob`。
  - **现状：** 真实仓库零违规。
  - **已有覆盖：** `content` 本来就在纯层检查中，包括无 DOM/Node 声明的真实程序、禁用的 react/three/idb，以及 document、indexedDB、localStorage、process、Buffer、node:fs 等宿主能力；Web Audio 属于 DOM 声明，同样不可用。现有 IMFAT/payload 回归继续在 `src/original-data` 中运行。
- **S/AC 断言位置：**

  | 范围项/验收项 | 断言 |
  |---|---|
  | S-03、AC-02 | [slice-definition.test.ts](../../../../../src/content/slice-definition.test.ts) 逐角色检查组、kind 与数量范围，以及四组拥有的 kind；[completeness.test.ts](../../../../../src/content/completeness.test.ts) 覆盖逐角色缺失、0/3 个敌机不裁剪、任务引用的敌机缺失 |
  | S-04、AC-03 | [asset-id.test.ts](../../../../../src/content/asset-id.test.ts) 覆盖边界与非法 ID（`invalid-asset-id`/`invalid-kind`）；[source-mapping.test.ts](../../../../../src/original-data/source-mapping.test.ts) 证明只换等价 locator 时 ID 与依赖不变 |
  | S-05、AC-04 | [content-identity.test.ts](../../../../../src/content/content-identity.test.ts) 覆盖缺字段、未知版本、非法 SHA-256、冒充与缺指纹（运行时 code/path 与类型级） |
  | S-06、AC-05 | source-mapping.test.ts 覆盖一对多、多对一、类型冲突、缺失、未确认、未验证；工程边界覆盖消费者 lint 与依赖图 |
  | S-07、AC-06 | completeness.test.ts 覆盖 23 种组级变异、来源指纹绑定、伪造结果；synthetic-package.test.ts 覆盖几何变化 |
  | S-08、AC-07 | completeness.test.ts 覆盖四组独立结果与外部要求、缺组/重复组、六种身份混装、跨组缺失/环/重复 ID、判别值的类型级区分 |
  | S-09、AC-08 | [budget.test.ts](../../../../../src/content/budget.test.ts) 51 项；synthetic-package.test.ts 覆盖按组累计 |
  | S-10、AC-09 | [ownership.test.ts](../../../../../src/content/ownership.test.ts)、synthetic-package.test.ts，以及 08 的纯数据隔离测试和纯层程序检查 |
  | S-12、AC-11、AC-12 | 合成标记的 fixture、测试数据守卫、纯层检查、`pnpm check:original` 与依赖文件无变化 |

- **审查：** rubber-duck 提出 3 个阻塞问题，均已修复，并经同一审查者只读复核确认：
  - ① 守卫漏掉不经 import 的加载方式（`process.getBuiltinModule`、`vi.importActual`），已新增标识符与 `import.meta` 检查及对应 fixture；
  - ② 相对路径只按字面判断，符号链接可以逃逸，已改为按真实路径解析，并新增符号链接 fixture；
  - ③ 两处负向用例只断言错误类，已改为断言 code/path，并同时修正其余同类断言。

  审查者另确认委托用例与组合测试的数值正确：19 个 Asset、11 条依赖边、564 字节 payload，限值 563 时在最后一个音效 Asset 失败，每组各一条 `payload-detached`。
- **simplify：**
  - 采纳：
    - 模型 payload 改用 `ByteWriter`；
    - 所有权测试改用 fixture 的字节与身份辅助函数；
    - fixture 每次调用只为每个 Asset 生成一次字节，并去掉冗余的组名变量；
    - 重复的哈希只算一次，真实路径对每个目标只解析一次；
    - 简化依赖容器与来源判别两张表。
  - 跳过三项：
    - 把守卫移到 ESLint：现有 render 层边界同样以 AST 检查放在这个套件里，而真实路径与符号链接约束无法用 ESLint 表达，拆开会让同一规则分处两地；
    - 把 `diagnosticCodes` 移出 fixture：它对完整性模块的依赖只是类型导入，运行时擦除，移走会造成重复或产生只有一个函数的模块；
    - 复用缓存的 Node 程序代替逐文件解析：约 20 个小文件的解析是毫秒级，构建程序需要数秒。
- **验证：**
  - `pnpm exec vitest run src/content src/original-data tools/engineering-boundaries.test.ts` 为 14 个文件 421 项通过；
  - `pnpm check` 为 67 个文件 1640 项通过，四个 TypeScript 程序、lint 与生产构建均通过，P1 测试全部保持通过；
  - `pnpm check:original` 零发现；
  - 依赖与锁文件未变；
  - 不适用 browser-testing。
- **文档影响：**
  - [工程约定](../../../../engineering/README.md#测试)的测试规则加入内容 fixture 与测试数据守卫；
  - [源码结构](../../../../engineering/source-structure.md#内容基础契约与切片定义)说明 fixture 与跨契约测试。

  guides、架构决策与 STATUS 不受影响，原版事实与 U 项状态不变。
