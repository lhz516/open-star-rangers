---
type: plan
status: active
phase: P2
task: "07"
subtask: "18"
updated: 2026-10-05
---

# 18 — CCKD 分组调色板子资源

**契约来源：** [spec](../spec.md) 的 S-03（2026-10-05 执行期修订加入的 `groups/<s>/palette`）、S-09 的 source 层；[容器子资源](../spec.md#容器子资源)、[行为与边界](../spec.md#行为与边界)、[错误码](../spec.md#错误码)；技术决定 3；AC-03 中 `groups/<s>/palette` 一项。
**依赖：** 03、04、08。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 来源

08 确认地图调色板是 CCKD 分组目录项 +0x04 指向的 768 字节 6 位 VGA 调色板，见 [cockpit §1](../../../../original/formats/cockpit.md#group-palette-and-drawing-confirmed)。原 spec 的来源格式表达不了它，spec 已按用户授权修订（见 [goal 执行记录](../goal.md#执行记录)）。本子任务实现该子资源。

## 工作范围

- **解析（扩展 [source-graphics.ts](../../../../../src/original-data/conversion/source-graphics.ts)）：** 读取第 s 个目录项的 +0x04（调色板指针）与 +0x08（字节数）。
  - slot 越界或 +0x04 为 0 → `subresource-not-found`；
  - 指针越出块，或 +0x08 不为 768 → `invalid-payload`（+0x08 是全部实例都满足的观察不变量，按有界格式检查执行）；
  - 768 字节按 DATA 的规则读取（分量不大于 63，按位复制展开），复用 `readDataPalette`，不另写颜色逻辑。
- **来源与转换：**
  - [graphics-step.ts](../../../../../src/original-data/conversion/graphics-step.ts) 接受 CCKD 的 `groups/<s>/palette`（palette）；子资源与 kind 不匹配 → `invalid-declaration`；
  - [convert-graphics.ts](../../../../../src/original-data/conversion/convert-graphics.ts) 增加相应的调色板来源，预算扣除与 DATA 调色板相同（256 项）。
- **测试：** 用合成 CCKD（目录项带调色板指针）：
  - `groups/<s>/palette` 的结果与同样 768 字节作为 DATA 整条目转换的结果逐字节相同；
  - 拒绝：+0x04 为 0、slot 越界 → `subresource-not-found`；指针越出块、+0x08 不为 768、分量为 64 → `invalid-payload`；
  - 经步骤转换（与布局、元素同一 CCKD 条目，一步只读一次）。
- **本地全量校验（AC-14 的修订部分）：** [nob-check.ts](../../../../../tools/nob-check.ts) 经同一读取器校验全部 +0x04 非零的分组调色板（基准中为 10097 slot 0、10101 slot 2 与 10103 slot 2），只输出计数与失败原因；本地运行通过。
- **文档：** 源码结构“图形转换”一节记录该子资源；[工具指南](../../../../guides/tools.md)记录 nob-check 的新校验；[cockpit §3](../../../../original/formats/cockpit.md#3-observed-counts-against-the-p2-07-limits-confirmed) 记录分组调色板的计数。

## 不包含

- 生产映射：归 [12](./12-production-cockpit-hud.md)。

## 关键文件与契约

- **修改：** [source-graphics.ts](../../../../../src/original-data/conversion/source-graphics.ts)、[convert-graphics.ts](../../../../../src/original-data/conversion/convert-graphics.ts)、[graphics-step.ts](../../../../../src/original-data/conversion/graphics-step.ts) 及其测试；[conversion.test-support.ts](../../../../../src/original-data/conversion/conversion.test-support.ts)；[nob-check.ts](../../../../../tools/nob-check.ts)；[tools.md](../../../../guides/tools.md)、[cockpit.md](../../../../original/formats/cockpit.md)。
- **事实依据：** [cockpit §1](../../../../original/formats/cockpit.md#group-directory-confirmed-structure-on-all-three-entries)。

## 验收标准

- [ ] AC-03 的 `groups/<s>/palette` 部分：结果与 DATA 整条目等价；拒绝条件分别报对应 code 与位置。
- [ ] 经步骤转换时，同一 CCKD 条目一步只读一次。
- [ ] AC-14 的修订部分：本地 nob-check 校验全部非零分组调色板并通过。
- [ ] `pnpm typecheck`、`pnpm lint` 与聚焦测试通过；源码结构已更新。

## 验证方法

- `pnpm test -- src/original-data/conversion/`。
- 测试只用代码生成的数据；本地运行 `node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB`。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
