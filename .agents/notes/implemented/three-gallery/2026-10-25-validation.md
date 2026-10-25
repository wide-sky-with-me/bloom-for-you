# Three.js 花艺静物：本地验收

日期：2026-10-25（Asia/Shanghai）。状态：实现、构建与正式图像/交互/性能验证完成；最终一致性与交付预览留档。本轮未提交、推送或部署。

架构与取舍见[决策](2026-10-25-three-scene-and-floral-richness.md)，不把[上一轮 v5 验收](../floral-refinement/2026-10-20-validation.md)或 CPU 测试当作本轮 Three GPU 证明。上一轮所有未提交改动保留，94 个基线/源码文件在新写入前冻结。

## 实际执行

- `python3 scripts/vendor_three.py --check`：官方 `0.186.1` 两份 ESM 与 MIT 哈希通过。`python3 build.py` 完整生成新八主题/缩略图并复制自托管依赖，退出 0；[构建日志](../../../../artifacts/three-refactor/build.log)。构建没有 npm/CDN 前提。
- `env -u BLOOM_TEST_ASSETS_URL PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -v`：75/75，通过 577.660 秒；[完整日志](../../../../artifacts/three-refactor/unit-tests.log)。包含五项构建、九项新花材、原生成/闭态/2%逼近/字节预算、decoder、原生兼容、Three 独立资产相机和缩略图。随后仅改构建决策导航注释与文档，运行模块及生成函数没有再改动，不为纯文档凑产品回归。
- Three 独立契约用真实官方类/几何/材质，仅 GPU renderer 边界注入对象。全资产检查对所有点和 mesh 顶点，在两种纵横比×三个生长阶段×十二方向应用真实 Three 矩阵，保持绝对 NDC ≤.98，且与旧取景数值一致；[渲染交接及日志](../../../../artifacts/three-refactor/renderer/HANDOFF.md)。原生 49 条断言只改入口到仍在生产的兼容路径，未删除或放宽；它们与 Python 封装/Three 子项有包含关系，不相加成独立总数。
- `tests/browser_smoke.py --url http://127.0.0.1:8911 --output artifacts/three-refactor/smoke`：48/48，退出 0；[日志](../../../../artifacts/three-refactor/browser.log)。确认实际 Three/WebGL2、MeshPhysicalMaterial、法线、真实花材计数、八束切换/连点、增长/暂停、触碰/键盘、情书、分享、沉浸、320/360/768/1024 宽度、减弱动态、安全文本、损坏数据原子降级、超时恢复/重试、省流量；强制无 WebGL2 的真实 WebGL1 分支与无 uint 扩展展开也通过。
- `tests/visual_growth.py --output artifacts/three-refactor/growth`：八主题各五个真实 GL 阶段全部通过，实际点面同步展开、重放先闭后开、暂停保持像素；[日志](../../../../artifacts/three-refactor/growth.log)与[数据](../../../../artifacts/three-refactor/growth/growth.json)。各束实际活跃点程序为 8 属性，设备上限检查通过，最小有色展开比为牡丹 `1.539`，没有仅靠淡入冒充展开。
- `tests/visual_depth.py --views 12 --output artifacts/three-refactor/depth`：96 视角全部通过；[日志](../../../../artifacts/three-refactor/depth.log)与[原始数据](../../../../artifacts/three-refactor/depth/coverage.json)。实际 120k、无色深度 core、可见点不写深度、真实连续 mesh 均被观察，未用诊断标签代替 draw 检查。

最终面积/宽度比：rose `.726/.862`、tulip `.735/.903`、hydrangea `.782/.869`、wildflower `.791/.844`、peony `.761/.874`、lily `.736/.862`、sunflower `.739/.858`、calla `.779/.849`。保留 `.72/.82` 门槛、每角度花材占比/填充与裁边断言；观察脚本额外记录实际 GL 错误，不因 getError 被读取而丢失失败。

## 输入与图像

[几何交接](../../../../artifacts/three-refactor/geometry/HANDOFF.md)保存完整八主题候选、七种单花前后 mesh/growth、真实 48×32 三角误差、预算和源码哈希；单花输入不被冒充为本轮浏览器单花图像。完整构建须与候选的 33 个标准资源逐字节相同；[一致性脚本](../../../../artifacts/three-refactor/verify_inputs.py)同时核对 94 个冻结文件、12 个当前源/分发模块、许可/vendor、实际对照/性能输入和图像哈希。最大 mesh 为牡丹 2,979,444B，最大 growth 为牡丹 2,481,512B，继续各低于 3,000,000B；每束点数据仍 5,280,000B。

[前后画廊脚本](../../../../artifacts/three-refactor/gallery_review.py)固定 1440×1100、DPR1、相机角度和动画时钟，各捕获玫瑰四面与其它主题正面，共各 11 幅，实际 120k、mix=bloom=1、GL error 0，页面/控制台异常与失败请求为空。旧版只为观测挂出 renderer 实例，响应体仅增加一次引用赋值，原文/服务文哈希都记录；没有改旧 shader/几何。新版没有响应替换，使用实际 Three 场景、物理材质和分发资产；[前版记录](../../../../artifacts/three-refactor/before/review.json)与[新版记录](../../../../artifacts/three-refactor/after/review.json)分别完整留档。

人工检查了八主题正面、玫瑰侧背、生长阶段及[移动版](../../../../artifacts/three-refactor/smoke/mobile.png)。[牡丹前版](../../../../artifacts/three-refactor/before/peony-front.png)与[新版](../../../../artifacts/three-refactor/after/peony-front.png)从密集机械圆盘转为独立大瓣、卷抱与深浅变化；[郁金香](../../../../artifacts/three-refactor/after/tulip-front.png)杯口和花药、[向日葵](../../../../artifacts/three-refactor/after/sunflower-front.png)盘/舌分界更清楚。花冠和[玫瑰背面](../../../../artifacts/three-refactor/after/rose-back.png)仍完整，舞台更安静。这是本轮人工视觉结论，数值不替代审美；其它部分仍有纸艺/程序几何感。

## 串行原生性能对照

[观察脚本](../../../../artifacts/three-refactor/performance_control.py)只加点击、MutationObserver 和 Long Task 观察，不替换响应、时钟、相机、shader 或绘制原型。在全部 CPU/GL 回归结束后串行执行同一 `tulip, hydrangea, rose, tulip, rose, tulip`，普通动效、1440×1000、DPR1、Chromium `145.0.7632.6`、Playwright `1.58`、WSL2 i7-12800HX、SwiftShader WebGL；不把它与视觉截图说成相同视口。

- 本次重测 v5：[数据](../../../../artifacts/three-refactor/performance-before/control.json)，后四次暖缓存 click→实际 commit 文案为 `92.5,79.1,77.3,74.1 ms`，中位 `78.2 ms`。
- Three 新版：[数据](../../../../artifacts/three-refactor/performance-after/control.json)，对应 `89.8,89.8,88.1,88.2 ms`，中位 `89.0 ms`。真实 Worker 被观察到，GL error 0，页面异常/失败请求为空，记录含当次完整输入哈希。
- 新版中位增加约 `10.8 ms`，并非“换 Three 自动更快”；这是物理材质与新场景的本机代价。提交反馈仍为约 .09 秒，未回到最早秒级主线程冻结。四个样本不代表跨设备保证；口径是 commit DOM、不是第一处 preparing 提示、实际屏幕呈现或 FPS。前轮 `895→79 ms` 不当作本次前后对照。

## 真实失败与修正

首个 Three GL 探针失败保留[日志](../../../../artifacts/three-refactor/early-probe.log)：r186 将 vColor 统一为 vec4，原 patch 赋 vec3，导致顶点 shader 第535行维度不符；通过核对锁定源码修正，补 Node 断言。旧几何/新几何各三主题早期探针随后真实通过，再执行正式全套；未用 SVG 成功替代 Three 成功。几何外肩误差和纵深首轮失败、真实修正与未变门槛详见几何交接。

两次测试服务在 8902/8904 报 Address already in use，发生于测试启动前，未声称任何断言通过；当时 socket bind 也确认冲突，但没有可见监听者，具体外部占用原因未确定，未杀其它进程。改用实际可绑定的 8911 后正常执行。Node 24 拒绝旧实验模块标志的问题通过 ESM loader 解决，未动断言。

## 交付与限制

本机预览 http://127.0.0.1:8911/#peony 已以真实浏览器单独验证 Three `0.186.1`、120k、物理材质、GL error 0 与无页面异常；[预览记录](../../../../artifacts/three-refactor/preview-verification.json)。它是本机回环地址，不是新的公网 Pages 地址。临时测试服务均结束；只明确保留交付用预览后台任务 `bash-f462f9e43af044b2`（[日志](../../../../artifacts/three-refactor/preview-server.log)），需要时可由 Harness 停止该任务。

未执行真实手机/物理 GPU、Firefox/Safari 或全网性能横评；Three 首屏多约 2.12MB 未压缩脚本，首个 GL 编译仍有同步成本。冷资源准备及 1.6秒完整过渡保留；alphaHash 在过渡中可见颗粒覆盖。有限网格折线、局部花瓣相交、旧大丽花/洋桔梗的规则排列仍可见，没有碰撞求解或照片级/物理SSS承诺。WebGL1仅保留旧视觉兼容。Git HEAD保持 `d1cc8a9`，本轮未提交推送部署，公开站点未由此轮更新。

最终一致性检查已通过：94 份冻结输入未变、12 个源/分发文件一致、官方 vendor/许可哈希正确、新资产与候选相同、正式图像和原生性能输入无漂移；[输入清单](../../../../artifacts/three-refactor/integration-inputs.json)及[检查日志](../../../../artifacts/three-refactor/input-verification.log)留档。新文档与历史互链另做本地链接检查；没有为这次纯文档收尾再次启动产品回归。
