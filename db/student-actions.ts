import classicBookManifest from "../app/classic-books-manifest.json";
import {
  completeDailyTask,
  getDailyState,
  updateDailyCounter,
} from "./daily-tasks";
import {
  applyRewardChanges,
  claimInteractionBonus,
  claimTravelPlayTicket,
  getRewardBalances,
} from "./reward-wallet";
import { readyRuntimeDatabase, type RuntimeDatabase } from "./runtime-database";

export { completeDailyTask };

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

export async function pickDailyFruit(userId: string) {
  const counter = await updateDailyCounter({ userId, column: "fruit_picked", limit: 5 });
  if (!counter.changed) {
    return { ...counter.formatted, balances: await getRewardBalances(counter.database, userId), picked: false };
  }
  const reward = await applyRewardChanges({
    userId,
    changes: { fruits: 1 },
    sourceType: "daily-fruit",
    sourceId: `${counter.dateKey}:${counter.count}`,
  });
  return { ...counter.formatted, balances: reward.balances, picked: true };
}

export async function feedTurtle(userId: string) {
  const database = await readyRuntimeDatabase();
  if (!database) throw new Error("喂食记录暂时不可用");
  const before = await getRewardBalances(database, userId);
  if (before.fruits < 1) throw new Error("果篮空啦");
  const eventId = crypto.randomUUID();
  const spend = await applyRewardChanges({
    userId,
    changes: { fruits: -1 },
    sourceType: "feed",
    sourceId: eventId,
  });
  if (!spend.applied || spend.balances.fruits !== before.fruits - 1) {
    throw new Error("果子没有扣除，请重试");
  }
  const daily = await completeDailyTask(userId, "feed");
  const interactionBonus = await claimInteractionBonus({ userId, interaction: "feed", sourceId: eventId });
  return { ...daily, balances: interactionBonus.balances, interactionBonus };
}

export async function completeHideAndSeek(userId: string) {
  const counter = await updateDailyCounter({ userId, column: "hide_completed", limit: 5 });
  if (!counter.changed) {
    return { ...counter.formatted, balances: await getRewardBalances(counter.database, userId), rewarded: false };
  }
  const reward = await applyRewardChanges({
    userId,
    changes: { stars: 1 },
    sourceType: "hide-and-seek",
    sourceId: `${counter.dateKey}:${counter.count}`,
  });
  const daily = await completeDailyTask(userId, "hide");
  const interactionBonus = await claimInteractionBonus({
    userId,
    interaction: "hide",
    sourceId: `${counter.dateKey}:${counter.count}`,
  });
  return {
    ...counter.formatted,
    dailyPlan: daily.dailyPlan,
    balances: interactionBonus.balances,
    interactionBonus,
    dailyRewardedNow: daily.dailyRewardedNow,
    rewarded: reward.applied,
  };
}

export async function swimWithTurtle(userId: string) {
  const eventId = crypto.randomUUID();
  const daily = await completeDailyTask(userId, "swim");
  const interactionBonus = await claimInteractionBonus({ userId, interaction: "swim", sourceId: eventId });
  return { ...daily, balances: interactionBonus.balances, interactionBonus };
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
  const daily = await getDailyState(input.userId);
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
    changes: { stars: 4, fruits: 1 },
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
  const travelPlayTicket = await claimTravelPlayTicket(input.userId, sourceId);
  const daily = await completeDailyTask(input.userId, "travel");
  return {
    balances: daily.balances,
    dailyPlan: daily.dailyPlan,
    dailyRewardedNow: daily.dailyRewardedNow,
    recordId: sourceId,
    travelPlayTicketAwarded: travelPlayTicket.awarded,
    rewarded: reward.applied,
  };
}
