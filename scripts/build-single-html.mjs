#!/usr/bin/env node
/**
 * Build standalone 100% self-contained offline HTML deliverable:
 *   /鸢尾湾·花与海之约.html
 *
 * Inlines:
 *   1. Favicon SVG (base64 data URI)
 *   2. Subset font `flower-song.woff2` (base64 data URI inside CSS) + full `site/style.css`
 *   3. Centralized gift config (`window.__INLINE_GIFT_CONFIG__`)
 *   4. All 10 `.glb` botanical & aquatic models compressed via gzip level-9 + base64
 *      (`window.__INLINE_GLB_GZIP_B64__`, decoded in-memory via DecompressionStream + GLTFLoader.parse)
 *   5. Complete Three.js + Addons + Scene Modules bundled as a single IIFE script (zero ES module imports,
 *      zero fetch() calls, zero external URLs — opens directly via `file://` offline).
 */

import { readFileSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SITE = path.resolve(ROOT, "site");
const OUTPUT_HTML = path.resolve(ROOT, "鸢尾湾·花与海之约.html");

const MODEL_FILES = {
  freshwater_shrimp: "freshwater_shrimp.glb",
  ryukin_goldfish: "ryukin_goldfish.glb",
  pond_koi: "pond_koi.glb",
  waterlily: "waterlily.glb",
  rose_bush: "rose_bush.glb",
  margarita_bush: "margarita_bush.glb",
  wisteria_cascade: "wisteria_cascade.glb",
  ph_fern: "ph_fern.glb",
  ph_periwinkle: "ph_periwinkle.glb",
  hero_rose: "hero_rose.glb",
  ph_sofa: "ph_sofa.glb",
  ph_green_chair: "ph_green_chair.glb",
  ph_armchair: "ph_armchair.glb",
  ph_chandelier: "ph_chandelier.glb",
  ph_ornate_mirror: "ph_ornate_mirror.glb",
  ph_console: "ph_console.glb",
  ph_nightstand: "ph_nightstand.glb",
  ph_coffee_table: "ph_coffee_table.glb",
  ph_tea_set: "ph_tea_set.glb",
  ph_mantel_clock: "ph_mantel_clock.glb",
  ph_picture_frame: "ph_picture_frame.glb",
  ph_bistro_set: "ph_bistro_set.glb",
  ph_brass_pan: "ph_brass_pan.glb",
  ph_croissant: "ph_croissant.glb",
  ph_wicker_basket: "ph_wicker_basket.glb",
  ph_watering_can: "ph_watering_can.glb",
  ph_alarm_clock: "ph_alarm_clock.glb",
  ph_oil_lamp: "ph_oil_lamp.glb",
  ph_cliff_01: "ph_cliff_01.glb",
  ph_cliff_02: "ph_cliff_02.glb",
  ph_coast_rocks: "ph_coast_rocks.glb",
  ph_coast_rocks_b: "ph_coast_rocks_b.glb",
  ph_moss_boulder: "ph_moss_boulder.glb",
  ph_coastal_shrub: "ph_coastal_shrub.glb",
  ph_lifebuoy: "ph_lifebuoy.glb",
  ph_picnic_table: "ph_picnic_table.glb",
  couple_parts: "couple_parts.glb",
};

function escapeInlineScript(code) {
  return code.replace(/<\/script/gi, "<\\/script");
}

async function bundleAppIIFE() {
  const result = await build({
    configFile: false,
    root: SITE,
    logLevel: "warn",
    build: {
      write: false,
      minify: "esbuild",
      target: "es2022",
      rollupOptions: {
        input: path.resolve(SITE, "app.js"),
        output: {
          format: "iife",
          name: "IrisBayStandaloneApp",
          inlineDynamicImports: true,
        },
      },
    },
  });

  const outputs = Array.isArray(result) ? result[0].output : result.output;
  const jsChunk = outputs.find((item) => item.type === "chunk" && item.isEntry);
  if (!jsChunk) {
    throw new Error("Failed to produce standalone IIFE bundle from site/app.js");
  }
  return jsChunk.code;
}

async function main() {
  console.log("[single-file] Bundling Three.js + scene modules into standalone IIFE...");
  const appCode = await bundleAppIIFE();

  console.log("[single-file] Encoding font, styles, gift config & 28 GLB models (gzip-9 + base64)...");
  const svgB64 = readFileSync(path.resolve(SITE, "assets/flower.svg")).toString("base64");
  const fontB64 = readFileSync(path.resolve(SITE, "assets/flower-song.woff2")).toString("base64");

  const rawCss = readFileSync(path.resolve(SITE, "style.css"), "utf-8");
  const inlinedCss = rawCss.replace(
    /url\(["']?\.\/assets\/flower-song\.woff2["']?\)/g,
    `url("data:font/woff2;base64,${fontB64}")`
  );

  const giftConfig = JSON.parse(readFileSync(path.resolve(SITE, "gift.json"), "utf-8"));

  const glbMap = {};
  for (const [key, filename] of Object.entries(MODEL_FILES)) {
    const rawGlb = readFileSync(path.resolve(SITE, "assets/models", filename));
    const gz = gzipSync(rawGlb, { level: 9 });
    glbMap[key] = gz.toString("base64");
  }

  // Extract body markup from site/index.html while removing external module script/links
  const rawHtml = readFileSync(path.resolve(SITE, "index.html"), "utf-8");
  const bodyMatch = rawHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) {
    throw new Error("Could not extract <body> from site/index.html");
  }
  const cleanBodyInner = bodyMatch[1]
    .replace(/<script\b[^>]*src=[^>]*><\/script>/gi, "")
    .trim();

  const singleHtml = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
  <title>《鸢尾湾·花与海之约》 · 海景花墅、莫奈花园与群岛海湾庄园 (离线典藏版)</title>
  <meta name="description" content="《鸢尾湾·花与海之约》自包含离线单文件 3D 互动海岸庄园（内联 Three.js、模型、字体与赠言配置，支持 file:// 直接打开）。" />
  <link rel="icon" href="data:image/svg+xml;base64,${svgB64}" />
  <style>
${inlinedCss}
  </style>
</head>
<body>
  ${cleanBodyInner}
  <script>
window.__INLINE_GIFT_CONFIG__ = ${escapeInlineScript(JSON.stringify(giftConfig))};
window.__INLINE_GLB_GZIP_B64__ = ${escapeInlineScript(JSON.stringify(glbMap))};
  </script>
  <script>
${escapeInlineScript(appCode)}
  </script>
</body>
</html>
`;

  writeFileSync(OUTPUT_HTML, singleHtml, "utf-8");
  const sizeMB = (statSync(OUTPUT_HTML).size / (1024 * 1024)).toFixed(2);
  console.log(`[single-file] Built self-contained offline HTML: ${OUTPUT_HTML} (${sizeMB} MB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
