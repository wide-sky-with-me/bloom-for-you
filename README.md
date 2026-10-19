# 花间来信

一座送给老婆的粒子花束画廊。把一颗颗光写成花瓣，让心意在指尖盛开。

**在线花园： https://wide-sky-with-me.github.io/bloom-for-you/**

## 花会动，心意也会

粉雾玫瑰、奶油粉郁金香、月光绣球、香槟混合花园，以及牡丹、百合、向日葵、马蹄莲。每束由 Python 确定性生成 120,000 个三维粒子，并从同一套参数曲面生成连续花瓣、枝叶与蝴蝶结。主花、重瓣配花和细枝小花交错组成环绕花冠，拖到背面也有完整花头，不是前面一排花、后面一层叶。

连续花瓣与细粒共享曲面法线光照、透视和深度遮挡；同主题花材收拢到主色、邻近色与少量奶白，细密采样优先落在花瓣上。加载时花瓣从包裹的花苞逐层展开，点击花束或「让心意绽放」可重放收拢到盛开的过程，不再爆散重聚。点和面共享同源闭合姿态、法线与展开延迟，枝叶和丝带留在原位。盛开后保留风场与呼吸轻摆，拖动可绕整束观察，右上角还藏着一封信。

手机可触碰、滑动和挑花；支持沉浸模式、暂停与键盘操作。页面跟随系统「减弱动态效果」设置，默认静止，可手动播放。设备未启用 WebGL 或首组数据加载失败时，显示由相同曲面与粒子生成的 SVG 花束投影。

## 运行

只需要 Python 3.10 或更新版本，无第三方 Python 运行依赖，也没有 Node 构建依赖。

```bash
python3 build.py
python3 -m http.server 8000 --directory dist
```

浏览器打开 `http://localhost:8000`。请通过 HTTP 打开，直接双击 HTML 的 `file://` 模式不支持模块和数据加载。

## 写成你们的故事

编辑 [site/gift.json](site/gift.json)，修改 `recipient`、`salutation`、`signature` 和 `letter`，重新构建后即可生效。正文每项为一段，`\n` 表示换行。

也支持链接参数 `?to=你的称呼&from=你的署名&message=想说的话`，参数应使用 URL 编码；`#rose`、`#tulip`、`#hydrangea`、`#wildflower`、`#peony`、`#lily`、`#sunflower`、`#calla` 可指定初始花束。

GitHub 仓库与 Pages 是公开的。信件配置、URL 参数和站点内容都可被访问，请只放适合公开分享的文字。页面没有统计追踪、第三方脚本、远程字体或后台账号。

## 发布到 GitHub Pages

仓库设置中，进入 **Settings → Pages → Build and deployment → Source**，选择 **GitHub Actions**。推送 `main` 后，[Pages 工作流](.github/workflows/pages.yml) 会运行测试、生成花束并发布 `dist`。后续修改情书或代码后，提交推送即可自动更新。

## 实现

- [generator.py](generator.py)：标准库参数曲面、同源开放/闭合花瓣、固定种子与预算，生成点、曲面、紧凑生长数据和 SVG 投影。
- [build.py](build.py)：生成花束、校验情书配置、生成同源曲面 PNG 缩略图，并构建可独立托管的 `dist`。
- [site/particles.js](site/particles.js)：原生 WebGL 点面同步生长、八属性 GPU 布局、动态光照、暂停和旋转，不依赖 CDN。
- [site/surface-data.js](site/surface-data.js)：验证 BFM1 曲面头、长度、颜色、法线及索引。
- [site/growth-data.js](site/growth-data.js)：验证 BFG1 数量绑定、紧凑坐标、闭合法线和展开延迟。
- [site/app.js](site/app.js)：同步加载点、面与生长数据，处理竞态、个性化、情书、分享与降级。

点记录沿用 version 2 / stride 11，每束原始点数据 5.28 MB，另附同源 `.mesh` 与 `.growth`，两者各控制在 3 MB 内。BFG1 以 14 字节定点记录保存闭合坐标、法线与延迟，绑定点数和焊接后的网格顶点数；GPU 重包只在内存中发生。资源缓存修订为 `v=4`，点、面、生长、清单与客户端须一并构建发布。首束优先，空闲时最多预取相邻一束；省流量或报告低速移动网络时不预取。预览为盛开终态的轻量 PNG，SVG 只在降级时加载。移动端像素比限制在 1.8，页面切至后台和暂停后冻结生长时钟并停止空转。Python 只负责静态生成，GitHub Pages 不需要常驻服务。

环绕构图、实拍参考、纯点方案的视觉失败，以及透明深度取舍见[环绕花束决策](.agents/notes/implemented/round-bouquets/2026-10-19-all-around-garden-composition.md)；其[历史验收](.agents/notes/implemented/round-bouquets/2026-10-19-validation.md)仅代表该轮版本。本轮实现取舍见[含苞到盛开决策](.agents/notes/implemented/botanical-growth/2026-10-19-bud-to-bloom.md)，当前检查与发布状态见[本轮验收](.agents/notes/implemented/botanical-growth/2026-10-19-validation.md)。仍有效的法线、透视和生命周期背景见[此前实现决策](.agents/notes/implemented/particle-depth/2026-10-19-normal-lit-bouquets.md)。

## 验证

```bash
python3 -m unittest discover -s tests -v
python3 build.py
```

安装 Node.js 时，单元测试会在临时目录生成独立的真实花束夹具，并执行渲染器与暂停等生命周期契约；不依赖工作目录内已有的生成资产。Node.js 仅用于开发测试，构建和站点运行仍不需要它。

浏览器端检查使用独立开发依赖 `requirements-dev.txt`（Playwright 与 Chromium）；用 `python3 -m pip install -r requirements-dev.txt` 和 `python3 -m playwright install chromium` 安装。在另一个终端启动静态服务器后运行：

```bash
python3 tests/browser_smoke.py --url http://localhost:8000
```

检查真实曲面绘制、粒子深度通道及整圈彩色花冠，默认每束捕获完整环绕视角：

```bash
python3 tests/visual_depth.py --url http://localhost:8000
```

覆盖真实 WebGL 点面绘制、生长、暂停、切花与快速点击、拖动、键盘、信件、沉浸、分享、手机尺寸、触碰、减弱动态、文本转义、缺少 uint 索引扩展、省流量、无 WebGL 与损坏点/面/生长数据降级。环绕验图检查花冠面积、宽度和花材占比，避免靠绿叶撑满背面；数值通过仍需人工看图。生长阶段可用 `python3 tests/visual_growth.py --url http://localhost:8000` 检查真实 GL 花苞、半开与盛开、重放和暂停，时钟由测试控制而着色器与数据均为正式实现。截图在 `artifacts/`，不提交。手机检查为 Chromium 触屏模拟，非 iPhone / Android 真机测试。

## 字体

页面自托管 Noto Serif SC 的常用文案字形子集，使用 SIL Open Font License 1.1，许可见 [site/assets/FONT-LICENSE.txt](site/assets/FONT-LICENSE.txt)。个性化文字中未收录的字形由设备宋体回退显示。
