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

test("keeps the V1.4 product loops, safeguards, and required art assets", async () => {
  const [page, styles, layout, nextConfig, companionRoute, speechRoute, mistakeScanRoute, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/companion/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/speech/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/mistake-scan/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  for (const feature of [
    "喂果子",
    "去游泳",
    "捉迷藏",
    "睡一会",
    "龟龟书房",
    "今日任务",
    "龟龟错题屋",
    "今日悄悄话",
    "龟龟旅行地图",
    "查看知识卡",
  ]) {
    assert.match(page, new RegExp(feature));
  }

  for (const destination of ["星沙海湾", "森语树屋", "恐龙博物馆", "太空站", "古城遗迹", "未来车站"]) {
    assert.match(page, new RegExp(destination));
  }

  assert.match(page, /guigu-v1-state/);
  assert.match(page, /activeTravel/);
  assert.match(page, /tickets: 3/);
  assert.match(page, /mistakes: \[\]/);
  assert.match(page, /dailyPlan:/);
  assert.match(page, /createDailyPlan/);
  assert.match(page, /advanceDailyTask/);
  assert.match(page, /earnedReward \? 3 : 0/);
  assert.match(page, /全部完成可得 3 颗星星/);
  assert.match(page, /ui\/daily-tasks\/title\.png/);
  assert.match(page, /ui\/daily-tasks\/task-row\.png/);
  assert.match(page, /firstMastery \? 2 : 0/);
  assert.match(page, /复习一道错题胜过做 2 道新题/);
  assert.match(page, /记一道错题/);
  assert.match(page, /api\/mistake-scan/);
  assert.match(page, /拍照录题/);
  assert.match(page, /上传图片/);
  assert.match(page, /整理完成后会直接收进错题屋/);
  assert.match(page, /mistakes: \[record, \.\.\.current\.mistakes\]/);
  assert.doesNotMatch(page, /mistakeDraft|saveMistake/);
  for (const threshold of [10, 15, 50, 70, 100, 150]) {
    assert.match(page, new RegExp(`requiredStars: ${threshold}`));
  }
  assert.match(page, /hidePlaces = \["water", "tree", "behind", "lotus"\]/);
  assert.match(page, /ui\/home-refresh\/actions\/swim\.png/);
  assert.match(page, /ui\/home-refresh\/status\/panel\.png/);
  assert.match(page, /ui\/supplied\/brand\/logo\.png/);
  assert.match(page, /ui\/supplied\/nav\/home\.png/);
  assert.match(page, /ui\/supplied\/nav\/reading-20260713\.png/);
  assert.match(page, /ui\/supplied\/nav\/mistakes-20260713\.png/);
  assert.match(page, /ui\/supplied\/nav\/journal-20260713\.png/);
  assert.match(page, /ui\/mistakes\/title\.png/);
  assert.match(page, /ui\/mistakes\/stats-panel\.png/);
  assert.match(page, /ui\/mistakes\/empty-turtle\.png/);
  assert.match(page, /--mistake-background/);
  assert.match(page, /status-segments/);
  assert.doesNotMatch(page, /className="action-dock"/);
  assert.match(page, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(page, /encodeWav/);
  assert.match(page, /我在认真听/);
  assert.match(page, /submitChatRef\.current\(data\.transcript\)/);
  assert.match(page, /在线陪你聊/);
  assert.match(page, /今天想聊什么/);
  assert.match(page, /回答正确奖励/);
  assert.match(page, /修改后重新提交/);
  assert.match(page, /readingRewards/);
  assert.match(page, /if \(result\.correct\)/);
  assert.match(page, /scarecrow-zh\.md/);
  assert.match(page, /grimms-fairy-tales-zh\.md/);
  assert.match(page, /andersens-fairy-tales-zh\.md/);
  assert.match(page, /parseMarkdownBook/);
  assert.doesNotMatch(page, /grimms-fairy-tales-en\.txt|andersens-fairy-tales-en\.txt/);
  assert.match(styles, /text-indent: 2em/);
  assert.match(styles, /text-align: justify/);
  assert.doesNotMatch(page, /SpeechRecognition/);
  assert.match(layout, /lang="zh-CN"/);
  assert.match(layout, /width: "device-width"/);
  assert.match(nextConfig, /NEXT_PUBLIC_BASE_PATH/);
  assert.match(page, /fetch\(`\$\{BASE_PATH\}\/api\/companion`/);
  assert.doesNotMatch(styles, /url\(["']?\/assets\//);
  assert.match(companionRoute, /https:\/\/api\.deepseek\.com\/chat\/completions/);
  assert.match(companionRoute, /deepseek-v4-flash/);
  assert.match(companionRoute, /thinking: \{ type: "disabled" \}/);
  assert.match(companionRoute, /response_format: \{ type: "json_object" \}/);
  assert.match(companionRoute, /parseReadingEvaluation/);
  assert.match(companionRoute, /correct: evaluation\.correct/);
  assert.match(companionRoute, /DEEPSEEK_API_KEY/);
  assert.match(companionRoute, /cleanPetName/);
  assert.match(companionRoute, /function localReply/);
  assert.match(await readFile(new URL("../db/reading-progress.ts", import.meta.url), "utf8"), /READING_PROGRESS_FILE/);
  assert.match(speechRoute, /openspeech\.bytedance\.com\/api\/v3\/sauc\/bigmodel_nostream/);
  assert.match(speechRoute, /VOLC_SPEECH_APP_ID/);
  assert.match(speechRoute, /VOLC_SPEECH_ACCESS_TOKEN/);
  assert.match(speechRoute, /volc\.bigasr\.sauc\.duration/);
  assert.match(speechRoute, /MAX_AUDIO_BYTES/);
  assert.match(mistakeScanRoute, /api\.xiaomimimo\.com\/v1\/chat\/completions/);
  assert.match(mistakeScanRoute, /MIMO_API_KEY/);
  assert.match(mistakeScanRoute, /mimo-v2\.5/);
  assert.match(mistakeScanRoute, /response_format: \{ type: "json_object" \}/);
  assert.match(mistakeScanRoute, /MAX_IMAGE_DATA_LENGTH/);
  assert.match(packageJson, /"ws"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  const formattedBooks = await Promise.all([
    readFile(new URL("../public/books/scarecrow-zh.md", import.meta.url), "utf8"),
    readFile(new URL("../public/books/grimms-fairy-tales-zh.md", import.meta.url), "utf8"),
    readFile(new URL("../public/books/andersens-fairy-tales-zh.md", import.meta.url), "utf8"),
  ]);
  const paragraphEnding = /[。！？!?…：；”’」』）】〞"']$/;
  for (const book of formattedBooks) {
    const divider = book.search(/^---\s*$/m);
    const body = book.slice(divider).replace(/^---\s*$/m, "");
    const chapters = [...body.matchAll(/^#\s+(.+)\s*$/gm)];
    for (let chapter = 0; chapter < chapters.length; chapter += 1) {
      const start = chapters[chapter].index + chapters[chapter][0].length;
      const end = chapters[chapter + 1]?.index ?? body.length;
      const paragraphs = body.slice(start, end)
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.replace(/^---\s*$/gm, "").trim())
        .filter(Boolean);
      paragraphs.slice(0, -1).forEach((paragraph) => assert.match(paragraph, paragraphEnding));
    }
  }
  assert.doesNotMatch(formattedBooks[1], /^(?:L0怎|40wv|≤H］)$/m);

  for (const path of [
    "../public/assets/optimized/backgrounds/main_home.webp",
    "../public/assets/optimized/backgrounds/reading_room.webp",
    "../public/assets/optimized/backgrounds/travel_map.webp",
    "../public/assets/characters/turtle/turtle_idle_front.png",
    "../public/assets/icons/status/status_mood.png",
    "../public/assets/legacy/brand/guigu_logo.png",
    "../public/assets/legacy/travel/location_beach.png",
    "../public/assets/legacy/travel/location_forest.png",
    "../public/assets/legacy/travel/location_museum.png",
    "../public/assets/legacy/travel/location_space.png",
    "../public/assets/legacy/travel/location_ancient_city.png",
    "../public/assets/legacy/travel/location_future_station.png",
    "../public/assets/legacy/travel/travel_ticket.png",
    "../public/assets/optimized/travel/knowledge_cards/knowledge_tide.webp",
    "../public/assets/optimized/travel/knowledge_cards/knowledge_tree_ring.webp",
    "../public/assets/optimized/travel/knowledge_cards/knowledge_dinosaur.webp",
    "../public/assets/ui/home-refresh/actions/feed.png",
    "../public/assets/ui/home-refresh/actions/swim.png",
    "../public/assets/ui/home-refresh/actions/hide.png",
    "../public/assets/ui/home-refresh/actions/sleep.png",
    "../public/assets/ui/home-refresh/status/panel.png",
    "../public/assets/ui/home-refresh/status/turtle-head.png",
    "../public/assets/ui/supplied/brand/logo.png",
    "../public/assets/ui/supplied/nav/home.png",
    "../public/assets/ui/supplied/nav/reading.png",
    "../public/assets/ui/supplied/nav/mistakes.png",
    "../public/assets/ui/supplied/nav/chat.png",
    "../public/assets/ui/supplied/nav/travel.png",
    "../public/assets/ui/supplied/nav/journal.png",
    "../public/assets/ui/supplied/nav/reading-20260713.png",
    "../public/assets/ui/supplied/nav/mistakes-20260713.png",
    "../public/assets/ui/supplied/nav/journal-20260713.png",
    "../public/assets/ui/mistakes/background.webp",
    "../public/assets/ui/mistakes/title.png",
    "../public/assets/ui/mistakes/stats-panel.png",
    "../public/assets/ui/mistakes/content-frame.png",
    "../public/assets/ui/mistakes/add-button.png",
    "../public/assets/ui/mistakes/empty-turtle.png",
    "../public/assets/ui/daily-tasks/panel.png",
    "../public/assets/ui/daily-tasks/title.png",
    "../public/assets/ui/daily-tasks/task-row.png",
    "../public/assets/ui/daily-tasks/counter.png",
    "../public/assets/ui/daily-tasks/fruit.png",
    "../public/assets/ui/daily-tasks/clean.png",
    "../public/assets/ui/daily-tasks/mistake.png",
    "../public/assets/ui/daily-tasks/reading.png",
    "../public/assets/ui/daily-tasks/reward-star.png",
    "../public/books/scarecrow-zh.md",
    "../public/books/grimms-fairy-tales-zh.md",
    "../public/books/andersens-fairy-tales-zh.md",
  ]) {
    await access(new URL(path, import.meta.url));
  }
});
