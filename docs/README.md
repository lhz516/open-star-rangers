---
type: index
status: active
phase: all
updated: 2026-09-30
---

# 文档索引与写作约定

## 文档地图

| 位置 | 内容 | 生命周期 | 语言 |
|---|---|---|---|
| [STATUS.md](./STATUS.md) | 当前阶段、各阶段退出条件勾选表、下一步、阻塞项。**唯一的进度入口** | 活文档，随时更新 | 中文 |
| [plan/master-plan.md](./plan/master-plan.md) | 总计划：产品方向、技术选型、架构、阶段与验收 | 稳定，只能通过 ADR 修改 | 中文 |
| [decisions/](./decisions/) | 架构决策记录 `ADR-NNNN` | 只追加；被取代时标记 `superseded` | 中文 |
| [original/](./original/) | 关于原版游戏的一切知识：待确认登记表、文件清单、格式、行为规范、键位 | 参考类，核实后更新 | 见下 |
| [original/unknowns.md](./original/unknowns.md) | 待确认事项登记表 `U-###` | 活文档 | 中文 |
| [original/manifest.md](./original/manifest.md) | 原版文件清单与哈希（同时是 CI 黑名单来源） | 参考类 | 中文 |
| [original/formats/](./original/formats/) | 文件格式规范 | 参考类 | **英文** |
| [original/behavior/](./original/behavior/) | 行为规范 `B-###`，带测量方法与容差 | 参考类 | 中文 |
| [original/input/key-map.md](./original/input/key-map.md) | 原版键位与浏览器冲突表 | 参考类 | 中文 |
| engineering/ | 本项目代码的架构现状、约定、测试说明（P1 起创建） | 参考类 | 中文 |
| [guides/](./guides/) | 操作指南：环境搭建、工具用法 | 参考类 | 中文 |
| [reviews/](./reviews/) | 阶段退出评审记录 | 只追加，写完冻结 | 中文 |

仓库根目录的 [AGENTS.md](../AGENTS.md)（英文）是 coding agent 和新贡献者的入口。

## 原则

1. **一个事实只写在一处。** 原版游戏的事实写在 `original/`；总计划、STATUS 和其他文档只写结论并链接过去。
2. **按生命周期组织，而不是按阶段。** 阶段会结束，知识会一直被使用。阶段相关的内容只出现在 STATUS 和 reviews 中。
3. **改动冻结的决定必须先写 ADR**，再修改总计划。
4. **不包含原版内容。** 任何受版权保护的字节、图片、文本、音频或解码结果都不进入文档；文件名、大小、哈希、数量和结构描述可以写。

## 稳定 ID

| 前缀 | 用途 | 定义位置 |
|---|---|---|
| `U-###` | 待确认事项 | [original/unknowns.md](./original/unknowns.md) |
| `B-###` | 行为规范 | `original/behavior/B-###-<slug>.md` |
| `ADR-NNNN` | 架构决策 | `decisions/ADR-NNNN-<slug>.md` |

ID 一经分配不再复用。提交说明、代码注释和 STATUS 中引用 ID，而不是标题或文件路径。

## 文档元数据

除 `AGENTS.md` 外，每篇文档以 YAML front matter 开头：

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

## 置信度标记

研究结论逐条标记：中文文档用 **已确认 / 高概率 / 未确认**；英文文档用 **Confirmed / Likely / Unconfirmed**。每条结论注明证据：实验、文件统计、代码偏移或截图（截图只存放在 `local/`，文档中写相对路径）。
