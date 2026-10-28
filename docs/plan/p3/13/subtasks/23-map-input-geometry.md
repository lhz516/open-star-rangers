---
type: plan
status: active
phase: P3
task: "13"
subtask: "23"
updated: 2026-10-28
---

# 23 — 生产地图几何、右键与 ready 握手

**契约来源：** [spec](../spec.md#地图输入几何与指针) 的 S-11，AC-17/18。
**依赖：** 22。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 提供同payload几何到MapInputGeometry的转换，含端点右/下加1，ViewportFrame相对同一输入容器。
- 适配cursor.draw/ready为实际呈现凭证，首画不等待输入资格，不产生第二次GPU提交；错误/丢布局明确失效。
- 右键按下/释放经既有PointerLock链进入22，支持合格区域的电平、按住重复/短按、双调用计数、开图复位。
- 暂停/隐藏/失焦/解锁/离区清按住状态，保留m/Esc/左键/首次锁定不选点的原契约。

## 不包含

不改应用装配热文件（24），不新增Core命令、监听循环或鼠标飞行。

## 关键文件与契约

- [map-input.ts](../../../../../src/ui/game-input/map-input.ts)、[input-consumer.ts](../../../../../src/ui/game-input/input-consumer.ts)。
- [map-input-geometry.ts](../../../../../src/render/map/map-input-geometry.ts)、[map-cursor.ts](../../../../../src/render/map/map-cursor.ts)。
- 计划新增 `src/render/map/map-presentation-port.ts` 与测试，供24接生产。

## 写入范围

- `src/render/map/*.ts`：几何/ready端口与测试，保留隔离测试十字光标。
- `src/ui/game-input/*.ts`：电平、资格与清键接线和单元测试。
- `src/platform/input/pointer-lock.ts`：仅D-01确认必要的右键契约增量。
- `src/platform/input/pointer-lock.test.ts`：平台事件测试。
- `src/platform/input/browser-pointer-lock.ts`：浏览器宿主的右键菜单抑制（23 的范围请求）。
- `docs/engineering/keyboard-input.md`：绑定/去抖/资格说明。

## 验收标准

- [x] 同源几何、容器偏移/黑边/全屏/像素比正确，非法与未就绪区分。
- [x] 只有实际画面凭证授予ready；丢上下文清键解锁、恢复先画。
- [x] 右键边界、contextmenu作用域与既有左键/Esc/失败回退回归通过。

## 验证方法

`pnpm test -- src/render/map src/ui/game-input src/platform/input`、`pnpm check`；[simplify](../../../../../.agents/skills/simplify/SKILL.md) 限既有输入链，无独立引擎。

## 完成证据

2026-10-28，worker 分支 `exec/p3-13-23`（基线 `2e47f896`）。未启动 DOSBox-X，未运行 Ghidra；原版事实只引用 [地图鼠标](../../../../original/formats/executable.md#map-mouse-input-p3-0503)（右键为每次读取时的当前电平，INT 33h 03h 不锁存）。

**交付（只在写入范围内；无 Core 命令、录制字段、监听循环或鼠标飞行）。**

- [map-input-geometry.ts](../../../../../src/render/map/map-input-geometry.ts)：`zoneMapGeometry(logical, zone, shown)` 以 22 的 `mapPictureGeometry`（同一 `data/hud/map-geometry`，右/下 = 末列/末行 + 1）为屏幕与主地图，frame = 显示画面的元素盒 − 输入区（Pointer Lock 目标）边框盒左上，与绝对采样同一原点；`createZoneGeometryPort({ logical, zone, shown })` 每次读取测量两盒（结构类型 `MeasuredElement`，浏览器中即 `HTMLElement`），不观察、不调度；缺内容/未挂载为 null，隐藏画面的空盒经 `checkMapInputGeometry` 为未就绪，NaN/负尺寸仍为 `invalid`。另导出 `sameMapInputGeometry`/`sameLogicalGeometry`（MapInput 改用前者）、`MapLogicalGeometry`、`ClientBox`。
- [map-presentation-port.ts](../../../../../src/render/map/map-presentation-port.ts)：`createMapPresentationPort({ geometry, revoked? })`，每运行一个。`cursor` 即生产的 `MapInputOptions.cursor()`：`draw()` 不绘制、不提交、不推进，只核对最近一次 `submitted(drawn())` 的凭证与当前几何的屏幕/主地图相同（frame 变化即 resize 保留）；`revoke()` 立即撤销并在确有凭证时调用 `revoked`（接 `GameInputConsumer.syncMap`）；`dispose()` 后迟到的提交被忽略。
- [map-input.ts](../../../../../src/ui/game-input/map-input.ts)：`rightButton.read()` = 合格 ∧ 按住。锁定态任何右键按下计入；无锁回退时按在主地图内（含边缘）才计入，不移动光标；`click-to-lock`/`locking` 忽略且不申请锁定。松开、无锁回退移出主地图、无锁时几何改变，以及 `#neutral` 的全部条件（暂停、隐藏、失焦、解锁、离图、换运行、几何失效）清为未按（Δ-09）；锁定态 resize 保留。`contextMenu(moment)` 只在合格时为真。左键、m、Esc、首次锁定不选点、失败回退的逻辑未改。
- [input-consumer.ts](../../../../../src/ui/game-input/input-consumer.ts)：`mapRightButton`（无 `map` 选项时恒 false）、`syncMap()`；[capabilities.ts](../../../../../src/ui/game-input/capabilities.ts) 在 live 时把端口的 context menu 请求转给消费者。[pointer-lock.ts](../../../../../src/platform/input/pointer-lock.ts)：可选的 `PointerLockHost.listenContextMenu(listener → boolean)` 与 `PointerLockSink.contextMenu?()`，随连接登记、随释放移除，注册失败回滚。[browser-pointer-lock.ts](../../../../../src/platform/input/browser-pointer-lock.ts)（协调者 2026-10-28 批准的 scope-request，main `72e1bca7`）实现它：在输入区所在文档上监听 `contextmenu`，只处理目标为输入区（含其后代与 shadow 路径）的请求，回调为真时 `preventDefault()`。

**交 24 的接线（不在本项实现）：** 每运行 `const port = createMapPresentationPort({ geometry, revoked: () => input.syncMap() })`，`map.cursor: () => port.cursor`（取代生产十字光标），`map.geometry = createZoneGeometryPort({ logical: () => mapPictureGeometry(运行内容的 mapGeometry), zone: () => 输入区, shown: () => 画布 })`；每次实际 GPU 提交后 `port.submitted(mapPicture.drawn())`，失去布局/设备/画布或提交失败 `port.revoke()`，运行结束 `dispose()`；每批 `CockpitTick.mapRightButton = input.mapRightButton.read()`（同批各 tick 同值）。

**残余：**无锁回退时指针一步移出输入区再松开右键，页面收不到 `mouseup`（左键按住重复已有同一限制），电平保持到下一次离开主地图、失去资格或松开。

**验证。**

- `pnpm exec vitest run src/render/map src/ui/game-input src/platform/input`：17 个文件 424 项通过。新增断言：
  - 几何：合成记录 [13, 37, 503, 337] 得主地图 13…314 × 37…338；输入区边框盒 (50, 30) 加 3 px 边框与 100 px 黑边时 frame 为 (103, 3, 800, 600)；像素 0/1/150/300 的中心经 `quantiseMapPoint` 回到同一像素，右/下边界 = 1 仍在图内且钳到 300，超出半像素与黑边在图外；1920×1080 全屏在 DPR 1/1.5/2 下 frame 都是 (240, 0, 1440, 1080)；页面滚动/缩放只平移两盒时几何相同；缺任一为 null，隐藏为未就绪，NaN 为 `non-finite`、负宽为 `inverted`；端口每次读取重新测量、无内容时不测量、未挂载为 null。
  - 凭证：提交前 draw 为假；提交后 draw 为真；resize 保留，主地图不同、无布局、空盒与非法几何为假且不抛错；提交 null、`revoke`（只在有凭证时回调一次）与 `dispose`（之后忽略提交）都撤销。与真实地图画面（22）及真实 MapInput 联动：开图 tick 先画出并提交（`opening: 1`）而输入仍 `not-ready`，下一帧才合格并申请锁定（无死锁）；提交失败的帧不授予；锁定中 `revoke` 立即 `exit`、右键清为未按、系统指针恢复、状态 `not-ready`；失去期间不提交仍为 `not-ready`，恢复后先提交一帧、下一帧无用户激活只显示 `click-to-lock`，无请求、hover 或 select。
  - 右键：锁定按住跨帧为真、松开为假；两次读取之间的按下+松开读不到；左键选取/重复/松开不受右键影响，左键松开不结束右键；无锁回退在黑边为假、在主地图（含右下边缘）为真且不移动光标、移出主地图后回来仍为假；`idle`/`pending` 忽略且不申请；暂停、停止、隐藏/失焦、解锁、离图、换运行、几何失效与无锁几何改变后为假且需新按下；资格失去后、清键到达前读取已为假。经真实地图画面：按住在 tick 6、22、38 翻转（读取每 4 tick、每 16 tick 一次），松开后 40 tick 不翻转；读取间的短按与按住进入暂停都不翻转，所有读到的电平为 false。
  - 端口链：真实 `createPointerLock` + 能力控制器 + 消费者：开图前右键为假；锁定按下为真、松开为假；Esc 解锁、暂停、失焦各清为假；右键不提交 `map-point`。context menu 在 `click-to-lock`（合格）时抑制，暂停、离图与释放后不抑制；`syncMap` 在凭证失效时立即清键并 `exit`。端口：有宿主方法时 6 项登记，按 sink 返回值决定，锁定与否都转发，释放后不抑制；sink 无决定时不抑制；该登记失败时回滚前 5 项；无该方法的宿主仍 5 项（既有用例）。
- `pnpm check`（typecheck、lint、Vitest 419 个文件 11,358 项、生产构建；只有既有的 > 500 kB 块体积警告）：在 rubber-duck 与 simplify 之后，以及补上浏览器宿主之后复跑通过，退出码 0；日志在 ignored `local/research/p3-13/23-map-input/check.log`。
- 浏览器宿主没有 Node 单元测试：仓库没有 jsdom，Node 的 tsconfig 不含 DOM 类型，所以改用下面的浏览器核对。
- 浏览器快速核对（正式浏览器检查仍归 28）：临时 Playwright 用例（已删除，未提交）在 `OSR_E2E_DEV_PORT=5169`/`OSR_E2E_PREVIEW_PORT=5170` 的开发服务器上用 P3-05 的隔离地图入口（生产输入链与浏览器 Pointer Lock 宿主，地图上下文与几何为合成），Chrome 无头，1 项通过。真实右键点击输入区，window 冒泡监听记录 `defaultPrevented`：Pointer Lock 不支持的回退下，飞行中为 false、地图 `unlocked` 为 true、暂停（`suspended`）为 false、继续后为 true。原生 Pointer Lock 锁定后右键时 Chrome 不派发 `contextmenu`（记录为空），无 `map-point`、无错误。服务器由 Playwright 启停，端口已释放。

**Rubber-duck：** 一个只读 code-review 子代理担任 rubber-duck，对照 spec 地图输入几何与指针、DC-04/DC-09/Δ-09、P3-05 的 P3-13 同步与地图鼠标事实审阅完整 diff，未发现重要问题；确认 Δ-09 全部清除条件、凭证只比较屏幕/主地图在 24 每次提交都调用 `submitted(drawn())` 的前提下不会跨开图沿用、`contextMenu` 中的 `#settle` 不会在帧间新获得资格、`syncMap` 在帧监听器中调用不重入。

**Simplify：** 只限本 diff：MapInput 的几何比较改用共享的 `sameMapInputGeometry`，绝对采样换算抽成 `#absolute`；去掉凭证端口只供测试的 `credential()` 与 `revoke` 中多余的 disposed 判断；浏览器几何端口改为结构类型并并入 `map-input-geometry.ts`（Node 测试不依赖 DOM 类型）。行为不变，复跑聚焦测试与 `pnpm check`。

**文档影响：** 已更新 [键盘输入](../../../../engineering/keyboard-input.md)（绑定表鼠标行、Pointer Lock 目标与 frame 原点、生产几何、右键电平、绘制 ready、项目十字光标只留给隔离入口、Δ-09 差异、P3-13 交接）。`docs/engineering/modules/render.md` 与 `app.md` 的 API 同步归 24。原版事实与 U 项无变化；STATUS 与 tasks.md 无需改动。
