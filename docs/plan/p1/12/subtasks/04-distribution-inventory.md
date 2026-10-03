---
type: plan
status: active
phase: P1
task: "12"
subtask: "04"
updated: 2026-10-03
---

# 04 — 实际构建分发归属与 inventory

**契约来源：** [Spec](../spec.md) 的 S-03、S-04、S-06；AC-07、AC-10、AC-13。
**依赖：** 03。
**执行状态：** 仅由 [Goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 从当前Vite真实构建chunk/module、生成asset及map sourcesContent来源收集包/自有归属，映射03的精确包身份；虚拟模块须有可解释来源，不能因ID不好解析而略过。复制的public/独立资产与最终dist枚举交叉核对，未知归属失败。
- 当前无public素材系统，不预建通用资源库；若出现public文件，必须有明确自有/来源声明；合成夹具可传最小来源声明证明独立资产检测。dependencies/devDependencies仅元数据，dev包bundled仍shipped，未进入任何实际分发的包才not-distributed。
- 建立osr-distribution-inventory/1：package.json/项目lock/实际构建输入指纹、产物相对路径/digest及来源归属。输出只元数据，不包含包源/资源bytes或个人绝对路径；覆盖map/CSS/字体/WASM等实际存在文件。inventory不是检查通过报告。
- 本项实现可测试的收集器与inventory校验，不提前给现有build接入不完整声明流程；06在notice最终产出后完成清单并注册插件。inventory自身不递归算产物digest，02最终hash扫描仍查它。
- 同项真实受控Vite构建夹具证明dev包进入bundle、map附带来源、独立复制资产、未知文件及输入/产物变化过期拒绝，不能只mock一份理想bundle。按[简化](../../../../../.agents/skills/simplify/SKILL.md)复用包身份/报告。

## 不包含

不新增网站素材、SBOM服务、手写固定shipped包名单、不用单个--prod清单证明分发；声明正文与正式build接线属06。

## 关键文件与契约

- 只读[现有Vite配置](../../../../../vite.config.ts)、[package.json](../../../../../package.json)、[Node配置](../../../../../tsconfig.node.json)，03包/政策工具。
- 计划新增 tools/compliance/distribution.ts、distribution.test.ts；dist/compliance-inventory.json为06接线后的计划生成文件，非源码手写清单。

## 验收标准

- [ ] AC-07：真实构建模块/复制资产/map来源全可归属，dev包实际分发与非分发区别正确，未知拒绝。
- [ ] AC-10：inventory格式/版本/输入与产物指纹、相对来源合法；过期、篡改、遗漏拒绝，无个人路径/时间戳噪声、自digest递归。
- [ ] AC-13：仅合成包/静态资产与自有临时构建，输出无源码内容/秘密；目标Vitest及pnpm check通过。

## 验证方法

新增后 pnpm exec vitest run tools/compliance/distribution.test.ts；用本地合成包和临时Vite项目进行真正build，失配/未知资产作为负例，独立枚举最终输出。先验证collector，再由06真实接线出网站清单；无需游戏浏览器/原版内容。

## 完成证据
