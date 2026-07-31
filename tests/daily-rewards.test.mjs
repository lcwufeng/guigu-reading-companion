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
      env: { ...process.env, APP_DATABASE_FILE: databasePath, SEED_INITIAL_STUDENT_ACCOUNTS: "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", rejectRun);
    child.on("close", (code) => {
      if (code === 0) resolveRun(stdout);
      else rejectRun(new Error(`daily reward test exited ${code}\n${stderr}`));
    });
  });
}

test("daily tasks are stable, isolated, and award the new server-side ticket rules once", async () => {
  const root = await mkdtemp(join(tmpdir(), "guigu-daily-rewards-"));
  try {
    const output = await run(`
      (async () => {
        const { DAILY_TASK_KEYS, completeDailyTask, getDailyState } = await import("./db/daily-tasks.ts");
        const { claimInteractionBonus, claimReadingReward } = await import("./db/reward-wallet.ts");
        const now = 1_800_000_000_000;
        const userA = "daily-student-a";
        const userB = "daily-student-b";
        const first = await getDailyState(userA, now);
        const repeated = await getDailyState(userA, now);
        const isolated = await getDailyState(userB, now);
        let completed = first;
        for (const task of first.dailyPlan.taskKeys) completed = await completeDailyTask(userA, task, now);
        const afterFirstCompletion = completed.balances;
        for (const task of first.dailyPlan.taskKeys) completed = await completeDailyTask(userA, task, now);
        const afterRepeat = completed.balances;
        const beforeReading = afterRepeat.tickets + afterRepeat.playTickets;
        const reading = await claimReadingReward(userA, "book:chapter:one");
        const repeatedReading = await claimReadingReward(userA, "book:chapter:one");
        let interaction = null;
        let interactionSource = "";
        for (let index = 0; index < 200 && !interaction?.awarded; index += 1) {
          interactionSource = "interaction-" + index;
          interaction = await claimInteractionBonus({ userId: userA, interaction: "feed", sourceId: interactionSource });
        }
        const repeatedInteraction = await claimInteractionBonus({
          userId: userA,
          interaction: "feed",
          sourceId: interactionSource,
        });
        process.stdout.write(JSON.stringify({
          validKeys: first.dailyPlan.taskKeys.every((task) => DAILY_TASK_KEYS.includes(task)),
          uniqueCount: new Set(first.dailyPlan.taskKeys).size,
          stable: JSON.stringify(first.dailyPlan.taskKeys) === JSON.stringify(repeated.dailyPlan.taskKeys),
          isolatedTaskCount: isolated.dailyPlan.taskKeys.length,
          dailyRewardClaimed: completed.dailyPlan.rewardClaimed,
          dailyPlayTickets: afterFirstCompletion.playTickets,
          repeatedDailyPlayTickets: afterRepeat.playTickets,
          readingAmount: reading.balances.tickets + reading.balances.playTickets - beforeReading,
          readingResource: reading.resource,
          repeatedReadingClaimed: repeatedReading.alreadyClaimed,
          interactionAwarded: interaction?.awarded || false,
          interactionResource: interaction?.resource || null,
          repeatedInteractionAwarded: repeatedInteraction.awarded,
          isolatedPlayTickets: isolated.balances.playTickets,
        }));
      })();
    `, join(root, "app.sqlite"));
    const result = JSON.parse(output);
    assert.equal(result.validKeys, true);
    assert.equal(result.uniqueCount, 4);
    assert.equal(result.stable, true);
    assert.equal(result.isolatedTaskCount, 4);
    assert.equal(result.dailyRewardClaimed, true);
    assert.equal(result.dailyPlayTickets, 3);
    assert.equal(result.repeatedDailyPlayTickets, 3);
    assert.equal(result.readingAmount, 2);
    assert.ok(["tickets", "play_tickets"].includes(result.readingResource));
    assert.equal(result.repeatedReadingClaimed, true);
    assert.equal(result.interactionAwarded, true);
    assert.ok(["tickets", "play_tickets"].includes(result.interactionResource));
    assert.equal(result.repeatedInteractionAwarded, false);
    assert.equal(result.isolatedPlayTickets, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
