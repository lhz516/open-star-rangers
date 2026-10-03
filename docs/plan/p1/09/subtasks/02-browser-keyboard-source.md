---
type: plan
status: active
phase: P1
task: "09"
subtask: "02"
updated: 2026-10-03
---

# 02 — 浏览器键盘源、资格恢复与监听回滚

**契约来源：** [Spec](../spec.md) 的 S-02/04/06、AC-01/05/07/11/12/14、技术决定 1、9、10。
**依赖：** 01。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 通过 01 端口实现生产输入源：在指定容器登记恰好一对游戏 keydown/keyup，根据消费者的同步结果处理默认行为；window/document 不登记游戏键监听。
- 初次绑定及元素 focusin/focusout、window focus/blur、visibilitychange、pagehide/pageshow 后核对容器实际聚焦、窗口焦点、visible 和离页阻断；提供事实/信号，不调用 Session 控制。
- 点击画布/黑边可使容器获得焦点；窗口恢复而没有元素 focusin 时也能重核资格。菜单、按钮、可编辑子控件不因位于页面/容器周边而成为输入区。
- 登记/资格与撤销的实际生产逻辑保持 DOM-free 可测试，浏览器文件只连接真实对象。部分登记失败逐项回滚，失败保留原 cause；回滚失败用既有 RollbackError 表达，交给 04 处理。
- 释放先逻辑失效再逐项撤销，正常释放幂等；任何晚到回调不得交付、改状态或 preventDefault。移除失败仍显式抛出，不能宣称物理释放成功。

## 不包含

- 合成命令可用性、暂停及轴提交（03）。
- owner/React 页面接线与实际浏览器全量取证（04/05）。
- 新调度、Keyboard/Pointer Lock、全屏、beforeunload、依赖或持久化。

## 关键文件与契约

- **计划新增：** `src/platform/input/keyboard-source.ts`、`keyboard-source.test.ts`、`browser-keyboard-source.ts`，均位于计划新增的 `src/platform/input/`。
- 依赖 01 将新增的 `keyboard-input.ts` 端口与规范化逻辑；Node 测试不导入 browser 文件。
- 复用 [RollbackError](../../../../../src/app/session/rollback-error.ts)；[browser-session-host.ts](../../../../../src/platform/browser/browser-session-host.ts)仅作登记/撤销模式参考，不改其 Session 生命周期契约。

## 验收标准

- [x] AC-01/05：DOM 转换与真实分类逻辑一致，普通合格绑定事件才拦截；状态释放不强制拦截放行事件。
- [x] AC-07：初始焦点、窗口恢复无 focusin、visible/hidden、pagehide/pageshow 序列都得到正确资格；恢复不凭旧按住状态建立动作。
- [x] AC-11：每次绑定仅一组监听，取消撤销全部登记项且正常重复释放无效果。
- [x] AC-12：逐个登记位置注入失败，回滚尝试覆盖已登记项；多项撤销失败均保留；失败后保留的回调完全无效。
- [x] AC-14：无全局游戏键监听或额外调度；目标测试与 `pnpm check` 通过。

## 验证方法

- `pnpm exec vitest run src/platform/input`。最小宿主替身只实现登记、撤销、资格读取与事件交付，驱动真正的生产源逻辑，不能用“假源自身抛错”代替回滚验证。
- 保存登记项、移除尝试顺序及失败集合；取消后主动调用保留回调，观察交付次数、状态和 preventDefault 均无新变化。
- 本项尚不装配演示，不声称浏览器已通过；真实 DOM 接线由 05 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)验证。收尾按 [simplify](../../../../../.agents/skills/simplify/SKILL.md)限于源与薄适配。

## 完成证据

- 2026-10-03：新增 [生产监听管理](../../../../../src/platform/input/keyboard-source.ts)、[薄 DOM 连接](../../../../../src/platform/input/browser-keyboard-source.ts)及[故障测试](../../../../../src/platform/input/keyboard-source.test.ts)。容器拥有 keydown/keyup/focusin/focusout；window 只有 focus/blur/pagehide/pageshow，document 只有 visibilitychange。点击聚焦由 04 的容器 React 接线负责，无第二套 pointer 监听。
- 使用真实 Source + 最小 Host 验证九个登记位置逐一失败时的完整回滚、全部撤销尝试、多个原始失败、初始化通知失败及保留旧回调无交付/无拦截。资格使用实时焦点/可见性事实及独立 pagehide 阻断，覆盖窗口恢复无 focusin、pageshow 无 window focus 和 repeat 不重建。
- 目标 Vitest 两文件 36/36；最终 `pnpm check` 通过（45 文件 / 1130 测试、三组类型检查、lint、生产构建，既有 chunk 提示）。本项尚未装配页面，不声称浏览器通过。
- rubber-duck 两项建议均落实：去掉冗余 windowActive 缓存，并将 RollbackError 的撤销原因保持平坦列表。scoped simplify 核对三个新增文件，抽取 drain 同时服务释放与回滚，消除冗余资格状态；无通用 helper 或额外抽象可复用。
- 文档影响：尚未接入演示，独立键位/结构说明留给 06 与最终实现一起定稿；未改变环境、命令、上游边界或原版事实。日期与证据更新，不重复 STATUS 摘要。
