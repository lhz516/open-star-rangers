---
type: plan
status: active
phase: P2
task: "01"
subtask: "08"
updated: 2026-10-03
---

# 08 — 候选无关的基础内容契约

**契约来源：** [spec](../spec.md) 的 S-04、S-05、S-08、S-10、S-12；AC-03、AC-04、AC-09、AC-12。
**依赖：** 无。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 从 02 拆出独立于具体任务的 Asset ID、封闭 kind/资源组、版本/来源/身份、描述符与引用基础类型，保持无宿主依赖的可结构化克隆数据。
- 固定用于排序的规范资源单位：每个模型一个 Asset，几何并入模型 payload；图像按独立图像资源、字体按字库、音效按独立采样片段、布局按消费布局、任务按整个规范任务计量。独立复用的调色板/逻辑数据拥有自己的 Asset；内部数值、字形、采样点和模型几何不逐项拆成 Asset。
- 原始容器与规范单位不是一一对应关系；拆分/合并及共享身份必须显式记录。源条目、原版名称、路径或 UUID 不成为消费者 Asset ID。
- 实现 ID 的 8 段/32 字符每段/128 字符总长限制，版本/身份字段的形状约束与明确诊断；以合成数据测试边界、来源判别、规范单位和数据隔离。
- 不把规则常量或类型存在解释为已有完整规范图。01 仍须用这些契约建立完整候选图并按原 S-02 排序；未定位的固定/隐式引用必须保留缺口。

## 不包含

- 不创建或锁定 `classic-p2-slice` 的生产候选，不修改 S-02，不选择敌机/基地或近似玩法。
- 不实现原版 locator、图像/模型/音频/任务转换、全包完整性、预算累计、实际 Worker/缓存/浏览器消费者。
- 不实现 05 的完整 TypedArray/transfer 所有权策略；这里只声明并验证基础容器不暴露共享可变状态。

## 关键文件与契约

- 已新增 [asset-id.ts](../../../../../src/content/asset-id.ts)、[asset-contract.ts](../../../../../src/content/asset-contract.ts)、[content-identity.ts](../../../../../src/content/content-identity.ts)、[asset-units.ts](../../../../../src/content/asset-units.ts) 及相邻测试。职责分别为 ID、描述符/引用、身份与资源单位，不创建统一全局 schema。
- [tsconfig.core.json](../../../../../tsconfig.core.json)、[工程约定](../../../../engineering/README.md)与 [engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts)约束纯度和检查。

## 验收标准

- [x] Asset ID 的合法边界、非法 kind、空段、连字符、遍历/URL/Unicode、段数和长度限制均有合成断言及明确错误。
- [x] schema、切片定义、converter、manifest、payload 与来源身份分开；合成/原版来源具有不同判别形状，SHA-256 payload 指纹与整数约束受验证。
- [x] 资源单位与用户的模型粒度选择一致；模型内部几何不成为独立 Asset，容器/来源数量不被误当作规范数量。
- [x] 类型/基础值可结构化克隆且容器修改不会改变内部契约；生产类型程序无宿主/表现依赖。
- [x] 针对性测试与 `pnpm check` 通过；依赖清单/锁文件未改，原版内容不进入代码、测试或构建。

## 验证方法

- `pnpm exec vitest run src/content tools/engineering-boundaries.test.ts`，按新增测试路径进一步收窄。
- `pnpm check`、`pnpm check:original`；自动化只使用代码生成数据，不读取 `local/`。
- 依 execute-goal 做当前子任务 diff 的 rubber-duck 审查；实现稳定后用 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 仅清理本项。
- 无浏览器验收，不调用 browser-testing 替代纯模块/所有权测试。

## 完成证据

### 2026-10-03 — 基础实现与当前验证缺口

- 新增 [asset-id.ts](../../../../../src/content/asset-id.ts)、[asset-contract.ts](../../../../../src/content/asset-contract.ts)、[content-identity.ts](../../../../../src/content/content-identity.ts)、[asset-units.ts](../../../../../src/content/asset-units.ts) 及 4 个相邻合成测试；仅增加一个模块内复用的 [contract-validation.ts](../../../../../src/content/contract-validation.ts)。ID 限制包含 kind 首段；边界测试覆盖 8/9 段、32/33 字符、128/129 总长、非法类型/Unicode/遍历/分隔符及 kind 不一致。
- 基础读入口验证严格 plain DTO，拒绝类实例、函数、accessor、额外字段及非规范依赖数组，返回冻结且脱离输入的普通容器。依赖按 ASCII ID 升序且不可重复；角色必需集合/基数、引用存在/自引用/环仍留给 02/04。合成输入修改、返回值修改和结构化克隆隔离均有断言；二进制 payload 不进入本项接口，独占副本/别名与 transfer 失效仍归 05，**未宣称完成 AC-09 的全部二进制验收**。
- schema、切片定义、converter、manifest、origin 与 payload 身份保持独立；数值版本为正安全整数、长度为非负安全整数、payload 指纹严格为 `sha256:` 加 64 个小写十六进制字符。converter 按 spec 为受限 ASCII 不透明字符串。fixture token 不含 `:`，来源指纹使用 `source:<不透明 token>`；**形状通过不是来源真实性证明**，不生成 SHA/来源指纹或 manifest 身份，后续生产责任不变。
- 固定每模型一个 Asset，几何在模型 payload 内，不新增 mesh kind 或几何 data Asset；其他计量单位及内部字形/采样点等由资源单位常量表达。这不是源条目到规范资源的完整映射或候选图；没有锁定候选、修改 S-02 或执行全战役排序。
- VS Code `runTests` 未发现测试，改用现有 pnpm runner。最后一次 `pnpm exec vitest run src/content`：4 文件 / 164 项全通过；随后 `pnpm typecheck`（4 个程序）与 `pnpm lint` 通过。`pnpm build` 单独通过，保留既有大 chunk 提示；`pnpm check:original` 四个范围均完成、零 finding。未安装依赖，依赖清单与锁文件未改。
- **未通过项：** 默认 `pnpm check` 的 typecheck/lint 通过，但完整测试为 1410 通过 / 26 失败（1436 项），失败输出为既有 `tools/` 测试 deadline 或子进程超时，build 阶段未到达。`VITEST_MAX_WORKERS=1 pnpm check` 仍出现工具测试超时，长时间未完成后停止；没有提高 deadline、修改测试配置或停止其他进程。初次联合 content/工程边界测试中的一处本项测试诊断断言已修正，164 项内容测试随后通过；工程边界 suite 仍有超时，**全量检查通过这一验收条件尚未满足**。
- 实现/测试后仅一次当前 9 个新增代码文件（含未跟踪）的 rubber-duck 审查：无重要问题。随后调用 simplify，按强制流程并行做复用、简化、效率和抽象层次四个清理角度；均无适用发现，未改变代码行为。之后重跑上述 164 项内容测试、typecheck 与 lint，全部通过。
- 文档影响：仅更新[源码结构指南](../../../../engineering/source-structure.md)，列出实际模块/API、表示语法与下游责任；工程命令/边界配置未变，不需改其他指南。未读取 `local/`、未改 goal 状态/依赖或其他子任务证据，未 stage/commit/push。08 的状态仍由父任务维护；本项保留全量检查未通过的缺口，不记录完成判定。

### 父任务追加验证

- 当前树单独运行 `pnpm exec vitest run tools/engineering-boundaries.test.ts --maxWorkers=1`：29 通过/3 超时；失败仍为既有 deadline，未修改 runner 配置或断言。
- 从未包含本项代码的 HEAD 导出自有临时副本，复用已安装依赖，直接运行同一 Vitest 版本、同一工程边界 suite、同一 worker 数和 deadline：31 通过/1 超时（拥有浏览器/Node 源的正向环境检查）。该基线证明至少一项旧树超时，不证明每一项失败的原因；临时副本仅用于诊断，不含原版文件。
- 再次默认 `pnpm check`：typecheck/lint 通过，测试 1420 通过/16 失败，仍包含工具测试超时；未到脚本 build 阶段。保留检查未通过的验收，父任务将 08 标记 blocked；实现和证据不作为完成提交。
- 用户减轻负载后，默认检查曾达到 1435 通过/1 超时；合规 CLI suite 单独运行为 2/2 通过，全部 suite 使用 `--maxWorkers=1 --no-fileParallelism` 为 60 文件/1436 项通过，所有断言和 deadline 不变。
- 用户随后明确批准默认文件串行调度；[vite.config.ts](../../../../../vite.config.ts) 设置 `fileParallelism: false` 与 `maxWorkers: 1`，在工程边界 suite 添加调度/发现/原 timeout 不变的回归，并同步工程约定。默认 `pnpm check` 的最新结果为 59 文件通过/1 失败、1436 项通过/1 超时（共 1437 项），仍是既有合规 CLI 聚合用例超过 45 秒，最新观测为约 47.3 秒。**串行通过的历史结果不替代这次失败；08 继续 blocked，未提交。**

### 2026-10-03 — 合规 CLI 有界诊断与默认检查通过

- 未改动代码的 CLI suite 为 2/2 通过、17.61 秒。子进程计时确认实际执行 6 次 aggregate、11 次 original、7 次 licenses；真实构建与依赖审计占主要时间。合成 fixture 的真实构建交错比较中，配置 bundle 为 2002/966 毫秒、native 为 823/771 毫秒，三份许可声明/inventory 完全相同。确认可去除 fixture 配置的重复打包，但总耗时仍有波动，**这些测量不能单独证明先前 47.3 秒超时的全部原因**。
- 仅在 [cli.test.ts](../../../../../tools/compliance/cli.test.ts) 的 fixture setup 增加 4 行：验证复制的 package scripts，并把该临时项目的 build 设为 `vite build --configLoader native`，使用项目已要求的 Node 原生 TypeScript 能力。生产 CLI、审计/构建插件、仓库 package/lock/config、原有断言和四个扫描范围不变；没有提高任何 test/hook/child deadline，没有缓存旧报告、跳过检查或用 mock 替代真实命令。
- 聚焦 CLI、scan、distribution、build-plugin 的 4 文件/22 项通过，继续验证工作树/索引/未跟踪/build 命中、来源修改的 stale-input、产物损坏、inventory 丢失、未知许可、真实构建失败及输出失效。一次仅针对上述性能 diff 的 rubber-duck 审查无重要问题；随后 scoped simplify 按复用、简化、效率和抽象层次检查，无额外代码改动。复验 CLI 两项分别为 20.557/8.865 秒，均在原 45 秒内。
- 最终**默认 `pnpm check` exit 0**：四个 TypeScript 程序、ESLint、60 文件/1437 项测试及生产 build 全通过；测试阶段 101.25 秒，Vitest 当前结果缓存中的 CLI suite 合计 38.143 秒且 `failed: false`。生产 build 为 63 modules、1.96 秒，保留既有大 chunk 提示。日志与计时证据保存在本次 session files；未读取本地原版内容、未安装/更新项目依赖、未 stage/commit/push，按用户要求不改 goal tracker 或父级状态文档。
- 父任务已核对默认检查日志与性能修复 diff；此前的验证阻塞按这次完整通过解除，验收框据实际结果勾选。历史失败记录保留，便于解释为何调整调度和 fixture 配置加载；不将其改写为通过。
