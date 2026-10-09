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

- [x] AC-02：`pnpm check` 与 Python 合成测试都在记录的提交上实际运行，各项结果与退出码都已记录；全部通过，或失败已按技术决定 5 记录。
- [x] AC-12：失败时写明受影响的退出条件、原责任任务、根因（已定位时）与恢复条件；没有失败时写明“无”。
- [x] 没有修改被跟踪的文件。

## 验证方法

- 运行上述两条命令，记录输出摘要与退出码；`git --no-pager status --short` 确认没有被跟踪的改动。
- 不涉及浏览器或原版对照。

## 完成证据

- **提交与环境（2026-10-08）：** 在提交 `c2018af`（goal 分支的认领提交，也是本 worker 分支的基点）上运行，运行前后工作树与索引都干净。`f925d21..c2018af` 共 8 个提交，`docs/`、`.agents/` 与 `AGENTS.md` 之外没有差异（`git diff --stat f925d21 c2018af -- . ':!docs' ':!.agents' ':!AGENTS.md'` 输出为空）；候选身份的完整核对归 01 与 05。环境为 Node 22.22.0、pnpm 12.8.1、Python 3.12.3；TypeScript 6.0.3、ESLint 10.11.0、Vitest 5.0.3、Vite 8.3.1。
- **依赖恢复：** 新建的 worker 工作树没有 `node_modules`，因此先运行 `pnpm install --frozen-lockfile`（退出码 0，锁文件未变），没有安装或升级其他依赖。

| 命令／阶段 | 实际结果 | 退出码 |
|---|---|---|
| `pnpm check` | 以 `&&` 依次运行下列四步，全部执行完毕 | 0 |
| ├ `pnpm typecheck` | `tsc -p` 依次检查 `tsconfig.core.json`、`tsconfig.app.json`、`tsconfig.node.json`、`tsconfig.e2e.json` 四个程序，均无诊断 | 0（`&&` 链能执行到后续步骤，说明四个程序都返回 0） |
| ├ `pnpm lint` | ESLint 无诊断 | 0 |
| ├ `pnpm test` | Vitest 156 个文件、4,691 项全部通过，没有失败、跳过或 todo，耗时 12.30 s | 0 |
| └ `pnpm build` | 生产构建通过，转换 130 个模块：`index-aXSeUMy4.js` 963.70 kB（gzip 267.65 kB）、`import-worker-CJmhnkml.js` 166.54 kB、`index-vsXnrZeb.css` 0.57 kB | 0 |
| `python3 -B -m unittest discover -s tools/ghidra -p 'test_*.py'` | 发现并通过 3 项（[test_patch_watcom_cspec.py](../../../../../tools/ghidra/test_patch_watcom_cspec.py)，只用临时合成 XML，不调用 Ghidra，不读原版数据） | 0 |

- **既有警告（只记录，未压制）：**
  - Vite 的 500 kB 块体积警告，[工程约定](../../../../engineering/README.md)已记为包体优化归 P5；
  - Vitest 运行期间 typescript-eslint 输出两次 `TSImportType.argument` 弃用警告（`DeprecationWarning`），来源是边界规则沿用的写法，[P2-03/07](../../03/subtasks/07-capability-boundary.md#完成证据) 已记录。

  两者都不影响退出码。
- **构建产物：** `index-aXSeUMy4.js` 的 SHA-256 为 `42178e76a9e2a9d3403282029829dea56aef6217f9582c596bf42b321211939b`，`import-worker-CJmhnkml.js` 为 `1dbec5b9f7a33f896604b40d27f50cc5331ff207bfb1489608579fcb40f3e9d7`；`dist/compliance-inventory.json` 的 `checksum` 为 `0f20977bd4ab0fb6a970431f80e78c8118575a0eeea3ab75277dbe0ead841102`。这些只用于后续对照同一构建；构建指纹与 `ContentIdentity` 由 05 按候选核对脚本计算。
- **与 P2-12 的比较：** Vitest 计数与 [P2-12/26 第二次运行](../../12/subtasks/26-final-alignment.md#第二次运行2026-10-08未通过残余项待用户决定)记录的 156 个文件、4,691 项相同（第四次运行沿用该记录）。按 AC-02，旧数只作一致性参考，不是目标。
- **失败与重跑（AC-12）：** 无。两条命令首次运行即通过，没有重跑、补丁、跳过或新增修复子任务，因此不涉及受影响的退出条件、原责任任务或恢复条件。
- **被跟踪文件：** 运行后 `git status --porcelain` 为空；`--ignored` 只列出 `dist/` 与 `node_modules/`，即写入范围内的构建产物与 ESLint 缓存，以及上面的依赖恢复。检查本身没有改动被跟踪文件；本提交只更新本文档的验收勾选与完成证据。
- **Rubber-duck：** 审查本文档的完整差异与原始日志，核对 AC-02 各记录项、AC-12 的“无”、四个类型程序的退出码推断、Vitest 无跳过、弃用警告的归属，以及构建指纹仍归 05；没有阻塞或非阻塞问题。
- **文档影响：** [工程约定的命令表](../../../../engineering/README.md#命令)与 Python 测试说明仍与实际命令一致；没有新的原版事实、ADR 或接口变化，无需更新文档。本项没有实现代码，不需要 simplify。对 STATUS 与阶段索引没有改动建议。
