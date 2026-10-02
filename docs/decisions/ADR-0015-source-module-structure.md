---
id: ADR-0015
type: adr
status: accepted
phase: all
updated: 2026-10-02
related: [ADR-0002, ADR-0006]
---

# ADR-0015：保持顶层模块，按职责细化源码目录

## 背景

P1 的合成 Core、Runtime 和会话生命周期已经形成代码边界，但文件仍主要平铺在 `src/app/` 与 `src/core/`。接下来的 [P1-06/07/09](../plan/p1/tasks.md#3-任务索引与依赖)将接入 UI、渲染与键盘消费者；[总计划 §12](../plan/master-plan.md#12-开发阶段与验收条件)还要求资源管线、真实玩法、存档及 Enhanced 表现。

小文件不等于通用工具：固定步长和事件分发属于 Runtime，随机源和状态一致性哈希属于 Core。把它们放进全局 utils 会隐藏所有权，并增加跨层依赖风险。

## 决定

1. 保留 [ADR-0002](./ADR-0002-single-vite-project.md) 的单个 Vite 项目，以及总计划的八个顶层源码模块；不拆包、不新增顶层 Runtime 或全局 utils/shared/types/services 兜底目录。
2. 顶层按架构边界组织，模块内部按职责或功能细化。Runtime 与 Session 分别放在 `app/runtime/`、`app/session/`；浏览器宿主放在 `platform/browser/`。
3. Core 的确定性设施放在 `core/determinism/`，P1 合成场景、快照和 replay 放在 `core/synthetic/`。合成契约不是正式玩法契约，保留 synthetic 命名，不通过重命名伪装通用化。
4. helper 默认留在调用者或所属模块；端口由提出需求的模块拥有，平台层提供实现，应用层装配。跨模块使用不等于没有 owner。
5. 测试与源码同目录；测试支持留在所属模块。公共入口只暴露必要契约，不建立全局 barrel。
6. P1-06 前只做独立、行为不变的路径迁移：保留文件名、导出符号、错误、数据形状、格式版本、断言和依赖。校验提取、解析器拆分、真实 Core、通用 Runtime 等留到实际需求出现时。
7. 后续结构按需落地，不创建空目录、空接口或第二套 Enhanced Core。当前结构、扩展方向和迁移对应关系由[源码结构指南](../engineering/source-structure.md)统一维护。

用户于 2026-10-02 明确要求实施 P1-06 前的独立目录重组并记录相关决定；本 ADR 细化既有模块边界，不取代 ADR-0002 或 [ADR-0006](./ADR-0006-core-returns-events.md)，也不改变阶段范围。

## 考虑过的其他方案

- **全局 utils/shared：** 文件看起来更少，但语义 owner 和纯度边界变得模糊；当前没有必须新增此模块的真实需求。
- **顶层 runtime 或独立包：** 可以形成更严格的 composition root，但当前应用内子目录已经足够，不增加顶层边界或包配置。
- **按 phase 或集中 demo 目录组织源码：** 阶段会结束，模块职责长期存在；集中 demo 还会混合纯规则与宿主副作用。
- **移动时同步泛型化和拆实现：** 会扩大行为验证范围，且正式玩法尚未提供第二个真实场景，不在此次迁移中实施。

## 后果

- 新消费者有明确的落点；Core、Runtime、Session、浏览器适配的所有权可直接从目录辨认。
- 既有递归 TypeScript、lint 与 Vitest 配置继续覆盖子目录，无需放宽检查。
- 源码及 mock 引用同步迁移，文档源码链接指向现位置；历史计划路径、执行命令与验收结论不改写。迁移校验见[迁移记录](../engineering/source-structure.md#p1-06-前迁移记录)。
- 已批准 spec 的源码链接修订会使旧 reviewed 摘要失效，删除过期标记但保留批准、S/AC 与行为契约；不伪造重新审阅或任务完成记录。后续契约修订仍走[任务工作流](../engineering/agent-workflow.md#审批与状态)。
