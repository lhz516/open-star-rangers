---
type: index
status: active
phase: all
updated: 2026-10-02
---

# 架构决策记录（ADR）

记录重要决策的背景、选择与后果。只追加不改写：决策被推翻时，新写一条 ADR，并把旧 ADR 的 `status` 改为 `superseded`，在正文开头注明取代者。修改总计划中“冻结”的内容，必须先有对应的 ADR。

新建时复制 [_template.md](./_template.md)，编号取下一个未使用的 `ADR-NNNN`。

| ID | 标题 | 状态 |
|---|---|---|
| [ADR-0001](./ADR-0001-document-structure.md) | 文档结构与进度跟踪 | accepted |
| [ADR-0002](./ADR-0002-single-vite-project.md) | 单个 Vite 项目，不用 monorepo | accepted |
| [ADR-0003](./ADR-0003-disc-image-primary-import.md) | 光盘镜像为主要导入源 | accepted |
| [ADR-0004](./ADR-0004-keyboard-mouse-original-keys.md) | 首版只支持键鼠，默认保留原版键位 | accepted |
| [ADR-0005](./ADR-0005-video-music-interface-first.md) | 视频与音乐只冻结接口，实现由 spike 决定 | accepted |
| [ADR-0006](./ADR-0006-core-returns-events.md) | Core 通过 `step()` 返回事件，Event Bus 归 Runtime | accepted |
| [ADR-0007](./ADR-0007-narrow-p2-overlap-p3.md) | P2 收窄为玩法所需资源，P2 与 P3 可重叠 | accepted |
| [ADR-0008](./ADR-0008-mit-and-dependency-licenses.md) | 默认 MIT 许可证与依赖许可证政策 | accepted |
| [ADR-0009](./ADR-0009-window-scaling-widescreen.md) | 窗口自适应：等比缩放为默认，宽屏为可选 | accepted |
| [ADR-0010](./ADR-0010-phase-task-documents.md) | 阶段计划与任务文档 | superseded by ADR-0011 |
| [ADR-0011](./ADR-0011-spec-goal-workflow.md) | Spec、Goal 与分层任务跟踪 | accepted |
| [ADR-0012](./ADR-0012-local-p1-defer-ci-deployment.md) | P1 只做本地验证，CI 与部署移至 P5 | accepted |
| [ADR-0013](./ADR-0013-task-graph-orchestration.md) | 用确定性路由编排任务工作流图 | accepted |
