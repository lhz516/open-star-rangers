---
type: plan
status: active
phase: P2
task: "08"
subtask: "11"
updated: 2026-10-05
---

# 11 — 生产音效表与生产格式规则

**契约来源：** [spec](../spec.md) 的 S-01（生产规则）、S-03（生产行）、S-12（本子任务部分），AC-03、AC-13（生产表与研究记录一致）；[切片音效集合](../spec.md#切片音效集合)、[Asset ID 规则](../spec.md#asset-id-规则)、[采样格式规则](../spec.md#采样格式规则)、[音效描述符与生产音效表](../spec.md#音效描述符与生产音效表)、[包身份](../spec.md#包身份)。
**依赖：** 06、10。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **生产行：** 在 06 建立的 `src/original-data/conversion/production-sounds.ts` 中，依据 09、10 写入 `docs/original/` 的结论，填入切片音效集合的全部行：
  - **核心角色：** 四个核心角色的每个变体一行，ID 为 `sound/<角色词干>`；有多个变体时，用途已确认的按用途命名，否则用中性序号。`role` 为对应的切片角色。
  - **模型可达样本：** 其余模型可达的 SND 每个一行，ID 为 `sound/model-clip/<两位序号>`，`role` 为 `model-sound`。序号一次分配后冻结，不由条目编号或槽位推导。
  - **别名与共用：** 同一角色内，精确重复的条目作为同一部件的 `alternatives`，同一源样本只形成一个 Asset；既属于核心角色又被模型引用时，用核心角色的 ID。
  - **映射字段：** 每行的 `confidence`、`unknowns` 与 `evidence` 与 `docs/original/` 的记录一致；`evidence` 指向具体章节。
  - **跨角色共用样本：** 两个核心角色用到字节完全相同的不同条目时，按 spec 的“切片音效集合”各建一个 Asset。每个 Asset 只映射到原版为该角色播放的条目，不互列 `alternatives`。导弹与 Warp 开始即属此类。
  - **冲突处理：** 若两个核心角色用到同一个条目，按 spec 记为契约问题，本子任务 blocked，修订 spec 后再继续。
- **生产格式规则：** 写入研究确认的取值：切片中出现的每个 `flags` 值，及其声道数与循环方式；16 位按 `s16le` 接受。未研究的取值不写入。
- **版本：** 生产 `ConverterVersion` 保持 `osr-import.audio-1`。这是生产表首次填入；P2-11 接线缓存之前没有任何持久化的旧输出，因此不需要递增。之后对表或规则的任何改动，都按 spec 的规则递增组件。
- **测试：** 新增读取真实生产表的 Node 测试，并让边界回归覆盖 locator 不外泄。
  - **06 留下的空表测试须迁移：** 以下测试在空表下运行生产音频阶段，表填入后会因合成光盘缺少生产 SND 条目或空表断言而失败：[production-sounds.test.ts](../../../../../src/original-data/conversion/production-sounds.test.ts) 的空表与空规则断言，以及只含生产图形的合成光盘场景（[import-job.test.ts](../../../../../src/workers/import-job.test.ts) 与 [import-pipeline.test.ts](../../../../../src/app/import/import-pipeline.test.ts) 的图形用例、[import-worker.test-support.ts](../../../../../src/workers/import-worker.test-support.ts) 与 [import-worker.spec.ts](../../../../../e2e/import-worker.spec.ts) 的 `graphics` 场景）。
  - **迁移方式：** 推荐在合成生产光盘中加入与生产表对应的合成 SND 条目，并更新这些场景的预期；也可以让只关心图形的用例注入 `NO_AUDIO`，另保留一个经生产音频阶段的组合用例。
- **文档：** 在源码结构指南记录生产表的位置、行形状与“唯一绑定”规则。

## 不包含

- 研究结论本身（09、10）；本子任务只把已记录的结论写入代码。
- 基准镜像上的运行核对（12）。
- 模型到样本的依赖边（P2-06）。

## 关键文件与契约

- **修改：** `src/original-data/conversion/production-sounds.ts`（06 新增）与其测试（计划新增）。
- **复用：** 04 的行读取与投影；[source-mapping.ts](../../../../../src/original-data/source-mapping.ts) 的 `readSourceMappingTable`。
- **允许的内容：** 条目编号、类型标签与光盘路径属于来源定位，P2-01 的设计允许它们出现在 `original-data/` 的映射中；不得出现样本字节、名称或其他原版内容。

## 验收标准

- [x] AC-03：只有一张生产音效表。
  - 四个核心角色各至少一行；
  - ID 唯一、升序，符合 Asset ID 规则，不含条目编号；
  - 每行的 locator 都是 `MAIN/SR.NOB` 的 `SND`，`subresource` 为 null；
  - 非 `confirmed` 的行都列有 U 项，证据指向 `docs/original/`；
  - 各行的 `mapping` 投影能通过 `readSourceMappingTable`。
- [x] AC-03（边界）：locator 不出现在 `content/`、`platform/`、`app/`、`ui/` 的任何导出中，依赖图回归通过。
- [x] AC-13（一致性）：四个核心角色都不是 `unconfirmed`；每行的置信度与 U 项与 `docs/original/` 的记录一致；生产规则只含研究确认的取值。
- [x] 生产 `ConverterVersion` 仍为 `osr-import.audio-1`，06 的测试保持通过。
- [x] `pnpm exec vitest run src/original-data src/workers tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint`、`pnpm check:original` 通过。

## 验证方法

- Node 测试读取真实生产表与规则。人工审阅每行与 `docs/original/` 记录的对应关系，并在证据中列出：行数、各角色的行数、置信度分布，以及 `docs/original/` 的链接。
- 不适用浏览器检查；基准镜像在 12 中核对。
- 完成前按 execute-goal 流程，以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **生产表：** [production-sounds.ts](../../../../../src/original-data/conversion/production-sounds.ts) 的 `PRODUCTION_SOUND_TABLE` 共 18 行，都映射到 `MAIN/SR.NOB` 的一个整条 `SND` 条目，`confidence` 为 `confirmed`，`resolution` 为 `declared`。依据为 [audio](../../../../original/formats/audio.md#slice-sample-set-and-role-correspondences-p2-08) 的角色对应与[试听对照](../../../../original/formats/audio.md#listening-comparison-p2-0810)。

  | 角色 | 行数 | ID |
  |---|---:|---|
  | `explosion-sound` | 6 | `sound/explosion/blast-v1`…`blast-v4`（四个 EXPL 效果音，随机选择、用途相同，因此用中性序号）、`sound/explosion/other`、`sound/explosion/player` |
  | `fire-sound` | 4 | `sound/fire/base`、`sound/fire/enemy-v1`、`sound/fire/enemy-v2`（两种敌机的炮）、`sound/fire/player` |
  | `missile-sound` | 1 | `sound/missile` |
  | `warp-sound` | 1 | `sound/warp`（只映射 Warp 开始播放的条目，与导弹的字节相同条目互不列为别名） |
  | `model-sound` | 6 | `sound/model-clip/01`…`06`（槽 0、3 的样本，含义未确认，带 U-027；证据另指向 mesh 的 MODL 表） |

  - **覆盖：** 13 个模型可达样本中，属于核心角色的 7 个用核心 ID，其余 6 个为片段；另有 Warp 条目与 4 个 EXPL 效果音。
  - **ID：** 序号一次分配后冻结，不含条目编号；没有两个核心角色共用同一条目。
  - **对照：** 置信度、U 项与证据都与 `docs/original/` 的记录一致。
- **生产规则：** `PRODUCTION_SND_RULES` 只接受切片中出现的 `flags`：0 为单声道循环至停止，1 为单声道播放一次；`s16le` 为 true。值 8 等未研究的取值以 `unsupported-payload` 拒绝。依据见 audio 的[播放解释](../../../../original/formats/audio.md#playback-interpretation-p2-08)。
- **版本：** `PRODUCTION_CONVERTER_VERSION` 保持 `osr-import.audio-1`（首次填入，没有持久化的旧输出）；06 的测试保持通过。
- **AC-03：** [production-sounds.test.ts](../../../../../src/original-data/conversion/production-sounds.test.ts) 逐行核对以下内容：
  - 角色、ID 与 locator；
  - `confirmed`/`declared`，以及每行确切的 `unknowns` 与 `evidence`：核心角色为试听与角色对应两节，片段为角色对应与 MODL 表，并带 U-027；
  - ID 不含四位以上的数字；
  - 映射投影能单独通过 `readSourceMappingTable`。

  行序、唯一性、角色 ID 规则与“一条目只属一个 Asset”由 `readSoundTable` 在模块加载时执行，表若违反则模块无法加载。
- **AC-03（边界）：** locator 不外泄由既有的 [engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts) 的 “original-data dependency boundary” 回归覆盖。它从全部 `src/` 生产模块沿解析后的依赖图检查，除 `original-data` 与 `workers` 外都不能到达 `original-data`；生产表位于 `original-data`，因此自动受约束，无需新增用例。
- **转换核对：** `productionSoundEntries()`（[production-sounds.test-support.ts](../../../../../src/original-data/conversion/production-sounds.test-support.ts)）在表的各条目处生成合成 SND。宽度交替为 8 与 16 位；`flags` 按原版取值，只有三个槽 0 条目为 0。生产表与规则在其上转换：
  - 得到 18 个 Asset，来源状态都为 `verified`，用量等于 `PRODUCTION_SOUND_USAGE`；
  - 只有 `model-clip/01`–`03` 为循环 payload；
  - 每个条目恰好读取两次（核验与转换）。
- **06 测试的迁移：** 原 `graphicsCoveredFiles()` 改名为 `productionCoveredFiles()`，并加入 `productionSoundEntries()`。经生产音频阶段的用例因此得到完整的生产 `audio` 组，预期统一为 `PRODUCTION_CONVERSION_USAGE`：
  - [import-job.test.ts](../../../../../src/workers/import-job.test.ts) 的生产转换用例；
  - [import-pipeline.test.ts](../../../../../src/app/import/import-pipeline.test.ts) 的图形用例；
  - [import-worker.spec.ts](../../../../../e2e/import-worker.spec.ts) 的 `graphics` 场景。

  空表断言已改为真实表的断言。
- **命令：**
  - `pnpm check` 通过（114 个测试文件、3,281 个测试，构建成功）；`pnpm check:original` 通过。
  - `pnpm test:e2e import-worker.spec.ts --project=development` 12 个全部通过。默认端口 4174 被另一个工作树的 `vite preview` 占用，按工程约定改用 `OSR_E2E_DEV_PORT=4273 OSR_E2E_PREVIEW_PORT=4274`；那个进程不属于本会话，没有停止它。
- **rubber-duck：** 没有阻塞问题。审阅确认了以下几点：行覆盖与研究一致，EXPL 效果音属于爆炸角色，ID 命名合规，不需递增版本，边界已由既有回归覆盖。两个非阻塞问题已修正：
  - 合成条目原把全部片段设为循环，现在只有槽 0 条目为 `flags` 0；
  - 证据断言原只核对格式，现在逐行核对确切数组。
- **simplify：**
  - **采纳：** 合成光盘改名为 `productionCoveredFiles()`；三处重复的用量算式统一为 `PRODUCTION_CONVERSION_USAGE`；循环条目集合不再导出，并去掉了同义反复的断言。
  - **未采纳：**
    - 两次读取 SND：spec 明确接受；
    - 模块加载时校验：与 P2-05 一致，只有 18 行；
    - 精简表声明：会改变已批准的 `readSoundTable` 契约；
    - 在生产数据中逐条记录 `flags`：这一事实属于 SND 头部；
    - 精简 18 行的逐行断言：这正是 AC-03 的证据；
    - 在 `original-data` 中复用 workers 的夹具：会造成跨层导入。
- **文档影响：** [源码结构指南](../../../../engineering/source-structure.md)已更新：生产音效一节写入唯一绑定、行形状、行数、规则、版本规则与测试支持，测试支持与集成测试的描述改为完整的生产 `audio` 组。[工程约定](../../../../engineering/README.md)中 `graphics` 场景的预期也已更新。原版事实在 10 中已记录，这里不需修改。

