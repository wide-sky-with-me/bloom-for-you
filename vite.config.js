import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function copyDirRecursive(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

function irisBayVitePlugin() {
  let resolvedOutDir = path.resolve(__dirname, "dist-vite");
  return {
    name: "iris-bay-static-assets",
    configResolved(config) {
      resolvedOutDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const modelsSrc = path.resolve(__dirname, "site/assets/models");
      const modelsDest = path.resolve(resolvedOutDir, "assets/models");
      if (existsSync(modelsSrc)) {
        copyDirRecursive(modelsSrc, modelsDest);
      }

      const havokSrc = path.resolve(__dirname, "site/assets/havok/HavokPhysics.wasm");
      const havokNmSrc = path.resolve(__dirname, "node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm");
      const wasmSrc = existsSync(havokSrc) ? havokSrc : havokNmSrc;
      if (existsSync(wasmSrc)) {
        const havokDestDir = path.resolve(resolvedOutDir, "assets/havok");
        mkdirSync(havokDestDir, { recursive: true });
        copyFileSync(wasmSrc, path.resolve(havokDestDir, "HavokPhysics.wasm"));
      }

      const giftSrc = path.resolve(__dirname, "site/gift.json");
      if (existsSync(giftSrc)) {
        copyFileSync(giftSrc, path.resolve(resolvedOutDir, "gift.json"));
      }
      const noticesSrc = path.resolve(__dirname, "THIRD_PARTY_NOTICES.md");
      if (existsSync(noticesSrc)) {
        copyFileSync(noticesSrc, path.resolve(resolvedOutDir, "THIRD_PARTY_NOTICES.md"));
      }
      const flowerSrc = path.resolve(__dirname, "site/assets/flower.svg");
      if (existsSync(flowerSrc)) {
        mkdirSync(path.resolve(resolvedOutDir, "assets"), { recursive: true });
        copyFileSync(flowerSrc, path.resolve(resolvedOutDir, "assets/flower.svg"));
      }
    },
  };
}

export default defineConfig({
  root: "site",
  base: "./",
  publicDir: false,
  plugins: [irisBayVitePlugin()],
  optimizeDeps: {
    exclude: ["@babylonjs/havok"],
  },
  build: {
    outDir: "../dist-vite",
    emptyOutDir: true,
    target: "es2022",
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 5500,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
