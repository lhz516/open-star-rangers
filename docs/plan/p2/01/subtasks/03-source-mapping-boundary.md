---
type: plan
status: active
phase: P2
task: "01"
subtask: "03"
updated: 2026-10-08
---

# 03 — 原版来源映射边界

**契约来源：** [spec](../spec.md) 的 S-05、S-06、S-10、S-11；AC-04、AC-05、AC-10、AC-13。
**依赖：** 01、02。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 `src/original-data/` 计划新增来源映射契约，表达光盘相对路径、NOB entry ID/type、子资源定位、source fingerprint 占位、置信度、U 项和 Asset ID 映射。
- 保持 locator 只属于原版数据层；content、Core、Renderer、Audio 和缓存消费契约只看到规范 ID、payload identity 和来源判别。
- 对一对多/多对一映射、类型冲突、缺定位和未确认必需来源提供安全诊断；不输出原版内容。

## 不包含

- 不实现 CCD/IMG、ISO9660、哈希算法、NOB 随机读取或 payload 转换。
- 不升级 U 项状态，不把研究推断改成事实文档。

## 关键文件与契约

- [imfat.ts](../../../../../src/original-data/imfat.ts)是当前 entry 形状的复用依据。
- 已新增 [source-mapping.ts](../../../../../src/original-data/source-mapping.ts) 及相邻测试；消费者边界在 [eslint.config.js](../../../../../eslint.config.js) 与 [engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts)。

## 验收标准

- [x] locator 能表达规范 Asset 到一个或多个原版子资源的映射，并保留置信度和 U 项。
- [x] 规范内容类型和下游消费者无法导入 locator 或 NOB 定位字段。
- [x] 合成测试覆盖缺失、冲突、未确认必需来源和一对多/多对一映射。

## 验证方法

- Node/Vitest 合成映射 fixture、工程边界检查与源码依赖检查。
- 不适用 browser-testing；本子任务不接入浏览器。

## 完成证据

- **实现：** [source-mapping.ts](../../../../../src/original-data/source-mapping.ts) 定义 `OriginalAssetLocator`（光盘相对的 8.3 大写路径、IMFAT entry ID/type、可选子资源路径）与 `SourceMapping`。每个规范 Asset 映射到一个或多个部件，部件之间为“全部需要”。同一部件内的 locator 是精确等价物，必须共享条目类型与子资源；`verified` 表示导入方已证明字节和条目元数据相同。映射另记录置信度（非 confirmed 必须链接 U 项）、`docs/original/` 证据和 `declared`/`verified` 解析状态。表级 `sourceFingerprint` 在 P2-03 提供前为 null，此时不允许出现 `verified`。`diagnoseSourceMappings` 对所有映射报告条目类型与 kind 不兼容，对必需 Asset 另报缺失、未确认和未验证；likely 不报，但保留 U 项。诊断深度冻结，只含规范 ID、结构路径和 U 项。为复用校验，`contract-validation.ts` 新增 `readArray` 与三个来源映射错误 code，`content-identity.ts` 抽出 `readSourceFingerprint`；08 的依赖读取行为保持不变，并有错误优先级回归测试。
- **边界：** core、content、render、platform、ui、app 的生产代码不得直接导入 `original-data`（lint，core/content 与纯模块限制合并为同一条规则选项）。依赖图回归沿真实应用程序传递检查再导出、动态 `import()` 和 `import('…')` 类型；只有 `original-data` 与 `workers` 可以到达 `original-data`，无法核实目标的计算型动态 import 一律报错。
- **测试：** [source-mapping.test.ts](../../../../../src/original-data/source-mapping.test.ts) 用合成 locator 覆盖一对多（任务两部件、模型多部件、等价别名）、多对一（两个图像共用 locator、调色板取同一条目的子资源），以及只更换等价 locator 时 Asset ID/依赖不变（AC-03）。负向用例覆盖 24 种拒绝情形，包括未知字段、非法路径/ID/类型/子资源、空部件、重复与乱序、混合类型或子资源的等价物、跨部件重复、非法置信度/U 项/证据、无指纹的 verified 和 fixture 冒充指纹。诊断测试覆盖缺失、类型冲突、未确认、未验证、likely 不报、非必需映射仍报冲突，以及调用者表格的 U 项隔离。边界回归覆盖 6 层 × 2 扩展名的直接导入拒绝、允许路径，以及依赖图对直接再导出、经 workers 中转、类型查询、动态与计算型 import 的检测。
- **审查：** rubber-duck 提出 2 个阻塞问题和 2 个其他问题。阻塞问题：① 边界可经 ui/app、import 类型、动态 import 或中间模块绕过，已扩展 lint 并新增传递依赖图检查，复核后又补上计算型动态 import；② “等价物”未强制等价，已要求同类型同子资源，并写明 `verified` 的含义。其他问题：③ 诊断与调用者共享 U 项数组，已改为复制并冻结；④ 重构改变了依赖读取的错误优先级，已恢复为按索引顺序报错。同一审查者复核确认全部解决。
- **simplify：** 采纳复用 `ImfatEntry` 字段类型、合并重复的字符串比较器、依赖图与 render 规则共用一个模块说明符解析器（同时覆盖 import 类型）、以键集合代替 JSON 序列化检测重复、以首次索引映射代替重复扫描、按说明符合并 import 形式（lint 调用从 144 次降至 36 次）、游标队列，以及删除冗余断言。跳过两项：来源映射错误 code 不迁出 content 的统一错误 code 枚举，因为 spec 要求整个契约的错误 code 统一枚举并含来源/研究类别，迁出须改动本 diff 之外的共享基础设施；依赖图可达性不做记忆化，因为约 150 个文件的逐根 BFS 只需毫秒级，且违规对更直观。
- **验证：** `pnpm exec vitest run src/original-data src/content tools/engineering-boundaries.test.ts` 为 9 个文件 286 项通过；`pnpm check` 为 62 个文件 1505 项通过，四个 TypeScript 程序、lint 与生产构建均通过；依赖与锁文件未变。不适用 browser-testing。
- **文档影响：** [工程约定](../../../../engineering/README.md#lint-规则eslintconfigjs)记录消费者边界与依赖图规则，以及 P2-02 放行字节端口时的处理方式；[源码结构](../../../../engineering/modules/original-data.md#原版来源映射)新增来源映射 API 说明。原版事实与 U 项状态不变，没有升级置信度。
