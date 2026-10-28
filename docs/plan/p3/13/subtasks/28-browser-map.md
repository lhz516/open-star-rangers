---
type: plan
status: active
phase: P3
task: "13"
subtask: "28"
updated: 2026-10-28
---

# 28 — 生产地图像素、输入与缓存恢复验证

**契约来源：** [spec](../spec.md#验证策略) 的 AC-02/05/13/16/17/19/20。
**依赖：** 25。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 合成包验证地图palette/图元、覆盖/标签/多选框、信息行超窗、零能量项目标记、消息行及无系统十字。
- 实际PointerLock/输入链覆盖首画ready、首次点击锁定不选点、左键重复、右键双调用、开图保留计数、m与两次Esc。
- 黑边/容器偏移/全屏/缩放边界、失焦/解锁清电平及无锁回退；不让旧代价跟随未确认位置。
- 隔离站点内旧版本合成缓存拒绝、新导入恢复；不清用户站点数据。

## 不包含

不改变地图规则/去抖，不将DOM合成按键当OS拦截证据，不读取原版文件。

## 关键文件与契约

- [map-input.development.spec.ts](../../../../../e2e/map-input.development.spec.ts)、[mission-flow.production.spec.ts](../../../../../e2e/mission-flow.production.spec.ts)。
- 计划新增 `e2e/map-picture.development.spec.ts`、`map-picture.production.spec.ts`、`support/map-picture.ts`。

## 写入范围

- `e2e/map-picture.development.spec.ts`：计划新增地图回归。
- `e2e/map-picture.production.spec.ts`：计划新增生产地图回归。
- `e2e/support/map-picture.ts`：计划新增独立辅助。
- `e2e/map-input.development.spec.ts`：原光标夹具与输入回归。
- `e2e/mission-flow.development.spec.ts`：生产几何就绪断言。
- `e2e/mission-flow.production.spec.ts`：生产几何和实际选择。

## 验收标准

- [x] 画面像素与Core确认信息一致，非法/未就绪不能被误认为空地图。
- [x] 首画/锁定/回退/右键/清键/边界有真实浏览器结果。
- [x] 旧缓存拒绝与重导入恢复可复现且不影响用户数据。

## 验证方法

使用 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)；`pnpm test:e2e -- e2e/map-picture.development.spec.ts e2e/map-picture.production.spec.ts e2e/map-input.development.spec.ts e2e/mission-flow.production.spec.ts`（新增文件落地后）。实际权限/锁定行为单独记录，必要且agent无法完成的手势才请用户。测试维护的[simplify](../../../../../.agents/skills/simplify/SKILL.md)仅限地图回归。

## 完成证据

2026-10-28，worker 分支 `exec/p3-13-28`（基线 `2bd89ec1`）。只改写入范围内的 E2E；未改产品代码，未启动 DOSBox-X，未读取原版文件。浏览器：本机 Chrome（`channel: chrome`）headless，macOS，视口 1280 × 800，DPR 1（另有 DPR 2 的独立 context），开发源 `http://127.0.0.1:5184`、预览源 `:5185`，每个用例由 Playwright 新建隔离 context，结束后 5184–5186 无监听。

**方法。**

- [support/map-picture.ts](../../../../../e2e/support/map-picture.ts)：Core 事实经 mission 屏幕的 React fiber 只读 UI store（同 map-warp.ts 的读法）。期望画面：在 Node 中用 `cockpitContentOf` 解码同一合成包，以真实地图模块 `createMapPicture` 绘制浏览器读到的 Core 确认 `map` 分区（标签开/关、可选本地指针），加遍 1 框架元素，经 `palette/map/screen` 着色后与合成后的页面截图（640 × 480 逻辑像素，`flight-pictures.ts` 的读法）逐像素比较，消息行矩形另查。独立元素检查不经地图模块：背景为地图调色板 0（非黑）、主地图 8 与信息/放大 0xD 外框、网格 4、孤立单位标记按 TABL 10461 合成记录的自身索引逐像素、标签名、确认光标 +(2, 2) 的代价颜色档（E = 0 为 0xA）、每个信息行一条文字带（超窗行在窗外）。负对照：去掉接触点/成员/标签/行/目的地的“空地图”与改用飞行调色板都与页面不同。
- 变体包（合成内容的规范 JSON 经各自内容编码器重编码并更新载荷身份，只在隔离 context 预置）：起点聚集（玩家与敌编队存储位置放在 K 点）、能量耗尽（玩家 c58/c88 加大，加速键使能量耗尽到 0）、小地图（80 像素主地图，信息窗容量 5）、几何与 slot 2 类型 10 记录不一致、上一转换器版本 `osr-import.graphics-5…`。
- 右键标签观测：页内 rAF 记录器在应用帧之后对默认帧缓冲 `readPixels` 读放大窗内部，是否有标签色（8/0xF，脚本先核对合成图标不用这两色）；帧的 tick 以 store 约 100 ms 一次的发布为锚，按同一 rAF 时间戳与 31.25 ms 固定步长给出 ±1 的区间。暂停后应用循环重新登记，记录器随之重启。

**结果（全部为合成内容）。**

| 判据 | 设置/操作 | 期望 | 观察 | 结果 |
|---|---|---|---|---|
| 地图像素=Core（开发） | `mission-startable` 真实 Worker 导入，`m` 开图、锁定、指向敌编队后 `p` | 与 Node 地图模块画 Core 分区逐像素相同；元素与负对照 | 0 差异（标签关；标签开的期望与页面不同）；4 个放大成员图标重叠被错开；3 个标签；敌方圆环；1 个画布、无十字光标颜色；消息行空 | passed |
| 多选框/目的地 | 锁定移动到敌编队像素并点击 | Core 目的地 = 该像素；≥2 成员 boxed；画面一致 | 目的地 (296, 97)、boxed 2，画面 0 差异，放大窗有 0xD 选框 | passed |
| 生产画面 | 预置生产身份合成包，CSP 下同流程 | 同上 | 0 差异；无 CSP 违规 | passed |
| E = 0 标记与消息行 | 能量耗尽变体，能量 0 后开图 | `cursorCost.percent: null`，确认光标旁 `N/A` 为 0xA；信标消息在地图消息行（外框 8 + 文字） | cost 368/E 0/null；画面 0 差异；消息行有外框与文字 | passed |
| 信息行超窗 | 小地图变体 | 容量 5，单位行 4 行止于容量内，计数行画出窗口 | rows = 名称/数值 ×2 + 计数 ×2，第 6 行起点在窗外；画面 0 差异 | passed |
| 非法几何不当作空地图 | 几何矩形与类型 10 记录不一致 | 开始前拒绝，显示结构化原因，无画布/无地图 | “Starting the run failed while connecting the run's consumers” + `ContentContractError … cockpitInstruments.slots[1].instruments[0].rectangle, must equal the map geometry rectangle`；无 flight-area，store 地图为 null | passed |
| 首画 ready、首次点击锁定不选点 | `m`（带用户激活）开图；浏览器解锁后点击 | 首画后就绪并锁定（无 “Map input is not ready.” 残留）；点击只锁定 | 自动锁定，输入提示无地图行，光标隐藏；锁定点击后 12 tick 无 `warp-destination-set`，目的地仍 null | passed |
| 左键重复 | 锁定按住左键后松开 | 每 8 时钟单位（4 tick）一次，松开后停止 | `warp-destination-set` 于 tick 22、26…46，间隔恒 4；松开后至多 1 次在途，其后 16 tick 无新增 | passed |
| 右键双调用 | 起点聚集变体，锁定按住右键 | 按下后第一次读取翻转，之后每 16 tick（不是 20） | 4 次变化区间 (7,8]、(23,24]、(39,40]、(55,56]，符合 16 周期、不符合 20；首次在按下帧后 ≤5 tick；松开后 40 tick 无变化 | passed |
| 开图清开关、保留计数 | 翻转后立即关图，30 tick 后重开并新按 | 重开时标签清除；新按下被带入计数推迟 | 开图到翻转前所有可读帧均无标签；新按下后 ≥15 tick 才翻转（重置计数时应 ≤5）；关图与重开间地图内共 3 tick | passed |
| m 与两次 Esc | 重开锁定后页面 Esc，再浏览器解锁后 Esc | 首次不解锁不关图；解锁后 Esc 关图且不开菜单 | 同期望 | passed |
| 失焦/解锁/暂停清电平（锁定） | 按住右键翻转后失焦/浏览器解锁/暂停，再取回锁定 | 仍按住时 40 tick 不翻转，新按下才计入 | 三种情形各读 113 帧、0 变化；新按下翻转 | passed |
| 无锁回退区与清电平（Δ-09） | `pointerLock=unsupported` 起点聚集变体 | 主地图外按下不计；按住移出主地图再回、失焦、暂停均清电平 | 四种情形各读 112–113 帧、0 变化；主地图上新按下翻转 | passed |
| 几何：边缘/黑边/容器偏移/全屏/缩放 | 回退模式点击；测试样式表把游戏视图改成 2:1、非对称边框与外边距；退出全屏；560 宽窗口 | Core 目的地 = 点所在像素（独立由画布盒计算），右/下连续边界夹到末列，外侧与上方无选择，黑边为黑且无选择 | 默认（scale 1）、黑边（左黑边 155.5 px，scale 0.969）、非全屏（Start 点击时整文档已全屏）、窄窗（scale 0.484）各点全部一致 | passed |
| 像素比 2 | DPR 2 的独立 context，锁定移动 | 缓冲 = CSS × 2，逻辑画面不变，按 CSS 像素移动 | 0 差异，无十字光标 | passed |
| 旧代价不跟随未确认指针 | 锁定移动 48 逻辑像素后一帧内暂停 | 冻结画面中指针框/记录 26 在新点，代价/连线/放大在 Core 确认光标 | 第 1 次尝试即捕获：与“本地指针领先、读数在确认光标”的期望 0 差异；把读数移到指针处的负对照有差异 | passed |
| 旧缓存拒绝、新导入恢复（开发） | 隔离 context 预置上一转换器版本包，重载；再真实导入 | 不提供恢复、入口 `no-package`；导入后地图画面一致；旧记录不迁移不删除 | 状态 “None in this browser.”；导入后画面 0 差异；旧包记录摘要不变，载荷 411 → 822 | passed |
| 旧缓存拒绝（生产） | 同上，生产预置；再预置当前版本 | 同上 | 同上，两条包记录并存且旧记录不变 | passed |
| 隔离入口右键 | `map-input.development.spec.ts` 回退模式 | 只在地图合格时抑制 context menu；右键不选点、不移动光标 | 飞行 false、合格 true（主地图与旁侧）、暂停 false、恢复 true、释放后 false；无 select、光标不变 | passed |
| 既有回归按新契约 | `mission-flow` 开发/生产地图用例 | 首画后就绪并锁定；生产经真实锁定移动+点击选点 | 生产目的地像素 = 起点 +(40, −30)，`warpRequest` accepted；开发 Warp 录制命令序列与 replay 不变 | passed |

**命令。**

- `pnpm build && OSR_E2E_DEV_PORT=5184 OSR_E2E_PREVIEW_PORT=5185 pnpm exec playwright test e2e/map-picture.development.spec.ts e2e/map-picture.production.spec.ts e2e/map-input.development.spec.ts e2e/mission-flow.production.spec.ts e2e/mission-flow.development.spec.ts`：37 项中 36 通过；唯一失败为 `mission-flow.development.spec.ts:831`（原 802，真实隐藏页面 Warp）的 `CDP Runtime.evaluate timed out`，为 24 已记录的既有环境问题，未改动。注意：按验证方法写 `pnpm test:e2e -- <文件>` 时 pnpm 把 `--` 原样传给 Playwright，结果会跑整个套件（264 项），因此改用等价的 `pnpm build && playwright test <文件>`。
- 稳定性：右键两用例 `--repeat-each 5` 20/20；地图画面两文件 `--repeat-each 3` 在审阅修改前后均通过（审阅前一轮暴露的 0xD 选框颜色前提与首读界限已修正）。
- `pnpm check`（typecheck、lint、Vitest 428 文件 11,510 项、生产构建）：退出码 0。

**实机能力记录：** Chrome headless 在 http 源支持真实 Pointer Lock；Playwright 的 Escape 到不了 Chrome 原生解锁，浏览器解锁以无用户手势的 CDP `document.exitPointerLock()` 代替（实际 Esc 证据归 P3-05/30）；CDP 改变模拟像素比时 Chrome 不派发 `resolution` 媒体查询 change，故像素比用独立 DPR 2 context，而非运行中切换；锁定结束时 Chrome 把指针放回锁定开始处，测试在每次重锁前把鼠标放回输入区中心；Start 点击已请求整文档全屏，回退几何在全屏与退出全屏后都验证。合成 DOM 事件不作 OS 拦截证据。未发现产品缺陷。

**Rubber-duck（code-review 代理担任）：** 4 项全部采纳：① 带入计数断言依赖时序——改为快速轮询、按记录帧计算地图内 tick 预算（≤4 才判定，否则重试，至多 6 次），帧 tick 区间改为锚点 + 固定步长 ±1，清除检查要求至少一帧可读；② 未确认指针用例无法区分代价跟随指针——步长改为 48 逻辑像素，并加“读数移到指针”负对照；③ 锁定模式下失焦/暂停都会解锁——新增无锁回退的失焦、暂停与移出主地图用例；④ 未覆盖非法几何——新增生产用例（开始前拒绝并显示结构化原因）。
**Simplify：** 只限本项地图回归，由本 worker 直接审阅（worker 不再派生多个子代理）：删去未用的 `mapColour`、`labelsShown`，页函数改为不导出，统一 CDP 无手势调用为 `quietly`；行为不变，复跑类型检查、lint 与上述 E2E。
**文档影响：** 建议协调者更新 [键盘输入](../../../../engineering/keyboard-input.md) 的 P3-13 交接一条（“运行装配……归 24”已交付；生产地图的浏览器回归见 `e2e/map-picture.*.spec.ts`），并把本 subtask 的验证命令改为 `pnpm build && pnpm exec playwright test <文件>`（`pnpm test:e2e -- <文件>` 会跑全部）。原版事实与 U 项无变化；STATUS 与 tasks.md 无需改动。
**私有输出：** `local/research/p3-13/28-browser-map/`（`e2e.log`、`results.json`（含各用例附件）、`check.log`、`baseline-e2e.log` 与调试日志）。
