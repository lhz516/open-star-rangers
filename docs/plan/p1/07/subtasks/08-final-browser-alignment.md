---
type: plan
status: active
phase: P1
task: "07"
subtask: "08"
updated: 2026-10-10
---

# 08 — 最终浏览器证据与契约对齐

**契约来源：** [spec](../spec.md) 的全部 S-01–S-09、AC-01–AC-17。
**依赖：** 01, 02, 03, 04, 05, 06, 07, 09, 10。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 使用自有 Vite、隔离 Chromium profile 和 seed 0 合成数据，完成真实画面、4:3 黑边、DPR、上下文丢失/恢复、unavailable（能力可用时）、暂停/重启/退出及 React/StrictMode 生命周期证据。
- 对 HMR/Fast Refresh 与临时 Profiler 证据按 spec 准备、观察、还原；记录扩展能力、blocked 项和清理结果。
- 最终核对 spec/goal/subtask 覆盖、工程文档、依赖/锁文件、工作树和无原版内容。

## 不包含

- 不建立 Playwright runner、CI、部署或真实多浏览器/设备矩阵。
- 不把 Canvas 存在、HTTP 200 或 Node 替身当作 WebGL 通过；不修改 browser-testing skill 的约束。

## 关键文件与契约

- [spec](../spec.md)、[goal](../goal.md)、本 subtask。
- [browser-testing skill](../../../../../.agents/skills/browser-testing/SKILL.md)、[App](../../../../../src/app/App.tsx)、[package.json](../../../../../package.json)。

## 验收标准

- [x] AC-05、AC-08、AC-09、AC-10、AC-12、AC-14、AC-15 的真实浏览器证据完整或逐项记录 blocked。
- [x] 所有浏览器测试只使用自建 synthetic 数据，记录 browser/OS/origin/viewport/DPR/错误与清理。
- [x] 终审确认所有 S/AC 有实现与证据映射，`node tools/task-state.ts p1/07 --json` 路由可进入 done。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 的 preflight、隔离、清理要求；截图 Buffer 在页面内解码后只保留文字采样。
- 运行 `pnpm check` 和 `node tools/task-state.ts p1/07 --json`；审阅 `git diff`/`git status`，不得提交原版内容或临时插桩。

## 完成证据

**环境：** macOS，本机 Google Chrome 154.0.8037.95（shell 以临时 `--user-data-dir` 与 `--remote-debugging-port` 启动、VS Code `runPlaywrightCode` 经 `connectOverCDP` 驱动；WebGL 关闭场景另起同样隔离的 Chrome，加 `--disable-webgl --disable-webgl2 --disable-3d-apis`）。自有 `pnpm dev`（`http://127.0.0.1:5173`）与 `pnpm build` + `vite preview`（`http://127.0.0.1:4173`）。视口用 CDP `Emulation.setDeviceMetricsOverride`（默认 1280×800、DPR 1）。只用种子 0 合成演示，不读写用户存储；截图只在页面内解码为文字采样，不保存。页面作用域探针（init script）只计数 resolution 查询、ResizeObserver、WebGL 上下文监听的登记/撤销并收集插入的画布，不改应用行为。证据取于修复 10 之后的最终代码（10 之前取得的同类结果一致，见 goal 执行记录）。

| 验收 | 操作 | 观察结果 | 结论 |
|---|---|---|---|
| AC-04（浏览器） | 运行中与暂停后，用页面内定时器窗口点击诊断刷新读 `draws` | 运行 1 s 内 draws 由 43 增至 165；暂停后间隔 1.1 s 两次读数 121/121（修复前同测 249/249） | passed |
| AC-05 | idle → Start → Add marker → Pause → Resume → Restart+Pause → Exit，元素截图像素统计（容差 ±3） | idle 只有 #102040 背景与黑边；Start 后 mover #ffd040 814 px；Add 后 marker 212 px ≥ 9（Core 在 tick 90 accepted，位置与结果一致）；暂停后相隔 1.1 s 两张截图逐字节相同；旧 run drawnTick 58（修复前 121）≥ 30 时同一页面任务内 Restart 后 0.4 ms 内 Pause，新 runId 2 ≠ 1、drawnTick 0 < 旧值、marker 0、mover 814；Exit 后只剩背景与黑边。新 run 精确绘制 tick 0 与故障收尾空帧由 Node（03、09）证明 | passed |
| AC-08 | 暂停且有实体时，视口 1280×800、480×900、320×240（DPR 1）；以实测容器尺寸代入动态导入的布局函数 | 容器宽 1249/449/289 = 父内容宽，高 560/630/240 = `clamp(240px,70vh,720px)`，背景 `rgb(0,0,0)`；画布矩形与公式 frame 误差 0 px，缓冲 746×560/449×336/289×216 与公式完全相等，宽高比误差 0.67/1/1 px；黑边内距边缘 2 px 采样 #000000，帧内四角内缩 5% 采样 #102040；三种视口都有 mover/marker 像素。生产预览 Start+Add 后 mover 814、marker 212 px，1 个画布、状态 ready、无错误 | passed |
| AC-09 | 暂停，CSS 1280×800 不变，DPR 1→2→1.5→3→1（每次交替 `setEmulatedMedia` 触发媒体查询重新求值，见 goal 执行记录） | 缓冲 746×560 → 1493×1120 → 1120×840 → 1493×1120（3 限为 2）→ 746×560，均等于公式；每次 draws 恰好 +1（333→337）；resolution 查询登记 6、撤销 5，仅余当前渲染器的 1 个；无控制台错误。修复后最终代码复测 DPR 2 缓冲 1493×1120 | passed |
| AC-10 | WebGL 关闭的隔离 Chrome 打开开发服务器 | `getContext('webgl2'/'webgl')` 均为 null；容器内 0 个画布，`role=alert`、`data-state=unavailable`，显示 Three.js 原始错误；Start、Add、Remove 均得到 Core accepted，会话 running，诊断 state unavailable、GPU none、draws 0；无页面异常。控制台仅有 Three.js 的上下文创建错误（一组）与 `/favicon.ico` 404（项目无 favicon，与渲染无关） | passed |
| AC-11（React 显示） | 代码审阅 | 浏览器无注入入口；[SyntheticRenderView](../../../../engineering/source-structure.md#r7-演示页面开发面板与画面) 对 failed 使用与 unavailable 相同的 `role=alert` 路径并附原错误；Node 由 03/05 覆盖 | passed（审阅） |
| AC-12 | 页面画布的 `WEBGL_lose_context`（扩展可用） | loseContext 后状态 `context-lost`（`role=status`），draws 停在 379 而会话 tick 72→109 继续；暂停后 restoreContext → ready，draws +1（380），暂停截图仍有 mover/marker 像素；恢复并绘制后 GPU 统计 2 geometries/0 textures/1 program，与丢失前相同。最终代码复测同样 | passed |
| AC-13 | 两种 kind 均已绘制后取基线；20 次 Restart、50 对 Add/Remove（每步以诊断实体数 2/1 确认被接受） | 基线、20 次 restart 后（run 1→21）、50 对之后的 GPU 均为 2/0/1，实体数 1 等于当前 Render State；50 对全部确认、无失败；`WEBGL_lose_context` 可用 | passed |
| AC-14 | StrictMode 首挂载；执行回合在后台对 App 交替增删一个 `useState` 调用 22 次（hook 签名变化使 Fast Refresh 重跑 effect），同时页面任务每 500 ms 采样；结束后 `cmp` 确认还原 | 首挂载 1 个画布；22 次 effect 重建使画布累计 1→23，每次采样最多 1 个已连接画布且都在容器内；22 个旧画布全部断开且 `isContextLost()=true`；查询/观察/上下文监听登记 23/23/92、撤销 22/22/88，正好余当前一组；Chrome `Log`/控制台无 “Too many active WebGL contexts” 或 WebGL 日志。注：只改注释或 JSX 文本的编辑在本环境不重跑 effect，故改用签名变化 | passed |
| AC-15 | 执行回合临时给画面包 `Profiler`（结构性编辑，还原后 `cmp` 确认）；键盘与可访问性检查 | 挂载阶段提交 mount + 2 次 nested-update，运行 2.2 s（265 次绘制）期间 0 次提交；画布 `role=img` 且有可读名称，ready/context-lost 为 `role=status`，unavailable 为 `role=alert`；合成标注可见；聚焦“Refresh diagnostics”按 Enter 后诊断更新 | passed |

- **观察（非契约失败）：** 同一页面先做过上下文丢失/恢复，再释放该渲染器（如 Fast Refresh 重建）时，Chrome 记录若干 `INVALID_OPERATION: delete/deleteVertexArray: object does not belong to this context` 警告：Three.js 恢复后仍对旧上下文的对象调用删除。新页面不经上下文丢失的 22 次重建无任何 WebGL 日志；该情形下画布仍只有 1 个、旧上下文已丢弃、GPU 统计不增长。记入 goal 执行记录，若 P1-10 联合回归需要零警告，可另行评估。
- **对齐：** S-01–S-09 与 AC-01–AC-17 均按 [goal 验收覆盖](../goal.md#验收覆盖) 有实现与证据：01（依赖/边界）、02（布局/插值/相机/外观）、03（渲染器）、04（WebGL 表面）、05（owner）、06（React）、07（replay 不变性与文档）、09（故障空帧）、10（容器重挂载）及本表。Core、Runtime、Session 与 P1-06 桥接契约未改；渲染代码无 rAF/定时器（边界回归）；无原版内容、截图或二进制入库；临时 Profiler/HMR 编辑已还原。
- **检查：** `pnpm check` 通过（41 个测试文件/1030 个测试、生产构建 798.03 kB / gzip 215.60 kB，块体积警告按 spec 只记录）；`node tools/task-state.ts p1/07 --json` 路由为 `done`（every subtask is completed）。
- **清理：** 已停止自有 Vite、preview、两个隔离 Chrome，删除临时 profile 与临时 App 副本；页面探针随浏览器关闭消失。一次并行启动的竞态让 WebGL 关闭用 Chrome 未拿到 profile 路径，在用户已有的默认 Chrome 会话中打开了一个空白 `about:blank` 标签（未加载应用、未读写数据）；按规则未操作用户 profile，已告知用户自行关闭。
