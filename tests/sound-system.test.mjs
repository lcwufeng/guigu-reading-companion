import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("provided sound pack contains seven local music loops and twenty effects", async () => {
  const manifest = JSON.parse(await readFile(join(root, "public/audio/sound-pack.json"), "utf8"));
  assert.deepEqual(Object.keys(manifest.music).sort(), [
    "library-1", "library-2", "library-3", "main", "park-1", "park-2", "travel-1",
  ]);
  assert.equal(Object.keys(manifest.effects).length, 20);

  for (const entry of [...Object.values(manifest.music), ...Object.values(manifest.effects)]) {
    assert.match(entry.src, /^\/audio\/(?:music\/provided|music|sfx)\/[a-z0-9-]+\.mp3$/);
    assert.ok(entry.duration > 0);
    const audioPath = join(root, "public", entry.src);
    const info = await stat(audioPath);
    assert.ok(info.size > 2_000, `${entry.src} should contain encoded audio`);
    const header = await readFile(audioPath);
    assert.equal(header.subarray(0, 3).toString("ascii"), "ID3");
  }
});

test("sound settings and post-login preload are account-aware and narration-aware", async () => {
  const [readingApp, soundSystem, startupPreload, styles, schema, userState] = await Promise.all([
    readFile(join(root, "app/ReadingApp.tsx"), "utf8"),
    readFile(join(root, "app/sound-system.ts"), "utf8"),
    readFile(join(root, "app/startup-preload.ts"), "utf8"),
    readFile(join(root, "app/globals.css"), "utf8"),
    readFile(join(root, "db/schema-statements.js"), "utf8"),
    readFile(join(root, "db/user-state.ts"), "utf8"),
  ]);

  assert.match(readingApp, /soundSettings: normalizeSoundSettings\(parsed\.soundSettings\)/);
  assert.match(readingApp, /soundSettings: game\.soundSettings/);
  assert.match(readingApp, /bookAudioPhase === "playing" \|\| voicePhase !== "idle"/);
  assert.match(readingApp, /className="sound-panel"/);
  assert.match(soundSystem, /provided\/library-1\.mp3/);
  assert.match(soundSystem, /provided\/library-2\.mp3/);
  assert.match(soundSystem, /provided\/library-3\.mp3/);
  assert.match(soundSystem, /provided\/park-1\.mp3/);
  assert.match(soundSystem, /provided\/park-2\.mp3/);
  assert.match(soundSystem, /Math\.random\(\)/);
  assert.match(soundSystem, /__guiguReadingSoundEngine/);
  assert.match(soundSystem, /SOUND_PACK_VERSION/);
  assert.match(soundSystem, /getBackgroundMusicSources/);
  assert.match(soundSystem, /prepareStartupMusic/);
  assert.match(soundSystem, /this\.music\.preload = "auto"/);
  assert.match(readingApp, /preloadStartupAssets/);
  assert.match(readingApp, /startup-loading-screen/);
  assert.match(readingApp, /startup-enter-button/);
  assert.match(readingApp, /进入学习屋/);
  assert.match(readingApp, /getSoundEngine\(\)\.unlock\(game\.soundSettings, soundScene\)/);
  assert.match(startupPreload, /STARTUP_TIMEOUT_MS = 600_000/);
  assert.match(startupPreload, /startup-assets-manifest\.json/);
  assert.match(startupPreload, /getPrimaryInterfaceImageSources/);
  assert.match(startupPreload, /await image\.decode\(\)/);
  assert.match(startupPreload, /waitForImageWithRetry/);
  assert.match(startupPreload, /cache: "force-cache"/);
  assert.match(startupPreload, /runWithConcurrency\(musicTasks, 2\)/);
  assert.match(startupPreload, /getBackgroundMusicSources\(\)/);
  assert.match(startupPreload, /prepareStartupMusic\(controller\.signal\)/);
  assert.match(startupPreload, /completed >= total\) return 100/);
  assert.match(startupPreload, /Math\.min\(99, Math\.floor\(completed \/ total \* 100\)\)/);
  assert.match(readingApp, /result\.completed === result\.total && result\.failed === 0 && !result\.timedOut/);
  assert.match(readingApp, /percent: settledPercent/);
  assert.match(readingApp, /startupPrepared\s*\?\s*100\s*:\s*Math\.min\(99, Math\.floor/);
  assert.match(readingApp, /重新加载主要资源/);
  assert.match(readingApp, /if \(view === "travel"\) return "travel"/);
  assert.match(soundSystem, /minimumEffectInterval/);
  assert.match(styles, /\.sound-menu-button/);
  assert.match(styles, /\.sound-panel/);
  assert.match(styles, /\.startup-progress-track/);
  assert.match(styles, /\.startup-enter-button/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS user_sound_settings/);
  assert.match(userState, /FROM user_sound_settings WHERE user_id = \?/);
  assert.match(userState, /INSERT INTO user_sound_settings/);

  for (const name of ["learning-house", "library", "mistakes", "chat", "travel", "journal"]) {
    const icon = await stat(join(root, "public/assets/ui/nav-v2", `${name}.png`));
    assert.ok(icon.size > 5_000, `${name} should contain a generated pixel-art navigation icon`);
    assert.ok(readingApp.includes(`nav-v2/${name}.png`));
  }
});

test("startup image manifest covers the five core interfaces without unrelated feature art", async () => {
  const manifest = JSON.parse(await readFile(join(root, "public/assets/startup-assets-manifest.json"), "utf8"));
  assert.equal(manifest.version, 1);
  assert.equal(manifest.imageCount, manifest.images.length);
  assert.ok(manifest.imageCount > 80);
  assert.ok(manifest.imageCount < 250);
  assert.ok(manifest.totalBytes > 20 * 1024 * 1024);
  assert.ok(manifest.totalBytes < 50 * 1024 * 1024);
  assert.ok(manifest.images.includes("ui/nav-v2/learning-house.png"));
  assert.ok(manifest.images.includes("optimized/backgrounds/main_home.webp"));
  assert.ok(manifest.images.includes("optimized/backgrounds/reading_room.webp"));
  assert.ok(manifest.images.includes("optimized/backgrounds/travel_map.webp"));
  assert.ok(manifest.images.some((path) => path.startsWith("ui/mistakes/")));
  assert.ok(manifest.images.some((path) => path.startsWith("ui/journal/")));
  assert.ok(manifest.images.some((path) => path.startsWith("travel/knowledge-cards-20260716/")));
  assert.ok(!manifest.images.some((path) => path.startsWith("achievements/")));
  assert.ok(!manifest.images.some((path) => path.startsWith("exploration/")));
  assert.ok(!manifest.images.some((path) => path.startsWith("books/")));
  assert.ok(!manifest.images.some((path) => path.startsWith("ui/journal/books/")));

  for (const path of manifest.images) {
    const image = await stat(join(root, "public/assets", path));
    assert.ok(image.size > 0, `${path} should exist and contain image data`);
  }
});
