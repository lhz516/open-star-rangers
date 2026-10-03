---
type: plan
status: active
phase: P1
task: "12"
subtask: "01"
updated: 2026-10-03
---

# 01 — 权威 manifest 与报告契约

**契约来源：** [Spec](../spec.md) 的 S-01、S-05、S-06；AC-01、AC-12、AC-13。
**依赖：** 无。
**执行状态：** 仅由 [Goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 严格解析manifest镜像/游戏必需表：标题/列/行/hash/非空部分全部验证；不是全文件任意hex正则收集。不复制永久blacklist，不硬编码52；重复digest保留多个来源标签。
- 来源路径仅作元数据，绝不打开local/原版文件；真实manifest只读验证元数据，负向表/bytes由代码生成。
- 建立工具本地最小报告类型与稳定序列化：osr-local-compliance/1、kind original/licenses/compliance、passed、scope counts、有序findings（code/相对path或package身份/reason）、依赖/分发条目和输入/产物指纹。失败/未完成范围passed=false，不把未知计数默认为检查完成。
- 诊断保留错误类别/原因但不得输出原始资源/包文件内容、秘密或个人绝对路径；按根相对路径及允许package身份脱敏，独立检查不冒称聚合通过。
- 复用Node crypto SHA-256供后续工具使用（不复用Core FNV）；类型跟随工具，不建公共schema。按[简化](../../../../../.agents/skills/simplify/SKILL.md)处理本项实现。

## 不包含

文件枚举/扫描属02、包与SPDX属03、CLI退出属07；不修订原版manifest、不补录遗漏hash、不读取原版文件试命中。

## 关键文件与契约

- 只读[manifest](../../../../original/manifest.md)、[文档规则](../../../../README.md)、[Node配置](../../../../../tsconfig.node.json)。
- 计划新增 tools/compliance/manifest.ts、manifest.test.ts、report.ts、report.test.ts及test-support.ts（代码生成的临时项目/合成manifest，后续各项复用，不放真实hash样本）。

## 验收标准

- [ ] AC-01：真实必需表全进入黑名单；缺文件/缺表/空表/坏行/非64位hex明确失败，不跳过或自动重算。
- [ ] AC-12：JSON format/version/kind/passed/counts/findings满足Spec，排序稳定，无失败成功fallback或独立检查冒充聚合。
- [ ] AC-13：只有允许元数据/相对路径，错误包含原因但无私人路径/内容，fixtures自有并收尾。
- [ ] 新目标Vitest与pnpm check通过，无Core/原版记录变化。

## 验证方法

新增后用 pnpm exec vitest run tools/compliance/manifest.test.ts tools/compliance/report.test.ts，表驱动自建合法/缺失/坏结构样本及输出形状/脱敏反例；读真实manifest只比条目完整性，不使用原版bytes。工具尚未落地前不得宣称命令可用。浏览器/实机/原版对照不适用。

## 完成证据
