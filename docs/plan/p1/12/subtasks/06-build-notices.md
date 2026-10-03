---
type: plan
status: active
phase: P1
task: "12"
subtask: "06"
updated: 2026-10-03
---

# 06 — 构建声明、最终清单与失败传播

**契约来源：** [Spec](../spec.md) 的 S-04、S-06；AC-08、AC-09、AC-10、AC-11、AC-13。
**依赖：** 04, 05。
**执行状态：** 仅由 [Goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 结合03政策与04真实分发归属，读取本地实际shipped包/资源的LICENSE/版权与必要NOTICE、多许可资源义务；保留所需完整正文，不只有SPDX标签/链接、不只四个直接依赖。缺文本/归属/不允许义务均拒绝。
- 新增Vite构建插件接线，pnpm build生成dist/LICENSE.txt、THIRD-PARTY-NOTICES.txt与最终compliance-inventory.json；自有文本来自05，第三方按package@version稳定排序，生成声明及其指纹纳入最终产物集合。
- 实际模块/复制资产/map和最终dist一致，inventory不含自己的产物digest但最终原版hash扫描查它；分发元数据不成为passed证明。保持现有ES2023/sourcemap/React/Vitest配置与pnpm check链。
- 构建生成/许可错误传播为非零，不保留可被误认有效的旧声明/inventory或成功标记。仅管理本次构建的明确输出，不清用户目录或依赖。
- 测试真实构建带NOTICE/多许可包、空/缺许可文本/缺包/政策不允许/写入失败、成功后再失败、连续同输入输出稳定与无私人路径/时间噪声。按[简化](../../../../../.agents/skills/simplify/SKILL.md)检查本项插件/生成逻辑。

## 不包含

不联网抓许可或执行包代码探测、不加入网站MPL例外、不豁免LGPL证据、不修改MIT/private、不发布。CLI聚合由07实现。

## 关键文件与契约

- 计划新增 tools/compliance/notices.ts、notices.test.ts、build-plugin.ts、build-plugin.test.ts；复用03 packages/license-policy、04 distribution与05根LICENSE。
- 现有[Vite配置](../../../../../vite.config.ts)注册仅构建侧插件；若需声明必要依赖只正常修改[package](../../../../../package.json)/[锁](../../../../../pnpm-lock.yaml)，不升级既有版本。
- dist/LICENSE.txt、dist/THIRD-PARTY-NOTICES.txt、dist/compliance-inventory.json均计划生成，不作为静态手工名单入库；不把工具导入App。

## 验收标准

- [x] AC-08/09：实际shipped所有包/资源完整许可/版权/NOTICE正确；缺漏或政策失败构建明确失败，MPL当前归属有证据。
- [x] AC-10：当前build完整生成3文件，连续同输入顺序稳定，notice在产物指纹内，自digest不递归，无私人路径/时间噪声。
- [x] AC-10/11：成功后失败不留有效旧清单/成功标记，自有与第三方权利文本分开且符合05边界。
- [x] AC-13：本地合成夹具与声明文本，无原版读取；目标Vitest、真实pnpm build、pnpm check通过。

## 验证方法

新增后 pnpm exec vitest run tools/compliance/notices.test.ts tools/compliance/build-plugin.test.ts；临时Vite项目真实成功/失败子进程，逐包逐文本核对和两次构建比较，不只mock输出。当前网站build及静态文件读取由08最终取证，浏览器范围仅声明可读取性，无玩法重验。

## 完成证据

- 2026-10-03：[notices](../../../../../tools/compliance/notices.ts)/[build-plugin](../../../../../tools/compliance/build-plugin.ts)接入现有Vite build-only插件，ES2023/sourcemap/React/Vitest/check职责保留。根MIT全文＋权利边界和第三方全文分开；7个实际shipped包各自LICENSE/COPYRIGHT及Rolldown THIRD-PARTY-LICENSE、Vite完整汇总文本保留，声明124340 bytes。lightningcss与darwin-arm64的MPL来源均不分发，有实际模块/map清单证据。
- 当前正常build生成LICENSE.txt/THIRD-PARTY-NOTICES.txt/compliance-inventory.json；6个artifact digest含两声明，不递归digest inventory自身；238个输入含包/锁/module/工具/根LICENSE/声明原文。排序稳定、无生成时间/私人路径；当前声明读文本在许可模板基础完整性、copyright、metadata hash及publisher显式files声明上fail-closed，不冒称法律或包真实性保证。
- [7项目标测试](../../../../../tools/compliance/notices.test.ts)/[插件测试](../../../../../tools/compliance/build-plugin.test.ts)通过：完整MIT AND Apache及plural NOTICE逐字保留，缺/空/截短/版权/包/声明NOTICE/私人路径拒绝，重复真实Vite build输出相等、篡改self-recursion拒绝；成功后缺许可/无map配置/真实local import/IO collision均失败并移除3旧指标。真实Vite CLI成功后缺模块非零，三个指标全无。
- fixtures实际离线安装声明的当前锁依赖，用的是合成页面/Git/manifest及合法第三方许可文本，不接触原版；安装仅测试准备，正常工具不安装。fixture写入采用temp＋rename防止改动pnpm-store共享hardlink；清理finally删除自有目录。load前安全路径拒绝local/symlink/外部，写前重读输入，IO失败保留原因及清理失败类别。
- 实际`pnpm build`通过、连续构建3声明字节相同；`pnpm check`55文件/1270测试、四types/lint/build通过。rubber-duck无阻塞，已把stale temp明确拒绝、不误作清理；CLI失败断言收紧为全部3指标，补无map配置/明确NOTICE及加载隔离等相关负向。simplify限定插件/声明/测试及test-support窄改，复用04 collector/validator和03政策，不增加素材系统。
- 文档影响：工程约定新增真实构建声明、离线/分发/失败边界；根README暂不宣称尚未实现CLI，08补长期命令与读取证据。原版/Core/Runtime/Session规则和冻结政策不变，网站只有05静态声明文字，工具不进入客户端。
