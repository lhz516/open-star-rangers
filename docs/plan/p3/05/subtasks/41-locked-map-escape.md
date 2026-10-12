---
type: plan
status: active
phase: P3
task: "05"
subtask: "41"
updated: 2026-10-12
---

# 41 — 已锁地图 Escape 的统一保护

**契约来源：** [spec](../spec.md) S-07、S-11、AC-09、AC-12；[会话控制键](../spec.md#会话控制键)。
**依赖：** 20、36、40。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 已锁 Pointer Lock 时页面投递的 Escape 不提交 toggle-map，也不打开任务菜单；真实解锁事件仍走原有清键和地图保持路径。
- 保护同时覆盖 command 和 session 动作，不改变 p 或 m 等其他按键；未锁的新 Escape 仍关闭地图。
- 以生产绑定新增 Node 回归，纠正浏览器已锁 Escape 的预期；更正指南和 36 的错误解释，保留历史记录。

## 写入范围

- `src/ui/game-input/input-consumer.ts`
- `src/ui/game-input/input-consumer.test.ts`
- `e2e/map-input.development.spec.ts`
- `docs/engineering/keyboard-input.md`：隔离入口的 Escape 说明。
- `docs/plan/p3/05/subtasks/36-production-map-input-entry.md`：追加更正记录。

## 验收标准

- [x] 生产绑定的已锁地图 Escape 无命令/菜单/主动解锁；未锁的新按下提交一次 toggle-map；其他会话控制不被阻断。
- [x] 原生 Pointer Lock 结束后地图仍打开并清键，浏览器原有像素、选择、释放和资源回归通过。
- [x] 聚焦单元/浏览器及 `pnpm check` 通过，文档/链接检查、一次 scoped rubber-duck 和 scoped simplify 完成。

## 验证方法

- 生产绑定 Node 回归；真实锁目标、精确事件历史和命令读回；完整地图文件与锁定用例重复运行；完整工程检查。

## 完成证据

- **根因与修复：** 生产绑定把 map/Escape 解析为 command/toggle-map，而旧保护只覆盖 session/open-menu。在 `#carryOut` 的分支之前统一检查 Escape 和实际 Pointer Lock；只加一条生产保护，不改变绑定、版本或其他按键行为。
- **Node：** 测试辅助可显式注入既有 `BindingTable`，默认仍为 TEST_BINDINGS；新增回归使用 `GAME_INPUT_BINDINGS`。已锁 map 的新 Escape/repeat 不提交、不打开菜单，p 仍正常暂停/继续；解锁后旧 repeat 不复活，释放后新 Escape 才提交一次 toggle-map。`pnpm exec vitest run src/ui/game-input/input-consumer.test.ts src/ui/game-input/bindings.test.ts src/ui/game-input/capabilities.test.ts` 为 3 文件/73 测试通过。
- **浏览器：** macOS Chrome、独立合成 context、开发 5301/预览 5302。已锁目标为输入区，Playwright 页面 Escape 后经过三会话帧仍 locked/map，命令和 portCalls 为空；外部 `document.exitPointerLock()` 的实际结束通知后地图保持、clear-input 恰一次，精确历史为 `zone,none`；随后新 Escape 关闭地图，一次 toggle-map、无菜单、无错误。外部 API 解锁与页面投递明确不冒充原生 Escape；原生证据仍见 30/37。
- `OSR_E2E_DEV_PORT=5301 OSR_E2E_PREVIEW_PORT=5302 pnpm exec playwright test e2e/map-input.development.spec.ts --project=development --repeat-each=5` 为 55/55 通过（11 例各 5 次、单 worker、无重试、2.1 分钟）；原像素/DPR/选择/回退/资源断言未削弱。`pnpm check` 的 typecheck/lint、243 文件/7307 测试及生产 build 全通过。
- **审阅/简化：** 一次 scoped rubber-duck 无阻断或非阻断问题；指出现有 open-menu 锁保护对当前 Escape 绑定重复，但保留可维护非 Escape 自定义菜单绑定的原行为，不为这次修复删去。scoped simplify 沿用 frame、heldPointer、绑定表及精确事件观察，无新生产抽象、轮询循环或调度器。
- **文档与回收：** 键位指南限制为“未锁的新 Escape 关闭地图”；36 工作说明与追加更正准确区分历史错误预期和当前契约，不追溯改写原通过结果。五份关联文档链接/锚点零问题，日期及 diff 检查通过。中止最终链后两个遗留自有 Vite PID 经命令/端口核对并定向终止；新 runner 正常回收自有服务器和 context，不操作用户数据。最终完整浏览器验收由 33 重跑。
