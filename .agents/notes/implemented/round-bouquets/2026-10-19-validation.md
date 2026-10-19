# 环绕混合花束验收

日期：2026-10-19。范围：本次环绕构图、连续瓣面与资源加载实现；线上版本另以 Pages 部署记录为准。

## 独立构建与回归

将 Git 跟踪文件和本次新增源码复制到独立临时目录，不复制被忽略的点云、曲面、SVG 或 dist。运行 `python3 -m unittest discover -s tests -v`：42 项通过，包含生成器 30 项、真实全量资源的 Node 渲染契约、曲面解码、缩略图和构建测试。随后 `python3 build.py` 成功。

正式八组粒子与曲面逐文件 SHA256 匹配真实 GL 通过候选；各主题均为 120,000 点、stride 11、5,280,000 字节，各曲面严格小于 3,000,000 字节。完整日志与输入哈希保存在本地忽略提交的 `artifacts/release-unittest.log`、`release-build.log` 和 `release-input-hashes.json`。

正式构建上的 `tests/browser_smoke.py` 全部 38 项通过：八主题选择、轻量缩略图、连续动画、快速切换、暂停中形变、绽放、拖动/键盘、信件、沉浸与分享，以及 320/360/390/768/1024 布局。包括无 WebGL、无 Uint32 索引、上下文丢失、启动竞态、错误点/面数据、越界索引、Save-Data 与 3G 预取行为。没有未捕获浏览器异常。

## 真实 GL 环绕

每主题运行 `tests/visual_depth.py --views 12`，保留正侧背与中间角度实图、真实像素统计和 GL 错误检查。原面积比至少 .72、宽度比至少 .82 的门槛没有放宽。结果为最小/最大可见花冠面积比、宽度比：

- rose：.729028 / .864238。
- tulip：.741690 / .890710。
- hydrangea：.778542 / .875000。
- wildflower：.729665 / .823171。
- peony：.730530 / .885093。
- lily：.735077 / .868502。
- sunflower：.737523 / .860759。
- calla：.729825 / .845960。

证据分布于本地 `artifacts/full-orbit`、`rounded-hydrangea`、`geometry-tuning` 与 `secondary-tuning/candidate-g/gl`。各通过输入与最后独立构建逐字节核对，未把失败候选或旧资产当作正式通过证据。参考照片不提交、不部署。

人工检查了各主花形态及正背图，纠正低位叶遮挡、过长握柄、混合花园主花单一、绣球菱形硬瓣和马蹄莲杯翼翻转。另以 390×844、触屏和双倍像素密度捕获混合花园/马蹄莲手机正背预览；混合花园的标题、花束和按钮没有重叠。

## 限制与复现

浏览器采用 Chromium 和 SwiftShader，移动端为视口/触屏模拟，不代表实体手机 GPU 性能；十二方位实图和 CPU 多方向覆盖也不等于数学上穷尽连续角度。数值通过与人工审美检查分别保留。

可从干净源码重放：

```sh
python3 -m unittest discover -s tests -v
python3 build.py
python3 -m http.server 8780 --bind 127.0.0.1 --directory dist
# 另一个终端
python3 tests/visual_depth.py --url http://127.0.0.1:8780 --views 12
python3 tests/browser_smoke.py --url http://127.0.0.1:8780
```

测试服务需由调用方退出；with_server 托管时使用 `exec python3 ...`，使清理直接作用于实际服务进程，避免遗留 shell 子进程。
