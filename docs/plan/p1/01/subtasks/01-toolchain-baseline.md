---
type: plan
status: active
phase: P1
task: "01"
subtask: "01"
updated: 2026-10-01
---

# 01 — 工具链与检查范围基线

**契约来源：** [spec](../spec.md) 的 S-01、S-04、S-06；AC-01、AC-02、AC-06（基线）、AC-09、AC-10。
**依赖：** 无。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 记录当前 HEAD/本任务与用户改动边界，实际 Node/pnpm/Python 版本及来源；核对 Node 主版本/最低版本、pnpm 精确版本和锁定依赖。锁文件按两个 YAML 文档解释，不新增解析依赖或错误地合并文档。
- 核对三个 TS 项目的有效配置和实际纳入文件、ESLint 作用域及 Vitest 发现范围。记录 `eslint.config.js` 是 lint 覆盖而非 TS 类型覆盖，不以空根 TS 项目冒充检查。
- 执行已有完整检查与独立 Python 测试，归档新基线而非复用旧结果。已有检查通过不表示边界缺口已修复。
- 用不写生产文件的探测重新确认 spec 记录的 lint 缺口。STATUS 的“目录边界与确定性 lint”整体勾选目前不能代表完整成立：确认后取消该项勾选并指向失败证据；其余工程项按实际结果保留或取消。后续 05 在完整复核通过后更新。
- 本项是检查与证据切片，不要求先修复所有边界；针对已知限制记录“待 02/03 修复”，不能声称整个 P1-01 已完成。

## 不包含

- 不修复 lint、增加测试或改变版本；02 至 04 负责。
- 不读取原版数据、不运行真实 Ghidra、不启动浏览器服务或建设 CI。

## 关键文件与契约

- [.nvmrc](../../../../../.nvmrc)、[package.json](../../../../../package.json)、[pnpm-lock.yaml](../../../../../pnpm-lock.yaml)：仅核对。
- [TS 配置](../../../../../tsconfig.base.json)、[core](../../../../../tsconfig.core.json)、[app](../../../../../tsconfig.app.json)、[node](../../../../../tsconfig.node.json)、[ESLint](../../../../../eslint.config.js)、[Vite](../../../../../vite.config.ts)：现状及检查作用域。
- [STATUS 工程骨架](../../../../STATUS.md#工程骨架)：纠正不成立勾选并链接本文件证据，不更新运行骨架验收。

## 验收标准

- [ ] AC-01：实际工具版本符合声明，多文档锁定依赖与 manifest 匹配；无升级、新依赖或非必要锁文件改动。
- [ ] AC-02：有效项目配置/文件集记录完整，纯程序无 DOM/Node 类型；JS lint 与 TS 检查范围明确。
- [ ] AC-06 基线：现有 `pnpm check` 与独立 Python 测试的新结果及发现集合已记录；失败不得隐瞒，必要前提未满足则不标完成。
- [ ] AC-10：已确认规则缺口和 STATUS 当前不成立的勾选明确关联；本项通过不声称规则已修复。
- [ ] AC-09：探测不产生持久生产样本、不读取原版文件、不改变用户环境和数据。

## 验证方法

- `node --version`、`pnpm --version`、`python3 --version` 与声明/锁文件核对。
- `pnpm exec tsc -p tsconfig.core.json --listFilesOnly` 和相应 app/node 文件集；必要时 `--showConfig`。只读探测 ESLint 配置/虚拟源，明确 ruleId。
- `pnpm check`；`python3 -B -m unittest discover -s tools/ghidra -p 'test_*.py'`。归档结果，不要求历史固定测试数量。
- 无浏览器、原版或云验证；证据留在下方，不能在生成计划时填通过结果。

## 完成证据
