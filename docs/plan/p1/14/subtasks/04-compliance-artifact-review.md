---
type: plan
status: active
phase: P1
task: "14"
subtask: "04"
updated: 2026-10-03
---

# 04 — 当前合规报告与完整产物来源审阅

**契约来源：** [Spec](../spec.md) 的 S-02、S-03、S-04；AC-08 至 AC-10、AC-14。
**依赖：** 01。
**执行状态：** 仅由 [Goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在01候选上运行 `pnpm --silent check:compliance`，实际fresh build后核对 `osr-local-compliance`/1、kind=compliance、exit/passed、七范围counts/findings、platform/arch和未安装optional覆盖、输入/产物身份。
- 核对当前实际分发清单、source map/静态产物归属、完整LICENSE/COPYRIGHT/NOTICE与三生成文件，根MIT/App权利边界不被解释为原版权利或首次公开确认。
- 对照 P1-12/08 的完整来源/全文人工证据及候选差异，检查当前输入/产物身份；未变部分记录适用性，变更部分逐文件/许可文本补审，不用机器passed替代人工判断。
- 查看P1-12现有正/负覆盖与本轮02完整测试结果（尚未执行则后由05/06结合），不重造命中/坏锁/未知许可/过期声明矩阵，不把合法pnpm多文档锁误判成缺锁。
- 保存安全报告摘要和人工审阅证据到本文件，失败明确未完成范围/原因/原责任/恢复；已定位的契约内缺陷按 [Goal 聚焦修复规则](../goal.md#按需聚焦修复)交独立修复项，修复后重新核对聚合/输入/声明和受影响人工证据，不手改产物掩盖失败。最终评审文档形成后的四范围扫描归06。

## 不包含

- 不修改manifest/原版记录、scanner、SPDX政策、build插件、生成声明、依赖或.gitignore，不联网补许可或读取ignored原版来源。
- 不扫描Git历史、秘密或变换片段作认证，不承诺法律/名称/clean-room或公开授权；生产文件浏览器可读性归03，最后仓库范围归06。

## 关键文件与契约

- 只读[CLI](../../../../../tools/compliance/cli.ts)、[报告](../../../../../tools/compliance/report.ts)、[inventory](../../../../../tools/compliance/distribution.ts)、[notices](../../../../../tools/compliance/notices.ts)、[manifest](../../../../original/manifest.md)、[LICENSE](../../../../../LICENSE)、[README](../../../../../README.md)、[App](../../../../../src/app/App.tsx)及[工具用法](../../../../guides/tools.md#本地合规)；只写本项证据/tracker。
- [P1-12/08](../../12/subtasks/08-local-evidence-docs.md#完成证据)提供实际来源/全文审阅入口；当前生成输出为 `dist/LICENSE.txt`、`dist/THIRD-PARTY-NOTICES.txt`、`dist/compliance-inventory.json`，不是计划新增或跟踪文件。
- 七范围为 worktree/index/untracked/build、dependencies/distribution/artifacts，counts是实际checked和completed；inventory自身不是签名/通过报告，原版hash只读manifest元数据。

## 验收标准

- [x] AC-08：聚合真实shape、七范围、coverage、输入/产物与退出码完整；全部completed、零findings、passed=true/exit0才支持合规通过，数量不硬编码。
- [x] AC-09：实际分发与适用全文/版权/NOTICE核对有效，根/App范围准确，人工来源/文件/完整产物审阅有证据且保留hash能力局限。
- [x] AC-10：失败或身份冲突明确影响/责任/恢复，已定位的工具/接线缺陷在本Goal独立修复项闭环；许可不明不能通过代码例外豁免，缺文本/未知来源不能忽略，未取得必需审阅不算完成。
- [x] AC-14：无本项源码/依赖/权威记录修改、无原版bytes/私人路径/秘密或机读报告入库；current dist身份记录，不手改声明保留成功指标。

## 验证方法

- 实际聚合命令与报告、inventory/全产物/包元数据/本地完整许可文本核对，声明需包含全文不是SPDX标签或链接；工具原因采用安全code/scope/相对path或package身份。
- 将候选输入/产物与P1-12证据比较；03已执行时同时核对其构建身份，尚未执行则由05/06汇合核对。必要变化须重建/重验相关项，只有本任务文档变化且输入未变不机械重跑全链。
- 浏览器不在本项重跑，production文件结果由03按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)取得并在05/06汇合，不作为本项新增前置；纯审阅，无代码 simplify。完整hash不覆盖片段/变换/未登记内容，保留人工限制及P5责任。

## 完成证据

### 当前聚合与身份

- 2026-10-03，候选 `831d231` +本Goal验证文档，`pnpm --silent check:compliance` 首次exit0；CLI内部fresh build后真实报告 `format:'osr-local-compliance', version:1, kind:'compliance', passed:true`，findings=[]，七范围全部completed。实际JSON字段及七范围经明确assert核对，不只查看passed。
- checked：worktree339/index339/untracked0/build7、dependencies155/distribution6/artifacts7；darwin/arm64，24个未安装optional明确排除、不冒称许可已查。counts随候选文件变化，339含规划文件，与P1-12历史331不是阈值冲突；新增评审和最后文档范围由06再扫。
- package/lock/manifest及240输入指纹与[P1-12/08](../../12/subtasks/08-local-evidence-docs.md#当前命令范围与输入身份)相同，inventory checksum `022946f1d92be7559226e45581cdb5fb57b56ca01934377d602a36b21c0ac1e0`；inventory自身SHA256同[03](./03-browser-exit-checks.md#完成证据)。当前JS/map/CSS/HTML及两声明digest逐一与02/03构建核对相同；LICENSE.txt `cca635a23b6457b5ea1e31bc9dc881ce335e764accbf88a5b20817080bac6db0`、THIRD-PARTY-NOTICES.txt `ef1281bd4879a7736a0c3de0df5e0453e6de889b5ea5e8f5215c5653ff205be4`。inventory元数据不是签名或合规通过报告。

### 全文、实际归属与人工来源审阅

| 当前shipped身份／选定义务 | 本地全文及历史审阅适用性 |
|---|---|
| react19.3.0 / MIT | LICENSE及Meta版权 |
| react-dom19.3.0 / MIT | LICENSE及Meta版权 |
| scheduler0.28.0 / MIT | LICENSE及Meta版权 |
| three0.186.1 / MIT | LICENSE及保守附带SculptGL.LICENSE；不声称examples分发 |
| zustand5.0.15 / MIT | LICENSE及版权 |
| vite8.3.1 / MIT | 实际modulepreload/preload helper归属；完整LICENSE.md汇总 |
| rolldown1.2.12 / MIT | 实际runtime helper归属；LICENSE和THIRD-PARTY-LICENSE |

- 当前7包共9份本地许可文件逐项核对精确版本/path/SHA256都在inventory inputs；以现有 `auditPackages`、`validateInventory`、`ownLicense`、`thirdPartyNotices`只读重建文本，assert与当前两生成文件逐字相等（1487/124340bytes），没有改dist来凑通过。许可选定义务/全文/版权/NOTICE及完整产物hash与P1-12/08人工全文审阅完全一致，故复用其已审阅全文结论，而非以本轮机器passed替代人工判断；没有新的文本/来源需要补审。
- 人工检查当前map全部58条source身份、六归属产物及七完整dist文件：仅自有合成src、实际上述运行依赖及生成helper，publicFiles=[]，无original-data/合规工具/E2E/yaml/SPDX工具进入网站。lightningcss及darwin-arm64两个1.33.0 MPL实例仍distributed=false/known-copyleft；本地解析器数据不分发，不授权网站copyleft例外，不以dev标签豁免。
- 来源/完整文件审阅：实际 `250019a..831d231` 的src/tools/e2e/config/package/lock/LICENSE/README零差异，沿P1-12/08完整任务来源审阅；逐文件审阅本Goal新增证据及完整当前diff，只含自有中文元数据/候选/统计/权威链接/代码合成观测，无原版bytes、图片/文字/音频、反编译输出、秘密或私人路径。根LICENSE全文、README/App权利范围及当前dist/LICENSE直接核对准确，private=true；未读取ignored原版来源/用户目录。
- 正/负安全边界、缺锁/文本/unknown/stale/真实CLI非零等仍由原P1-12实现/证据及[02当前全部1272测试](./02-engineering-replay-checks.md#完成证据)支持，未删/skip/放宽；合法多文档pnpm lock未误判。03完整浏览器已证明production三文件真实可读，不能代替上述来源/全文核对。
- 完整hash只能识别manifest已登记的完整文件，不识别未登记、片段、变换/压缩/解码或截图；人工审阅也不构成法律/名称、秘密扫描或严格clean-room/首次公开认证。P5后续义务不变。
- 首次聚合无失败/身份冲突或需修复项，原Vite警告保留。报告只存会话临时文件，最终删除，不入库或站点；自有离线audit临时副本自动收尾，无安装/升级、原版/用户数据/云操作。文档影响：现有工程/工具/README合规流程和能力边界准确，不需本项改指南/ADR；无实现代码，不需simplify。
- rubber-duck复核本项完整diff/报告/历史身份，无阻塞或正确性问题；其额外独立build/聚合亦同身份、全通过，不用于掩盖首次失败。tracker在审查后完成；关于须逐项commit的提示按本Goal明确无代码例外处理，先保存，06统一本地文档提交。
