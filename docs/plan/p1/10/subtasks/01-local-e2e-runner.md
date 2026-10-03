---
type: plan
status: active
phase: P1
task: "10"
subtask: "01"
updated: 2026-10-03
---

# 01 — 本地 runner 与工程接入

**契约来源：** [Spec](../spec.md) 的 S-01、S-05；AC-01、AC-11、AC-12。
**依赖：** 无。
**执行状态：** 仅由 [Goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新增仅开发依赖 @playwright/test 与独立配置，开发/生产普通Chromium、开发headed生命周期3个项目入口；workers=1、retries=0、顺序执行，报告写ignored目录。默认使用已有兼容浏览器并支持显式executable，不写个人路径、不自动下载。
- 接入计划命令 pnpm test:e2e：先构建当前代码再启动runner；自建开发/生产服务器使用明确origin/端口所有权，不默认复用占用端口。启动/断言/构建失败与缺浏览器明确非零，finally/runner teardown收尾自有资源。
- 新建E2E tsconfig（Node runner＋浏览器evaluate所需DOM），接入typecheck；lint发现E2E/config并排除生成报告。不改变tsconfig.core/node的无DOM环境，Vitest仍只发现src/tools .test.ts。
- bootstrap以现有菜单证明两个普通项目运行实际用例；headed用例由06补齐。聚焦配置正/负回归只验证新增接入，不复制原边界矩阵。按[简化](../../../../../.agents/skills/simplify/SKILL.md)清理本项范围。

## 不包含

资源探针与玩法断言属02–06；不修复根锁、不升级Node/pnpm/TS/Vite、不自动下载浏览器、不建设CI或P1-12工具。

## 关键文件与契约

- 现有[package.json](../../../../../package.json)、[pnpm-lock.yaml](../../../../../pnpm-lock.yaml)、[eslint.config.js](../../../../../eslint.config.js)：新增依赖/脚本/配置覆盖，保留供应链策略。
- 只读[tsconfig.base.json](../../../../../tsconfig.base.json)、[tsconfig.node.json](../../../../../tsconfig.node.json)、[Vite配置](../../../../../vite.config.ts)、[边界测试](../../../../../tools/engineering-boundaries.test.ts)：复用配置习惯，不扩大Node/Vitest发现。
- 计划新增 playwright.config.ts、tsconfig.e2e.json、e2e/bootstrap.spec.ts、e2e/support/environment.ts、tools/e2e-configuration.test.ts；后者只依赖Node/真实配置，不传递导入DOM浏览器helper。

## 验收标准

- [x] AC-01：bootstrap在开发/生产实际通过；3项目配置可发现、类型/lint识别E2E，普通Vitest不发现.spec.ts。
- [x] AC-01：包管理器正常更新多文档根锁，pnpm install --frozen-lockfile通过；无既有工具链升级或策略放宽。
- [x] AC-11：配置夹具的错误断言、构建/启动失败和无效executable均非零、含场景/原因，无skip或成功fallback；占用端口不复用其他项目。
- [x] AC-12局部：pnpm check及聚焦配置测试通过，自有进程/profile/context失败亦收尾；不把bootstrap当作完整E2E验收。

## 验证方法

使用已有 pnpm exec vitest run tools/e2e-configuration.test.ts（文件新增后）、pnpm check；新增runner落地后用实际选择器跑bootstrap，并检查3项目列表。夹具在自有临时目录驱动真实子进程，finally清理，不改用户源码。浏览器准备、隔离与错误观察按[browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)，无原版或实机对照。

## 完成证据

- 2026-10-03：新增 [配置](../../../../../playwright.config.ts)、[独立类型程序](../../../../../tsconfig.e2e.json)、[环境参数](../../../../../e2e/support/environment.ts)、[bootstrap](../../../../../e2e/bootstrap.spec.ts)、[配置回归](../../../../../tools/e2e-configuration.test.ts)。仅加入 Apache-2.0 的 @playwright/test 1.63.0 及 playwright/playwright-core；既有锁定版本、供应链策略和生产源码不变。
- `pnpm exec vitest run tools/e2e-configuration.test.ts`：7项通过，真实子进程验证断言失败、构建/启动前提退出7、missing executable和占用HTTP origin均非零且带原因；原占用fixture服务器仍响应，临时目录finally清理。VS Code测试发现入口未找到新增文件，改用仓库Vitest runner。
- `pnpm test:e2e bootstrap.spec.ts --project=development --project=production`：2项实际通过，Chrome 154.0.8037.95/macOS，1280×800/DPR1，origin为4173/4174；每项environment附件记录版本、origin、project。3项目配置可发现，headed实测属于06。
- `pnpm install --frozen-lockfile`通过；`pnpm check`通过（4类型程序、ESLint、47文件/1192测试、build）。网站仍为 index-BWtf9nnJ.js，811.01kB；仅既有500kB警告。runner结束后4173/4174无监听，失败fixture的自有进程已退出，不下载浏览器、不访问用户profile。
- rubber-duck审阅本项完整文件范围，无阻塞发现。simplify限定上述当前diff及新文件，复用现有配置/fixture习惯，没有必要增加抽象或改生产代码。
- 文档影响：更新[工程约定](../../../../engineering/README.md)的四类型程序、独立命令、浏览器与端口/产物所有权；源码结构/阶段摘要/原版事实及ADR暂未变化，完整覆盖映射由07维护。
