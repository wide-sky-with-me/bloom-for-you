# 进阶花笺 · 实际验收

日期：2026-10-27。状态：本轮独立样板实现、实际看图/Native交互验收完成，供用户确认是否足够丰富；不是整站艺术认证或线上替换。[实现决定](2026-10-27-layered-floral-choreography.md)维护原因，不在验收里重复设计。

## 交付与输入

本地URL http://127.0.0.1:8935/ ，独立于上版8931。服务job `bash-934588941f6444e3`有意保留供用户查看，不是DSH替代服务；所有8933 QA临时服务实际停止。交付[manifest](../../../../artifacts/letter-garden/2026-10-26/preview/study.json)记录25个运行资源与两种不同SHA花材，全部在相同HTTP地址逐项SHA复核；[源码锁](../../../../artifacts/letter-garden/2026-10-26/delivery-source-lock.json)固定五文件。原app在修miss冷却前的锁与失败记录保留，不冒充最后锁通过。

## 分层证据

- [构建6项](../../../../artifacts/letter-garden/2026-10-26/build-contract.log)实际通过：原样板/生产路径保护、文件保留、模型摘要、动作源绑定/mapping、未验/克隆花材拒交、symlink不越界。没有重跑未改生产大套件。
- 同伴离线二进制分析实际得出25瓣壳/两枝叶分组，原UV缝不重复算瓣；[feasibility](../../../../artifacts/letter-garden/2026-10-26/feasibility/FEASIBILITY.md)明确根候选并非作者骨骼、闭合穿插还需实图。渲染CPU最终12项及前端私有契约由同伴报告通过，是CPU/mock层，不能替代实际GPU。
- Parent真实看过[兰花原始材质](../../../../artifacts/letter-garden/2026-10-26/assets/orchid-original-render.png)与[opaque处理](../../../../artifacts/letter-garden/2026-10-26/assets/orchid-opaque-double.png)，确认透明排序根因，不伪称原网格坏掉或只凭来源缩图验收。未采用蓝花扫描留私有否决证据，未复制入产品。
- Parent逐阶段看过first-poses、v2-poses、[v3阶段](../../../../artifacts/letter-garden/2026-10-26/frames/v3-poses/report.json)：先否决过弱开合、卷芯刀片与兰花切片，再收敛到当前成熟/阶段。稳定姿态采用公开controller.setProgress直接指定，明确commandedPoseStudy，不声称它们是实时录像中冻结的帧。
- [最终25项Native](../../../../artifacts/letter-garden/2026-10-26/verified-native/report.json)在交付URL实际通过：真实时钟/RAF观测到明显分瓣角度，GLreadPixels有内容/GL0，两真花材/原数组与成熟旁路、空白不触发/真实DOM命中/归位停绘、再看不动原信/读信scroll、近看与手机/320/360/768边界、减弱动态、原文逐字、键盘、dispose、无GL可读/禁用近看，无未处理page异常。保留preserveDrawingBuffer=false，不替换shader或业务时序。
- [真实浏览器录屏](../../../../artifacts/letter-garden/2026-10-26/verified-native/actual-opening-and-touch.webm)记录开封、点击花瓣、重看与近看；不是AI效果视频/合成慢动作。Parent实际看了最终[桌面](../../../../artifacts/letter-garden/2026-10-26/verified-native/desktop-open.png)及[手机近看](../../../../artifacts/letter-garden/2026-10-26/verified-native/mobile-closeup.png)，不由测试数证明审美。近看可裁去配花外缘但不覆盖信字。

## 唯一真实失败与修复

V3首次Native到触碰失败，见[原日志](../../../../artifacts/letter-garden/2026-10-26/final-native.log)。没有放宽1.5s断言或150ms间隔。实际[对照复现](../../../../artifacts/letter-garden/2026-10-26/touch-throttle-reproduction.json)同一hittable点，空白后150ms不响应、350ms响应，定位UI无条件推进240ms冷却。只修改新app：reactionPoint仍更新，renderer.react===true才计时；mock改boolean，新增立即miss→hit等断言先RED后GREEN。原条件Native复跑25项全过，其它HTML/CSS/两场景模块SHA均不变，旧样板未动。

## 保护与未测

[保护记录](../../../../artifacts/letter-garden/2026-10-26/final-protection.json)逐项确认139原输入、43旧样板文件和94+112+129冻结档案相同；公网release仍3baf69df56ed7022692f639a97866450a51c841f。未commit/push/部署，不把本地URL说成手机公网可用。

手机是Chromium模拟而非真机；没有冷网、FPS、长期运行或全浏览器认证。原GLB合计17.23MB尚未压缩，兰花为整枝动作、玫瑰16瓣开场动画且9卷芯保留，不能夸称全部花瓣真实生物生长。用户审美认可仍待反馈；新旧预览都保留可比对。
