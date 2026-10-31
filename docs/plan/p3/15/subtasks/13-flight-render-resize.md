---
type: plan
status: active
phase: "P3"
task: "15"
subtask: "13"
updated: "2026-10-30"
---

# 13 — 飞行画面缩放取样失败的定位与修复（修复项）

**契约来源：** [spec](../spec.md) 的 S-09、AC-10（`pnpm test:e2e` 通过，失败须修复并重跑）；被测契约为 [P3-12 spec](../../12/spec.md) 的 AC-05、AC-16（缩小后的画面是同一逻辑画面，每个设备像素显示其中心所在的逻辑像素）。处置依据见 [goal 执行记录](../goal.md#执行记录) 2026-10-30“修复项 13”。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 定位 [flight-render.development.spec.ts](../../../../../e2e/flight-render.development.spec.ts) 第 63 行用例的间歇失败：窗口缩到 520 宽（缓冲 485×364，缩放 0.7578125）后，2–12 个设备像素没有显示其中心所在的逻辑像素，而是显示上下或左右相邻一格的颜色（协调者的临时探针：逻辑坐标 x 259、377–383，y 191–192 一带，旁边是驾驶舱叠加的红/黄色，失配色为蓝色系）。[P3-14/29](../../14/subtasks/29-full-e2e-remediation.md#完成证据) 已确认它在 P3-13 的提交上同样失败，P3-12/P3-13 当时在 Chrome 155 上通过，本机 Chrome 已升到 156。
- 先查明是哪一个图层（星云、星点、尘埃、三维模型、效果，或驾驶舱/叠加的合成）没有按“设备像素中心 → 逻辑像素”的取样，或者是浏览器合成（画布缩放、`image-rendering`）引入的偏移；用可重复的证据（逐层关闭、读回中间结果或单元测试）说明根因。
- 按根因修复：
  - 若产品某层违反 P3-12 AC-05/AC-16：在该层的渲染代码中修复，补单元或浏览器回归，保持其他验收不变；这是对 P3-12 交付的修复，记入其模块说明的已知问题或交接。
  - 若是测试对某层的假设错误（该层按契约本就不是逻辑像素取样），或是浏览器在 Chrome 156 上不可控的取样差异：修正测试判据，使其只对契约规定的内容做逐像素断言，并写明依据；不得用笼统容差掩盖产品缺陷。
- 修复后该用例单独连续 10 次通过；顺带复核 [map-picture.development.spec.ts](../../../../../e2e/map-picture.development.spec.ts) 第 211 行（完整套件高负载下失败一次、单独 3/3 通过）是否有对负载敏感的时间窗口，只记录结论，必要时另报。

## 不包含

- 与本失败无关的渲染或驾驶舱改动；改变任何原版对照结论。

## 关键文件与契约

- `src/render/flight/**`（星云 `nebula/`、星点 `starfield/` 等以 `texelFetch(floor(texel))` 取逻辑像素）、`src/render/cockpit/**`、`src/render/flight/composition/logical-screen.ts`；[render 模块说明](../../../../engineering/modules/render.md)。

## 写入范围

- `e2e/flight-render.development.spec.ts`：测试判据（仅在根因证明测试有误时）。
- `e2e/support/flight-pictures.ts`：读回辅助（如需）。
- `src/render/flight/**`：产品修复与单元测试（仅在根因为产品缺陷时）。
- `src/render/cockpit/**`：同上。
- `docs/engineering/modules/render.md`：已知问题或交接说明。
- `local/research/p3-15/flight-render/**`：私有探针与读数。

## 验收标准

- [x] 根因有可重复的证据，并说明是产品缺陷、测试假设错误还是浏览器取样差异。
- [x] 按根因修复后，`flight-render.development.spec.ts:63` 单独连续 10 次通过，其余 `flight-render.development` 与 `flight-render.production` 用例通过；没有用笼统容差掩盖产品缺陷。
- [x] `pnpm check` 通过；文档与修复一致；`map-picture.development.spec.ts:211` 的复核结论已记录。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)：`pnpm test:e2e e2e/flight-render.development.spec.ts --project=development --repeat-each=10`（或单独用例），以及 `e2e/flight-render.production.spec.ts --project=production`；修复的产品代码有单元测试；`pnpm check`。

## 完成证据

- **2026-10-30（worker exec/p3-15-13）：**
  - **根因（已确认，产品缺陷）：** 违反 P3-12 AC-05/AC-16 的是各层在“设备像素中心恰在逻辑像素边上”时的取舍不一致，不是测试假设，也不是浏览器合成。
    - **两组读数：** 第一幅 640 宽画面是 1×，没有恰在边上的中心，`expectF1Background` 通过，因此偏差出在缩小后的画面。缓冲 485 × 364（缩放 97/128）时，设备行 145 的中心恰为逻辑 192.0。
    - **探针：** 私有探针（`local/research/p3-15/flight-render/`）沿用同一流程，读回整块设备像素，逐像素对照第一幅画面与独立算出的背景（星云、星点）。
    - **失配像素的来源：** 4 个失配设备像素都显示星云第 191 行的颜色。第一幅画面在第 191 行的这些位置是驾驶舱叠加色，第 192 行是背景色。
    - **各层取舍：** 星云、星点、尘埃与 Warp 效果用插值后的 `texel = position.xy` 取整，得 191.99…，落在 191 行。驾驶舱用 `floor((bufferHeight − gl_FragCoord.y) / scale)`，落在 192 行；该行透明，片元被丢弃。合成结果是“第 191 行的星云、没有第 191 行的叠加”，任何逻辑像素都不是这个组合。
    - **为什么间歇：** 失败取决于运行抽到的星云起点在第 191、192 行这些列是否同色，所以时过时不过。
    - **按 [x·s, (x + 1)·s) 逐像素严格比较的读数：** 修复前缓冲 485 宽有 95–96 处、576 宽（缩放 0.9）有 1561–1619 处不合，其中测试判据下的不一致像素 0–28 个。世界各层在 485 与 576 宽时取边前一行、在 365 宽时取边后一行；驾驶舱的浮点除法在 576 宽时也有 4–5 处取了边前一行。
    - **浏览器版本：** 与 Chrome 155→156 的关系未确认（无法在本机启动 155）。插值误差的方向本来就不受契约约束，是潜伏缺陷。
  - **修复：** [logical-screen.ts](../../../../../src/render/flight/composition/logical-screen.ts) 新增各层共用的 `LOGICAL_PIXEL_GLSL`。
    - **规则：** `logicalPixel()` 由 `gl_FragCoord` 的设备像素按整数运算 ⌊(2d + 1)·320 ÷ 缓冲宽度⌋ 取逻辑像素，行自顶向下，夹在逻辑画面内；恰在边上时一律取边后的像素。
    - **辅助：** 新增 `logicalBufferUniform`/`setLogicalBuffer`，每帧设置缓冲尺寸。`logicalQuad` 比图像每边多一个逻辑像素，使覆盖不依赖光栅化的边规则；图像外的逻辑像素丢弃。
    - **改用的层：** 星云（减去 footprint 原点 `origin`）、星点与速度尘埃、Warp 效果，以及驾驶舱层。
  - **不改的层：** 爆炸精灵与受击闪烁的屏幕门不属本失败，保留原取法，作为已知问题记入 [render 模块说明](../../../../engineering/modules/render.md#画面合成)。测试判据未改：根因是产品缺陷，原判据在边上允许两侧，修复后也成立。
  - **单元测试：**
    - 新增 `logical-screen.test.ts`：固定着色器的整数表达式与 y 翻转，并对 298、365、485、576、640、960、1280 宽的每个设备像素核对半开区间规则，含 485 宽时 145 → 192。
    - 星云、星点/尘埃、Warp、驾驶舱四个层的测试断言片元着色器含共用规则、顶点着色器无插值坐标，`logicalBuffer` 等于帧的缓冲尺寸（485 × 364 或 1280 × 960）。星云的测试另断言 `origin` 等于 footprint 原点。
  - **浏览器验证（Chrome 156.0.8078.74，headless，端口 5133/5134，只用合成内容）：**
    - **修复后探针：** 485 宽 6 次、576、365、298 宽各 2 次，严格不合均为 0。
    - **`flight-render.development`：** `pnpm test:e2e e2e/flight-render.development.spec.ts --project=development --repeat-each=10` 在修复后与精简后各跑一次，均 30 passed，其中 :63 用例 10/10。
    - **`flight-render.production`：** `--project=production` 1 passed。
    - **相关回归：** `cockpit-lifecycle`、`cockpit.development`/`cockpit.production`、`flight-scenes.development`、`map-picture.development`/`map-picture.production` 在两个项目下修复后与精简后各跑一次，均 40 passed，9 个按项目跳过。
  - **`pnpm check`：** 通过（Vitest 446 个文件、11,902 个测试，构建成功）。
  - **`map-picture.development.spec.ts:211` 复核（只记录，未改动）：** 本机单独运行 3/3 通过。该用例的断言多以帧 tick 区间的上下界判定，下面两处对负载敏感，属测试判据，不是产品缺陷：
    - **携带计数的延迟：** “携带的计数推迟切换”断言 `change.after + 1 − pressAgain.high > 5` 用的是切换前最后一帧的下界 `after`。预期延迟约 9 tick，余量约 4 tick（125 ms）。高负载下切换前后帧稀疏时，`after` 提前，断言可能失败，而产品行为正确。
    - **周期判定：** `fitsPeriod(held, 20) === false` 要求四次切换的区间合计窄于约 12 tick。帧间隔与发布滞后增大时，区间变宽，20 tick 的周期也可能被判为符合。
    - **建议：** 由该用例的所有者（P3-13 的维护）把这两处并入已有的“预算超出则重试”循环，或以帧间隔为条件重试。不在本子任务写入范围内。
  - **复审：** code-review 子代理未发现缺陷。它提出的两点已处理：给公式补 Node 单元测试；把受击闪烁屏幕门的同类取法记入已知问题。simplify 的四路复审后，三份四边扩展四边形合并为 `logicalQuad`，星点层恢复解构参数，驾驶舱注释改为引用共用规则。另有两条未采纳：一是把 uniform 移到合成层统一设置，二是 `origin` 与 `mesh.position` 重复；理由是需要更大改动，且测试依赖 `mesh.position`。
  - **文档影响：** 更新 [render 模块说明](../../../../engineering/modules/render.md)：画面合成中的共用取样规则、此前的缺陷与已知问题，以及驾驶舱层引用。`docs/original/`、unknowns、ADR 与 spec 无需改动：未改变原版结论或冻结决定。
