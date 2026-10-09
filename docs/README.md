---
type: index
status: active
phase: all
updated: 2026-10-08
---

# 文档索引与写作约定

## 文档地图

| 位置 | 内容 | 生命周期 | 语言 |
|---|---|---|---|
| [STATUS.md](./STATUS.md) | 当前阶段摘要、各阶段任务索引入口、下一步、项目级阻塞项。**项目总进度入口**，不跟踪退出条件或复制任务状态 | 活文档，随时更新 | 中文 |
| [plan/master-plan.md](./plan/master-plan.md) | 总计划：产品方向、技术选型、架构、阶段与验收 | 稳定，只能通过 ADR 修改 | 中文 |
| [plan/](./plan/) 下的 `p1/`–`p6/` | `tasks.md` 合并承载阶段计划与导航；任务号目录内的 spec、goal 与 subtasks 分别记录契约、执行状态和验收证据。P1 已拆分本地任务，P5 承接 CI/部署范围，其余阶段仍为占位 | 活文档，随阶段规划更新 | 中文 |
| [decisions/](./decisions/) | 架构决策记录 `ADR-NNNN` | 只追加；被取代时标记 `superseded` | 中文 |
| [original/](./original/) | 关于原版游戏的一切知识：待确认登记表、文件清单、格式、行为规范、键位 | 参考类，核实后更新 | 见下 |
| [original/unknowns.md](./original/unknowns.md) | 待确认事项登记表 `U-###` | 活文档 | 中文 |
| [original/manifest.md](./original/manifest.md) | 原版文件清单与哈希（同时是 CI 黑名单来源） | 参考类 | 中文 |
| [original/formats/](./original/formats/) | 文件格式规范 | 参考类 | **英文** |
| [original/behavior/](./original/behavior/) | 行为规范 `B-###`，带测量方法与容差 | 参考类 | 中文 |
| [original/input/key-map.md](./original/input/key-map.md) | 原版键位与浏览器冲突表 | 参考类 | 中文 |
| [engineering/](./engineering/README.md) | 本项目代码的结构、命令、检查规则与测试约定 | 参考类 | 中文 |
| [engineering/source-structure.md](./engineering/source-structure.md) | 当前源码目录、职责边界、后续扩展落点与历史路径迁移；决定见 ADR-0015 | 参考类 | 中文 |
| [engineering/keyboard-input.md](./engineering/keyboard-input.md) | 本项目当前构建的键位绑定、按键功能、焦点/拦截/清键规则与尚未实现的键盘能力；原版键位事实仍在 `original/input/` | 参考类 | 中文 |
| [engineering/agent-workflow.md](./engineering/agent-workflow.md) | Spec → review → goal → execute 的路径、审批、进度分工与安全边界 | 参考类 | 中文 |
| [guides/](./guides/) | 操作指南：环境搭建、工具用法 | 参考类 | 中文 |
| [guides/local-import.md](./guides/local-import.md) | 本地生产预览、原版数据导入、缓存恢复与最小资源查看器操作；实机核对清单 | 参考类 | 中文 |
| [guides/original-evidence.md](./guides/original-evidence.md) | agent 自行获取原版证据的途径与顺序、参考视频索引与取帧方法、证据限度，以及何时才请用户帮助 | 参考类 | 中文 |
| [reviews/](./reviews/) | 阶段退出评审记录 | 只追加，写完冻结 | 中文 |

仓库根目录的 [AGENTS.md](../AGENTS.md)（英文）是 coding agent 和新贡献者的入口。

## 原则

1. **一个事实只写在一处。** 原版游戏的事实写在 `original/`；总计划、STATUS 和其他文档只写结论并链接过去。
2. **长期知识按生命周期组织，执行计划按阶段组织。** 阶段会结束，知识会一直被使用。阶段计划与任务文档放在 `plan/p1/`–`plan/p6/`，不把原版知识、工程约定或指南搬入阶段目录；STATUS 只写阶段摘要与导航，goal 管 subtask 状态，subtask 文档记录验收过程与证据，阶段评审依据总计划给出退出判定。见 [ADR-0014](./decisions/ADR-0014-status-summary-only.md)。
3. **改动冻结的决定必须先写 ADR**，再修改总计划。
4. **不包含原版内容。** 任何受版权保护的字节、图片、文本、音频或解码结果都不进入文档；文件名、大小、哈希、数量和结构描述可以写。

## 稳定 ID

| 前缀 | 用途 | 定义位置 |
|---|---|---|
| `U-###` | 待确认事项 | [original/unknowns.md](./original/unknowns.md) |
| `B-###` | 行为规范 | `original/behavior/B-###-<slug>.md` |
| `ADR-NNNN` | 架构决策 | `decisions/ADR-NNNN-<slug>.md` |
| `P<阶段号>-<任务号>` | 阶段任务，例如 `P1-01` | `plan/p1/01/` 中的 spec、goal 与 subtasks |

ID 一经分配不再复用。提交说明、代码注释和 STATUS 中引用 ID，而不是标题或文件路径。

## 文档元数据

`docs/` 中每篇文档以 YAML front matter 开头（agent 指令、skill 模板和 `openai.yaml` 使用各自格式）：

```yaml
---
id: B-001            # 有稳定 ID 的文档才填
type: plan | status | adr | review | register | manifest | format | behavior | guide | index
status: draft | active | verified | accepted | superseded
phase: P0            # 主要相关阶段，或 all
updated: 2026-09-30  # 最后一次实质修改的日期
related: [U-001, ADR-0002]
---
```

- `verified`：内容已用证据核实（格式文档在全部原版文件上验证通过、行为规范完成测量）。
- `superseded`：已被取代，正文开头注明取代者。
- spec 与 goal 的 `draft` / `accepted` 表示待批准 / 用户已批准，不表示实现完成；subtask 状态只写 goal tracker。可用 `task: '01'` 和 `subtask: '02'` 补充任务编号。spec 另有 `reviewed: sha256:…`，由 review-spec 完成审阅后用 `tools/task-state.ts --mark-reviewed` 写入，是所审阅文本的哈希，之后任何修改都会让它失效；不得手写，也不表示批准。细则见[任务工作流](./engineering/agent-workflow.md#审批与状态)。

## 置信度标记

研究结论逐条标记：中文文档用 **已确认 / 高概率 / 未确认**；英文文档用 **Confirmed / Likely / Unconfirmed**。每条结论注明证据：实验、文件统计、代码偏移、截图（截图只存放在 `local/`，文档中写相对路径）或参考视频的时间点（置信度上限见[原版证据获取](./guides/original-evidence.md#证据限度)）。
