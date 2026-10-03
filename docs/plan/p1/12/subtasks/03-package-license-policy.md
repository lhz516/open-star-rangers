---
type: plan
status: active
phase: P1
task: "12"
subtask: "03"
updated: 2026-10-03
---

# 03 — 依赖完整性与保守 SPDX 政策

**契约来源：** [Spec](../spec.md) 的 S-03、S-06；AC-05、AC-06、AC-08、AC-13。
**依赖：** 01。
**执行状态：** 仅由 [Goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 复用pnpm licenses list --json及包管理器直接/传递解析数据，把versions/paths数组展开保留精确name/version/peer实例与direct/transitive、当前平台optional覆盖；不新写另一套包名/许可遍历器，不按--prod做网站分发判定。
- 用包管理器自身frozen一致性核验受跟踪项目锁/manifest，另比当前安装解析，不能只用lockfile-only或node_modules存在证明安装匹配。多文档锁须识别项目文档；env-only/缺lock/错配/枚举失败拒绝。默认离线、不安装、不执行依赖代码；核验需要的临时副本由工具自有，不修改用户锁或树。
- SPDX保守判断：标准宽松与BlueOak按ADR-0008；OR选定并记录满足义务分支，AND全部满足，括号按语义解析；未知/缺失/坏表达式/无证据LicenseRef失败，不做子串判断或猜文本。必要解析能力若需开发依赖，明确声明并按宽松政策审计，不依赖偶然传递安装，不升级现有依赖。
- 分发标记由04提供而非包标签猜测；政策函数对shipped/not-distributed分别判定。已知MPL本地构建使用可明确非分发，不能网站allowlist；GPL/AGPL分发失败；LGPL须独立加载/可替换/源码获取及声明具体证据，机械无法证实时未通过、不自动加例外。
- 同项附带多版本/peer/optional、pnpm查询错误、空/未知元数据、锁错配/env-only及许可OR/AND/禁止矩阵。按[简化](../../../../../.agents/skills/simplify/SKILL.md)保持工具类型本地化。

## 不包含

不修已有根锁、不重新选MIT、不以dev标签豁免、无在线许可/漏洞服务或研究工具安装；分发归属属04、全文/NOTICE属06。

## 关键文件与契约

- 现有[package.json](../../../../../package.json)、[根锁](../../../../../pnpm-lock.yaml)、[ADR-0008](../../../../decisions/ADR-0008-mit-and-dependency-licenses.md)；根锁只因必要新增开发依赖才正常更新，既有版本不变。
- 计划新增 tools/compliance/packages.ts、packages.test.ts、license-policy.ts、license-policy.test.ts；复用01 report/test-support。

## 验收标准

- [ ] AC-05：真实pnpm一致性与安装集合核对有效，缺/错/env-only项目锁失败；无隐含安装/联网/包代码执行。
- [ ] AC-06：数组展开保留多版本/peer身份，平台optional覆盖可审计；未知许可或必要元数据不省略。
- [ ] AC-08：OR具体分支、AND全满足，站点未知/不允许/GPL/AGPL及缺LGPL证明失败，非分发MPL不冒称站点允许。
- [ ] AC-13：诊断脱敏、fixtures自建并收尾；pnpm check及聚焦测试通过。

## 验证方法

新增后 pnpm exec vitest run tools/compliance/packages.test.ts tools/compliance/license-policy.test.ts；pnpm真实元数据查询与临时项目frozen错配反例结合，测试保持可离线执行。当前lightningcss最终归属与义务由04/06/08核对，不能把pnpm prod列表当证据。无浏览器/原版对照。

## 完成证据
