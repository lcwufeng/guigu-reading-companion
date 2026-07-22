import assert from "node:assert/strict";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";

const testRoot = join(tmpdir(), `guigu-account-tests-${process.pid}-${Date.now()}`);
process.env.AUTH_STORE_FILE = join(testRoot, "auth.json");
process.env.PARENT_AUTH_STORE_FILE = join(testRoot, "parent-auth.json");
process.env.USER_STATE_FILE = join(testRoot, "user-state.json");
process.env.READING_PROGRESS_FILE = join(testRoot, "reading-progress.json");
process.env.STUDENT_MEMORY_FILE = join(testRoot, "student-memory.json");
process.env.MISTAKE_IMAGE_DIR = join(testRoot, "mistake-images");
process.env.BOOK_AUDIO_DIR = join(testRoot, "book-audio");
process.env.ADMIN_INITIAL_USERNAME = "admin";
process.env.ADMIN_INITIAL_PASSWORD = "AdminTest1234";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

let workerPromise;
async function getWorker() {
  if (workerPromise) return workerPromise;
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  workerPromise = import(workerUrl.href).then((module) => module.default);
  return workerPromise;
}

async function fetchApp(path = "/", init = {}) {
  const worker = await getWorker();
  return worker.fetch(
    new Request(`http://localhost${basePath}${path}`, init),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

function cookieFrom(response) {
  return (response.headers.get("set-cookie") || "").split(";")[0];
}

after(async () => {
  await rm(testRoot, { recursive: true, force: true });
});

test("server-renders the internal beta login before the reading companion", async () => {
  const response = await fetchApp("/", { headers: { accept: "text/html" } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>龟龟伴读/);
  assert.match(html, /内测学习屋/);
  assert.match(html, /请输入账号/);
  assert.match(html, /assets\/ui\/login\/background\.png/);
  assert.match(html, /assets\/ui\/supplied\/brand\/logo-20260715\.png/);
  assert.doesNotMatch(html, /选择内测账号/);
  assert.doesNotMatch(html, /同学一|同学二|同学三|同学四|同学五|同学六|同学七/);
  assert.doesNotMatch(html, /我的伙伴/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("provides a separate forced-reset parent login and five parent-center pages", async () => {
  const loginPage = await fetchApp("/parent", { headers: { accept: "text/html" } });
  assert.equal(loginPage.status, 200);
  const loginHtml = await loginPage.text();
  assert.match(loginHtml, /家长中心/);
  assert.match(loginHtml, /家长账号/);
  assert.doesNotMatch(loginHtml, /同学一家长|同学二家长/);

  const login = await fetchApp("/api/parent/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "同学一家长", password: "123456" }),
  });
  assert.equal(login.status, 200);
  assert.equal((await login.json()).mustResetPassword, true);
  const firstCookie = cookieFrom(login);
  assert.match(firstCookie, /^guigu_parent_session=/);

  const resetPage = await fetchApp("/parent", { headers: { accept: "text/html", cookie: firstCookie } });
  assert.match(await resetPage.text(), /首次登录请设置一个新密码/);
  const blockedDashboard = await fetchApp("/api/parent/dashboard", { headers: { cookie: firstCookie } });
  assert.equal(blockedDashboard.status, 401);

  const reset = await fetchApp("/api/parent/auth/reset-password", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: firstCookie },
    body: JSON.stringify({ newPassword: "parent789", confirmPassword: "parent789" }),
  });
  assert.equal(reset.status, 200);
  const activeCookie = cookieFrom(reset);

  for (const [path, section] of [["/parent", "overview"], ["/parent/binding", "binding"], ["/parent/reading", "reading"], ["/parent/mistakes", "mistakes"], ["/parent/data", "data"]]) {
    const page = await fetchApp(path, { headers: { accept: "text/html", cookie: activeCookie } });
    assert.equal(page.status, 200, path);
    const html = await page.text();
    assert.match(html, /initialSection/);
    assert.match(html, new RegExp(section));
  }
});

test("provides a protected administration center with account operations", async () => {
  const loginPage = await fetchApp("/admin", { headers: { accept: "text/html" } });
  assert.equal(loginPage.status, 200);
  const loginHtml = await loginPage.text();
  assert.match(loginHtml, /管理员登录/);
  assert.match(loginHtml, /平台管理后台/);

  const protectedData = await fetchApp("/api/admin/data?section=accounts");
  assert.equal(protectedData.status, 401);
  assert.match(JSON.stringify(await protectedData.json()), /请先登录管理后台/);
  const protectedBooks = await fetchApp("/api/admin/books");
  assert.equal(protectedBooks.status, 401);
  const protectedLibrary = await fetchApp("/api/library/books");
  assert.equal(protectedLibrary.status, 401);
});

test("imports the complete graded ebook shelf with chapters, paragraphs, illustrations, and journal art", async () => {
  const manifestUrl = new URL("../public/books/classics/manifest.json", import.meta.url);
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  assert.equal(manifest.length, 26);
  assert.equal(new Set(manifest.map((book) => book.slug)).size, 26);
  assert.equal(manifest.reduce((total, book) => total + book.chapterCount, 0), 740);
  assert.equal(manifest.reduce((total, book) => total + book.pageCount, 0), 2488);
  assert.equal(manifest.reduce((total, book) => total + book.imageCount, 0), 565);

  const expectedChapterCounts = new Map([
    ["chinese-idioms", 122],
    ["andersen-complete", 164],
    ["little-prince", 27],
    ["little-house-prairie", 26],
    ["spring-autumn-stories", 24],
    ["palm-fairy-tales", 31],
  ]);

  for (const book of manifest) {
    const payloadUrl = new URL(`../public/books/classics/${book.slug}.json`, import.meta.url);
    const payload = JSON.parse(await readFile(payloadUrl, "utf8"));
    assert.equal(payload.chapters.length, book.chapterCount, `${book.title} chapter count`);
    assert.equal(payload.chapters.reduce((total, chapter) => total + chapter.pages.length, 0), book.pageCount, `${book.title} page count`);
    if (expectedChapterCounts.has(book.slug)) assert.equal(payload.chapters.length, expectedChapterCounts.get(book.slug));
    assert.doesNotMatch(payload.chapters.map((chapter) => chapter.title).join("\n"), /目录|目次|前言|译序|序言|后记|索引/);

    for (const chapter of payload.chapters) {
      assert.ok(chapter.title.trim(), `${book.title} has a chapter title`);
      for (const page of chapter.pages) {
        assert.ok(page.body.length >= 20, `${book.title} · ${chapter.title} has readable text`);
        assert.doesNotMatch(page.body, /(?<!\n)\n(?!\n)/, `${book.title} · ${chapter.title} has no broken physical lines`);
        assert.doesNotMatch(page.body, /本章正文识别后暂时没有可显示的文字/);
        for (const illustration of page.images || []) {
          assert.match(illustration.src, /^\/assets\/books\/classics\//);
          await access(new URL(`../public${illustration.src}`, import.meta.url));
        }
      }
    }

    await access(new URL(`../public/assets/ui/journal/books/classics/${book.slug}.png`, import.meta.url));
  }

  const readingApp = await readFile(new URL("../app/ReadingApp.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(readingApp, /format: "json"/);
  assert.match(readingApp, /book-inline-illustrations/);
  assert.match(readingApp, /buildChapterPrompt/);
  assert.match(readingApp, /type LibraryMode = "shelf" \| "reader"/);
  assert.match(readingApp, /按年级选择图书/);
  assert.match(readingApp, /一年级/);
  assert.match(readingApp, /六年级/);
  assert.match(readingApp, /setLibraryMode\("reader"\)/);
  assert.match(readingApp, /返回书架/);
  assert.match(styles, /text-indent: 2em/);
  assert.match(styles, /book-inline-illustrations/);
  assert.match(styles, /library-shelf-screen/);
  assert.match(styles, /library-mode-reader \.complete-reader/);
  assert.match(styles, /chapter-list-scroll button strong \{ font-size: 16px/);
});

test("provides a separate eight-domain knowledge expedition with evidence gates and spaced review", async () => {
  const [readingApp, catalog, extraLessons, explorationDb, styles, schema] = await Promise.all([
    readFile(new URL("../app/ReadingApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/exploration-catalog.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/exploration-lessons.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/exploration.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../db/schema-statements.js", import.meta.url), "utf8"),
  ]);
  assert.match(readingApp, /知识探险/);
  assert.match(readingApp, /八个兴趣世界/);
  for (const title of ["动物与自然", "科学与太空", "历史与文明", "文学与故事", "地理与旅行", "艺术与创造", "数学与逻辑", "生活与社会"]) {
    assert.match(catalog, new RegExp(title));
  }
  assert.equal((catalog.match(/type: "(?:发现|观察|连接|创造)"/g) || []).length, 32);
  assert.equal((catalog.match(/lesson: \{/g) || []).length, 4);
  assert.equal((catalog.match(/illustration: "\/assets\/exploration\/nature\//g) || []).length, 4);
  assert.equal((catalog.match(/lesson: extraExplorationLessons\[/g) || []).length, 20);
  assert.equal((extraLessons.match(/illustration: "\/assets\/exploration\//g) || []).length, 20);
  assert.match(readingApp, /exploration-lesson-illustration/);
  assert.match(readingApp, /我学完了，试试互动检查/);
  assert.match(readingApp, /实践表达 · 把知识用起来/);
  assert.match(readingApp, /到复习时间啦/);
  assert.match(readingApp, /发给龟龟看看/);
  assert.doesNotMatch(readingApp, /我完成了，点亮知识叶/);
  assert.match(explorationDb, /user_exploration_progress/);
  assert.match(explorationDb, /user_exploration_learning/);
  assert.match(explorationDb, /user_exploration_attempts/);
  assert.match(explorationDb, /submitExplorationQuiz/);
  assert.match(explorationDb, /submitExplorationProject/);
  assert.match(explorationDb, /submitExplorationReview/);
  assert.match(explorationDb, /nextStreak === 1 \? 2 : 4/);
  assert.match(explorationDb, /knowledge-exploration/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS user_exploration_progress/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS user_exploration_learning/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS user_exploration_attempts/);
  assert.match(styles, /\.interest-domain-grid/);
  assert.match(styles, /\.exploration-route/);
  assert.match(styles, /\.exploration-stepper/);
  assert.match(styles, /\.app\.view-explore/);
  assert.match(styles, /\.explore-scene \{[\s\S]*overflow-y: scroll/);
  for (const asset of ["animal-survival.png", "forest-layers.png", "fossil-evidence.png", "animal-habitat.png"]) {
    await access(new URL(`../public/assets/exploration/nature/${asset}`, import.meta.url));
  }
  const newRouteAssets = {
    science: ["moon-phases.png", "bioluminescence.png", "renewable-energy.png", "future-base.png"],
    history: ["ruins-speak.png", "ancient-city-day.png", "inventions-change-life.png", "letter-to-future.png"],
    literature: ["character-choice.png", "fairy-tale-repetition.png", "different-ending.png", "science-story.png"],
    geography: ["map-directions.png", "landform-forces.png", "climate-and-life.png", "travel-route.png"],
    art: ["color-emotion.png", "sound-rhythm.png", "pattern-math.png", "knowledge-card-cover.png"],
  };
  for (const [domain, assets] of Object.entries(newRouteAssets)) {
    for (const asset of assets) {
      await access(new URL(`../public/assets/exploration/${domain}/${asset}`, import.meta.url));
    }
  }
  assert.doesNotMatch(explorationDb, /localStorage|sessionStorage/);
});

test("provides a responsive turtle fruit-catching game with a daily isolated reward record", async () => {
  const [readingApp, gamePark, styles, userState, schema] = await Promise.all([
    readFile(new URL("../app/ReadingApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/GamePark.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../db/user-state.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema-statements.js", import.meta.url), "utf8"),
  ]);
  assert.match(readingApp, /进入龟龟乐园玩小游戏/);
  assert.match(readingApp, /fruitCatchDaily/);
  assert.match(readingApp, /stars: current\.stars \+ \(shouldReward \? 1 : 0\)/);
  assert.match(gamePark, /龟龟接果子/);
  assert.match(gamePark, /ROUND_DURATION_MS = 30_000/);
  assert.match(gamePark, /FRUIT_CATCH_TARGET_SCORE = 12/);
  assert.match(gamePark, /turtle_idle_standing\.png/);
  assert.match(gamePark, /turtle_excited\.png/);
  assert.match(gamePark, /onPointerMove=\{moveFromPointer\}/);
  assert.match(gamePark, /event\.key === "ArrowLeft"/);
  assert.match(gamePark, /今天首次过关，获得 1 颗星星/);
  assert.match(styles, /\.game-park-scene \{[\s\S]*overflow-y: auto/);
  assert.match(styles, /touch-action: none/);
  assert.match(styles, /@media \(max-width: 820px\) \{[\s\S]*\.fruit-catch-field/);
  assert.match(userState, /user_minigame_daily/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS user_minigame_daily/);
});

test("forces first-login password reset and isolates every student's data", async () => {
  const unauthorized = await fetchApp("/api/user-state");
  assert.equal(unauthorized.status, 401);
  const unauthorizedAudio = await fetchApp("/api/book-audio?bookId=scarecrow-zh&chapter=0");
  assert.equal(unauthorizedAudio.status, 401);
  const unauthorizedMistakeSave = await fetchApp("/api/mistakes", { method: "POST" });
  assert.equal(unauthorizedMistakeSave.status, 401);
  const unauthorizedMistakeReview = await fetchApp("/api/mistake-review", { method: "POST" });
  assert.equal(unauthorizedMistakeReview.status, 401);

  const login = await fetchApp("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "同学一", password: "123456" }),
  });
  assert.equal(login.status, 200);
  assert.equal((await login.json()).mustResetPassword, true);
  const firstCookie = cookieFrom(login);
  assert.match(firstCookie, /^guigu_session=/);

  const resetPage = await fetchApp("/", { headers: { accept: "text/html", cookie: firstCookie } });
  assert.equal(resetPage.status, 200);
  assert.match(await resetPage.text(), /第一次登录，请设置新密码/);
  const blockedBeforeReset = await fetchApp("/api/user-state", { headers: { cookie: firstCookie } });
  assert.equal(blockedBeforeReset.status, 401);

  const reset = await fetchApp("/api/auth/reset-password", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: firstCookie },
    body: JSON.stringify({ newPassword: "demo1789", confirmPassword: "demo1789" }),
  });
  assert.equal(reset.status, 200);
  const activeCookie = cookieFrom(reset);
  assert.match(activeCookie, /^guigu_session=/);

  const appPage = await fetchApp("/", { headers: { accept: "text/html", cookie: activeCookie } });
  assert.equal(appPage.status, 200);
  assert.match(await appPage.text(), /我的伙伴/);

  const audioDirectory = join(testRoot, "book-audio", "scarecrow-zh");
  await mkdir(audioDirectory, { recursive: true });
  await writeFile(join(audioDirectory, "chapter-001.mp3"), new Uint8Array([1, 2, 3, 4, 5, 6]));
  await writeFile(join(audioDirectory, "chapter-001.json"), JSON.stringify({
    bookId: "scarecrow-zh",
    chapterIndex: 0,
    chapterTitle: "小白船",
    audioFile: "chapter-001.mp3",
    pageTimings: [{ startMs: 0, endMs: 1200 }],
    voiceType: "BV104_streaming",
    voiceLabel: "温柔女声（温柔淑女）",
    generatedAt: new Date().toISOString(),
    textDigest: "test-digest",
  }));
  const audioInfo = await fetchApp("/api/book-audio?bookId=scarecrow-zh&chapter=0", { headers: { cookie: activeCookie } });
  assert.equal(audioInfo.status, 200);
  assert.equal((await audioInfo.json()).voiceType, "BV104_streaming");
  const audioRange = await fetchApp("/api/book-audio/file?bookId=scarecrow-zh&chapter=0", {
    headers: { cookie: activeCookie, range: "bytes=1-3" },
  });
  assert.equal(audioRange.status, 206);
  assert.equal(audioRange.headers.get("content-range"), "bytes 1-3/6");
  assert.deepEqual(new Uint8Array(await audioRange.arrayBuffer()), new Uint8Array([2, 3, 4]));

  const marker = { stars: 17, currentBook: "scarecrow", testOwner: "同学一" };
  const saveState = await fetchApp("/api/user-state", {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: activeCookie },
    body: JSON.stringify({ state: marker, updatedAt: Date.now() }),
  });
  assert.equal(saveState.status, 200);
  const ownState = await fetchApp("/api/user-state", { headers: { cookie: activeCookie } });
  assert.deepEqual((await ownState.json()).state, marker);

  const secondLogin = await fetchApp("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "同学二", password: "123456" }),
  });
  assert.equal(secondLogin.status, 200);
  const secondCookie = cookieFrom(secondLogin);
  const blockedSecondState = await fetchApp("/api/user-state", { headers: { cookie: secondCookie } });
  assert.equal(blockedSecondState.status, 401, "a student must reset the initial password before any data API is available");
  const secondReset = await fetchApp("/api/auth/reset-password", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: secondCookie },
    body: JSON.stringify({ newPassword: "demo2789", confirmPassword: "demo2789" }),
  });
  assert.equal(secondReset.status, 200);
  const secondActiveCookie = cookieFrom(secondReset);
  const secondState = await fetchApp("/api/user-state", { headers: { cookie: secondActiveCookie } });
  assert.equal(secondState.status, 200);
  assert.equal((await secondState.json()).state, null, "同学二不能看到同学一保存的数据");
  assert.notEqual(secondCookie, activeCookie);

  for (const username of ["同学四", "同学五", "同学六", "同学七"]) {
    const newAccountLogin = await fetchApp("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password: "123456" }),
    });
    assert.equal(newAccountLogin.status, 200, `${username} can use the initial password`);
    assert.equal((await newAccountLogin.json()).mustResetPassword, true, `${username} must reset the initial password`);
  }
});

test("keeps the product loops, account safeguards, and required art assets", async () => {
  const [page, styles, layout, nextConfig, companionRoute, speechRoute, speechClient, serverBundle, mistakeScanRoute, mistakesRoute, mistakeReviewRoute, mistakesDb, mistakeAi, studentMemoryRoute, studentMemoryDb, bookKnowledge, bookPrompts, packageJson, authDb, authUser, loginRoute, resetRoute, userStateRoute, userStateDb, schemaStatements, hosting] = await Promise.all([
    readFile(new URL("../app/ReadingApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/companion/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/speech/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/volc-speech.ts", import.meta.url), "utf8"),
    readFile(new URL("../dist/server/index.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/mistake-scan/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/mistakes/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/mistake-review/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/mistakes.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/mistake-ai.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/student-memory/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/student-memory.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/book-knowledge.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/book-prompts.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../db/auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/auth-user.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/login/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/reset-password/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/user-state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/user-state.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema-statements.js", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);
  const [bookAudioRoute, bookAudioFileRoute, bookAudioStore, bookAudioGenerator] = await Promise.all([
    readFile(new URL("../app/api/book-audio/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/book-audio/file/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/book-audio-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/pregenerate-book-audio.mjs", import.meta.url), "utf8"),
  ]);
  const [adminCenter, adminStyles, parentStyles, adminAuth, adminActions, adminData, serviceHealth, modelConfig, accountLogins] = await Promise.all([
    readFile(new URL("../app/admin/AdminCenter.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminCenter.module.css", import.meta.url), "utf8"),
    readFile(new URL("../app/parent/ParentCenter.module.css", import.meta.url), "utf8"),
    readFile(new URL("../db/admin-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/actions/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/data/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/service-health.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/model-config.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/account-logins.ts", import.meta.url), "utf8"),
  ]);
  const [bookImportPanel, bookImportClient, bookImports, bookAdminRoute, bookLibraryRoute] = await Promise.all([
    readFile(new URL("../app/admin/BookImportPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/book-import-client.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/book-imports.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/books/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/library/books/route.ts", import.meta.url), "utf8"),
  ]);

  for (const feature of [
    "摘果喂食",
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

  assert.doesNotMatch(page, /localStorage|guigu-reader-device-id|guigu-v1-state/);
  assert.match(page, /activeTravel/);
  assert.match(page, /pickTravelKnowledgeCard/);
  assert.match(page, /unseenCards/);
  assert.match(page, /nonRepeatingCards/);
  assert.match(page, /Math\.random\(\) \* candidates\.length/);
  assert.match(page, /knowledgeCardId/);
  assert.match(page, /className="travel-reward-card-image" src=\{travelReward\.card\.image\}/);
  assert.match(page, /本次获得的知识卡/);
  assert.match(styles, /\.travel-reward-card-image \{[\s\S]*?object-fit: contain;/);
  assert.match(page, /随机海洋知识卡/);
  assert.match(page, /随机森林知识卡/);
  assert.match(page, /随机恐龙知识卡/);
  assert.match(page, /随机太空知识卡/);
  assert.match(page, /随机古文明知识卡/);
  assert.match(page, /随机未来科学知识卡/);
  assert.match(page, /优先不重复/);
  assert.match(page, /tickets: 3/);
  assert.match(page, /mistakes: \[\]/);
  assert.match(page, /dailyPlan:/);
  assert.match(page, /createDailyPlan/);
  assert.match(page, /advanceDailyTask/);
  assert.match(page, /const completesDailyReadingTask = dailyPlan\.progress\.reading < dailyPlan\.targets\.reading/);
  assert.match(page, /setGame\(\(current\) => advanceDailyTask\(current, "reading"\)\)/);
  assert.match(page, /这一章读完啦，今日伴读任务已完成/);
  assert.match(page, /earnedReward \? 3 : 0/);
  assert.match(page, /全部完成可得 3 颗星星/);
  assert.match(page, /ui\/daily-tasks\/title\.png/);
  assert.doesNotMatch(page, /ui\/daily-tasks\/task-row\.png/);
  assert.doesNotMatch(styles, /--daily-task-row|var\(--daily-task-row\)/);
  assert.match(page, /review\.rewardStars/);
  assert.match(page, /复习一道错题胜过做 2 道新题/);
  assert.match(page, /记一道错题/);
  assert.match(page, /api\/mistake-scan/);
  assert.match(page, /api\/mistakes/);
  assert.match(page, /api\/mistake-review/);
  assert.match(page, /拍照录题/);
  assert.match(page, /上传图片/);
  assert.match(page, /确认收进错题本/);
  assert.match(page, /拍答案照片/);
  assert.match(page, /写好答案和完整步骤/);
  assert.match(page, /龟龟认出的步骤/);
  assert.match(page, /龟龟的称赞/);
  assert.match(page, /龟龟的思考/);
  assert.match(page, /mistakes: \[record, \.\.\.current\.mistakes\]/);
  assert.match(page, /mistakeDraft/);
  assert.doesNotMatch(page, /reviewAnswer|我掌握了|对照正确思路/);
  for (const threshold of [10, 15, 50, 70, 100, 150]) {
    assert.match(page, new RegExp(`requiredStars: ${threshold}`));
  }
  assert.match(page, /hidePlaces = \["water", "tree", "behind", "lotus", "cave", "bush", "flowers", "pond-rocks", "fruit", "path-rock", "tree-root", "flower-bank", "lily-pad", "cave-door", "cave-flowers", "blue-flowers", "hedge", "path-grass", "pond-cobbles", "boulder"\]/);
  assert.match(page, /landHomeSpots: HomeSpot\[\] = \["center", "tree-shade", "cave-door"\]/);
  assert.doesNotMatch(page, /HomeSpot = [^;]*pond-edge/);
  assert.match(styles, /width: clamp\(106px, 10\.5vw, 165px\)/);
  assert.match(styles, /height: clamp\(155px, 25vh, 270px\)/);
  assert.match(styles, /\.turtle-wrap \{[\s\S]*?left: 50%;/);
  assert.match(styles, /\.turtle-wrap,\n\s+\.turtle-wrap\.spot-tree-shade \{[\s\S]*?left: 34%;/);
  assert.match(page, /ui\/home-refresh\/actions\/swim\.png/);
  assert.match(page, /ui\/home-refresh\/status\/panel\.png/);
  assert.match(page, /ui\/supplied\/brand\/logo-20260715\.png/);
  assert.match(page, /ui\/supplied\/nav\/home\.png/);
  assert.match(page, /ui\/supplied\/nav\/reading-20260714\.png/);
  assert.match(page, /ui\/supplied\/nav\/mistakes-20260714\.png/);
  assert.match(page, /ui\/supplied\/nav\/journal-20260714\.png/);
  assert.match(page, /className="logout-button"/);
  assert.match(page, /aria-label="退出登录"/);
  assert.doesNotMatch(page, /<LogOut[^>]*\/>退出/);
  assert.doesNotMatch(page, /className="student-account"/);
  assert.match(styles, /grid-template-columns: minmax\(420px, 1fr\) auto 52px/);
  assert.match(styles, /\.logout-button \{/);
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
  assert.doesNotMatch(page, /className="chat-companion"|turtle_talking\.png/);
  assert.match(styles, /\.chat-scene \{[\s\S]*?display: flex;[\s\S]*?justify-content: center;/);
  assert.match(styles, /\.chat-panel \{[\s\S]*?height: clamp\(360px, calc\(100dvh - 200px\), 760px\);/);
  assert.match(styles, /\.chat-panel \{[\s\S]*?width: min\(1180px, calc\(100vw - clamp\(56px, 10vw, 180px\)\)\);/);
  assert.match(styles, /\.message p \{[\s\S]*?font-size: 17px;/);
  assert.match(page, /回答正确随机奖励/);
  assert.match(page, /1 颗星星或 1 张旅行票/);
  assert.match(page, /const rewardKind = Math\.random\(\) < 0\.5 \? "star" : "ticket"/);
  assert.match(page, /stars: current\.stars \+ \(rewardKind === "star" \? 1 : 0\)/);
  assert.match(page, /tickets: current\.tickets \+ \(rewardKind === "ticket" \? 1 : 0\)/);
  assert.match(page, /这道题的奖励已经领取过啦/);
  assert.match(page, /龟龟的问题/);
  assert.match(page, /这次先跳过/);
  assert.match(page, /语音回答/);
  assert.match(page, /发给龟龟看看/);
  assert.match(page, /龟龟的称赞/);
  assert.match(page, /龟龟的思考/);
  assert.match(page, /我再想想/);
  assert.match(page, /thinkAgainChapterQuestion/);
  assert.match(page, /chapterQuestionOpen/);
  assert.doesNotMatch(page, /提交给 AI 判断|修改后重新提交/);
  assert.match(page, /readingRewards/);
  assert.match(page, /if \(result\.correct\)/);
  assert.match(page, /else if \(currentChapterQuestionAnswered\) \{\s*continueAfterChapterQuestion\(\)/);
  assert.match(page, /已回答 · 进入下一章/);
  assert.match(page, /已回答 · 查看阅读小结/);
  assert.match(styles, /\.next-button\.completed/);
  assert.doesNotMatch(page, /readingRewards[^\n]*slice\(-500\)/);
  assert.match(page, /scarecrow-zh\.md/);
  assert.match(page, /grimms-fairy-tales-zh\.md/);
  assert.match(page, /andersens-fairy-tales-zh\.md/);
  assert.match(page, /parseMarkdownBook/);
  assert.doesNotMatch(page, /grimms-fairy-tales-en\.txt|andersens-fairy-tales-en\.txt/);
  assert.match(styles, /text-indent: 2em/);
  assert.match(styles, /text-align: justify/);
  assert.match(page, /readingFontSize: "medium"/);
  assert.match(page, /选择原文字号/);
  assert.match(page, /听这一页/);
  assert.match(page, /温柔女声/);
  assert.match(page, /api\/book-audio/);
  assert.match(page, /bookAudioPageEndRef/);
  assert.match(styles, /\.book-audio-bar \{/);
  assert.match(styles, /\.book-audio-rates button\[aria-pressed="true"\]/);
  assert.match(bookAudioRoute, /ready: false/);
  assert.match(bookAudioRoute, /audioUrl/);
  assert.match(bookAudioFileRoute, /status: 206/);
  assert.match(bookAudioFileRoute, /content-range/);
  assert.match(bookAudioStore, /BOOK_AUDIO_DIR/);
  assert.match(bookAudioStore, /env\.UPLOADS/);
  assert.match(bookAudioGenerator, /tts_async\/submit/);
  assert.match(bookAudioGenerator, /tts_async\/query/);
  assert.match(bookAudioGenerator, /VOICE_TYPE = "BV104_streaming"/);
  assert.match(bookAudioGenerator, /VOICE_LABEL = "温柔女声（温柔淑女）"/);
  assert.doesNotMatch(bookAudioGenerator, /SpeechSynthesis|speechSynthesis/);
  assert.match(page, /label: "小"/);
  assert.match(page, /label: "中"/);
  assert.match(page, /label: "大"/);
  assert.match(page, /HIDE_TOTAL_ROUNDS = 5/);
  assert.match(page, /DAILY_HIDE_AND_SEEK_LIMIT = 5/);
  assert.match(page, /hideAndSeekDaily/);
  assert.match(page, /hideGamesRemaining/);
  assert.match(page, /hideSeconds <= HIDE_ROUND_SECONDS - 5/);
  assert.match(page, /className={`hide-countdown/);
  assert.match(page, /\{hideSeconds\}/);
  assert.doesNotMatch(page, /倒计时|秒后新线索|warmerHideClue|guessHidePlace/);
  assert.match(page, /onClick=\{findHiddenTurtle\}/);
  assert.match(page, /直接点藏起来的龟龟/);
  assert.doesNotMatch(page, /className={`world-hotspot/);
  assert.match(page, /连续找到 5 次奖励 1 颗星/);
  assert.match(page, /今天已经完成 5 局捉迷藏啦/);
  assert.match(page, /stars: current\.stars \+ 1/);
  assert.doesNotMatch(page, /完成三轮奖励 3～6 颗星|stars: current\.stars \+ starReward/);
  assert.match(styles, /\.hide-game-hud \{/);
  assert.match(styles, /\.hide-countdown \{/);
  assert.match(styles, /\.hide-clue-card \{/);
  assert.match(styles, /bottom: 116px/);
  assert.match(styles, /font-size: clamp\(20px, 1\.45vw, 25px\)/);
  assert.match(styles, /\.hidden-turtle\.generated-hide \{ clip-path: inset\(15%\); \}/);
  assert.match(styles, /\.hidden-tree-root \{/);
  assert.match(styles, /\.hidden-boulder \{/);
  assert.match(styles, /\.turtle-wrap\.in-pond \.turtle-sprite \{[\s\S]*?height: clamp\(112px, 18vh, 190px\)/);
  assert.match(styles, /@keyframes turtlePeek/);
  assert.match(styles, /\.reading-font-medium \.original-book-text p \{ font-size: 18px; \}/);
  assert.match(styles, /\.reading-font-large \.original-book-text p \{ font-size: 20px; \}/);
  assert.match(styles, /\.knowledge-only-panel > p \{[\s\S]*?font-size: clamp\(16px, 1\.08vw, 19px\)/);
  assert.match(styles, /\.mistake-card h2 \{ font-size: 18px/);
  assert.match(styles, /\.mistake-card > p \{ font-size: 15px/);
  assert.match(styles, /\.travel-card p \{ font-size: 16px/);
  assert.match(styles, /\.travel-card dl div \{[\s\S]*?font-size: 14px/);
  assert.match(styles, /height: clamp\(360px, calc\(100dvh - 190px\), 760px\)/);
  assert.match(styles, /width: min\(1500px, 84vw\)/);
  assert.match(styles, /flex: 0 0 clamp\(200px, 15vw, 244px\)/);
  assert.match(styles, /flex: 0 0 clamp\(280px, 21vw, 360px\)/);
  assert.match(styles, /\.reading-companion-card\.embedded \.companion-card-heading img \{[\s\S]*?height: 80px;[\s\S]*?width: 88px;/);
  assert.match(styles, /\.reading-companion-card\.embedded h3 \{[\s\S]*?font-size: 18px;/);
  assert.match(styles, /\.reading-companion-card\.embedded \.reading-guide,[\s\S]*?font-size: 14px;/);
  assert.match(styles, /\.chapter-question-copy \{[\s\S]*?font-size: 22px;/);
  assert.match(styles, /\.chapter-question-guide \{[\s\S]*?font-size: 18px;/);
  assert.match(styles, /\.chapter-question-heading img \{[\s\S]*?height: 132px;/);
  assert.match(page, /journal-scene-background/);
  assert.match(page, /growth-journal-emblem\.png/);
  assert.match(page, /scarecrow-reading-book\.png/);
  assert.match(page, /grimm-reading-book\.png/);
  assert.match(page, /andersen-reading-book\.png/);
  assert.match(page, /journal-travel-card/);
  assert.match(page, /journal-reading-card/);
  assert.match(page, /journal-inventory-grid/);
  assert.match(page, /function KnowledgeCardPreview/);
  assert.match(page, /KnowledgeCardPreview card=\{discovery\.card\} className="journal-card-photo"/);
  assert.match(page, /<div className="item-art"><KnowledgeCardPreview card=\{discovery\.card\} \/><\/div>/);
  assert.match(styles, /\.knowledge-card-preview > img \{[\s\S]*?object-position: center 34%;/);
  assert.match(styles, /\.journal-inventory-grid \.knowledge-card-preview > img \{[\s\S]*?object-position: center 28%;/);
  assert.match(page, /第一张旅行照片正在等你/);
  assert.match(page, /下一次阅读记录会出现在这里/);
  assert.match(page, /等待新发现/);
  assert.match(styles, /Growth journal uses the generated wood-and-vine parchment frame as its main board/);
  assert.match(styles, /border-image-source: var\(--journal-frame-image\)/);
  assert.match(page, /--journal-frame-image": `url\("\$\{ASSET\}\/ui\/journal\/knowledge-card-background\.png"\)/);
  assert.match(styles, /font-family: "Microsoft YaHei", "PingFang SC", "Heiti SC", Arial, sans-serif;/);
  assert.match(styles, /\.journal-reading-copy p \{[\s\S]*?font-size: 18px;/);
  assert.match(styles, /\.journal-card-copy p \{[\s\S]*?font-size: 17px;/);
  assert.match(page, /knowledge-card-background\.png/);
  assert.match(styles, /border-image-source: var\(--knowledge-card-background\)/);
  assert.match(styles, /\.knowledge-copy > p \{[\s\S]*?font-size: 19px;/);
  assert.match(styles, /\.knowledge-copy h2 \{[\s\S]*?font-size: 32px;/);
  assert.doesNotMatch(page, /SpeechRecognition/);
  assert.match(layout, /lang="zh-CN"/);
  assert.match(layout, /width: "device-width"/);
  assert.match(layout, /viewportFit: "cover"/);
  assert.match(styles, /Phone layout is intentionally isolated here/);
  assert.match(styles, /--mobile-topbar/);
  assert.match(styles, /--mobile-nav/);
  assert.match(styles, /overscroll-behavior-x: none/);
  assert.match(page, /const \[dailyTasksOpen, setDailyTasksOpen\] = useState\(false\)/);
  assert.match(nextConfig, /NEXT_PUBLIC_BASE_PATH/);
  assert.match(page, /fetch\(`\$\{BASE_PATH\}\/api\/companion`/);
  assert.doesNotMatch(styles, /url\(["']?\/assets\//);
  assert.match(modelConfig, /https:\/\/api\.deepseek\.com\/chat\/completions/);
  assert.match(modelConfig, /deepseek-v4-flash/);
  assert.match(modelConfig, /https:\/\/api\.xiaomimimo\.com\/v1\/chat\/completions/);
  assert.match(modelConfig, /MIMO_API_KEY/);
  assert.match(modelConfig, /mimo-v2\.5/);
  assert.match(companionRoute, /source: "mimo"/);
  assert.match(companionRoute, /DEFAULT_MIMO_TIMEOUT_MS = 25_000/);
  assert.match(companionRoute, /DEFAULT_DEEPSEEK_TIMEOUT_MS = 20_000/);
  assert.match(companionRoute, /MIMO_TIMEOUT_MS/);
  assert.match(companionRoute, /DEEPSEEK_TIMEOUT_MS/);
  assert.match(companionRoute, /fetchWithTimeout/);
  assert.match(companionRoute, /evaluateReadingWithDeepSeek/);
  assert.match(companionRoute, /retryable: true/);
  assert.match(companionRoute, /source: "deepseek"/);
  assert.match(companionRoute, /MiMo is the preferred judge/);
  assert.match(page, /const data = await response\.json\(\)\.catch[\s\S]*?if \(!response\.ok\)/);
  assert.match(page, /error instanceof Error && error\.message/);
  assert.match(companionRoute, /本章完整原文/);
  assert.match(companionRoute, /referenceAnswer/);
  assert.match(companionRoute, /thinking: \{ type: "disabled" \}/);
  assert.match(companionRoute, /response_format: \{ type: "json_object" \}/);
  assert.match(companionRoute, /parseReadingEvaluation/);
  assert.match(companionRoute, /correct: evaluation\.correct/);
  assert.match(companionRoute, /getResolvedModelConfig\("primary"\)/);
  assert.match(adminCenter, /数据总览/);
  assert.match(adminCenter, /账号与绑定/);
  assert.match(adminCenter, /学习数据/);
  assert.match(adminCenter, /AI 服务/);
  assert.match(adminCenter, /图书导入/);
  assert.match(adminCenter, /操作审计/);
  assert.match(adminCenter, /模型配置/);
  assert.match(adminCenter, /API 密钥/);
  assert.match(adminActions, /updateModelConfig/);
  assert.match(modelConfig, /AES-GCM/);
  assert.match(modelConfig, /MODEL_CONFIG_ENCRYPTION_KEY/);
  assert.match(adminStyles, /height: 100dvh; overflow-y: auto/);
  assert.match(parentStyles, /height: 100dvh; min-height: 100vh; overflow-y: auto/);
  assert.match(accountLogins, /account_login_events/);
  assert.doesNotMatch(adminCenter, /chatMessages|message_text/);
  assert.match(adminAuth, /ADMIN_INITIAL_PASSWORD/);
  assert.match(adminAuth, /sessionLifetime = 8 \* 60 \* 60 \* 1000/);
  assert.match(adminActions, /recordAdminAudit/);
  assert.match(adminActions, /resetManagedAccountPassword/);
  assert.match(adminData, /getActiveAdmin/);
  assert.match(serviceHealth, /DELETE FROM service_health_events WHERE created_at < \?/);
  assert.match(bookImportPanel, /电子书整理工作台/);
  assert.match(bookImportPanel, /扫描版 PDF 会逐页调用后台配置的 MiMo/);
  assert.match(bookImportPanel, /确认并发布到书房/);
  assert.match(bookImportClient, /PDF 文字层 \+ MiMo OCR 混合整理/);
  assert.match(bookImportClient, /frontMatterPattern/);
  assert.match(bookImportClient, /repeatedHeadersRemoved/);
  assert.match(bookImports, /imported_book_chapters/);
  assert.match(bookImports, /status = 'published'/);
  assert.match(bookAdminRoute, /recordAdminAudit/);
  assert.match(bookLibraryRoute, /getActiveStudent/);
  assert.match(page, /api\/library\/books/);
  assert.match(schemaStatements, /CREATE TABLE IF NOT EXISTS imported_books/);
  const parentLoginRoute = await readFile(new URL("../app/api/parent/auth/login/route.ts", import.meta.url), "utf8");
  const parentCompanionAi = await readFile(new URL("../lib/parent-companion-ai.ts", import.meta.url), "utf8");
  const parentCompanionRefresh = await readFile(new URL("../lib/parent-companion-refresh.ts", import.meta.url), "utf8");
  const parentCenter = await readFile(new URL("../app/parent/ParentCenter.tsx", import.meta.url), "utf8");
  assert.match(parentLoginRoute, /refreshParentCompanionSuggestions/);
  assert.match(parentCompanionRefresh, /claimDailyParentCompanionRefresh/);
  assert.match(parentCompanionAi, /不包含聊天原文/);
  assert.match(parentCompanionAi, /PARENT_SUGGESTION_MIMO_TIMEOUT_MS/);
  assert.match(parentCompanionAi, /PARENT_SUGGESTION_DEEPSEEK_TIMEOUT_MS/);
  assert.match(parentCenter, /dashboard\.companionSuggestion\.text/);
  assert.match(parentCenter, /兴趣和成长记忆/);
  assert.match(parentCenter, /兴趣只来自孩子明确表达或家长补充/);
  assert.match(parentCenter, /dashboard\.companionSuggestions/);
  assert.match(studentMemoryDb, /extractInterestTopics/);
  assert.match(studentMemoryDb, /chat-explicit/);
  assert.match(schemaStatements, /parent_companion_suggestion_history/);
  assert.match(parentCenter, /每天最多一次/);
  assert.match(companionRoute, /cleanPetName/);
  assert.match(companionRoute, /function localReply/);
  assert.match(companionRoute, /formatStudentMemory/);
  assert.match(companionRoute, /rememberStudentEvent/);
  assert.match(studentMemoryRoute, /rememberStudentEvent/);
  assert.match(studentMemoryDb, /STUDENT_MEMORY_FILE/);
  assert.match(studentMemoryDb, /user_id/);
  assert.match(studentMemoryDb, /recentActivities/);
  assert.match(page, /fruitPickingRemaining/);
  assert.match(page, /今天已经摘满 5 个果子/);
  assert.match(await readFile(new URL("../db/reading-progress.ts", import.meta.url), "utf8"), /READING_PROGRESS_FILE/);
  assert.match(speechRoute, /recognizeVolcSpeech/);
  assert.match(speechRoute, /MAX_AUDIO_BYTES/);
  assert.match(speechClient, /openspeech\.bytedance\.com\/api\/v3\/sauc\/bigmodel_nostream/);
  assert.match(modelConfig, /VOLC_SPEECH_APP_ID/);
  assert.match(modelConfig, /VOLC_SPEECH_ACCESS_TOKEN/);
  assert.match(modelConfig, /volc\.bigasr\.sauc\.duration/);
  assert.match(speechClient, /@vite-ignore/);
  assert.doesNotMatch(speechClient, /import WebSocket from "ws"/);
  assert.match(serverBundle, /openspeech\.bytedance\.com\/api\/v3\/sauc\/bigmodel_nostream/);
  assert.doesNotMatch(serverBundle, /ws does not work in the browser|node_modules\/ws\/browser\.js/);
  assert.match(mistakeScanRoute, /analyzeMistakeImage/);
  assert.match(mistakeScanRoute, /getActiveStudent/);
  assert.match(mistakesRoute, /createMistakeForUser/);
  assert.match(mistakesRoute, /deleteMistakeForUser/);
  assert.match(mistakesRoute, /saveMistakeImage\(student\.id/);
  assert.match(mistakeReviewRoute, /evaluateMistakeAnswer/);
  assert.match(mistakeReviewRoute, /recordMistakeReviewForUser\(student\.id/);
  assert.match(mistakesDb, /WHERE user_id = \? AND mistake_id = \?/);
  assert.match(mistakesDb, /user_mistake_answer_attempts/);
  assert.match(mistakesDb, /user_reward_ledger/);
  assert.match(mistakeAi, /getResolvedModelConfig\("multimodal"\)/);
  assert.match(mistakeAi, /response_format: \{ type: "json_object" \}/);
  assert.match(mistakeAi, /MAX_IMAGE_DATA_LENGTH/);
  for (const account of ["同学一", "同学二", "同学三", "同学四", "同学五", "同学六", "同学七"]) assert.match(authDb, new RegExp(account));
  assert.match(authDb, /initialPassword = "123456"/);
  assert.match(authDb, /PBKDF2/);
  assert.match(authDb, /passwordIterations = 210_000/);
  assert.match(authDb, /app_sessions/);
  assert.match(authUser, /httpOnly: true/);
  assert.match(authUser, /sameSite: "lax"/);
  assert.match(loginRoute, /mustResetPassword/);
  assert.match(loginRoute, /current\.count >= 8/);
  assert.match(loginRoute, /recordFailedAttempt/);
  assert.match(resetRoute, /newPassword === "123456"/);
  assert.match(resetRoute, /resetPassword/);
  assert.match(userStateRoute, /getActiveStudent/);
  assert.match(userStateDb, /readyRuntimeDatabase/);
  assert.match(schemaStatements, /user_id TEXT PRIMARY KEY/);
  assert.match(hosting, /"d1": "DB"/);
  assert.match(hosting, /"r2": "UPLOADS"/);
  assert.match(packageJson, /"ws"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  const formattedBooks = await Promise.all([
    readFile(new URL("../public/books/scarecrow-zh.md", import.meta.url), "utf8"),
    readFile(new URL("../public/books/grimms-fairy-tales-zh.md", import.meta.url), "utf8"),
    readFile(new URL("../public/books/andersens-fairy-tales-zh.md", import.meta.url), "utf8"),
  ]);
  const paragraphEnding = /[。！？!?…：；”’」』）】〞"']$/;
  let promptChapterCount = 0;
  for (const book of formattedBooks) {
    const divider = book.search(/^---\s*$/m);
    const body = book.slice(divider).replace(/^---\s*$/m, "");
    const chapters = [...body.matchAll(/^#\s+(.+)\s*$/gm)];
    promptChapterCount += chapters.length;
    for (let chapter = 0; chapter < chapters.length; chapter += 1) {
      const escapedTitle = chapters[chapter][1].trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      assert.match(bookKnowledge, new RegExp(`"${escapedTitle}"\\s*:`));
      assert.match(bookPrompts, new RegExp(`"${escapedTitle}"\\s*:`));
      const start = chapters[chapter].index + chapters[chapter][0].length;
      const end = chapters[chapter + 1]?.index ?? body.length;
      const paragraphs = body.slice(start, end)
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.replace(/^---\s*$/gm, "").trim())
        .filter(Boolean);
      paragraphs.slice(0, -1).forEach((paragraph) => assert.match(paragraph, paragraphEnding));
    }
  }
  assert.equal(promptChapterCount, 45, "每个真实故事章节都应有一条专属伴读问题");
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
    "../public/assets/ui/supplied/brand/logo-20260715.png",
    "../public/assets/ui/supplied/nav/home.png",
    "../public/assets/ui/supplied/nav/reading.png",
    "../public/assets/ui/supplied/nav/mistakes.png",
    "../public/assets/ui/supplied/nav/chat.png",
    "../public/assets/ui/supplied/nav/travel.png",
    "../public/assets/ui/supplied/nav/journal.png",
    "../public/assets/ui/supplied/nav/reading-20260714.png",
    "../public/assets/ui/supplied/nav/mistakes-20260714.png",
    "../public/assets/ui/supplied/nav/journal-20260714.png",
    "../public/assets/ui/login/background.png",
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
    "../public/assets/ui/journal/background.png",
    "../public/assets/ui/journal/parchment-panel.png",
    "../public/assets/ui/journal/traveler-turtle.png",
    "../public/assets/ui/journal/travel-path-scene.png",
    "../public/assets/ui/journal/signpost.png",
    "../public/assets/ui/journal/tabs-travel-active.png",
    "../public/assets/ui/journal/tabs-reading-active.png",
    "../public/assets/ui/journal/tabs-items-active.png",
    "../public/assets/ui/journal/empty-photo.png",
    "../public/assets/ui/journal/side-decoration.png",
    "../public/assets/ui/journal/green-button.png",
    "../public/assets/ui/journal/travel-card-frame.png",
    "../public/assets/ui/journal/pushpin.png",
    "../public/assets/ui/journal/location-sticker.png",
    "../public/assets/ui/journal/leaf-stamp.png",
    "../public/assets/ui/journal/shell-stamp.png",
    "../public/assets/ui/journal/card-action-button.png",
    "../public/assets/ui/journal/title-vine.png",
    "../public/assets/ui/journal/dotted-travel-path.png",
    "../public/assets/ui/journal/reading-record-book.png",
    "../public/assets/ui/journal/growth-journal-emblem.png",
    "../public/assets/ui/journal/knowledge-card-background.png",
    "../public/assets/ui/journal/books/scarecrow-reading-book.png",
    "../public/assets/ui/journal/books/grimm-reading-book.png",
    "../public/assets/ui/journal/books/andersen-reading-book.png",
    "../public/assets/characters/turtle/hide-generated/turtle-hide-cave-20260716.png",
    "../public/assets/characters/turtle/hide-generated/turtle-hide-bush-20260716.png",
    "../public/assets/characters/turtle/hide-generated/turtle-hide-flowers-20260716.png",
    "../public/assets/characters/turtle/hide-generated/turtle-hide-pond-rocks-20260716.png",
    "../public/assets/characters/turtle/hide-generated/turtle-hide-fruit-20260716.png",
    "../public/assets/characters/turtle/hide-generated/turtle-hide-path-rock-20260716.png",
    "../public/assets/characters/turtle/hide-generated/turtle-hide-tree-root-20260716.png",
    "../public/assets/characters/turtle/hide-generated/turtle-hide-flower-bank-20260716.png",
    "../public/assets/characters/turtle/hide-generated/turtle-hide-lily-pad-20260716.png",
    "../public/assets/characters/turtle/hide-generated/turtle-hide-cave-door-20260716.png",
    "../public/assets/characters/turtle/hide-generated/turtle-hide-cave-flowers-20260716.png",
    "../public/assets/characters/turtle/hide-generated/turtle-hide-blue-flowers-20260716.png",
    "../public/assets/characters/turtle/hide-generated/turtle-hide-hedge-20260716.png",
    "../public/assets/characters/turtle/hide-generated/turtle-hide-path-grass-20260716.png",
    "../public/assets/characters/turtle/hide-generated/turtle-hide-pond-cobbles-20260716.png",
    "../public/assets/characters/turtle/hide-generated/turtle-hide-boulder-20260716.png",
    "../public/assets/travel/knowledge-cards-20260716/forest-layers.jpg",
    "../public/assets/travel/knowledge-cards-20260716/tree-rings.jpg",
    "../public/assets/travel/knowledge-cards-20260716/forest-seasons.jpg",
    "../public/assets/travel/knowledge-cards-20260716/coral-reef.jpg",
    "../public/assets/travel/knowledge-cards-20260716/deep-sea.jpg",
    "../public/assets/travel/knowledge-cards-20260716/sea-turtle.jpg",
    "../public/assets/travel/knowledge-cards-20260716/shark.jpg",
    "../public/assets/travel/knowledge-cards-20260716/dinosaur-types.jpg",
    "../public/assets/travel/knowledge-cards-20260716/dinosaur-fossils.jpg",
    "../public/assets/travel/knowledge-cards-20260716/dinosaur-habits.jpg",
    "../public/assets/travel/knowledge-cards-20260716/dinosaur-extinction.jpg",
    "../public/assets/travel/knowledge-cards-20260716/solar-system.jpg",
    "../public/assets/travel/knowledge-cards-20260716/moon-exploration.jpg",
    "../public/assets/travel/knowledge-cards-20260716/constellations.jpg",
    "../public/assets/travel/knowledge-cards-20260716/mars-exploration.jpg",
    "../public/assets/travel/knowledge-cards-20260716/ancient-ruins.jpg",
    "../public/assets/travel/knowledge-cards-20260716/pyramids.jpg",
    "../public/assets/travel/knowledge-cards-20260716/future-science.jpg",
    "../public/assets/travel/knowledge-cards-20260716/clean-energy.jpg",
    "../public/books/scarecrow-zh.md",
    "../public/books/grimms-fairy-tales-zh.md",
    "../public/books/andersens-fairy-tales-zh.md",
  ]) {
    await access(new URL(path, import.meta.url));
  }
});
