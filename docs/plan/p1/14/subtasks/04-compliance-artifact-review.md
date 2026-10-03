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

- [ ] AC-08：聚合真实shape、七范围、coverage、输入/产物与退出码完整；全部completed、零findings、passed=true/exit0才支持合规通过，数量不硬编码。
- [ ] AC-09：实际分发与适用全文/版权/NOTICE核对有效，根/App范围准确，人工来源/文件/完整产物审阅有证据且保留hash能力局限。
- [ ] AC-10：失败或身份冲突明确影响/责任/恢复，已定位的工具/接线缺陷在本Goal独立修复项闭环；许可不明不能通过代码例外豁免，缺文本/未知来源不能忽略，未取得必需审阅不算完成。
- [ ] AC-14：无本项源码/依赖/权威记录修改、无原版bytes/私人路径/秘密或机读报告入库；current dist身份记录，不手改声明保留成功指标。

## 验证方法

- 实际聚合命令与报告、inventory/全产物/包元数据/本地完整许可文本核对，声明需包含全文不是SPDX标签或链接；工具原因采用安全code/scope/相对path或package身份。
- 将候选输入/产物与P1-12证据比较；03已执行时同时核对其构建身份，尚未执行则由05/06汇合核对。必要变化须重建/重验相关项，只有本任务文档变化且输入未变不机械重跑全链。
- 浏览器不在本项重跑，production文件结果由03按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)取得并在05/06汇合，不作为本项新增前置；纯审阅，无代码 simplify。完整hash不覆盖片段/变换/未登记内容，保留人工限制及P5责任。

## 完成证据
