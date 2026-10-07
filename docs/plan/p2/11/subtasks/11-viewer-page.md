---
type: plan
status: active
phase: P2
task: "11"
subtask: "11"
updated: 2026-10-06
---

# 11 — 查看器页面

**契约来源：** [spec](../spec.md) 的 S-06（显示）、S-07、S-08、AC-10（E2E）、AC-11 至 AC-15 的浏览器部分、AC-18（回退显示 E2E）、AC-24，以及[查看器操作](../spec.md#查看器操作)与[行为与边界](../spec.md#行为与边界)中的打开查看器、交互、WebGL 不可用、上下文丢失、试听各行。
**依赖：** 04, 06, 09, 10。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新增查看器页面（`src/ui/viewer/`），由 `App` 在 `viewer` 画面挂载，通过 hook 使用 10 的所有者：
  - **条目列表：** 按组列出模型、效果形状、图像、调色板、布局、字库、音效与任务；默认不选中，选中后提交查看意图。资源包不完整时只列出已完整的组，并始终显示不完整的说明。
  - **画面：** 4:3 画面区域，可以用 Tab 到达，有可见的焦点指示，有含当前项 Asset ID 的无障碍名称。键盘操作只在画面获得焦点时生效，监听只注册在画面元素上。按键与步长见 spec [查看器操作](../spec.md#查看器操作)，同样的操作也有按钮。
  - **视图控件：** 部件列表切换（附置信度说明）、光照模式切换（附“不是原版光照”）、导弹旋转映射序号、效果颜色原值、“贴图映射未确认”标记。
  - **任务：** 以文字显示 04 的结构摘要、引用校验与载入结果（成功或失败的类别、路径与原因），不显示原版文字。
  - **试听：** 播放、停止单个与停止全部按钮；显示音频状态与不可用原因。
  - **状态：** 渲染状态（就绪、上下文丢失、不可用、失败）以 `status` 或 `alert` 显示；WebGL 2 不可用时列表、任务诊断与试听仍可用。
  - React 只提交意图，不绘制画面，不在每帧重渲染。
- **开发项目 E2E**（测试入口，用合成的 `models` 场景或 `synthetic` 场景导入后进入查看器）：
  - AC-10：任务摘要与 Node 对同一输入的计算一致；一个失败场景显示类别、路径与原因；页面不含 `MARKER`；
  - AC-11 至 AC-13：模型、每类二维项、每种效果至少一个合成样本，在已知像素位置读回的颜色等于期望值，误差为 0；样本含中间亮度颜色；
  - AC-14：空闲 2 秒内请求的动画帧数为 0；改变画面的交互恰好绘制一次；在 10 个条目间切换后 GPU 计数等于只显示当前条目时的计数；返回菜单后画布断开，上下文已丢失；模拟上下文丢失后显示状态，恢复后已知像素与之前相同；WebGL 关闭的浏览器中列表、任务诊断与试听仍可用（沿用 [webgl-unavailable.spec.ts](../../../../../e2e/webgl-unavailable.spec.ts) 的方法）；
  - AC-15：可信点击前没有运行中的音频上下文；点击后进入 `running` 并有发声；停止后发声为 0；返回菜单后上下文已关闭；注入不可用的音频能力时显示原因；
  - AC-18（回退）：带贴图的导弹元素与碎片显示颜色或诊断灰色，并显示“贴图映射未确认”；
  - AC-24：Tab、Enter、Space 与焦点指示；画面获得焦点时每个按键按规定改变视角并恰好绘制一次，焦点在列表或按钮上时按键不改变画面；离开后监听已撤销；宽、窄两种窗口与两种设备像素比下，画面位置与 `computeViewportLayout` 一致，已知像素颜色不变。

## 不包含

- 刷新恢复（12）；Fast Refresh（13）；生产预览（14）；效果贴图坐标（16）。

## 关键文件与契约

- 计划新增 `src/ui/viewer/` 的页面、组件与 hook；修改 [App.tsx](../../../../../src/app/App.tsx) 以挂载查看器画面。
- 计划新增 E2E 用例与必要的支持函数（例如查看器的像素读回）；复用 [browser-probes.ts](../../../../../e2e/support/browser-probes.ts)、[image-observations.ts](../../../../../e2e/support/image-observations.ts)、[audio-playback.ts](../../../../../e2e/support/audio-playback.ts)。

## 验收标准

- [x] AC-10（E2E）、AC-11 至 AC-13（像素读回）、AC-14、AC-15（浏览器）如上。
- [x] AC-18（回退显示）由 E2E 断言。
- [x] AC-24：键盘、焦点、监听撤销与布局如上。
- [x] 不完整资源包只列出已完整的组并显示说明；页面没有禁用词与原版文字。
- [x] `pnpm check` 与开发项目的相关 E2E 通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 用合成数据、隔离 context 运行 `pnpm exec playwright test <新用例> --project=development`；WebGL 关闭用例使用独立启动的浏览器。
- Node：`pnpm exec vitest run src/ui src/app src/render`。完成前 `pnpm check`。
- 按 execute-goal 做 rubber-duck 与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **实现：**
  - **页面：** [ViewerPage.tsx](../../../../../src/ui/viewer/ViewerPage.tsx)、[ViewerAudioPanel.tsx](../../../../../src/ui/viewer/ViewerAudioPanel.tsx)、[viewer-copy.ts](../../../../../src/ui/viewer/viewer-copy.ts) 与 [viewer-keys.ts](../../../../../src/ui/viewer/viewer-keys.ts)：
    - 按种类列出条目，默认不选中；
    - 所选条目的失败或变体（部件列表附内容与置信度，效果视图附各形状原值、绘制字节与“Texture mapping unconfirmed”标记），模型的中性光、导弹的贴图旋转序号；
    - 4:3 画面区域、视图按钮、渲染状态与按需刷新的诊断；
    - 试听（播放、单个停止、全部停止、状态与失败原因）与任务的结构摘要（逐个列出解析到的模型是否在模型组中）；
    - 资源包不完整时的说明。

    文案为英文，只显示结构与计数，不显示原版文字。
  - **hook：** [use-viewer-owner.ts](../../../../../src/app/composition/use-viewer-owner.ts) 在 effect 中经查看器槽位打开所有者，卸载、StrictMode 重跑、Fast Refresh 与更换容器时关闭。
  - **外壳与菜单：** [App.tsx](../../../../../src/app/App.tsx) 的 `ViewerScreen` 与每个应用实例一个的查看器槽位；返回时先关闭槽位再切换画面。[app-flow.ts](../../../../../src/app/flow/app-flow.ts) 增加只阻止查看器的锁存，[MainMenuPage](../../../../../src/ui/pages/MainMenuPage.tsx) 在锁存后禁用入口并说明原因。
  - **按键：** 监听以 `addEventListener` 只注册在画面元素上，离开时撤销；没有用 React 的 `onKeyDown`，因为它委托在根节点上，与 spec 的“监听只注册在画面元素上”不符。
  - **测试入口：** 新增 `audio=unavailable`，[app-entry.ts](../../../../../e2e/support/app-entry.ts) 同步；生产项目忽略新用例。
- **执行中修正的实现问题（各有回归测试）：**
  - **未绑定的方法：** 所有者与查看器音频的 `getSnapshot`、`subscribe` 原是类方法，`useSyncExternalStore` 以未绑定方式调用时页面报错；改为绑定的箭头属性，与渲染器一致。
  - **空部件列表：** 显示空部件列表时，09 的显示以空参数调用 `Group.add()`，Three.js 在控制台报错；改为没有网格时不调用，Node 测试证伪确认。
  - **合成导弹数据：** [production-effects.test-support.ts](../../../../../src/original-data/conversion/production-effects.test-support.ts) 中合成导弹的元素步长原为 0，元素环退化为一点，任何视角都画不出来。改为显式的常量对象，元素步长为 π/3，其余常量值不变。只改合成测试数据，转换与效果的 Node 测试全部通过。
  - **锁存后的画布（rubber-duck）：** hook 原先在调用 `lifecycle.open` 之前就创建表面，槽位锁存后仍会创建并遗留画布。改为 `open(create)` 只在决定创建所有者时调用 `create`；表面工厂的 `RollbackError` 不再降级为不可用的渲染器，而是使槽位锁存。
- **Node 测试：**
  - [viewer-page.test.ts](../../../../../src/ui/viewer/viewer-page.test.ts) 5 条：按键映射与修饰键，变体标签，颜色原值（含 −0），任务摘要逐个模型的文字，未载入时为空。
  - [app-flow.test.ts](../../../../../src/app/flow/app-flow.test.ts) 新增查看器锁存一条：只阻止查看器，第一次原因优先，返回与在菜单上收到时焦点移到标题。
  - [viewer-owner.test.ts](../../../../../src/app/viewer/viewer-owner.test.ts) 新增：锁存的槽位不调用工厂；工厂的 `RollbackError` 锁存；快照方法可以未绑定调用。
  - [viewer-solids.test.ts](../../../../../src/render/viewer/viewer-solids.test.ts) 新增空部件列表不报错。
- **浏览器（按 browser-testing）：** 本机 Chrome（Playwright `channel: 'chrome'`，无头），开发服务器 `http://127.0.0.1:4173` 的测试入口，隔离 context，1280×800，DPR 1，只用合成数据。导入 `models` 场景的合成光盘后进入查看器。
  - **期望值来源：** 由同一合成光盘在 Node 中经同一生产作业转换出的资源包计算（[viewer-observations.ts](../../../../../e2e/support/viewer-observations.ts)）。
  - **二维：** 取纹素中心的像素；透明纹素处期望棋盘格灰度。
  - **三维：** 在 Node 中以查看器自己的渲染模块构建同一场景并做射线检测，只取 3×3 邻域都命中同一网格（贴图部件为同一不透明纹素）的像素。
  - **比对：** 画面区域截图在页面内解码后逐字节比较。

  [viewer-page.spec.ts](../../../../../e2e/viewer-page.spec.ts) 共 11 条，全部通过：

  | 准则 | 设置与操作 | 期望 | 观察到的证据 | 结果 |
  |---|---|---|---|---|
  | AC-10 | 导入 `models` 场景，打开查看器 | 按种类列出全部条目，默认不选中；任务摘要与 Node 的 `diagnoseMission` 一致，逐个列出模型是否在模型组中；无 `MARKER`，无可玩声明 | 六种标题各一，按钮数等于目录条目数；摘要的各项计数与每个模型的行都与 Node 结果一致 | 通过 |
  | AC-10（失败） | 预置并恢复内容测试支持的占位资源包 | 任务失败显示类别、位置与原因；占位条目只标记失败 | `mission/…` 类别与技术细节；两个条目各显示 code 与位置 | 通过 |
  | AC-12 | 图像、调色板、字库、布局各一 | 已知像素逐字节等于期望值，含中间亮度 | 四种都逐字节一致，误差 0 | 通过 |
  | AC-11、AC-13、AC-18 | 贴图与未贴图的模型各一，三种效果各一 | 读回逐字节一致；未贴图模型的颜色等于内容给出的部件颜色；导弹元素为诊断灰色；导弹与带贴图碎片显示标记，弹丸不显示 | 全部一致；导弹元素需向下转 45° 才可见，页面与 Node 用同一视图 | 通过 |
  | AC-14 | 空闲 2 秒；在 10 个条目间切换；按键、光照、部件列表、导弹类型与贴图旋转序号；模拟上下文丢失与恢复；返回后重开 | 空闲帧 0；改变画面的操作各绘制 1 次，不改变的为 0；丢失时显示状态，恢复后像素相同；返回后画布断开且上下文丢失；重开只显示同一条目时 GPU 计数相等 | 都如期望 | 通过 |
  | AC-14（WebGL 关闭） | 以禁用 WebGL 的独立浏览器打开查看器 | 显示原因，不回退到 2D；列表、任务与试听可用 | `alert` 显示原因，没有画布；条目可选，摘要一致，试听进入 `running` 并启动一个发声（12 改为以探针的 `started()` 计数，见 12） | 通过 |
  | AC-15 | 安装 P2-08 的音频探针，播放、单个停止、全部停止、返回 | 点击前没有音频上下文；点击后 `running` 并有发声；停止后发声为 0；返回后上下文已关闭；声音列表与音频组一一对应 | 上下文列表依次为 `[]`、`running`、`['closed']`；每次点击恰好启动一个发声（12 修正：合成声音不足 1 毫秒，原来的“仍在路由”检查不稳定）；路由的节点数在停止后归零 | 通过 |
  | AC-15（不可用） | `audio=unavailable` | 显示原因，其他功能不受影响 | 状态为 `unavailable`，试听报 `audio-unavailable`；图像照常显示 | 通过 |
  | 不完整资源包 | `graphics` 场景（不转换任务与模型） | 只列完整的组，始终显示说明 | 说明列出四组状态；没有模型与效果标题，有布局 | 通过 |
  | AC-24（键盘） | Enter 与 Space 操作条目按钮、部件列表单选、光照复选框、视图按钮；Tab 到画面区域；画面上的按键；焦点在按钮上时的按键；返回与重开 | 控件响应键盘；画面有焦点轮廓与含 Asset ID 的名称；每个按键按规定改变视角并绘制 1 次；按钮上无效；同一文档中离开后监听少 1 个，重开后恢复 | 都如期望 | 通过 |
  | AC-24（布局） | DPR 1 与 2 各一个 context，1280×800 与 520×900 两种窗口 | 布局等于以容器尺寸与真实绘制上限计算的 `computeViewportLayout`；画布位置等于布局的 frame；已知像素不变 | 四种组合都一致，像素逐字节相同 | 通过 |

- **检查：**
  - `pnpm exec vitest run src/app src/ui src/render src/original-data/conversion src/content/effects`：通过；
  - `pnpm check`：152 个文件 4,496 条测试，构建通过（第一次运行时，`tools/e2e-configuration.test.ts` 在负载下超过 5 秒超时；单独重跑通过，整体重跑全部通过）；
  - `pnpm exec playwright test --project=development`：75 条通过（含新用例与因共享辅助函数改动而受影响的既有用例）；
  - `pnpm exec playwright test --project=production`：18 条通过。
- **Rubber-duck：** 2 个阻塞问题与 2 个非阻塞问题，均已处理：
  - **阻塞：**
    - 锁存后仍创建画布、表面工厂的 `RollbackError` 未锁存：修正如上，并补 Node 测试；
    - AC-10 要求逐个列出模型是否在模型组中，原页面只有汇总，E2E 又以同一个文字函数计算期望值：页面改为逐个列出；E2E 改为由 `diagnoseMission` 的字段独立断言各项事实。
  - **非阻塞：**
    - **期望值与渲染同源：** 未贴图模型的样本颜色另与内容给出的部件颜色比对；布局改用画布上下文的真实绘制上限。几何位置仍由同一渲染模块计算，这一点在浏览器与 Node 之间逐字节一致即可说明。
    - **覆盖不足：** 补上声音列表与音频组一一对应、单个停止、光照与部件列表与导弹类型各绘制一次、贴图旋转序号不绘制、单选与复选框与按钮的键盘操作，以及同一文档中的监听计数。
- **Simplify：** 采纳：
  - 共享的 `sliceFiles`（[app-entry.ts](../../../../../e2e/support/app-entry.ts)）与 `seedPackage`（[resource-cache.ts](../../../../../e2e/support/resource-cache.ts)），导入页面与菜单用例同样改用；
  - 空闲帧改用既有的 `frameWindow`；
  - 解析结果按进程缓存，并新增 `firstEntry`；诊断一次读取全部行；
  - 同一候选只计算一次样本；布局轮询每次只刷新一次诊断；Enter 与 Space 用例参数化；
  - 合成导弹常量改为显式对象。

  未采纳：
  - **React 的 `onKeyDown`：** 它委托在根节点上，不满足监听只在画面元素上的要求；
  - **复用 `FailureNotice` 显示条目失败：** 条目失败没有层与类别文案，强行套用需要新的文案类别；
  - **共享空 store、合并截图解码：** 各两三行，抽取的收益不明显；
  - **注入预转换资源包以免每条用例都导入：** 需要新的测试入口能力，整份用例约 1.3 分钟，可以接受；
  - **以 React 辅助函数代替绑定方法：** 渲染器已用绑定的箭头属性，保持一致；
  - **把演示与查看器的锁存合并为按画面的通用锁存：** 超出本子任务范围。
- **文档影响：**
  - [工程约定](../../../../engineering/README.md)：测试入口的 `audio=unavailable`，页面流转的查看器锁存，新增“查看器页面”一节；
  - [源码结构](../../../../engineering/source-structure.md)：目录树，槽位 `open(create)`；
  - [键位文档](../../../../engineering/keyboard-input.md)：新增查看器诊断键。

  STATUS 无需改动。
