import { readyRuntimeDatabase } from "./runtime-database";
import { normalizeInterestTopics } from "./student-memory";

export type ParentReportRange = {
  from: number;
  to: number;
};

export type ParentReportData = {
  userId: string;
  username: string;
  range: ParentReportRange;
  currentResources: { stars: number; fruits: number; tickets: number; playTickets: number };
  dailyTasks: { activeDays: number; fullyCompletedDays: number };
  reading: {
    books: Array<{ bookId: string; firstReadAt: number; lastReadAt: number; completedAt: number | null }>;
    answerAttempts: number;
    correctAnswers: number;
  };
  mistakes: {
    currentByStatus: Record<string, number>;
    reviewEvents: number;
    photoAnswerAttempts: number;
    correctPhotoAnswers: number;
  };
  rewardChanges: Record<string, number>;
  learned: string[];
  interests: string[];
  recentActivities: Array<{ activity: string; detail: string; happenedAt: number }>;
};

function safeRange(range: Partial<ParentReportRange> = {}): ParentReportRange {
  const now = Date.now();
  const requestedTo = Number(range.to);
  const to = Number.isFinite(requestedTo) ? Math.min(now, Math.max(1, Math.floor(requestedTo))) : now;
  const requestedFrom = Number(range.from);
  const defaultFrom = to - 30 * 24 * 60 * 60 * 1000;
  const from = Number.isFinite(requestedFrom)
    ? Math.max(1, Math.min(to, Math.floor(requestedFrom)))
    : defaultFrom;
  return { from, to };
}

export async function buildParentReport(
  userId: string,
  requestedRange: Partial<ParentReportRange> = {},
): Promise<ParentReportData | null> {
  const database = await readyRuntimeDatabase();
  if (!database) return null;
  const range = safeRange(requestedRange);
  const user = await database.first<{ username: string }>("SELECT username FROM app_users WHERE id = ?", [userId]);
  if (!user) return null;

  const [pet, playTicketWallet, daily, books, answers, mistakeRows, reviews, photoAnswers, rewards, facts, activities] = await Promise.all([
    database.first<{ stars: number; fruits: number; tickets: number }>(
      "SELECT stars, fruits, tickets FROM user_pet_state WHERE user_id = ?",
      [userId],
    ),
    database.first<{ balance: number }>("SELECT balance FROM user_play_ticket_wallet WHERE user_id = ?", [userId]),
    database.first<{ active_days: number; completed_days: number }>(`SELECT COUNT(*) AS active_days,
      COALESCE(SUM(CASE WHEN feed_progress >= feed_target AND swim_progress >= swim_target
        AND reading_progress >= reading_target AND mistake_progress >= mistake_target THEN 1 ELSE 0 END), 0) AS completed_days
      FROM user_daily_state WHERE user_id = ? AND updated_at BETWEEN ? AND ?`, [userId, range.from, range.to]),
    database.all<{ book_id: string; first_read_at: number; last_read_at: number; completed_at: number | null }>(`SELECT book_id, first_read_at, last_read_at, completed_at
      FROM user_reading_metrics WHERE user_id = ? AND last_read_at BETWEEN ? AND ? ORDER BY last_read_at DESC LIMIT 30`,
    [userId, range.from, range.to]),
    database.first<{ attempts: number; correct_answers: number }>(`SELECT COUNT(*) AS attempts,
      COALESCE(SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END), 0) AS correct_answers
      FROM chapter_answer_attempts WHERE user_id = ? AND created_at BETWEEN ? AND ?`, [userId, range.from, range.to]),
    database.all<{ status: string; count: number }>(
      "SELECT status, COUNT(*) AS count FROM user_mistakes WHERE user_id = ? GROUP BY status",
      [userId],
    ),
    database.first<{ count: number }>(`SELECT COUNT(*) AS count FROM user_mistake_review_events
      WHERE user_id = ? AND reviewed_at BETWEEN ? AND ?`, [userId, range.from, range.to]),
    database.first<{ attempts: number; correct_answers: number }>(`SELECT COUNT(*) AS attempts,
      COALESCE(SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END), 0) AS correct_answers
      FROM user_mistake_answer_attempts WHERE user_id = ? AND created_at BETWEEN ? AND ?`, [userId, range.from, range.to]),
    database.all<{ resource_type: string; amount: number }>(`SELECT resource_type, COALESCE(SUM(amount), 0) AS amount
      FROM user_reward_ledger WHERE user_id = ? AND created_at BETWEEN ? AND ? GROUP BY resource_type`,
    [userId, range.from, range.to]),
    database.all<{ fact_type: string; fact_value: string }>(`SELECT fact_type, fact_value FROM user_memory_facts
      WHERE user_id = ? AND fact_type IN ('learned', 'interest')
      ORDER BY last_used_at DESC LIMIT 80`, [userId]),
    database.all<{ activity: string; detail: string; happened_at: number }>(`SELECT activity, detail, happened_at
      FROM user_activity_log WHERE user_id = ? AND happened_at BETWEEN ? AND ?
      ORDER BY happened_at DESC LIMIT 30`, [userId, range.from, range.to]),
  ]);

  return {
    userId,
    username: user.username,
    range,
    currentResources: {
      stars: pet?.stars || 0,
      fruits: pet?.fruits || 0,
      tickets: pet?.tickets || 0,
      playTickets: playTicketWallet?.balance || 0,
    },
    dailyTasks: {
      activeDays: daily?.active_days || 0,
      fullyCompletedDays: daily?.completed_days || 0,
    },
    reading: {
      books: books.map((book) => ({
        bookId: book.book_id,
        firstReadAt: book.first_read_at,
        lastReadAt: book.last_read_at,
        completedAt: book.completed_at,
      })),
      answerAttempts: answers?.attempts || 0,
      correctAnswers: answers?.correct_answers || 0,
    },
    mistakes: {
      currentByStatus: Object.fromEntries(mistakeRows.map((row) => [row.status, row.count])),
      reviewEvents: reviews?.count || 0,
      photoAnswerAttempts: photoAnswers?.attempts || 0,
      correctPhotoAnswers: photoAnswers?.correct_answers || 0,
    },
    rewardChanges: Object.fromEntries(rewards.map((row) => [row.resource_type, row.amount])),
    learned: facts.filter((fact) => fact.fact_type === "learned").map((fact) => fact.fact_value).slice(0, 12),
    interests: [...new Set(facts
      .filter((fact) => fact.fact_type === "interest")
      .flatMap((fact) => normalizeInterestTopics(fact.fact_value)))].slice(0, 10),
    recentActivities: activities.map((activity) => ({
      activity: activity.activity,
      detail: activity.detail,
      happenedAt: activity.happened_at,
    })),
  };
}
