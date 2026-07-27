import classicBookManifest from "../app/classic-books-manifest.json";
import { applyRewardChanges, getRewardBalances } from "./reward-wallet";
import { readyRuntimeDatabase, type RuntimeDatabase } from "./runtime-database";

type DailyTask = "feed" | "swim" | "reading" | "mistake";

const builtInBookIds = new Set([
  "scarecrow-zh",
  "grimm-zh",
  "andersen-zh",
  ...classicBookManifest.map((book) => book.slug),
]);

const destinationRequirements: Record<string, number> = {
  beach: 10,
  forest: 15,
  museum: 50,
  space: 70,
  ancient: 100,
  future: 150,
};

function clean(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

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

function displayDate(now = Date.now()) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "long",
    day: "numeric",
  }).format(new Date(now));
}

function stableNumericId(value: string) {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + (character.codePointAt(0) || 0)) >>> 0;
  return String(1_700_000_000_000 + hash);
}

async function ensureDailyState(database: RuntimeDatabase, userId: string, dateKey: string, now: number) {
  await database.run(
    `INSERT OR IGNORE INTO user_daily_state
      (user_id, date_key, mistake_mode, feed_target, swim_target, reading_target, mistake_target,
       feed_progress, swim_progress, reading_progress, mistake_progress, reward_claimed, fruit_picked, hide_completed, updated_at)
      VALUES (?, ?, 'add', 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, ?)`,
    [userId, dateKey, now],
  );
}

async function dailyState(database: RuntimeDatabase, userId: string, dateKey: string) {
  return database.first<{
    mistake_mode: string;
    feed_target: number;
    swim_target: number;
    reading_target: number;
    mistake_target: number;
    feed_progress: number;
    swim_progress: number;
    reading_progress: number;
    mistake_progress: number;
    reward_claimed: number;
    fruit_picked: number;
    hide_completed: number;
  }>("SELECT * FROM user_daily_state WHERE user_id = ? AND date_key = ?", [userId, dateKey]);
}

function formattedDaily(row: NonNullable<Awaited<ReturnType<typeof dailyState>>>, dateKey: string) {
  return {
    dailyPlan: {
      dateKey,
      mistakeMode: row.mistake_mode === "review" ? "review" : "add",
      targets: {
        feed: row.feed_target,
        swim: row.swim_target,
        reading: row.reading_target,
        mistake: row.mistake_target,
      },
      progress: {
        feed: row.feed_progress,
        swim: row.swim_progress,
        reading: row.reading_progress,
        mistake: row.mistake_progress,
      },
      rewardClaimed: Boolean(row.reward_claimed),
    },
    fruitPicking: { dateKey, picked: row.fruit_picked },
    hideAndSeekDaily: { dateKey, completed: row.hide_completed },
  };
}

export async function completeDailyTask(userId: string, task: DailyTask) {
  const database = await readyRuntimeDatabase();
  if (!database) throw new Error("每日任务暂时不可用");
  const now = Date.now();
  const dateKey = chinaDayKey(now);
  await ensureDailyState(database, userId, dateKey, now);
  const prior = await dailyState(database, userId, dateKey);
  if (!prior) throw new Error("每日任务暂时不可用");
  const progressColumn = `${task}_progress`;
  const targetColumn = `${task}_target`;
  await database.run(
    `UPDATE user_daily_state SET ${progressColumn} = MIN(${targetColumn}, ${progressColumn} + 1), updated_at = ?
      WHERE user_id = ? AND date_key = ?`,
    [now, userId, dateKey],
  );
  const updated = await dailyState(database, userId, dateKey);
  if (!updated) throw new Error("每日任务暂时不可用");
  const allComplete = updated.feed_progress >= updated.feed_target
    && updated.swim_progress >= updated.swim_target
    && updated.reading_progress >= updated.reading_target
    && updated.mistake_progress >= updated.mistake_target;
  if (allComplete && !updated.reward_claimed) {
    await database.run(
      "UPDATE user_daily_state SET reward_claimed = 1, updated_at = ? WHERE user_id = ? AND date_key = ? AND reward_claimed = 0",
      [now, userId, dateKey],
    );
    await applyRewardChanges({
      userId,
      changes: { stars: 3 },
      sourceType: "daily-plan",
      sourceId: dateKey,
    });
  }
  const finalState = await dailyState(database, userId, dateKey);
  if (!finalState) throw new Error("每日任务暂时不可用");
  return {
    ...formattedDaily(finalState, dateKey),
    balances: await getRewardBalances(database, userId),
  };
}

export async function pickDailyFruit(userId: string) {
  const database = await readyRuntimeDatabase();
  if (!database) throw new Error("果树暂时还没准备好");
  const now = Date.now();
  const dateKey = chinaDayKey(now);
  await ensureDailyState(database, userId, dateKey, now);
  const prior = await dailyState(database, userId, dateKey);
  if (!prior) throw new Error("果树暂时还没准备好");
  if (prior.fruit_picked >= 5) {
    return { ...formattedDaily(prior, dateKey), balances: await getRewardBalances(database, userId), picked: false };
  }
  const nextPicked = prior.fruit_picked + 1;
  await database.run(
    "UPDATE user_daily_state SET fruit_picked = ?, updated_at = ? WHERE user_id = ? AND date_key = ?",
    [nextPicked, now, userId, dateKey],
  );
  const reward = await applyRewardChanges({
    userId,
    changes: { fruits: 1 },
    sourceType: "daily-fruit",
    sourceId: `${dateKey}:${nextPicked}`,
  });
  const updated = await dailyState(database, userId, dateKey);
  if (!updated) throw new Error("果树暂时还没准备好");
  return { ...formattedDaily(updated, dateKey), balances: reward.balances, picked: true };
}

export async function feedTurtle(userId: string) {
  const database = await readyRuntimeDatabase();
  if (!database) throw new Error("喂食记录暂时不可用");
  const before = await getRewardBalances(database, userId);
  if (before.fruits < 1) throw new Error("果篮空啦");
  const spend = await applyRewardChanges({
    userId,
    changes: { fruits: -1 },
    sourceType: "feed",
    sourceId: crypto.randomUUID(),
  });
  if (!spend.applied || spend.balances.fruits !== before.fruits - 1) {
    throw new Error("果子没有扣除，请重试");
  }
  const daily = await completeDailyTask(userId, "feed");
  return { ...daily, balances: { ...daily.balances, fruits: spend.balances.fruits } };
}

export async function completeHideAndSeek(userId: string) {
  const database = await readyRuntimeDatabase();
  if (!database) throw new Error("捉迷藏记录暂时不可用");
  const now = Date.now();
  const dateKey = chinaDayKey(now);
  await ensureDailyState(database, userId, dateKey, now);
  const prior = await dailyState(database, userId, dateKey);
  if (!prior) throw new Error("捉迷藏记录暂时不可用");
  if (prior.hide_completed >= 5) {
    return { ...formattedDaily(prior, dateKey), balances: await getRewardBalances(database, userId), rewarded: false };
  }
  const nextCompleted = prior.hide_completed + 1;
  await database.run(
    "UPDATE user_daily_state SET hide_completed = ?, updated_at = ? WHERE user_id = ? AND date_key = ?",
    [nextCompleted, now, userId, dateKey],
  );
  const reward = await applyRewardChanges({
    userId,
    changes: { stars: 1 },
    sourceType: "hide-and-seek",
    sourceId: `${dateKey}:${nextCompleted}`,
  });
  const updated = await dailyState(database, userId, dateKey);
  if (!updated) throw new Error("捉迷藏记录暂时不可用");
  return { ...formattedDaily(updated, dateKey), balances: reward.balances, rewarded: true };
}

async function validBook(database: RuntimeDatabase, bookId: string) {
  if (builtInBookIds.has(bookId)) return true;
  return Boolean(await database.first(
    "SELECT 1 AS ok FROM imported_books WHERE book_id = ? AND status = 'published'",
    [bookId],
  ));
}

export async function finishBook(input: {
  userId: string;
  bookId: unknown;
  title: unknown;
  answer: unknown;
  summary: unknown;
}) {
  const bookId = clean(input.bookId, 80);
  const database = await readyRuntimeDatabase();
  if (!database || !bookId || !await validBook(database, bookId)) throw new Error("书籍编号无效");
  const now = Date.now();
  const recordId = stableNumericId(`book:${bookId}`);
  await database.run(
    `INSERT INTO user_reading_records (user_id, record_id, title, read_date, answer, summary, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, record_id) DO UPDATE SET title = excluded.title, read_date = excluded.read_date,
      answer = excluded.answer, summary = excluded.summary`,
    [
      input.userId,
      recordId,
      clean(input.title, 120),
      displayDate(now),
      clean(input.answer, 2_000) || "今天认真读完了整本书。",
      clean(input.summary, 2_000),
      now,
    ],
  );
  const reward = await applyRewardChanges({
    userId: input.userId,
    changes: { stars: 3, tickets: 1, play_tickets: 1, fruits: 1 },
    sourceType: "book-completed",
    sourceId: bookId,
  });
  const daily = await completeDailyTask(input.userId, "reading");
  return { balances: daily.balances, dailyPlan: daily.dailyPlan, rewarded: reward.applied };
}

export async function startTravel(userId: string, destinationIdInput: unknown) {
  const destinationId = clean(destinationIdInput, 40);
  const requiredStars = destinationRequirements[destinationId];
  if (!requiredStars) throw new Error("旅行地点不存在");
  const database = await readyRuntimeDatabase();
  if (!database) throw new Error("旅行记录暂时不可用");
  const active = await database.first("SELECT 1 AS ok FROM user_active_travel WHERE user_id = ?", [userId]);
  if (active) throw new Error("龟龟正在旅行中");
  const before = await getRewardBalances(database, userId);
  if (before.stars < requiredStars) throw new Error(`还需要 ${requiredStars - before.stars} 颗星星`);
  if (before.tickets < 1) throw new Error("旅行票不足");
  const now = Date.now();
  const startedAt = now - Math.floor(Math.random() * 1_000);
  const endsAt = now + 8_000;
  await database.run(
    "INSERT OR IGNORE INTO user_active_travel (user_id, destination_id, started_at, ends_at) VALUES (?, ?, ?, ?)",
    [userId, destinationId, startedAt, endsAt],
  );
  const reservation = await database.first<{ destination_id: string; started_at: number }>(
    "SELECT destination_id, started_at FROM user_active_travel WHERE user_id = ?",
    [userId],
  );
  if (!reservation || reservation.started_at !== startedAt || reservation.destination_id !== destinationId) {
    throw new Error("龟龟正在旅行中");
  }
  const reward = await applyRewardChanges({
    userId,
    changes: { tickets: -1 },
    sourceType: "travel-start",
    sourceId: String(startedAt),
  });
  if (!reward.applied || reward.balances.tickets !== before.tickets - 1) {
    await database.run(
      "DELETE FROM user_active_travel WHERE user_id = ? AND started_at = ?",
      [userId, startedAt],
    );
    throw new Error("旅行票没有扣除，请重试");
  }
  return { activeTravel: { destinationId, startedAt, endsAt }, balances: reward.balances };
}

export async function finishTravel(input: {
  userId: string;
  destinationId: unknown;
  destination: unknown;
  reward: unknown;
  photo: unknown;
  knowledge: unknown;
  knowledgeCardId: unknown;
  knowledgeTitle: unknown;
  knowledgeFacts: unknown;
}) {
  const destinationId = clean(input.destinationId, 40);
  if (!destinationRequirements[destinationId]) throw new Error("旅行地点不存在");
  const database = await readyRuntimeDatabase();
  if (!database) throw new Error("旅行记录暂时不可用");
  const active = await database.first<{ destination_id: string; started_at: number; ends_at: number }>(
    "SELECT destination_id, started_at, ends_at FROM user_active_travel WHERE user_id = ?",
    [input.userId],
  );
  if (!active || active.destination_id !== destinationId) throw new Error("没有找到正在进行的旅行");
  if (Date.now() < active.ends_at) throw new Error("旅行还没有完成");
  const sourceId = String(active.started_at);
  const reward = await applyRewardChanges({
    userId: input.userId,
    changes: { stars: 4, fruits: 1, play_tickets: 1 },
    sourceType: "travel-completed",
    sourceId,
  });
  const facts = Array.isArray(input.knowledgeFacts)
    ? input.knowledgeFacts.map((fact) => clean(fact, 200)).filter(Boolean).slice(0, 20)
    : [];
  await database.batch([{
    sql: `INSERT OR IGNORE INTO user_travel_records
      (user_id, record_id, destination_id, destination, travel_date, reward, photo, knowledge,
       knowledge_card_id, knowledge_title, knowledge_facts_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      input.userId,
      sourceId,
      destinationId,
      clean(input.destination, 120),
      displayDate(),
      clean(input.reward, 160),
      clean(input.photo, 500),
      clean(input.knowledge, 500) || null,
      clean(input.knowledgeCardId, 100) || null,
      clean(input.knowledgeTitle, 160) || null,
      JSON.stringify(facts),
      active.started_at,
    ],
  }, {
    sql: "DELETE FROM user_active_travel WHERE user_id = ? AND started_at = ?",
    params: [input.userId, active.started_at],
  }]);
  return { balances: reward.balances, recordId: sourceId };
}
