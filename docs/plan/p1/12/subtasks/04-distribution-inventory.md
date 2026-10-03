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

- [x] AC-07：真实构建模块/复制资产/map来源全可归属，dev包实际分发与非分发区别正确，未知拒绝。
- [x] AC-10：inventory格式/版本/输入与产物指纹、相对来源合法；过期、篡改、遗漏拒绝，无个人路径/时间戳噪声、自digest递归。
- [x] AC-13：仅合成包/静态资产与自有临时构建，输出无源码内容/秘密；目标Vitest及pnpm check通过。

## 验证方法

新增后 pnpm exec vitest run tools/compliance/distribution.test.ts；用本地合成包和临时Vite项目进行真正build，失配/未知资产作为负例，独立枚举最终输出。先验证collector，再由06真实接线出网站清单；无需游戏浏览器/原版内容。

## 完成证据

- 2026-10-03：[distribution](../../../../../tools/compliance/distribution.ts)依据实际chunk.modules、renderedLength、source-map来源、资产originalFileNames/CSS输入与显式public归属收集器；未知virtual/generated/public/package来源拒绝。数据只保留project/package/generator归属与相对输入/digest，不包含源码或个人路径。
- 当前网站一次真实writeBundle捕获4产物、220输入（含配置/manifest额外指纹），实际shipped为React、React DOM、scheduler、Three、Zustand及**Vite/Rolldown**：后两者的modulepreload-polyfill/runtime实际有代码，不因dev标签排除。当前lightningcss/MPL不在任何分发来源；最终notice/正式插件属06，未提前生成成功声明。
- osr-distribution-inventory/1包含inputs/artifacts/dependencies/publicFiles/platform可审计范围、稳定metadata checksum（不当签名/法律保证）；自身不算artifact digest。验证当前输入/输出文件集/hash、public新增、声明包/实际来源/策略标志及当前audit指纹，过期/篡改/遗漏拒绝。
- [6项真实Vite fixture测试](../../../../../tools/compliance/distribution.test.ts)通过：dev包代码/map分发、独立public有/无归属、checksum与即使重算checksum后的假non-shipped拒绝、输入/产物改变、未知文件/virtual/generated资产、网站GPL实际拒绝；dynamic split＋CJS interop真实生成3种已知helper且均归工具包，未导入MPL包明确non-distributed。重复输入inventory完全相等，自有fixture finally删除。
- rubber-duck发现新dynamic build还会有vite/preload-helper、已支持helper正例及non-shipped反例未覆盖，已增加精确归属规则与真实场景；没有把未知ID按前缀泛化为允许。self-recursion/声明产物由06继续覆盖。simplify限定collector/validator及测试，复用03实例/策略、01hash/source类型和02安全路径，不建素材/SBOM系统。
- `pnpm check`通过（53文件/1263测试、type/lint/build），生产源码/配置尚未变化。工程命令仍准确，暂无正式声明插件/CLI，本项只补证据；08维护长期分发判据，无新原版事实/ADR/阶段结论。
