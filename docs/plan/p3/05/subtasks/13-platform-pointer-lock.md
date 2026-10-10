---
type: plan
status: active
phase: P3
task: "05"
subtask: "13"
updated: 2026-10-10
---

# 13 — 平台 Pointer Lock 端口

**契约来源：** [spec](../spec.md) 的[战略地图输入](../spec.md#战略地图输入)（申请、退出、状态、相对移动、无锁回退）、[生命周期与资源](../spec.md#生命周期与资源)（异步申请、目标核对、清理）、[数据模型与契约](../spec.md#数据模型与契约)的“Pointer Lock 端口”与“能力申请状态与错误”行；S-11、S-14 的平台部分；AC-12、AC-16 的平台部分。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 DOM-free 的 `src/platform/input/pointer-lock.ts`：经宿主接口申请锁定（元素）、退出、报告支持与否；以 `pointerlockchange`/`pointerlockerror` 与实际目标（锁定元素恰为申请的元素）确认结果——有 Promise 的实现也核对目标，没有 Promise 的实现只以事件与目标确认；锁定期间的相对移动（`movementX/Y`，按平台报告单位原样给出并标注单位来源）与按键（按下/松开、按钮号）；未锁定时元素内的绝对坐标（客户区坐标与元素矩形），供无锁回退使用。
- 失败以稳定原因类别报告（不支持、被拒绝/错误、目标不符），不回显未清洗的宿主异常；不请求 raw/unadjusted 输入。
- 注册原子、可撤销；撤销后旧回调不再投递；只退出本端口锁定的目标，不解除他人的锁定。
- 计划新增浏览器连接 `src/platform/input/browser-pointer-lock.ts`（遵循 `browser-*` 命名的边界规则）。
- Node 测试：受控宿主下的成功、失败、迟到事件、目标不符、无 Promise 路径、撤销后静默、监听平衡。

## 不包含

- 申请代次、owner/run 关联与关闭屏障（21）；地图位置换算、光标与命令（17、22）；游戏语义。

## 关键文件与契约

- 参照 [keyboard-source.ts](../../../../../src/platform/input/keyboard-source.ts) 的“DOM-free 核心 + 薄浏览器连接”拆分与 [rollback-error.ts](../../../../../src/app/session/rollback-error.ts) 的回滚错误。
- 计划新增：`pointer-lock.ts`、`pointer-lock.test.ts`、`browser-pointer-lock.ts`。

## 写入范围

- `src/platform/input/pointer-lock.ts`、`src/platform/input/pointer-lock.test.ts`
- `src/platform/input/browser-pointer-lock.ts`

## 验收标准

- [x] 申请、确认、退出、失败与支持判定按契约工作，以实际目标确认；迟到与撤销后的事件不投递。
- [x] 相对移动与绝对坐标都可取得，单位来源明确；不识别游戏动作。
- [x] Node 测试覆盖成功/失败/迟到/目标不符/无 Promise/撤销；`pnpm exec vitest run src/platform/input` 通过；按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 检查本项改动；`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- Node 受控宿主测试；真实 Chrome 的锁定由 27 验证。

## 完成证据

2026-10-10，worker 分支 `exec-p3-05-13`（基于认领提交 `dd041fc7`）。

**实现：**

- [pointer-lock.ts](../../../../../src/platform/input/pointer-lock.ts)（DOM-free，Node 程序检查）：`createPointerLock(host)` 返回 `PointerLockPort`，宿主 `PointerLockHost` 绑定一个目标元素，提供 `supported`、`readLock`（文档的锁定元素相对目标为 `target`/`other`/`none`）、`request`（无参数，返回宿主的 Promise 或 undefined）、`exit`、`readRect`，以及原子、可撤销的 `listenLock`（`pointerlockchange`/`pointerlockerror`）与 `listenPointer`（`mousemove`/`mousedown`/`mouseup`）。
  - **申请：** `request()` 只在连接期间可用，同时至多一个未结（第二个抛错）；结果为冻结的 `locked`、`failed`（`unsupported`、`rejected`、`target-mismatch`，不带宿主异常）或 `disconnected`（未结时被释放，结果未知）。宿主返回 Promise 时只由该 Promise 回答：拒绝为 `rejected`，兑现时核对实际目标（`locked` 或 `target-mismatch`）；没有 Promise 时由第一个事件回答：变为目标为 `locked`、变为其他元素为 `target-mismatch`、error 为 `rejected`，变为无锁不作回答。同步抛错为 `rejected`；不支持时不调用宿主。已持有本端口确认的锁时直接 `locked`。结算后的回答一律忽略，Promise 宿主的迟到 change/error 不会结算下一个申请。
  - **状态与输入：** sink 的 `lock(true/false)` 只报告本端口确认的锁的开始与结束，每次转换一次（`true` 在申请的 Promise 观察者之前到达）；`pointer` 按实际锁定事实给出冻结样本：目标锁定时为 `relative`，`movementX/Y` 原样、`unit: 'host-reported'`；否则为 `absolute`，`clientX/Y` 与目标矩形、`unit: 'css-client'`；按下/松开带宿主按钮号。不解释游戏动作，不请求 raw/unadjusted。
  - **退出与释放：** `exit()` 只在本端口持有确认的锁且宿主仍报告目标锁定时调用宿主，结束由 change 事件报告；从未确认的锁（他人的，或申请已失败后才到达的）既不采纳也不退出。释放先使 sink 失效，未结申请为 `disconnected`，再按同样条件退出本端口的锁，然后移除全部监听；各项独立尝试，失败聚合为 `AggregateError`；注册失败回滚，回滚也失败时为 `RollbackError`。需要关闭屏障的所有者（21）应保持连接直至申请结果，按需 `exit()`，再释放。
- [browser-pointer-lock.ts](../../../../../src/platform/input/browser-pointer-lock.ts)（只由应用程序检查）：`createBrowserPointerLock(element)` 与可供测试入口包装 `request` 的 `createBrowserPointerLockHost(element)`。支持判定看 `pointerLockElement`、`exitPointerLock` 与 `requestPointerLock`；锁定读文档的 `pointerLockElement`，目标在 shadow tree 内时再读其根；`requestPointerLock()` 不带选项；鼠标事件监听在目标元素上，Pointer Lock 事件在其所属文档上。

**验收：**

- 申请、确认、退出、失败与支持判定：[pointer-lock.test.ts](../../../../../src/platform/input/pointer-lock.test.ts) 以受控宿主覆盖无 Promise 路径（变为无锁不结算、变为目标才 `locked`）、Promise 兑现时核对目标（无锁与其他元素均 `target-mismatch`，且不能 `exit`）、五种失败类别（结果严格等于 `{ status: 'failed', reason }` 且冻结，不支持时不调用宿主）、单一未结申请与复用已确认的锁、只退出本端口确认的锁、锁结束只报告一次。
- 迟到与撤销：Promise 宿主在未结时忽略 error 与 change、结算后的回答被忽略；拒绝先于 error 事件到达时（rubber-duck 指出 Chromium 实测有此次序）迟到的 error 不结算下一个申请；error 结算后迟到的锁不被采纳；释放后未结申请为 `disconnected`，之后的兑现、change 与鼠标事件都不投递；sink 在 `lock(false)` 或 `lock(true)` 中释放端口仍静默且退出自己的锁。
- 监听平衡：连接恰好 5 项登记，释放按序移除全部且可重复调用；5 个注册位置的失败均回滚已取得项；回滚失败为 `RollbackError`（cause 与全部移除失败）；释放时退出与移除失败聚合、每项只尝试一次，之后静默。
- 变异核对：去掉 Promise 兑现时的目标核对、把变为无锁当作回答、无持有也退出、迟到回答结算较新申请、不报告 `lock(false)`、去掉 `byEvents` 的任一守卫，测试均失败。
- 相对移动与绝对坐标：首个用例断言未锁定时的 `absolute` 样本（客户区坐标、矩形副本、`css-client`）与锁定时的 `relative` 样本（`movementX/Y` 原样、`host-reported`），按下/松开带按钮号，样本与矩形冻结。
- 本机 Chrome 冒烟（非验收要求，正式浏览器验证归 27）：开发服务器 5141，Playwright 驱动已安装的 Chrome（headless，独立上下文）载入 `browser-pointer-lock.ts`。`supported()` 为真；移动给出绝对样本（矩形 100/50/400/300）；点击中申请得到 `locked`、`pointerLockElement` 为目标；锁定后移动为相对样本 20/30；`exit()` 后报告 `lock(false)` 且解锁；再次点击重锁后释放端口即解锁，之后的移动不投递；脱离文档的元素申请为 `rejected`，无页面错误。Playwright 的 `evaluate` 带用户激活，因此“无手势被拒”不能以此复现。服务器与临时脚本已清理。
- 检查：`pnpm exec vitest run src/platform/input`（3 个文件 60 个测试，其中本项 24 个）通过；`pnpm typecheck`、`pnpm exec eslint src/platform/input` 通过；`pnpm check` 通过（227 个文件、6,839 个测试与生产构建），审阅修改前后各运行一次。

**审阅与清理：** rubber-duck 提出 2 项阻塞、2 项非阻塞与若干建议。采纳：Promise 宿主只由 Promise 回答（迟到的 error 曾可结算下一个申请），并补测试；shadow tree 内的目标读其根的 `pointerLockElement`；补 sink 在 `lock(true)` 中释放的重入测试；在接口注释写明 `lock(true)` 先于 Promise 观察者、`disconnected` 不可观察迟到的锁。未采纳：在释放后保留监听并自行退出迟到的锁（关闭屏障按本项“不包含”归 21，现有 API 已足够 21 保持连接、等待结果、`exit()` 后再释放；释放后自动退出可能解除新运行在同一元素上的锁）；为宿主的事实读取加防护（改为在宿主接口写明这些读取不抛错，浏览器连接满足）。simplify 采纳：直接返回 `requestPointerLock()`、去掉自写的 thenable 判断；`readLock` 先读文档、只在需要时读根节点；鼠标事件直接交给核心、不再逐事件复制；删去与其他用例重复的 Promise 成功用例。未采纳：复用 `render/scene/cleanup.ts` 的 `attemptAll` 与 `app/resources` 测试支持中的 `deferred`/`flush`（跨层或须改写入范围外文件）、与 `keyboard-source.ts` 抽取共用注册助手（范围外，且 12 正在修改该处）、以微任务替代 `setTimeout(0)`（更脆弱，收益可忽略）、把无 Promise 路径移入浏览器连接（spec 要求核心在 Node 中覆盖该路径）。

**文档影响：** 本项只交付平台端口，写入范围不含文档。需要更新的是 [platform 模块说明](../../../../engineering/modules/platform.md#键盘源)（`platform/input/` 增加 Pointer Lock 端口及其 API 与契约）与[源码结构指南](../../../../engineering/source-structure.md)，按 goal 归 32，已在 worker 报告中提出。没有原版事实或未知项变化。
