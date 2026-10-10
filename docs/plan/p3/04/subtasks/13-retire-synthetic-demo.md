---
type: plan
status: active
phase: P3
task: "04"
subtask: "13"
updated: 2026-10-10
---

# 13 — 合成演示退役：源码与 lint 规则

**契约来源：** [spec](../spec.md) 的 S-10 与[合成演示退役](../spec.md#合成演示退役)的删除边界；AC-18（源码部分）。
**依赖：** 09, 11, 12, 18。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 删除前用 `git grep` 核对每个待删模块的实际使用者；仍被正式 Core、内容、平台、工具或 E2E 使用的合成 fixture/helper 不删（例如 `src/content/synthetic-content.test-support.ts`、`src/original-data/synthetic.test-support.ts`、`src/workers/synthetic-import.test-support.ts` 属于导入与内容测试，保留）。
- 删除 P1 演示专用链：`src/core/synthetic/`；`src/app/runtime/synthetic-*`；`src/app/session/synthetic-session*`（含 `synthetic-session.test-support.ts`，`ControlledHost` 已由 03 迁入中性的 `session-host.test-support.ts`）；`src/app/composition/synthetic-demo-*` 与 `use-synthetic-demo-owner.ts`；`src/ui/game/synthetic-*` 与 `use-synthetic-game.ts`；`src/ui/dev/SyntheticDevPanel.tsx`；`src/ui/pages/SyntheticDemoPage.tsx`；`src/ui/render/SyntheticRenderView.tsx`；`src/render/synthetic/`；以及只为它们存在的测试。
- 删除 `e2e/support/demo-observations.ts`（10–12 已迁走全部使用者）。
- 删除 lint 规则 `osr/core-synthetic-boundary` 及其在 [engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts) 中的回归；Core 纯度与确定性、模块边界、生产禁入 test-support 等其余规则与回归保持并通过。
- 测试数据中作为字符串出现的合成名称（例如 `fnv1a64.test.ts` 的 `osr-synthetic-snapshot`、`replay.test.ts` 用于拒绝的 `osr-synthetic-replay`、[synthetic-content.test-support.ts](../../../../../src/content/synthetic-content.test-support.ts) 中 P3-03 的 Asset ID `data/synthetic-scene`）不是模块引用，保持不变。
- 在完成证据中记录删除前最后一个包含这些路径的提交，供 15 写入退役记录。

## 不包含

- 当前工程文档、退役记录与历史链接（15、16）；E2E 迁移（10–12）。

## 关键文件与契约

- 删除：上列源码、测试与 E2E 支持文件。
- 修改：[eslint.config.js](../../../../../eslint.config.js)、[engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts)。

## 写入范围

- `src/core/synthetic/**`：删除。
- `src/app/runtime/synthetic-*`：删除。
- `src/app/session/synthetic-session*`：删除。
- `src/app/composition/synthetic-demo-*`：删除。
- `src/app/composition/use-synthetic-demo-owner.ts`：删除。
- `src/ui/game/synthetic-*`：删除。
- `src/ui/game/use-synthetic-game.ts`：删除。
- `src/ui/dev/SyntheticDevPanel.tsx`：删除。
- `src/ui/pages/SyntheticDemoPage.tsx`：删除。
- `src/ui/render/SyntheticRenderView.tsx`：删除。
- `src/render/synthetic/**`：删除。
- `e2e/support/demo-observations.ts`：删除。
- `eslint.config.js`：删除规则。
- `tools/engineering-boundaries.test.ts`：删除对应回归。

## 验收标准

- [x] AC-18（源码）：所列模块、菜单入口与 lint 规则已删除；`git grep` 在 `src`、`tools`、`e2e`、配置文件中没有对它们的模块路径或导入的引用（字符串形式的格式名除外，且已说明）。
- [x] 其余工程边界规则与回归保持；`pnpm check` 通过。
- [x] `pnpm test:e2e` 在 development 与 production 项目全部通过，`--project=development-headed` 通过。
- [x] 完成证据记录删除前的提交与删除清单。

## 验证方法

- `git grep` 检查、`pnpm check`、`pnpm test:e2e`（三个项目）。
- 不适用原版对照。

## 完成证据

- **删除前的提交：** 删除前最后一个包含下列全部路径的提交是 goal 分支上的 `84a3f454`（`docs(p3-04): claim subtask 13`，本项的基线）；这些路径最后一次内容修改在 `87690599`（`feat(p2-11): add the on-demand viewer renderer and 2D items`）。退役记录（15）以 `84a3f454` 为“删除前提交”。
- **删除清单（57 个受跟踪文件，`git rm`）：**
  - `src/core/synthetic/`（11）：`synthetic-scene.ts`、`synthetic-replay.ts`、`synthetic-snapshot.ts`，以及 `synthetic-scene{,-input,-restore,-step}.test.ts`、`synthetic-replay{,-compare,-record}.test.ts`、`synthetic-snapshot.test.ts`。
  - `src/render/synthetic/`（9）：`synthetic-appearance.ts`、`synthetic-camera.ts`、`synthetic-render-frame.ts`、`synthetic-renderer.ts`，以及 `synthetic-camera.test.ts`、`synthetic-render-frame.test.ts`、`synthetic-renderer{,-fault,-replay}.test.ts`。
  - `src/app/runtime/`（8）：`synthetic-event-bus.ts`、`synthetic-runtime.ts`，以及 `synthetic-event-bus.test.ts`、`synthetic-runtime{,-events,-fault,-lifecycle,-recording}.test.ts`。
  - `src/app/session/`（6）：`synthetic-session.ts`、`synthetic-session.test-support.ts`，以及 `synthetic-session{,-consumers,-fault,-replay}.test.ts`。`ControlledHost` 已在 [session-host.test-support.ts](../../../../../src/app/session/session-host.test-support.ts)，没有其他使用者引用被删的 test-support。
  - `src/app/composition/`（5）：`synthetic-demo-lifecycle.ts`、`synthetic-demo-owner.ts`、`use-synthetic-demo-owner.ts`，以及 `synthetic-demo-lifecycle.test.ts`、`synthetic-demo-owner.test.ts`。
  - `src/ui/game/`（14）：`synthetic-command-feedback.ts`、`synthetic-game-controls.ts`、`synthetic-game-store.ts`、`synthetic-keyboard-input.ts`、`synthetic-session-bridge.ts`、`synthetic-ui.test-support.ts`、`use-synthetic-game.ts`，以及 `synthetic-command-feedback.test.ts`、`synthetic-command-outcomes.test.ts`、`synthetic-game-controls.test.ts`、`synthetic-game-replay.test.ts`、`synthetic-game-store.test.ts`、`synthetic-keyboard-input.test.ts`、`synthetic-session-bridge.test.ts`。
  - `src/ui/dev/SyntheticDevPanel.tsx`、`src/ui/pages/SyntheticDemoPage.tsx`、`src/ui/render/SyntheticRenderView.tsx`（3）。
  - `e2e/support/demo-observations.ts`（1）。
  - 合计 32 个测试文件与 2 个 test-support；菜单入口已由 09 移除，删除时 `src` 中已无对 `SyntheticDemoPage` 的引用。
- **删除前的使用者核对：** 对每个待删文件的文件名在 `docs/` 以外的受跟踪文件中 `git grep`，排除待删集合本身后只剩：`fnv1a64.test.ts` 的 `osr-synthetic-snapshot`、`replay.test.ts` 与 `e2e/browser-replay.spec.ts` 的 `osr-synthetic-replay`（拒绝用的格式名）、[synthetic-content.test-support.ts](../../../../../src/content/synthetic-content.test-support.ts) 的 Asset ID `data/synthetic-scene`，以及 lint 规则的回归。前三者是字符串，不是模块引用，保留不变。待删模块从外部导入的 16 个模块中，只有 [browser-keyboard-source.ts](../../../../../src/platform/input/browser-keyboard-source.ts) 删除后不再有导入者；它是 P1-09 的正式平台键盘连接，不在[删除边界](../spec.md#合成演示退役)内，保留。保留的合成 fixture（`src/content/synthetic-content.test-support.ts`、`src/original-data/synthetic.test-support.ts`、`src/workers/synthetic-import.test-support.ts`、`src/content/flight/flight-data.test-support.ts` 的 `syntheticSceneSettings` 等）仍被内容、导入、查看器与 E2E 使用；`src/**/*.test-support.ts` 与 `e2e/support/*.ts` 删除后都仍有使用者（`app-entry.test-support.tsx` 由 `e2e/entries/app.html` 加载）。
- **lint 规则：** [eslint.config.js](../../../../../eslint.config.js) 删除 `coreArea`、`coreAreaImports`、`coreSyntheticBoundary`、插件中的 `core-synthetic-boundary` 注册与 `src/core/**` 的规则配置项；`moduleReferenceVisitors` 只剩 `osr/original-data-capabilities` 使用，其 `skipImport` 默认值不再可达，改为必填参数。随规则一起消失的还有“`errors.ts`、`determinism/` 不导入其余 Core”这一附带约束，属于获批的规则删除。[engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts) 删除 lint 回归 “keeps formal Core and core/synthetic/ from importing each other” 与依赖图回归 `describe('formal and synthetic Core dependency boundary')`（P3-02 AC-01，两例）；另把两个指向已删目录的假想探针路径改到现存目录且不改变原意：生产禁入 test-support 一例的 `./synthetic/probe.test-support.ts` 改为 `./world/probe.test-support.ts`（仍只断言 `support`），网络边界范围一例的 `src/render/synthetic/synthetic-renderer.ts` 改为 `src/render/scene/cleanup.ts`（仍断言查看器以外的 render 模块不在范围内）。Core 纯度与确定性、模块边界、原版数据能力、生产禁入 test-support、Worker 网络等其余规则与回归全部保留并通过。
- **`git grep`（AC-18）：** `git grep -n -E "core/synthetic|render/synthetic|ui/game/synthetic|app/runtime/synthetic|synthetic-session|synthetic-demo|Synthetic(Dev|Demo|Render)|use-synthetic|demo-observations|Start synthetic demo|synthetic-view|core-synthetic" -- src tools e2e eslint.config.js vite.config.ts playwright.config.ts 'tsconfig*.json' index.html package.json` 只剩：查看器与内容测试数据中的 Asset ID 字符串（`palette/synthetic-viewer`、`image/synthetic-viewer-*`、`model/synthetic-viewer`、`data/synthetic-view-labels`），不是模块引用；以及 [production-preview.spec.ts](../../../../../e2e/production-preview.spec.ts) 第 258 行 12 的产物检查（AC-15/AC-22）中的否定正则 `^src\/(?:core|render)\/synthetic\/|…(?:synthetic-[\w-]+|Synthetic\w+)\.tsx?$`，它断言这些退役路径不出现在生产 source map 中，是防止重新引入的守卫而非导入；该文件不在本项写入范围，保留与否已在 worker 报告中交协调者决定。
- **`pnpm check`：** 通过（类型检查、ESLint、Vitest 213 个测试文件 / 6268 个测试，删除前为 245 / 6980，差额正是删除的 32 个测试文件；生产构建成功）。
- **`pnpm test:e2e`（`OSR_E2E_DEV_PORT=5139 OSR_E2E_PREVIEW_PORT=5140`，三个项目）：** 第一次完整运行 195 个通过、1 个失败，失败的是已知的 `audio-playback.spec.ts:86`（真实隐藏后 Released 超时，`activeListeners` 残留 `ended`）；单独以 `--repeat-each 3` 重跑该 spec 时 9 个中 7 个通过，失败的两次（:86 与 :8）都是同一个残留 `ended` 监听。该 spec 及其支持代码只导入 `src/platform/audio`、`src/content/sound-payload.ts` 与 E2E 支持，不涉及本项删除的任何模块，按协调者指示不改音频代码，另行报告。最终代码上的第二次完整运行 196 个全部通过（11.8 分钟）：development 158、production 37、development-headed 1（`native-lifecycle.spec.ts`）。
- **rubber-duck：** 确认 57 个删除都在边界内、保留模块没有导入被删文件、唯一新的孤立实现是有意保留的 `browser-keyboard-source.ts`、lint 辅助函数仍在使用、两个改写的探针路径保持原意。唯一发现是上述 `production-preview.spec.ts:258` 的否定正则；它在本项写入范围外且属于 12 已验收的产物守卫，未改动，交协调者决定（选项见 worker 报告）。
- **simplify：** 复用、效率与层级三个角度无发现；简化角度指出 `moduleReferenceVisitors` 的 `skipImport` 默认值在规则删除后不可达，已改为必填参数并重跑 `pnpm check` 与完整 E2E。
- **文档影响：** 当前工程文档仍描述已删除的合成演示与规则（例如[工程约定](../../../../engineering/README.md)、[Core 模块说明](../../../../engineering/modules/core.md)、[源码结构指南](../../../../engineering/source-structure.md)），并有大量历史文档链接指向已删除文件；这些按[不包含](#不包含)归 15、16 的写入范围，本项不改动，已在 worker 报告中提出。本项不读取 `local/`，不涉及原版对照。
