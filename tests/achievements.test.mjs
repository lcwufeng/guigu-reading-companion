import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const projectRoot = resolve(import.meta.dirname, "..");
const tsx = resolve(projectRoot, "node_modules/.bin/tsx");

function run(source, databasePath) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(tsx, ["-e", source], {
      cwd: projectRoot,
      env: { ...process.env, APP_DATABASE_FILE: databasePath },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", rejectRun);
    child.on("close", (code) => {
      if (code === 0) resolveRun(stdout);
      else rejectRun(new Error(`achievement test process exited ${code}\n${stderr}`));
    });
  });
}

test("five achievement routes unlock from isolated server progress and titles can only use earned badges", async () => {
  const root = await mkdtemp(join(tmpdir(), "guigu-achievement-test-"));
  try {
    const databasePath = join(root, "achievements.sqlite");
    const output = await run(`
      (async () => {
        const { readyRuntimeDatabase } = await import("./db/runtime-database.ts");
        const { getAchievementOverview, selectAchievementTitle } = await import("./db/achievements.ts");
        const database = await readyRuntimeDatabase();
        const userId = "student-alpha";
        const now = 1_800_000_000_000;
        for (let index = 0; index < 6; index += 1) {
          await database.run(
            "INSERT INTO chapter_answer_attempts (attempt_id, user_id, book_id, question_key, book_title, chapter_title, question, answer, correct, feedback, model_source, created_at) VALUES (?, ?, 'book', ?, '书', '章', '问题', '答案', 1, '很好', 'test', ?)",
            ["answer-" + index, userId, "question-" + index, now + index],
          );
        }
        for (let index = 0; index < 3; index += 1) {
          await database.run(
            "INSERT INTO user_mistakes (user_id, mistake_id, subject, question, wrong_answer, correction, cause, status, mistake_date, review_count, created_at, updated_at) VALUES (?, ?, '数学', '题目', '错', '对', '方法', 'mastered', '今天', 1, ?, ?)",
            [userId, "mistake-" + index, now, now],
          );
          await database.run(
            "INSERT INTO user_travel_records (user_id, record_id, destination_id, destination, travel_date, reward, photo, knowledge_facts_json, created_at) VALUES (?, ?, 'forest', '森林', '今天', '知识卡', '', '[]', ?)",
            [userId, "travel-" + index, now + index],
          );
          await database.run(
            "INSERT INTO user_minigame_progress (user_id, game_id, completed_at) VALUES (?, ?, ?)",
            [userId, ["fruit-catch", "turtle-courier", "weather-outfit"][index], now + index],
          );
        }
        for (let index = 0; index < 6; index += 1) {
          await database.run(
            "INSERT INTO user_exploration_learning (user_id, node_id, domain_id, state, review_streak, learned_at, next_review_at, last_reviewed_at, evidence_summary, updated_at) VALUES (?, ?, 'nature', 'learned', 0, ?, 0, 0, '证据', ?)",
            [userId, "node-" + index, now + index, now + index],
          );
        }
        const first = await getAchievementOverview(userId, now + 100);
        const selected = await selectAchievementTitle(userId, "level-brave");
        const repeated = await getAchievementOverview(userId, now + 200);
        const other = await getAchievementOverview("student-beta", now + 200);
        let lockedError = "";
        try { await selectAchievementTitle(userId, "park-champion"); } catch (error) { lockedError = error.message; }
        process.stdout.write(JSON.stringify({ first, selected, repeated, other, lockedError }));
      })();
    `, databasePath);
    const data = JSON.parse(output);
    assert.equal(data.first.totalAchievements, 20);
    assert.equal(data.first.totalUnlocked, 10);
    assert.equal(data.first.newlyUnlockedIds.length, 10);
    assert.equal(data.first.tracks.every((track) => track.unlocked === 2 && track.total === 4), true);
    assert.equal(data.first.metrics.readingAnswers, 6);
    assert.equal(data.first.metrics.mistakesMastered, 3);
    assert.equal(data.first.metrics.travelTrips, 3);
    assert.equal(data.first.metrics.gamesCompleted, 3);
    assert.equal(data.first.metrics.knowledgeLearned, 6);
    assert.equal(data.selected.selectedAchievementId, "level-brave");
    assert.equal(data.repeated.newlyUnlockedIds.length, 0);
    assert.equal(data.repeated.selectedAchievementId, "level-brave");
    assert.equal(data.other.totalUnlocked, 0);
    assert.equal(data.other.selectedAchievementId, null);
    assert.match(data.lockedError, /还没有解锁/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
