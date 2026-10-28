import { copyFile, mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

/**
 * MapLibre 6 resolves its worker with `new URL('./maplibre-gl-worker.mjs',
 * import.meta.url)`. Inside a Next.js bundle `import.meta.url` points at the
 * document, so the worker request hits the page route and comes back as HTML.
 * Serving the worker from /public and calling setWorkerUrl() fixes it.
 */
const require = createRequire(import.meta.url);

const packageJsonPath = require.resolve("maplibre-gl/package.json");
const packageRoot = path.dirname(packageJsonPath);
const { version } = JSON.parse(await readFile(packageJsonPath, "utf8"));

const source = path.join(packageRoot, "dist", "maplibre-gl-worker.mjs");
const targetDir = path.join(process.cwd(), "public", "maplibre");
const target = path.join(targetDir, "maplibre-gl-worker.js");

await mkdir(targetDir, { recursive: true });

const existing = await readFile(target, "utf8").catch(() => null);
if (existing && existing.includes(`v${version}`)) {
  console.log(`maplibre worker already at v${version}`);
} else {
  await copyFile(source, target);
  console.log(`copied maplibre worker v${version}`);
}
