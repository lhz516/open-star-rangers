---
type: plan
status: active
phase: P2
task: "11"
subtask: "07"
updated: 2026-10-06
---

# 07 — 导入页面

**契约来源：** [spec](../spec.md) 的 S-02、S-04（自动提交的浏览器路径）、S-12（作业所有权）、S-13（页面文案）、AC-02、AC-03、AC-04（E2E）、AC-07（E2E）、AC-22（权利与隐私文案），以及[行为与边界](../spec.md#行为与边界)中从选择文件到缓存提交的各行。
**依赖：** 04, 05, 06。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 用导入页面替换 [ImportPlaceholderPage.tsx](../../../../../src/ui/pages/ImportPlaceholderPage.tsx)。
  - **文件：** 文件选择控件，`accept` 为 `.ccd,.img,.sub,.cue`，可多选；显示启动规则说明。
  - **开始：** 调用作业持有者的 `start`；`invalid-files` 时显示说明，不创建 Worker。开始前做建议性的空间检查，结果为 `insufficient` 时先提示所需与可用空间，用户可以继续。
  - **进度：** 显示阶段名、已读取 MiB 与已识别的版本标识，不显示百分比；运行中开始按钮禁用，取消可用。
  - **结果：** 显示 `finished`、`failed`、`cancelled` 的结果摘要与作业耗时；失败经 05 的文案显示类别与技术细节。
  - **移交：** `finished` 后把 `takeGroups()` 的结果交给资源持有者，并显示状态阶梯：部分转换（每组状态与诊断 code）、完整资源可查看、正在保存、已保存、仅在内存中（附 code）、任务载入结果。
- **作业所有权：** 作业持有者归导入页面，经 hook 创建，Worker 用应用端口的工厂。离开页面、卸载、StrictMode 重跑或 Fast Refresh 时释放持有者，并终止进行中的 Worker。缓存提交由资源持有者负责，不因离开页面而中断。
- **文案：**
  - 更新权利与隐私文案：原版数据只在本浏览器中读取、转换与保存，不上传；MIT 不覆盖原版内容，不是官方产品，不授予原版权利。
  - 按新页面更新 [compliance-text.spec.ts](../../../../../e2e/compliance-text.spec.ts)，它原先断言占位文字与“没有文件输入”。
- **开发项目 E2E**（测试入口，合成数据）：
  - 启动规则：0 个、5 个文件、名称超过 255 个单元时，Worker 构造数不变，页面显示说明；合法文件组恰好构造 1 个 Worker，开始按钮禁用，已读取 MiB 不减少；
  - 取消、返回菜单与重新进入各 3 轮：Worker 都已终止，监听与观察器的净登记回到基线，资源包与缓存条目不变，之后可以启动新作业；
  - 四层失败各至少一个场景：坏光盘、未覆盖文件、损坏网格、作业抛错、Worker 入口缺失。页面显示类别与技术细节，页面文本与控制台不含 `MARKER`，资源包不变；
  - 合成完整包导入后自动提交到真实 IndexedDB，状态为“已保存在本浏览器”，缓存探针读到该键的包记录；
  - 注入失败缓存的一条路径：显示“仅在内存中”与 code，重试成功后为“已保存”。

## 不包含

- 刷新恢复、改写与删除数据库（12）；Fast Refresh（13）；生产预览（14）；查看器（11）。

## 关键文件与契约

- 修改或替换 [ImportPlaceholderPage.tsx](../../../../../src/ui/pages/ImportPlaceholderPage.tsx)（可改名为导入页面，计划新增文件在 `src/ui/import/` 或 `src/ui/pages/`）；修改 [App.tsx](../../../../../src/app/App.tsx) 的权利与隐私文案、[compliance-text.spec.ts](../../../../../e2e/compliance-text.spec.ts)。
- 计划新增：导入页面的作业持有者 hook（`src/app/import/`）；新的 E2E 用例。
- 复用：[import-job-owner.ts](../../../../../src/app/import/import-job-owner.ts)；02–05 的持有者与文案；E2E 支持 [browser-probes.ts](../../../../../e2e/support/browser-probes.ts)、[resource-cache.ts](../../../../../e2e/support/resource-cache.ts)。

## 验收标准

- [ ] AC-02：启动规则与 Worker 构造数、按钮状态、进度单调性如上。
- [ ] AC-03：取消、返回与重入各 3 轮，资源回到基线，资源包与缓存不变。
- [ ] AC-04（E2E）：四层失败的类别与技术细节；页面与控制台不含 `MARKER`；资源包不变。
- [ ] AC-07（E2E）：真实 IndexedDB 的自动提交成功路径与一条注入失败路径。
- [ ] AC-22（文案）：权利与隐私文案包含 spec 要求的声明；`compliance-text.spec.ts` 已更新并通过。
- [ ] 页面只显示状态阶梯中经实际验证的状态，没有禁用词。
- [ ] `pnpm check` 与开发项目的相关 E2E 通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 用合成数据、隔离 context 运行 `pnpm exec playwright test <新用例> e2e/compliance-text.spec.ts --project=development`。
- Node：`pnpm exec vitest run src/app src/ui`。完成前 `pnpm check`。
- 按 execute-goal 做 rubber-duck 与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
