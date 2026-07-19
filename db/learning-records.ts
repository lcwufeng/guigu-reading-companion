import { readyRuntimeDatabase } from "./runtime-database";

function clean(value: unknown, limit: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : "";
}

export async function recordChapterAnswer(input: {
  userId: string;
  bookId?: string;
  questionKey?: string;
  bookTitle: string;
  chapterTitle?: string;
  question: string;
  answer: string;
  correct: boolean;
  feedback: string;
  modelSource: "mimo" | "deepseek";
}) {
  const database = await readyRuntimeDatabase();
  if (!database) return;
  await database.run(`INSERT INTO chapter_answer_attempts
    (attempt_id, user_id, book_id, question_key, book_title, chapter_title, question, answer, correct, feedback, model_source, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    crypto.randomUUID(),
    input.userId,
    clean(input.bookId, 80) || null,
    clean(input.questionKey, 240) || null,
    clean(input.bookTitle, 160),
    clean(input.chapterTitle, 160),
    clean(input.question, 500),
    clean(input.answer, 1_000),
    input.correct ? 1 : 0,
    clean(input.feedback, 500),
    input.modelSource,
    Date.now(),
  ]);
}
