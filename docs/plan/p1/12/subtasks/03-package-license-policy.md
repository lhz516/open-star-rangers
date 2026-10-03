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

- [x] AC-05：真实pnpm一致性与安装集合核对有效，缺/错/env-only项目锁失败；无隐含安装/联网/包代码执行。
- [x] AC-06：数组展开保留多版本/peer身份，平台optional覆盖可审计；未知许可或必要元数据不省略。
- [x] AC-08：OR具体分支、AND全满足，站点未知/不允许/GPL/AGPL及缺LGPL证明失败，非分发MPL不冒称站点允许。
- [x] AC-13：诊断脱敏、fixtures自建并收尾；pnpm check及聚焦测试通过。

## 验证方法

新增后 pnpm exec vitest run tools/compliance/packages.test.ts tools/compliance/license-policy.test.ts；pnpm真实元数据查询与临时项目frozen错配反例结合，测试保持可离线执行。当前lightningcss最终归属与义务由04/06/08核对，不能把pnpm prod列表当证据。无浏览器/原版对照。

## 完成证据

- 2026-10-03：[packages](../../../../../tools/compliance/packages.ts)复用pnpm licenses/list（depth1000，含全部JSON分支）并按本地metadata展开versions/paths，保留exact version与peer相对instance。真实当前155个安装实例、darwin/arm64的24项未安装optional均由pnpm skipped＋锁optional＋OS/CPU不支持证明，明确不作已安装许可检查；必要缺失仍失败，不把非本机平台结果泛化。
- 跟踪package/锁先验证存在，YAML多文档只选应用importers文档；包管理器在自有临时副本做offline/frozen/lockfile-only/ignore-scripts/ignore-pnpmfile，用户树/锁不修改。再精确比installed lock importers/packages/snapshots、实际/lockfile-only图及许可查询的每个物理实例/version。缺/错/env-only、缺installed snapshot、图错配/必要包缺失及查询错误明确拒绝。只锁校验不被当安装证明。
- [SPDX政策](../../../../../tools/compliance/license-policy.ts)用已声明MIT解析器、OR记录有效分支/AND满足所有；未知、LicenseRef、unsupported exception/plus、网站MPL/GPL/AGPL及无具体LGPL证明均失败。MPL仅明确not-distributed-known-copyleft；解析器数据依赖spdx-exceptions的CC-BY-3.0仅known-attribution/non-distributed允许，网站仍拒绝，不扩宽网站政策。真正分发由04证明，未在本项根据dev标签判定。
- 必需新增开发依赖：yaml2.9.1（ISC）、spdx-expression-parse5.0.0及types4.0.0（MIT），传递SPDX IDs为CC0、exceptions为CC-BY3.0。既有依赖版本不升级；Vite/plugin/Vitest的peer锁键因yaml可选peer多一项，版本仍原值；网站产物未变。正常pnpm安装后`pnpm install --frozen-lockfile`通过，供应链策略未改。
- [packages测试](../../../../../tools/compliance/packages.test.ts)/[policy测试](../../../../../tools/compliance/license-policy.test.ts)29项通过，含当前真实查询、自有副本真实frozen错配、多版本/peer数组顺序、unsupported/unknown/SPDX matrix、meta与图/锁差异；`pnpm check`52文件/1257测试、四types/lint/build通过。
- rubber-duck建议禁止PackageAudit公共形状含absolute root，已移除该字段；只在内部Node边界由相对instance解析，JSON无私人路径。混合local许可的完整selectedLicenses不丢；peer-qualified未安装optional若无法证明仍fail-closed，不做默认豁免。simplify限定4新文件与必要manifest/锁，保留一次归一化/查询，不遍历安装目录重造pnpm。
- 文档影响检查：暂无CLI，现有工程发现/工具链继续准确，08说明平台与分发边界；没有App/Core/原版事实/ADR变更。临时frozen与合成包/Git fixtures finally清理，不执行依赖脚本，不读取local/。
