---
type: plan
status: active
phase: "P3"
task: "16"
subtask: "08"
updated: "2026-10-31"
---

# 08 — 工程与 Python 检查

**契约来源：** [spec](../spec.md) 的 S-03、AC-03、[技术决定](../spec.md#技术决定) 2 与 9。
**依赖：** 04、18、19。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在含修复的候选上运行：
  - `pnpm check`；
  - `python3 -B -m unittest discover -s tools/ghidra -p 'test_*.py'`；
  - `python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'`。
- 记录：提交；类型检查、lint、Vitest 的文件数与用例数；构建；Python 版本；各退出码；本次构建的 `dist` 指纹（按 P2-13/04 的算法）。
- **失败处理：** 保留首次失败与原因。只有查明的环境原因才可不改代码、配置与断言重跑整条命令。产品或测试缺陷交协调者新增修复项。

## 不包含

- E2E（09）；合规（10）。

## 关键文件与契约

- [package.json](../../../../../package.json) 的脚本；[工程约定](../../../../engineering/README.md#命令)。

## 写入范围

- `dist/**`：`pnpm check` 的构建（被忽略）。

## 验收标准

- [x] AC-03：`pnpm check` 与两组 Python 测试都实际运行并通过，记录完整；没有沿用旧的测试数。
- [x] 失败与重跑符合技术决定 9。

## 验证方法

- 命令输出与退出码；构建清单的 SHA-256。

## 完成证据

- **候选：** 提交 `a02f4ad0`（goal 分支 `main` 的 08 认领提交，代码含 04、18、19、20），`src` 树 `21e68310cf43eae58b863d4b3b12b318c3d489e5`，根树 `5b4fd721…`。运行前后 `git status --porcelain --untracked-files=all` 都为空；`pnpm-lock.yaml` 的 SHA-256 为 `114caf38…3aff36`。
- **环境：** macOS 26.6（25G72），8 核，Node v22.22.0（`.nvmrc` 为 22），pnpm 12.8.1，TypeScript 6.0.3，ESLint 10.11.0，Vitest 5.0.3，Vite 8.3.1，Python 3.12.3（`/opt/homebrew/bin/python3`）。全新 worktree 执行 `pnpm install --frozen-lockfile`，没有 `dist/` 与 ESLint 缓存。开始时负载均值 7.50 / 56.06 / 69.91（1/5/15 分钟），有其他会话同时运行。
- **`pnpm check`：** 2026-10-31 00:11:50–00:13:49 PDT，一次运行，退出码 0，实耗 1 分 58.7 秒。
  - 类型检查：`tsconfig.core/app/node/e2e` 四个项目均通过，没有诊断。
  - Lint：ESLint 没有输出问题（0 error、0 warning）。
  - Vitest：447 个测试文件全部通过，11,935 个用例全部通过，耗时 75.95 秒。数字取自本次输出，没有沿用 [19](./19-explosion-sprite-sampling.md#完成证据) 记录的 11,932。输出中有两条 typescript-eslint 的 `TSImportType` 弃用提示，不是失败。
  - 构建：`vite build` 转换 408 个模块，产出 `index.html`、`index-C2yC4qRv.js`（1,613.08 kB）、`index-4wICpzMB.css`、`import-worker-B6gJB71A.js` 及 source map，耗时 1.43 秒。仅有既有的单 chunk 超过 500 kB 提示。
- **Python：**
  - `python3 -B -m unittest discover -s tools/ghidra -p 'test_*.py'`：3 个用例，`OK`，退出码 0，没有跳过。
  - `python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'`：232 个用例，`OK`，退出码 0，没有跳过，耗时 33.8 秒。
- **构建指纹：** 按 [P2-13/04](../../../p2/13/subtasks/04-compliance-artifacts.md#完成证据) 的算法（即 P2-12/12 候选核对脚本的 `distManifest`）：`dist/` 下全部普通文件按路径排序，每行 `<SHA-256>  dist/<路径>`，以换行结尾，对整个清单取 SHA-256。
  - **结果：** `sha256:74260a03139057ce9b48f7d30153fc5798f6dfbd9b958a8ddca4829c9315843d`，9 个文件，12,223,935 字节。`dist/` 中没有非普通文件。
  - **绑定范围：** 该指纹只表示本次 `pnpm check` 的构建。09 的 `test:e2e` 与 10 的 `check:compliance` 会再次构建，须各自记录指纹，不能直接套用本值（[技术决定 2](../spec.md#技术决定)）。
- **失败与重跑（技术决定 9）：** 三条命令都只运行一次，首次即通过，没有失败，也没有重跑；没有删用例、加重试或放宽判据。
- **Rubber-duck：** 审查本文档差异、三份命令输出与构建清单，并按原 `distManifest` 重算指纹核对行格式、排序与结尾换行。没有发现问题。
- **文档影响：** 只运行检查，没有改代码或命令。[工程约定](../../../../engineering/README.md#命令) 与 AGENTS.md 的命令仍准确，无需更新。

