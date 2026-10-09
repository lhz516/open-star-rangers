---
type: plan
status: active
phase: P3
task: "03"
subtask: "09"
updated: 2026-10-09
---

# 09 — 飞行表现数据的 payload 契约

**契约来源：** [spec](../spec.md) 的 S-08（视角标签）、S-09（场景设置）、S-10、S-11、AC-11、AC-14（结构限值）、AC-18；[Asset 与角色](../spec.md#asset-与角色)、[规范 payload](../spec.md#规范-payload)。
**依赖：** 04, 05, 06。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在计划新增的 `src/content/flight/` 中定义 models 组的 4 个 data 角色：
  - `scene-settings`：两组灯光颜色、+0x18 字节、+0x1C–+0x24 的三个 `f32`、三组屏幕闪光参数，以及 04 确定的其余头部字段；
  - `explosion-table`：`lists` 恰为 3 张，每项为 `{ sound, animation }` 两个 Asset 引用，以及 05 确定的 EXPL 其他字段；
  - `explosion-animation`：`frames` 为按帧序的图像引用，至少 1 项，以及 05 确定的逐帧或动画参数；
  - `nebula-backgrounds`：`images` 为按 NEBC 顺序的图像引用。
- 在计划新增的 `src/content/hud/view-labels-payload.ts` 中定义 cockpit-hud-map 组的 `view-labels`：`labels` 恰为 `{ subMode: 8, text }` 一项，文字为字节串。
- 每个族的 payload schema 版本初始为 1；编码经 06 的共用模块；结构限值按 04、05 的观测值推导。错误码为 `invalid-flight-data-payload`、`flight-data-reference-mismatch` 与 `non-canonical-payload`。
- 绑定检查：kind 为 `data`、角色正确，依赖恰为 payload 内的 Asset 引用。爆炸表引用动画 data Asset 与 sound Asset，动画引用 image Asset，星云列表引用 image Asset，引用的 kind 都须一致。
- 用代码生成的合成内容编写单元测试，覆盖 AC-11 的往返、坏输入、引用与依赖不一致，以及隔离。

## 不包含

- 原版解析：归 13、14。
- 图像与调色板 payload：沿用 P2-05，不新增。
- 转换、映射与 ID 链：归 16、17。
- 爆炸选择、背景方向等表现规则：归 P3-07、P3-12。
- 模块分册：由 22 同步。

## 关键文件与契约

- [effect-payload.ts](../../../../../src/content/effects/effect-payload.ts) 与 [status-messages-payload.ts](../../../../../src/content/hud/status-messages-payload.ts)（只读）：同组 data payload 的先例。
- 06 新增的 `src/content/canonical-json.ts`。
- 04、05 的完成证据，以及 [executable](../../../../original/formats/executable.md) 与 [textures](../../../../original/formats/textures.md)。
- 计划新增：`src/content/flight/` 下的模块与测试，`src/content/hud/view-labels-payload.ts` 与其测试。

## 写入范围

- `src/content/flight/**`：4 个 payload 族的类型、限值、读取器、编码、测试与合成支持（新建）。
- `src/content/hud/view-labels-payload.ts`：视角标签 payload（新建）。
- `src/content/hud/view-labels-payload.test.ts`：单元测试（新建）。

## 验收标准

- [x] AC-11（5 个族）：往返逐字节相同；各类坏输入按 code 拒绝；引用与描述符依赖不一致时报 `flight-data-reference-mismatch`；结果冻结且与输入隔离。
- [x] AC-14（结构限值）：恰等于上限时通过，超出 1 时拒绝；观测值写入完成证据。
- [x] 字段名与类型符合字段处理规则；没有表现规则或默认值。
- [x] AC-18：不导入 `original-data`，测试不读取文件。
- [x] `pnpm exec vitest run src/content tools/engineering-boundaries.test.ts` 与 `pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 单元测试，使用代码生成的合成内容。不涉及浏览器或原版数据。

## 完成证据

2026-10-09，worker `exec-p3-03-09`，基于认领提交 e16bf8f。

- **新增模块与接口（交 13、14、16、17、19，交 22 写入 content 分册）：**
  - [flight-data-content.ts](../../../../../src/content/flight/flight-data-content.ts)：`FLIGHT_DATA_ROLES`（`scene-settings`、`explosion-table`、`explosion-animation`、`nebula-backgrounds`）与 `FlightDataRole`；`FLIGHT_DATA_SCHEMA_VERSIONS`（按角色，均为 1）；`FLIGHT_DATA_LIMITS`（`payloadBytes` 16,384、`explosionListItems` 16、`animationFrames` 32、`nebulaImages` 32）；`FLIGHT_DATA_FORMAT`（格式规则：`explosionLists` 3、`colourComponents` 3、`screenFlashes` 3）；类型 `SceneSettings`、`SceneColour`、`SceneDeviceValues`、`ScreenFlash`、`ExplosionTable`、`ExplosionEntry`、`ExplosionAnimation`、`NebulaBackgrounds` 与按角色区分的联合 `FlightDataPayload`。
  - [flight-data-readers.ts](../../../../../src/content/flight/flight-data-readers.ts)：`readSceneSettings`、`readExplosionTable`、`readExplosionAnimation`、`readNebulaBackgrounds` 与 `readFlightDataContent(role, value, path?)`；结果深度冻结、与输入隔离；共用基础读取器的错误统一为 `invalid-flight-data-payload`。
  - [flight-data-payload.ts](../../../../../src/content/flight/flight-data-payload.ts)：`encodeFlightDataPayload(payload, reserve?)`（经 06 的 `encodeCanonicalJson`，先以字节长度调用 `reserve`）；`decodeFlightDataPayload(bytes, descriptor)`，判定顺序为字节检查（上限、转移）→ 描述符（角色须为上述 4 个之一、kind 为 `data`，否则 `invalid-flight-data-payload`；schema 不符为 `unsupported-payload-schema`）→ 规范 JSON 与严格读取 → 依赖；`flightDataDependencies(payload)` 严格读取后返回描述符应有的依赖（引用去重、按 ID 升序），供 17 生成描述符。
  - [view-labels-payload.ts](../../../../../src/content/hud/view-labels-payload.ts)：`VIEW_LABELS_ROLE`（`view-labels`）、`VIEW_LABELS_SCHEMA_VERSION`（1）、`VIEW_LABELS_LIMITS`（`payloadBytes` 256、`textBytes` 32）、`VIEW_LABELS_FORMAT`（格式规则：`labels` 1、`subMode` 8）、类型 `ViewLabels`/`ViewLabel`，以及 `readViewLabels`、`encodeViewLabelsPayload(content, reserve?)`、`decodeViewLabelsPayload(bytes, descriptor)`（依赖须为空，否则 `flight-data-reference-mismatch`）。
  - 测试支持 [flight-data.test-support.ts](../../../../../src/content/flight/flight-data.test-support.ts)：`syntheticSceneSettings`、`syntheticExplosionTable`、`syntheticExplosionAnimation`、`syntheticNebulaBackgrounds`、`syntheticFlightPayload`、`syntheticFlightAsset`（规范字节与匹配的 models 组描述符）。
- **形状与字段处理规则：**
  - `scene-settings`（RENS 10751 +0x00–+0x57，executable 的 RENS 头部表）：`lightType3Colour`（+0x00–+0x08）、`lightType0Colour`（+0x0C–+0x14），各为按存储顺序的 3 个 `f32`；`deviceByte`（+0x18，u8）；`deviceValues: { base (+0x1C), kinds1c7c (+0x20), kindsF8000 (+0x24) }`（`f32`）；`screenFlashes`：恰 3 项，按 +0x28、+0x38、+0x48 的顺序，每项 `{ randomMask: u32, duration: f32, drawIntervalTicks: u32, level: i32 }`。名称只取已确认的用途（灯光以类型 3/0 创建、设备值 `0x175210`、掩码与随机值相与、时长比较、加到时钟的间隔、乘以剩余比例的等级）；“方向光/环境光”“距离阈值”只在类型注释中按高概率标注，连同 U-027、U-028。+0x19–+0x1B 无人读取，不转换（规则 6，由 13 核对为零）；+0x48 的掩码有类型，0 原样保留（规则 3）；+0x58 起属 `data/projectile-visuals`。`f32` 须有限且能被 `f32` 精确表示（`Math.fround(v) === v`，否则为类型错误），整数按 u8/u32/i32 的值域核对，−0 规范化为 0。
  - `explosion-table`：`lists` 恰 3 张（格式规则），按 EXIC 顺序；每项为 `{ sound, animation }`，均为 `AssetReference`，kind 分别须为 `sound` 与 `data`。EXPL 只有这两个字段（textures §7），没有其他字段可转换。列表可以为空、可含重复项；选择规则归 P3-07。
  - `explosion-animation`：`frames` 为按帧序的 `image` 引用，1–32 项；数据中没有逐帧或动画参数（textures §6），时序与位置归代码规则。按协调者决定，帧没有自带调色板，本 payload 不涉及 `palette/explosion/<nn>`。
  - `nebula-backgrounds`：`images` 为按 NEBC 顺序的 `image` 引用，0–32 项，可含重复项；起点与方向归 P3-12。
  - `view-labels`：`labels` 恰 1 项 `{ subMode: 8, text }`；`text` 为 0–32 字节的字节串（码位 1–255，不含 NUL），不解释也不改写。
  - 没有默认值、规则或换算；载入变换只有 IMFAT 重定位，与本项无关。
- **依赖绑定：** 描述符依赖须恰为 payload 内的引用去重后按 ID 升序（id 与 kind 都相同），否则为 `flight-data-reference-mismatch`：爆炸表 → 动画 data Asset 与 sound Asset（跨组的 `sound/explosion/blast-v1`–`v4` 由 17 填入）；动画 → 帧图像；星云列表 → 星云图像；场景设置与视角标签无依赖。
- **AC-14（结构限值，观测值 → 上限）：** EXIC 每张列表最多 7 项 → 16；ANIM 每条目最多 12 帧（全部 186 帧的范围）→ 32；NEBC 10661 15 项 → 32；TABL 10399 第 8 项 16 字节（本切片只读取该项）→ 32。固定数目（3 张 EXIC 列表、3 个颜色分量、3 组屏幕闪光、1 个标签、子模式 8）是格式规则。`payloadBytes` 是解析前的字节上限，取各结构都在上限时的最大编码（128 字符的 ID、最长的数字写法）向上取整到 2 的幂：飞行数据最大编码实测 15,713 字节（爆炸表）→ 16,384，视角标签 32 个 `\u00ff` 约 229 字节 → 256；测试证明最大内容在上限之内。各列表都在读取元素之前判定长度：恰等于上限通过，超出 1 时（第 17 项、第 33 项等写为 `null`）在读取该项之前即以列表路径拒绝。交 13、14：解析器以这些常量作为 `textBytes` 与 `payloadItems` 的限值。
- **AC-11：** [flight-data-readers.test.ts](../../../../../src/content/flight/flight-data-readers.test.ts)（54 个）、[flight-data-payload.test.ts](../../../../../src/content/flight/flight-data-payload.test.ts)（47 个）、[view-labels-payload.test.ts](../../../../../src/content/hud/view-labels-payload.test.ts)（37 个），对 5 个族：
  - **往返：** 每个角色编码、解码、再编码逐字节相同；规范文本的字段顺序、无空白、`-0` 写作 0，次正规数与需要 17 位有效数字的 `f32` 逐位保留；码位 1–255 的标签文字（含引号、反斜杠、控制字符、0x7F、0x80–0xFF）往返；相同内容得到相同字节，缓冲区独立且长度恰好；`reserve` 恰调用一次，参数为字节长度，读取器拒绝的内容不调用。
  - **拒绝：** 缺少字段、未知字段、类型错误（字符串数字、非数组、类实例、稀疏数组、带额外属性的数组、`f32` 无法表示的值、超出 `f32` 范围、整数越界与小数）、非规范编码（空白、字段顺序、`-0`、更长的数字写法、可打印字符的转义、大写十六进制转义、重复键）、非有限数（解码 `1e999`，读取 NaN 与无穷大）、超限、错误的引用 kind、无效 Asset ID、尾随换行与非 JSON、非 ASCII 字节、超出字节上限（先于描述符判定）、已转移的字节、未知角色、kind 不是 data、schema 版本不符，以及用另一角色的读取器读取。
  - **引用：** 缺少、多出或替换依赖，以及场景设置或视角标签带依赖，都为 `flight-data-reference-mismatch`。
  - **隔离：** 结果深度冻结（赋值抛出 `TypeError`）；修改输入对象、输入字节或先前结果都不影响后续读取；两次解码得到不同但相等的对象。
  - **诊断：** 只含 code 与结构路径，测试以秘密标记核对不回显文字、ID 与数值。
- **AC-18：** `src/content/flight/` 与 `view-labels-payload.ts` 只导入 `content/` 内的模块；合成数据全部由代码生成，数值是任意选取的合成值，没有原版数值、文字或字节；测试不读取文件。`tools/engineering-boundaries.test.ts` 通过。
- **检查：** `pnpm exec vitest run src/content tools/engineering-boundaries.test.ts`：32 个文件、1,198 个测试通过；`pnpm typecheck`、`pnpm lint` 通过；`pnpm check`：161 个文件、4,881 个测试与生产构建通过；`pnpm check:original` 退出码 0，`findings` 为空。
- **Rubber-duck：** 对照 spec、格式文档与协调者决定审阅全部新增文件，没有发现问题。
- **Simplify：** 采纳：测试改用既有的 `asciiBytes`/`asciiText`（graphics-format.ts）与 `bitsOf`（effects.test-support.ts）；删去与读取器默认路径重复的 `PATHS` 表。未采纳：不导出 `VIEW_LABELS_ROLE` 等常量（16、19 生成描述符时需要，与 `STATUS_MESSAGES_ROLE` 同例）；解码时字节检查执行两次（与 logic 相同，06 已说明保留理由）；依赖去重的少量临时数组（payload 至多 48 项）；把飞行数据与视角标签共用的严格读取与编解码外壳提到共用模块（属 `contract-validation.ts`/`canonical-json.ts`，在本行写入范围之外，可在后续统一）。
- **文档影响：** 格式文档、U 项、工程约定与命令都未改变，本行不改文档。交 22：content 分册新增 `flight/` 目录与 `hud/view-labels-payload.ts`（上述接口、5 个角色的形状、schema 版本、限值与推导所用观测值、错误码与判定顺序）；源码目录树加入 `src/content/flight/`。没有 STATUS 或阶段索引的变化。
