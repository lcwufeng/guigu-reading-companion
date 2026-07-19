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
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM user_memory_facts WHERE user_id = 'student-a' AND fact_type = 'interest' AND fact_value = '恐龙'").get().count, 1);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM legacy_unassigned_data WHERE source_key = 'legacy-device'").get().count, 2);
    assert.equal(database.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    database.close();

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
