---
type: plan
status: active
phase: P2
task: "13"
subtask: "02"
updated: 2026-10-08
---

# 02 — 工程与 Python 检查

**契约来源：** [spec](../spec.md) 的 S-02、AC-02 与 AC-12；技术决定 2、5。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在干净工作树的当前提交上运行 `pnpm check` 与 `python3 -B -m unittest discover -s tools/ghidra -p 'test_*.py'`。
- 分别记录：提交、Node/pnpm/Python 版本、四个 TypeScript 类型程序、ESLint、Vitest 的文件数与用例数、生产构建（含既有警告）、Python 用例数与各自的退出码。
- **失败处理（技术决定 5）：** 首次失败保留原始输出。只有查明的环境原因可在不改代码、配置与断言的前提下重跑整条命令，并同时记录失败与重跑。原因不明的失败不能以重跑抵消。复现并定位的缺陷交协调者新增修复子任务（技术决定 6）。

## 不包含

- 浏览器回归（03）、合规（04）、真实数据核对（05）。
- 修复缺陷：只记录复现与定位，修复由协调者新增的修复子任务进行。
- 安装或升级依赖：缺依赖时才按 frozen lock 恢复，并记录原因。

## 关键文件与契约

- [package.json](../../../../../package.json) 的 `check` 脚本；[工程约定](../../../../engineering/README.md#命令)。
- [tools/ghidra/test_patch_watcom_cspec.py](../../../../../tools/ghidra/test_patch_watcom_cspec.py)：只用临时合成 XML，不调用 Ghidra，不读原版数据。

## 写入范围

- `dist/**`：pnpm check 中的生产构建（被忽略的构建产物）。
- `node_modules/.cache/**`：ESLint 等工具缓存（被忽略）。

## 验收标准

- [ ] AC-02：`pnpm check` 与 Python 合成测试都在记录的提交上实际运行，各项结果与退出码都已记录；全部通过，或失败已按技术决定 5 记录。
- [ ] AC-12：失败时写明受影响的退出条件、原责任任务、根因（已定位时）与恢复条件；没有失败时写明“无”。
- [ ] 没有修改被跟踪的文件。

## 验证方法

- 运行上述两条命令，记录输出摘要与退出码；`git --no-pager status --short` 确认没有被跟踪的改动。
- 不涉及浏览器或原版对照。

## 完成证据
