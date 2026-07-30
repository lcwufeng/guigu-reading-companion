import { readdir, stat, writeFile } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";

const projectRoot = process.cwd();
const assetsRoot = resolve(projectRoot, "public/assets");
const outputPath = resolve(assetsRoot, "startup-assets-manifest.json");
const imageExtensions = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"]);

// These source assets are replaced by smaller optimized copies during the build.
// Keeping them out of the manifest prevents the loader from requesting files that
// are intentionally removed from the deployed bundle.
const excludedPaths = [
  "exploration",
  "backgrounds",
  "travel/photos",
  "travel/knowledge_cards",
  "ui/login/background.png",
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
    if (isExcluded(assetPath)) continue;
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
