#!/usr/bin/env node
/**
 * Generates every raster brand asset from the source SVGs in brand/.
 *
 *   npm run icons
 *
 * The generated files are committed so deployments do not need to run this
 * step. All source artwork lives in brand/ and is intentionally independent of
 * the application palette so the logo keeps its own identity.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(root, "brand");
const brandDir = path.join(root, "public", "brand");
const androidRes = path.join(root, "android", "app", "src", "main", "res");

const INK = "#0B0C0E";
const ACCENT = "#FB6B45";

const sources = {
  mark: "mark.svg",
  lockupOnLight: "lockup-on-light.svg",
  lockupOnDark: "lockup-on-dark.svg",
  wordmarkOnLight: "wordmark-on-light.svg",
  wordmarkOnDark: "wordmark-on-dark.svg",
};

/**
 * The artwork exports are square canvases with the real content centred inside
 * a nested <svg x y width height>. Crop the outer viewBox to those bounds so
 * the assets can be used at their natural aspect ratio.
 */
function trimSvg(source, label) {
  const outerStart = source.indexOf("<svg");
  const outerEnd = source.indexOf(">", outerStart);
  if (outerStart === -1 || outerEnd === -1) {
    throw new Error(`${label}: no outer <svg> element`);
  }

  const nested = source.match(
    /<svg x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"/,
  );
  if (!nested) {
    throw new Error(`${label}: no nested content bounds`);
  }

  const [, x, y, width, height] = nested;
  const opening = `<svg width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">`;

  return source.slice(0, outerStart) + opening + source.slice(outerEnd + 1);
}

const svg = {};
for (const [key, file] of Object.entries(sources)) {
  svg[key] = trimSvg(
    await readFile(path.join(sourceDir, file), "utf8"),
    file,
  );
}

await mkdir(brandDir, { recursive: true });
await mkdir(androidRes, { recursive: true });

for (const [key, file] of Object.entries({
  mark: "beacon-mark.svg",
  lockupOnLight: "beacon-lockup-on-light.svg",
  lockupOnDark: "beacon-lockup-on-dark.svg",
  wordmarkOnLight: "beacon-wordmark-on-light.svg",
  wordmarkOnDark: "beacon-wordmark-on-dark.svg",
})) {
  await writeFile(path.join(brandDir, file), svg[key]);
}

async function markPng(height) {
  return sharp(Buffer.from(svg.mark))
    .resize({ height, fit: "inside" })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** A compact, high-contrast pin for 16–32 px favicons and notification icons. */
const compactPin = `
  <path fill="${ACCENT}" fill-rule="evenodd" d="M32 9c-8.56 0-15.5 6.94-15.5 15.5C16.5 35.4 32 55 32 55s15.5-19.6 15.5-30.5C47.5 15.94 40.56 9 32 9Zm0 20.6a5.1 5.1 0 1 1 0-10.2 5.1 5.1 0 0 1 0 10.2Z" />`;

function compactIcon(size, { radius = 0.22 } = {}) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="${64 * radius}" fill="${INK}" />
      ${compactPin}
    </svg>`,
  );
}

async function detailedIcon(size, { radius = 0.22, markRatio = 0.62, circle = false } = {}) {
  const background = circle
    ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${INK}" />`
    : `<rect width="${size}" height="${size}" rx="${size * radius}" fill="${INK}" />`;
  const base = sharp(Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${background}</svg>`,
  ));
  const mark = await markPng(Math.round(size * markRatio));
  return base
    .composite([{ input: mark, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/*
 * Website icons.
 */
await sharp(compactIcon(32))
  .png({ compressionLevel: 9 })
  .toFile(path.join(brandDir, "favicon-32.png"));

// iOS applies its own rounded mask, so keep this one full-bleed.
await sharp(compactIcon(180, { radius: 0 }))
  .png({ compressionLevel: 9 })
  .toFile(path.join(brandDir, "apple-touch-icon.png"));

for (const [name, size] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
]) {
  await writeFile(
    path.join(brandDir, name),
    await detailedIcon(size),
  );
}

// Maskable icons are full-bleed; keep the mark inside the central safe zone.
await writeFile(
  path.join(brandDir, "maskable-512.png"),
  await detailedIcon(512, { radius: 0, markRatio: 0.6 }),
);

// Browser tab icon. The compact pin stays legible at 16 px.
await writeFile(path.join(root, "public", "icon.svg"), compactIcon(64));

/*
 * favicon.ico with PNG-compressed 16, 32 and 48 px frames. Browsers and
 * Windows Vista+ accept PNG frames inside an ICO container.
 */
function icoFromPngs(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);

  const directory = Buffer.alloc(16 * frames.length);
  let offset = 6 + directory.length;

  frames.forEach(({ size, png }, index) => {
    const at = index * 16;
    directory.writeUInt8(size >= 256 ? 0 : size, at);
    directory.writeUInt8(size >= 256 ? 0 : size, at + 1);
    directory.writeUInt8(0, at + 2);
    directory.writeUInt8(0, at + 3);
    directory.writeUInt16LE(1, at + 4);
    directory.writeUInt16LE(32, at + 6);
    directory.writeUInt32LE(png.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });

  return Buffer.concat([header, directory, ...frames.map((frame) => frame.png)]);
}

const icoFrames = [];
for (const size of [16, 32, 48]) {
  icoFrames.push({
    size,
    png: await sharp(compactIcon(size)).png({ compressionLevel: 9 }).toBuffer(),
  });
}
await writeFile(path.join(root, "public", "favicon.ico"), icoFromPngs(icoFrames));

/*
 * Social card. The supplied wordmark-on-dark is composited over a dark,
 * low-contrast engineering grid. Text is intentionally plain Arial so the card
 * renders without shipping a font file.
 */
const ogBackground = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glow" cx="82%" cy="50%" r="58%">
      <stop offset="0" stop-color="${ACCENT}" stop-opacity=".20"/>
      <stop offset="1" stop-color="${INK}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="64" height="64" patternUnits="userSpaceOnUse">
      <path d="M64 0H0V64" fill="none" stroke="#25282E" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="1200" height="630" fill="${INK}"/>
  <rect width="1200" height="630" fill="url(#grid)" opacity=".55"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <text x="72" y="196" fill="${ACCENT}" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="700" letter-spacing="4.2">ANDROID-FIRST DEVICE LOCATION</text>
  <text x="72" y="308" fill="#F4F1EA" font-family="Arial, Helvetica, sans-serif" font-size="72" font-weight="700" letter-spacing="-3.4">Location for the</text>
  <text x="72" y="388" fill="#F4F1EA" font-family="Arial, Helvetica, sans-serif" font-size="72" font-weight="700" letter-spacing="-3.4">worst day.</text>
  <text x="72" y="452" fill="#A0A5AE" font-family="Arial, Helvetica, sans-serif" font-size="24" letter-spacing="-.2">Offline breadcrumbs, geofences, remote actions.</text>
  <text x="72" y="488" fill="#A0A5AE" font-family="Arial, Helvetica, sans-serif" font-size="24" letter-spacing="-.2">Open source. Self-hostable. No ad SDKs.</text>
  <rect x="72" y="552" width="1056" height="1" fill="#25282E"/>
  <text x="72" y="584" fill="#717783" font-family="Arial, Helvetica, sans-serif" font-size="13" letter-spacing="1.4">BEACON</text>
  <text x="1128" y="584" fill="#717783" font-family="Arial, Helvetica, sans-serif" font-size="13" text-anchor="end" letter-spacing="1.4">MAPS BY OPENFREEMAP</text>
</svg>`);

const ogBase = await sharp(ogBackground).png().toBuffer();
const ogWordmark = await sharp(Buffer.from(svg.wordmarkOnDark))
  .resize({ height: 52, fit: "inside" })
  .png()
  .toBuffer();
const ogMark = await markPng(330);

await sharp(ogBase)
  .composite([
    { input: ogWordmark, left: 72, top: 52 },
    { input: ogMark, left: 930, top: 150 },
  ])
  .png({ compressionLevel: 9 })
  .toFile(path.join(brandDir, "og.png"));

/*
 * Android launcher icons.
 */
const densities = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
};

for (const [density, size] of Object.entries(densities)) {
  const directory = path.join(androidRes, `mipmap-${density}`);
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "ic_launcher.png"),
    await detailedIcon(size),
  );
  await writeFile(
    path.join(directory, "ic_launcher_round.png"),
    await detailedIcon(size, { circle: true }),
  );
}

// Adaptive foreground: transparent 432 px canvas, mark inside the safe zone.
const adaptiveForeground = await sharp({
  create: {
    width: 432,
    height: 432,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([{ input: await markPng(270), gravity: "center" }])
  .png({ compressionLevel: 9 })
  .toBuffer();

const drawableDir = path.join(androidRes, "drawable-nodpi");
await mkdir(drawableDir, { recursive: true });
await writeFile(path.join(drawableDir, "ic_launcher_foreground.png"), adaptiveForeground);

// In-app mark. A high-resolution transparent PNG avoids re-parsing a 6 KB
// vector path on every recomposition.
await writeFile(path.join(drawableDir, "ic_beacon_mark.png"), await markPng(240));

const adaptiveDirectory = path.join(androidRes, "mipmap-anydpi-v26");
await mkdir(adaptiveDirectory, { recursive: true });
const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
    <monochrome android:drawable="@drawable/ic_launcher_monochrome" />
</adaptive-icon>
`;
await writeFile(path.join(adaptiveDirectory, "ic_launcher.xml"), adaptive);
await writeFile(path.join(adaptiveDirectory, "ic_launcher_round.xml"), adaptive);

// Monochrome layer for Android 13+ themed icons.
await writeFile(
  path.join(androidRes, "drawable", "ic_launcher_monochrome.xml"),
  `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="64"
    android:viewportHeight="64">
    <path
        android:fillColor="#FFFFFFFF"
        android:pathData="M32,9 C23.44,9 16.5,15.94 16.5,24.5 C16.5,35.4 32,55 32,55 C32,55 47.5,35.4 47.5,24.5 C47.5,15.94 40.56,9 32,9 Z M32,29.6 C29.18,29.6 26.9,27.32 26.9,24.5 C26.9,21.68 29.18,19.4 32,19.4 C34.82,19.4 37.1,21.68 37.1,24.5 C37.1,27.32 34.82,29.6 32,29.6 Z" />
</vector>
`,
);

/*
 * Notification icon. Small icons are alpha masks, so use the compact pin.
 */
await writeFile(
  path.join(androidRes, "drawable", "ic_notification.xml"),
  `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="64"
    android:viewportHeight="64">
    <path
        android:fillColor="#FFFFFFFF"
        android:fillType="evenOdd"
        android:pathData="M32,9 C23.44,9 16.5,15.94 16.5,24.5 C16.5,35.4 32,55 32,55 C32,55 47.5,35.4 47.5,24.5 C47.5,15.94 40.56,9 32,9 Z M32,29.6 C29.18,29.6 26.9,27.32 26.9,24.5 C26.9,21.68 29.18,19.4 32,19.4 C34.82,19.4 37.1,21.68 37.1,24.5 C37.1,27.32 34.82,29.6 32,29.6 Z" />
</vector>
`,
);

await writeFile(
  path.join(brandDir, "README.md"),
  [
    "# Brand assets",
    "",
    "Generated from the SVG sources in `brand/` by `npm run icons`.",
    "",
    "- `beacon-mark.svg` — transparent pin mark",
    "- `beacon-lockup-on-light.svg` — horizontal lockup for light backgrounds",
    "- `beacon-lockup-on-dark.svg` — horizontal lockup for dark backgrounds",
    "- `beacon-wordmark-on-light.svg` — text-only wordmark for light backgrounds",
    "- `beacon-wordmark-on-dark.svg` — text-only wordmark for dark backgrounds",
    "- `icon-192.png`, `icon-512.png` — PWA icons",
    "- `maskable-512.png` — maskable PWA icon",
    "- `apple-touch-icon.png` — iOS home screen icon",
    "- `favicon-32.png` — legacy favicon",
    "- `og.png` — 1200×630 social card",
    "",
    "`/public/favicon.ico` and `/public/icon.svg` are generated alongside these files.",
    "",
    "The Beacon name and logo identify this project. See the repository licence.",
    "",
  ].join("\n"),
);

console.log("Generated brand assets in public/ and Android launcher icons");
