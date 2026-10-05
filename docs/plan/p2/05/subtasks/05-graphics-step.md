---
type: plan
status: active
phase: P2
task: "05"
subtask: "05"
updated: 2026-10-05
---

# 05 — 图形转换步骤

**契约来源：** [spec](../spec.md) 的 S-06，S-09 的步骤部分，S-07 的共用读取；[步骤结果](../spec.md#步骤结果)、[限值与预算](../spec.md#限值与预算)；技术决定 3、8、10；AC-09，AC-10 的共用读取与迟到拒绝部分。
**依赖：** 04。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **步骤内条目读取（`src/original-data/conversion/`，计划新增）：**
  - 以（光盘路径、条目类型、条目 ID）为键，经 `VerifiedSource.openArchive` 与封包句柄的 `read` 读取，并缓存读取结果；
  - 同一条目在一次步骤中只物理读取一次，缓存随步骤结束释放；
  - 不建立跨步骤或通用的封包缓存；
  - 转换器只读取缓存的字节，不修改、不转移。
- **扩展 [verify-source-mappings.ts](../../../../../src/original-data/source/verify-source-mappings.ts)：** 增加可选的条目读取参数。传入时用它读取每个定位；不传时行为与现在完全相同。等价备选核对、错误改写到 `sources.mappings[i].parts[j].alternatives[k]`、首个错误终止、不修改输入，这些语义都不变。
- **计划新增步骤函数：** 输入为已验证来源、映射表、声明组与预算限值。
  1. 用共用读取核验映射表；
  2. 核对声明与映射一一对应，不一致报 `invalid-declaration`；
  3. 解析子资源：整条目为 null，此外只接受 `palette`（整条目图像记录的嵌入调色板）与 `fonts/<i>`（CCKD 字体目录）。其他子资源，或子资源与 kind 不匹配，报 `invalid-declaration`。等价备选已证明字节相同，从第一个备选取字节；
  4. 调用 04 转换；
  5. 转换成功后，把含子资源的映射置为 `verified`，再用 `assetSourceStates` 得到不带定位的来源状态；
  6. 返回冻结的结果：只含有 Asset 的组，按 `RESOURCE_GROUPS` 顺序；每组的描述符、payload 与来源状态都按 Asset ID 升序、一一对应；外加转换用量。

  任一失败都抛出，不返回部分结果，也不输出任何 Asset 的状态或 payload。读取错误保持 P2-02/P2-03 的层、code 与位置。
- **测试：** 用 [disc.test-support.ts](../../../../../src/original-data/disc/disc.test-support.ts) 的 `syntheticFileDisc`、[synthetic.ts](../../../../../src/original-data/synthetic.ts) 的 `buildImfat`，以及 [source.test-support.ts](../../../../../src/original-data/source/source.test-support.ts) 的 `catalogFor` 构造已验证来源。端口带计量。
  - **AC-09：**
    - 整条目映射经核验后为 `verified`；含 `palette` 或 `fonts/<i>` 的映射只在转换成功后为 `verified`；
    - 损坏的字体使步骤失败、无结果；
    - 结果分区、排序与一一对应；两个共用 DATA 定位的调色板 Asset 字节相同、ID 不同、各在本组；
    - 用步骤输出的 `cockpit-hud-map` 部分，加上满足其余角色的合成 Asset（在 [synthetic-content.test-support.ts](../../../../../src/content/synthetic-content.test-support.ts) 的原版导入形状上替换），组成的组经 `validateGroup` 得到 `group-complete`；
    - 结果中不含定位、条目编号或原版字节。
  - **AC-10：**
    - DATA 被两个映射共用、CCKD 被三个字库共用时，各只物理读取一次（计量端口的读取次数与字节）；
    - 读取已发生后转换才因预算被拒：已发出的读取仍计入 `sourceReadBytes`，结果全部丢弃；
    - P2-03 现有的 `verify-source-mappings` 测试不改即通过。
- **文档：** 在[源码结构](../../../../engineering/source-structure.md)记录步骤、共用读取、子资源语法与结果形状；在“版本识别与已验证来源”一节注明核验的可选读取参数。

## 不包含

- 生产声明与映射：归 [06](./06-production-graphics.md)。
- 作业接入、阶段进度与用量合并：归 [07](./07-worker-integration.md)。
- 组清单、`ContentIdentity` 与组消息：归 P2-06/07/11。

## 关键文件与契约

- **修改：** [verify-source-mappings.ts](../../../../../src/original-data/source/verify-source-mappings.ts) 及其测试（只增加用例）。
- **计划新增：** `src/original-data/conversion/` 下的条目读取、步骤函数与相邻测试（尚不存在）。
- **复用：** [source-mapping.ts](../../../../../src/original-data/source-mapping.ts) 的 `assetSourceStates`；[identify-source.ts](../../../../../src/original-data/source/identify-source.ts) 的 `VerifiedSource` 类型；[archive-reader.ts](../../../../../src/original-data/archive/archive-reader.ts) 的类型，只能纯类型导入。

## 验收标准

- [ ] AC-09 全部条件通过，包括 `group-complete`。
- [ ] AC-10 共用读取：共用条目只物理读取一次；迟到拒绝时读取用量保留、结果丢弃。
- [ ] `verifySourceMappings` 不传读取参数时行为不变，P2-03 测试全部通过。
- [ ] 能力规则无违规：`original-data/conversion/` 不值导入 `archive/` 或 `imfat.ts`；`pnpm exec vitest run src/original-data tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 合成光盘测试，带计量端口，不读取 `local/`。
- 不适用 browser-testing 或原版对照。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
