#!/usr/bin/env node
/**
 * Regenerates the three platform app icons from src/assets/icon-source-1024.png.
 *
 * The filenames are a build contract, not a naming choice: electron-builder.json
 * points `mac.icon`, `win.icon` and `linux.icon` at icon.icns / icon.ico /
 * icon.png, so this writes those exact paths in place and changes only pixel
 * content. See "The OpenWhispr → VoceLibre rename" in CLAUDE.md.
 *
 * Sizes:
 *   .ico   16, 24, 32, 48, 64, 128, 256 — icon-gen only emits from its own size
 *          palette, so the 72 and 96 entries the previous file carried are
 *          dropped. Neither is a Windows shell size (it uses 16/32/48/256), and
 *          electron-builder only requires a 256 to be present.
 *   .icns  512 + 1024, where the previous file carried a lone ic10 (1024).
 *   .png   512x512. Given a single PNG, electron-builder ships exactly one
 *          hicolor icon at that source's size and never upscales — a 256
 *          source shipped only 256x256, leaving GNOME's app grid to upscale on
 *          HiDPI. A multi-size set would need linux.icon pointed at a
 *          directory, which would change a path electron-builder.json pins.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const iconGen = require("icon-gen");

const repoRoot = path.resolve(__dirname, "..");
const assets = path.join(repoRoot, "src", "assets");
const source = path.join(assets, "icon-source-1024.png");

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const ICNS_SIZES = [512, 1024];
const LINUX_PNG_SIZE = 512;

async function main() {
  if (!fs.existsSync(source)) {
    console.error(`[icons] Missing source image: ${source}`);
    process.exit(1);
  }

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "vocelibre-icons-"));
  try {
    await iconGen(source, outDir, {
      report: false,
      ico: { name: "icon", sizes: ICO_SIZES },
      icns: { name: "icon", sizes: ICNS_SIZES },
      favicon: { name: "png-", pngSizes: [LINUX_PNG_SIZE], icoSizes: [] },
    });

    const moves = [
      [path.join(outDir, "icon.ico"), path.join(assets, "icon.ico")],
      [path.join(outDir, "icon.icns"), path.join(assets, "icon.icns")],
      [path.join(outDir, `png-${LINUX_PNG_SIZE}.png`), path.join(assets, "icon.png")],
    ];

    for (const [from, to] of moves) {
      if (!fs.existsSync(from)) throw new Error(`icon-gen did not produce ${from}`);
      fs.copyFileSync(from, to);
      console.log(`[icons] wrote ${path.relative(repoRoot, to)}`);
    }
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("[icons] Generation failed:", err);
  process.exit(1);
});
