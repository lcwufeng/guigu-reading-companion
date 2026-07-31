import { applyRewardChanges, getRewardBalances } from "./reward-wallet";
import { readyRuntimeDatabase, type RuntimeDatabase } from "./runtime-database";

export const DAILY_TASK_KEYS = [
  "feed",
  "swim",
  "hide",
  "games",
  "explore",
  "travel",
  "chat",
  "mistake",
] as const;

export type DailyTask = (typeof DAILY_TASK_KEYS)[number];
type DailyValues = Record<DailyTask, number>;

type LegacyDailyRow = {
  mistake_mode: string;
  reward_claimed: number;
  fruit_picked: number;
  hide_completed: number;
};

type DailyTaskRow = {
  task_key: string;
  task_order: number;
  target: number;
  progress: number;
};

export function chinaDayKey(now = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(now));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function stableHash(value: string) {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) || 0;
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return hash;
}

export function selectedDailyTasks(userId: string, dateKey: string): DailyTask[] {
  return [...DAILY_TASK_KEYS]
    .map((task) => ({ task, score: stableHash(`${userId}:${dateKey}:${task}`) }))
    .sort((left, right) => left.score - right.score || left.task.localeCompare(right.task))
    .slice(0, 4)
    .map((item) => item.task);
}

function isDailyTask(value: string): value is DailyTask {
  return (DAILY_TASK_KEYS as readonly string[]).includes(value);
}

async function ensureLegacyDailyState(database: RuntimeDatabase, userId: string, dateKey: string, now: number) {
  const pendingMistakes = await database.first<{ count: number }>(
    "SELECT COUNT(*) AS count FROM user_mistakes WHERE user_id = ? AND status != 'mastered'",
    [userId],
  );
  await database.run(
    `INSERT OR IGNORE INTO user_daily_state
      (user_id, date_key, mistake_mode, feed_target, swim_target, reading_target, mistake_target,
       feed_progress, swim_progress, reading_progress, mistake_progress, reward_claimed, fruit_picked, hide_completed, updated_at)
      VALUES (?, ?, ?, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, ?)`,
    [userId, dateKey, Number(pendingMistakes?.count) > 0 ? "review" : "add", now],
  );
}

async function ensureTaskRows(database: RuntimeDatabase, userId: string, dateKey: string, now: number) {
  const selected = selectedDailyTasks(userId, dateKey);
  await database.batch(selected.map((task, index) => ({
    sql: `INSERT OR IGNORE INTO user_daily_tasks
      (user_id, date_key, task_key, task_order, target, progress, updated_at)
      VALUES (?, ?, ?, ?, 1, 0, ?)`,
    params: [userId, dateKey, task, index, now],
  })));
}

async function dailyState(database: RuntimeDatabase, userId: string, dateKey: string) {
  const [legacy, tasks] = await Promise.all([
    database.first<LegacyDailyRow>(
      "SELECT mistake_mode, reward_claimed, fruit_picked, hide_completed FROM user_daily_state WHERE user_id = ? AND date_key = ?",
      [userId, dateKey],
    ),
    database.all<DailyTaskRow>(
      `SELECT task_key, task_order, target, progress FROM user_daily_tasks
        WHERE user_id = ? AND date_key = ? ORDER BY task_order ASC`,
      [userId, dateKey],
    ),
  ]);
  return { legacy, tasks: tasks.filter((row) => isDailyTask(row.task_key)) };
}

function formattedDaily(
  state: { legacy: LegacyDailyRow; tasks: DailyTaskRow[] },
  dateKey: string,
) {
  const targets = Object.fromEntries(DAILY_TASK_KEYS.map((task) => [task, 0])) as DailyValues;
  const progress = Object.fromEntries(DAILY_TASK_KEYS.map((task) => [task, 0])) as DailyValues;
  const taskKeys: DailyTask[] = [];
  for (const row of state.tasks) {
    if (!isDailyTask(row.task_key) || taskKeys.includes(row.task_key)) continue;
    taskKeys.push(row.task_key);
    targets[row.task_key] = Math.max(1, Number(row.target) || 1);
    progress[row.task_key] = Math.max(0, Number(row.progress) || 0);
  }
  return {
    dailyPlan: {
      dateKey,
      taskKeys,
      mistakeMode: state.legacy.mistake_mode === "review" ? "review" as const : "add" as const,
      targets,
      progress,
      rewardClaimed: Boolean(state.legacy.reward_claimed),
    },
    fruitPicking: { dateKey, picked: Math.max(0, state.legacy.fruit_picked) },
    hideAndSeekDaily: { dateKey, completed: Math.max(0, state.legacy.hide_completed) },
  };
}

export async function getDailyState(userId: string, now = Date.now()) {
  const database = await readyRuntimeDatabase();
  if (!database) throw new Error("每日任务暂时不可用");
  const dateKey = chinaDayKey(now);
  await ensureLegacyDailyState(database, userId, dateKey, now);
  await ensureTaskRows(database, userId, dateKey, now);
  const state = await dailyState(database, userId, dateKey);
  if (!state.legacy || state.tasks.length !== 4) throw new Error("每日任务暂时不可用");
  return {
    ...formattedDaily({ legacy: state.legacy, tasks: state.tasks }, dateKey),
    balances: await getRewardBalances(database, userId),
  };
}

export async function completeDailyTask(userId: string, task: DailyTask, now = Date.now()) {
  if (!DAILY_TASK_KEYS.includes(task)) throw new Error("每日任务类型无效");
  const database = await readyRuntimeDatabase();
  if (!database) throw new Error("每日任务暂时不可用");
  const dateKey = chinaDayKey(now);
  await ensureLegacyDailyState(database, userId, dateKey, now);
  await ensureTaskRows(database, userId, dateKey, now);
  await database.run(
    `UPDATE user_daily_tasks SET progress = MIN(target, progress + 1), updated_at = ?
      WHERE user_id = ? AND date_key = ? AND task_key = ?`,
    [now, userId, dateKey, task],
  );
  let state = await dailyState(database, userId, dateKey);
  if (!state.legacy || state.tasks.length !== 4) throw new Error("每日任务暂时不可用");
  const allComplete = state.tasks.every((row) => row.progress >= row.target);
  let dailyRewardedNow = false;
  if (allComplete && !state.legacy.reward_claimed) {
    const reward = await applyRewardChanges({
      userId,
      changes: { play_tickets: 3 },
      sourceType: "daily-plan",
      sourceId: dateKey,
    });
    await database.run(
      "UPDATE user_daily_state SET reward_claimed = 1, updated_at = ? WHERE user_id = ? AND date_key = ?",
      [now, userId, dateKey],
    );
    dailyRewardedNow = reward.applied;
    state = await dailyState(database, userId, dateKey);
  }
  if (!state.legacy) throw new Error("每日任务暂时不可用");
  return {
    ...formattedDaily({ legacy: state.legacy, tasks: state.tasks }, dateKey),
    balances: await getRewardBalances(database, userId),
    dailyRewardedNow,
  };
}

export async function updateDailyCounter(input: {
  userId: string;
  column: "fruit_picked" | "hide_completed";
  limit: number;
  now?: number;
}) {
  const database = await readyRuntimeDatabase();
  if (!database) throw new Error("每日记录暂时不可用");
  const now = input.now ?? Date.now();
  const dateKey = chinaDayKey(now);
  await ensureLegacyDailyState(database, input.userId, dateKey, now);
  await ensureTaskRows(database, input.userId, dateKey, now);
  const before = await dailyState(database, input.userId, dateKey);
  if (!before.legacy) throw new Error("每日记录暂时不可用");
  const current = input.column === "fruit_picked" ? before.legacy.fruit_picked : before.legacy.hide_completed;
  if (current >= input.limit) {
    return {
      changed: false,
      count: current,
      dateKey,
      formatted: formattedDaily({ legacy: before.legacy, tasks: before.tasks }, dateKey),
      database,
    };
  }
  const next = current + 1;
  await database.run(
    `UPDATE user_daily_state SET ${input.column} = ?, updated_at = ? WHERE user_id = ? AND date_key = ?`,
    [next, now, input.userId, dateKey],
  );
  const after = await dailyState(database, input.userId, dateKey);
  if (!after.legacy) throw new Error("每日记录暂时不可用");
  return {
    changed: true,
    count: next,
    dateKey,
    formatted: formattedDaily({ legacy: after.legacy, tasks: after.tasks }, dateKey),
    database,
  };
}
