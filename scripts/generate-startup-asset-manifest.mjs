import { readdir, stat, writeFile } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";

const projectRoot = process.cwd();
const assetsRoot = resolve(projectRoot, "public/assets");
const outputPath = resolve(assetsRoot, "startup-assets-manifest.json");
const imageExtensions = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"]);

// Only preload the five image-heavy core areas the student is most likely to
// enter immediately. Chat, knowledge exploration, achievements, the game park,
// and in-book illustrations stay lazy so login is not held behind unrelated art.
const includedPrefixes = [
  "characters/turtle",
  "legacy/travel",
  "optimized/travel",
  "optimized/ui/journal",
  "travel/knowledge-cards-20260716",
  "ui/daily-tasks",
  "ui/home-refresh",
  "ui/journal",
  "ui/mistakes",
  "ui/nav-v2",
];

const includedFiles = new Set([
  "legacy/icons/knowledge_card.png",
  "legacy/travel/travel_ticket.png",
  "objects/fruit_orange.png",
  "optimized/backgrounds/main_home.webp",
  "optimized/backgrounds/reading_room.webp",
  "optimized/backgrounds/travel_map.webp",
  "ui/icons/play-ticket-pixel.png",
  "ui/supplied/brand/logo-20260715.png",
]);

// These source images have optimized equivalents in the included directories.
const excludedPaths = [
  "ui/journal/background.png",
  "ui/journal/knowledge-card-background.png",
  "ui/journal/books",
];

function normalizePath(path) {
  return path.split(sep).join("/");
}

function isExcluded(path) {
  return excludedPaths.some((excluded) => path === excluded || path.startsWith(`${excluded}/`));
}

function isIncluded(path) {
  return includedFiles.has(path)
    || includedPrefixes.some((included) => path === included || path.startsWith(`${included}/`));
}

async function collectImages(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const images = [];
  for (const entry of entries) {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      images.push(...await collectImages(absolutePath));
      continue;
    }
    if (!entry.isFile() || !imageExtensions.has(extname(entry.name).toLowerCase())) continue;
    const assetPath = normalizePath(relative(assetsRoot, absolutePath));
    if (!isIncluded(assetPath) || isExcluded(assetPath)) continue;
    const info = await stat(absolutePath);
    images.push({ path: assetPath, bytes: info.size });
  }
  return images;
}

const images = (await collectImages(assetsRoot)).sort((left, right) => left.path.localeCompare(right.path));
const manifest = {
  version: 1,
  imageCount: images.length,
  totalBytes: images.reduce((total, image) => total + image.bytes, 0),
  images: images.map((image) => image.path),
};

await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Generated ${relative(projectRoot, outputPath)} with ${manifest.imageCount} images.`);
