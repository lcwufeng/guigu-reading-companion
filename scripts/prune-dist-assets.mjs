import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const clientAssets = resolve(process.cwd(), "dist/client/assets");
const replacedByWebp = [
  "exploration",
  "backgrounds",
  "travel/photos",
  "travel/knowledge_cards",
  "ui/login/background.png",
  "ui/journal/background.png",
  "ui/journal/knowledge-card-background.png",
  "ui/journal/books",
  "ui/journal/parchment-panel.png",
  "ui/journal/green-button.png",
  "ui/supplied/nav",
  "ui/supplied/brand/logo.png",
  "legacy/brand",
];

for (const relativePath of replacedByWebp) {
  const target = resolve(clientAssets, relativePath);
  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true });
  }
}
