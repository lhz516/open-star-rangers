---
type: plan
status: active
phase: P2
task: "01"
subtask: "02"
updated: 2026-10-08
---

# 02 — 切片定义与角色清单

**契约来源：** [spec](../spec.md) 的 S-01、S-03、S-04、S-05、S-08、S-10；AC-01 至 AC-04、AC-09。
**依赖：** 01。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 使用 08 已实现的 Asset ID、资源单位、身份、描述符和封闭资源组契约，定义唯一 `classic-p2-slice`、`SliceDefinition`、版本及所选角色基数；不另建一套 ID/身份类型。
- 按用户 2026-10-03 的粒度选择，每个模型一个规范 Asset；网格几何是模型 payload 内部数据，版本/所有权随模型，不为原版 MESH 创建独立 data Asset。共享源网格可复用解析结果，但发布给模型消费者的视图必须保持隔离；规范模型不得携带原版 mesh entry ID。
- 将 01 的合格候选和角色清单写入唯一生产定义；不合格或未确认候选不得写成成功配置。

## 不包含

- 不重复 08 的基础 ID/类型/身份契约，不实现来源 locator、完整性验证、预算累计或浏览器/Worker/IndexedDB 适配。
- 不选定未由 01 证据支持的模型、敌我关系或玩法规则。

## 关键文件与契约

- 已新增 [slice-definition.ts](../../../../../src/content/slice-definition.ts) 及相邻测试；唯一构造规则在 [engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts) 的 content 部分。
- [tsconfig.core.json](../../../../../tsconfig.core.json)与 [工程边界](../../../../../tools/engineering-boundaries.test.ts)约束纯度。

## 验收标准

- [x] 生产中仅有一份切片定义，完整角色和组基数与 spec 一致。
- [x] Asset ID、版本、manifest、origin 和依赖数据是可结构化克隆的纯数据，且调用者修改输入不影响内部值。
- [x] 合成来源和原版来源具有不可混淆的判别形状。
- [x] 模型粒度与用户选择一致：飞船与基地角色只接受每模型一个 model Asset；几何没有独立 Asset kind 或身份，描述符不能携带原版网格定位或几何身份；模型 payload 结构不兼容时递增其 payload schema 版本。几何字节变化必须使所属模型的 payload 身份失配、共享源网格不得产生可变跨模型视图——这两项字节层要求分别由 04 的 payload 身份核验与 05 的所有权规则实现，并由 06 的合成用例验证（AC-06/AC-09）。

## 验证方法

- Node/Vitest 合成正负 fixture；不读取 `local/`。
- 运行纯模块类型和 lint 边界测试；不适用 browser-testing。

## 完成证据

- **实现：** [slice-definition.ts](../../../../../src/content/slice-definition.ts) 新增唯一生产定义 `CLASSIC_P2_SLICE`（深度冻结，`SliceDefinition` 带仅类型品牌）。定义包含经批准的候选结构选择器（战役 group 0 / slot 1）、僚机可选配置、全部四个资源组，以及 S-03 的 15 个角色，每个角色都有所属组、允许 kind 与 Asset 数量范围。单值角色为任务、玩家飞船、基地和前视驾驶舱；敌机 1–2；其余为至少 1 个。弹丸/导弹/碎片暂允许 model 或 image，四类核心音效暂允许多个采样片段，分别待 P2-06/P2-08 依 U-027/U-004 核实后通过定义版本收窄。原版条目 ID 不进入 `content/`，由 03 的来源映射记录。
- **测试：** [slice-definition.test.ts](../../../../../src/content/slice-definition.test.ts) 以 S-03 为准逐项断言 15 个角色及其组、kind 与数量范围，并核对角色清单完全一致、四个资源组、候选与配置、无来源定位字段，以及深度冻结和结构化克隆隔离。[工程边界回归](../../../../../tools/engineering-boundaries.test.ts)新增 content 部分：用应用程序的类型检查器确认只有本模块对 `SliceDefinition` 做类型断言。临时项目中，别名、映射类型与直接断言三种伪造均被命中；引用、传参、克隆单例及无关断言均不误报。模型粒度的契约部分由 S-03 用例（飞船/基地只接受 model）及 08 既有测试（无 mesh kind、描述符拒绝未知字段、payload schema 版本）覆盖。
- **审查：** rubber-duck 提出 3 个阻塞问题。① 音效“恰好 1 个”把未确认语义固化，已改为至少 1 个；② 按角色字面量搜索唯一性既会误报也会漏报，已改为名义类型加类型检查器边界规则；③ 几何身份测试是同义反复，已删除，并把验收第 4 项按依赖关系限定为契约层保证，字节层要求明确交由 04/05 实现、06 验证（06 工作范围已列出对应用例）。①已经复核确认解决，②③按审查者提出的最小修正实施，同一审查者复核后确认三项均已解决、无剩余修正。
- **simplify：** 四个角度的审查一致指出唯一性检测放错了层级、重复了已有基础设施、每次运行都重复扫描源码，已移入工程边界回归并复用共享的应用程序构建；与 S-03 用例或 08 测试重复的断言已删除。没有跳过的发现。
- **验证：** `pnpm exec vitest run src/content tools/engineering-boundaries.test.ts` 为 6 个文件 217 项通过；`pnpm check` 为 61 个文件 1457 项通过，四个 TypeScript 程序、lint 与生产构建均通过；依赖与锁文件未变。不适用 browser-testing。
- **文档影响：** [源码结构](../../../../engineering/modules/content.md#内容基础契约与切片定义)与[工程约定](../../../../engineering/README.md#lint-规则eslintconfigjs)已更新；原版事实、命令与操作指南无变化。
