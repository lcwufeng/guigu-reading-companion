import { readyRuntimeDatabase } from "./runtime-database";

export type LeaderboardCategoryKey = "interaction" | "reading" | "travel" | "mistake";

export type LeaderboardCategory = {
  key: LeaderboardCategoryKey;
  label: string;
  pointPerEvent: number;
  dailyCap: number;
  dailyMaxPoints: number;
};

export type LeaderboardEntry = {
  rank: number;
  name: string;
  points: number;
};

export type WeeklyLeaderboard = {
  weekLabel: string;
  top: LeaderboardEntry[];
  me: LeaderboardEntry & { breakdown: Record<LeaderboardCategoryKey, number> };
  participantCount: number;
  categories: LeaderboardCategory[];
};

const timeZone = "Asia/Shanghai";

const leaderboardCategories: LeaderboardCategory[] = [
  { key: "interaction", label: "和龟龟互动", pointPerEvent: 1, dailyCap: 5, dailyMaxPoints: 5 },
  { key: "reading", label: "伴读答对", pointPerEvent: 2, dailyCap: 4, dailyMaxPoints: 8 },
  { key: "travel", label: "旅行战利品", pointPerEvent: 3, dailyCap: 2, dailyMaxPoints: 6 },
  { key: "mistake", label: "上传错题", pointPerEvent: 2, dailyCap: 3, dailyMaxPoints: 6 },
];

type CategoryBuckets = Map<string, Map<string, Set<string>>>;

function dateParts(timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(value.year), month: Number(value.month), day: Number(value.day) };
}

function chinaDateKey(timestamp: number) {
  const { year, month, day } = dateParts(timestamp);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function chinaWeekStart(timestamp: number) {
  const { year, month, day } = dateParts(timestamp);
  const utcDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const daysSinceMonday = (utcDay + 6) % 7;
  const monday = new Date(Date.UTC(year, month - 1, day - daysSinceMonday));
  const key = monday.toISOString().slice(0, 10);
  return Date.parse(`${key}T00:00:00+08:00`);
}

function weekLabel(startAt: number) {
  const endAt = startAt + 7 * 24 * 60 * 60 * 1000 - 1;
  const first = dateParts(startAt);
  const last = dateParts(endAt);
  return `${first.month}月${first.day}日—${last.month}月${last.day}日`;
}

function addBucket(bucket: CategoryBuckets, userId: string, timestamp: number, eventId: string) {
  if (!userId || !Number.isFinite(timestamp) || !eventId) return;
  const userDays = bucket.get(userId) || new Map<string, Set<string>>();
  const day = chinaDateKey(timestamp);
  const events = userDays.get(day) || new Set<string>();
  events.add(eventId);
  userDays.set(day, events);
  bucket.set(userId, userDays);
}

function categoryPoints(bucket: CategoryBuckets, userId: string, category: LeaderboardCategory) {
  return [...(bucket.get(userId)?.values() || [])]
    .reduce((total, events) => total + Math.min(category.dailyCap, events.size) * category.pointPerEvent, 0);
}

function emptyBreakdown(): Record<LeaderboardCategoryKey, number> {
  return { interaction: 0, reading: 0, travel: 0, mistake: 0 };
}

/**
 * Scores are derived from durable learning events. A child can only see the top
 * three names and their own breakdown; no reading text, chat messages, photos,
 * or mistake content ever leaves this module.
 */
export async function getWeeklyLeaderboard(currentUserId: string, now = Date.now()): Promise<WeeklyLeaderboard | null> {
  const database = await readyRuntimeDatabase();
  if (!database) return null;

  const weekStart = chinaWeekStart(now);
  const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000;
  const [students, chats, activities, answers, travels, mistakes] = await Promise.all([
    database.all<{ id: string; username: string }>(`SELECT u.id, u.username FROM app_users u
      LEFT JOIN account_admin_state a ON a.account_type = 'student' AND a.account_id = u.id
      WHERE COALESCE(a.status, 'active') = 'active' ORDER BY u.created_at ASC`),
    database.all<{ user_id: string; message_id: string; created_at: number }>(`SELECT user_id, message_id, created_at
      FROM user_chat_messages WHERE role = 'user' AND created_at >= ? AND created_at < ?`, [weekStart, weekEnd]),
    database.all<{ user_id: string; activity_id: string; happened_at: number }>(`SELECT user_id, activity_id, happened_at
      FROM user_activity_log WHERE activity IN ('摘果喂食', '游泳', '休息', '捉迷藏') AND happened_at >= ? AND happened_at < ?`, [weekStart, weekEnd]),
    database.all<{ user_id: string; attempt_id: string; question_key: string | null; created_at: number }>(`SELECT user_id, attempt_id, question_key, created_at
      FROM chapter_answer_attempts WHERE correct = 1 AND created_at >= ? AND created_at < ?`, [weekStart, weekEnd]),
    database.all<{ user_id: string; record_id: string; created_at: number }>(`SELECT user_id, record_id, created_at
      FROM user_travel_records WHERE created_at >= ? AND created_at < ?`, [weekStart, weekEnd]),
    database.all<{ user_id: string; mistake_id: string; created_at: number }>(`SELECT user_id, mistake_id, created_at
      FROM user_mistakes WHERE created_at >= ? AND created_at < ?`, [weekStart, weekEnd]),
  ]);

  const interactionBuckets: CategoryBuckets = new Map();
  const readingBuckets: CategoryBuckets = new Map();
  const travelBuckets: CategoryBuckets = new Map();
  const mistakeBuckets: CategoryBuckets = new Map();
  chats.forEach((event) => addBucket(interactionBuckets, event.user_id, event.created_at, `chat:${event.message_id}`));
  activities.forEach((event) => addBucket(interactionBuckets, event.user_id, event.happened_at, `activity:${event.activity_id}`));
  answers.forEach((event) => addBucket(readingBuckets, event.user_id, event.created_at, `question:${event.question_key || event.attempt_id}`));
  travels.forEach((event) => addBucket(travelBuckets, event.user_id, event.created_at, `travel:${event.record_id}`));
  mistakes.forEach((event) => addBucket(mistakeBuckets, event.user_id, event.created_at, `mistake:${event.mistake_id}`));

  const bucketByCategory: Record<LeaderboardCategoryKey, CategoryBuckets> = {
    interaction: interactionBuckets,
    reading: readingBuckets,
    travel: travelBuckets,
    mistake: mistakeBuckets,
  };
  const categoryByKey = Object.fromEntries(leaderboardCategories.map((category) => [category.key, category])) as Record<LeaderboardCategoryKey, LeaderboardCategory>;

  const ranked = students.map((student) => {
    const breakdown = emptyBreakdown();
    for (const category of leaderboardCategories) {
      breakdown[category.key] = categoryPoints(bucketByCategory[category.key], student.id, categoryByKey[category.key]);
    }
    return { userId: student.id, name: student.username, points: Object.values(breakdown).reduce((sum, points) => sum + points, 0), breakdown };
  }).sort((first, second) => second.points - first.points || first.name.localeCompare(second.name, "zh-Hans-CN"));

  const withRanks = ranked.map((entry, index) => ({ ...entry, rank: index + 1 }));
  const current = withRanks.find((entry) => entry.userId === currentUserId) || {
    userId: currentUserId,
    name: "我",
    points: 0,
    rank: withRanks.length + 1,
    breakdown: emptyBreakdown(),
  };

  return {
    weekLabel: weekLabel(weekStart),
    top: withRanks.slice(0, 3).map(({ rank, name, points }) => ({ rank, name, points })),
    me: { rank: current.rank, name: current.name, points: current.points, breakdown: current.breakdown },
    participantCount: ranked.filter((entry) => entry.points > 0).length,
    categories: leaderboardCategories,
  };
}
