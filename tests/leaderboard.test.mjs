import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

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

test("weekly leaderboard applies each category's daily cap and never ranks disabled accounts", async () => {
  const root = await mkdtemp(join(tmpdir(), "guigu-leaderboard-test-"));
  try {
    const databasePath = join(root, "app.sqlite");
    const result = await run(tsx, ["-e", `
      process.env.APP_DATABASE_FILE = ${JSON.stringify(databasePath)};
      (async () => {
        const { readyRuntimeDatabase } = await import("./db/runtime-database.ts");
        const { getWeeklyLeaderboard } = await import("./db/leaderboard.ts");
        const database = await readyRuntimeDatabase();
        const now = Date.now();
        const users = [
          ["student-alpha", "安安"],
          ["student-beta", "贝贝"],
          ["student-gamma", "果果"],
          ["student-hidden", "隐藏账号"],
        ];
        for (const [id, username] of users) {
          await database.run("INSERT INTO app_users (id, username, password_hash, must_reset_password, created_at, updated_at) VALUES (?, ?, 'hash', 0, ?, ?)", [id, username, now, now]);
        }
        await database.run("INSERT INTO account_admin_state (account_type, account_id, status, last_login_at, updated_at) VALUES ('student', 'student-hidden', 'disabled', 0, ?)", [now]);

        for (let index = 0; index < 7; index += 1) {
          await database.run("INSERT INTO user_chat_messages (user_id, message_id, role, message_text, created_at, expires_at) VALUES ('student-alpha', ?, 'user', 'private chat', ?, ?)", [\`chat-\${index}\`, now, now + 86400000]);
        }
        await database.run("INSERT INTO user_activity_log (activity_id, user_id, activity, detail, happened_at) VALUES ('activity-1', 'student-alpha', '捉迷藏', 'private activity', ?)", [now]);
        await database.run("INSERT INTO user_chat_messages (user_id, message_id, role, message_text, created_at, expires_at) VALUES ('student-alpha', 'stale', 'user', 'old private chat', ?, ?)", [now - 9 * 86400000, now]);

        for (let index = 0; index < 6; index += 1) {
          const questionKey = index === 5 ? 'question-0' : \`question-\${index}\`;
          await database.run("INSERT INTO chapter_answer_attempts (attempt_id, user_id, book_id, question_key, book_title, chapter_title, question, answer, correct, feedback, model_source, created_at) VALUES (?, 'student-alpha', 'book', ?, '秘密书名', '第一章', 'private question', 'private answer', 1, 'private feedback', 'test', ?)", [\`attempt-\${index}\`, questionKey, now]);
        }
        for (let index = 0; index < 3; index += 1) {
          await database.run("INSERT INTO user_travel_records (user_id, record_id, destination_id, destination, travel_date, reward, photo, knowledge_facts_json, created_at) VALUES ('student-alpha', ?, 'forest', '森林', '今天', 'private reward', '', '[]', ?)", [\`travel-\${index}\`, now]);
        }
        for (let index = 0; index < 4; index += 1) {
          await database.run("INSERT INTO user_mistakes (user_id, mistake_id, subject, question, wrong_answer, correction, cause, status, mistake_date, review_count, created_at, updated_at) VALUES ('student-alpha', ?, '数学', 'private mistake', 'x', 'y', 'cause', 'new', '今天', 0, ?, ?)", [\`mistake-\${index}\`, now, now]);
        }

        for (let index = 0; index < 2; index += 1) {
          await database.run("INSERT INTO user_chat_messages (user_id, message_id, role, message_text, created_at, expires_at) VALUES ('student-beta', ?, 'user', 'private chat', ?, ?)", [\`beta-chat-\${index}\`, now, now + 86400000]);
        }
        for (let index = 0; index < 3; index += 1) {
          await database.run("INSERT INTO chapter_answer_attempts (attempt_id, user_id, book_id, question_key, book_title, chapter_title, question, answer, correct, feedback, model_source, created_at) VALUES (?, 'student-beta', 'book', ?, '书', '章', 'private question', 'private answer', 1, 'private feedback', 'test', ?)", [\`beta-attempt-\${index}\`, \`beta-question-\${index}\`, now]);
        }
        await database.run("INSERT INTO user_travel_records (user_id, record_id, destination_id, destination, travel_date, reward, photo, knowledge_facts_json, created_at) VALUES ('student-gamma', 'gamma-travel', 'sea', '海边', '今天', 'private reward', '', '[]', ?)", [now]);
        for (let index = 0; index < 8; index += 1) {
          await database.run("INSERT INTO user_chat_messages (user_id, message_id, role, message_text, created_at, expires_at) VALUES ('student-hidden', ?, 'user', 'private chat', ?, ?)", [\`hidden-chat-\${index}\`, now, now + 86400000]);
        }

        const leaderboard = await getWeeklyLeaderboard('student-alpha', now);
        process.stdout.write(JSON.stringify(leaderboard));
      })();
    `]);
    const leaderboard = JSON.parse(result.stdout);
    assert.equal(leaderboard.me.name, "安安");
    assert.equal(leaderboard.me.rank, 1);
    assert.equal(leaderboard.me.points, 25);
    assert.deepEqual(leaderboard.me.breakdown, { interaction: 5, reading: 8, travel: 6, mistake: 6 });
    assert.deepEqual(leaderboard.top.map((entry) => [entry.name, entry.points]), [["安安", 25], ["贝贝", 8], ["果果", 3]]);
    assert.equal(leaderboard.participantCount, 3);
    assert.doesNotMatch(JSON.stringify(leaderboard), /private chat|private question|private answer|private mistake|隐藏账号/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
