---
type: plan
status: active
phase: P1
task: "01"
subtask: "02"
updated: 2026-10-01
---

# 02 — 纯模块类型环境正负回归

**契约来源：** [spec](../spec.md) 的 S-01、S-02、S-03；AC-02、AC-03、AC-04、AC-09。
**依赖：** 01。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `tools/engineering-boundaries.test.ts`，使用现有 TypeScript/Vitest API 加载真实 core/app/node 配置与项目文件，提供内存合成源；不复制更严格的测试专用编译选项。
- 验证纯程序没有 DOM lib 或 Node 声明，包括间接纳入的声明；实际 TS 编译结果与文件集都必须检查。
- 对 core/original-data/content 的真实逻辑路径分别提供 DOM（`document`、`HTMLElement`）、存储（`indexedDB`、`localStorage`）、Node（`process`、`Buffer`、`node:fs`）负向样本。断言目标缺失声明诊断并定位到样本，不以其他编译错误代替。
- 配置对应的合法对照：纯数据样本、app DOM/存储、Node 全局/模块及 `.test.ts` 测试能力。相同 host 能力源码在相应允许项目通过，证明拒绝来自类型环境；只编译，不运行这些样本。
- 虚拟源须按真实项目目录/扩展名参与程序，模拟 include/exclude 的实际归属并保持真实 options；不得把生产源码包装成 `.test.ts`。不在仓库写违规文件或空 Core。
- 如类型环境确有必要配置缺口，只做本项直接相关修正并配回归。无已证明缺口不改 TS 配置。

## 不包含

- lint 规则修正与 lint 用例由 03 负责；不实现 Core、JSX 功能或解析器。
- 不扩大 JS 类型检查、不支持未来 `.test.tsx` runner、不新增依赖。

## 关键文件与契约

- 计划新增 `tools/engineering-boundaries.test.ts`：本任务专用类型环境测试及必要的小型辅助函数。
- [core](../../../../../tsconfig.core.json)、[app](../../../../../tsconfig.app.json)、[node](../../../../../tsconfig.node.json)、[base](../../../../../tsconfig.base.json)：真实配置来源，按证据决定是否修正。
- [现有合成解析器测试](../../../../../src/original-data/imfat.test.ts)：只复核，保持原行为。

## 验收标准

- [ ] AC-02：真实纯模块程序文件集不包含 DOM/Node 声明，有用例确保污染不能悄悄通过。
- [ ] AC-03：三个纯模块位置的全部类型环境负向能力产生正确的样本诊断，没有空程序或无关错误假通过。
- [ ] AC-04：纯数据/app/Node/test 对照通过，保留测试与生产边界；不执行输入中的文件读写。
- [ ] AC-09：源样本在内存或独立自有临时环境，结束无生产占位文件/原版访问。
- [ ] `pnpm test -- tools/engineering-boundaries.test.ts` 发现新用例且通过；`pnpm check` 通过，原有测试行为不变。

## 验证方法

- API 加载实际项目并观察样本 diagnostic code/位置和合法对照；异常不得被转换成“预期拒绝”。
- 运行上述针对性测试和完整检查；用例不得只 grep 配置字符串。
- 代码变更按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 限定本 subtask 的新增测试/配置 diff，清理后重跑受影响检查。
- 无浏览器、真实 Ghidra、原版或存储验证。

## 完成证据
