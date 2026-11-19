#!/usr/bin/env python3
"""End-to-end Playwright WebGL2 regression suite for 《鸢尾湾·花与海之约》.

Verifies both:
  1. Static Web bundle (`dist/` served over local loopback HTTP, port=0)
  2. Standalone self-contained offline HTML (`file://` with browser context offline=True)

Asserts zero console/page errors, zero external requests, zero failed GLB loads,
plus runtime verification of key architectural & bug fixes.
"""

from __future__ import annotations

import argparse
import base64
import functools
import http.server
import json
from pathlib import Path
import socketserver
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DIST_DIR = ROOT / "dist"
SINGLE_HTML = ROOT / "鸢尾湾·花与海之约.html"


class _QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args) -> None:  # noqa: A002
        return


def _start_static_server(directory: Path) -> tuple[socketserver.TCPServer, int]:
    handler = functools.partial(_QuietHandler, directory=str(directory))
    server = socketserver.TCPServer(("127.0.0.1", 0), handler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, port


def _launch_args() -> list[str]:
    return [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--ignore-gpu-blocklist",
        "--no-sandbox",
    ]


def verify_web_dist(screenshots_dir: Path | None = None) -> dict:
    server, port = _start_static_server(DIST_DIR)
    url = f"http://127.0.0.1:{port}/index.html?qa=1"
    console_errors: list[str] = []
    page_errors: list[str] = []
    external_reqs: list[str] = []

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=_launch_args())
            context = browser.new_context(viewport={"width": 1280, "height": 720})
            page = context.new_page()

            page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
            page.on("pageerror", lambda err: page_errors.append(str(err)))
            page.on(
                "request",
                lambda req: external_reqs.append(req.url)
                if req.url.startswith(("http://", "https://")) and not req.url.startswith(f"http://127.0.0.1:{port}")
                else None,
            )

            page.goto(url, wait_until="domcontentloaded", timeout=120_000)
            page.wait_for_function("() => window.__fairytaleWorld && window.__fairytaleWorld.ready === true", timeout=180_000)

            report = page.evaluate(
                """async () => {
                  const w = window.__fairytaleWorld;
                  const state0 = w.getState();
                  const perfHigh = w.getPerformanceMetrics();
                  w.scene.render();
                  const perfNextFrame = w.getPerformanceMetrics();
                  const stats0 = w.getStats();

                  // 1. Verify toon material classification on live scene materials
                  const misclassifiedProps = [];
                  const badRefractionMats = [];
                  for (const mat of w.scene.materials) {
                    const name = mat.name || "";
                    if (/Armchair_01|GreenChair_01|outdoor_table_chair_set_01_chair|wooden_picnic_table_bottom|M_RyukinBody2/i.test(name)) {
                      const plugin = mat.pluginManager?.getPlugin?.("GenshinToon");
                      if (plugin && plugin._mode !== 0) {
                        misclassifiedProps.push({ name, mode: plugin._mode });
                      }
                    }
                    if (/chandelier/i.test(name) && mat.subSurface?.isRefractionEnabled) {
                      badRefractionMats.push(name);
                    }
                  }

                  // 2. Verify low quality truly detaches SSAO2 and disables GlowLayer
                  w.setQuality("low");
                  const lowSsao = w.getSimState().ssaoAttached;
                  const lowGlow = w.oceanSky.glowLayer.isEnabled;
                  w.setQuality("high");
                  const highSsao = w.getSimState().ssaoAttached;
                  const highGlow = w.oceanSky.glowLayer.isEnabled;

                  // 3. Verify pause freezes both simTime and idle couple movement
                  w.setSimPaused(true);
                  const beforePause = w.getState();
                  const animEnabledPaused = w.scene.animationsEnabled;
                  await w.advanceAndRender(0.35, 0.05);
                  const afterPause = w.getState();
                  w.setSimPaused(false);
                  const animEnabledResumed = w.scene.animationsEnabled;

                  // 4. Verify resetWorld exits active couple mode cleanly
                  w.enterCoupleMode("xian");
                  const coupleActiveBeforeReset = w.getState().couple.active;
                  document.getElementById("btn-reset").click();
                  const afterReset = w.getState();

                  // 5. Verify mute toggle, letter modal, and night mode
                  const muteBtn = document.getElementById("btn-mute");
                  muteBtn.click();
                  const mutedAfterClick = w.audio.isMuted();
                  muteBtn.click();
                  const mutedAfterUnclick = w.audio.isMuted();

                  document.getElementById("btn-letter").click();
                  const letterOpen = w.getState().letterVisible;
                  document.getElementById("letter-close").click();
                  const letterClosed = !w.getState().letterVisible;

                  w.setNight(true);
                  const nightMixOn = w.getState().nightMix;
                  w.setNight(false);

                  return {
                    state0,
                    perfHigh,
                    perfNextFrame,
                    stats0,
                    misclassifiedProps,
                    badRefractionMats,
                    lowSsao,
                    lowGlow,
                    highSsao,
                    highGlow,
                    pauseSimDelta: Math.abs(afterPause.simTime - beforePause.simTime),
                    pauseXianMoved: JSON.stringify(afterPause.couple.xianPos) !== JSON.stringify(beforePause.couple.xianPos),
                    animEnabledPaused,
                    animEnabledResumed,
                    coupleActiveBeforeReset,
                    coupleActiveAfterReset: afterReset.couple.active,
                    modeAfterReset: afterReset.mode,
                    mutedAfterClick,
                    mutedAfterUnclick,
                    letterOpen,
                    letterClosed,
                    nightMixOn,
                  };
                }"""
            )

            if screenshots_dir is not None:
                screenshots_dir.mkdir(parents=True, exist_ok=True)
                snaps = page.evaluate(
                    """() => {
                      const w = window.__fairytaleWorld;
                      const c = document.getElementById("diorama-canvas");
                      const grab = () => { w.scene.render(); return c.toDataURL("image/png"); };
                      w.resetWorld();
                      const day = grab();
                      w.setNight(true);
                      const night = grab();
                      w.setNight(false);
                      w.setCameraPreset("pondFishShrimpCloseup");
                      w.controls.update(0.05);
                      const pond = grab();
                      w.resetWorld();
                      w.scene.render();
                      return { day, night, pond };
                    }"""
                )
                for key, fname in (("day", "qa_aerial_day.png"), ("night", "qa_aerial_night.png"), ("pond", "qa_pond_fish_shrimp.png")):
                    b64_part = snaps[key].split(",", 1)[1]
                    (screenshots_dir / fname).write_bytes(base64.b64decode(b64_part))

            # 6. Verify mobile viewport couple-panel collapse control & zero horizontal page overflow
            page.set_viewport_size({"width": 390, "height": 844})
            page.evaluate("() => window.__fairytaleWorld.enterCoupleMode('xian')")
            toggle_btn = page.locator("[data-couple-toggle]")
            mobile_toggle_visible = toggle_btn.is_visible()
            toggle_btn.click()
            mobile_collapsed = page.locator("#couple-panel.is-collapsed").count() == 1
            mobile_scroll_width = page.evaluate("() => document.documentElement.scrollWidth")
            if screenshots_dir is not None:
                mob_b64 = page.evaluate(
                    """() => {
                      const w = window.__fairytaleWorld;
                      w.couple.update(0.05);
                      w.scene.render();
                      return document.getElementById("diorama-canvas").toDataURL("image/png");
                    }"""
                )
                (screenshots_dir / "qa_mobile_couple.png").write_bytes(base64.b64decode(mob_b64.split(",", 1)[1]))
            page.evaluate("() => window.__fairytaleWorld.exitCoupleMode()")

            browser.close()
    finally:
        server.shutdown()
        server.server_close()

    assert not console_errors, f"Web console errors: {console_errors}"
    assert not page_errors, f"Web page errors: {page_errors}"
    assert not external_reqs, f"Forbidden external requests: {external_reqs}"
    assert report["state0"]["renderer"] == "babylon-9.36.0"
    assert report["state0"]["failedModels"] == [], f"Failed GLBs: {report['state0']['failedModels']}"
    assert report["misclassifiedProps"] == [], f"Misclassified Toon props: {report['misclassifiedProps']}"
    assert report["badRefractionMats"] == [], f"Chandelier refraction still enabled: {report['badRefractionMats']}"
    assert report["perfHigh"]["drawCalls"] < 3500, f"Draw calls too high: {report['perfHigh']['drawCalls']}"
    assert abs(report["perfNextFrame"]["drawCalls"] - report["perfHigh"]["drawCalls"]) < 50, (
        f"Draw calls accumulated across frames instead of resetting: {report['perfHigh']['drawCalls']} -> {report['perfNextFrame']['drawCalls']}"
    )
    assert report["perfHigh"]["meshes"] < 1200, f"Unmerged static mesh bloat: {report['perfHigh']['meshes']}"
    assert report["perfHigh"]["materials"] < 420, f"Cloned material bloat: {report['perfHigh']['materials']}"
    assert report["perfHigh"]["textures"] < 360, f"Cloned texture bloat: {report['perfHigh']['textures']}"
    assert report["lowSsao"] is False and report["lowGlow"] is False
    assert report["highSsao"] is True and report["highGlow"] is True
    assert report["pauseSimDelta"] < 1e-6 and report["pauseXianMoved"] is False
    assert report["animEnabledPaused"] is False and report["animEnabledResumed"] is True
    assert report["coupleActiveBeforeReset"] is True
    assert report["coupleActiveAfterReset"] is False and report["modeAfterReset"] == "aerial"
    assert report["mutedAfterClick"] is True and report["mutedAfterUnclick"] is False
    assert report["letterOpen"] is True and report["letterClosed"] is True
    assert report["nightMixOn"] == 1.0
    assert mobile_toggle_visible is True and mobile_collapsed is True
    assert mobile_scroll_width <= 390, f"Mobile horizontal overflow: scrollWidth={mobile_scroll_width}"

    report["mobile_toggle_visible"] = mobile_toggle_visible
    report["mobile_collapsed"] = mobile_collapsed
    return report


def verify_offline_single_html() -> dict:
    assert SINGLE_HTML.is_file(), f"Missing standalone HTML: {SINGLE_HTML}"
    file_url = SINGLE_HTML.resolve().as_uri() + "?qa=1"
    console_errors: list[str] = []
    page_errors: list[str] = []
    external_reqs: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=_launch_args())
        context = browser.new_context(viewport={"width": 1280, "height": 720}, offline=True)
        page = context.new_page()

        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda err: page_errors.append(str(err)))
        page.on(
            "request",
            lambda req: external_reqs.append(req.url)
            if req.url.startswith(("http://", "https://"))
            else None,
        )

        page.goto(file_url, wait_until="domcontentloaded", timeout=120_000)
        page.wait_for_function("() => window.__fairytaleWorld && window.__fairytaleWorld.ready === true", timeout=180_000)

        res = page.evaluate(
            """() => {
              const w = window.__fairytaleWorld;
              return {
                state: w.getState(),
                perf: w.getPerformanceMetrics(),
                stats: w.getStats(),
              };
            }"""
        )
        browser.close()

    assert not console_errors, f"Offline HTML console errors: {console_errors}"
    assert not page_errors, f"Offline HTML page errors: {page_errors}"
    assert not external_reqs, f"Offline HTML external requests: {external_reqs}"
    assert res["state"]["ready"] is True
    assert res["state"]["failedModels"] == [], f"Offline failed GLBs: {res['state']['failedModels']}"
    return res


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--screenshots-dir", type=Path, default=None, help="Optional directory to save QA screenshots")
    parser.add_argument("--mode", choices=("all", "web", "offline"), default="all", help="Which E2E target(s) to run")
    args = parser.parse_args()

    if args.mode == "web":
        web_res = verify_web_dist(args.screenshots_dir)
        print(json.dumps({"web": web_res["perfHigh"], "webNextFrame": web_res["perfNextFrame"]}, indent=2))
        print("WEB E2E PLAYWRIGHT ASSERTIONS PASSED ZERO-ERROR!")
        return 0
    if args.mode == "offline":
        off_res = verify_offline_single_html()
        print(json.dumps({"offline": off_res["perf"]}, indent=2))
        print("OFFLINE E2E PLAYWRIGHT ASSERTIONS PASSED ZERO-ERROR!")
        return 0

    print("[E2E] 1/2 Verifying dist/ over local HTTP...")
    web_res = verify_web_dist(args.screenshots_dir)
    print(
        f"[E2E] Web OK | meshes={web_res['perfHigh']['meshes']} tris={web_res['perfHigh']['triangles']} "
        f"drawCalls={web_res['perfHigh']['drawCalls']} mats={web_res['perfHigh']['materials']} "
        f"texs={web_res['perfHigh']['textures']} interactables={web_res['state0']['interactableCount']}"
    )

    print("[E2E] 2/2 Verifying standalone offline HTML via file:// (offline=True)...")
    off_res = verify_offline_single_html()
    print(json.dumps({"web": web_res["perfHigh"], "webNextFrame": web_res["perfNextFrame"], "offline": off_res["perf"]}, indent=2))
    print("ALL E2E PLAYWRIGHT ASSERTIONS PASSED ZERO-ERROR!")
    return 0


if __name__ == "__main__":
    sys.exit(main())
