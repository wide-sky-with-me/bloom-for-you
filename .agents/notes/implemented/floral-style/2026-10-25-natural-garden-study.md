# 奶油香槟自然花园：独立交互样张

日期：2026-10-25（Asia/Shanghai）。状态：单花＋单束样张已实施并完成本轮验证；不代表替换八主题，不提交、推送或部署。源于用户认可的[花艺参考](../../proposed/floral-style/2026-10-25-natural-garden-references.md)及[样张方案](../../proposed/floral-style/2026-10-25-natural-garden-study.md)。

## 范围与取舍

[独立源码](../../../../studies/natural_garden/arrangement.py)组合12洋牡丹、6花园玫瑰、5银莲花、4香豌豆，共27个主/配花头，另有细枝小花，不复用旧36头环壳。花头有不同大小、朝向与永久成熟度，细弯茎与单片叶替代成排厚叶，细亚麻结替代大蝴蝶结。花材计数来自真实布局，不把配枝花冒称主花。

[新曲面模块](../../../../studies/natural_garden/flowers.py)保持独立根附件与BFG闭合态：宽圆重瓣、环抱内瓣、黑心开放花和蝶形花脸有不同结构，不只换颜色。原始实拍仅作形态研究，没有放进网站或贴到花片。单花近景detail1.5、全束.65；保留3MB/BFG与2%三角误差，不降低原八主题的任何断言。

[独立StudyGarden](../../../../studies/natural_garden/site/study-garden.js)继承真实ThreeGarden，正式engine模块原样复制。默认botanical模式由连续实体Mesh拥有深度，隐藏细粒与点core；v6对照模式保留。四组同帧真实A/B确认：core-only与纯Mesh逐像素一致，visible grain则改变6152像素，主要制造零散亮砂。故去粒子覆盖，不把无色core误诊为擦掉实体颜色。[材质交接与像素证据](../../../../artifacts/natural-garden-study/2026-10-25/material/HANDOFF.md)。没有新增伪叶脉、条纹或Bloom；当前确实没有真实纹理细脉。

[页面](../../../../studies/natural_garden/site/index.html)为松烟灰绿背景，花为中心，沿用本地宋体；可看整束、近看四种花、旋转、重放真实开合、暂停/播放与复位。独立样张不改原礼物页面。默认先展示盛开造型，重放才闭合再打开；减弱动态默认静止。

## 构建和真实验证

`python3 -m studies.natural_garden.build --output artifacts/natural-garden-study/2026-10-25/preview` 完整生成，退出0；[最终构建日志](../../../../artifacts/natural-garden-study/2026-10-25/final-build.log)。整束点记录120000、单花16000，默认实体模式不实际绘制这些Points；它们服务于准备/取景及对照模式，不宣传为120k可见粒子。整束mesh 2,360,496B、growth 2,292,148B；单花最大mesh 950,484B、growth 453,416B。

[几何独立验证](../../../../artifacts/natural-garden-study/2026-10-25/geometry/HANDOFF.md)：最终v4 11/11通过，80组实际三角误差组合含16组1.5近景，每patch49×33取样；另8个定量子集最坏0.2726%直径，不重复算独立案例。肩缘法线最小dot=.9999808432，原.999门槛保持；BFG根位置/法线仍固定。最终模块SHA为 `dd4ddff7c0ecefdb892fd07371e33ddabb1d4454a5f6ce6b47c3f0c170c72d5e`。

[材质/生命周期独立验证](../../../../artifacts/natural-garden-study/2026-10-25/material/HANDOFF.md)：9/9 Node与临时复制engine的Python封装通过。GPU边界是注入测试对象，不当作真实浏览器成绩。

[构建专属5项测试](../../../../tests/test_natural_garden_build.py)通过：确定性、全局RNG不变、实际计数与BFM/BFG绑定、采样数量和拒绝覆盖正式目录；[日志](../../../../artifacts/natural-garden-study/2026-10-25/build-contract.log)。

[真实浏览器检查](../../../../studies/natural_garden/check_browser.py)：27项通过，覆盖5个对象×4方向共20实际GL视图、每对象闭合/花苞/半开/盛开、键盘、暂停像素、320/390/768/1024布局、连点最后选择、缓存/几何有界、失焦时钟冻结和幂等释放，页面/控制台错误为空；[日志](../../../../artifacts/natural-garden-study/2026-10-25/final-browser-v2.log)与[数据](../../../../artifacts/natural-garden-study/2026-10-25/final-check-v2/report.json)。时钟受控以固定阶段，不是FPS或手机实机评测。

[输入一致性](../../../../artifacts/natural-garden-study/2026-10-25/accepted-inputs.json)确认112个冻结文件未变，正式站点源码/分发哈希保持原样，样张运行模块与分发副本一致、协议数量/资源SHA对应。构建清单保留生成时的测试脚本版本，随后只修测试采样时序；当前验收清单另记录最新harness，未以刷新旧清单伪装运行模块变化。

## 失败、修正和边界

首轮真实图显示内瓣星状交叉碎三角，不能以数值通过验收。v3用真正环抱内曲壳替代穿轴宽片，不加中心盖；再在v4修横向角参数的边界奇异法线，保留旧失败与原门槛。v3不能沿用v2的10项通过；最终v4才有11项真实通过。早期图在本轮early-visual/v3-visual分别保留。

首轮浏览器采样错误地按.6秒闭合计算，而继承实现是.8秒闭合＋4.2秒展开，导致误判；随后从真实growthCycle读阶段时刻，原增长断言不变。失败日志与图保留在final-browser.log/final-check，复测另存v2。控制时钟的布局截图可能在ResizeObserver之后未再绘制、出现空canvas，不作艺术海报；交付图由原生RAF实际重绘并同帧读取RGBA/PNG另行确认。首个交付探针的移动尺寸条件误用了整数clientWidth，遇到分数CSS尺寸超时，改为按实际getBoundingClientRect检查1像素取整误差，不改产品布局。

现在交付的是艺术化3D曲面样张，不是实拍级或最终全花园。仍可能看见局部相交、规则层叠、少量叶形/轮廓简化；没有碰撞求解、真实细脉贴图或物理SSS。低LOD与近景有明确区别，用户看过新样张再决定是否继续提质/扩至其它主题。原75/48/96成绩只属于之前正式版本，不冒充本轮测试。

## 本机交付

独立预览：http://127.0.0.1:8901/ ，原花园仍在 http://127.0.0.1:8911/ 。二者都是本机回环，不是新的公网部署。只保留明确交付用预览任务 `bash-10f76412c40b4c00`（原版另有其既有任务）；本轮临时测试服务器和浏览器均已关闭。Native交付图与核验在本轮delivery-v2目录，真实花束透明底PNG可直接预览；不是模型标题或实拍替代。
