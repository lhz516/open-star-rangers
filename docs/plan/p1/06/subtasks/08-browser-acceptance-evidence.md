---
type: plan
status: active
phase: P1
task: "06"
subtask: "08"
updated: 2026-10-02
---

# 08 — 浏览器验收证据

**契约来源：** [spec](../spec.md) 中 AC-01、AC-03、AC-04、AC-05、AC-09、AC-10、AC-11、AC-12、AC-13 的浏览器部分，以及“验证策略”的浏览器验证与证据边界。
**依赖：** 07。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 启动自有 Vite（端口空闲时用 `127.0.0.1:5173 --strictPort`），在隔离 Chromium context 中使用自建合成场景取得以下证据：

1. **初始与开始（AC-01）：** 初始为 idle 且无投影；start 后显示 tick=0、实际 tickRateHz，tick 随后前进。
2. **接受（AC-04）：** 在同一任务内触发 add 的真实 click 并立即读 DOM，看到 pending 与 ID；随后看到 accepted，其 tick/entity/position 与 marker 显示一致。
3. **拒绝（AC-05）：** 再次 add 得到 marker-already-exists；remove 得到 accepted；再次 remove 得到 marker-not-found；marker 显示始终与投影一致。
4. **取消与暂停（AC-03/AC-10）：** 在同一任务内依次 click add 与 pause，看到 user-pause 取消与 paused；跨真实 rAF tick 不变；resume 后继续。
5. **实际 hidden（AC-10）：** 用[已验证 CDP 路线](../../../../engineering/README.md#已验证的-cdp-自动化路线)切换标签页，看到 paused/hidden。返回可见后仍为 paused、resume 可用，显式 resume 后继续且不补跑。不得使用伪造 visibility 或合成事件。
6. **重启与退出：** restart 后 runId 更新、tick=0、反馈清空；exit 后为 idle、无投影；各状态的控件启用与 spec 一致。
7. **键盘（AC-13）：** Tab 聚焦，Enter/Space 能操作启用按钮；禁用按钮不提交；按钮外按键不触发任何游戏动作。
8. **提交计数（AC-11）：** 用临时、可还原的 Profiler 包装或等价提交计数，记录 StrictMode 初次提交基线、无关 tick 更新的增量（应为 0）与 marker 变化的增量。
9. **清理（AC-12）：** 在应用脚本前安装自有计数探针，记录待交付 rAF 请求与 visibilitychange/pagehide/pageshow 监听。
   - StrictMode 初次挂载后，最多一个 owner、一个请求、一组监听。
   - 用临时编辑让 App 暂不渲染 owner 再恢复，完成真实卸载/再挂载：卸载后为 0，恢复后不超过 1。
   - 分别临时编辑开发面板组件与 UI 桥接模块，触发 Vite 更新；若后者回退为整页重载，按实际记录并检查重载后的计数。
   - 确认旧回调不再写 store。
10. **诊断（AC-09）：** 用自有探针令一次 rAF 请求或回调失败，看到 sessionError 与 faulted，不修改生产参数或用户存储。

- 所有临时编辑必须还原，用 `git status` 与 diff 确认无残留；移除探针，dispose 自有 context，停止自有 Vite，不清除用户站点数据。
- 实际 hidden 或 HMR 观测无法取得时，本项记为 blocked，恢复条件写入 goal 执行记录。

## 不包含

- 跨引擎/Safari、真实 GPU、快捷键拦截或性能；P1-10 的项目级 runner。
- 修复功能缺陷：若发现缺口，新增修复子任务，插在 09 前。

## 关键文件与契约

- 07 交付的 [App.tsx](../../../../../src/app/App.tsx) 修改与计划新增的面板、hook 与 owner 文件（只读验证，临时编辑必须还原）。
- [工程约定的浏览器生命周期复现](../../../../engineering/README.md#浏览器生命周期复现)；如本项发现新的稳定操作步骤，更新该节。

## 验收标准

- [ ] AC-01/04/05：初始、开始、接受与两种拒绝的 DOM 观测，含 ID、事件字段与 marker 一致性。
- [ ] AC-03/10：pending、取消、暂停静止、实际 hidden→visible 仍暂停与显式继续均有真实浏览器证据。
- [ ] AC-11：无关更新增量为 0、相关更新有提交，并记录 StrictMode 基线。
- [ ] AC-12：StrictMode、卸载/再挂载与两类 HMR 更新后的计数均不超过 1，完全卸载后为 0；旧回调不再写入。
- [ ] AC-09/13：诊断错误显示，以及鼠标与键盘的控件交互均符合 spec。
- [ ] 临时编辑与探针已清理，工作区无残留；记录浏览器版本、入口、启动参数与清理结果。

## 验证方法

- browser-testing 的启动、驱动、记录与清理流程；证据按“标准、操作、预期、观测、结果”记录在本文件。
- 仅 HTTP 200、截图、旧 P1-05 探针或 Node 结果不能代替本项证据。

## 完成证据
