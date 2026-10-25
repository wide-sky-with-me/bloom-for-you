# 自然花园：当前验收与发布记录

日期：2026-10-26（Asia/Shanghai）。状态：本地当前源的几何、真实渲染、交互与构建均通过，正在准备提交/推送与CI部署；尚未将本地结果冒称公网已上线。

范围见[完整实现决策](2026-10-26-natural-garden-release.md)；授权来自用户认可样张后明确要求完整优化并部署，不把旧本地授权代替本轮发布授权。

## 本次实际输入

生产生成器SHA：`dc52c023ddb2a6a14b44aa7b4d413fb7999d8b589b079cd510ef7aea38057c4f`。资源style为`natural-garden-v1`、客户端修订v7；待发布产物在本轮 `deploy-candidate`。构建前后源SHA相等，[构建日志](../../../../artifacts/natural-garden-release/2026-10-25/deploy-build.log)和[输入锁](../../../../artifacts/natural-garden-release/2026-10-25/deploy-generator-input.json)已保存。

绣球最终单独由4×2加到5×2来满足2%误差：只加细分曾实际被3MB上限拒绝（3,105,288B），故删一对玫瑰陪花，29→27，仍保6大原生主锚和5物种；其它七束和四近景未变。不能把这之前的失败全套当作最终通过。

## 本地已执行

- 93项保留/core/study/renderer/build Python测试通过（614.433s），明确排除当时仍在修的`test_garden_generator`；[日志](../../../../artifacts/natural-garden-release/2026-10-25/core-unit-tests.log)。其中嵌套的legacy49、Three13、botanical11等不再重复加到93上。旧Three资产矩阵的范围是独立旧/兼容夹具，不假称新12资源CPU包络全量证明。
- 新生产生成器9项通过（87.654s），复用同一冻结源全12资源，实际240个花头逐sheet按49×33 UV点检查Float32三角误差<2%及BFG根位置/法线；[最终日志](../../../../artifacts/natural-garden-release/2026-10-25/geometry/tests-final.log)。与前述93项、后述5项分组件合计107项Python，不把嵌套Node案例再加总。
- [应用选型Node契约](../../../../tests/app_natural.mjs)10项通过；当前CI已显式调用，覆盖最新意图、近看/主题分离、分享、暂停和失败恢复。
- [公网核验脚本单元](../../../../tests/test_release_verification.py)5项通过（0.038s），包括旧revision、清单SHA和被改模块的拒绝；只是隔离HTTP单元，不当作公网访问成功。[日志](../../../../artifacts/natural-garden-release/2026-10-25/release-verification-contract-final.log)。
- 全12资源组BFM/BFG/点数绑定与3MB预算实查通过，最大mesh2,955,048B、growth2,466,224B。[汇总](../../../../artifacts/natural-garden-release/2026-10-25/local-acceptance.json)。
- 96个真实GL环绕视角通过：七束×12在`final-depth-seven`，绣球最终12在`final-depth-hydrangea`；原.72/.82等门槛不变，最小有色面积比.816341、最小宽度比.885870。[七束](../../../../artifacts/natural-garden-release/2026-10-25/final-depth-seven/coverage.json)、[绣球](../../../../artifacts/natural-garden-release/2026-10-25/final-depth-hydrangea/coverage.json)。
- 40个真实GL增长阶段及重放/暂停通过：同样按七束＋最终绣球拆分，最小有色展开比1.882029（原>1.08不变）；只控制动画时钟，不替换shader/资产。[七束](../../../../artifacts/natural-garden-release/2026-10-25/final-growth-seven/growth.json)、[绣球](../../../../artifacts/natural-garden-release/2026-10-25/final-growth-hydrangea/growth.json)。
- 最终待部署URL的[完整浏览器48项](../../../../artifacts/natural-garden-release/2026-10-25/deploy-browser.log)通过：礼物/分享/沉浸、手机与文本转义、异步连点、超时恢复、WebGL1/无uint、无GL/坏包/坏normal/growth等。浏览器使用真实Three/WebGL2与正式资产。
- [近看Native64项](../../../../artifacts/natural-garden-release/2026-10-25/closeups/final-native/report.json)通过：四对象真实16k/头/索引绑定、实际MeshPhysicalMaterial且renderedPointCount=0、暂停/混切/缓存、分享/新context深链、390触屏、四SVG、释放；无page/console错误，不控制RAF。该次与最终产物之间只改绣球；四近景、七束数据/缩略图共51资源逐字节一致，客户端模块无运行逻辑变化，[等同性证明](../../../../artifacts/natural-garden-release/2026-10-25/asset-equivalence.json)支持复用，不将不同输入混为同一运行。

最早94文件、样张112文件、发布前129文件的冻结档案均逐项核对未变；未刷新旧哈希绕过保护。旧generator与共享study源也相同。手机检查是Chromium模拟，不是真机横评；未执行FPS/冷加载提速对比，不引用早期78/89ms当作这次性能成绩。

## 保留的失败与修正

首轮96视角全部失败，配花穿插和细枝取景问题分开排查；成对布局仍失败的输入保留，随后真实缩枝A/B解决，不改观测。正式native细分的>2%与超预算日志保留，不以删断言处理。

完整浏览器前两次失败属于探针：旧v6精确路径/准备中提前观察body，以及关闭旧context后使用page.request取夹具。改为当前v7/请求意图字段/各active context请求正式资源，原交互/坏包断言仍在。增长初始静态盛开后改由真实重放按钮到达花苞，保留0–.05闭态检查，不将产品恢复为加载即动画以躲测试。

## 发布检查（待填）

待记录：功能提交SHA、Actions run/deploy结论、公网revision/style/manifest及全部资源字节核验、实际公网桌面/手机/近看页面结果。必须这些结果成功后才改状态为已上线。纯文档补充可用项目既有`[skip ci]`方式，不将文档HEAD误报成已部署功能提交。
