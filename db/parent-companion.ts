import { readyRuntimeDatabase } from "./runtime-database";

export type StoredParentCompanionSuggestion = {
  text: string;
  modelSource: string;
  generatedAt: number;
};

export function parentCompanionDateKey(timestamp = Date.now()) {
  return new Date(timestamp + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function claimDailyParentCompanionRefresh(
  parentId: string,
  studentId: string,
  timestamp = Date.now(),
) {
  const database = await readyRuntimeDatabase();
  if (!database) return false;
  const dateKey = parentCompanionDateKey(timestamp);
  const refreshId = crypto.randomUUID();
  await database.run(`INSERT OR IGNORE INTO parent_companion_refreshes
    (user_id, date_key, refresh_id, parent_id, requested_at) VALUES (?, ?, ?, ?, ?)`,
  [studentId, dateKey, refreshId, parentId, timestamp]);
  const claim = await database.first<{ refresh_id: string }>(`SELECT refresh_id FROM parent_companion_refreshes
    WHERE user_id = ? AND date_key = ?`, [studentId, dateKey]);
  return claim?.refresh_id === refreshId;
}

export async function getStoredParentCompanionSuggestion(studentId: string): Promise<StoredParentCompanionSuggestion | null> {
  const database = await readyRuntimeDatabase();
  if (!database) return null;
  const row = await database.first<{ suggestion: string; model_source: string; generated_at: number }>(`SELECT suggestion, model_source, generated_at
    FROM parent_companion_suggestions WHERE user_id = ?`, [studentId]);
  if (!row) return null;
  return { text: row.suggestion, modelSource: row.model_source, generatedAt: row.generated_at };
}

export async function getParentCompanionSuggestionHistory(studentId: string, limit = 8): Promise<StoredParentCompanionSuggestion[]> {
  const database = await readyRuntimeDatabase();
  if (!database) return [];
  const rows = await database.all<{ suggestion: string; model_source: string; generated_at: number }>(`SELECT suggestion, model_source, generated_at
    FROM parent_companion_suggestion_history WHERE user_id = ? ORDER BY generated_at DESC LIMIT ?`, [studentId, Math.min(20, Math.max(1, limit))]);
  return rows.map((row) => ({ text: row.suggestion, modelSource: row.model_source, generatedAt: row.generated_at }));
}

export async function saveParentCompanionSuggestion(
  parentId: string,
  studentId: string,
  suggestion: StoredParentCompanionSuggestion,
) {
  const database = await readyRuntimeDatabase();
  if (!database) throw new Error("parent companion database unavailable");
  await database.batch([
    {
      sql: `INSERT INTO parent_companion_suggestions
        (user_id, suggestion, model_source, generated_at, generated_by_parent_id)
        VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET
        suggestion = excluded.suggestion, model_source = excluded.model_source,
        generated_at = excluded.generated_at, generated_by_parent_id = excluded.generated_by_parent_id`,
      params: [studentId, suggestion.text, suggestion.modelSource, suggestion.generatedAt, parentId],
    },
    {
      sql: `INSERT INTO parent_companion_suggestion_history
        (history_id, user_id, suggestion, model_source, generated_at, generated_by_parent_id) VALUES (?, ?, ?, ?, ?, ?)`,
      params: [crypto.randomUUID(), studentId, suggestion.text, suggestion.modelSource, suggestion.generatedAt, parentId],
    },
    {
      sql: `DELETE FROM parent_companion_suggestion_history WHERE user_id = ? AND history_id NOT IN (
        SELECT history_id FROM parent_companion_suggestion_history WHERE user_id = ? ORDER BY generated_at DESC LIMIT 30
      )`,
      params: [studentId, studentId],
    },
  ]);
}
