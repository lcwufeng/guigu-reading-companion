import { isMiniGameId, MINI_GAME_ORDER } from "../lib/minigame-config";
import { completeDailyTask } from "./daily-tasks";
import { miniGameScoreStatement } from "./minigame-leaderboard";
import { applyRewardChanges, getRewardBalances } from "./reward-wallet";
import { readyRuntimeDatabase } from "./runtime-database";

function chinaDayKey(now = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(now));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function completedGames(userId: string) {
  const database = await readyRuntimeDatabase();
  if (!database) return [];
  const rows = await database.all<{ game_id: string }>(
    "SELECT game_id FROM user_minigame_progress WHERE user_id = ? ORDER BY completed_at ASC",
    [userId],
  );
  return rows.map((row) => row.game_id).filter(isMiniGameId);
}

export async function startMiniGame(userId: string, gameId: unknown) {
  if (!isMiniGameId(gameId)) throw new Error("小游戏不存在");
  const database = await readyRuntimeDatabase();
  if (!database) throw new Error("小游戏进度暂时不可用");
  const index = MINI_GAME_ORDER.indexOf(gameId);
  if (index > 0) {
    const prior = await database.first(
      "SELECT 1 AS ok FROM user_minigame_progress WHERE user_id = ? AND game_id = ?",
      [userId, MINI_GAME_ORDER[index - 1]],
    );
    if (!prior) throw new Error("请先通关前一个小游戏");
  }
  const before = await getRewardBalances(database, userId);
  if (before.playTickets < 1) throw new Error("游玩票不足");
  const runId = crypto.randomUUID();
  const reward = await applyRewardChanges({
    userId,
    changes: { play_tickets: -1 },
    sourceType: "minigame-start",
    sourceId: runId,
  });
  if (!reward.applied || reward.balances.playTickets !== before.playTickets - 1) {
    throw new Error("游玩票没有扣除，请重试");
  }
  const now = Date.now();
  await database.batch([{
    sql: `INSERT INTO user_minigame_runs
      (run_id, user_id, game_id, started_at, expires_at, completed_at)
      VALUES (?, ?, ?, ?, ?, NULL)`,
    params: [runId, userId, gameId, now, now + 2 * 60 * 60_000],
  }, {
    sql: "DELETE FROM user_minigame_runs WHERE expires_at <= ?",
    params: [now - 24 * 60 * 60_000],
  }]);
  return { runId, gameId, balances: reward.balances };
}

export async function completeMiniGame(input: {
  userId: string;
  runId: unknown;
  gameId: unknown;
  score?: unknown;
  caught?: unknown;
  secondaryScore?: unknown;
}) {
  if (!isMiniGameId(input.gameId)) throw new Error("小游戏不存在");
  const runId = typeof input.runId === "string" ? input.runId.trim() : "";
  if (!/^[0-9a-f-]{36}$/.test(runId)) throw new Error("本局游戏记录无效");
  const database = await readyRuntimeDatabase();
  if (!database) throw new Error("小游戏进度暂时不可用");
  const now = Date.now();
  const run = await database.first<{ completed_at: number | null; expires_at: number; started_at: number }>(
    "SELECT completed_at, expires_at, started_at FROM user_minigame_runs WHERE run_id = ? AND user_id = ? AND game_id = ?",
    [runId, input.userId, input.gameId],
  );
  if (!run) throw new Error("没有找到本局游戏记录");
  if (run.expires_at <= now) throw new Error("本局游戏已经超时，请重新开始");
  if (run.completed_at) {
    return {
      alreadyCompleted: true,
      balances: await getRewardBalances(database, input.userId),
      completedGames: await completedGames(input.userId),
    };
  }

  let fruitCatchDaily: {
    dateKey: string;
    plays: number;
    rewarded: boolean;
    bestScore: number;
    totalCaught: number;
  } | undefined;
  let success = true;
  if (input.gameId === "fruit-catch") {
    const dateKey = chinaDayKey(now);
    const score = Math.max(0, Math.min(200, Math.trunc(Number(input.score) || 0)));
    const caught = Math.max(0, Math.min(200, Math.trunc(Number(input.caught) || 0)));
    success = score >= 12;
    await database.run(
      `INSERT OR IGNORE INTO user_minigame_daily
        (user_id, date_key, game_id, plays, best_score, total_caught, reward_claimed, updated_at)
        VALUES (?, ?, 'fruit-catch', 0, 0, 0, 0, ?)`,
      [input.userId, dateKey, now],
    );
    const prior = await database.first<{ plays: number; best_score: number; total_caught: number; reward_claimed: number }>(
      "SELECT plays, best_score, total_caught, reward_claimed FROM user_minigame_daily WHERE user_id = ? AND date_key = ? AND game_id = 'fruit-catch'",
      [input.userId, dateKey],
    );
    const firstReward = success && !prior?.reward_claimed;
    await database.run(
      `UPDATE user_minigame_daily SET plays = ?, best_score = ?, total_caught = ?,
        reward_claimed = ?, updated_at = ? WHERE user_id = ? AND date_key = ? AND game_id = 'fruit-catch'`,
      [
        (prior?.plays || 0) + 1,
        Math.max(prior?.best_score || 0, score),
        (prior?.total_caught || 0) + caught,
        prior?.reward_claimed || success ? 1 : 0,
        now,
        input.userId,
        dateKey,
      ],
    );
    if (firstReward) {
      await applyRewardChanges({
        userId: input.userId,
        changes: { stars: 1 },
        sourceType: "fruit-catch-daily",
        sourceId: dateKey,
      });
    }
    fruitCatchDaily = {
      dateKey,
      plays: (prior?.plays || 0) + 1,
      rewarded: Boolean(prior?.reward_claimed || success),
      bestScore: Math.max(prior?.best_score || 0, score),
      totalCaught: (prior?.total_caught || 0) + caught,
    };
  }

  await database.batch([{
    sql: "UPDATE user_minigame_runs SET completed_at = ? WHERE run_id = ? AND user_id = ? AND completed_at IS NULL",
    params: [now, runId, input.userId],
  }, ...(success ? [{
    sql: "INSERT OR IGNORE INTO user_minigame_progress (user_id, game_id, completed_at) VALUES (?, ?, ?)",
    params: [input.userId, input.gameId, now],
  }, miniGameScoreStatement({
    userId: input.userId,
    gameId: input.gameId,
    startedAt: run.started_at,
    completedAt: now,
    score: input.score,
    secondaryScore: input.secondaryScore,
  })] : [])]);
  const daily = success ? await completeDailyTask(input.userId, "games", now) : null;
  return {
    alreadyCompleted: false,
    success,
    balances: daily?.balances || await getRewardBalances(database, input.userId),
    dailyPlan: daily?.dailyPlan,
    dailyRewardedNow: daily?.dailyRewardedNow || false,
    completedGames: await completedGames(input.userId),
    fruitCatchDaily,
  };
}
