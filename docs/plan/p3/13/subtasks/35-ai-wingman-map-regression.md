---
type: plan
status: active
phase: P3
task: "13"
subtask: "35"
updated: 2026-10-28
---

# 35 — 地图中开发面板提交的 E2E 回归修复

**契约来源：** [spec](../spec.md#地图输入几何与指针) 的 S-11，AC-17/18；[27 的完成证据](./27-browser-cockpit.md#完成证据)报告的回归。
**依赖：** 27, 28。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 定位 `e2e/ai-wingman.development.spec.ts` 的第 146 行起的测试在地图中提交开发面板命令时超时的原因（27 推测为地图输入就绪后取得 Pointer Lock）；在本项改动前后的 main 上复现。
- 若是测试仍按“地图输入未就绪”的旧契约操作，按 23/28 已交付的地图输入契约（首次点击锁定不选点、解锁回退、Esc）更新该测试，不削弱其对 `b`、错误上下文拒绝与暂停的断言。
- 若是产品缺陷（例如开发面板在地图打开时无法使用），不在本项暗改：报告精确复现与所需路径，由协调者扩大范围或另立修复项。

## 不包含

不改变地图输入契约、Pointer Lock 行为或 AI 规则；不处理其他已知的隐藏页/CDP 环境失败。

## 关键文件与契约

- [ai-wingman.development.spec.ts](../../../../../e2e/ai-wingman.development.spec.ts)、[keyboard-input.md](../../../../engineering/keyboard-input.md) 的地图输入说明、28 的地图回归。

## 写入范围

- `e2e/ai-wingman.development.spec.ts`：地图中的开发面板提交步骤。

## 验收标准

- [x] 该测试在开发入口稳定通过（重复运行），失败原因有记录。
- [x] 断言强度不低于原测试，地图输入契约未被绕过或改写。
- [x] 若为产品缺陷，已报告复现且未在本项暗改。

## 验证方法

`pnpm build && pnpm exec playwright test e2e/ai-wingman.development.spec.ts`（不用 `pnpm test:e2e -- <files>`，那会运行全部用例）、`pnpm check`。

## 完成证据

2026-10-28，worker 分支 `exec/p3-13-35`（基线 `d67e66e7`）。只改 `e2e/ai-wingman.development.spec.ts`；未改产品代码，未读取原版文件。浏览器：本机 Chrome headless，开发源 `:5205`、预览源 `:5206`，结束后 5205–5207 无监听。

**失败原因（已确认，测试按旧契约操作，不是产品缺陷）。** 在基线上复现：`submitDevCommand` 的 Submit 点击“成功”，但等待 `dev-command-submitted` 至 240 s 超时。失败时的面板结果列表在 `#2 toggle-map` 之后只有 `#3–#7 map-point: accepted`，没有 drop-transponder 提交。按 23/24 交付的契约（[键盘输入](../../../../engineering/keyboard-input.md)的全屏/Pointer Lock 与地图输入说明），`m` 开图后首画即就绪，并凭 `m` 自身的用户激活立即对输入区取得真实 Pointer Lock。锁定期间 Chrome 把所有鼠标事件交给锁定目标，于是 Playwright 对 Submit 的移动和点击成了地图 hover/select，面板收不到点击。原测试写于“地图输入未就绪、不锁定”的时期。旧流程末尾的 `zone.click()` + Escape 在锁定契约下同样不成立：锁定时页面收到的 Escape 只等浏览器解锁，不关图。开发面板在指针空闲时可用，与 28 在 `mission-flow.development.spec.ts` 的结论一致，所以不报告产品缺陷。

**修改（按 28 的先例，不绕过契约）。** `m` 开图后断言输入区已锁定且有焦点，再按 `b`，原有“`b` 在地图中不绑定”的断言（drop-transponder 结果仍为 1）不变。随后用无用户手势的 CDP `document.exitPointerLock()` 代替 Chrome 原生 Escape 解锁（Playwright 按不到原生 Escape），并等到 “Click the map to lock the pointer.”，再用面板编辑器提交 drop-transponder。原有的 `ignored`/`wrong-context` 断言和“拒绝的命令不产生 transponder-deployed”（仍为 1）不变。新增：地图中没有 `map-point` 结果（防止面板点击变成选点）。关图：`zone.focus()` 后等待已锁定或 click-to-lock（提交点击的激活可能使地图立即重锁），再解锁，确认提示后按 Escape。原有的 `map-toggled open=false` 断言不变，新增“不打开任务菜单”。CDP 会话在暂停段之前解除。

**命令与结果。**

- 基线复现：`pnpm build && OSR_E2E_DEV_PORT=5205 OSR_E2E_PREVIEW_PORT=5206 pnpm exec playwright test e2e/ai-wingman.development.spec.ts --grep "AC-10, AC-14, AC-17"` 失败，报错为上述 `dev-command-submitted` 超时。
- 修改后，同一命令下该用例单独运行 1 次通过，`--repeat-each 5` 5/5 通过。
- 最终版本整文件：`pnpm build && OSR_E2E_DEV_PORT=5205 OSR_E2E_PREVIEW_PORT=5206 pnpm exec playwright test e2e/ai-wingman.development.spec.ts --repeat-each 3`，12 通过、3 失败。:147 用例 3/3 通过，另 3 个用例各 3/3 通过。3 个失败都是 :472 真实隐藏页用例的 `CDP Runtime.evaluate timed out`，即已知环境问题，不在本项范围，未改动。修改前另跑过一轮同样的 3×，结果相同。
- `pnpm check`：退出码 0（Vitest 429 文件 11,545 项，生产构建通过）。最后一处修改（补焦点断言）之后，又跑了 `pnpm typecheck` 与 `pnpm lint`，均通过。

**Rubber-duck（code-review 代理担任）：** 无发现。已核对：第二次轮询不会因旧提示提前通过（提交点击使地图输入转为 suspended，没有提示行）；Escape 不会在锁定时按下；CDP 会话不影响后续 ResourceBalance、录制导出和隐藏页段；原断言全部保留。
**Simplify：** 只改测试步骤，不涉及实现代码，按程序免做。
**文档影响：** 无需修改。键盘输入文档已描述锁定、浏览器解锁与解锁后 Esc 关图的契约，28 的证据也已记录 Playwright 按不到原生 Escape 的替代做法。原版事实、U 项、STATUS 与 tasks.md 均不受影响。
**私有输出：** `local/research/p3-13/35-ai-wingman/`（`e2e-repeat3.log`、`e2e-target-repeat5.log`、`e2e-final-repeat3.log`、`check.log`、`typecheck-lint.log`）。
