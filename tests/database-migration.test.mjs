import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const projectRoot = resolve(import.meta.dirname, "..");
const tsx = resolve(projectRoot, "node_modules/.bin/tsx");

function run(command, args, env = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", rejectRun);
    child.on("close", (code) => {
      if (code === 0) resolveRun({ stdout, stderr });
      else rejectRun(new Error(`command exited ${code}\n${stdout}\n${stderr}`));
    });
  });
}

function gameState(overrides = {}) {
  const now = Date.now();
  return {
    name: "小龟龟",
    hunger: 30,
    cleanliness: 80,
    boredom: 25,
    fruits: 5,
    stars: 12,
    tickets: 3,
    lastSeen: now,
    readingRecords: [],
    readingRewards: [],
    travelRecords: [],
    chatMessages: [],
    activeTravel: null,
    mistakes: [],
    dailyPlan: {
      dateKey: "2026-07-19",
      mistakeMode: "add",
      targets: { feed: 1, swim: 1, reading: 1, mistake: 1 },
      progress: { feed: 0, swim: 0, reading: 0, mistake: 0 },
      rewardClaimed: false,
    },
    fruitPicking: { dateKey: "2026-07-19", picked: 0 },
    hideAndSeekDaily: { dateKey: "2026-07-19", completed: 0 },
    readingFontSize: "medium",
    ...overrides,
  };
}

test("handwritten-answer OCR cannot see the question or reference answer before recognition", async () => {
  const evaluation = await run(tsx, ["-e", `
    process.env.MIMO_API_KEY = "test-key";
    (async () => {
      const { evaluateMistakeAnswer } = await import("./lib/mistake-ai.ts");
      const calls = [];
      const replies = [
        { readable: true, recognizedAnswer: "42", recognizedSteps: "6×7=42", notice: "" },
        { correct: true, feedback: "答案和步骤都正确", notice: "" }
      ];
      globalThis.fetch = async (_url, init) => {
        calls.push(JSON.parse(String(init.body)));
        const reply = replies.shift();
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }), {
          status: 200, headers: { "content-type": "application/json" }
        });
      };
      const result = await evaluateMistakeAnswer({
        imageData: "data:image/png;base64,AAAA",
        question: "秘密原题-8491", wrongAnswer: "旧答案-2233", correction: "参考答案-9876"
      });
      process.stdout.write(JSON.stringify({ calls, result }));
    })();
  `]);
  const { calls, result } = JSON.parse(evaluation.stdout);
  assert.equal(calls.length, 2);
  const recognitionRequest = JSON.stringify(calls[0]);
  assert.doesNotMatch(recognitionRequest, /秘密原题-8491|旧答案-2233|参考答案-9876/);
  const judgmentRequest = JSON.stringify(calls[1]);
  assert.match(judgmentRequest, /秘密原题-8491/);
  assert.match(judgmentRequest, /参考答案-9876/);
  assert.equal(result.readable, true);
  assert.equal(result.correct, true);
  assert.equal(result.recognizedSteps, "6×7=42");

  const unreadable = await run(tsx, ["-e", `
    process.env.MIMO_API_KEY = "test-key";
    (async () => {
      const { evaluateMistakeAnswer } = await import("./lib/mistake-ai.ts");
      let calls = 0;
      globalThis.fetch = async () => {
        calls += 1;
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
          readable: false, recognizedAnswer: "", recognizedSteps: "", notice: "没有手写作答"
        }) } }] }), { status: 200, headers: { "content-type": "application/json" } });
      };
      const result = await evaluateMistakeAnswer({
        imageData: "data:image/png;base64,AAAA", question: "1+1=?", wrongAnswer: "3", correction: "2"
      });
      process.stdout.write(JSON.stringify({ calls, result }));
    })();
  `]);
  const unreadableResult = JSON.parse(unreadable.stdout);
  assert.equal(unreadableResult.calls, 1, "unreadable photos must not proceed to answer judgment");
  assert.equal(unreadableResult.result.readable, false);
  assert.equal(unreadableResult.result.correct, false);
});

test("student interests require explicit expression and keep their own evidence time", async () => {
  const root = await mkdtemp(join(tmpdir(), "guigu-memory-test-"));
  try {
    const databasePath = join(root, "app.sqlite");
    const memoryRun = await run(tsx, ["-e", `
      process.env.APP_DATABASE_FILE = ${JSON.stringify(databasePath)};
      (async () => {
        const { rememberStudentEvent, getStudentMemory, extractInterestTopics, normalizeInterestTopics } = await import("./db/student-memory.ts");
        const { readyRuntimeDatabase } = await import("./db/runtime-database.ts");
        const { saveParentCompanionSuggestion, getParentCompanionSuggestionHistory } = await import("./db/parent-companion.ts");
        const userId = "student-interest-test";
        await rememberStudentEvent(userId, { type: "chat", message: "龟龟可以叫我米粒吧，我喜欢恐龙和太空。" });
        const database = await readyRuntimeDatabase();
        const firstEvidence = await database.first("SELECT last_used_at FROM user_memory_facts WHERE user_id = ? AND fact_type = 'interest' AND fact_value = '太空'", [userId]);
        await new Promise((resolve) => setTimeout(resolve, 8));
        await rememberStudentEvent(userId, { type: "activity", activity: "捉迷藏", detail: "和龟龟玩了一局" });
        const secondEvidence = await database.first("SELECT last_used_at FROM user_memory_facts WHERE user_id = ? AND fact_type = 'interest' AND fact_value = '太空'", [userId]);
        await rememberStudentEvent(userId, { type: "chat", message: "我想知道你喜欢什么。" });
        await rememberStudentEvent(userId, { type: "chat", message: "我不喜欢足球。" });
        await database.run("INSERT INTO user_memory_facts (user_id, fact_type, fact_value, source_type, created_at, last_used_at, expires_at) VALUES (?, 'interest', ?, 'legacy-d1', ?, ?, NULL)", [userId, "最近对星星和行星很好奇", Date.now(), Date.now()]);
        await saveParentCompanionSuggestion("parent-test", userId, { text: "先聊聊恐龙最吸引你的地方。", modelSource: "test", generatedAt: 100 });
        await saveParentCompanionSuggestion("parent-test", userId, { text: "一起画一张太空路线图。", modelSource: "test", generatedAt: 200 });
        const memory = await getStudentMemory(userId);
        const history = await getParentCompanionSuggestionHistory(userId, 8);
        process.stdout.write(JSON.stringify({
          explicit: extractInterestTopics("我喜欢恐龙和太空，但是今天有点累。"),
          inquiry: extractInterestTopics("我想知道你喜欢什么。"),
          learningIntent: extractInterestTopics("我想学习乘法口诀。"),
          negative: extractInterestTopics("我不太喜欢足球。"),
          legacy: normalizeInterestTopics("最近对星星和行星很好奇"),
          legacyFalsePositives: [
            "喝那个",
            "我们来聊点别的吧。那么你最喜欢什么绘本呢？",
            "我叫你青岩石",
            "旅游吗",
            "普通小乌龟喜欢吃肉和菜，还有龟粮呢。",
            "那么你喜欢干什么呢？",
          ].flatMap(normalizeInterestTopics),
          memory,
          firstEvidence: firstEvidence.last_used_at,
          secondEvidence: secondEvidence.last_used_at,
          history,
        }));
      })();
    `]);
    const result = JSON.parse(memoryRun.stdout);
    assert.deepEqual(result.explicit, ["恐龙", "太空"]);
    assert.deepEqual(result.inquiry, []);
    assert.deepEqual(result.learningIntent, []);
    assert.deepEqual(result.negative, []);
    assert.deepEqual(result.legacy, ["星星", "行星"]);
    assert.deepEqual(result.legacyFalsePositives, []);
    assert.equal(result.memory.studentName, "米粒");
    assert.deepEqual([...result.memory.interests].sort(), ["太空", "恐龙", "星星", "行星"].sort());
    assert.equal(result.memory.interests.includes("足球"), false);
    assert.equal(result.memory.interestDetails.find((item) => item.value === "太空").sourceType, "chat-explicit");
    assert.equal(result.firstEvidence, result.secondEvidence, "unrelated activities must not refresh an old interest's evidence time");
    assert.deepEqual(result.history.map((item) => item.generatedAt), [200, 100]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("administrator book imports are validated, published, readable, and safely hidden", async () => {
  const root = await mkdtemp(join(tmpdir(), "guigu-book-import-test-"));
  try {
    const databasePath = join(root, "app.sqlite");
    const imported = await run(tsx, ["-e", `
      process.env.APP_DATABASE_FILE = ${JSON.stringify(databasePath)};
      (async () => {
        const { createImportedBook, getAdminImportedBooks, getPublishedBookCatalog, getPublishedBookContent, setImportedBookStatus } = await import("./db/book-imports.ts");
        const { analyzeTextBook } = await import("./lib/book-import-client.ts");
        const analysis = analyzeTextBook("# 前言\\n这不是学生阅读正文。\\n\\n# 第一章 小种子\\n小种子在泥土里\\n安静地等待春天。\\n\\n它听见雨声。\\n\\n# 第二章 发芽\\n春风来了，小种子长出了嫩芽。", "markdown");
        const bookId = "imported-11111111-1111-4111-8111-111111111111";
        await createImportedBook("admin-test", {
          bookId, title: "小种子的旅行", author: "测试作者", grade: "一年级", summary: "一粒种子的成长故事。",
          knowledge: "种子发芽需要合适的水分、温度和空气。", memoryCategory: "自然童话", sourceFilename: "小种子.md",
          sourceFormat: "markdown", sourceSize: 320, extractionMode: analysis.extractionMode, qualityReport: analysis.quality, chapters: analysis.chapters,
        });
        const admin = await getAdminImportedBooks();
        const catalogBefore = await getPublishedBookCatalog();
        const content = await getPublishedBookContent(bookId);
        await setImportedBookStatus(bookId, "hidden");
        const catalogAfter = await getPublishedBookCatalog();
        process.stdout.write(JSON.stringify({ analysis, admin, catalogBefore, content, catalogAfter }));
      })();
    `]);
    const result = JSON.parse(imported.stdout);
    assert.equal(result.analysis.chapters.length, 2, "front matter must not become a reading chapter");
    assert.equal(result.analysis.quality.skippedFrontMatterPages, 1);
    assert.match(result.analysis.chapters[0].pages[0].body, /小种子在泥土里安静地等待春天。/);
    assert.equal(result.admin[0].chapterCount, 2);
    assert.equal(result.catalogBefore[0].title, "小种子的旅行");
    assert.equal(result.content.chapters.length, 2);
    assert.equal(result.catalogAfter.length, 0, "hidden books must disappear from the student shelf");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("JSON data migrates to isolated SQLite rows and can build a parent report", async () => {
  const root = await mkdtemp(join(tmpdir(), "guigu-db-test-"));
  try {
    const now = Date.now();
    const authPath = join(root, "auth.json");
    const statePath = join(root, "state.json");
    const progressPath = join(root, "progress.json");
    const memoryPath = join(root, "memory.json");
    const databasePath = join(root, "app.sqlite");
    const backupRoot = join(root, "backups");

    await Promise.all([
      writeFile(authPath, JSON.stringify({
        users: {
          "legacy-a": { id: "student-a", username: "甲同学", passwordHash: "hash-a", mustResetPassword: false },
          "student-b": { id: "student-b", username: "乙同学", passwordHash: "hash-b", mustResetPassword: true },
        },
        sessions: {
          "valid-token": { userId: "student-a", expiresAt: now + 60_000, createdAt: now },
          "orphan-token": { userId: "missing-user", expiresAt: now + 60_000, createdAt: now },
        },
      })),
      writeFile(statePath, JSON.stringify({
        "legacy-a": {
          updatedAt: now,
          state: gameState({
            name: "青团",
            stars: 17,
            fruits: 4,
            tickets: 6,
            readingFontSize: "large",
            readingRecords: [{ id: now - 4_000, title: "稻草人", date: "7月19日", answer: "因为他关心别人", summary: "读完一章" }],
            readingRewards: ["chapter:scarecrow-zh:0"],
            travelRecords: [{ id: now - 3_000, destination: "森语树屋", date: "7月19日", reward: "树木年轮卡", photo: "/photo.png" }],
            mistakes: [{ id: now - 2_000, subject: "数学", question: "2+3", wrongAnswer: "4", correction: "5", cause: "计算疏忽", status: "reviewing", date: "7月19日", reviewCount: 2 }],
            chatMessages: [
              { id: now - 1_000, role: "user", text: "我喜欢恐龙" },
              { id: now - 900, role: "turtle", text: "恐龙很有意思！" },
            ],
            dailyPlan: {
              dateKey: "2026-07-19",
              mistakeMode: "review",
              targets: { feed: 1, swim: 1, reading: 1, mistake: 1 },
              progress: { feed: 1, swim: 1, reading: 1, mistake: 1 },
              rewardClaimed: true,
            },
            fruitPicking: { dateKey: "2026-07-19", picked: 3 },
            hideAndSeekDaily: { dateKey: "2026-07-19", completed: 2 },
          }),
        },
        "student-b": { updatedAt: now + 1, state: gameState({ name: "米粒", stars: 2, fruits: 1, tickets: 0 }) },
      })),
      writeFile(progressPath, JSON.stringify({
        "legacy-a": {
          "scarecrow-zh": { book_id: "scarecrow-zh", chapter_index: 2, page_index: 1, completed: 0, updated_at: now },
        },
        "student-b": {
          "grimm-zh": { book_id: "grimm-zh", chapter_index: 1, page_index: 0, completed: 1, updated_at: now },
        },
        "legacy-device": {
          "andersen-zh": { book_id: "andersen-zh", chapter_index: 3, page_index: 0, completed: 0, updated_at: now },
        },
      })),
      writeFile(memoryPath, JSON.stringify({
        "legacy-a": {
          studentName: "甲同学",
          books: [{ title: "稻草人", category: "童话", chapter: "第一章", lastReadAt: now }],
          learned: ["稻草人会关心别人"],
          interests: ["恐龙"],
          recentActivities: [{ activity: "读书", detail: "读了《稻草人》", at: now }],
          updatedAt: now,
        },
        "legacy-device": {
          studentName: "",
          books: [{ title: "安徒生童话", category: "童话", chapter: "丑小鸭", lastReadAt: now }],
          learned: [], interests: [], recentActivities: [], updatedAt: now,
        },
      })),
    ]);

    const migration = await run(tsx, [
      "scripts/migrate-json-to-sqlite.mts",
      "--database", databasePath,
      "--auth", authPath,
      "--state", statePath,
      "--progress", progressPath,
      "--memory", memoryPath,
      "--backup-dir", backupRoot,
    ]);
    const result = JSON.parse(migration.stdout);
    assert.equal(result.integrity, "ok");
    assert.equal(result.users, 2);
    assert.equal(result.sessions, 1);
    assert.deepEqual(result.unassigned, { state: 0, progress: 1, memory: 1 });

    const database = new DatabaseSync(databasePath);
    assert.deepEqual(
      database.prepare("SELECT user_id, stars, fruits, tickets FROM user_pet_state ORDER BY user_id").all().map((row) => ({ ...row })),
      [
        { user_id: "student-a", stars: 17, fruits: 4, tickets: 6 },
        { user_id: "student-b", stars: 2, fruits: 1, tickets: 0 },
      ],
    );
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM app_sessions").get().count, 1);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM user_reading_progress WHERE user_id = 'student-a' AND book_id = 'scarecrow-zh'").get().count, 1);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM user_reading_progress WHERE user_id = 'student-b' AND book_id = 'scarecrow-zh'").get().count, 0);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM user_mistakes WHERE user_id = 'student-a'").get().count, 1);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'user_mistake_answer_attempts'").get().count, 1);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM user_memory_facts WHERE user_id = 'student-a' AND fact_type = 'interest' AND fact_value = '恐龙'").get().count, 1);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM legacy_unassigned_data WHERE source_key = 'legacy-device'").get().count, 2);
    assert.equal(database.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    database.close();

    const mistakeRun = await run(tsx, ["-e", `
      process.env.APP_DATABASE_FILE = ${JSON.stringify(databasePath)};
      (async () => {
        const { createMistakeForUser, getMistakeForUser, recordMistakeReviewForUser, deleteMistakeForUser } = await import("./db/mistakes.ts");
        const record = await createMistakeForUser({
          userId: "student-a", subject: "数学", question: "6 × 7 等于多少？", wrongAnswer: "36",
          correction: "6 × 7 = 42", cause: "知识点没记牢", date: "7月19日",
          imageUrl: "/api/mistake-image?id=11111111-1111-4111-8111-111111111111",
          modelSource: "mimo-v2.5", notice: ""
        });
        const invisibleToOtherAccount = await getMistakeForUser("student-b", String(record.id));
        const otherAccountReview = await recordMistakeReviewForUser("student-b", String(record.id), {
          answerImageUrl: "/api/mistake-image?id=22222222-2222-4222-8222-222222222222",
          recognizedAnswer: "42", recognizedSteps: "6 × 7 = 42", correct: true,
          feedback: "正确", notice: "", modelSource: "mimo-v2.5"
        });
        const otherAccountDelete = await deleteMistakeForUser("student-b", String(record.id));
        const wrong = await recordMistakeReviewForUser("student-a", String(record.id), {
          answerImageUrl: "/api/mistake-image?id=33333333-3333-4333-8333-333333333333",
          recognizedAnswer: "36", recognizedSteps: "6 × 6 = 36", correct: false,
          feedback: "再检查乘法口诀", notice: "", modelSource: "mimo-v2.5"
        });
        const correct = await recordMistakeReviewForUser("student-a", String(record.id), {
          answerImageUrl: "/api/mistake-image?id=44444444-4444-4444-8444-444444444444",
          recognizedAnswer: "42", recognizedSteps: "6 × 7 = 42", correct: true,
          feedback: "答案和步骤都正确", notice: "", modelSource: "mimo-v2.5"
        });
        const repeatedCorrect = await recordMistakeReviewForUser("student-a", String(record.id), {
          answerImageUrl: "/api/mistake-image?id=55555555-5555-4555-8555-555555555555",
          recognizedAnswer: "42", recognizedSteps: "7 + 7 + 7 + 7 + 7 + 7 = 42", correct: true,
          feedback: "另一种方法也正确", notice: "", modelSource: "mimo-v2.5"
        });
        process.stdout.write(JSON.stringify({ record, invisibleToOtherAccount, otherAccountReview, otherAccountDelete, wrong, correct, repeatedCorrect }));
      })();
    `]);
    const mistakeResult = JSON.parse(mistakeRun.stdout);
    assert.equal(mistakeResult.invisibleToOtherAccount, null);
    assert.equal(mistakeResult.otherAccountReview, null);
    assert.equal(mistakeResult.otherAccountDelete, null);
    assert.equal(mistakeResult.wrong.rewardStars, 0);
    assert.equal(mistakeResult.correct.rewardStars, 2);
    assert.equal(mistakeResult.repeatedCorrect.rewardStars, 0);

    const reviewedDatabase = new DatabaseSync(databasePath);
    assert.equal(reviewedDatabase.prepare("SELECT COUNT(*) AS count FROM user_mistake_answer_attempts WHERE user_id = 'student-a'").get().count, 3);
    assert.equal(reviewedDatabase.prepare("SELECT COUNT(*) AS count FROM user_mistake_answer_attempts WHERE user_id = 'student-b'").get().count, 0);
    assert.equal(reviewedDatabase.prepare("SELECT stars FROM user_pet_state WHERE user_id = 'student-a'").get().stars, 19);
    assert.equal(reviewedDatabase.prepare("SELECT stars FROM user_pet_state WHERE user_id = 'student-b'").get().stars, 2);
    assert.equal(reviewedDatabase.prepare("SELECT model_source FROM user_mistake_analyses WHERE user_id = 'student-a' AND mistake_id = ?").get(String(mistakeResult.record.id)).model_source, "mimo-v2.5");
    assert.equal(reviewedDatabase.prepare("SELECT COUNT(*) AS count FROM user_reward_ledger WHERE user_id = 'student-a' AND source_type = 'mistake-mastered'").get().count, 1);
    assert.equal(reviewedDatabase.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    reviewedDatabase.close();

    const reportRun = await run(tsx, ["-e", `
      process.env.APP_DATABASE_FILE = ${JSON.stringify(databasePath)};
      (async () => {
        const { buildParentReport } = await import("./db/parent-reports.ts");
        const report = await buildParentReport("student-a", { from: ${now - 60_000}, to: ${now + 60_000} });
        process.stdout.write(JSON.stringify(report));
      })();
    `]);
    const report = JSON.parse(reportRun.stdout);
    assert.equal(report.username, "甲同学");
    assert.equal(report.dailyTasks.fullyCompletedDays, 1);
    assert.equal(report.reading.books[0].bookId, "scarecrow-zh");
    assert.equal(report.mistakes.photoAnswerAttempts, 3);
    assert.equal(report.mistakes.correctPhotoAnswers, 2);
    assert.deepEqual(report.interests, ["恐龙"]);
    assert.equal("chatMessages" in report, false);

    const parentRun = await run(tsx, ["-e", `
      process.env.APP_DATABASE_FILE = ${JSON.stringify(databasePath)};
      (async () => {
        const { authenticateParent, resetParentPassword } = await import("./db/parent-auth.ts");
        const { parentCanAccessStudent, getParentDashboard, clearStudentChat, updateParentControls } = await import("./db/parent-center.ts");
        const { rememberStudentEvent, getStudentMemory } = await import("./db/student-memory.ts");
        const { saveUserState } = await import("./db/user-state.ts");
        const { readyRuntimeDatabase } = await import("./db/runtime-database.ts");
        const initial = await authenticateParent("同学一家长", "123456");
        const ownDefault = initial ? await parentCanAccessStudent(initial.id, "student-demo-1") : false;
        const forbidden = initial ? await parentCanAccessStudent(initial.id, "student-b") : true;
        const database = await readyRuntimeDatabase();
        await database.run("INSERT OR IGNORE INTO parent_student_links (parent_id, student_id, relationship, created_at) VALUES (?, ?, ?, ?)", [initial.id, "student-a", "母亲", Date.now()]);
        const dashboard = await getParentDashboard(initial.id, initial.username, "student-a", 7);
        await updateParentControls("student-a", { chatMemoryEnabled: false, interestAnalysisEnabled: false });
        await rememberStudentEvent("student-a", { type: "chat", message: "我喜欢火星" });
        const memoryAfterDisabledChat = await getStudentMemory("student-a");
        await clearStudentChat("student-a");
        const clearedAt = Date.now();
        await saveUserState("student-a", ${JSON.stringify(gameState({
          chatMessages: [
            { id: now - 1_000, role: "user", text: "我喜欢恐龙" },
            { id: now - 900, role: "turtle", text: "恐龙很有意思！" },
          ],
        }))}, clearedAt + 1000);
        const chatCount = await database.first("SELECT COUNT(*) AS count FROM user_chat_messages WHERE user_id = ?", ["student-a"]);
        await resetParentPassword(initial.id, "parent-secure-789");
        const oldPassword = await authenticateParent("同学一家长", "123456");
        const newPassword = await authenticateParent("同学一家长", "parent-secure-789");
        process.stdout.write(JSON.stringify({
          initial: { username: initial?.username, mustResetPassword: initial?.mustResetPassword },
          ownDefault, forbidden,
          children: dashboard?.children.map((child) => child.id),
          selectedChild: dashboard?.selectedChild.id,
          dashboardHasChatMessages: dashboard ? "chatMessages" in dashboard : true,
          serializedContainsRawChat: JSON.stringify(dashboard).includes("我喜欢恐龙"),
          interestsAfterDisabledChat: memoryAfterDisabledChat.interests,
          chatCount: chatCount.count,
          oldPassword: Boolean(oldPassword), newPasswordReset: newPassword?.mustResetPassword,
        }));
      })();
    `]);
    const parent = JSON.parse(parentRun.stdout);
    assert.deepEqual(parent.initial, { username: "同学一家长", mustResetPassword: true });
    assert.equal(parent.ownDefault, true);
    assert.equal(parent.forbidden, false);
    assert.deepEqual(parent.children.sort(), ["student-a", "student-demo-1"]);
    assert.equal(parent.selectedChild, "student-a");
    assert.equal(parent.dashboardHasChatMessages, false);
    assert.equal(parent.serializedContainsRawChat, false);
    assert.deepEqual(parent.interestsAfterDisabledChat, ["恐龙"]);
    assert.equal(parent.chatCount, 0, "cleared chat cannot be re-uploaded by an already-open student client");
    assert.equal(parent.oldPassword, false);
    assert.equal(parent.newPasswordReset, false);

    const backupDirectories = await readdir(backupRoot);
    assert.equal(backupDirectories.length, 1);
    const backupFiles = await readdir(join(backupRoot, backupDirectories[0]));
    assert.deepEqual(backupFiles.sort(), ["auth.json", "memory.json", "progress.json", "state.json"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
