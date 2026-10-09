---
type: guide
status: active
phase: all
updated: 2026-10-09
---

# 原版证据的自助获取

agent 遇到关于原版的问题时，先用本指南的途径自己取得证据，不把查证工作交给用户，也不请用户试玩原版。适用于 spec 起草与审阅、goal 分解、子任务执行与阻塞处理。

## 先自助，再问用户

先判断问题类型：

- **事实问题：** 原版怎样运作、画面是什么样、数据是什么。由 agent 按下表查证。
- **决定问题：** 行为取舍、范围、数值目标、冻结决定、spec 与 goal 的批准。仍按各 skill 的规则问用户。

按代价从低到高选用足以回答问题的途径，可以组合使用：

| 顺序 | 途径 | 用法 |
|---|---|---|
| 1 | 已有记录 | [original/](../original/) 中的待确认事项、格式、行为与键位文档，以及相关任务的证据 |
| 2 | 本地原版数据 | `local/StarRang/` 中的文件，配合 [tools/](./tools.md) 中的核对脚本与 `src/original-data/` 解析器 |
| 3 | 逆向 | `tools/ghidra/` 脚本做无界面分析，必要时用 DOSBox-X 调试器；见[基准环境](./baseline-environment.md#静态分析) |
| 4 | 参考视频与公开资料 | 用浏览器工具查看下文的[参考视频](#参考视频)；公开网页资料同样只能作线索 |
| 5 | agent 运行原版 | 用 Computer Use 操作本地基准环境，见 [agent 运行原版](#agent-运行原版) |

本项目自己的页面表现用 [browser-testing](../../.agents/skills/browser-testing/SKILL.md) 自行验证，不请用户点击核对。

以上途径都不足以回答时，才请用户提供帮助。请求要写明：

- 已尝试的途径，以及为什么不够。
- 用户要做的最小操作：在哪个画面或关卡、观察什么、需要多长时间。能用一张截图解决的，不请用户试玩。

仍须由用户亲自完成的情况：

- 决定与批准。
- 需要人的感知而 agent 无法用数据比较代替的判断，例如试听。
- agent 无法访问的实体设备与系统，例如其他操作系统的实机检查。
- Computer Use 规则要求交给用户的操作，例如系统权限与身份验证提示。

## 参考视频

[Let's Play Star Rangers](https://www.youtube.com/playlist?list=PL6K1_LepsaN9BzGd3l9UCy0yYu8kakBya) 播放列表由 Space Game Junkie 于 2017 年 2 月上传，共 5 段，约 2 小时 17 分钟，覆盖战役第 1–8 关。视频 1 开头显示录制者在 DOSBox 中挂载安装目录与光驱后启动游戏；游戏版本、难度与画面设置未知。

下表按 30 秒抽样整理，时间为近似值。飞行、战略地图与 Warp 贯穿全程，表中只列关卡分段和飞行之外的画面。

| 视频 | 时长 | 关卡 | 飞行之外的画面（约） |
|---|---|---|---|
| [1](https://www.youtube.com/watch?v=u8x41Jb5U3E)（`u8x41Jb5U3E`） | 30:09 | 1–2 | 0:00 DOSBox 启动；2:30 发行商标志、片头动画与标题；5:30 战役选项菜单；6:30 第 1 关简报；7:00 僚机选择（人物档案）；12:00 停靠过场；12:30 基地维修画面；17:30 任务统计；18:00 第 2 关简报；29:30 过场；30:00 任务统计 |
| [2](https://www.youtube.com/watch?v=HwssRl7jGGc)（`HwssRl7jGGc`） | 21:19 | 3 | 0:00 第 3 关简报；1:30、11:00 飞行中左显示屏的通讯头像；20:00 过场与晋升画面；21:00 任务统计 |
| [3](https://www.youtube.com/watch?v=-_Pj5jHSXBg)（`-_Pj5jHSXBg`） | 32:49 | 4–5 | 0:00 战役高分榜；1:00 第 4 关简报；11:30 基地近景；12:00 基地维修画面；14:00 高分榜；14:30 第 5 关简报；15:00 主选项菜单；23:00–25:00 左显示屏雪花；25:30 基地维修画面；32:30 高分榜 |
| [4](https://www.youtube.com/watch?v=v8CsokrSFec)（`v8CsokrSFec`） | 28:15 | 6–7 | 0:00 第 6 关简报；5:30–7:00 左显示屏雪花；7:30 基地维修画面；11:00 高分榜；11:30 第 7 关简报；20:30 基地近景；21:00 基地维修画面；27:30 授勋过场；28:00 高分榜 |
| [5](https://www.youtube.com/watch?v=csiIdcZn8yA)（`csiIdcZn8yA`） | 24:23 | 7 汇报、8 | 0:00 第 7 关汇报；1:00 僚机选择；7:30 基地维修画面；21:00 过场；21:30 任务统计（含勋章） |

### 取帧

用浏览器工具打开播放页取帧，不下载或转存视频文件。先静音、暂停并关闭自动字幕，否则字幕会遮住画面下部；遇到广告先等它结束。以下代码可交给 Playwright 的 `browser_run_code`，把指定秒数的帧存到 `local/research/video/<视频 ID>/`：

```js
async (page) => {
  const repo = '<仓库绝对路径>';
  const id = 'u8x41Jb5U3E';
  const times = [570, 600]; // 秒
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`https://www.youtube.com/watch?v=${id}`);
  await page.waitForTimeout(4000);
  await page.evaluate(() => {
    const video = document.querySelector('video');
    video.muted = true;
    video.pause();
    document.getElementById('movie_player').unloadModule('captions');
  });
  for (const t of times) {
    await page.evaluate((t) => new Promise((done) => {
      const video = document.querySelector('video');
      video.addEventListener('seeked', done, { once: true });
      video.currentTime = t;
    }), t);
    await page.waitForTimeout(250);
    const name = String(t).padStart(5, '0');
    await page.locator('video').screenshot({ path: `${repo}/local/research/video/${id}/${name}.jpg`, type: 'jpeg' });
  }
}
```

要浏览整段视频时，以 30 秒间隔取帧，再拼成带时间标签的总览图逐张查看：

```sh
ffmpeg -loglevel error -y -framerate 1 -pattern_type glob -i 'local/research/video/<id>/*.jpg' \
  -vf "scale=320:180,drawtext=fontfile=/System/Library/Fonts/Supplemental/Arial.ttf:text='%{eif\:trunc(n*30/60)\:d}\:%{eif\:mod(n*30\,60)\:d\:2}':x=4:y=4:fontsize=22:fontcolor=yellow:box=1:boxcolor=black@0.7,tile=6x6" \
  'local/research/video/sheet-<id>-%d.jpg'
```

本机若已有 `local/research/video/` 下的抽样帧与总览图，可直接复用。视频帧只放在 `local/`，不进入文档、提交或公开报告。

### 证据限度

- 视频的游戏版本、模拟器与画面设置未知；画面经过缩放与有损压缩，宽高比被拉伸到 16:9，不是原始像素。
- 因此只凭视频的结论最高标为**高概率**；与本地数据、代码或本地基准运行相互印证后，才能标为已确认。
- 像素、调色板、分辨率与宽高比只按本地数据或本地截图判定。总计划要求带容差的数值对照（速度、射速、能量等）只能在本地基准环境中测量，视频只作粗略核对。
- 录制者的解说与 YouTube 章节、字幕不是证据。
- 记录写明视频编号或 ID、时间点（例如 `视频 3（-_Pj5jHSXBg）12:00`，可链接到 `https://www.youtube.com/watch?v=<id>&t=<秒>s`）和文字结论，不转录画面中的原版文字。

## agent 运行原版

需要视频没有覆盖的画面、本地基准版本的原始像素，或按容差测量时，由 agent 用 Computer Use 操作[基准环境](./baseline-environment.md)：

- 按基准环境指南启动 DOSBox-X。DOSBox-X 窗口由像素绘制，需要截图模式观察，并用按键操作游戏。
- 原始像素截图用 DOSBox-X 的 **Capture** 菜单保存到 `local/StarRang/captures/`；它们是基准版本的原始像素，可以用来判断分辨率与颜色。
- 游戏会改写 `SRANGER.CFG` 与 `SRHISCOR.RAW`：运行前备份，结束后还原，不覆盖用户的存档。用测量工具运行时，游戏只在私有副本中运行，不需要这一步。
- 需要运行中的内存数值、计数或时间关系，或按容差测量时，用 `tools/baseline/measure.py` 在私有副本中运行，见[运行时测量](./runtime-measurement.md)。
- 遵守 Computer Use 自身的确认与交接规则；用户正在使用该应用时让出操作。
- 同一时间只能有一个会话操作基准环境。并行执行 goal 时，由协调者统一进行。
- **本机限制（2026-10-08/09 实测）：** 本机的 Computer Use 无法向 DOSBox-X 送达按键，也无法移动游戏内光标。需要游戏操作的运行因此由用户在键盘上操作，agent 负责启动、观察（截图或用户报告）、应答与记录，分工见[运行时测量的角色与本机限制](./runtime-measurement.md#角色单一会话与本机限制)。不得用 shell 或 AppleScript 注入按键来绕过这一限制。
- Computer Use 无法可靠地完成所需操作时，在记录中说明原因，再按[先自助，再问用户](#先自助再问用户)请用户帮助。

## 记录

- 结论按[置信度标记](../README.md#置信度标记)标注，并注明来源：文件统计、函数地址、本地截图路径或视频时间点。
- 原版事实写入 [original/](../original/)，并更新受影响的 `U-###` 状态；任务证据只链接这些记录。
- 截图、视频帧、反编译输出与原版文件内容只留在 `local/`。
