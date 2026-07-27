import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import test from "node:test";

const root = join(tmpdir(), `guigu-security-tests-${process.pid}-${Date.now()}`);
const databasePath = join(root, "security.sqlite");
const tsx = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));

function runScript(source) {
  return new Promise((resolve, reject) => {
    const child = spawn(tsx, ["-e", source], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: {
        ...process.env,
        NODE_ENV: "production",
        APP_DATABASE_FILE: databasePath,
        SEED_INITIAL_STUDENT_ACCOUNTS: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`security test process exited ${code}\n${stderr}`));
    });
  });
}

test("rewards, minigame tickets, rate limits, and production seed accounts stay server-authoritative", async () => {
  await mkdir(root, { recursive: true });
  try {
    const output = await runScript(`
      (async () => {
        const { applyRewardChanges, claimReadingReward } = await import("./db/reward-wallet.ts");
        const { startMiniGame } = await import("./db/minigame-progress.ts");
        const { saveUserState, getUserState } = await import("./db/user-state.ts");
        const { consumeRateLimit, clearRateLimit } = await import("./db/rate-limit.ts");
        const { authenticateUser } = await import("./db/auth.ts");
        const { readyRuntimeDatabase } = await import("./db/runtime-database.ts");
        const userId = "security-student";

        await applyRewardChanges({
          userId,
          changes: { play_tickets: 1 },
          sourceType: "test-seed",
          sourceId: "one-ticket",
        });
        const starts = await Promise.allSettled([
          startMiniGame(userId, "fruit-catch"),
          startMiniGame(userId, "fruit-catch"),
        ]);
        const rewards = await Promise.all([
          claimReadingReward(userId, "chapter:scarecrow-zh:稻草人"),
          claimReadingReward(userId, "chapter:scarecrow-zh:稻草人"),
        ]);
        await saveUserState(userId, {
          name: "安全测试龟",
          stars: 9999,
          tickets: 9999,
          playTickets: 9999,
          lastSeen: Date.now(),
        }, Date.now() + 100);
        const state = await getUserState(userId);
        const database = await readyRuntimeDatabase();
        const runCount = await database.first("SELECT COUNT(*) AS count FROM user_minigame_runs WHERE user_id = ?", [userId]);
        const rewardCount = await database.first("SELECT COUNT(*) AS count FROM user_reading_rewards WHERE user_id = ?", [userId]);
        const firstLimit = await consumeRateLimit({ scope: "test", identity: userId, limit: 2, windowMs: 60_000 });
        const secondLimit = await consumeRateLimit({ scope: "test", identity: userId, limit: 2, windowMs: 60_000 });
        const thirdLimit = await consumeRateLimit({ scope: "test", identity: userId, limit: 2, windowMs: 60_000 });
        await clearRateLimit("test", userId);
        const afterClear = await consumeRateLimit({ scope: "test", identity: userId, limit: 2, windowMs: 60_000 });
        const seededAccount = await authenticateUser("同学一", "123456");
        process.stdout.write(JSON.stringify({
          successfulStarts: starts.filter((item) => item.status === "fulfilled").length,
          failedStarts: starts.filter((item) => item.status === "rejected").length,
          runCount: runCount.count,
          rewardCount: rewardCount.count,
          rewardClaims: rewards.map((reward) => reward.alreadyClaimed),
          balances: {
            stars: state.stars,
            tickets: state.tickets,
            playTickets: state.playTickets,
          },
          limits: [firstLimit.limited, secondLimit.limited, thirdLimit.limited, afterClear.limited],
          seededAccount: Boolean(seededAccount),
        }));
      })();
    `);
    const result = JSON.parse(output);
    assert.equal(result.successfulStarts, 1);
    assert.equal(result.failedStarts, 1);
    assert.equal(result.runCount, 1);
    assert.equal(result.rewardCount, 1);
    assert.deepEqual(result.rewardClaims.sort(), [false, true]);
    assert.equal(result.balances.stars + result.balances.tickets + result.balances.playTickets, 16);
    assert.ok(result.balances.stars <= 13);
    assert.ok(result.balances.tickets <= 4);
    assert.ok(result.balances.playTickets <= 1);
    assert.deepEqual(result.limits, [false, false, true, false]);
    assert.equal(result.seededAccount, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
