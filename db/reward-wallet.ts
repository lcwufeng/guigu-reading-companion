import { readyRuntimeDatabase, type RuntimeDatabase, type SqlStatement } from "./runtime-database";

export type RewardResource = "fruits" | "stars" | "tickets" | "play_tickets";
export type RewardBalances = { fruits: number; stars: number; tickets: number; playTickets: number };

const initialBalances: RewardBalances = { fruits: 5, stars: 12, tickets: 3, playTickets: 0 };
const readingRewardQueues = new Map<string, Promise<void>>();

async function withReadingRewardQueue<T>(userId: string, operation: () => Promise<T>) {
  const previous = readingRewardQueues.get(userId) || Promise.resolve();
  let release: () => void = () => {};
  const current = new Promise<void>((resolve) => { release = resolve; });
  readingRewardQueues.set(userId, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (readingRewardQueues.get(userId) === current) readingRewardQueues.delete(userId);
  }
}

async function ensureWallets(database: RuntimeDatabase, userId: string, now: number) {
  await database.batch([{
    sql: `INSERT OR IGNORE INTO user_pet_state
      (user_id, pet_name, hunger, cleanliness, boredom, fruits, stars, tickets, last_seen, reading_font_size, updated_at)
      VALUES (?, '小乌龟', 30, 80, 25, ?, ?, ?, ?, 'medium', ?)`,
    params: [userId, initialBalances.fruits, initialBalances.stars, initialBalances.tickets, now, now],
  }, {
    sql: "INSERT OR IGNORE INTO user_play_ticket_wallet (user_id, balance, updated_at) VALUES (?, 0, ?)",
    params: [userId, now],
  }]);
}

export async function getRewardBalances(database: RuntimeDatabase, userId: string): Promise<RewardBalances> {
  const now = Date.now();
  await ensureWallets(database, userId, now);
  const [pet, playTickets] = await Promise.all([
    database.first<{ fruits: number; stars: number; tickets: number }>(
      "SELECT fruits, stars, tickets FROM user_pet_state WHERE user_id = ?",
      [userId],
    ),
    database.first<{ balance: number }>(
      "SELECT balance FROM user_play_ticket_wallet WHERE user_id = ?",
      [userId],
    ),
  ]);
  return {
    fruits: Math.max(0, pet?.fruits ?? initialBalances.fruits),
    stars: Math.max(0, pet?.stars ?? initialBalances.stars),
    tickets: Math.max(0, pet?.tickets ?? initialBalances.tickets),
    playTickets: Math.max(0, playTickets?.balance || 0),
  };
}

function resourceStatements(input: {
  userId: string;
  resource: RewardResource;
  amount: number;
  sourceType: string;
  sourceId: string;
  now: number;
}) {
  const entryId = `${input.userId}:${input.resource}:${input.sourceType}:${input.sourceId}`.slice(0, 500);
  const statements: SqlStatement[] = [{
    sql: `INSERT OR IGNORE INTO user_reward_ledger
      (entry_id, user_id, resource_type, amount, balance_after, source_type, source_id, created_at)
      VALUES (?, ?, ?, ?, -1, ?, ?, ?)`,
    params: [entryId, input.userId, input.resource, input.amount, input.sourceType, input.sourceId, input.now],
  }];
  if (input.resource === "play_tickets") {
    statements.push({
      sql: `UPDATE user_play_ticket_wallet SET balance = balance + ?, updated_at = ?
        WHERE user_id = ? AND balance + ? >= 0
        AND EXISTS (SELECT 1 FROM user_reward_ledger WHERE entry_id = ? AND balance_after = -1)`,
      params: [input.amount, input.now, input.userId, input.amount, entryId],
    }, {
      sql: `UPDATE user_reward_ledger SET balance_after =
        (SELECT balance FROM user_play_ticket_wallet WHERE user_id = ?)
        WHERE entry_id = ? AND balance_after = -1
        AND changes() > 0`,
      params: [input.userId, entryId],
    });
  } else {
    const column = input.resource;
    statements.push({
      sql: `UPDATE user_pet_state SET ${column} = ${column} + ?, updated_at = ?
        WHERE user_id = ? AND ${column} + ? >= 0
        AND EXISTS (SELECT 1 FROM user_reward_ledger WHERE entry_id = ? AND balance_after = -1)`,
      params: [input.amount, input.now, input.userId, input.amount, entryId],
    }, {
      sql: `UPDATE user_reward_ledger SET balance_after =
        (SELECT ${column} FROM user_pet_state WHERE user_id = ?)
        WHERE entry_id = ? AND balance_after = -1
        AND changes() > 0`,
      params: [input.userId, entryId],
    });
  }
  statements.push({
    sql: "DELETE FROM user_reward_ledger WHERE entry_id = ? AND balance_after = -1",
    params: [entryId],
  });
  return { entryId, statements };
}

export async function applyRewardChanges(input: {
  userId: string;
  changes: Partial<Record<RewardResource, number>>;
  sourceType: string;
  sourceId: string;
}) {
  const database = await readyRuntimeDatabase();
  if (!database) throw new Error("reward database unavailable");
  const now = Date.now();
  await ensureWallets(database, input.userId, now - 1);
  const statements: SqlStatement[] = [];
  const entryIds: string[] = [];
  for (const resource of ["fruits", "stars", "tickets", "play_tickets"] as const) {
    const amount = Math.trunc(input.changes[resource] || 0);
    if (!amount || Math.abs(amount) > 20) continue;
    const operation = resourceStatements({ ...input, resource, amount, now });
    entryIds.push(operation.entryId);
    statements.push(...operation.statements);
  }
  const existingEntries = entryIds.length
    ? await database.all<{ entry_id: string }>(
      `SELECT entry_id FROM user_reward_ledger WHERE entry_id IN (${entryIds.map(() => "?").join(",")})`,
      entryIds,
    )
    : [];
  await database.batch(statements);
  const entries = entryIds.length
    ? await database.all<{ entry_id: string }>(
      `SELECT entry_id FROM user_reward_ledger WHERE entry_id IN (${entryIds.map(() => "?").join(",")})`,
      entryIds,
    )
    : [];
  return {
    balances: await getRewardBalances(database, input.userId),
    applied: entries.length > existingEntries.length,
  };
}

function deterministicReward(userId: string, questionKey: string): RewardResource {
  let total = 0;
  for (const character of `${userId}:${questionKey}`) total = (total * 33 + (character.codePointAt(0) || 0)) >>> 0;
  return (["stars", "tickets", "play_tickets"] as const)[total % 3];
}

export async function claimReadingReward(userId: string, questionKey: string) {
  return withReadingRewardQueue(userId, async () => {
    const safeKey = questionKey.trim().slice(0, 240);
    if (!safeKey) throw new Error("reading reward key missing");
    const database = await readyRuntimeDatabase();
    if (!database) throw new Error("reward database unavailable");
    const existing = await database.first<{ reward_key: string }>(
      "SELECT reward_key FROM user_reading_rewards WHERE user_id = ? AND reward_key = ?",
      [userId, safeKey],
    );
    const resource = deterministicReward(userId, safeKey);
    const result = await applyRewardChanges({
      userId,
      changes: { [resource]: 1 },
      sourceType: "reading-answer",
      sourceId: safeKey,
    });
    await database.run(
      "INSERT OR IGNORE INTO user_reading_rewards (user_id, reward_key, earned_at) VALUES (?, ?, ?)",
      [userId, safeKey, Date.now()],
    );
    return {
      alreadyClaimed: Boolean(existing) || !result.applied,
      resource,
      balances: result.balances,
    };
  });
}
