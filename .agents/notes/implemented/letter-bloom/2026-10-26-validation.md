# 信中生花 · 独立样板实际验收

日期：2026-10-26。状态：独立样板已完成本轮实现、实际看图及交互核验，供用户确认审美；不是整站替换或新的线上发布。[实现取舍](2026-10-26-letter-as-bloom.md)与[运行方式](../../../../studies/letter_bloom/README.md)各自维护，不重复源码说明。

## 交付输入与实际地址

本地预览为 http://127.0.0.1:8931/ ，仅回环服务，故不能声称手机从公网已能访问新样板。交付[产物](../../../../artifacts/letter-bloom/2026-10-26/preview/study.json)标prototype并记录22个文件摘要，原始模型SHA/署名/许可在[素材说明](../../../../studies/letter_bloom/ASSET_PROVENANCE.md)。预览服务由Lead管理为`bash-b613f3ce052340d2`，有意保留供用户打开；全部8933临时QA服务已随helper实际停止。

最后渲染文件SHA：`0076560adebbf741685f42221424ba443a79812073b7f6f08850242748056a18`；三前端文件与同伴最终锁一致。一次源锁先收到旧`a632...`，检查确实失败，shell随后仍build，不能算锁通过。定位为后来只新增Decision首行82字节；精确移除该行的字节逆向SHA还原`a632...`，无功能差异。随后以新SHA、`set -e`重新完成输入锁与构建，最终Native针对新产物执行；没有将失败隐藏或刷新旧阶段证据。

## 实际执行

- [构建8项](../../../../artifacts/letter-bloom/2026-10-26/build-contract-final.log)通过（0.045s）：隔离输出、原文件保护、vendor覆盖/篡改、glTF媒体逃逸与许可/模型摘要、显式draft和用户已有文件保留。没有因此重跑未改的生产107项。
- 最新渲染CPU7项与前端私有交互契约由各scope同伴报告通过；这是CPU/DOM mock层，不当成真实GPU/审美证据。原首轮6项/旧阶段SHA仍保留。
- [最终Native27项](../../../../artifacts/letter-bloom/2026-10-26/final-native/report.json)实际通过：原生Three/WebGL2与GLreadPixels有内容、GLerror0，默认关闭、真实键盘/向上轻拉/手机触碰、原信字面全文、近看、再读、减弱动态、空闲停绘与dispose、320/360/390/768/1440布局边界、无GL仍能读信且近看禁用，无未处理page异常。运行[探针](../../../../studies/letter_bloom/check_browser.py)未替换shader或业务逻辑，使用实际RAF/clock，preserveDrawingBuffer保持false。
- 最终实际看过[桌面展开](../../../../artifacts/letter-bloom/2026-10-26/final-native/desktop-open.png)、[手机展开](../../../../artifacts/letter-bloom/2026-10-26/final-native/mobile-open.png)、近景及封面图。相比原创失败稿，模型确有自然卷边、连续包心和叶脉，纸影方块被去除、茎底柔融入纸面；不是增加面数就宣布好了。最终审美仍交由用户，不虚构“获奖级”或用户已认可。
- [实际浏览器录屏](../../../../artifacts/letter-bloom/2026-10-26/story/letter-bloom.webm)记录用户触发拆信/读信/近看。静态截图不是可靠中间帧：最早opening图仍接近p0，专门追拍时截图前p=.369、后p=1，故[时序记录](../../../../artifacts/letter-bloom/2026-10-26/story/opening-time.json)明确这段跨度，不能将PNG宣称冻结p=.369中间态；录屏不改时间轴补帧。

## 保护与限制

[保护报告](../../../../artifacts/letter-bloom/2026-10-26/final-protection.json)确认139个原输入及94+112+129共335个冻结档案逐项相同。Git仅新增本轮study与两类notes，原生产/旧study/发布配置未改，未commit/push。公网release仍为功能提交`3baf69df56ed7022692f639a97866450a51c841f`，没有把回环样板冒称线上新版本。

主花为12.14MB原始GLB，未做压缩或冷加载/FPS测评。手机仅Chromium模拟，非真机覆盖；SwiftShader录屏不作为设备流畅性承诺。当前只做一个花笺场景，不包含原站八主题扩展，也不假称新模型是摄影扫描或本项目原创。许可和归属说明随样板公开可访问，录屏/截图是实际渲染而非AI效果稿。
