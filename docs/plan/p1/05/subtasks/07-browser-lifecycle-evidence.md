---
type: plan
status: active
phase: P1
task: "05"
subtask: "07"
updated: 2026-10-02
---

# 07 — 真实 Chromium 生命周期证据

**契约来源：** [spec](../spec.md) 的 S-03、S-04、S-06、S-08，AC-03、AC-07、AC-09、AC-13、AC-14（真实适配/使用文档）。
**依赖：** 03, 06。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 用已实现的 host/session 公共 API 在隔离 Chromium 加载临时 DOM 合成探针，显示 phase/runId/tick/error 和只读帧视图，不接生产 App/main、不增加正式演示页面。
- 在 host 创建前记录其 add/removeEventListener 和 request/cancel，验证实际三份监听与唯一请求；真实 rAF 驱动 tick，pause 后 tick 稳定、resume 明确重锚且无回退。
- 重复 start/pause/resume/restart/exit→start/dispose→新 owner，旧回调/旧句柄不影响新运行；使用计数和公开 projection，不以 HTTP 成功或 Canvas 存在作证。
- 切换实际标签页/窗口取得真实 hidden，返回 visible 后不自动继续，记录 document.visibilityState。工具做不到时须用户手动浏览器观测；都不可得则保留 blocked，不免除 AC-13。
- pagehide/pageshow 用浏览器事件探针确认绑定与离页阻断，明确不证明 BFCache。正常 dispose 后三个监听逐一撤销，停止帧通知。
- 在完成证据记录 origin/引擎、setup/action/expected/observed/result、清理；更新实际复现操作说明，不把临时探针提交成产品。

## 不包含

- 不修功能代码；发现缺口进入正常修复项，不能在 browser-testing 期间改应用。
- 不装 E2E runner/Playwright 项目依赖，不做 GPU、原版、实机快捷键或 React StrictMode/HMR 验收。

## 关键文件与契约

- `src/platform/browser-session-host.ts`、`src/app/synthetic-session.ts`（03/04–06 计划交付，本项只读）。
- [engineering](../../../../engineering/README.md)（已有，本项补充实际验证过的入口、复现与自有探针清理说明）；不额外创建仅为重复工程说明的 guide。
- 临时 DOM 探针/观测文件位于执行时确定的安全自有临时位置，只服务验证并清除，不新增 tracked 应用/测试代码。

## 验收标准

- [ ] AC-13：真实 rAF 的运行/暂停/显式恢复/重启/退出/销毁→重建观察与公开状态一致；暂停/恢复状态对不回退。
- [ ] AC-07/13：实际 hidden 与 visible 已观测，回前台仍 paused；自动化或用户手动证据准确，不用伪造 getter 代替。
- [ ] AC-09/13：注册三类真实监听、正常 dispose 逐项撤销、旧回调无通知；pagehide/pageshow 探针不被描述成 BFCache。
- [ ] AC-14：探针、页面/上下文及自有服务器清理完成，无 App/main/依赖/存储变更；直接相关文档含 updated 日期、可复现步骤。

## 验证方法

- 必须调用 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)。先检查工具隔离与 Chromium 能力，复用/启动 `pnpm dev --host 127.0.0.1 --port 5173 --strictPort` 时先确认端口空闲，记录实际 origin，HTTP 仅证明启动。
- 不要求精确真实 FPS；每次回调/生命周期输出与单个请求的计数是判据。tick 观察使用条件等待，暂停后跨实际 rAF 观测期间保持相同；精确时间阈值已由 Node AC-04 验证。
- rubber-duck 对本项实际证据及文档做契约复核；无实现代码不执行 simplify。文档链接/元数据检查，不跑无关 build。
- 清理只操作自有探针/上下文/进程，不清用户站点数据；缺少真实 hidden/工具时如实 blocked。

## 完成证据
