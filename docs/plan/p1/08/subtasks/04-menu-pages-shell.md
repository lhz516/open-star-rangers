---
type: plan
status: active
phase: P1
task: "08"
subtask: "04"
updated: 2026-10-02
---

# 04 — 菜单画面与应用外壳

**契约来源：** [spec](../spec.md) 的 S-01、S-02、S-03、S-05、S-06、S-07，“行为与边界”与“画面与控件契约”，AC-01、AC-03、AC-04、AC-05、AC-07、AC-08、AC-10、AC-11、AC-13 的实现部分，技术决定 7–10、12。
**依赖：** 01, 03。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 把 [App](../../../../../src/app/App.tsx) 改为应用外壳：一个 `main`，h1 `Open Star Rangers` 与“不含原版内容”声明；持有 01 的页面流转状态（含锁存），只渲染当前画面；不在加载时创建 owner；锁存与原始原因不依赖演示画面或开发面板存活。
- 主菜单：标题 `Main menu`；原版数据状态（没有已验证数据、本构建无法导入或验证）；按顺序的 `Start synthetic demo` 与 `Import original game data` 两个原生按钮，说明经 `aria-describedby` 关联；锁存时显示含原因与刷新提示的 alert，Start 原生禁用并说明原因，导入仍可用。没有原版玩法入口或成功标记。
- 导入占位：标题 `Import original game data`；说明未实现、不读取/存储/上传用户原版文件、以后版本在浏览器本地处理用户自有数据，不声称支持任何格式；唯一控件 `Return to menu`；无文件输入、拖放区或 Worker。
- 合成演示画面：标题 `Synthetic demo`；`Return to menu` 位于画面与开发面板全部控件之前；preparing 状态；组合 03 的 hook、[SyntheticRenderView](../../../../../src/ui/render/SyntheticRenderView.tsx) 与 [SyntheticDevPanel](../../../../../src/ui/dev/SyntheticDevPanel.tsx)；初始化失败、faulted、清理失败时 Return 仍可用。
- 焦点：打开画面时把焦点移到画面标题（`tabIndex=-1`，不在 Tab 顺序中）；返回菜单时按 `focusTarget` 聚焦入口或菜单标题；首次加载不抢焦点。按钮有可见键盘焦点指示。只用原生按钮，不在 window/document 注册键盘监听。
- 文案与标题层级：failed 的说明改为“会话不受影响，可返回菜单重新启动演示尝试恢复（会丢弃本次合成状态）”，不再写刷新页面；unavailable 说明会话不受影响；开发面板清理失败提示与锁存一致。调整已有组件标题层级，使画面标题唯一、不跳级；订阅、诊断读取与派发方式不变。
- 响应式布局：1280×800 与 360×640 下无横向溢出、按钮不裁切、入口说明可见。

## 不包含

- 页面流转规则（01）、生命周期接线与失败交付（03）、渲染失败信号（02）。
- 任何键盘适配、全局快捷键、路由、持久化、真实导入或原版界面。
- 浏览器验收证据（06）；文档同步与源码检索（05）。

## 关键文件与契约

- 修改 [App.tsx](../../../../../src/app/App.tsx)、[SyntheticRenderView.tsx](../../../../../src/ui/render/SyntheticRenderView.tsx)（failed 文案、标题层级）、[SyntheticDevPanel.tsx](../../../../../src/ui/dev/SyntheticDevPanel.tsx)（标题层级、清理失败说明）。
- 计划新增 `src/ui/pages/MainMenuPage.tsx`、`src/ui/pages/ImportPlaceholderPage.tsx`、`src/ui/pages/SyntheticDemoPage.tsx`，均尚不存在；`.tsx` 只由应用类型程序检查。
- 页面组件、页面流转与 App 不导入 `original-data`、`content`、`workers`，不使用存储、文件、Worker 或 `fetch` API（AC-08）。

## 验收标准

- [x] 主菜单、导入占位与演示画面的可访问名称、说明关联、控件数量与顺序符合“画面与控件契约”。
- [x] 焦点规则（进入、返回、锁存、首次加载）与可见焦点指示在实现中成立；无全局键盘监听。
- [x] failed/unavailable/清理失败的文案与恢复入口符合 AC-10；失败原因在面板卸载后仍可见。
- [x] 无原版玩法入口或成功标记；AC-08 禁止的导入与 API 未被使用。
- [x] `pnpm typecheck`、`pnpm lint`、`pnpm build` 通过；`pnpm dev` 下用 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 做一次合成冒烟（菜单 → 演示 running → 返回 → 导入 → 返回），完整取证归 06。

## 验证方法

- 代码审阅：焦点、文案与锁存呈现；源码检索禁止的导入与 API。
- 开发服务器上的有界浏览器冒烟，只用合成演示，清理自建浏览器与服务器。

## 完成证据

- **应用外壳：** [App.tsx](../../../../../src/app/App.tsx) 由以下几部分组成：
  - 一个 `main`、h1 与“不含原版内容”声明。
  - 持有 [app-flow](../../../../../src/app/flow/app-flow.ts) 状态与一个[演示生命周期](../../../../../src/app/composition/synthetic-demo-lifecycle.ts)（`onCleanupFailure` 派发 `demo-release-failed`）。
  - 只渲染当前画面，演示画面以 `demoVisit` 为 key。
  - 锁存时，在所有画面的标题之后显示含原始原因（`describeError`）与刷新提示的 alert，不依赖 owner 或面板。
  - 演示的“Return to menu”先同步 `lifecycle.release()` 再派发 `return-to-menu`。
  - 由 `DemoScreen` 调用 app 层的 hook，`ui/pages` 不依赖装配。

  样式在 [app.css](../../../../../src/app/app.css)：响应式 `main`、`overflow-wrap:anywhere`、按钮 `max-width:100%`、`button:focus-visible` 3px 实线 outline。
- **画面组件：**
  - [MainMenuPage](../../../../../src/ui/pages/MainMenuPage.tsx)：h2 `Main menu`（`tabIndex=-1`）、原版数据状态、按顺序的两个原生按钮，各以 `aria-describedby` 关联说明。锁存时 Start 原生禁用，说明追加原因。`focusTarget` 变化或挂载时聚焦对应入口或标题；为 null 时不移动焦点。
  - `src/ui/pages/ImportPlaceholderPage.tsx`（P2-11 已删除）：标题、未实现说明（不读取、存储或上传；以后在浏览器本地处理用户自有数据）和唯一的 `Return to menu` 按钮。
  - [SyntheticDemoPage](../../../../../src/ui/pages/SyntheticDemoPage.tsx)：标题后首个控件为 `Return to menu`，随后是合成画面与开发面板。锁存且无 owner 时只显示状态说明，不创建容器。
  - 进入画面时由 [useFocusOnMount](../../../../../src/ui/pages/use-focus-on-mount.ts) 聚焦标题。
- **文案与层级：**
  - [SyntheticRenderView](../../../../../src/ui/render/SyntheticRenderView.tsx) 的标题改为 h3；failed 文案改为“会话不受影响，返回菜单并重新启动演示可尝试恢复，会丢弃当前合成状态”。
  - [SyntheticDevPanel](../../../../../src/ui/dev/SyntheticDevPanel.tsx) 的标题改为 h3 `Development panel`，各区块改为 h4，使 `Synthetic demo` 在整页唯一、不跳级；清理失败提示改为“无法创建新演示，刷新页面”。
  - `describeError` 移到 [describe-error.ts](../../../../../src/ui/game/describe-error.ts)，供面板与外壳共用。订阅、诊断读取与派发方式不变。
- **禁止项（AC-08 实现部分）：** 新增页面、外壳与页面流转不导入 `original-data`、`content`、`workers`，不使用存储、文件、Worker、`fetch` 或文件输入；没有原版玩法入口或成功标记。完整源码检索记录归 [05](./05-docs-isolation-checks.md)。
- **工程检查：** `pnpm typecheck`、`pnpm lint`、`pnpm build` 通过；`pnpm check`：43 个文件 1094 passed（仅既有块体积警告）。
- **浏览器冒烟（browser-testing）：** 环境为自建 `pnpm dev`（`http://127.0.0.1:5180`）、shell 启动且使用临时 `--user-data-dir` 的 Chrome 154.0.8037.95 / macOS，经 `connectOverCDP` 驱动。另有一个非本轮启动的 5173 服务器，未触碰。
  - 主菜单：h1 正确，两个启用按钮及其说明齐全，原版数据状态正确，无画布，焦点在 body。
  - 点击 Start：焦点在 `Synthetic demo` 标题，1 个画布，running/run 1，`Renderer ready.`。标题依次为 H1、H2 Synthetic demo、H3 Synthetic view、H3 Development panel、H4 若干。
  - Return：焦点在 Start，0 个画布。
  - Import：焦点在其标题，0 个 input。Return：焦点在 Import 入口。
  - 唯一控制台错误为预期的 `/favicon.ico` 404。simplify 改动后复跑，结果相同，无错误。

  完整取证归 [06](./06-final-browser-alignment.md)；自建服务器与浏览器保留到 06 结束后清理。
- **Rubber-duck：** 未发现问题（核对了焦点、锁存可见性、Tab 顺序、StrictMode/Fast Refresh、AC-08 与 360px 溢出风险）。
- **Simplify：**
  - 已采纳：删除无规则的 `className="screen"`；`SyntheticDemoPage` 改收面板自己的 props 形状，不依赖 app 装配的 owner 类型。
  - 未采纳：把渲染器的单行 `errorText` 并入多行 `describeError`（呈现形式不同）；把 `describe-error.ts` 移出 `ui/game`（其格式化的是会话错误，为单个文件新建目录不值得）。
- **文档影响：** 工程约定与源码结构中的页面/目录说明同步按计划归 [05](./05-docs-isolation-checks.md)。

