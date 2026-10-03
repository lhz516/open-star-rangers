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

- [ ] AC-02/04/12：真实CLI干净完成exit0，四scope命中/未完成/工具错误均非零且passed=false，原因可定位不泄内容。
- [ ] AC-10/12：3命令kind正确，聚合确实先当前build再两个检查，旧/缺/变更清单拒绝、构建失败不复用旧passed。
- [ ] AC-13：fixtures和读访问限定自有范围，不清用户数据、无联网/包执行探测，失败亦收尾。
- [ ] 目标Vitest及pnpm check通过，机读报告字段/排序正负均验证，不只单元mock状态。

## 验证方法

新增后 pnpm exec vitest run tools/compliance/cli.test.ts；在临时项目驱动真实node入口/包脚本/构建链，断言process status与stdout JSON，不让测试自写逻辑替代工具。真实当前根全链由08执行，浏览器/原版对照不适用。

## 完成证据
