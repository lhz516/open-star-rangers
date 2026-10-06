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

- 用导入页面替换 `src/ui/pages/ImportPlaceholderPage.tsx`（P2-11 已删除）。
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

- 修改或替换 `src/ui/pages/ImportPlaceholderPage.tsx`（P2-11 已删除）（可改名为导入页面，计划新增文件在 `src/ui/import/` 或 `src/ui/pages/`）；修改 [App.tsx](../../../../../src/app/App.tsx) 的权利与隐私文案、[compliance-text.spec.ts](../../../../../e2e/compliance-text.spec.ts)。
- 计划新增：导入页面的作业持有者 hook（`src/app/import/`）；新的 E2E 用例。
- 复用：[import-job-owner.ts](../../../../../src/app/import/import-job-owner.ts)；02–05 的持有者与文案；E2E 支持 [browser-probes.ts](../../../../../e2e/support/browser-probes.ts)、[resource-cache.ts](../../../../../e2e/support/resource-cache.ts)。

## 验收标准

- [x] AC-02：启动规则与 Worker 构造数、按钮状态、进度单调性如上。
- [x] AC-03：取消、返回与重入各 3 轮，资源回到基线，资源包与缓存不变。
- [x] AC-04（E2E）：四层失败的类别与技术细节；页面与控制台不含 `MARKER`；资源包不变。
- [x] AC-07（E2E）：真实 IndexedDB 的自动提交成功路径与一条注入失败路径。
- [x] AC-22（文案）：权利与隐私文案包含 spec 要求的声明；`compliance-text.spec.ts` 已更新并通过。
- [x] 页面只显示状态阶梯中经实际验证的状态，没有禁用词。
- [x] `pnpm check` 与开发项目的相关 E2E 通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 用合成数据、隔离 context 运行 `pnpm exec playwright test <新用例> e2e/compliance-text.spec.ts --project=development`。
- Node：`pnpm exec vitest run src/app src/ui`。完成前 `pnpm check`。
- 按 execute-goal 做 rubber-duck 与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **实现：**
  - **作业 hook：** [use-import-job.ts](../../../../../src/app/import/use-import-job.ts) 在 effect 中以端口的 Worker 工厂创建作业持有者，卸载、StrictMode 重跑与 Fast Refresh 时释放并终止 Worker。
    - 作业结束时，在持有者自己的通知中把组交给资源持有者；没有可用的资源持有者时，等下一个出现再移交，新作业开始时放弃。
    - 以页面时钟记录作业耗时，并记下本页最近作业所得资源包的持有者实例与代际。
  - **导入页面：** [ImportPage.tsx](../../../../../src/ui/import/ImportPage.tsx)
    - 控件：文件输入（`.ccd,.img,.sub,.cue`，可多选）、开始（先做空间检查，`insufficient` 时由玩家选择继续或不导入）、取消、返回；
    - 进度：阶段名、已读取 MiB 与已识别的版本，不显示百分比；
    - 结果与耗时：失败附类别与技术细节，取消附耗时；
    - 资源状态：只针对本页作业所得资源包的状态阶梯、各组状态与诊断 code、部分转换说明、保存失败与 `Save again`、任务载入失败。
  - **外壳：** [App](../../../../../src/app/App.tsx) 的 `ImportScreen` 把 hook 绑定到画面；占位页已删除。页首新增隐私说明，权利说明保留 MIT、非官方与不授予权利三项声明；菜单的导入入口说明随之更新。状态列表 [ResourceStatusList](../../../../../src/ui/import/ResourceStatusList.tsx) 与菜单共用。
  - **测试入口：** 新增 `cache=<失败码>`（第一次提交返回该失败）、`capacity=insufficient`，以及 Worker 场景 `content-invalid`（逻辑步骤抛出 `ContentContractError`，作业以 `content` 层失败）。
- **浏览器（开发项目，合成数据，[import-page.spec.ts](../../../../../e2e/import-page.spec.ts) 共 13 条）：**
  - **AC-02：**
    - 0 个文件、5 个文件、名称 256 个码元时，显示 `start/file-rules` 文案，Worker 构造数为 0；
    - 合法的切片光盘恰好构造 1 个 Worker 并终止一次；
    - 全程开始按钮禁用；进度可见阶段名（含 `Identifying the disc` 与 `Converting models and effects`）、已读取 MiB 与已识别的 `synthetic-models`，不含百分比；`data-read-bytes` 单调不减。
  - **AC-03：** `busy` 场景下进入、开始、取消、再开始、返回菜单，共 3 轮：
    - 每次取消后，该 Worker 立即终止，监听与观察器的净登记等于本页空闲时的基线，没有资源状态；
    - 每次返回菜单后，全部 Worker 已终止，净登记回到菜单基线，菜单仍为“None in this browser.”；
    - 每轮重新进入后都能启动新作业；结束时数据库中没有记录。
  - **AC-04：** 六个场景各显示正确的类别：坏文件组 `disc/file-set`、未覆盖光盘 `source/version`、损坏网格 `source/checks`、转换内容不合格 `content/default`、作业抛错 `import/internal`、Worker 入口缺失 `import/worker-start`。
    - 技术细节含 layer、code 与位置；
    - 没有资源状态与组，Worker 都已终止，页面文本、HTML 与控制台（含 Worker）都不含 `MARKER`；
    - 返回菜单后仍没有原版数据。
  - **AC-07：**
    - 完整导入后，状态依次为来源已识别、完整资源可查看、已保存（附耗时）、任务可载入 Core；四组完整；数据库中恰有预期键的包记录；菜单显示同样的状态。
    - `cache=quota-exceeded` 时为仅在内存中，附 `cache/quota-exceeded` 与“Free some space”；`Save again` 后为已保存，库中有一条包记录。
    - `capacity=insufficient` 时先显示约 11.4 MiB 与 0.0 MiB，此时开始按钮与文件输入禁用；`Do not import` 不创建 Worker，`Import anyway` 完成导入。
  - **结果对应：** 完整导入后再导入未覆盖的光盘失败时，导入页面不再显示资源状态与组，菜单仍显示先前的资源包。证伪：改回按来源 `import` 判定时，该测试失败。
- **AC-22 与禁用词：** [compliance-text.spec.ts](../../../../../e2e/compliance-text.spec.ts) 改为断言权利与隐私文案、菜单无文件输入、导入页面有 `accept` 与 `multiple` 的文件输入；[interaction-render.spec.ts](../../../../../e2e/interaction-render.spec.ts) 改为断言导入页面有文件输入。完整导入后页面不含禁用词。
- **检查：**
  - `pnpm check`：145 个文件 4,378 条测试，构建通过；
  - `pnpm test:e2e`：三个项目共 78 条通过。
- **Rubber-duck：** 三项阻塞问题与两项非阻塞问题，全部采纳：
  - 空间检查与文件更换的竞态：检查中与等待选择时禁用开始与文件输入，更换文件、开始作业使检查作废；
  - 资源持有者暂缺时结束的作业会丢组：改为等下一个持有者再移交，持有者存在前不能开始；
  - 状态阶梯把本次作业与先前持有的资源包混在一起：改为只显示本页作业所得的资源包，并补 E2E；
  - 取消结果补上耗时；
  - E2E 补上可见阶段名，以及每次取消后立即核对 Worker 终止与登记基线。
- **Simplify：** 采纳五项：
  - “未保存的完整资源包”规则抽为 `unsavedCache`，菜单与导入页面共用；
  - `consoleText` 移到 [browser-test.ts](../../../../../e2e/support/browser-test.ts) 共用（含 Worker 控制台）；
  - 空间检查改为单一的判别状态；
  - 去掉 AC-03 循环之后重复的第七个作业；
  - 切片光盘只生成一次，参数化用例改为惰性生成。

  未采纳：
  - 改由 `acceptImport` 返回代际：需要改动 02、03 的测试，`current()` 本是公开的读取口；
  - 缩小进度重渲染与合并订阅：开销可忽略；
  - 共用 Worker 探针读取与收窄测试中的观察器：只是测试细节。
- **文档影响：**
  - [工程约定](../../../../engineering/README.md)：导入页面一节；测试入口的新选项；流转中的导入页面；
  - [源码结构](../../../../engineering/source-structure.md)：新文件与 `content-invalid` 场景；
  - [键盘输入](../../../../engineering/keyboard-input.md)：导入页面的措辞；
  - [README](../../../../../README.md)：不再说导入未实现。完整的 README 与本地导入指南归 18。
