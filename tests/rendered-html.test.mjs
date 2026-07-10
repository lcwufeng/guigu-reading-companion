import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Guigui reading companion", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>龟龟伴读/);
  assert.match(html, /我的伙伴/);
  assert.match(html, /今天想和/);
  assert.match(html, /家园/);
  assert.match(html, /读书/);
  assert.match(html, /聊天/);
  assert.match(html, /旅行/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("keeps the V1 product loops and required art assets", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  for (const feature of [
    "喂果子",
    "去游泳",
    "捉迷藏",
    "睡一会",
    "龟龟书房",
    "今日悄悄话",
    "龟龟旅行地图",
  ]) {
    assert.match(page, new RegExp(feature));
  }

  assert.match(page, /guigu-v1-state/);
  assert.match(page, /hidePlaces = \["water", "tree", "behind", "lotus"\]/);
  assert.match(page, /SpeechRecognition/);
  assert.match(layout, /lang="zh-CN"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  for (const path of [
    "../public/assets/backgrounds/main_home.png",
    "../public/assets/backgrounds/reading_room.png",
    "../public/assets/backgrounds/travel_map.png",
    "../public/assets/characters/turtle/turtle_idle_front.png",
    "../public/assets/icons/status/status_mood.png",
  ]) {
    await access(new URL(path, import.meta.url));
  }
});
