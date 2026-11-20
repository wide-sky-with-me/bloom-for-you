# 鸢尾湾 · 花径漫步

[进入花径](https://wide-sky-with-me.github.io/bloom-for-you/) · [回到经典庄园（双人漫游与读信）](https://wide-sky-with-me.github.io/bloom-for-you/classic/)

线上首页由 `desktop/Viewer/build.mjs` 从水庭模型生成，打开即可沿路赏花。GitHub Pages 只发布浏览器版，不上传 UE 工程包。下文介绍保留在 `classic/` 的经典版本。

## 《鸢尾湾·花与海之约》 · 海景花墅、莫奈花园与群岛海湾庄园

基于 **Babylon.js `9.36.0`** 与自研 **二次元双阶 Cel 着色插件（`GenshinToonPlugin`）** 构建的 3D 互动海岸庄园礼赠应用。场景融合近景双层海景花墅、莫奈瀑布睡莲鱼虾池、繁花双人秋千、中景半岛石砌游艇海港与远景群岛对岸小镇，支持默认俯瞰全景、点击深入第一人称漫步，以及 **小贤贤 & 小冉子** 双人骨骼漫游与 69 处场景/NPC/生态动物互动。

所有运行时代码、字体、礼赠文案与 **51 个 `.glb` 三维模型**均 100% 本地自托管，无任何外部运行时网络请求。

---

## 一、交付物与目录结构

| 路径 | 用途 |
| --- | --- |
| `site/` | 前端源码（`index.html`、`style.css`、`app.js`、`audio.js`、`gift.json` 及 `site/modules/` 16 个模块化子系统） |
| `site/assets/models/` | 51 个本地压缩优化 `.glb` 资产（`35.58 MB`）：双主角 VRM 骨骼角色、3 位 VRM 村民 NPC、风格化林木与 8 类动物、建筑地标、25 件 Poly Haven CC0 家具/礁石、10 件动植物 |
| `tools/blender/` | Blender 4.0.2 程序化与 VRM 骨骼建模脚本及 VRM 源哈希清单（`vrm_sources.json`） |
| `tools/optimize_glbs.py` | GLB 安全减面（Blender 4.0.2）、不透明非正常贴图 PNG→JPEG 重打包、全局静止骨骼动画通道裁剪与孤立 `bufferViews` 去重工具 |
| `dist-vite/` | Vite 生产打包产物（3 个合并 JS chunk：`index`、`babylon-core`、`babylon-loaders` + 静态模型资源，`39.18 MB`） |
| `dist/` | 带 SHA-256 校验清单（`release.json`）与 `.nojekyll` 的静态部署产物（`39.18 MB`） |
| `鸢尾湾·花与海之约.html` | 100% 自包含离线单文件 HTML（`33.19 MB`，Gzip-9 + Base64 内联字体、赠言与全部 51 个 `.glb`，直接双击 `file://` 离线运行） |
| `tests/` | 构建/逻辑回归单测（`test_build.py`，12 项）与 Playwright WebGL2 端到端验证（`verify_e2e_playwright.py`） |

---

## 二、环境依赖、开发、构建与测试

### 环境要求
- **Node.js** `>= 20`（含 `npm`，用于 Vite 开发服务、Web 打包及离线单文件构建）
- **Python** `>= 3.10`（用于 `build.py` 静态发布打包与测试套件；运行 E2E 需安装 `playwright`，运行 GLB 减面需安装 `blender 4.0` 与 `Pillow`）

### 常用命令
```bash
# 安装本地依赖
npm ci

# 启动热更新开发服务器 (http://127.0.0.1:5173)
npm run dev

# 同步构建 Vite Web 产物 (dist-vite/) 与离线单文件 HTML (鸢尾湾·花与海之约.html)
npm run build

# 分别单独构建 Web 产物或离线单文件
npm run build:web
npm run build:single

# 生成带 SHA-256 清单的静态发布目录 dist/（自动检测源码变动并在过期时重建 dist-vite/）
python3 build.py --output dist

# 运行单元测试与纯逻辑回归测试
npm test

# 运行 Playwright Chromium WebGL2 端到端验证（同时校验 HTTP dist/ 与断网 file:// 单文件）
npm run test:e2e

# 可选：对高面数道具执行可控减面与不透明贴图优化
npm run optimize:glbs
```

---

## 三、场景架构与核心模块

`site/modules/` 按职责拆分为 16 个模块，核心依赖流为：

- **基础空间与资产层**：
  - `world-spatial.js`：260m 半岛地形高度/法线解析公式、植被禁区、2.5D 平滑滑动碰撞、别墅一/二层室内包围盒与过门寻路（单一事实源）、程序化 PBR 贴图工具。
  - `assets-loader.js`：统一加载 51 个 `.glb`（自动适配 Web HTTP 与单文件离线 `DecompressionStream` 内存解压）并统计失败项。
  - `glb-helpers.js`：GLB 节点遍历、阴影配置、零重复贴图克隆（`cloneMaterialSharingTextures`）、静态网格按材质合并（`mergeStaticChildrenByMaterial`）、统一关闭高开销 `subSurface` 全场景折射通道、GPU `ThinInstance` 批量归一化摆放与水面程序贴图。
- **大气、渲染与风格化层**：
  - `ocean-sky-stage.js`：傍晚/月夜大气散射天空盒、Beer-Lambert 海岸浪花水体、3 级联 2048px CSM 阴影、`SSAO2RenderingPipeline`、`DefaultRenderingPipeline`（ACES / Bloom / FXAA / Sharpen）与 `GlowLayer`；低画质档位自动从相机卸载 SSAO2 并关闭 GlowLayer。
  - `genshin-toon-plugin.js`：Babylon `MaterialPluginBase` 二次元双阶 Cel 着色插件（区分世界建筑、角色衣物、角色发丝天使光环、面部柔和过渡与眼部五官，显式排除家具与水生道具名称误判）。
- **场景子系统**：
  - `island-terrain-and-horizon.js`：半岛地形网格、花岗岩庭院、环湾 3 层远山、6 座群岛、对岸聚落与沿海扫描礁石。
  - `flora-and-fx.js`：GPU `ThinInstance` 实例化草甸/野花/林木、漂浮花瓣、蝴蝶群与互动粒子特效。
  - `harbor-villa-world.js`（协调器）：汇总 `world-villa.js`（两层海景花墅与室内交互）、`world-gardens-pond.js`（莫奈瀑布鱼虾池与双人秋千）、`world-harbor-estate.js`（海港、防波堤、灯塔、风车、木栈道、溪桥、农舍、船队）与 `world-town-life.js`（7 位交互动漫 NPC、8 类小动物、沙滩螃蟹查找表与蝴蝶）。
- **操控与双人系统**：
  - `exploration-camera.js`：默认俯瞰环绕、双击平滑飞行（室内门廊 Catmull-Rom 防穿顶曲线）与第一人称漫步，支持帧率无关指数阻尼与窗口失焦清键。
  - `couple-rigged-controller.js` & `couple-mode-babylon.js`：驱动 **小贤贤**（83 根发丝/裙摆弹簧骨）与 **小冉子**（50 根发丝/披肩/大衣弹簧骨），支持 19 组动画片段、17 组表情 Morph、眼球对视追踪、一/二/三人称视角、触屏单指旋转与双指捏合缩放及移动端面板折叠。
  - `gift-config.js` & `site/audio.js`：集中化礼赠配置解析与零依赖 Web Audio 合成音效（支持一键静音）。

---

## 四、交互与控制说明

- **俯瞰全景与第一人称漫步**：
  - 桌面端：左键拖拽旋转、右键/中键平移、滚轮缩放、单击聚焦、双击深入漫步；漫步态支持 `WASD` / 方向键移动、`Shift` 加速、`Esc` 返回全景。
  - 触屏端：单指旋转、双指捏合缩放、点击地面行走；底部提示栏根据指针类型自动切换触屏/键鼠文案。
- **双人漫游模式（`💞 双人漫游`）**：
  - 切换操控 `小贤贤` / `小冉子`（`Tab`），切换 `第一/第二/第三人称`（`V`），`F` 牵手、`1–8` 触发拥抱/亲亲/摸头/跳舞/比心/公主抱/眨眼/神态切换、`Space` 开心跳、`E` 与 69 处道具/NPC/动物互动、`Esc` 退出。
  - 窄屏设备（`<= 680px`）自动提供面板折叠按钮以减少视口遮挡。
- **状态栏与隐藏调试面板**：
  - `纪念信笺`（走近书房书桌自动展开，关闭恢复原视角）、`音效/静音`（`#btn-mute`）、`暂停/运行`（`Space`，同步冻结仿真时间、场景骨骼动画与待机角色）、`夜景/傍晚`、`复位`（确定性退出双人模式并恢复默认傍晚全景）。
  - 按 `` ` ``、`F3` 或访问 `?debug=1` 打开默认隐藏的性能调试 HUD（实时 `FPS`、`Draw Calls`、`Triangles` 与 `自动 / 高 / 中 / 低` 四档画质切换；自动档支持带滞回的降档与恢复）。

---

## 五、礼赠文案自定义

所有礼赠标题、收信人、称呼、正文、落款与日期集中维护于：
1. `site/gift.json`（Web 构建权威源）
2. `site/modules/gift-config.js`（离线兜底默认值）

修改后执行 `npm run build` 与 `python3 build.py --output dist` 即可同步更新 Web 站点与离线单文件 HTML。

---

## 六、许可证与第三方资源

本项目全部依赖、字体与 51 个本地 `.glb` 模型均已登记版权、作者署名与修改说明，详见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

---

## 七、实测验证记录

以下结果在当前 Linux 构建环境（Node `v24.21.0`、Python `3.12`、无头 Chromium WebGL2 SwiftShader 软件渲染器、`1280 × 720`）中实际执行采集：

- `npm run build` & `python3 build.py --output dist`：
  - `site/assets/models/`：`35.58 MB`（51 个 `.glb`，无孤立 `bufferViews`，剔除 16,540 条全局静止骨骼动画通道）
  - `dist/` 与 `dist-vite/`：`39.18 MB`（`dist-vite/assets/` 合并为 3 个 JS chunk，无冗余 `.wasm`）
  - 离线单文件 `鸢尾湾·花与海之约.html`：`33.20 MB`（含 51 个内联 `.glb`、字体与配置）
- `npm test`（`tests/test_build.py`）：**12/12 通过**（覆盖构建清单、过期产物检测、无外链、离线自包含、JS 语法、GLB 缓冲与骨骼通道紧凑度、材质贴图零重复克隆、`GenshinToonPlugin` 材质分类零误伤与 `world-spatial` 别墅寻路）
- `npm run test:e2e`（`tests/verify_e2e_playwright.py`）：
  - **Web 构建（HTTP `dist/`）**与 **离线单文件（`file://` + `offline=True`）** 均通过全部断言：**0 console error、0 pageerror、0 外部网络请求、0 失败 GLB**；
  - 场景运行时统计（对比优化前）：`drawCalls = 2,993`（单帧实测自 `5,690` 下降 `47.4%`，并修复跨帧累加问题）、`meshes = 1,169`（自 `1,994` 下降 `41.4%`）、`materials = 416`（自 `810` 下降 `48.6%`）、`textures = 190`（自 `1,148` 下降 `83.4%`）、`interactables = 69`；
  - 实机确认：家具/水生材质未误判为角色头发、吊灯折射 RTT 已关闭、低画质真实卸载 SSAO2 与关闭 GlowLayer、双人模式点击复位正确退出并回到全景、暂停冻结场景时间与待机角色、静音开关、移动端 `390 × 844` 零横向溢出与面板折叠均正常。
