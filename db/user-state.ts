import { readyRuntimeDatabase, type RuntimeDatabase, type SqlStatement } from "./runtime-database";

type LocalStateRow = { state: unknown; updatedAt: number };
type LocalStateStore = Record<string, LocalStateRow>;
type UnknownRecord = Record<string, unknown>;

const MAX_STATE_BYTES = 1_800_000;
const DEFAULT_CHAT_RETENTION_DAYS = 14;
let localStoreQueue = Promise.resolve();
const databaseSaveQueues = new Map<string, Promise<void>>();

function object(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function list(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, limit: number, fallback = "") {
  return typeof value === "string" ? value.trim().slice(0, limit) : fallback;
}

function integer(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function booleanInteger(value: unknown) {
  return value ? 1 : 0;
}

function safeJsonArray(value: unknown, limit: number) {
  return JSON.stringify(list(value).slice(0, limit).map((item) => text(item, 220)).filter(Boolean));
}

function chatRetentionMs() {
  const configured = Number.parseInt(process.env.CHAT_RETENTION_DAYS || "", 10);
  const days = Number.isFinite(configured)
    ? Math.min(30, Math.max(1, configured))
    : DEFAULT_CHAT_RETENTION_DAYS;
  return days * 24 * 60 * 60 * 1000;
}

async function withDatabaseSaveQueue<T>(userId: string, operation: () => Promise<T>): Promise<T> {
  const previous = databaseSaveQueues.get(userId) || Promise.resolve();
  let releaseQueue: () => void = () => {};
  const current = new Promise<void>((resolve) => { releaseQueue = resolve; });
  databaseSaveQueues.set(userId, current);
  await previous;
  try {
    return await operation();
  } finally {
    releaseQueue();
    if (databaseSaveQueues.get(userId) === current) databaseSaveQueues.delete(userId);
  }
}

async function withLocalStore<T>(update: (store: LocalStateStore) => { result: T; changed: boolean }): Promise<T> {
  const filePath = process.env.USER_STATE_FILE?.trim();
  if (!filePath) throw new Error("user state storage unavailable");
  let releaseQueue: () => void = () => {};
  const previous = localStoreQueue;
  localStoreQueue = new Promise<void>((resolve) => { releaseQueue = resolve; });
  await previous;
  try {
    const [{ mkdir, readFile, rename, writeFile }, { dirname }] = await Promise.all([
      import("node:fs/promises"),
      import("node:path"),
    ]);
    await mkdir(dirname(filePath), { recursive: true });
    let store: LocalStateStore = {};
    try {
      const parsed = JSON.parse(await readFile(filePath, "utf8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) store = parsed as LocalStateStore;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const { result, changed } = update(store);
    if (changed) {
      const temporaryPath = `${filePath}.${process.pid}.tmp`;
      await writeFile(temporaryPath, JSON.stringify(store), { encoding: "utf8", mode: 0o600 });
      await rename(temporaryPath, filePath);
    }
    return result;
  } finally {
    releaseQueue();
  }
}

export function serializeUserState(state: unknown) {
  if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("invalid user state");
  const json = JSON.stringify(state);
  if (new TextEncoder().encode(json).byteLength > MAX_STATE_BYTES) throw new Error("user state too large");
  return json;
}

async function normalizedState(database: RuntimeDatabase, userId: string): Promise<UnknownRecord | null> {
  const pet = await database.first<{
    pet_name: string; hunger: number; cleanliness: number; boredom: number; fruits: number; stars: number;
    tickets: number; last_seen: number; reading_font_size: string;
  }>(`SELECT pet_name, hunger, cleanliness, boredom, fruits, stars, tickets, last_seen, reading_font_size
    FROM user_pet_state WHERE user_id = ?`, [userId]);
  if (!pet) return null;
  const playTicketWallet = await database.first<{ balance: number }>(
    "SELECT balance FROM user_play_ticket_wallet WHERE user_id = ?",
    [userId],
  );
  const now = Date.now();
  await database.run("DELETE FROM user_chat_messages WHERE expires_at <= ?", [now]);
  const parentControls = await database.first<{ chat_cleared_at: number }>(
    "SELECT chat_cleared_at FROM user_parent_controls WHERE user_id = ?",
    [userId],
  );
  const chatClearedAt = parentControls?.chat_cleared_at || 0;
  const [readingRecords, readingRewards, travelRecords, activeTravel, mistakes, dailyRows, minigameRows, completedMinigames, chatRows] = await Promise.all([
    database.all<{ record_id: string; title: string; read_date: string; answer: string; summary: string }>(
      "SELECT record_id, title, read_date, answer, summary FROM user_reading_records WHERE user_id = ? ORDER BY created_at DESC",
      [userId],
    ),
    database.all<{ reward_key: string }>(
      "SELECT reward_key FROM user_reading_rewards WHERE user_id = ? ORDER BY earned_at ASC",
      [userId],
    ),
    database.all<{
      record_id: string; destination_id: string | null; destination: string; travel_date: string; reward: string; photo: string;
      knowledge: string | null; knowledge_card_id: string | null; knowledge_title: string | null; knowledge_facts_json: string;
    }>("SELECT * FROM user_travel_records WHERE user_id = ? ORDER BY created_at DESC", [userId]),
    database.first<{ destination_id: string; started_at: number; ends_at: number }>(
      "SELECT destination_id, started_at, ends_at FROM user_active_travel WHERE user_id = ?",
      [userId],
    ),
    database.all<{
      mistake_id: string; subject: string; question: string; wrong_answer: string; correction: string; cause: string;
      status: string; mistake_date: string; review_count: number; image_url: string | null;
    }>("SELECT * FROM user_mistakes WHERE user_id = ? ORDER BY created_at DESC", [userId]),
    database.all<{
      date_key: string; mistake_mode: string; feed_target: number; swim_target: number; reading_target: number; mistake_target: number;
      feed_progress: number; swim_progress: number; reading_progress: number; mistake_progress: number; reward_claimed: number;
      fruit_picked: number; hide_completed: number;
    }>("SELECT * FROM user_daily_state WHERE user_id = ? ORDER BY date_key DESC LIMIT 1", [userId]),
    database.all<{
      date_key: string; plays: number; best_score: number; total_caught: number; reward_claimed: number;
    }>("SELECT date_key, plays, best_score, total_caught, reward_claimed FROM user_minigame_daily WHERE user_id = ? AND game_id = 'fruit-catch' ORDER BY date_key DESC LIMIT 1", [userId]),
    database.all<{ game_id: string }>(
      "SELECT game_id FROM user_minigame_progress WHERE user_id = ? ORDER BY completed_at ASC",
      [userId],
    ),
    database.all<{ message_id: string; role: string; message_text: string; created_at: number }>(`SELECT message_id, role, message_text, created_at FROM (
      SELECT message_id, role, message_text, created_at FROM user_chat_messages
      WHERE user_id = ? AND expires_at > ? AND created_at > ? ORDER BY created_at DESC LIMIT 16
    ) ORDER BY created_at ASC`, [userId, now, chatClearedAt]),
  ]);
  const daily = dailyRows[0];
  const fruitCatch = minigameRows[0];
  return {
    name: pet.pet_name,
    hunger: pet.hunger,
    cleanliness: pet.cleanliness,
    boredom: pet.boredom,
    fruits: pet.fruits,
    stars: pet.stars,
    tickets: pet.tickets,
    playTickets: Math.max(0, playTicketWallet?.balance || 0),
    lastSeen: pet.last_seen,
    readingFontSize: ["small", "medium", "large"].includes(pet.reading_font_size) ? pet.reading_font_size : "medium",
    readingRecords: readingRecords.map((record) => ({
      id: Number(record.record_id), title: record.title, date: record.read_date, answer: record.answer, summary: record.summary,
    })),
    readingRewards: readingRewards.map((reward) => reward.reward_key),
    travelRecords: travelRecords.map((record) => {
      let facts: string[] = [];
      try { facts = JSON.parse(record.knowledge_facts_json) as string[]; } catch { facts = []; }
      return {
        id: Number(record.record_id), destinationId: record.destination_id || undefined, destination: record.destination,
        date: record.travel_date, reward: record.reward, photo: record.photo, knowledge: record.knowledge || undefined,
        knowledgeCardId: record.knowledge_card_id || undefined, knowledgeTitle: record.knowledge_title || undefined,
        knowledgeFacts: facts,
      };
    }),
    activeTravel: activeTravel ? {
      destinationId: activeTravel.destination_id, startedAt: activeTravel.started_at, endsAt: activeTravel.ends_at,
    } : null,
    mistakes: mistakes.map((mistake) => ({
      id: Number(mistake.mistake_id), subject: mistake.subject, question: mistake.question, wrongAnswer: mistake.wrong_answer,
      correction: mistake.correction, cause: mistake.cause, status: mistake.status, date: mistake.mistake_date,
      reviewCount: mistake.review_count, ...(mistake.image_url ? { imageData: mistake.image_url } : {}),
    })),
    chatMessages: chatRows.map((message) => ({
      id: Number(message.message_id), role: message.role === "user" ? "user" : "turtle", text: message.message_text,
    })),
    dailyPlan: daily ? {
      dateKey: daily.date_key,
      mistakeMode: daily.mistake_mode === "review" ? "review" : "add",
      targets: { feed: daily.feed_target, swim: daily.swim_target, reading: daily.reading_target, mistake: daily.mistake_target },
      progress: { feed: daily.feed_progress, swim: daily.swim_progress, reading: daily.reading_progress, mistake: daily.mistake_progress },
      rewardClaimed: Boolean(daily.reward_claimed),
    } : undefined,
    fruitPicking: daily ? { dateKey: daily.date_key, picked: daily.fruit_picked } : undefined,
    hideAndSeekDaily: daily ? { dateKey: daily.date_key, completed: daily.hide_completed } : undefined,
    fruitCatchDaily: fruitCatch ? {
      dateKey: fruitCatch.date_key,
      plays: fruitCatch.plays,
      rewarded: Boolean(fruitCatch.reward_claimed),
      bestScore: fruitCatch.best_score,
      totalCaught: fruitCatch.total_caught,
    } : undefined,
    completedMiniGames: completedMinigames.map((row) => row.game_id),
  };
}

async function saveNormalizedState(
  database: RuntimeDatabase,
  userId: string,
  rawState: unknown,
  updatedAt: number,
  sourceType = "game-state-sync",
) {
  const state = object(rawState);
  const currentMeta = await database.first<{ updated_at: number }>("SELECT updated_at FROM user_state_meta WHERE user_id = ?", [userId]);
  if (currentMeta && currentMeta.updated_at > updatedAt) return;
  const currentPet = await database.first<{ fruits: number; stars: number; tickets: number }>(
    "SELECT fruits, stars, tickets FROM user_pet_state WHERE user_id = ?",
    [userId],
  );
  const currentPlayTicketWallet = await database.first<{ balance: number }>(
    "SELECT balance FROM user_play_ticket_wallet WHERE user_id = ?",
    [userId],
  );
  const previousMistakes = await database.all<{ mistake_id: string; review_count: number }>(
    "SELECT mistake_id, review_count FROM user_mistakes WHERE user_id = ?",
    [userId],
  );
  const previousReviewCounts = new Map(previousMistakes.map((mistake) => [mistake.mistake_id, mistake.review_count]));
  const nextBalances = {
    fruits: Math.max(0, integer(state.fruits)),
    stars: Math.max(0, integer(state.stars)),
    tickets: Math.max(0, integer(state.tickets)),
  };
  const nextPlayTickets = Math.max(0, integer(state.playTickets));
  const statements: SqlStatement[] = [{
    sql: `INSERT INTO user_state_meta (user_id, updated_at) VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET updated_at = excluded.updated_at WHERE excluded.updated_at >= user_state_meta.updated_at`,
    params: [userId, updatedAt],
  }, {
    sql: `INSERT INTO user_pet_state
      (user_id, pet_name, hunger, cleanliness, boredom, fruits, stars, tickets, last_seen, reading_font_size, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET pet_name = excluded.pet_name, hunger = excluded.hunger,
        cleanliness = excluded.cleanliness, boredom = excluded.boredom, fruits = excluded.fruits, stars = excluded.stars,
        tickets = excluded.tickets, last_seen = excluded.last_seen, reading_font_size = excluded.reading_font_size,
        updated_at = excluded.updated_at WHERE excluded.updated_at >= user_pet_state.updated_at`,
    params: [
      userId, text(state.name, 24, "小乌龟"), integer(state.hunger, 30), integer(state.cleanliness, 80), integer(state.boredom, 25),
      nextBalances.fruits, nextBalances.stars, nextBalances.tickets, Math.max(0, integer(state.lastSeen, updatedAt)),
      ["small", "medium", "large"].includes(String(state.readingFontSize)) ? String(state.readingFontSize) : "medium", updatedAt,
    ],
  }, {
    sql: `INSERT INTO user_play_ticket_wallet (user_id, balance, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET balance = excluded.balance, updated_at = excluded.updated_at
      WHERE excluded.updated_at >= user_play_ticket_wallet.updated_at`,
    params: [userId, nextPlayTickets, updatedAt],
  }];

  for (const resource of ["fruits", "stars", "tickets"] as const) {
    const before = currentPet?.[resource] || 0;
    const amount = nextBalances[resource] - before;
    if (!amount) continue;
    const sourceId = `${sourceType}:${updatedAt}`;
    statements.push({
      sql: `INSERT OR IGNORE INTO user_reward_ledger
        (entry_id, user_id, resource_type, amount, balance_after, source_type, source_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [`${userId}:${resource}:${sourceId}`, userId, resource, amount, nextBalances[resource], sourceType, sourceId, updatedAt],
    });
  }
  const playTicketChange = nextPlayTickets - (currentPlayTicketWallet?.balance || 0);
  if (playTicketChange) {
    const sourceId = `${sourceType}:${updatedAt}`;
    statements.push({
      sql: `INSERT OR IGNORE INTO user_reward_ledger
        (entry_id, user_id, resource_type, amount, balance_after, source_type, source_id, created_at)
        VALUES (?, ?, 'play_tickets', ?, ?, ?, ?, ?)`,
      params: [`${userId}:play_tickets:${sourceId}`, userId, playTicketChange, nextPlayTickets, sourceType, sourceId, updatedAt],
    });
  }

  const validMinigames = new Set([
    "fruit-catch",
    "turtle-courier",
    "weather-outfit",
    "lotus-jump",
    "spot-difference",
    "story-puzzle",
    "turtle-sky",
    "tortoise-race",
  ]);
  for (const rawGameId of list(state.completedMiniGames).slice(0, validMinigames.size)) {
    const gameId = text(rawGameId, 80);
    if (!validMinigames.has(gameId)) continue;
    statements.push({
      sql: "INSERT OR IGNORE INTO user_minigame_progress (user_id, game_id, completed_at) VALUES (?, ?, ?)",
      params: [userId, gameId, updatedAt],
    });
  }

  for (const rawRecord of list(state.readingRecords).slice(0, 500)) {
    const record = object(rawRecord);
    const id = String(integer(record.id, updatedAt));
    statements.push({
      sql: `INSERT INTO user_reading_records (user_id, record_id, title, read_date, answer, summary, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, record_id) DO UPDATE SET
        title = excluded.title, read_date = excluded.read_date, answer = excluded.answer, summary = excluded.summary`,
      params: [userId, id, text(record.title, 120), text(record.date, 30), text(record.answer, 2_000), text(record.summary, 2_000), integer(record.id, updatedAt)],
    });
  }
  for (const rewardKey of list(state.readingRewards).slice(0, 2_000)) {
    const key = text(rewardKey, 240);
    if (!key) continue;
    statements.push({
      sql: "INSERT OR IGNORE INTO user_reading_rewards (user_id, reward_key, earned_at) VALUES (?, ?, ?)",
      params: [userId, key, updatedAt],
    });
  }
  for (const rawRecord of list(state.travelRecords).slice(0, 500)) {
    const record = object(rawRecord);
    const id = String(integer(record.id, updatedAt));
    statements.push({
      sql: `INSERT INTO user_travel_records
        (user_id, record_id, destination_id, destination, travel_date, reward, photo, knowledge, knowledge_card_id, knowledge_title, knowledge_facts_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, record_id) DO UPDATE SET destination_id = excluded.destination_id, destination = excluded.destination,
        travel_date = excluded.travel_date, reward = excluded.reward, photo = excluded.photo, knowledge = excluded.knowledge,
        knowledge_card_id = excluded.knowledge_card_id, knowledge_title = excluded.knowledge_title,
        knowledge_facts_json = excluded.knowledge_facts_json`,
      params: [
        userId, id, text(record.destinationId, 80) || null, text(record.destination, 120), text(record.date, 30), text(record.reward, 160),
        text(record.photo, 500), text(record.knowledge, 500) || null, text(record.knowledgeCardId, 100) || null,
        text(record.knowledgeTitle, 160) || null, safeJsonArray(record.knowledgeFacts, 20), integer(record.id, updatedAt),
      ],
    });
  }

  statements.push({ sql: "DELETE FROM user_active_travel WHERE user_id = ?", params: [userId] });
  const activeTravel = object(state.activeTravel);
  if (text(activeTravel.destinationId, 80)) statements.push({
    sql: "INSERT INTO user_active_travel (user_id, destination_id, started_at, ends_at) VALUES (?, ?, ?, ?)",
    params: [userId, text(activeTravel.destinationId, 80), integer(activeTravel.startedAt), integer(activeTravel.endsAt)],
  });

  statements.push({ sql: "DELETE FROM user_mistakes WHERE user_id = ?", params: [userId] });
  for (const rawMistake of list(state.mistakes).slice(0, 500)) {
    const mistake = object(rawMistake);
    const id = String(integer(mistake.id, updatedAt));
    const reviewCount = Math.max(0, integer(mistake.reviewCount));
    const status = ["new", "reviewing", "mastered"].includes(String(mistake.status)) ? String(mistake.status) : "new";
    statements.push({
      sql: `INSERT INTO user_mistakes
        (user_id, mistake_id, subject, question, wrong_answer, correction, cause, status, mistake_date, review_count, image_url, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        userId, id, text(mistake.subject, 80), text(mistake.question, 2_000), text(mistake.wrongAnswer, 1_000),
        text(mistake.correction, 2_000), text(mistake.cause, 1_000), status, text(mistake.date, 30), reviewCount,
        text(mistake.imageData, 600) || null, integer(mistake.id, updatedAt), updatedAt,
      ],
    });
    const previousCount = previousReviewCounts.get(id) || 0;
    for (let reviewNumber = previousCount + 1; reviewNumber <= reviewCount; reviewNumber += 1) statements.push({
      sql: `INSERT OR IGNORE INTO user_mistake_review_events
        (event_id, user_id, mistake_id, outcome, review_number, reviewed_at) VALUES (?, ?, ?, ?, ?, ?)`,
      params: [`${userId}:${id}:${reviewNumber}`, userId, id, status, reviewNumber, updatedAt],
    });
  }

  const dailyPlan = object(state.dailyPlan);
  const targets = object(dailyPlan.targets);
  const progress = object(dailyPlan.progress);
  const fruitPicking = object(state.fruitPicking);
  const hideAndSeek = object(state.hideAndSeekDaily);
  const fruitCatch = object(state.fruitCatchDaily);
  const dateKey = text(dailyPlan.dateKey, 20) || text(fruitPicking.dateKey, 20) || text(hideAndSeek.dateKey, 20) || text(fruitCatch.dateKey, 20);
  if (dateKey) statements.push({
    sql: `INSERT INTO user_daily_state
      (user_id, date_key, mistake_mode, feed_target, swim_target, reading_target, mistake_target,
       feed_progress, swim_progress, reading_progress, mistake_progress, reward_claimed, fruit_picked, hide_completed, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, date_key) DO UPDATE SET mistake_mode = excluded.mistake_mode,
      feed_target = excluded.feed_target, swim_target = excluded.swim_target, reading_target = excluded.reading_target,
      mistake_target = excluded.mistake_target, feed_progress = excluded.feed_progress, swim_progress = excluded.swim_progress,
      reading_progress = excluded.reading_progress, mistake_progress = excluded.mistake_progress,
      reward_claimed = excluded.reward_claimed, fruit_picked = excluded.fruit_picked,
      hide_completed = excluded.hide_completed, updated_at = excluded.updated_at`,
    params: [
      userId, dateKey, dailyPlan.mistakeMode === "review" ? "review" : "add",
      Math.max(0, integer(targets.feed, 1)), Math.max(0, integer(targets.swim, 1)), Math.max(0, integer(targets.reading, 1)), Math.max(0, integer(targets.mistake, 1)),
      Math.max(0, integer(progress.feed)), Math.max(0, integer(progress.swim)), Math.max(0, integer(progress.reading)), Math.max(0, integer(progress.mistake)),
      booleanInteger(dailyPlan.rewardClaimed), Math.max(0, integer(fruitPicking.picked)), Math.max(0, integer(hideAndSeek.completed)), updatedAt,
    ],
  });

  const fruitCatchDateKey = text(fruitCatch.dateKey, 20);
  if (fruitCatchDateKey) statements.push({
    sql: `INSERT INTO user_minigame_daily
      (user_id, date_key, game_id, plays, best_score, total_caught, reward_claimed, updated_at)
      VALUES (?, ?, 'fruit-catch', ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, date_key, game_id) DO UPDATE SET plays = excluded.plays,
      best_score = excluded.best_score, total_caught = excluded.total_caught,
      reward_claimed = excluded.reward_claimed, updated_at = excluded.updated_at`,
    params: [
      userId,
      fruitCatchDateKey,
      Math.max(0, integer(fruitCatch.plays)),
      Math.max(0, integer(fruitCatch.bestScore)),
      Math.max(0, integer(fruitCatch.totalCaught)),
      booleanInteger(fruitCatch.rewarded),
      updatedAt,
    ],
  });

  statements.push({ sql: "DELETE FROM user_chat_messages WHERE expires_at <= ?", params: [updatedAt] });
  const parentControls = await database.first<{ chat_cleared_at: number }>(
    "SELECT chat_cleared_at FROM user_parent_controls WHERE user_id = ?",
    [userId],
  );
  const chatClearedAt = parentControls?.chat_cleared_at || 0;
  const retentionMs = chatRetentionMs();
  for (const rawMessage of list(state.chatMessages).slice(-64)) {
    const message = object(rawMessage);
    const idNumber = integer(message.id, updatedAt);
    const createdAt = idNumber > 1_500_000_000_000 ? idNumber : updatedAt;
    if (createdAt + retentionMs <= updatedAt || createdAt <= chatClearedAt) continue;
    statements.push({
      sql: `INSERT INTO user_chat_messages (user_id, message_id, role, message_text, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, message_id) DO UPDATE SET
        role = excluded.role, message_text = excluded.message_text, created_at = excluded.created_at, expires_at = excluded.expires_at`,
      params: [userId, String(idNumber), message.role === "user" ? "user" : "turtle", text(message.text, 1_000), createdAt, createdAt + retentionMs],
    });
  }
  await database.batch(statements);
}

export async function getUserState(userId: string): Promise<unknown | null> {
  const database = await readyRuntimeDatabase();
  if (database) {
    const state = await normalizedState(database, userId);
    if (state) return state;
    const legacy = await database.first<{ state_json: string; updated_at: number }>(
      "SELECT state_json, updated_at FROM user_game_state WHERE user_id = ?",
      [userId],
    );
    if (!legacy?.state_json) return null;
    try {
      const parsed = JSON.parse(legacy.state_json);
      await saveNormalizedState(database, userId, parsed, legacy.updated_at, "legacy-d1-import");
      return normalizedState(database, userId);
    } catch {
      return null;
    }
  }
  return withLocalStore((store) => ({ result: store[userId]?.state ?? null, changed: false }));
}

export async function saveUserState(userId: string, state: unknown, updatedAt: number) {
  const stateJson = serializeUserState(state);
  const safeUpdatedAt = Math.max(1, Math.floor(updatedAt));
  const database = await readyRuntimeDatabase();
  if (database) {
    await withDatabaseSaveQueue(userId, () => saveNormalizedState(database, userId, JSON.parse(stateJson), safeUpdatedAt));
    return;
  }
  await withLocalStore((store) => {
    if ((store[userId]?.updatedAt || 0) <= safeUpdatedAt) {
      store[userId] = { state: JSON.parse(stateJson), updatedAt: safeUpdatedAt };
      return { result: undefined, changed: true };
    }
    return { result: undefined, changed: false };
  });
}
