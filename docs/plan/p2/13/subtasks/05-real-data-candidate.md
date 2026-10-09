---
type: plan
status: active
phase: P2
task: "13"
subtask: "05"
updated: 2026-10-08
---

# 05 — 真实数据候选核对

**契约来源：** [spec](../spec.md) 的 S-01、S-02、AC-01、AC-05、AC-08 与 AC-12；技术决定 3、4。
**依赖：** 无。
**执行方式：** 自动。agent 在本地 Node 中读取本机的原版光盘镜像，不需要用户。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **运行：** 在干净工作树的当前提交上，从检出根运行被忽略的候选核对脚本：

  ```sh
  node --preserve-symlinks --preserve-symlinks-main local/research/p2-12/candidate/candidate-check.ts --label p2-13
  ```

  脚本读取 `local/StarRang/cd/STAR_RANGERS.{ccd,cue,img,sub}`，自行运行 `pnpm build`，并计算构建指纹。
- **记录（只记身份、计数与结论）：**
  - 提交、构建指纹、完整 `ContentIdentity`、脚本文件的 SHA-256；
  - 作业完成、四组完整、全包判定 `complete`、各类计数满足切片定义、没有合成来源；
  - 两次运行的身份、payload 指纹与 `MissionSetup` 摘要相同，`loadMission` 成功；
  - 作业与全包校验的耗时。
- **与 P2-12 比较：** 与 `final-26b.json` 及其构建清单比较 `ContentIdentity`、按 Asset ID 排序的 payload 指纹、`MissionSetup` 摘要与构建指纹。
  - **相同：** 记录比较结果。
  - **不同：** 列出差异；生产受影响时按技术决定 4 记为问题，交协调者新增重做对照的子任务。
- **负向确认：** 以 `--label p2-13-neg --drop-group audio` 运行一次，确认脚本以非零退出码报告，证明它仍会失败。
- **不可用时：** 原版数据或脚本不可用时本项为 blocked（技术决定 3），不以合成数据代替。

## 不包含

- 修改脚本的断言或比较规则；新的原版对照（P2-12 的判定由 01 判断适用性）。
- 推进 tick 或随机生成世界。

## 关键文件与契约

- 被忽略的 `local/research/p2-12/candidate/candidate-check.ts` 与 `final-26b.json`、`final-26b-build-manifest.txt`；[P2-12/12](../../12/subtasks/12-candidate-check.md#完成证据)、[P2-12/31](../../12/subtasks/31-hud-resource-gap.md#完成证据)。
- [content-identity.ts](../../../../../src/content/content-identity.ts)、[slice-definition.ts](../../../../../src/content/slice-definition.ts)、[completeness.ts](../../../../../src/content/completeness.ts)、[load-mission.ts](../../../../../src/core/mission/load-mission.ts)。

## 写入范围

- 本 worker 工作树中被忽略的生产构建输出（dist 目录）：每个工作树各有一份，不与其他行共享，因此不列为共享路径。
- `local/research/p2-12/candidate/p2-13*`：本次运行的输出（被忽略；不覆盖 P2-12 的记录）。

## 验收标准

- [ ] AC-05：核对脚本退出码 0，上述各项通过；与 `final-26b` 的身份比较已记录，相同或差异已按技术决定 4 处理；被跟踪的证据只含身份、计数、哈希与结论。
- [ ] AC-01（候选部分）：构建指纹与完整 `ContentIdentity` 已记录并绑定提交。
- [ ] AC-08（本轮部分）：`loadMission` 在当前候选上成功，两次载入深度一致。
- [ ] 负向运行以非零退出码报告缺组。
- [ ] AC-12：失败时写明受影响的退出条件、原责任任务与恢复条件；没有时写明“无”。被跟踪的文件没有改动，证据中没有原版内容或宿主绝对路径。

## 验证方法

- 运行上述两条命令，记录退出码与输出摘要；`shasum -a 256 local/research/p2-12/candidate/candidate-check.ts`；比较两份 JSON 记录的身份字段。
- 不涉及浏览器验证。原版证据：只读本机光盘镜像，输出留在 `local/`。

## 完成证据
