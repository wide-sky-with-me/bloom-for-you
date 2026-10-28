# 信中生花 · 花艺与分瓣动作（独立进阶样板）

本轮针对“花朵与动效单一普通”，保留信笺创意而加入实际花艺主次、真实分瓣与有节奏的开场。2026-10-28起本样板以 `--release` 构建为线上站点，完全替换原画廊；[完善与发布记录](../../.agents/notes/implemented/letter-garden/2026-10-28-refinement-and-release.md)说明花茎并拢、亚麻线与近看取景的改动。上一样板只读。设计取舍见[已实施决策](../../.agents/notes/implemented/letter-garden/2026-10-27-layered-floral-choreography.md)，实际证据与限制见[本轮验收](../../.agents/notes/implemented/letter-garden/2026-10-27-validation.md)。

从仓库根构建本地预览（线上发布用 `python3 -m studies.letter_garden.build --release`，只写入 `dist`，跳过仅存在于本地 artifacts 的冻结校验）：

```bash
python3 -m studies.letter_garden.build
python3 -m http.server 8935 --bind 127.0.0.1 --directory artifacts/letter-garden/2026-10-26/preview
```

本地标准库构建，不在运行时访问CDN。主花、配花、动作侧车与许可在本study的assets中自托管；素材作者、许可与运行时改动以当前制作说明为准。研究图片不作为模型或贴图交付。`--draft`仅私有合成，不得把未验配花/单模型草图当作丰富度完成。

上一样板43文件与生产139输入在构建前后核验；只向独立artifact或外部目录装配，不删除用户已有输出。不复用上一版测试结论假称新动作通过；阶段、实际GL与真实录屏的本轮结果见验收记录。

浏览器核验需额外Playwright（非站点运行依赖）：

```bash
python3 studies/letter_garden/check_browser.py --url http://127.0.0.1:8935/ --output artifacts/letter-garden/2026-10-26/verified-native
python3 -m unittest discover -s studies/letter_garden/tests -v
```

点击封口或轻拉触发开场；‘再看花开’只重播花艺，不隐藏已打开的信，轻触实际花瓣/叶枝有短暂局部回应，空白无回应。减弱动态直接成熟终态，近看与读信边界隔离，无GL保留完整原文。玫瑰16个中外瓣在开场动作、9卷芯保留，兰花是整枝抬起而非逐兰瓣。
