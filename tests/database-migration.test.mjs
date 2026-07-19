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

    const backupDirectories = await readdir(backupRoot);
    assert.equal(backupDirectories.length, 1);
    const backupFiles = await readdir(join(backupRoot, backupDirectories[0]));
    assert.deepEqual(backupFiles.sort(), ["auth.json", "memory.json", "progress.json", "state.json"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
