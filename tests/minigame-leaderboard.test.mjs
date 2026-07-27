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
      else rejectRun(new Error(`minigame leaderboard test exited ${code}\n${stdout}\n${stderr}`));
    });
  });
}

test("each minigame keeps the best result, applies its own ranking rule, and hides disabled accounts", async () => {
  const root = await mkdtemp(join(tmpdir(), "guigu-minigame-rank-test-"));
  try {
    const databasePath = join(root, "rankings.sqlite");
    const output = await run(`
      (async () => {
        const { readyRuntimeDatabase } = await import("./db/runtime-database.ts");
        const { getMiniGameLeaderboards, miniGameScoreStatement } = await import("./db/minigame-leaderboard.ts");
        const database = await readyRuntimeDatabase();
        const now = 1800000000000;
        for (const [id, username] of [["a", "安安"], ["b", "贝贝"], ["c", "果果"], ["hidden", "隐藏账号"]]) {
          await database.run(
            "INSERT INTO app_users (id, username, password_hash, must_reset_password, created_at, updated_at) VALUES (?, ?, 'hash', 0, ?, ?)",
            [id, username, now, now],
          );
        }
        await database.run(
          "INSERT INTO account_admin_state (account_type, account_id, status, last_login_at, updated_at) VALUES ('student', 'hidden', 'disabled', 0, ?)",
          [now],
        );
        const record = async (userId, gameId, durationMs, score = 0, secondaryScore = 0, offset = 0) => {
          const statement = miniGameScoreStatement({
            userId,
            gameId,
            startedAt: now,
            completedAt: now + durationMs,
            score,
            secondaryScore,
          });
          statement.params[5] += offset;
          statement.params[6] += offset;
          await database.run(statement.sql, statement.params);
        };

        await record("a", "fruit-catch", 30000, 20, 3);
        await record("a", "fruit-catch", 30000, 18, 10, 1);
        await record("a", "fruit-catch", 30000, 20, 6, 2);
        await record("b", "fruit-catch", 30000, 20, 4);
        await record("hidden", "fruit-catch", 30000, 99, 99);
        await record("a", "turtle-courier", 50000);
        await record("a", "turtle-courier", 70000, 0, 0, 1);
        await record("b", "turtle-courier", 30000);
        await record("a", "turtle-sky", 60000, 30, 2);
        await record("b", "turtle-sky", 60000, 30, 1);

        process.stdout.write(JSON.stringify(await getMiniGameLeaderboards("a")));
      })();
    `, databasePath);
    const data = JSON.parse(output);

    assert.deepEqual(
      data["fruit-catch"].entries.map((entry) => [entry.rank, entry.name, entry.displayValue, entry.secondaryDisplay]),
      [[1, "安安", "20分", "最高连击 6"], [2, "贝贝", "20分", "最高连击 4"]],
    );
    assert.equal(data["fruit-catch"].me.rank, 1);
    assert.equal(data["fruit-catch"].participantCount, 2);
    assert.deepEqual(
      data["turtle-courier"].entries.map((entry) => [entry.name, entry.displayValue]),
      [["贝贝", "30.0秒"], ["安安", "50.0秒"]],
    );
    assert.deepEqual(
      data["turtle-sky"].entries.map((entry) => [entry.name, entry.secondaryDisplay]),
      [["贝贝", "碰云 1 次"], ["安安", "碰云 2 次"]],
    );
    assert.equal(data["weather-outfit"].me, null);
    assert.doesNotMatch(JSON.stringify(data), /隐藏账号|"userId"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
