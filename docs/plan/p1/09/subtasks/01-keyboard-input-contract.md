---
type: plan
status: active
phase: P1
task: "09"
subtask: "01"
updated: 2026-10-02
---

# 01 — 键盘事件、源端口与按住状态契约

**契约来源：** [Spec](../spec.md) 的 S-02、S-05、AC-01/02/05/07/14 与“输入资格与按键规则”。
**依赖：** 无。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新建不依赖 DOM 的键盘事件记录：type 为 keydown/keyup，code 为 string，repeat/ctrlKey/altKey/metaKey/isComposing 为 boolean；规范化只读这些字段，不读 key/keyCode，不携带原生事件或时钟。
- 定义 02 的浏览器源与 03 的消费者共用的 DOM-free 端口，表达同步事件交付、资格/生命周期信号及释放所有权；不在端口内提交会话或定义 marker 规则。
- 交付通用分类与轴键状态逻辑：keyup 清状态与 preventDefault 决定分离，修饰键/composition 放行；双向键抵消；重复只确认已登记键，不能从空表重建。
- 无效输入资格或非 running 时不新增按住键；显式清空后必须新的非重复 keydown。按轴数值变化去重，不把按住表放入 Core/store/录制。
- 记录任务执行的源码起点及原有工作树，以便 06/07 检查全部任务变更，而非仅看最后未提交 diff。

## 不包含

- 具体合成映射与 Session 操作（03）。
- DOM 监听、浏览器资格读取和资源回滚（02）。
- React 接线、任何新调度/依赖/存储或原版研究。

## 关键文件与契约

- **计划新增：** `src/platform/input/keyboard-input.ts`、`src/platform/input/keyboard-input.test.ts`，当前均不存在。
- 只读参考 [MoveInput/Command](../../../../../src/core/synthetic/synthetic-scene.ts)与[键位文档 §2](../../../../engineering/keyboard-input.md#2-当前绑定表)，通用模块不导入 UI/装配。
- 后续模块只消费明确的输入源端口与纯状态逻辑，不形成全局 types/schema 或预建 Gamepad 接口。

## 验收标准

- [x] AC-01/05：真实生产规范化/分类只读约定字段；未知 code 不触发/拦截；Shift 不影响，修饰键或 composition 的 keyup 释放已有轴但不拦截。
- [x] AC-02：左右单按、同按、两种释放顺序分别得到 −1/+1/0/剩余轴值；重复或数值未变不要求再发送。
- [x] AC-07：清空、非 running 和无资格时不登记轴；空表重复事件无效，新的非重复按下有效。
- [x] AC-14：无 DOM/React/Zustand/Three.js、调度、持久化或权威世界依赖；Core/Runtime/Session 不改。
- [x] 目标测试与 `pnpm check` 通过，既有测试不删除或放宽。

## 验证方法

- `pnpm exec vitest run src/platform/input/keyboard-input.test.ts`；表驱动覆盖事件字段、分类/释放分离、轴组合与失效后的重复。
- 给生产规范化逻辑输入带不同 key/keyCode 的结构化样本，结果只随约定字段变化；不要只测手写替身。
- 本项不需要浏览器/原版对照。实现收尾按 [simplify](../../../../../.agents/skills/simplify/SKILL.md)限于本项新增端口与纯逻辑。

## 完成证据

- 2026-10-02：任务源码起点 `8638479`，开始时工作树与暂存区为空；P1-05/06/08 的 router 均为 done，最终证据已核对。本项仅新增 [keyboard-input.ts](../../../../../src/platform/input/keyboard-input.ts) 与[测试](../../../../../src/platform/input/keyboard-input.test.ts)，不改受保护模块。
- 生产规范化用抛错 getter 验证不读 key/keyCode/shiftKey；分类与按住表覆盖左右顺序、释放、修饰/输入法、无资格、非 running、重复与清空。目标 Vitest 17/17；最终 `pnpm check` 通过（44 文件 / 1111 测试、三组类型检查、lint、生产构建）。构建保留既有大 chunk 提示。
- rubber-duck 无阻断问题；采纳 bound=true/eligible=false 分类覆盖建议与 release 语义说明。位置布尔参数与函数职责一致，未引入额外 options 抽象。scoped simplify 直接核对这两个新增文件：无已有重复 helper、额外调度、可移除状态或跨层绕过，无需清理改动。
- 文档影响核对：端口尚未接入页面，不把草案提前标为已实现；工程/键位/结构指南将在 06 按整个接线结果更新。STATUS 的下一步更新为执行 P1-09；无新原版事实或冻结决定。
