import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const source = new URL("../design/achievements/achievement-badge-sheet-v1-transparent.png", import.meta.url);
const outputDirectory = new URL("../public/assets/achievements/", import.meta.url);
const sourcePath = fileURLToPath(source);
const outputPath = fileURLToPath(outputDirectory);
const badgeIds = [
  ["reading-sprout", "mistake-detective", "first-departure", "park-rookie", "curiosity-sprout"],
  ["reading-pathfinder", "correction-helper", "footprint-collector", "level-brave", "knowledge-pathfinder"],
  ["story-collector", "solution-mender", "mountain-sea-traveler", "turtle-gamer", "bridge-builder"],
  ["little-scholar", "review-expert", "world-wanderer", "park-champion", "little-mentor"],
];

await mkdir(outputPath, { recursive: true });
const metadata = await sharp(sourcePath).metadata();
const width = metadata.width || 0;
const height = metadata.height || 0;
if (!width || !height) throw new Error("Achievement badge sheet has no dimensions");

for (let row = 0; row < badgeIds.length; row += 1) {
  for (let column = 0; column < badgeIds[row].length; column += 1) {
    const left = Math.round(column * width / 5);
    const top = Math.round(row * height / 4);
    const right = Math.round((column + 1) * width / 5);
    const bottom = Math.round((row + 1) * height / 4);
    const cell = await sharp(sourcePath)
      .extract({ left, top, width: right - left, height: bottom - top })
      .png()
      .toBuffer();
    await sharp(cell)
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 4 })
      .resize(220, 220, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        kernel: "nearest",
      })
      .webp({ lossless: true })
      .toFile(fileURLToPath(new URL(`${badgeIds[row][column]}.webp`, outputDirectory)));
  }
}
