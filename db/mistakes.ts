import { getUserState, saveUserState } from "./user-state";
import { readyRuntimeDatabase, type RuntimeDatabase, type SqlStatement } from "./runtime-database";

export type StoredMistake = {
  id: number;
  subject: string;
  question: string;
  wrongAnswer: string;
  correction: string;
  cause: string;
  status: "new" | "reviewing" | "mastered";
  date: string;
  reviewCount: number;
  imageData?: string;
};

export type MistakeReviewAttempt = {
  answerImageUrl: string;
  recognizedAnswer: string;
  recognizedSteps: string;
  correct: boolean;
  feedback: string;
  notice: string;
  modelSource: string;
};

type UnknownRecord = Record<string, unknown>;

function object(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function list(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function status(value: unknown): StoredMistake["status"] {
  return value === "reviewing" || value === "mastered" ? value : "new";
}

function mistakeFromObject(value: unknown): StoredMistake | null {
  const row = object(value);
  const id = number(row.id);
  const question = text(row.question, 2_000);
  if (!id || !question) return null;
  return {
    id,
    subject: text(row.subject, 80) || "其他",
    question,
    wrongAnswer: text(row.wrongAnswer, 1_000),
    correction: text(row.correction, 2_000),
    cause: text(row.cause, 1_000) || "还不确定",
    status: status(row.status),
    date: text(row.date, 30),
    reviewCount: Math.max(0, number(row.reviewCount)),
    ...(text(row.imageData, 600) ? { imageData: text(row.imageData, 600) } : {}),
  };
}

async function databaseMistake(database: RuntimeDatabase, userId: string, mistakeId: string) {
  const row = await database.first<{
    mistake_id: string;
    subject: string;
    question: string;
    wrong_answer: string;
    correction: string;
    cause: string;
    status: string;
    mistake_date: string;
    review_count: number;
    image_url: string | null;
  }>("SELECT * FROM user_mistakes WHERE user_id = ? AND mistake_id = ?", [userId, mistakeId]);
  if (!row) return null;
  return {
    id: Number(row.mistake_id),
    subject: row.subject,
    question: row.question,
    wrongAnswer: row.wrong_answer,
    correction: row.correction,
    cause: row.cause,
    status: status(row.status),
    date: row.mistake_date,
    reviewCount: row.review_count,
    ...(row.image_url ? { imageData: row.image_url } : {}),
  } satisfies StoredMistake;
}

export async function getMistakeForUser(userId: string, mistakeId: string) {
  const database = await readyRuntimeDatabase();
  if (database) return databaseMistake(database, userId, mistakeId);
  const state = object(await getUserState(userId));
  return list(state.mistakes).map(mistakeFromObject).find((mistake) => String(mistake?.id) === mistakeId) || null;
}

export async function createMistakeForUser(input: {
  userId: string;
  subject: string;
  question: string;
  wrongAnswer: string;
  correction: string;
  cause: string;
  date: string;
  imageUrl: string;
  modelSource: string;
  notice: string;
}) {
  const database = await readyRuntimeDatabase();
  let id = Date.now();
  while (await getMistakeForUser(input.userId, String(id))) id += 1;
  const now = Date.now();
  const record: StoredMistake = {
    id,
    subject: text(input.subject, 80) || "其他",
    question: text(input.question, 2_000),
    wrongAnswer: text(input.wrongAnswer, 1_000),
    correction: text(input.correction, 2_000),
    cause: text(input.cause, 1_000) || "还不确定",
    status: "new",
    date: text(input.date, 30),
    reviewCount: 0,
    imageData: text(input.imageUrl, 600),
  };
  if (database) {
    await database.batch([{
      sql: `INSERT INTO user_mistakes
        (user_id, mistake_id, subject, question, wrong_answer, correction, cause, status, mistake_date, review_count, image_url, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?, 0, ?, ?, ?)`,
      params: [input.userId, String(id), record.subject, record.question, record.wrongAnswer, record.correction,
        record.cause, record.date, record.imageData || null, now, now],
    }, {
      sql: `INSERT INTO user_mistake_analyses
        (user_id, mistake_id, model_source, notice, analyzed_at, confirmed_at) VALUES (?, ?, ?, ?, ?, ?)`,
      params: [input.userId, String(id), text(input.modelSource, 80), text(input.notice, 500), now, now],
    }]);
    return record;
  }
  const state = object(await getUserState(input.userId));
  await saveUserState(input.userId, { ...state, mistakes: [record, ...list(state.mistakes)] }, now);
  return record;
}

export async function recordMistakeReviewForUser(userId: string, mistakeId: string, attempt: MistakeReviewAttempt) {
  const database = await readyRuntimeDatabase();
  const mistake = await getMistakeForUser(userId, mistakeId);
  if (!mistake) return null;
  const now = Date.now();
  const nextStatus: StoredMistake["status"] = attempt.correct ? "mastered" : "reviewing";
  const reviewNumber = mistake.reviewCount + 1;
  const firstMastery = attempt.correct && mistake.status !== "mastered";
  const attemptId = crypto.randomUUID();
  if (database) {
    const pet = await database.first<{ stars: number; boredom: number }>(
      "SELECT stars, boredom FROM user_pet_state WHERE user_id = ?",
      [userId],
    );
    const rewardSourceId = `mistake:${mistakeId}:mastered`;
    const existingReward = await database.first<{ entry_id: string }>(
      "SELECT entry_id FROM user_reward_ledger WHERE user_id = ? AND resource_type = 'stars' AND source_id = ?",
      [userId, rewardSourceId],
    );
    const rewardStars = firstMastery && pet && !existingReward ? 2 : 0;
    const nextStars = (pet?.stars || 0) + rewardStars;
    const nextBoredom = Math.max(0, (pet?.boredom || 0) - (rewardStars ? 5 : 2));
    const statements: SqlStatement[] = [{
      sql: `UPDATE user_mistakes SET status = ?, review_count = ?, updated_at = ?
        WHERE user_id = ? AND mistake_id = ?`,
      params: [nextStatus, reviewNumber, now, userId, mistakeId],
    }, {
      sql: `INSERT INTO user_mistake_answer_attempts
        (attempt_id, user_id, mistake_id, answer_image_url, recognized_answer, recognized_steps,
         correct, feedback, notice, model_source, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [attemptId, userId, mistakeId, text(attempt.answerImageUrl, 600), text(attempt.recognizedAnswer, 1_000),
        text(attempt.recognizedSteps, 2_000), attempt.correct ? 1 : 0, text(attempt.feedback, 1_000),
        text(attempt.notice, 500), text(attempt.modelSource, 80), now],
    }, {
      sql: `INSERT OR IGNORE INTO user_mistake_review_events
        (event_id, user_id, mistake_id, outcome, review_number, reviewed_at) VALUES (?, ?, ?, ?, ?, ?)`,
      params: [`${userId}:${mistakeId}:${reviewNumber}`, userId, mistakeId, nextStatus, reviewNumber, now],
    }];
    if (pet) statements.push({
      sql: "UPDATE user_pet_state SET stars = ?, boredom = ?, updated_at = ? WHERE user_id = ?",
      params: [nextStars, nextBoredom, now, userId],
    });
    if (rewardStars) statements.push({
      sql: `INSERT INTO user_reward_ledger
        (entry_id, user_id, resource_type, amount, balance_after, source_type, source_id, created_at)
        VALUES (?, ?, 'stars', ?, ?, 'mistake-mastered', ?, ?)`,
      params: [crypto.randomUUID(), userId, rewardStars, nextStars, rewardSourceId, now],
    });
    await database.batch(statements);
    return { reviewNumber, status: nextStatus, rewardStars, stars: nextStars, boredom: nextBoredom, attemptId };
  }
  const state = object(await getUserState(userId));
  const currentStars = number(state.stars);
  const currentBoredom = number(state.boredom);
  const rewardStars = firstMastery ? 2 : 0;
  const nextStars = currentStars + rewardStars;
  const nextBoredom = Math.max(0, currentBoredom - (firstMastery ? 5 : 2));
  const mistakes = list(state.mistakes).map((item) => {
    const parsed = mistakeFromObject(item);
    return parsed?.id === mistake.id ? { ...parsed, status: nextStatus, reviewCount: reviewNumber } : item;
  });
  const priorAttempts = list(state.mistakeAnswerAttempts);
  await saveUserState(userId, {
    ...state,
    stars: nextStars,
    boredom: nextBoredom,
    mistakes,
    mistakeAnswerAttempts: [{ attemptId, mistakeId, ...attempt, createdAt: now }, ...priorAttempts].slice(0, 500),
  }, now);
  return { reviewNumber, status: nextStatus, rewardStars, stars: nextStars, boredom: nextBoredom, attemptId };
}

export async function deleteMistakeForUser(userId: string, mistakeId: string) {
  const database = await readyRuntimeDatabase();
  const mistake = await getMistakeForUser(userId, mistakeId);
  if (!mistake) return null;
  if (database) {
    const attemptImages = await database.all<{ answer_image_url: string }>(
      "SELECT answer_image_url FROM user_mistake_answer_attempts WHERE user_id = ? AND mistake_id = ?",
      [userId, mistakeId],
    );
    await database.batch([
      { sql: "DELETE FROM user_mistake_answer_attempts WHERE user_id = ? AND mistake_id = ?", params: [userId, mistakeId] },
      { sql: "DELETE FROM user_mistake_review_events WHERE user_id = ? AND mistake_id = ?", params: [userId, mistakeId] },
      { sql: "DELETE FROM user_mistake_analyses WHERE user_id = ? AND mistake_id = ?", params: [userId, mistakeId] },
      { sql: "DELETE FROM user_mistakes WHERE user_id = ? AND mistake_id = ?", params: [userId, mistakeId] },
    ]);
    return [mistake.imageData || "", ...attemptImages.map((item) => item.answer_image_url)].filter(Boolean);
  }
  const state = object(await getUserState(userId));
  const mistakeAnswerAttempts = list(state.mistakeAnswerAttempts).filter((item) => String(object(item).mistakeId) !== mistakeId);
  const images = [mistake.imageData || "", ...list(state.mistakeAnswerAttempts)
    .filter((item) => String(object(item).mistakeId) === mistakeId)
    .map((item) => text(object(item).answerImageUrl, 600))].filter(Boolean);
  await saveUserState(userId, {
    ...state,
    mistakes: list(state.mistakes).filter((item) => String(object(item).id) !== mistakeId),
    mistakeAnswerAttempts,
  }, Date.now());
  return images;
}

export async function removeMistakeQuestionPhotoForUser(userId: string, mistakeId: string) {
  const database = await readyRuntimeDatabase();
  if (database) {
    const row = await database.first<{ image_url: string | null }>(
      "SELECT image_url FROM user_mistakes WHERE user_id = ? AND mistake_id = ?",
      [userId, mistakeId],
    );
    if (!row?.image_url) return "";
    await database.run("UPDATE user_mistakes SET image_url = NULL, updated_at = ? WHERE user_id = ? AND mistake_id = ?", [Date.now(), userId, mistakeId]);
    return row.image_url;
  }
  const state = object(await getUserState(userId));
  let imageUrl = "";
  const mistakes = list(state.mistakes).map((item) => {
    const parsed = mistakeFromObject(item);
    if (parsed?.id !== Number(mistakeId)) return item;
    imageUrl = parsed.imageData || "";
    const { imageData: _imageData, ...withoutImage } = parsed;
    void _imageData;
    return withoutImage;
  });
  await saveUserState(userId, { ...state, mistakes }, Date.now());
  return imageUrl;
}

export async function removeMistakeAnswerPhotoForUser(userId: string, attemptId: string) {
  const database = await readyRuntimeDatabase();
  if (database) {
    const row = await database.first<{ answer_image_url: string }>(
      "SELECT answer_image_url FROM user_mistake_answer_attempts WHERE user_id = ? AND attempt_id = ?",
      [userId, attemptId],
    );
    if (!row?.answer_image_url) return "";
    await database.run("UPDATE user_mistake_answer_attempts SET answer_image_url = '' WHERE user_id = ? AND attempt_id = ?", [userId, attemptId]);
    return row.answer_image_url;
  }
  const state = object(await getUserState(userId));
  let imageUrl = "";
  const attempts = list(state.mistakeAnswerAttempts).map((item) => {
    const record = object(item);
    if (String(record.attemptId) !== attemptId) return item;
    imageUrl = text(record.answerImageUrl, 600);
    return { ...record, answerImageUrl: "" };
  });
  await saveUserState(userId, { ...state, mistakeAnswerAttempts: attempts }, Date.now());
  return imageUrl;
}
