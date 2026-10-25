# 完整自然花园与近看模式

日期：2026-10-26（Asia/Shanghai）。状态：完整功能已实施，当前在最终资产/上线验收阶段；发布成功与否以本次验收记录和公网提交标记为准，不将本地完成当作上线。由用户认可[独立样张](2026-10-25-natural-garden-study.md)后授权[完整整合与发布](../../proposed/floral-style/2026-10-25-natural-garden-release.md)而来。

## 选择与范围

正式[生成入口](../../../../garden_generator.py)继续保留八个故事ID及各自原生主花，复用只读的[共享自然花型](../../../../studies/natural_garden/flowers.py)、细叶/弯茎/亚麻结；[旧generator](../../../../generator.py)仍作为公共数学/编码和旧布局兼容基础，不把旧套件冒充新布局验收。研究页不进入正式站点。[构建器](../../../../build.py)转向正式入口，保持标准库构建和自托管Three/许可完整性校验。

玫瑰/洋牡丹采用认可的包抱内瓣、宽圆外瓣，银莲花与蝶形香豌豆是真正不同结构；正式清晰实体图中，旧native大丽花副花显得鳞片状、互穿严重，故以圆瓣波斯菊替代并更新真实计数/文案，不更名冒充或硬加面数。原生八主花仍保留。以成对错层布置改善侧背花脸，不让正面之外只剩叶。

[正式BotanicalGarden](../../../../site/botanical-garden.js)与[材质](../../../../site/botanical-materials.js)继承真实Three场景、GPU开合/法线、透视取景与有界切换；默认连续不透明Mesh拥有深度，不再画可见粒子和无色点core。来源是同输入同光照真实A/B：core-only与纯Mesh逐像素相同，亮砂主要由visible grain造成，不把它错归因无色深度写或dithering。[旧基类](../../../../site/three-garden.js)及[WebGL1兼容分支](../../../../site/legacy-garden.js)仍在，保留原点core合同的测试；显式纯点API也以point-only-compatibility诊断，不假称实体成功。

保持不压Bloom、HDR、纹理或SSAO的轻量路线；保留粗糙哑光、少量sheen、温和薄片背光与中性柔光。没有世界坐标条纹/噪点伪叶脉，也没有照片贴片。`preserveDrawingBuffer:false`不为截图而改动；原生帧同帧读取用于交付证据，不能用控制时钟中ResizeObserver未重绘的空buffer图判断产品外观。

## 真实几何而非放宽取景门槛

最初把31头花材直接放进旧冠，Native 96视角花冠比失败且副花穿插。对称重排后仍失败，不能以增加重复瓣数、移除观测或调亮光照来掩盖。实际图显示高细枝在主花上方留下约百像素空白：研究样张的高枝适合其更高花头，但在正式较低冠中，旋转到近侧会被透视放大并支配自动取景，迫使整束缩远。

同一主花/布局/权重不变，仅把正式细枝真实几何绕(0,.5,0)缩为.7，原12视角门槛下玫瑰面积/宽度比由.599/.781变为.928/.950，混合花园由.670/.798变为.833/.886。只读CPU补证两近对向焦距比.884，焦距平方归一后主体面积比.981；重复帧稳定、Three/原生矩阵误差≤5.55e-16。故修真实支持材，不改XYZ旋转、取景算法、观察分类或.72/.82门槛。[同机A/B](../../../../artifacts/natural-garden-release/2026-10-25/geometry/depth-sprigs-v4/coverage.json)与[短CPU诊断](../../../../artifacts/natural-garden-release/2026-10-25/renderer/frame-audit/REPORT.md)分属不同证据来源。

正式网格仍守3MB、实际三角误差2%，按发生偏差的局部补细分；native绣球以完整四瓣小花及实际预算处理，不改旧源码或删瓣掩盖。新花头数由实际布局决定，六个大原生主锚、五种真实花材与头数一致性由新测试另验，不硬写旧36。

## 交互、兼容和生命周期

[完整页面](../../../../site/index.html)、[应用](../../../../site/app.js)和[样式](../../../../site/style.css)保留情书、个性化、分享、沉浸、键盘/触碰、减弱动态、超时恢复与损坏数据回退；将灰绿花房与本地宋体融入原礼物，而非研究页覆盖正式站。新增画面外的整束/四单花选择，不挡花心。

activeTheme与activeView分离；主题按钮始终对应八主题，切主题默认整束，回整束恢复该主题。`#theme`与`view=`分享/深链保留to/from/message文本且不注入markup。fetch、Worker准备和queued提交共用最新意图版本；准备中只记requested，不提前切标题。初次与近看静态盛开，不改用户暂停偏好；重放才真正闭合/展开。四个近景都提供同源SVG，禁WebGL时也能近看。

清单沿用version2/stride11，新增实际headCount/composition与closeups；整束120k、近景16k是采样/协议记录，不是默认绘制的粒子数。BFM/BFG数量绑定与数据校验保留，raw/prepared各LRU4、latest-only pending及最多两份canonical交叠不变。CPU契约、真实浏览器与真实像素各自报告，不混成一个总数。资源统一v7。

## 发布与代价

[既有Pages工作流](../../../../.github/workflows/pages.yml)增加真实选型契约并将CI提交SHA写入构建标记；[公网核验脚本](../../../../scripts/verify_release.py)检查revision/style、清单SHA及运行模块、库/许可、全部数据与SVG/缩略图的实际字节，不以push成功或Actions开始代替上线。既有仓库与Pages地址不变，使用本机已有授权，不索要Token或改全局配置。

保留全部冻结档案；在授权下提交包括此前尚未发布的Three/根轴/Worker工作，研究原照片、被拒GLB、测试截图与大体积档案不入git。冷加载仍包含自托管Three和点/生长数据；不声称FPS或冷加载提速。作品仍是艺术化参数曲面，没有碰撞求解、真实细脉贴图或物理SSS；小范围穿插/轮廓简化可能存在。
