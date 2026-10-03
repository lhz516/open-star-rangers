---
type: plan
status: active
phase: P1
task: "12"
subtask: "09"
updated: 2026-10-03
---

# 09 — 最终全覆盖与隔离对齐（仅验证）

**契约来源：** [Spec](../spec.md) 的 S-01 至 S-07；AC-01 至 AC-15。
**依赖：** 01, 02, 03, 04, 05, 06, 07, 08。
**执行状态：** 仅由 [Goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 核验Spec全部范围/验收与01–08真实实现及证据：严格manifest、四范围与NUL/index、路径拒绝、锁/解析、保守SPDX、真实分发、全文notice、指纹/失效、CLI非零、隐私/人工审阅与权利边界。
- 核对最终树目标测试、pnpm check及pnpm check:compliance成功；若08后相关变化使证据失效重验，不套旧通过。确认report/inventory格式、counts/失败与输出义务未弱化，真扫描不代替合成负向矩阵。
- 核对01–08全完成、源/产物/包许可和文档链接/元数据、P1-10共享改动保护以及owned资源收尾，未授权的首次公开/法律/阶段退出仍不声称通过。
- 本项仅验证和记录，无新feature/CLI/plugin代码。发现缺口新增新ID修复项在本行前并作为依赖，不改旧ID/历史正确证据或放宽Spec。

## 不包含

不实现补丁、不新增资产/依赖/研究、不补原版hash、不改冻结政策、不部署/发布/push，不能用删除或忽略警告消除许可义务。

## 关键文件与契约

只读[Spec](../spec.md)、[Goal](../goal.md)、01–08完成证据、工具/根文档/当前dist；本项只写验收证据与唯一tracker。

## 验收标准

- [x] S-01至S-07、AC-01至AC-15完整覆盖、证据当前适用，正/负样本真实命中目标错误，无未完成必需范围。
- [x] 最终工具目标Vitest、pnpm check/compliance通过，报告与清单/notice有效；原版记录/Core/Runtime/Session规则、既有检查与版本不放宽。
- [x] 完整源码/产物/许可与人工审阅证据明确，只本地检查、无原版/隐私泄露与未授权外部操作，owned资源清理完成。
- [x] 01–08全完成、文档/导航准确；本项仅验证，无新代码，不冒称P1/P5退出或法律/严格clean-room保证。

## 验证方法

复核08对应最终树的命令/输出身份；失效则重跑目标Vitest、pnpm check、pnpm check:compliance与必要相关DOM核对。浏览器仅相关表面按[browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)；[简化](../../../../../.agents/skills/simplify/SKILL.md)限定本项验证文档。检查完整diff、文件清单、S/AC及依赖图，无原版或实机新实验。

## 完成证据

- 2026-10-03：实现/使用证据HEAD`250019a`，获批执行起点`06816a8`。01–08已各自完成并本地提交，所有验收框有实测；本项仅覆盖与文档核验，不提交feature/helper/plugin代码、不改变Spec或固定政策。

| 契约 | 最终对应结果 |
|---|---|
| S-01、AC-01 | [01](./01-manifest-report-contract.md#完成证据)：真表元数据全入、严格heading/header/行/size/hex/非空，坏/缺/重复拒绝；无孤立hex或local补读 |
| S-02、AC-02/03 | [02](./02-original-file-scan.md#完成证据)、[07](./07-compliance-cli.md#完成证据)：4scope完整SHA256/改名CLI非零、NUL空格/换行、暂存blob不同于worktree，dist包括map/两声明/inventory |
| AC-04 | [02](./02-original-file-scan.md#完成证据)、[06](./06-build-notices.md#完成证据)、[07](./07-compliance-cli.md#完成证据)：缺候选/Git/root/empty dist/unmerged/symlink/local/escape/读取失败均显式未完成，FD与load前安全边界不跟随禁止目标 |
| S-03、AC-05/06 | [03](./03-package-license-policy.md#完成证据)：多文档项目锁、临时offline frozen、installed snapshots/实际graph/许可实例比对，155精确peer实例及24本机未安装optional，unknown/missing不略过；无旧版本升级 |
| AC-07 | [04](./04-distribution-inventory.md#完成证据)、[08](./08-local-evidence-docs.md#完成证据)：真实Vite module/generated runtime/map/copy归属；dev包实际shipped、unused MPL明确non-shipped，未知来源真实构建拒绝 |
| AC-08 | [03](./03-package-license-policy.md#完成证据)、[04](./04-distribution-inventory.md#完成证据)、[06](./06-build-notices.md#完成证据)、[08](./08-local-evidence-docs.md#完成证据)：SPDX OR选branch/AND全部，网站未知/GPL/AGPL/无证明LGPL/MPL等失败，不根据dev标签豁免 |
| S-04、AC-09/10 | [04](./04-distribution-inventory.md#完成证据)、[06](./06-build-notices.md#完成证据)、[07](./07-compliance-cli.md#完成证据)、[08](./08-local-evidence-docs.md#完成证据)：3生成文件、实际7包所有完整许可/版权/声明全文，输入/输出/current audit校验、missing/truncated/declared NOTICE拒绝、同输入稳定、失败清旧指标、自digest不递归 |
| AC-11 | [05](./05-project-rights-text.md#完成证据)、[06](./06-build-notices.md#完成证据)、[08](./08-local-evidence-docs.md#完成证据)：根MIT/README、App可读声明及dist授权边界，private保持，无官方/原版/clean-room/首次公开法律保证 |
| S-05、AC-12 | [01](./01-manifest-report-contract.md#完成证据)、[07](./07-compliance-cli.md#完成证据)：3命令真实kind/JSON/closed counts/ordered findings，独立不rebuild，聚合先freshbuild；SDK/Git/pnpm/build/文本失败均非零，无stderr/秘密成功fallback |
| S-06、AC-13 | [01](./01-manifest-report-contract.md#完成证据)至[07](./07-compliance-cli.md#完成证据)：代码自建/合法第三方许可fixture、真实Git/Vite/CLI正负与完整读边界，Node-only工具不进网站，temp/atomic写保护共享store、finally清理，无原版/用户存储/私有输出 |
| S-07、AC-14/15 | [08](./08-local-evidence-docs.md#完成证据)：当前完整check/compliance、输入与产物hash/平台、逐份全文/全任务来源与完整产物人工审阅、3真实browser可读性、工程/工具/README命令/能力与后续确认边界 |

- **最终当前树：** 08后无实现/config/依赖变化，目标9文件/80测试、完整56文件/1272测试/type/lint/build、相关browser3项与frozen证据均仍对应最终实现；本项再次`pnpm --silent check:compliance`passed=true/exit0/零finding。全部范围worktree331/index331/untracked0/build7、安装155/distribution6/artifacts7完成，24optional不冒称已许可扫描。RootSHA/7包逐字全文/map及240输入身份在[08](./08-local-evidence-docs.md#完成证据)唯一维护，不复制另一份hash清单。
- **范围/来源与共享工作保护：** 当前完整diff仅许可/Node工具/合成回归、必要宽松开发解析依赖与锁peer更新、build-only接线、静态版权说明及相关测试/文档。Core/Runtime/Session/original-data/原版记录/.gitignore/pure/node配置均无差异，无旧测试删/skip/放宽。网站58sources无工具，CLI/Node脚本不进入App。P1-10 tracker仍done、已有runner/玩法/GPU断言未改，未为本任务重跑完整旧矩阵。
- **人工与清理：** 08完整文件/来源/产物/各许可源文本逐项审阅保留，metadata checksum不是签名/法律保证，完整文件hash不识别未覆盖原版、片段/变换内容。原版bytes/研究输出/合成截图/机读报告不入git；所有fixture/browser/context/自有server清理，相关端口释放，无临时App源码编辑、用户数据清理或云/CI/push。
- **文档影响：** 根README、工程与工具指南字段/范围/错误语义/重建步骤当前准确；STATUS在同一最终提交只改下一步为规划P1-14本地评审，P1仍进行中，不自行批准阶段切换或首次公开。无新原版事实/冻结决策，不需ADR或代码simplify。
- **最终审阅与持久化核验：** rubber-duck复核S/AC、当前hash/counts/保护路径与P1-10状态均相符，无阻塞或非阻塞问题。16篇文档/291本地链接与锚点、日期/metadata、完整diff及tracker图通过。09仅文档；标全部completed后router需done，提交后确认所有本项变化持久且工作树干净，非以accepted代替完成。会话临时JSON/链接检查脚本删除，命令本身仍可重现机读报告。
