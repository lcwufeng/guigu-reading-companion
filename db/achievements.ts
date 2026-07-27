import {
  achievementById,
  achievementCatalog,
  achievementTracks,
  type AchievementMetricKey,
} from "../lib/achievement-catalog";
import { readyRuntimeDatabase, type RuntimeDatabase } from "./runtime-database";

export type AchievementMetrics = Record<AchievementMetricKey, number>;

export type AchievementOverview = {
  achievements: Array<{
    id: string;
    unlockedAt: number | null;
    current: number;
  }>;
  metrics: AchievementMetrics;
  selectedAchievementId: string | null;
  newlyUnlockedIds: string[];
  totalUnlocked: number;
  totalAchievements: number;
  tracks: Array<{
    id: string;
    unlocked: number;
    total: number;
  }>;
};

async function achievementMetrics(database: RuntimeDatabase, userId: string): Promise<AchievementMetrics> {
  const [
    reading,
    completedBooks,
    mistakes,
    travel,
    games,
    knowledge,
  ] = await Promise.all([
    database.first<{ count: number }>(`SELECT COUNT(DISTINCT COALESCE(question_key, attempt_id)) AS count
      FROM chapter_answer_attempts WHERE user_id = ? AND correct = 1`, [userId]),
    database.first<{ count: number }>(`SELECT COUNT(*) AS count FROM user_reading_metrics
      WHERE user_id = ? AND completed_at IS NOT NULL`, [userId]),
    database.first<{ added: number; mastered: number }>(`SELECT COUNT(*) AS added,
      COALESCE(SUM(CASE WHEN status = 'mastered' THEN 1 ELSE 0 END), 0) AS mastered
      FROM user_mistakes WHERE user_id = ?`, [userId]),
    database.first<{ count: number }>("SELECT COUNT(*) AS count FROM user_travel_records WHERE user_id = ?", [userId]),
    database.first<{ count: number }>("SELECT COUNT(*) AS count FROM user_minigame_progress WHERE user_id = ?", [userId]),
    database.first<{ count: number }>("SELECT COUNT(*) AS count FROM user_exploration_learning WHERE user_id = ?", [userId]),
  ]);
  return {
    readingAnswers: Math.max(0, Number(reading?.count) || 0),
    completedBooks: Math.max(0, Number(completedBooks?.count) || 0),
    mistakesAdded: Math.max(0, Number(mistakes?.added) || 0),
    mistakesMastered: Math.max(0, Number(mistakes?.mastered) || 0),
    travelTrips: Math.max(0, Number(travel?.count) || 0),
    gamesCompleted: Math.max(0, Number(games?.count) || 0),
    knowledgeLearned: Math.max(0, Number(knowledge?.count) || 0),
  };
}

async function synchronizeAchievements(database: RuntimeDatabase, userId: string, metrics: AchievementMetrics, now: number) {
  const unlockedBefore = await database.all<{ achievement_id: string; unlocked_at: number }>(
    "SELECT achievement_id, unlocked_at FROM user_achievements WHERE user_id = ?",
    [userId],
  );
  const before = new Set(unlockedBefore.map((row) => row.achievement_id));
  const earned = achievementCatalog.filter((achievement) => metrics[achievement.metricKey] >= achievement.target);
  await database.batch(earned.map((achievement) => ({
    sql: "INSERT OR IGNORE INTO user_achievements (user_id, achievement_id, unlocked_at) VALUES (?, ?, ?)",
    params: [userId, achievement.id, now],
  })));
  const unlocked = await database.all<{ achievement_id: string; unlocked_at: number }>(
    "SELECT achievement_id, unlocked_at FROM user_achievements WHERE user_id = ? ORDER BY unlocked_at ASC",
    [userId],
  );
  const unlockedIds = new Set(unlocked.map((row) => row.achievement_id));
  const profile = await database.first<{ selected_achievement_id: string | null }>(
    "SELECT selected_achievement_id FROM user_title_profile WHERE user_id = ?",
    [userId],
  );
  let selectedAchievementId = profile?.selected_achievement_id || null;
  if (!selectedAchievementId || !unlockedIds.has(selectedAchievementId)) {
    selectedAchievementId = [...achievementCatalog].reverse().find((achievement) => unlockedIds.has(achievement.id))?.id || null;
    await database.run(
      `INSERT INTO user_title_profile (user_id, selected_achievement_id, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET selected_achievement_id = excluded.selected_achievement_id,
        updated_at = excluded.updated_at`,
      [userId, selectedAchievementId, now],
    );
  }
  return {
    selectedAchievementId,
    unlocked,
    newlyUnlockedIds: unlocked.filter((row) => !before.has(row.achievement_id)).map((row) => row.achievement_id),
  };
}

export async function getAchievementOverview(userId: string, now = Date.now()): Promise<AchievementOverview> {
  const database = await readyRuntimeDatabase();
  if (!database) throw new Error("称号进度暂时不可用");
  const metrics = await achievementMetrics(database, userId);
  const synchronized = await synchronizeAchievements(database, userId, metrics, now);
  const unlockedAt = new Map(synchronized.unlocked.map((row) => [row.achievement_id, row.unlocked_at]));
  return {
    achievements: achievementCatalog.map((achievement) => ({
      id: achievement.id,
      unlockedAt: unlockedAt.get(achievement.id) || null,
      current: metrics[achievement.metricKey],
    })),
    metrics,
    selectedAchievementId: synchronized.selectedAchievementId,
    newlyUnlockedIds: synchronized.newlyUnlockedIds,
    totalUnlocked: synchronized.unlocked.length,
    totalAchievements: achievementCatalog.length,
    tracks: achievementTracks.map((track) => ({
      id: track.id,
      unlocked: achievementCatalog.filter((achievement) =>
        achievement.trackId === track.id && unlockedAt.has(achievement.id)).length,
      total: achievementCatalog.filter((achievement) => achievement.trackId === track.id).length,
    })),
  };
}

export async function selectAchievementTitle(userId: string, achievementId: unknown) {
  const id = typeof achievementId === "string" ? achievementId.trim() : "";
  if (!achievementById.has(id)) throw new Error("这个称号不存在");
  const database = await readyRuntimeDatabase();
  if (!database) throw new Error("称号进度暂时不可用");
  const unlocked = await database.first(
    "SELECT 1 AS ok FROM user_achievements WHERE user_id = ? AND achievement_id = ?",
    [userId, id],
  );
  if (!unlocked) throw new Error("这个称号还没有解锁");
  await database.run(
    `INSERT INTO user_title_profile (user_id, selected_achievement_id, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET selected_achievement_id = excluded.selected_achievement_id,
      updated_at = excluded.updated_at`,
    [userId, id, Date.now()],
  );
  return getAchievementOverview(userId);
}
