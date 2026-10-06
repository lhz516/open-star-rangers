---
type: plan
status: active
phase: P2
task: "09"
subtask: "12"
updated: 2026-10-05
---

# 12 — 本地基准核对 CLI

**契约来源：** [spec](../spec.md) 的 S-14、AC-14、AC-13（CLI 输出隐私）、AC-15（工具指南）；[验证策略](../spec.md#验证策略)中的原版对照。
**依赖：** 10, 11。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **CLI：** 新增 `tools/logic-check.ts`，参数为 CloneCD 文件组路径：
  - 以 `fs.openAsBlob` 打开文件，组装为导入文件，运行与 Worker 相同的生产作业模块（`createImportJob`，默认产品入口与生产转换）；
  - 对收到的 `logic` 组运行 `validateGroup`，以 04 的字节解码入口解码 payload，再以 `loadMission` 载入；
  - stdout 输出一份 `osr-logic-check`/1 JSON，只含：结论、首个失败的 code 与结构位置、声明数、名称备用池条目数、编组数、成员位置数与布局元素数、生成矩形数、非 null 的放置引用、成员回指与 AI 目标计数、僚机选项数、机型条目数及各阵营计数、各 payload 字节数、`convert-logic` 的读取增量（最后一次进度减去该阶段开始时的读取量；P2-05 合入后识别与逻辑阶段之间多了图形阶段，见 goal 执行记录）、`ManifestIdentity` 与 payload 指纹，以及结构观测值与限值的对照；
  - 不输出名称、坐标、字段值、宿主路径或宿主错误文本。测试可注入合成白名单。
- **合成测试：** `tools/logic-check.test.ts` 用 05 的合成封包与合成光盘验证正向输出形状、失败输出（如 `unsupported-payload`）与隐私（输出不含 `MARKER`）。
- **本地运行：** 在开发者本机运行 `node tools/logic-check.ts local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}`，把计数与 scenario 的[来源概况](../../../../original/formats/scenario.md#campaign-candidate-source-profiles-confirmed-structure)和[切片字段清单](../../../../original/formats/scenario.md#selected-mission-field-inventory-confirmed-structure)核对。输出只留在 `local/research/p2-09/`。
- **文档：** 在[工具指南](../../../../guides/tools.md)新增本工具的用法与输出说明；若计数产生新的结构事实，按流程写入 `docs/original/`。
- **前提：** `local/StarRang/cd/` 有开发者的 CloneCD 文件组。缺少时本地运行部分为 blocked，不能用合成数据代替。

## 不包含

- 视觉或听觉对照；P2-12 的独立原版对照。
- 在浏览器中使用原版数据。

## 关键文件与契约

- **复用：** [import-job.ts](../../../../../src/workers/import-job.ts) 的 `createImportJob`；[completeness.ts](../../../../../src/content/completeness.ts) 的 `validateGroup`；04 的解码入口；11 的 `loadMission`；参照 [source-check.ts](../../../../../tools/source-check.ts) 的输出与错误约定。
- **计划新增：** `tools/logic-check.ts`、`tools/logic-check.test.ts`。
- **本地新增：** `local/research/p2-09/` 下的运行输出（被忽略，不提交）。

## 验收标准

- [x] AC-14：本地运行中组为 `group-complete`，`loadMission` 成功；输出包含规定的计数、读取增量与哈希；计数与 scenario 来源概况及 01 的字段清单一致；结构观测值都在限值之内（否则按 spec 修订限值并重新批准）。
- [x] AC-13：合成测试与本地输出都不含名称、坐标、字段值、`MARKER` 或私人绝对路径。
- [x] `pnpm exec vitest run tools/logic-check.test.ts`、`pnpm typecheck`、`pnpm lint` 与 `pnpm --silent check:original` 通过；`git status` 显示 `local/` 下的文件未被跟踪。
- [x] 工具指南已更新，链接与元数据检查通过。

## 验证方法

- Node 合成测试；本地运行命令与计数写入证据，不粘贴原版内容。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。
- 不适用 browser-testing。

## 完成证据

- **实现：** [logic-check.ts](../../../../../tools/logic-check.ts) 的 `runLogicCheck(paths, { catalog? })` 与 `main(argv)`：
  - **作业：** 以 `fs.openAsBlob` 打开输入，运行 `createImportJob(open)`，即与 Worker 相同的生产作业，含图形与逻辑步骤；只保留 `logic` 组。
  - **核对：** 先 `validateGroup`，完整后才读取清单；再以 `decodeLogicPayload` 按角色解码，并以 `loadMission` 载入。
  - **输出：** 一份 `osr-logic-check`/1 JSON，含结论、首个失败（code 与结构位置；Core 前提失败为 `core-input`）、版本 ID 与指纹、组状态、`ManifestIdentity`、各 payload 的 ID/角色/字节数/指纹、spec 列出的计数、11 项结构观测与限值，以及各阶段与总读取量。各阶段增量为“阶段最后一次进度减去该阶段开始时的读取量”，见 [goal 执行记录](../goal.md#执行记录)。
  - **退出码与资源：** 退出码为 0、1、2。`Blob` 没有关闭方法，文件描述符随回收或进程退出释放，已在代码与指南中注明。
- **测试：** [logic-check.test.ts](../../../../../tools/logic-check.test.ts) 6 个测试通过，合成 CloneCD 文件组写入临时目录，`SR.NOB` 与 `SCENARIO.NOB` 来自 `sliceCoveredFiles`：
  - **正向：**
    - 报告、组、payload、计数、限值与读取的键集合完全等于规定集合；
    - 计数等于合成任务的期望，11 项限值的名称与顺序固定且都在限值内；
    - 三个阶段的读取增量都大于 0，之和等于总读取量；身份与指纹符合哈希格式。
  - **失败：**
    - 不支持的任务报 `unsupported-payload@archive:/MAIN/SCENARIO.NOB#3019/header/height`，没有组、计数与限值，已发生的读取保留；
    - 生产白名单拒绝合成光盘（`unsupported-version`）；
    - 不存在的输入报 `read-failed@input[0]`；
    - 无参数或带选项时退出码为 2。
  - **隐私（AC-13）：** 任务中刻意放入位置、生成矩形与规则输入的数值，与名称、文件名标记、临时目录一起，都不出现在任何输出中。
- **本地运行（AC-14）：** `node tools/logic-check.ts local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}`，输出只保存在 `local/research/p2-09/logic-check.json`，未提交；`local` 是被忽略的符号链接。
  - **结论：** 退出码 0；版本 `star-rangers-1995-cd`；组为 `group-complete`，`loadMission` 成功。两次运行的输出完全相同，输出中的字符串只有哈希与固定标记。
  - **与[切片字段清单](../../../../original/formats/scenario.md#selected-mission-field-inventory-confirmed-structure)和[来源概况](../../../../original/formats/scenario.md#campaign-candidate-source-profiles-confirmed-structure)一致的计数：**
    - 声明 9（9 条唯一记录）、名称备用池 19（段 0）、生成矩形 3（段 3）；
    - 编组 3，成员位置 6（每个编组列出一条记录两次），布局元素 6（段 6 的两项各 2 个元素，两个编组共用一项）；
    - 非 null 的放置矩形 5（+0x44）、锚点 1（+0x48）、成员回指 3（+0x3C）、AI 目标 1（+0x58）；
    - 僚机选项 5；机型 6，其中玩家 1、友方 3、敌方 2（M2ID 槽位 0、1、7、8、14、17）。
  - **结构观测与限值：** 声明 9/256、段 1 记录 9/64、名称备用池 19/64、生成矩形 3/64、编组 3/64、每组成员 2/64、每组布局元素 2/256、候选名称 4/32、名称长度 11/63、僚机 5/16、payload 字节 7,021/1,048,576，都在限值之内，无需修订 spec。
  - **payload 字节：** 机型表 656、僚机名单 1,971、任务 4,394。
  - **读取：** 识别 17,255,043 字节、图形 992,544 字节、逻辑 61,152 字节，共 18,308,739 字节。
  - **新事实：** 计数没有产生新的结构事实，`docs/original/` 无需更新。
- **工程检查：**
  - `pnpm exec vitest run tools/logic-check.test.ts`、`pnpm typecheck`、`pnpm lint` 通过；
  - `pnpm check` 通过：116 个测试文件、3419 个测试与生产构建；
  - `pnpm build` 之后，`pnpm --silent check:original` 通过；
  - `git status` 不含 `local/` 下的文件。
- **rubber-duck：** 2 项阻塞与 4 项建议都已处理：
  - **读取基准（阻塞）：** 原文以识别结束为逻辑阶段的基准，P2-05 合入后会混入图形读取。已改为按阶段计算，并更正本子任务原文；
  - **隐私测试（阻塞）：** 加强为完整键集合与限值名称断言，并放入数值哨兵；
  - **总读取量：** 改为随进度更新，失败时也保留；
  - **组验证：** 先判定，不完整时不读取未经验证的清单字段；
  - **计数：** 删除契约之外的三项计数（带候选名称的声明、基地交互机型、model 数）；
  - **文件描述符：** `openAsBlob` 的描述符无法确定性关闭，改为在代码与指南中注明一次性进程的使用方式。
- **simplify：**
  - **已采纳：**
    - 解码改为按角色判别联合赋值，并输出带类型的结果；
    - 只保留 `logic` 组；
    - 限值观测改为引用计数；
    - 阶段读取改为记录各阶段首次进度。
  - **未采纳：**
    - 把组解码移到 `content/`：目前没有第二个调用方；
    - 与 `source-check` 共用 CloneCD 写入与 CLI 运行器：需要改动 P2-03 的工具与测试，超出本次范围。
- **文档影响：** [工具指南](../../../../guides/tools.md#逻辑组核对)新增脚本表的一行与“逻辑组核对”一节；STATUS 与 `docs/original/` 无需更新。
