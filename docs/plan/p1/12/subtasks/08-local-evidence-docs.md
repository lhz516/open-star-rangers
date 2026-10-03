---
type: plan
status: active
phase: P1
task: "12"
subtask: "08"
updated: 2026-10-03
---

# 08 — 当前仓库实测、人工审阅与维护文档

**契约来源：** [Spec](../spec.md) 的 S-07；AC-08 至 AC-15。
**依赖：** 01, 02, 03, 04, 05, 06, 07。
**执行状态：** 仅由 [Goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 用当前最终源码/依赖实际运行pnpm exec vitest run tools/compliance、pnpm check及新pnpm check:compliance；记录源码版本/当前diff身份、manifest/项目锁/构建指纹、四scope counts、包/平台覆盖及实际shipped集合。
- 逐项核对当前包归属/许可全文/NOTICE与产物，验证lightningcss相关MPL是否真not-distributed；源码映射附带内容也算分发，不凭devDependency判断。检查生成LICENSE/THIRD-PARTY-NOTICES/inventory可读取且无需个人绝对路径/时间噪声。
- 人工审阅完整任务新增/修改文件、来源与网站产物（只合成/自有/合法第三方声明，不访问local）：hash只匹配manifest覆盖的完整文件，未覆盖原版、片段/转换内容与首次公开确认仍有边界。保留此人工结果，不将其包装成法律保证。
- 更新工程命令、工具指南及README使用入口：独立/聚合检查、报告字段/错误语义、实际分发判据、默认离线、忽略未跟踪规则、index分开扫描、manifest覆盖限制、P5后续公开审核。事实只链接original权威，不复制真实hash清单。
- 05站点说明/06静态声明按browser-testing仅验证相关DOM/可访问性、本地预览文件可读取，开发/生产菜单保持，不重跑P1-08/09玩法/GPU。自有server/context/fixtures清理，报告不进源码/网站。
- 按[简化](../../../../../.agents/skills/simplify/SKILL.md)只清理当前文档和必要测试接入，不把缺口留给最终验证实现。

## 不包含

不补录原版hash、不读取原版试命中，不授权发布/名称/法律结论；不建CI/云、不改private、不重做P1-01或游戏测试矩阵。

## 关键文件与契约

- 现有[工程约定](../../../../engineering/README.md)、[工具指南](../../../../guides/tools.md)、05新增README更新真实命令/输出/限制，文档updated同步。
- 本任务goal/subtask证据记录真实结果，不另建独立review报告；只读[manifest](../../../../original/manifest.md)、[政策](../../../../decisions/ADR-0008-mit-and-dependency-licenses.md)。
- 当前tools/compliance/、网站App与dist生成物为人工审阅表面；共享P1-10改动保持完整，不并行覆盖。

## 验收标准

- [x] AC-14/15：当前完整check/compliance及目标Vitest全通过，源码/锁/manifest/build身份与所有范围/平台覆盖明确。
- [x] AC-08至11：当前分发包/资源和map许可逐项对照，MPL归属有事实依据，3生成文件稳定/可读，根/站点授权边界不变。
- [x] AC-13/14：人工来源/全任务文件/产物审阅及hash能力限制记录，无原版/个人信息/秘密或用户目录读取，全部owned资源收尾。
- [x] AC-15：工程/工具/项目说明命令、JSON、链接/元数据准确，Core/Session/原版规则不变、无CI/云或阶段退出声明。

## 验证方法

目标Vitest、pnpm check、pnpm check:compliance实际运行；包文本/分发映射/完整diff与产物审阅、文档/链接检查。相关网页/静态文件按[browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)取证及按所有权清理，不用浏览器合成内容代替许可正文义务，不访问原版资源。

## 完成证据

### 当前命令、范围与输入身份

- 2026-10-03：01–07实现HEAD`4d5fa52`，本项只补production assets用例/项目路由及文档。Node22.22.0/pnpm12.8.1、Vite8.3.1/TS6.0.3、Chrome154.0.8037.95/macOS。目标`pnpm exec vitest run tools/compliance`9文件/80项通过；`pnpm check`56文件/1272项、4类型程序/lint/build通过；`pnpm --silent check:compliance`passed=true/exit0/零finding；frozen安装通过，无旧版本升级。
- 当前原版扫描worktree330/index330/untracked1/build7，全部completed；untracked仅本项production assets测试，提交后进入tracked数量，不能硬编码为长期数量。许可当前安装155精确实例，distribution6个digest产物、artifacts7个完整文件（含inventory自身）；coverage为darwin/arm64，24未安装optional由元数据/OS/CPU证明排除，未声称扫描其许可证。fixture正/负与CLI真实非零在01–07各自证据，真干净扫描不替代负向。
- 当前输入SHA256：manifest=`583e60521068ea207f2378307467ae51d845e4ee0a1113fb6dfa5543e8942dc6`；项目锁=`114caf38b6b837c32fa41a63c13eef084cf6a9bedb3b048495a005be7d3aff36`；package=`4765b9a78a4d326ce7ffb195f8db8b43d14aa9e56a3dd343da482ebb805ec9a8`。inventory240个输入的metadata checksum=`022946f1d92be7559226e45581cdb5fb57b56ca01934377d602a36b21c0ac1e0`，只是完整性校验不是签名/通过报告；固定环境同输入两次构建字节相同。
- 网站JS为index-BF0vE3hr.js（811.39kB/gzip219.50kB），SHA256=`0d6401fe467b6990e6d49aac92cc6ec630425a35f3f191cc84ab6dec1b756fea`；map=`ebca9b64c3961bf4dba0a063acc59bcb4d3c0630f5ceb7ea1132ef1cbd15be40`，58个source无compliance/E2E/yaml/SPDX工具。LICENSE.txt=`cca635a23b6457b5ea1e31bc9dc881ce335e764accbf88a5b20817080bac6db0`；THIRD-PARTY-NOTICES.txt=`ef1281bd4879a7736a0c3de0df5e0453e6de889b5ea5e8f5215c5653ff205be4`。仅既有500kB警告，不删警告来冒称义务已满足。

### 分发与全文逐项人工核对

| 实际分发包 | 精确版本/选定义务 | 本地文本核对 |
|---|---|---|
| React | 19.3.0 / MIT | 完整LICENSE、Meta版权，notice逐字包含 |
| React DOM | 19.3.0 / MIT | 完整LICENSE、Meta版权，notice逐字包含 |
| scheduler | 0.28.0 / MIT | 完整LICENSE、Meta版权，notice逐字包含 |
| Three | 0.186.1 / MIT | 完整LICENSE；包内SculptGL.LICENSE也保守保留，不冒称其examples代码在网站中 |
| Zustand | 5.0.15 / MIT | 完整LICENSE/版权，notice逐字包含 |
| Vite | 8.3.1 / MIT | 实际polyfill/preload helper归属，完整LICENSE.md汇总全文保留 |
| Rolldown | 1.2.12 / MIT | 实际runtime helper归属，LICENSE及THIRD-PARTY-LICENSE全文保留 |

- 独立按inventory输入枚举许可原文，逐包/逐文件验证全文在notice中（不只SPDX/名字）；重新从当前安装元数据及源文本生成的own/third-party结果与dist精确相等。当前notice124340 bytes，所有必要版权/多许可文本保留，根MIT＋权利边界与第三方分开。额外保守保留的包许可不被误当关联代码分发。
- lightningcss1.33.0与darwin-arm64同版本MPL-2.0不在任何实际module/asset/map来源，两个实例distributed=false/not-distributed-known-copyleft；解析器CC-BY3数据也仅Node、不分发。根据实际产物而非dev标签；没有网站MPL/CC-BY/LGPL豁免或GPL/AGPL内容。原版权利/非官方/非原版玩法及公开前确认边界保持。

### 浏览器与完整来源审阅

- browser-testing下`pnpm test:e2e compliance-text.spec.ts compliance-assets.spec.ts --project=development --project=production`3/3真实通过，隔离Chrome154/macOS、4173/4174。开发/生产rights DOM、原生Tab/Import/Return保持；生产3静态文件实际浏览器导航HTTP200、JSON/text MIME、正文可读、各7包及版权/原版权利说明齐全。assets用例明确只路由production，无skip或把dev当dist；常规应用无错误，不重跑玩法/GPU/HMR矩阵。
- 人工审阅相对获批执行基线`06816a8`的完整新增/修改文件：Node合规工具/合成测试、必要解析依赖与锁、build-only配置、根许可证/README、App静态文字、相关E2E与文档。类型/helper跟随Node工具，无Core/Runtime/Session/原版解析器/原版记录/.gitignore变化；P1-10 runner设置仍单worker/zero retry/严格端口，仅加生产assets排除规则，不改已有断言。
- 来源审阅：游戏样本均代码生成；根MIT自有、已安装第三方声明从本地许可源读取，无local/、原版bytes/decoded内容、用户存储、私人路径/秘密或研究输出进入任务文件/报告/产物。必要fixture安装只在自有临时项目、offline/ignore-scripts，所有写替换directory entry保护pnpm hardlinks；原版哈希检查不依赖用户文件或缺失研究环境。
- 能力边界保留：manifest未涵盖的文件、片段/修改/压缩/解码/转换内容与截图不由完整hash识别，仍须人工来源/完整文件与产物审阅。文档只链接[manifest](../../../../original/manifest.md)权威，不重复原版hash；本地passed不是法律/名称/clean-room或首次公开确认。
- 自有browser/context/profile/服务器按runner释放，4173/4174无监听；所有fixture自动清理，无临时生产源码编辑。合成trace与JSON只在ignored输出/会话范围，不进入网站/commit。未执行云/CI/push/部署，也未宣称P1/P5退出。
- 文档影响：工程约定/工具指南/README更新实际命令、JSON/counts、索引分开/ignored范围、失败/旧清单恢复、实际分发与人工/P5边界；无新原版事实/ADR，STATUS仅待最终行通过调整下一步。
- rubber-duck针对本项实际产物/MIME/项目路由/静态文字/代码边界核对无阻塞或需要处理的非阻塞项；Node object guard在import时无副作用，复用保持，不为一个测试新增抽象。simplify限定assets用例/config路由与文档，没有改变产品行为或重复玩法矩阵。16篇文档/265本地链接与锚点、metadata与diff-check通过，本项提交后由09复核最终持久状态。
