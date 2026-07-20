import classicBookManifest from "../app/classic-books-manifest.json";
import { deleteMistakeForUser, removeMistakeAnswerPhotoForUser, removeMistakeQuestionPhotoForUser } from "./mistakes";
import { deleteMistakeImage } from "./mistake-images";
import { getParentCompanionSuggestionHistory, getStoredParentCompanionSuggestion, type StoredParentCompanionSuggestion } from "./parent-companion";
import { buildParentReport, type ParentReportData } from "./parent-reports";
import { extractInterestTopics, getStudentMemory, normalizeInterestTopics, type StudentMemory } from "./student-memory";
import { readyRuntimeDatabase, type RuntimeDatabase } from "./runtime-database";

export type ParentChild = { id: string; displayName: string; relationship: string; linkedAt: number };
export type ParentControls = {
  interestAnalysisEnabled: boolean;
  chatMemoryEnabled: boolean;
  mistakePhotoRetentionDays: number;
  chatClearedAt: number;
};

export type ParentDashboard = {
  parent: { id: string; displayName: string };
  children: ParentChild[];
  selectedChild: ParentChild;
  companionSuggestion: {
    text: string;
    modelSource: string;
    generatedAt: number;
  };
  companionSuggestions: StoredParentCompanionSuggestion[];
  overview: ParentReportData;
  reading: {
    books: Array<{
      bookId: string;
      title: string;
      chapterIndex: number;
      pageIndex: number;
      completed: boolean;
      firstReadAt: number;
      lastReadAt: number;
      completedAt: number | null;
    }>;
    answers: Array<{
      attemptId: string;
      bookTitle: string;
      chapterTitle: string;
      question: string;
      answer: string;
      correct: boolean;
      feedback: string;
      createdAt: number;
    }>;
    records: Array<{ recordId: string; title: string; readDate: string; answer: string; summary: string; createdAt: number }>;
  };
  mistakes: Array<{
    mistakeId: string;
    subject: string;
    question: string;
    wrongAnswer: string;
    correction: string;
    cause: string;
    status: string;
    date: string;
    reviewCount: number;
    imageId: string;
    createdAt: number;
    analysis: { modelSource: string; notice: string; analyzedAt: number } | null;
    attempts: Array<{
      attemptId: string;
      imageId: string;
      recognizedAnswer: string;
      recognizedSteps: string;
      correct: boolean;
      feedback: string;
      createdAt: number;
    }>;
  }>;
  memory: StudentMemory;
  controls: ParentControls;
  deletionRequest: { requestId: string; status: string; requestedAt: number } | null;
};

const knownTitles = new Map<string, string>([
  ["scarecrow-zh", "稻草人"],
  ["grimm-zh", "格林童话"],
  ["andersen-zh", "安徒生童话"],
  ...classicBookManifest.map((book) => [book.slug, book.title] as [string, string]),
]);
const imageIdPattern = /^[0-9a-f-]{36}$/;

export function storedImageId(value: string | null | undefined) {
  if (!value) return "";
  if (imageIdPattern.test(value)) return value;
  try {
    const url = new URL(value, "https://guigu.local");
    const id = url.searchParams.get("id") || "";
    return imageIdPattern.test(id) ? id : "";
  } catch {
    return "";
  }
}

async function databaseOrThrow() {
  const database = await readyRuntimeDatabase();
  if (!database) throw new Error("parent center database unavailable");
  return database;
}

export async function getParentChildren(parentId: string): Promise<ParentChild[]> {
  const database = await databaseOrThrow();
  const rows = await database.all<{ id: string; username: string; relationship: string; created_at: number }>(`SELECT u.id, u.username, l.relationship, l.created_at
    FROM parent_student_links l JOIN app_users u ON u.id = l.student_id
    WHERE l.parent_id = ? ORDER BY l.created_at ASC`, [parentId]);
  return rows.map((row) => ({ id: row.id, displayName: row.username, relationship: row.relationship, linkedAt: row.created_at }));
}

export async function parentCanAccessStudent(parentId: string, studentId: string) {
  const database = await databaseOrThrow();
  return Boolean(await database.first("SELECT 1 AS allowed FROM parent_student_links WHERE parent_id = ? AND student_id = ?", [parentId, studentId]));
}

async function controlsFor(database: RuntimeDatabase, studentId: string): Promise<ParentControls> {
  const row = await database.first<{
    interest_analysis_enabled: number;
    chat_memory_enabled: number;
    mistake_photo_retention_days: number;
    chat_cleared_at: number;
  }>("SELECT * FROM user_parent_controls WHERE user_id = ?", [studentId]);
  return {
    interestAnalysisEnabled: row ? Boolean(row.interest_analysis_enabled) : true,
    chatMemoryEnabled: row ? Boolean(row.chat_memory_enabled) : true,
    mistakePhotoRetentionDays: row?.mistake_photo_retention_days || 365,
    chatClearedAt: row?.chat_cleared_at || 0,
  };
}

export async function getParentDashboard(
  parentId: string,
  parentDisplayName: string,
  requestedStudentId = "",
  days = 7,
): Promise<ParentDashboard | null> {
  const database = await databaseOrThrow();
  const children = await getParentChildren(parentId);
  const selectedChild = children.find((child) => child.id === requestedStudentId) || children[0];
  if (!selectedChild) return null;
  const safeDays = Math.min(90, Math.max(7, Math.floor(days) || 7));
  const to = Date.now();
  const from = to - safeDays * 24 * 60 * 60 * 1000;
  const overview = await buildParentReport(selectedChild.id, { from, to });
  if (!overview) return null;

  const [progress, metrics, answerRows, recordRows, mistakeRows, analysisRows, attemptRows, memory, controls, deletionRequest, companionSuggestion, companionSuggestions] = await Promise.all([
    database.all<{ book_id: string; chapter_index: number; page_index: number; completed: number; updated_at: number }>(
      "SELECT * FROM user_reading_progress WHERE user_id = ? ORDER BY updated_at DESC",
      [selectedChild.id],
    ),
    database.all<{ book_id: string; first_read_at: number; last_read_at: number; completed_at: number | null }>(
      "SELECT * FROM user_reading_metrics WHERE user_id = ? ORDER BY last_read_at DESC",
      [selectedChild.id],
    ),
    database.all<{ attempt_id: string; book_id: string | null; book_title: string; chapter_title: string; question: string; answer: string; correct: number; feedback: string; created_at: number }>(`SELECT attempt_id, book_id, book_title, chapter_title, question, answer, correct, feedback, created_at
      FROM chapter_answer_attempts WHERE user_id = ? ORDER BY created_at DESC LIMIT 120`, [selectedChild.id]),
    database.all<{ record_id: string; title: string; read_date: string; answer: string; summary: string; created_at: number }>(`SELECT record_id, title, read_date, answer, summary, created_at
      FROM user_reading_records WHERE user_id = ? ORDER BY created_at DESC LIMIT 80`, [selectedChild.id]),
    database.all<{ mistake_id: string; subject: string; question: string; wrong_answer: string; correction: string; cause: string; status: string; mistake_date: string; review_count: number; image_url: string | null; created_at: number }>(`SELECT * FROM user_mistakes
      WHERE user_id = ? ORDER BY updated_at DESC LIMIT 120`, [selectedChild.id]),
    database.all<{ mistake_id: string; model_source: string; notice: string; analyzed_at: number }>(`SELECT mistake_id, model_source, notice, analyzed_at
      FROM user_mistake_analyses WHERE user_id = ?`, [selectedChild.id]),
    database.all<{ attempt_id: string; mistake_id: string; answer_image_url: string; recognized_answer: string; recognized_steps: string; correct: number; feedback: string; created_at: number }>(`SELECT attempt_id, mistake_id, answer_image_url, recognized_answer, recognized_steps, correct, feedback, created_at
      FROM user_mistake_answer_attempts WHERE user_id = ? ORDER BY created_at DESC LIMIT 240`, [selectedChild.id]),
    getStudentMemory(selectedChild.id),
    controlsFor(database, selectedChild.id),
    database.first<{ request_id: string; status: string; requested_at: number }>(`SELECT request_id, status, requested_at FROM parent_deletion_requests
      WHERE parent_id = ? AND student_id = ? ORDER BY requested_at DESC LIMIT 1`, [parentId, selectedChild.id]),
    getStoredParentCompanionSuggestion(selectedChild.id),
    getParentCompanionSuggestionHistory(selectedChild.id, 8),
  ]);

  const metricMap = new Map(metrics.map((row) => [row.book_id, row]));
  const attemptTitleMap = new Map(answerRows.filter((row) => row.book_id).map((row) => [row.book_id as string, row.book_title]));
  const analysisMap = new Map(analysisRows.map((row) => [row.mistake_id, row]));
  const attemptsByMistake = new Map<string, typeof attemptRows>();
  for (const attempt of attemptRows) attemptsByMistake.set(attempt.mistake_id, [...(attemptsByMistake.get(attempt.mistake_id) || []), attempt]);

  const effectiveCompanionSuggestion = companionSuggestion || {
    text: `今天可以和${selectedChild.displayName}一起选一篇短故事，安静共读十分钟。把选择权交给孩子，读完只问一句：“哪个地方让你最想讲给我听？”`,
    modelSource: "local-fallback",
    generatedAt: 0,
  };

  return {
    parent: { id: parentId, displayName: parentDisplayName },
    children,
    selectedChild,
    companionSuggestion: effectiveCompanionSuggestion,
    companionSuggestions: companionSuggestions.length ? companionSuggestions : [effectiveCompanionSuggestion].filter((item) => item.generatedAt > 0),
    overview,
    reading: {
      books: progress.map((row) => {
        const metric = metricMap.get(row.book_id);
        return {
          bookId: row.book_id,
          title: knownTitles.get(row.book_id) || attemptTitleMap.get(row.book_id) || row.book_id,
          chapterIndex: row.chapter_index,
          pageIndex: row.page_index,
          completed: Boolean(row.completed),
          firstReadAt: metric?.first_read_at || row.updated_at,
          lastReadAt: metric?.last_read_at || row.updated_at,
          completedAt: metric?.completed_at || null,
        };
      }),
      answers: answerRows.map((row) => ({
        attemptId: row.attempt_id,
        bookTitle: row.book_title,
        chapterTitle: row.chapter_title,
        question: row.question,
        answer: row.answer,
        correct: Boolean(row.correct),
        feedback: row.feedback,
        createdAt: row.created_at,
      })),
      records: recordRows.map((row) => ({ recordId: row.record_id, title: row.title, readDate: row.read_date, answer: row.answer, summary: row.summary, createdAt: row.created_at })),
    },
    mistakes: mistakeRows.map((row) => {
      const analysis = analysisMap.get(row.mistake_id);
      return {
        mistakeId: row.mistake_id,
        subject: row.subject,
        question: row.question,
        wrongAnswer: row.wrong_answer,
        correction: row.correction,
        cause: row.cause,
        status: row.status,
        date: row.mistake_date,
        reviewCount: row.review_count,
        imageId: storedImageId(row.image_url),
        createdAt: row.created_at,
        analysis: analysis ? { modelSource: analysis.model_source, notice: analysis.notice, analyzedAt: analysis.analyzed_at } : null,
        attempts: (attemptsByMistake.get(row.mistake_id) || []).map((attempt) => ({
          attemptId: attempt.attempt_id,
          imageId: storedImageId(attempt.answer_image_url),
          recognizedAnswer: attempt.recognized_answer,
          recognizedSteps: attempt.recognized_steps,
          correct: Boolean(attempt.correct),
          feedback: attempt.feedback,
          createdAt: attempt.created_at,
        })),
      };
    }),
    memory,
    controls,
    deletionRequest: deletionRequest ? { requestId: deletionRequest.request_id, status: deletionRequest.status, requestedAt: deletionRequest.requested_at } : null,
  };
}

function cleanFact(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 140) : "";
}

export async function updateParentControls(studentId: string, input: Partial<ParentControls>) {
  const database = await databaseOrThrow();
  const current = await controlsFor(database, studentId);
  const retention = [30, 90, 180, 365].includes(Number(input.mistakePhotoRetentionDays))
    ? Number(input.mistakePhotoRetentionDays)
    : current.mistakePhotoRetentionDays;
  await database.run(`INSERT INTO user_parent_controls
    (user_id, interest_analysis_enabled, chat_memory_enabled, mistake_photo_retention_days, chat_cleared_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET
    interest_analysis_enabled = excluded.interest_analysis_enabled,
    chat_memory_enabled = excluded.chat_memory_enabled,
    mistake_photo_retention_days = excluded.mistake_photo_retention_days,
    chat_cleared_at = excluded.chat_cleared_at, updated_at = excluded.updated_at`, [
    studentId,
    input.interestAnalysisEnabled ?? current.interestAnalysisEnabled ? 1 : 0,
    input.chatMemoryEnabled ?? current.chatMemoryEnabled ? 1 : 0,
    retention,
    current.chatClearedAt,
    Date.now(),
  ]);
  if (input.mistakePhotoRetentionDays !== undefined) {
    const cutoff = Date.now() - retention * 24 * 60 * 60 * 1000;
    const [mistakePhotos, answerPhotos] = await Promise.all([
      database.all<{ image_url: string }>(`SELECT image_url FROM user_mistakes
        WHERE user_id = ? AND image_url IS NOT NULL AND created_at < ?`, [studentId, cutoff]),
      database.all<{ answer_image_url: string }>(`SELECT answer_image_url FROM user_mistake_answer_attempts
        WHERE user_id = ? AND answer_image_url <> '' AND created_at < ?`, [studentId, cutoff]),
    ]);
    await database.batch([
      { sql: "UPDATE user_mistakes SET image_url = NULL, updated_at = ? WHERE user_id = ? AND created_at < ?", params: [Date.now(), studentId, cutoff] },
      { sql: "UPDATE user_mistake_answer_attempts SET answer_image_url = '' WHERE user_id = ? AND created_at < ?", params: [studentId, cutoff] },
    ]);
    const imageIds = [
      ...mistakePhotos.map((photo) => storedImageId(photo.image_url)),
      ...answerPhotos.map((photo) => storedImageId(photo.answer_image_url)),
    ].filter(Boolean);
    await Promise.all(imageIds.map((imageId) => deleteMistakeImage(studentId, imageId).catch(() => undefined)));
  }
}

export async function clearStudentChat(studentId: string) {
  const database = await databaseOrThrow();
  const controls = await controlsFor(database, studentId);
  const now = Date.now();
  await database.batch([
    { sql: "DELETE FROM user_chat_messages WHERE user_id = ?", params: [studentId] },
    { sql: `INSERT INTO user_parent_controls
      (user_id, interest_analysis_enabled, chat_memory_enabled, mistake_photo_retention_days, chat_cleared_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET chat_cleared_at = excluded.chat_cleared_at, updated_at = excluded.updated_at`,
      params: [studentId, controls.interestAnalysisEnabled ? 1 : 0, controls.chatMemoryEnabled ? 1 : 0, controls.mistakePhotoRetentionDays, now, now] },
  ]);
}

export async function addParentMemoryFact(studentId: string, factType: "learned" | "interest", value: unknown) {
  const rawFact = cleanFact(value);
  const explicitTopics = factType === "interest" ? extractInterestTopics(rawFact) : [];
  const facts = factType === "interest" ? (explicitTopics.length ? explicitTopics : normalizeInterestTopics(rawFact)) : [rawFact].filter(Boolean);
  if (!facts.length) throw new Error("empty fact");
  const database = await databaseOrThrow();
  const now = Date.now();
  await database.batch(facts.map((fact) => ({
    sql: `INSERT INTO user_memory_facts
      (user_id, fact_type, fact_value, source_type, created_at, last_used_at, expires_at)
      VALUES (?, ?, ?, 'parent', ?, ?, NULL)
      ON CONFLICT(user_id, fact_type, fact_value) DO UPDATE SET last_used_at = excluded.last_used_at`,
    params: [studentId, factType, fact, now, now],
  })));
}

export async function deleteParentMemoryItem(studentId: string, kind: "learned" | "interest" | "book" | "activity", value: string) {
  const database = await databaseOrThrow();
  if (kind === "learned" || kind === "interest") {
    if (kind === "interest") {
      const rows = await database.all<{ fact_value: string }>("SELECT fact_value FROM user_memory_facts WHERE user_id = ? AND fact_type = 'interest'", [studentId]);
      const storedValues = rows.filter((row) => normalizeInterestTopics(row.fact_value).includes(value)).map((row) => row.fact_value);
      await database.batch(storedValues.map((storedValue) => ({ sql: "DELETE FROM user_memory_facts WHERE user_id = ? AND fact_type = 'interest' AND fact_value = ?", params: [studentId, storedValue] })));
    } else await database.run("DELETE FROM user_memory_facts WHERE user_id = ? AND fact_type = ? AND fact_value = ?", [studentId, kind, value]);
  } else if (kind === "book") {
    await database.run("DELETE FROM user_memory_books WHERE user_id = ? AND title = ?", [studentId, value]);
  } else {
    await database.run("DELETE FROM user_activity_log WHERE user_id = ? AND activity_id = ?", [studentId, value]);
  }
}

export async function requestStudentDeletion(parentId: string, studentId: string) {
  const database = await databaseOrThrow();
  const pending = await database.first<{ request_id: string }>(`SELECT request_id FROM parent_deletion_requests
    WHERE parent_id = ? AND student_id = ? AND status = 'pending'`, [parentId, studentId]);
  if (pending) return pending.request_id;
  const requestId = crypto.randomUUID();
  await database.run(`INSERT INTO parent_deletion_requests
    (request_id, parent_id, student_id, status, requested_at, resolved_at) VALUES (?, ?, ?, 'pending', ?, NULL)`,
  [requestId, parentId, studentId, Date.now()]);
  return requestId;
}

export async function cancelStudentDeletion(parentId: string, studentId: string) {
  const database = await databaseOrThrow();
  await database.run(`UPDATE parent_deletion_requests SET status = 'cancelled', resolved_at = ?
    WHERE parent_id = ? AND student_id = ? AND status = 'pending'`, [Date.now(), parentId, studentId]);
}

export async function deleteParentMistake(studentId: string, mistakeId: string) {
  const imageUrls = await deleteMistakeForUser(studentId, mistakeId);
  if (!imageUrls) return false;
  await Promise.all(imageUrls.map((url) => storedImageId(url)).filter(Boolean).map((imageId) => deleteMistakeImage(studentId, imageId)));
  return true;
}

export async function deleteParentMistakePhoto(studentId: string, mistakeId: string) {
  const imageUrl = await removeMistakeQuestionPhotoForUser(studentId, mistakeId);
  const imageId = storedImageId(imageUrl);
  if (imageId) await deleteMistakeImage(studentId, imageId);
  return Boolean(imageUrl);
}

export async function deleteParentAttemptPhoto(studentId: string, attemptId: string) {
  const imageUrl = await removeMistakeAnswerPhotoForUser(studentId, attemptId);
  const imageId = storedImageId(imageUrl);
  if (imageId) await deleteMistakeImage(studentId, imageId);
  return Boolean(imageUrl);
}
