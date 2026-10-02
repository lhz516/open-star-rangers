---
type: plan
status: accepted
phase: P1
task: "01"
updated: 2026-10-01
---

# P1-01：工程骨架基线复核 — Goal

## 目标与来源

落实已批准的 [spec](./spec.md) 中 S-01 至 S-06、AC-01 至 AC-10：复核既有工程，补可重复的类型环境与 lint 边界回归，修复已确认的规则缺口，并取得本地构建、最小应用壳浏览器和清理证据。不重新实现项目，不改变游戏或解析器行为。

## 代码现状与前提

- [package.json](../../../../package.json)、[.nvmrc](../../../../.nvmrc) 和[多文档锁文件](../../../../pnpm-lock.yaml) 已声明工具链与依赖；`pnpm test` 调用 Vitest，`pnpm check` 串联三个 TS 项目、lint、测试和 build。
- [TS 配置](../../../../tsconfig.base.json) 与 [core](../../../../tsconfig.core.json)/[app](../../../../tsconfig.app.json)/[node](../../../../tsconfig.node.json) 类型环境已存在。Node 类型项目不检查 JS 配置；本任务不为此扩大 checkJs 范围。
- [ESLint](../../../../eslint.config.js) 有纯模块/确定性规则，但 spec 评审已确认 `.tsx`、若干包子路径、应用层目录入口和 `async` 的规则缺口。类型环境不含 DOM/Node 的当前结果也须在执行时重新核验。
- [Vite/Vitest 配置](../../../../vite.config.ts) 已发现 `tools/**/*.test.ts`。计划新增 `tools/engineering-boundaries.test.ts`，复用已安装的 TypeScript、ESLint 和 Vitest API；检查样本在内存中提供真实逻辑文件路径，不落入生产目录。小型检查辅助函数优先与用例同文件，不建设通用检测框架。
- 现有[合成解析器测试](../../../../src/original-data/payloads.test.ts)和 [Python XML 测试](../../../../tools/ghidra/test_patch_watcom_cspec.py)保持原样并重新运行。无新的游戏数据模型或持久化契约。
- [App](../../../../src/app/App.tsx) 仍是占位页面，[main](../../../../src/main.tsx) 启用 StrictMode。`pnpm dev` 和 `pnpm preview` 已有；没有 Playwright runner，本任务不安装它。
- **跨任务前提：** 无；本任务是 P1 起点。执行环境须有符合声明的 Node/pnpm、可运行标准库测试的 Python，以及浏览器工具。Python 版本按实际记录。缺少必要浏览器能力会留下 AC-08 未完成，而不是以 HTTP 响应代替。
- **计划基线：** 最近已提交阶段计划为 `731dc73`；spec 与阶段导航当前有未提交的本任务工作，尚无执行记录。执行时重新记录实际 HEAD/工作树，不把这些规划文件当成历史实现。
- **边界：** 无需原版文件、Ghidra 安装、数据库、云凭据、CI 或部署。浏览器只观察自有占位页面。
- 代码清理按 [simplify](../../../../.agents/skills/simplify/SKILL.md) 限定当前 subtask diff；浏览器检查按 [browser-testing](../../../../.agents/skills/browser-testing/SKILL.md)。执行与提交规则由 [execute-goal](../../../../.agents/skills/execute-goal/SKILL.md) 管理，不在此重复。

## 验收覆盖

| Spec 范围项/验收项 | 交付子任务 | 验证子任务及方法 |
|---|---|---|
| S-01 | 01 | 01 版本/锁定依赖/配置与覆盖核对；06 最终复核 |
| S-02 | 02、03、04 | 02 类型正负对照；03 lint 矩阵；04 runner 和失败传播；06 全量检查 |
| S-03 | 02、03、04（仅已证明必要的修正） | 同项回归及 06 检查，不放宽契约 |
| S-04 | 01、04、05 | 04/05 当前完整工程和 Python 结果；06 重新执行 |
| S-05 | 05 | 开发响应与生产构建浏览器渲染/刷新；06 核对证据有效性 |
| S-06 | 01、05 | 01 纠正不成立的阶段勾选；05 清理、说明与证据同步；06 审查 |
| AC-01 | 01 | 实际 Node/pnpm/Python、manifest 和两个锁文件文档；06 确认未增依赖/升级 |
| AC-02 | 01、02 | 实际 TS 项目文件集、纯模块 lib/type 与诊断对照；06 |
| AC-03 | 02、03 | spec 九类矩阵与目标类型诊断/lint ruleId；06 |
| AC-04 | 02、03 | 正向能力、test 例外、消费层与扩展名对照；06 |
| AC-05 | 04 | 测试发现、预期不满足/检查器错误/空用例的失败证据；06 |
| AC-06 | 04、05 | 完整 `pnpm check` 和独立 Python 测试当前结果；06 重跑 |
| AC-07 | 05 | build 入口与资产、开发服务响应；06 核对 |
| AC-08 | 05 | 实际生产构建浏览器观察/刷新/console/network；06 核对 |
| AC-09 | 01 至 05 | 合成输入、不读取原版、临时资源和服务所有权清理；06 |
| AC-10 | 01、05 | subtask 证据、工程说明与 STATUS 链接/勾选；06 |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。验收结果与证据写在各 subtask，不复制到阶段索引。05 的浏览器检查须等待规则和完整检查链稳定；最终对齐是最后一行，依赖全部其他项。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-toolchain-baseline.md](./subtasks/01-toolchain-baseline.md) | — | completed |
| [02-type-environment-regression.md](./subtasks/02-type-environment-regression.md) | 01 | completed |
| [03-lint-boundary-regression.md](./subtasks/03-lint-boundary-regression.md) | 02 | pending |
| [04-check-chain-failure-contract.md](./subtasks/04-check-chain-failure-contract.md) | 03 | pending |
| [05-local-shell-evidence.md](./subtasks/05-local-shell-evidence.md) | 04 | pending |
| [06-final-alignment.md](./subtasks/06-final-alignment.md) | 01, 02, 03, 04, 05 | pending |

02、03、04 依次扩展同一回归文件和实际规则，形成各自可验证的切片，避免独立 worker 同时修改检查机制。ID 保持稳定；最终对齐发现缺口时新增修复项，插到 06 行之前并更新其依赖，不复用编号。

## 执行记录

- **2026-10-01 — Subtask 02 实现方式调整：** TypeScript 样本使用自有临时项目而非纯内存虚拟文件，配置逐字复制自仓库，保留编译器真实 include/exclude、扩展名发现与依赖解析；符合 spec 的隔离临时环境边界。ESLint 样本仍使用虚拟源，生产目录没有探测文件。验证时发现同 basename 的 ts/tsx 被 TS 去重，样本已改为独立 basename。

## 审批

**2026-10-01 用户明确批准本 Goal，随后明确调用 execute-goal 开始执行。** 批准范围为本文件的范围覆盖、六项子任务与依赖。Spec 亦于同日明确批准。`accepted` 仅表示计划获批，执行状态以 tracker 和实际证据为准。
