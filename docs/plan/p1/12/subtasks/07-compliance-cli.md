---
type: plan
status: active
phase: P1
task: "12"
subtask: "07"
updated: 2026-10-03
---

# 07 — 本地命令、聚合报告与真实失败回归

**契约来源：** [Spec](../spec.md) 的 S-05、S-06；AC-02、AC-04、AC-10、AC-12、AC-13。
**依赖：** 02, 03, 06。
**执行状态：** 仅由 [Goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新增pnpm check:original调用02覆盖当前Git四scope中的worktree/index/untracked及当前完整dist；check:licenses核对03当前依赖、06清单/声明和输入/产物指纹；check:compliance先构建当前代码再运行两个检查，任何必要失败整体非零。
- 三类机读输出严格复用01的osr-local-compliance/1、kind/passed/counts/ordered findings及指纹/依赖/分发条目；子进程Git/pnpm/build错误保留真实原因并脱敏，不因stderr/失败解析返回空集合或成功形状。
- 独立命令不偷偷构建或改安装树，不冒称聚合通过；缺/旧/被篡改inventory、遗漏/改notice、源/manifest/锁/静态资产/产物指纹改变显式拒绝。聚合构建失败也输出passed=false且非零，不复用旧成功报告。
- 使用真实临时Git/合成包/manifest/产物的CLI正/负子进程验证命中、改名、暂存反例、缺输入、许可未知/禁止、文本缺漏、pnpm/Git/build错误与报告形状；复用各负责子任务fixture，不复制扫描或策略逻辑。
- 命令默认本地离线、无安装/上传/用户存储操作，报告仅JSON或ignored test-results/compliance/。按[简化](../../../../../.agents/skills/simplify/SKILL.md)保持少量入口与组合，不造通用编排器。

## 不包含

不建CI/部署/秘密或漏洞服务，不靠exit0的pnpm列表代替政策判定；不重写02–06实现或以发现测试数量冒称完整。

## 关键文件与契约

- 计划新增 tools/compliance/cli.ts、cli.test.ts；聚合/独立kind复用同一工具入口，具体参数按Spec三个命令而非新需求。
- 现有[package.json](../../../../../package.json)新增脚本，保留check职责；tools/compliance的既有负责模块/报告为唯一实现。

## 验收标准

- [x] AC-02/04/12：真实CLI干净完成exit0，四scope命中/未完成/工具错误均非零且passed=false，原因可定位不泄内容。
- [x] AC-10/12：3命令kind正确，聚合确实先当前build再两个检查，旧/缺/变更清单拒绝、构建失败不复用旧passed。
- [x] AC-13：fixtures和读访问限定自有范围，不清用户数据、无联网/包执行探测，失败亦收尾。
- [x] 目标Vitest及pnpm check通过，机读报告字段/排序正负均验证，不只单元mock状态。

## 验证方法

新增后 pnpm exec vitest run tools/compliance/cli.test.ts；在临时项目驱动真实node入口/包脚本/构建链，断言process status与stdout JSON，不让测试自写逻辑替代工具。真实当前根全链由08执行，浏览器/原版对照不适用。

## 完成证据

- 2026-10-03：[CLI](../../../../../tools/compliance/cli.ts)与package的3命令已实际运行，original/licenses/compliance kind及osr-local-compliance/1正确；独立命令只读，聚合先失效旧指标、真实pnpm build，再两个检查，全部必需范围completed＋零finding才exit0。失败JSON保留code/范围/相对path或safe包身份，不转发stderr/bytes/secret。
- [真实子进程fixture](../../../../../tools/compliance/cli.test.ts)2个完整场景通过：聚合及两独立成功、4scope改名命中和暂存反例、源/notice变化及缺inventory拒绝、缺/坏manifest、non-Git与异常参数、LicenseRef无证明定位react@19.3.0、真正build exit9且旧inventory无、缺yaml许可JSON失败。缺yaml时原版扫描仍可运行，仅Node/Git；fixture安装仅准备，正常命令不安装。stdout无root/secret标记，fixture finally删除。
- stdout初次空白是macOS var/private-var规范路径导致entry guard不等，已用realpath canonical guard修复并实测，不将exit0无报告当成功。包政策多版本诊断在reason列全exact identities，不只首项；报告增加明确platform/arch/未安装optional覆盖，聚合重叠fingerprints去重并拒绝inter-check漂移。
- [outputs](../../../../../tools/compliance/outputs.ts)抽取原有3指标的Node-only清理供CLI/插件共用，避免原版入口提前加载许可SDK、确保build脚本在Vite启动前失败也无旧指标。许可模块按需加载，缺依赖仍生成非零机读失败；构建前清理与真正build错误分scope。没有泛化编排服务或应用后门。
- 当前根按顺序`pnpm check`→3命令全部通过：56文件/1272测试/type/lint/build；原版四范围worktree327/index327/untracked3/build7均completed，许可安装155、归属artifact6/全部文件7、24optional仅darwin/arm64明确未安装。这里是提交前观察，最终counts/身份由08取得，不硬编码数量。
- rubber-duck无阻塞，已区分cleanup/build诊断、所有多版本受影响身份及跨独立检查的防漂移注释；CLI侧清理保留，因用户build脚本可能在插件加载前失败，不能依赖Vite单一hook。simplify限定本项CLI/report/outputs与必要import/诊断窄改，复用02–06实现。
- 文档影响：工程约定/README加入已可运行命令、JSON/counts/离线与独立/聚合语义；工具指南及人工来源/产物总审阅由08完成。无Core/原版事实/策略/private或云操作变化，临时root/安装/产物安全收尾。
