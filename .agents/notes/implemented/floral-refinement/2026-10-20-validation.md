# 根轴玫瑰与异步切换：本地集成验收

日期：2026-10-20（Asia/Shanghai）。
状态：本地实现与验收完成；保留首轮失败、修正和最终复测证据。
范围：八主题、每束 120,000 点、原 BFM1/BFG1/v2 协议、无新增运行依赖；仅本地修改和构建，未提交、推送或部署。

实施原因和取舍以[决策记录](2026-10-20-rooted-petals-and-prepared-switching.md)为准。本页只记录实际执行与结果；旧的[调研](../../proposed/floral-refinement/2026-10-20-open-source-and-switching.md)和[旧资产性能报告](../../../../artifacts/floral-refinement/performance/REPORT.md)不充当本轮新资产验收。

## 输入与构建

- 完整运行 `python3 build.py`，生成八套实际点/网格/生长资产与缩略图，退出 0；[日志](../../../../artifacts/floral-refinement/build.log)。新增准备模块和[许可声明](../../../../THIRD_PARTY_NOTICES.md)随产物复制。
- 后续只修改两个原生 ES 运行模块，以构建原有 `shutil.copy2` 方式更新受影响的分发文件；未再次生成不变的几何和缩略图。几何交接之后生成器仅改决策导航注释，不改函数。
- [候选交接](../../../../artifacts/floral-refinement/geometry/HANDOFF.md)中的三份 rose 二进制须与最终产物逐字节哈希相同；[一致性检查脚本](../../../../artifacts/floral-refinement/verify_inputs.py)检查源/分发副本、八主题格式与字节预算、许可随附、冻结基线及当前文档本地链接，并输出输入哈希清单。

## 检查按实际发生顺序记录

1. `env -u BLOOM_TEST_ASSETS_URL PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -v`：64 项通过，485.475 秒；[日志](../../../../artifacts/floral-refinement/unit-tests.log)。包含新根轴几何、精确开放流、闭态法线、2% 网格误差、字节预算、缩略图、构建和渲染器封装。该轮在最终照明收窄和两处边界修复之前，不把它冒充最终 JS 版本复测。
2. 首轮真实 GL：原 41 浏览器检查和八主题生长通过，但 96 视角中百合有色花冠比 `.716`，低于 `.72`，整条命令退出 1；[原日志](../../../../artifacts/floral-refinement/visual-depth.log)和[失败数据](../../../../artifacts/floral-refinement/depth/coverage.json)原样保留。未完成尾部的正式画廊拍摄，不声称它当时已执行。
3. 保留新几何作材质隔离对照，确认照明/颜色计数变化；采用窄柔光版本，保留所有旧门槛和原几何。具体对照与放弃原因见决策记录，不重复维护第二份配方。
4. 独立静态复核发现当前 fetch 超时被当作 supersession，以及 blur 取消 pending 最后一帧。修复后补浏览器首束超时、旧束超时、可重试，以及 Node 的实际 draw/冻结时钟/无失焦空转断言。先运行单项 blur 回归通过，再跑全部最终 JS 契约。
5. `BLOOM_TEST_ASSETS_URL="file://$PWD/dist/assets/" node --test tests/renderer_contract.mjs`：最终 49/49；[日志](../../../../artifacts/floral-refinement/final-renderer.log)。覆盖八套本轮实际新资产，含 canonical/同步 API 混用、最新选择、暂停/隐藏/失焦、真实生长包络和新增片元材质契约。
6. `node --test tests/prepare_data.mjs`：7/7；[日志](../../../../artifacts/floral-refinement/final-prepare.log)。覆盖不可变输入、真实布局/支持计算等价、分片回退、Worker 构造失败、取消/终止与破损数据原子性。
7. 最终浏览器交互首跑 44 断言通过；[日志](../../../../artifacts/floral-refinement/final-browser.log)同时保留 Python Playwright 在关闭未结网络拦截器时的异步收尾错误。这不是页面未捕获异常，但也不把该次退出 0 宣称为无错误收尾。随后显式 `route.abort()` 结清持有的请求，再按[Playwright 的 wait 语义](https://github.com/microsoft/playwright-python/blob/main/playwright/_impl/_helper.py)等待 `unroute_all`；仅修改测试夹具收尾，产品代码未变。完整重跑 `tests/browser_smoke.py` 后 44/44、退出 0，[干净复测日志](../../../../artifacts/floral-refinement/browser-clean.log)中无 Exception、Traceback 或 Task exception；保留[最终移动版](../../../../artifacts/floral-refinement/smoke-clean/mobile.png)等截图。
8. `tests/visual_growth.py --output artifacts/floral-refinement/growth-final`：八主题各五个真实 GL 阶段通过，8 个顶点属性；重播先闭合再展开、暂停冻结实际像素也通过；[日志](../../../../artifacts/floral-refinement/final-growth.log)。最小有色展开比为牡丹的 `1.440`。
9. `tests/visual_depth.py --views 12 --output artifacts/floral-refinement/depth-final`：最终 96 视角全部通过，真实 120k、连续网格和无色 depth prepass 均被观察；[日志](../../../../artifacts/floral-refinement/final-depth.log)与[数据](../../../../artifacts/floral-refinement/depth-final/coverage.json)。各主题面积/宽度比为 rose `.757/.857`、tulip `.741/.896`、hydrangea `.781/.856`、wildflower `.782/.825`、peony `.793/.897`、lily `.729/.850`、sunflower `.747/.850`、calla `.764/.839`，保留 `.72/.82` 下限。

上述 Node 子测试与 Python 封装有包含关系，不把它们相加成独立用例总数。

## 最终视觉与源码对应

[正式画廊记录](../../../../artifacts/floral-refinement/after/review.json)使用原生分发模块，无 shader/透明度响应替换。每幅都有 120k、`mix=bloom=1`、GL error 0，页面异常和失败请求均为空。分发 renderer SHA-256 为 `733ad89882bffe1fe9a43cacae2cfa495220942d6f7421212121272f6dbe8751`。

人工检查了玫瑰的[正面](../../../../artifacts/floral-refinement/after/rose-front.png)、[斜侧](../../../../artifacts/floral-refinement/after/rose-quarter.png)、[侧面](../../../../artifacts/floral-refinement/after/rose-side.png)、[背面](../../../../artifacts/floral-refinement/after/rose-back.png)及其余主题正面；并检查生长阶段和移动版。根轴玫瑰已形成圆肩、分层内外瓣，侧背保留花头而非绿壳；这属于人工视觉判断，不由面积数字代替。牡丹/向日葵等原生花型没有整体重塑。

视觉对照为 1440×1100、DPR1，性能观测为 1440×1000、DPR1；不把它们写成完全相同视口。最终玫瑰四视角和百合正面像素哈希与所选窄柔光候选相同，证明正式集成未换回实验配方。

## 最终原生性能对照

[观察脚本](../../../../artifacts/floral-refinement/final_control.py)仅安装点击、MutationObserver 和 Long Task 观察；不改响应、时钟、相机、shader 或绘制原型。串行在其他 CPU/GL 检查结束后运行，Chromium `145.0.7632.6`、Playwright `1.58`、WSL2 i7-12800HX、SwiftShader WebGL1，与旧观察对照同一 1440×1000/DPR1/普通动效。

- 同样的 `tulip, hydrangea, rose, tulip, rose, tulip` 序列，后四次暖缓存点击到实际提交文案为 `76.9, 92.2, 68.7, 81.5 ms`，中位 `79.2 ms`；[完整数据](../../../../artifacts/floral-refinement/final-performance/control.json)。原生 Worker 被观察到，GL error 0，页面异常/失败请求为空，记录含当次所有分发输入哈希。
- [旧版原生观察](../../../../artifacts/floral-refinement/performance/baseline/control-measurements.json)对应四次为 `959.4, 824.0, 830.5, 1025.7 ms`，中位 `894.95 ms`。这说明本机此序列的提交反馈由约 `895` 降至 `79 ms`；四次样本不是跨设备性能保证。
- 该口径是 click→commit DOM mutation，不是第一处 preparing 提示，不是物理屏幕呈现，也不是 FPS。旧资产的 `966.7→12.95 ms` 同步提交/NoDraw 隔离结果仍只属于前一阶段报告，不冒充本轮新几何最终数值。

## 限制与收尾

首个 GL 编译/上传仍存在同步任务；冷缓存需要异步准备，目标独占的 1.6 秒完整过渡仍有意保留。此轮不是“所有等待/长任务消失”，也未做真实手机、物理 GPU 或全浏览器横评。少量花心相交、有限网格折线和旧原生花瓣的规则排列仍可见；没有宣称物理 SSS 或照片级花瓣。

最终源/分发副本、冻结基线、字节预算与文档链接检查通过；[输入哈希清单](../../../../artifacts/floral-refinement/integration-inputs.json)与[校验日志](../../../../artifacts/floral-refinement/input-verification.log)留档。52 个冻结基线文件未变，9 个当前静态源/分发副本一致，最终性能与视觉记录的输入没有漂移。自建测试服务均已关闭，后台任务已收集，成员无待完成写入；Git HEAD 仍为 `d1cc8a9`，本轮未提交、推送或部署。
