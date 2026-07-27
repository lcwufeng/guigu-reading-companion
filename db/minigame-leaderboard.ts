import {
  MINI_GAME_ORDER,
  MINI_GAME_RANKING_RULES,
  type MiniGameId,
} from "../lib/minigame-config";
import { readyRuntimeDatabase, type SqlStatement } from "./runtime-database";

type MiniGameScoreRow = {
  user_id: string;
  username: string;
  game_id: string;
  primary_value: number;
  secondary_value: number;
  duration_ms: number;
  achieved_at: number;
};

export type MiniGameLeaderboardEntry = {
  rank: number;
  name: string;
  primaryValue: number;
  secondaryValue: number;
  durationMs: number;
  displayValue: string;
  secondaryDisplay: string | null;
};

export type MiniGameLeaderboard = {
  gameId: MiniGameId;
  rule: typeof MINI_GAME_RANKING_RULES[MiniGameId];
  entries: MiniGameLeaderboardEntry[];
  me: MiniGameLeaderboardEntry | null;
  participantCount: number;
};

function safeInteger(value: unknown, max = 500) {
  return Math.max(0, Math.min(max, Math.trunc(Number(value) || 0)));
}

function formatDuration(durationMs: number) {
  const totalTenths = Math.max(0, Math.round(durationMs / 100));
  const minutes = Math.floor(totalTenths / 600);
  const seconds = (totalTenths % 600) / 10;
  return minutes > 0
    ? `${minutes}分${seconds.toFixed(1).padStart(4, "0")}秒`
    : `${seconds.toFixed(1)}秒`;
}

function formatPrimary(gameId: MiniGameId, primaryValue: number, durationMs: number) {
  return MINI_GAME_RANKING_RULES[gameId].metric === "time"
    ? formatDuration(durationMs)
    : `${primaryValue}分`;
}

function formatSecondary(gameId: MiniGameId, secondaryValue: number) {
  if (gameId === "fruit-catch") return `最高连击 ${secondaryValue}`;
  if (gameId === "turtle-sky") return `碰云 ${secondaryValue} 次`;
  return null;
}

function compareRows(gameId: MiniGameId, first: MiniGameScoreRow, second: MiniGameScoreRow) {
  const rule = MINI_GAME_RANKING_RULES[gameId];
  const primary = rule.metric === "time"
    ? first.primary_value - second.primary_value
    : second.primary_value - first.primary_value;
  if (primary !== 0) return primary;
  if (rule.secondaryDirection === "desc" && first.secondary_value !== second.secondary_value) {
    return second.secondary_value - first.secondary_value;
  }
  if (rule.secondaryDirection === "asc" && first.secondary_value !== second.secondary_value) {
    return first.secondary_value - second.secondary_value;
  }
  return first.achieved_at - second.achieved_at || first.username.localeCompare(second.username, "zh-Hans-CN");
}

function sameRankValue(gameId: MiniGameId, first: MiniGameScoreRow, second: MiniGameScoreRow) {
  const rule = MINI_GAME_RANKING_RULES[gameId];
  return first.primary_value === second.primary_value
    && (rule.secondaryDirection === null || first.secondary_value === second.secondary_value);
}

function publicEntry(entry: MiniGameLeaderboardEntry & { userId: string }): MiniGameLeaderboardEntry {
  return {
    rank: entry.rank,
    name: entry.name,
    primaryValue: entry.primaryValue,
    secondaryValue: entry.secondaryValue,
    durationMs: entry.durationMs,
    displayValue: entry.displayValue,
    secondaryDisplay: entry.secondaryDisplay,
  };
}

export function miniGameScoreStatement(input: {
  userId: string;
  gameId: MiniGameId;
  startedAt: number;
  completedAt: number;
  score?: unknown;
  secondaryScore?: unknown;
}): SqlStatement {
  const rule = MINI_GAME_RANKING_RULES[input.gameId];
  const durationMs = Math.max(1_000, Math.min(2 * 60 * 60_000, input.completedAt - input.startedAt));
  const primaryValue = rule.metric === "time" ? durationMs : safeInteger(input.score);
  const secondaryValue = rule.secondaryDirection ? safeInteger(input.secondaryScore) : 0;
  const betterCondition = rule.metric === "time"
    ? "excluded.primary_value < user_minigame_scores.primary_value"
    : rule.secondaryDirection === "desc"
      ? `(excluded.primary_value > user_minigame_scores.primary_value
        OR (excluded.primary_value = user_minigame_scores.primary_value
          AND excluded.secondary_value > user_minigame_scores.secondary_value))`
      : `(excluded.primary_value > user_minigame_scores.primary_value
        OR (excluded.primary_value = user_minigame_scores.primary_value
          AND excluded.secondary_value < user_minigame_scores.secondary_value))`;

  return {
    sql: `INSERT INTO user_minigame_scores
      (user_id, game_id, primary_value, secondary_value, duration_ms, achieved_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, game_id) DO UPDATE SET
        primary_value = excluded.primary_value,
        secondary_value = excluded.secondary_value,
        duration_ms = excluded.duration_ms,
        achieved_at = excluded.achieved_at,
        updated_at = excluded.updated_at
      WHERE ${betterCondition}`,
    params: [
      input.userId,
      input.gameId,
      primaryValue,
      secondaryValue,
      durationMs,
      input.completedAt,
      input.completedAt,
    ],
  };
}

export async function getMiniGameLeaderboards(currentUserId: string) {
  const database = await readyRuntimeDatabase();
  if (!database) return null;
  const rows = await database.all<MiniGameScoreRow>(`SELECT
      scores.user_id,
      users.username,
      scores.game_id,
      scores.primary_value,
      scores.secondary_value,
      scores.duration_ms,
      scores.achieved_at
    FROM user_minigame_scores scores
    INNER JOIN app_users users ON users.id = scores.user_id
    LEFT JOIN account_admin_state admin_state
      ON admin_state.account_type = 'student' AND admin_state.account_id = users.id
    WHERE COALESCE(admin_state.status, 'active') = 'active'`);

  const leaderboards = Object.fromEntries(MINI_GAME_ORDER.map((gameId) => {
    const rankedRows = rows
      .filter((row) => row.game_id === gameId)
      .sort((first, second) => compareRows(gameId, first, second));
    let prior: MiniGameScoreRow | null = null;
    let priorRank = 0;
    const entriesWithIds = rankedRows.map((row, index) => {
      const rank = prior && sameRankValue(gameId, prior, row) ? priorRank : index + 1;
      prior = row;
      priorRank = rank;
      return {
        userId: row.user_id,
        rank,
        name: row.username,
        primaryValue: row.primary_value,
        secondaryValue: row.secondary_value,
        durationMs: row.duration_ms,
        displayValue: formatPrimary(gameId, row.primary_value, row.duration_ms),
        secondaryDisplay: formatSecondary(gameId, row.secondary_value),
      };
    });
    const current = entriesWithIds.find((entry) => entry.userId === currentUserId) || null;
    return [gameId, {
      gameId,
      rule: MINI_GAME_RANKING_RULES[gameId],
      entries: entriesWithIds.map(publicEntry),
      me: current ? publicEntry(current) : null,
      participantCount: entriesWithIds.length,
    } satisfies MiniGameLeaderboard];
  }));

  return leaderboards as Record<MiniGameId, MiniGameLeaderboard>;
}
