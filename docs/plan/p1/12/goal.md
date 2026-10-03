---
type: plan
status: accepted
phase: P1
task: "12"
updated: 2026-10-03
related: [ADR-0008, ADR-0012, ADR-0015]
---

# P1-12：本地原版隔离与许可检查 — Goal

## 目标与来源

实现用户于 2026-10-03 批准的 [Spec](./spec.md) 的 S-01 至 S-07、AC-01 至 AC-15：复用manifest/Git/Node/pnpm，补齐完整文件哈希扫描、实际分发许可判定、构建声明与本地命令，以合成正/负回归证明失败真实可检出。本文件不重新定义行为，不授权公开，不将hash/工具通过当作法律许可或严格clean-room证明。

## 代码现状与前提

- [manifest](../../../original/manifest.md)为唯一黑名单事实源，目前52条镜像/游戏表hash；数量不硬编码。来源路径只作标签，不能打开原版文件；未记录hash的文件、片段/转换/压缩内容仍需人工来源与产物审阅。
- [忽略规则](../../../../.gitignore)已有local/、镜像、依赖/dist/测试输出/秘密；不修改它来掩盖已跟踪命中。扫描必须分别覆盖worktree/index/untracked/build，未忽略未跟踪文件不是已跟踪工作树的一部分。
- [package.json](../../../../package.json)已有license MIT、author Hanz、private true，无合规脚本；[pnpm-lock.yaml](../../../../pnpm-lock.yaml)为多文档，第二文档锁定全部应用/开发依赖，**无修复工作**。已安装pnpm许可证JSON为license→包数组，各包versions/paths都是数组，须保留多版本/peer身份，不能把一行当一实例。
- pnpm查询已具备MIT/Apache/BSD/ISC/BlueOak与lightningcss相关MPL元数据，尚不构成许可判断或实际分发证据；不得以 --prod 或dependencies/devDependencies区分shipped。本任务不重新选择直接依赖的MIT，不修改既有版本。
- [Vite配置](../../../../vite.config.ts)为ES2023、sourcemap true、React插件，无归属清单/notice生成；当前无public目录、根LICENSE/README或compliance工具。实际chunk/module、map附带source与复制资产都属于分发核对范围；build metadata与最终文件枚举需互相校验。
- Node工具/test目录进入现有[tsconfig.node.json](../../../../tsconfig.node.json)、[ESLint](../../../../eslint.config.js)与Vitest发现，复用[工程边界测试](../../../../tools/engineering-boundaries.test.ts)的临时项目/真实失败子进程模式，不复制边界矩阵。浏览器不导入工具。
- **计划新增：** tools/compliance/下manifest/report/scan/packages/license-policy/distribution/notices/build-plugin/CLI及邻接.test.ts、少量共用test-support；LICENSE、README.md。职责与具体文件由各subtask界定，不建公共schema/SBOM服务。

### 跨任务与环境前提

| 前提 | 完成依据与执行前核对 |
|---|---|
| P1-01工具链与隔离 | [tracker](../01/goal.md#子任务跟踪)、[最终证据](../01/subtasks/06-final-alignment.md#完成证据)；本轮路由done，执行前仍需保持完成 |
| 固定许可政策 | [ADR-0008](../../../decisions/ADR-0008-mit-and-dependency-licenses.md)、[总计划§9.2](../../master-plan.md#92-版本与配置)；MIT默认、宽松允许/LGPL条件/GPL-AGPL不分发不变，首次公开确认仍归P5 |
| 本地Git/Node/pnpm与安装解析 | [工程约定](../../../engineering/README.md)的工具链；Git能枚举候选/index blob，pnpm能查询当前直接/传递解析和frozen一致性。默认离线、不安装或执行包代码作许可探测，缺输入必须失败 |
| 许可/NOTICE全文 | 执行时从当前包本地文本获取并保留义务；缺失不能只用SPDX字段/网页链接替代、不能自动联网补齐或豁免 |
| P1-10共享表面 | 不依赖P1-10执行顺序，但package/锁/Vite/App/工程文档等共同文件顺序编辑并复核当前集合；不覆盖其改动、不硬编码规划时包数量 |

无原版文件读取、玩家存储或云/CI前提。根MIT默认文本与站点权利说明不改变首次公开确认；名称/来源/片段与法律审核不由本任务通过。站点文字/链接变更只核对相关DOM/可访问性，不重跑玩法/GPU矩阵。

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
|---|---|---|
| S-01 | 01 | 01：权威表严格解析与合成坏输入；08：当前manifest元数据 |
| S-02 | 02 | 02：四范围/路径/完整hash；07：真实CLI；08：当前扫描 |
| S-03 | 03、04 | 03：锁/安装/包身份/SPDX；04：实际分发；06、08：当前策略判定 |
| S-04 | 04、06 | 04：分发归属/指纹；06：完整notice/构建失败；08：当前产物 |
| S-05 | 01、07 | 01：报告契约；07：3命令/错误非零/聚合；08：实测 |
| S-06 | 01、02、03、04、06、07 | 各自Node合成正/负测试，07真实CLI链；09：无遗漏 |
| S-07 | 05、08 | 05：根/站点权利范围；08：工程/工具说明、人工审阅 |
| AC-01 | 01 | 01：真表全解析、坏表/空表/缺文件拒绝、不读local |
| AC-02 | 02、07 | 02：改名等四范围命中/ignored不读；07：CLI退出与报告 |
| AC-03 | 02 | 02：暂存命中后工作树改回、nested/map/声明全枚举 |
| AC-04 | 02、07 | 02：Git/文件/链接/local/越界故障，读访问审计；07：非零passed=false |
| AC-05 | 03 | 03：pnpm frozen/安装解析、env-only与错配反例，不升级 |
| AC-06 | 03 | 03：多版本/peer/平台optional身份及未知元数据拒绝 |
| AC-07 | 04 | 04：真实Vite夹具dev包/复制资产/map/未知归属与当前inventory |
| AC-08 | 03、06 | 03：SPDX OR/AND、GPL/AGPL/LGPL/MPL矩阵；06、08：当前分发义务 |
| AC-09 | 06 | 06：全文/版权/NOTICE、多许可资源、遗漏反例；08：逐项对照 |
| AC-10 | 04、06、07 | 04：输入/产物指纹；06：稳定构建/失败不留有效inventory；07：旧/缺/篡改拒绝 |
| AC-11 | 05、06 | 05：根/站点声明；06：分发文本；08：DOM/产物与授权边界 |
| AC-12 | 01、07 | 01：机读报告；07：真实CLI成功/失败链、有序原因与正确kind |
| AC-13 | 01、02、03、04、06、07 | 各项隔离fixture/路径脱敏/收尾；08、09：完整读范围与文件审阅 |
| AC-14 | 08 | 08：新compliance实际通过、输入/源码/构建身份、人工来源/产物审阅 |
| AC-15 | 08 | 08：目标Vitest/pnpm check、文档/产物/diff；09：最终全覆盖 |

全部最终由09核验；一次真实干净扫描不能代替工具负向证明。

## 子任务跟踪

状态只在此维护：pending / in-progress / blocked / completed。验收证据写subtask，不在阶段索引重复。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-manifest-report-contract.md](./subtasks/01-manifest-report-contract.md) | — | pending |
| [02-original-file-scan.md](./subtasks/02-original-file-scan.md) | 01 | pending |
| [03-package-license-policy.md](./subtasks/03-package-license-policy.md) | 01 | pending |
| [04-distribution-inventory.md](./subtasks/04-distribution-inventory.md) | 03 | pending |
| [05-project-rights-text.md](./subtasks/05-project-rights-text.md) | — | pending |
| [06-build-notices.md](./subtasks/06-build-notices.md) | 04, 05 | pending |
| [07-compliance-cli.md](./subtasks/07-compliance-cli.md) | 02, 03, 06 | pending |
| [08-local-evidence-docs.md](./subtasks/08-local-evidence-docs.md) | 01, 02, 03, 04, 05, 06, 07 | pending |
| [09-final-alignment.md](./subtasks/09-final-alignment.md) | 01, 02, 03, 04, 05, 06, 07, 08 | pending |

05不依赖扫描/包审计；02与03共用01报告契约，但不互相依赖。04需要03精确包身份；06需要04分发归属与05根文本；07组合两个检查。所有共同文件仍顺序编辑。最后一行仅验证、依赖所有其他行；发现缺口用新ID在最终行前加入修复项，保持原ID及证据。

## 执行记录

## 审批

用户于 2026-10-03 明确批准本 Goal 的完整执行计划（9 个子任务），并要求本地提交 P1-10/P1-12 规划文档。Goal 批准不代表实现完成；本轮所有子任务仍为 pending，不开始执行，不授权 push或部署。
