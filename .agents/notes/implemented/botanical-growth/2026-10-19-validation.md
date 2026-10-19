# 含苞到盛开：本轮验收

日期：2026-10-19。状态：本地验收通过，待发布确认。范围：同色系细密花瓣、同源闭合姿态、点面同步绽放与既有环绕饱满度。

## 样本与环境

[生成器](../../../../generator.py) SHA256 `4343051deac2070e528f9168a5d4ee18c3f07d11153661c22d7d8cd7dbb066ab`；[渲染器](../../../../site/particles.js) SHA256 `b5f76332d61c1cf46cc2dd5c8b933e07248cee67722e57616610a5ced50220cc`。协议和预算见[决策](2026-10-19-bud-to-bloom.md)。

像素检查使用 Playwright Chromium + SwiftShader，执行正式 WebGL1 着色器并读取真实 framebuffer；这与 Node MockGL/CPU 契约分开。手机为 390×844、DPR2 触屏模拟，非 iPhone/Android 真机。截图和完整日志在本地 `artifacts/`，按项目约定忽略提交。

## 实际检查

- 干净源快照执行 `python3 -m unittest discover -s tests -v`：56 项通过，398.151 秒。Node 渲染与 BFG1 解码契约由 Python wrapper 调用。随后 `python3 build.py` 通过，全部预算通过，32 个核心运行资源逐 SHA256 等同最终真实像素检查的输入，检查期间源码未变。见本地[单测日志](../../../../artifacts/growth-release-unittest.log)、[构建日志](../../../../artifacts/growth-release-build.log)及[运行输入哈希](../../../../artifacts/growth-release-input-hashes.json)。
- `python3 tests/browser_smoke.py --url http://127.0.0.1:8780`：41 项通过。覆盖八主题、快速切换、生长与暂停、拖动、键盘、信件、沉浸、分享、320/360/390/768/1024 布局、触碰、减弱动态、上下文丢失、uint 索引回退、损坏点/面/增长的原子降级、省流量/3G及零未捕获异常。
- `python3 tests/visual_growth.py --output artifacts/botanical-growth-final`：八主题各五个正式 GL 阶段通过；重放先闭合后再打开，暂停时像素稳定。最终仅修补两主题几何后，再执行 `--flowers wildflower,calla --output artifacts/botanical-growth-fixed`，两者再次通过五阶段及重放/暂停，盛开/花苞彩色面积比分别约 1.742、2.190。
- `python3 tests/visual_depth.py --flowers rose,tulip,hydrangea,peony,lily,sunflower,calla --views 12 --output artifacts/botanical-orbit-final`：前六主题通过，旧 calla 面积失败；修补后执行 `--flowers wildflower,calla --views 12 --output artifacts/botanical-orbit-fixed`，两主题全部通过。其余六主题点/面/增长与冻结客户端逐字节不变，保留其已通过结果。

最后两主题修补只改变各自三个二进制资产。交互代码未改变，故保留已通过的 41 项交互检查，以两主题最终阶段/圈视补测和发布后的桌面/触屏核验覆盖新增几何。

## 最终环绕指标

沿用面积比至少 0.72、宽度比至少 0.82，以及单视图高度、花冠填充、花材占比与边界断言；没有放宽阈值。每主题均有十二个真实 GL 角度。

| 主题 | 最小/最大花冠面积 | 最小/最大花冠宽度 |
| --- | ---: | ---: |
| 玫瑰 | 0.724378 | 0.867550 |
| 郁金香 | 0.752897 | 0.893733 |
| 绣球 | 0.772900 | 0.855932 |
| 混合花园 | 0.768598 | 0.822823 |
| 牡丹 | 0.786289 | 0.899687 |
| 百合 | 0.735973 | 0.846626 |
| 向日葵 | 0.740666 | 0.850000 |
| 马蹄莲 | 0.746945 | 0.829517 |

原始指标见本地[汇总](../../../../artifacts/growth-orbit-accepted.json)及其中逐主题圈视记录。人工复核了最终[花园 330°](../../../../artifacts/botanical-orbit-fixed/wildflower-330.png)、[马蹄莲 30°](../../../../artifacts/botanical-orbit-fixed/calla-030.png)薄侧、玫瑰盛开及花苞/半开阶段，确认主花、陪花与根部仍相连，花冠由花材而非绿叶填充。

## 失败与复测

新增材质和几何初版出现野花宽度约 0.810、马蹄莲面积约 0.696 的真实回退。仅修补对应主题：野花保留原有杯曲、单朵陪花转轴并守住原半径上限；马蹄莲中层交错、局部外移解除大苞片遮挡。最终回到上述门槛，其余六主题资产不变。

曾有野花候选像素通过但半径超过旧 metadata 上限，原测试判其失败，未作为最终方案；最终选择合法最小 D。所有原布局断言保留，另增局部修补保护。采样、丝带预算及微瓣精度取舍见[决策](2026-10-19-bud-to-bloom.md)，不以视觉通过替代数据契约。

阶段脚本等待实际 120,000 点绘制时 GPU `uMix=1` 后才拍目标花苞，避免误拍旧主题；末尾 dust pass 会重置该 uniform，故不能以其值判断换花结束。坏增长响应覆盖 header、闭合法线与网格顶点数三类不匹配，均验证整束降级而非部分错位。

## CI 执行预算排障

[首轮 CI](https://github.com/wide-sky-with-me/bloom-for-you/actions/runs/39239275597) 未发布：56 项中 53 项通过，三个 ERROR 均为 `subprocess.TimeoutExpired`，不是数值断言失败。同一 CI 的完整资产生成在 manifest 检查耗时约 102 秒，超过旧 CLI wrapper 的 90 秒；Node wrapper 另在 30 秒截断，该限额不包含此前约 108 秒的 Python fixture 生成。

保留所有输出、确定性、metadata、画面和坐标断言，仅把有界子进程执行预算调整为 CLI 180 秒、Node 120 秒；这些 wrapper 限额不是产品性能基准。正式运行资源 32 个 SHA256 不变。受影响类本地复测通过：CLI 三项 158.956 秒，Renderer 一项 73.598 秒（包含重新生成八组 fixture 及完整 Node 契约）。完整 CI 随本次新提交重跑；旧截断日志不当作 Node 契约通过。

## 发布与线上

本轮尚待推送和线上验收；历史发布结果不作为本轮通过证明。后续记录新提交、成功的 Pages Actions、正式站点 32 个核心资源与验收构建的 SHA256 对应，以及正式 URL 的初始花苞、重放、深链接、触碰、信件与页面异常结果。

## 限制

未测试物理移动 GPU 的帧率、功耗或无限快速中断链内存上界。BFG1 增加下载与 CPU/GPU 内存；极长切换链可能暂留多层尚可见曲面。当前结论是本轮数据、浏览器与软件 GL 环境的正确性验收，不是所有设备的性能保证。
