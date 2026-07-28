import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("original sound pack contains four local music loops and twenty effects", async () => {
  const manifest = JSON.parse(await readFile(join(root, "public/audio/sound-pack.json"), "utf8"));
  assert.deepEqual(Object.keys(manifest.music).sort(), ["home-garden", "knowledge-adventure", "quiet-library", "turtle-park"]);
  assert.equal(Object.keys(manifest.effects).length, 20);

  for (const entry of [...Object.values(manifest.music), ...Object.values(manifest.effects)]) {
    assert.match(entry.src, /^\/audio\/(?:music|sfx)\/[a-z-]+\.mp3$/);
    assert.ok(entry.duration > 0);
    const audioPath = join(root, "public", entry.src);
    const info = await stat(audioPath);
    assert.ok(info.size > 2_000, `${entry.src} should contain encoded audio`);
    const header = await readFile(audioPath);
    assert.equal(header.subarray(0, 3).toString("ascii"), "ID3");
  }
});

test("sound settings are account-persisted and narration-aware", async () => {
  const [readingApp, soundSystem, styles, schema, userState] = await Promise.all([
    readFile(join(root, "app/ReadingApp.tsx"), "utf8"),
    readFile(join(root, "app/sound-system.ts"), "utf8"),
    readFile(join(root, "app/globals.css"), "utf8"),
    readFile(join(root, "db/schema-statements.js"), "utf8"),
    readFile(join(root, "db/user-state.ts"), "utf8"),
  ]);

  assert.match(readingApp, /soundSettings: normalizeSoundSettings\(parsed\.soundSettings\)/);
  assert.match(readingApp, /soundSettings: game\.soundSettings/);
  assert.match(readingApp, /bookAudioPhase === "playing" \|\| voicePhase !== "idle"/);
  assert.match(readingApp, /className="sound-panel"/);
  assert.match(soundSystem, /quiet-library\.mp3/);
  assert.match(soundSystem, /knowledge-adventure\.mp3/);
  assert.match(soundSystem, /__guiguReadingSoundEngine/);
  assert.match(soundSystem, /SOUND_PACK_VERSION/);
  assert.match(readingApp, /if \(view === "explore"\) return "explore"/);
  assert.match(soundSystem, /minimumEffectInterval/);
  assert.match(styles, /\.sound-menu-button/);
  assert.match(styles, /\.sound-panel/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS user_sound_settings/);
  assert.match(userState, /FROM user_sound_settings WHERE user_id = \?/);
  assert.match(userState, /INSERT INTO user_sound_settings/);
});
