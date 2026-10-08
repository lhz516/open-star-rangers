---
type: plan
status: active
phase: P2
task: "12"
subtask: "12"
updated: 2026-10-07
---

# 12 — 候选身份与本地覆盖核对

**契约来源：** [spec](../spec.md) 的 S-01、[候选身份](../spec.md#候选身份)；AC-01。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 被忽略的本地脚本（计划新增 `local/research/p2-12/candidate/`），在开发者机器的 Node 中运行，不打开浏览器：
  - 复用 `local/research/p2-11/pipeline.ts` 的生产作业流程（生产目录、`openVerifiedSource` 与生产转换器），处理 `local/StarRang/cd/` 的基准 CloneCD 文件组。
  - 断言：四组都是 `group-complete`；`validatePackage(CLASSIC_P2_SLICE, …)` 为 `complete`；每个切片角色的 Asset 数满足 [`CLASSIC_P2_SLICE`](../../../../../src/content/slice-definition.ts) 的上下限与引用闭包；来源为 `original-import` 且等于 [`PRODUCTION_PACKAGE`](../../../../../src/workers/production-package.ts) 的指纹，没有合成来源或占位 Asset；`loadMission` 成功。
  - 两次运行：完整 `ContentIdentity`、按 Asset ID 排序的 payload 指纹与 `MissionSetup` 深度相同。
  - 记录候选 `{ commit, buildFingerprint, contentIdentity }`：构建指纹为 `pnpm build` 后实际分发文件的 SHA-256 清单摘要；另记 Node、OS 版本，各类 Asset 计数，作业与全包校验耗时。
- 脚本可重复运行：最终对齐（26）在最终候选上重跑；候选变化时受影响的 agent 对照随之重跑。
- 证据只记安全身份、哈希、计数与耗时，不含原版内容；输出只在 `local/`。

## 不包含

- 浏览器中的真实导入（21，由用户完成）；任务字段的独立对照（18）。

## 关键文件与契约

- [content-identity.ts](../../../../../src/content/content-identity.ts) 的 `ContentIdentity`；[completeness.ts](../../../../../src/content/completeness.ts)；[load-mission.ts](../../../../../src/core/mission/load-mission.ts)。
- 参照 [P2-11/23](../../11/subtasks/23-local-real-data-import.md) 与 [P2-11/17](../../11/subtasks/17-local-real-data-check.md) 的本地核对做法。

## 写入范围

- `local/research/p2-12/candidate/**`：候选核对脚本与输出（被忽略）。

## 验收标准

- [ ] AC-01：四组完整、全包 `complete`、角色与引用闭包满足切片定义、无合成或占位来源、`loadMission` 成功。
- [ ] 两次运行的完整内容身份、payload 指纹与 `MissionSetup` 相同。
- [ ] 候选身份、环境、计数与耗时已记录；证据不含原版内容；仓库中没有本地输出。

## 验证方法

- 在本机运行脚本，记录命令、退出码与结果摘要；再临时破坏一项断言输入（例如去掉一个组），确认脚本以非零退出码报告。
- 不涉及浏览器验证。

## 完成证据
