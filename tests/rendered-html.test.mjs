import assert from "node:assert/strict";
import { access, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";

const testRoot = join(tmpdir(), `guigu-account-tests-${process.pid}-${Date.now()}`);
process.env.AUTH_STORE_FILE = join(testRoot, "auth.json");
process.env.USER_STATE_FILE = join(testRoot, "user-state.json");
process.env.READING_PROGRESS_FILE = join(testRoot, "reading-progress.json");
process.env.STUDENT_MEMORY_FILE = join(testRoot, "student-memory.json");
process.env.MISTAKE_IMAGE_DIR = join(testRoot, "mistake-images");

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
    new Request(`http://localhost${path}`, init),
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
  assert.match(html, /同学一/);
  assert.match(html, /同学二/);
  assert.match(html, /同学三/);
  assert.doesNotMatch(html, /我的伙伴/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("forces first-login password reset and isolates every student's data", async () => {
  const unauthorized = await fetchApp("/api/user-state");
  assert.equal(unauthorized.status, 401);

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
});

test("keeps the product loops, account safeguards, and required art assets", async () => {
  const [page, styles, layout, nextConfig, companionRoute, speechRoute, mistakeScanRoute, studentMemoryRoute, studentMemoryDb, bookKnowledge, packageJson, authDb, authUser, loginRoute, resetRoute, userStateRoute, userStateDb, hosting] = await Promise.all([
    readFile(new URL("../app/ReadingApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/companion/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/speech/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/mistake-scan/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/student-memory/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/student-memory.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/book-knowledge.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../db/auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/auth-user.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/login/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/reset-password/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/user-state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/user-state.ts", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
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
  assert.match(page, /tickets: 3/);
  assert.match(page, /mistakes: \[\]/);
  assert.match(page, /dailyPlan:/);
  assert.match(page, /createDailyPlan/);
  assert.match(page, /advanceDailyTask/);
  assert.match(page, /earnedReward \? 3 : 0/);
  assert.match(page, /全部完成可得 3 颗星星/);
  assert.match(page, /ui\/daily-tasks\/title\.png/);
  assert.doesNotMatch(page, /ui\/daily-tasks\/task-row\.png/);
  assert.doesNotMatch(styles, /--daily-task-row|var\(--daily-task-row\)/);
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
  assert.match(page, /landHomeSpots: HomeSpot\[\] = \["center", "tree-shade", "cave-door"\]/);
  assert.doesNotMatch(page, /HomeSpot = [^;]*pond-edge/);
  assert.match(styles, /width: clamp\(106px, 10\.5vw, 165px\)/);
  assert.match(styles, /height: clamp\(155px, 25vh, 270px\)/);
  assert.match(styles, /\.turtle-wrap \{[\s\S]*?left: 50%;/);
  assert.match(styles, /\.turtle-wrap,\n\s+\.turtle-wrap\.spot-tree-shade \{[\s\S]*?left: 34%;/);
  assert.match(page, /ui\/home-refresh\/actions\/swim\.png/);
  assert.match(page, /ui\/home-refresh\/status\/panel\.png/);
  assert.match(page, /ui\/supplied\/brand\/logo\.png/);
  assert.match(page, /ui\/supplied\/nav\/home\.png/);
  assert.match(page, /ui\/supplied\/nav\/reading-20260714\.png/);
  assert.match(page, /ui\/supplied\/nav\/mistakes-20260714\.png/);
  assert.match(page, /ui\/supplied\/nav\/journal-20260714\.png/);
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
  assert.match(layout, /viewportFit: "cover"/);
  assert.match(styles, /Phone layout is intentionally isolated here/);
  assert.match(styles, /--mobile-topbar/);
  assert.match(styles, /--mobile-nav/);
  assert.match(styles, /overscroll-behavior-x: none/);
  assert.match(page, /const \[dailyTasksOpen, setDailyTasksOpen\] = useState\(false\)/);
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
  assert.match(companionRoute, /formatStudentMemory/);
  assert.match(companionRoute, /rememberStudentEvent/);
  assert.match(studentMemoryRoute, /rememberStudentEvent/);
  assert.match(studentMemoryDb, /STUDENT_MEMORY_FILE/);
  assert.match(studentMemoryDb, /user_id/);
  assert.match(studentMemoryDb, /recentActivities/);
  assert.match(page, /fruitPickingRemaining/);
  assert.match(page, /今天已经摘满 5 个果子/);
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
  for (const account of ["同学一", "同学二", "同学三"]) assert.match(authDb, new RegExp(account));
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
  assert.match(userStateDb, /user_id TEXT PRIMARY KEY/);
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
  for (const book of formattedBooks) {
    const divider = book.search(/^---\s*$/m);
    const body = book.slice(divider).replace(/^---\s*$/m, "");
    const chapters = [...body.matchAll(/^#\s+(.+)\s*$/gm)];
    for (let chapter = 0; chapter < chapters.length; chapter += 1) {
      assert.match(bookKnowledge, new RegExp(`"${chapters[chapter][1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*:`));
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
    "../public/assets/ui/supplied/nav/reading-20260714.png",
    "../public/assets/ui/supplied/nav/mistakes-20260714.png",
    "../public/assets/ui/supplied/nav/journal-20260714.png",
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
