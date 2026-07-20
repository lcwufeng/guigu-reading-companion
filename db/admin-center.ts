import classicBookManifest from "../app/classic-books-manifest.json";
import { passwordHash } from "./auth";
import { getImportedBookTitleMap } from "./book-imports";
import { getAdminModelConfigs, type AdminModelConfig } from "./model-config";
import { buildParentReport, type ParentReportData } from "./parent-reports";
import { getStudentMemory, type StudentMemory } from "./student-memory";
import { readyRuntimeDatabase } from "./runtime-database";

export type ManagedAccountType = "student" | "parent";
export type ManagedAccountStatus = "active" | "disabled";

export type AdminAccountRow = {
  id: string;
  username: string;
  status: ManagedAccountStatus;
  mustResetPassword: boolean;
  lastLoginAt: number;
  createdAt: number;
};

export type AdminAccountsData = {
  students: AdminAccountRow[];
  parents: Array<AdminAccountRow & { children: Array<{ id: string; username: string; relationship: string }> }>;
  bindings: Array<{ parentId: string; parentName: string; studentId: string; studentName: string; relationship: string; createdAt: number }>;
};

export type AdminOverviewData = {
  counts: { students: number; parents: number; bindings: number; activeToday: number };
  learningToday: { readingStudents: number; chapterAnswers: number; mistakeReviews: number; completedTaskStudents: number };
  accountStatus: { disabledStudents: number; disabledParents: number; mustResetStudents: number; mustResetParents: number };
  aiToday: { success: number; failed: number; fallback: number };
  recentAudits: AdminAuditRow[];
};

export type AdminAuditRow = {
  eventId: string;
  adminUsername: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  ipAddress: string;
  createdAt: number;
};

export type AdminLearningData = {
  student: AdminAccountRow;
  overview: ParentReportData;
  reading: Array<{ bookId: string; title: string; chapterIndex: number; pageIndex: number; completed: boolean; updatedAt: number }>;
  answers: Array<{ attemptId: string; bookTitle: string; chapterTitle: string; question: string; answer: string; correct: boolean; feedback: string; modelSource: string; createdAt: number }>;
  mistakes: Array<{ mistakeId: string; subject: string; question: string; cause: string; status: string; reviewCount: number; updatedAt: number }>;
  memory: StudentMemory;
};

export type AdminAiData = {
  providers: AdminModelConfig[];
  summary24h: Array<{ service: string; success: number; failed: number; fallback: number; averageDurationMs: number; latestAt: number }>;
  recentEvents: Array<{ eventId: string; service: string; operation: string; provider: string; status: string; durationMs: number; detail: string; createdAt: number }>;
  usageToday: { readingAnswers: number; mistakeScans: number; mistakeReviews: number; parentSuggestions: number };
};

const bookTitles = new Map<string, string>([
  ["scarecrow-zh", "稻草人"], ["grimm-zh", "格林童话"], ["andersen-zh", "安徒生童话"],
  ...classicBookManifest.map((book) => [book.slug, book.title] as [string, string]),
]);

async function databaseOrThrow() {
  const database = await readyRuntimeDatabase();
  if (!database) throw new Error("admin center database unavailable");
  return database;
}

function chinaDayStart(timestamp = Date.now()) {
  const shifted = new Date(timestamp + 8 * 60 * 60 * 1000);
  shifted.setUTCHours(0, 0, 0, 0);
  return shifted.getTime() - 8 * 60 * 60 * 1000;
}

function accountRow(row: { id: string; username: string; status: string | null; must_reset_password: number; last_login_at: number | null; created_at: number }): AdminAccountRow {
  return {
    id: row.id, username: row.username, status: row.status === "disabled" ? "disabled" : "active",
    mustResetPassword: Boolean(row.must_reset_password), lastLoginAt: row.last_login_at || 0, createdAt: row.created_at,
  };
}

export async function getAdminOverview(): Promise<AdminOverviewData> {
  const database = await databaseOrThrow();
  const today = chinaDayStart();
  const [students, parents, bindings, active, reading, answers, reviews, tasks, accountStatus, aiStatus, recentAudits] = await Promise.all([
    database.first<{ count: number }>("SELECT COUNT(*) AS count FROM app_users"),
    database.first<{ count: number }>("SELECT COUNT(*) AS count FROM app_parent_users"),
    database.first<{ count: number }>("SELECT COUNT(*) AS count FROM parent_student_links"),
    database.first<{ count: number }>("SELECT COUNT(*) AS count FROM user_state_meta WHERE updated_at >= ?", [today]),
    database.first<{ count: number }>("SELECT COUNT(DISTINCT user_id) AS count FROM user_reading_metrics WHERE last_read_at >= ?", [today]),
    database.first<{ count: number }>("SELECT COUNT(*) AS count FROM chapter_answer_attempts WHERE created_at >= ?", [today]),
    database.first<{ count: number }>("SELECT COUNT(*) AS count FROM user_mistake_answer_attempts WHERE created_at >= ?", [today]),
    database.first<{ count: number }>(`SELECT COUNT(*) AS count FROM user_daily_state WHERE updated_at >= ?
      AND feed_progress >= feed_target AND swim_progress >= swim_target AND reading_progress >= reading_target AND mistake_progress >= mistake_target`, [today]),
    database.first<{ disabled_students: number; disabled_parents: number; reset_students: number; reset_parents: number }>(`SELECT
      (SELECT COUNT(*) FROM account_admin_state WHERE account_type = 'student' AND status = 'disabled') AS disabled_students,
      (SELECT COUNT(*) FROM account_admin_state WHERE account_type = 'parent' AND status = 'disabled') AS disabled_parents,
      (SELECT COUNT(*) FROM app_users WHERE must_reset_password = 1) AS reset_students,
      (SELECT COUNT(*) FROM app_parent_users WHERE must_reset_password = 1) AS reset_parents`),
    database.first<{ success: number; failed: number; fallback: number }>(`SELECT
      COALESCE(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END), 0) AS success,
      COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS failed,
      COALESCE(SUM(CASE WHEN status = 'fallback' THEN 1 ELSE 0 END), 0) AS fallback
      FROM service_health_events WHERE created_at >= ?`, [today]),
    getAdminAuditLogs(8),
  ]);
  return {
    counts: { students: students?.count || 0, parents: parents?.count || 0, bindings: bindings?.count || 0, activeToday: active?.count || 0 },
    learningToday: { readingStudents: reading?.count || 0, chapterAnswers: answers?.count || 0, mistakeReviews: reviews?.count || 0, completedTaskStudents: tasks?.count || 0 },
    accountStatus: {
      disabledStudents: accountStatus?.disabled_students || 0, disabledParents: accountStatus?.disabled_parents || 0,
      mustResetStudents: accountStatus?.reset_students || 0, mustResetParents: accountStatus?.reset_parents || 0,
    },
    aiToday: { success: aiStatus?.success || 0, failed: aiStatus?.failed || 0, fallback: aiStatus?.fallback || 0 },
    recentAudits,
  };
}

export async function getAdminAccounts(search = ""): Promise<AdminAccountsData> {
  const database = await databaseOrThrow();
  const pattern = `%${search.replace(/[%_]/g, "").slice(0, 30)}%`;
  const [studentRows, parentRows, links] = await Promise.all([
    database.all<{ id: string; username: string; status: string | null; must_reset_password: number; last_login_at: number | null; created_at: number }>(`SELECT u.id, u.username, s.status, u.must_reset_password,
      MAX(COALESCE(s.last_login_at, 0), COALESCE((SELECT MAX(created_at) FROM app_sessions login_session WHERE login_session.user_id = u.id), 0)) AS last_login_at, u.created_at
      FROM app_users u LEFT JOIN account_admin_state s ON s.account_type = 'student' AND s.account_id = u.id
      WHERE u.username LIKE ? ORDER BY u.created_at DESC LIMIT 200`, [pattern]),
    database.all<{ id: string; username: string; status: string | null; must_reset_password: number; last_login_at: number | null; created_at: number }>(`SELECT u.id, u.username, s.status, u.must_reset_password,
      MAX(COALESCE(s.last_login_at, 0), COALESCE((SELECT MAX(created_at) FROM app_parent_sessions login_session WHERE login_session.parent_id = u.id), 0)) AS last_login_at, u.created_at
      FROM app_parent_users u LEFT JOIN account_admin_state s ON s.account_type = 'parent' AND s.account_id = u.id
      WHERE u.username LIKE ? ORDER BY u.created_at DESC LIMIT 200`, [pattern]),
    database.all<{ parent_id: string; parent_name: string; student_id: string; student_name: string; relationship: string; created_at: number }>(`SELECT l.parent_id, p.username AS parent_name, l.student_id, u.username AS student_name, l.relationship, l.created_at
      FROM parent_student_links l JOIN app_parent_users p ON p.id = l.parent_id JOIN app_users u ON u.id = l.student_id
      ORDER BY l.created_at DESC LIMIT 400`),
  ]);
  const bindings = links.map((row) => ({ parentId: row.parent_id, parentName: row.parent_name, studentId: row.student_id, studentName: row.student_name, relationship: row.relationship, createdAt: row.created_at }));
  return {
    students: studentRows.map(accountRow),
    parents: parentRows.map((row) => ({ ...accountRow(row), children: bindings.filter((link) => link.parentId === row.id).map((link) => ({ id: link.studentId, username: link.studentName, relationship: link.relationship })) })),
    bindings,
  };
}

export async function getAdminLearning(studentId: string, days = 14): Promise<AdminLearningData | null> {
  const database = await databaseOrThrow();
  const row = await database.first<{ id: string; username: string; status: string | null; must_reset_password: number; last_login_at: number | null; created_at: number }>(`SELECT u.id, u.username, s.status, u.must_reset_password,
    MAX(COALESCE(s.last_login_at, 0), COALESCE((SELECT MAX(created_at) FROM app_sessions login_session WHERE login_session.user_id = u.id), 0)) AS last_login_at, u.created_at
    FROM app_users u LEFT JOIN account_admin_state s ON s.account_type = 'student' AND s.account_id = u.id WHERE u.id = ?`, [studentId]);
  if (!row) return null;
  const now = Date.now();
  const overview = await buildParentReport(studentId, { from: now - Math.min(90, Math.max(7, days)) * 86400000, to: now });
  if (!overview) return null;
  const [reading, answers, mistakes, memory, importedTitles] = await Promise.all([
    database.all<{ book_id: string; chapter_index: number; page_index: number; completed: number; updated_at: number }>("SELECT * FROM user_reading_progress WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100", [studentId]),
    database.all<{ attempt_id: string; book_title: string; chapter_title: string; question: string; answer: string; correct: number; feedback: string; model_source: string; created_at: number }>(`SELECT attempt_id, book_title, chapter_title, question, answer, correct, feedback, model_source, created_at
      FROM chapter_answer_attempts WHERE user_id = ? ORDER BY created_at DESC LIMIT 80`, [studentId]),
    database.all<{ mistake_id: string; subject: string; question: string; cause: string; status: string; review_count: number; updated_at: number }>(`SELECT mistake_id, subject, question, cause, status, review_count, updated_at
      FROM user_mistakes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100`, [studentId]),
    getStudentMemory(studentId),
    getImportedBookTitleMap(),
  ]);
  return {
    student: accountRow(row), overview,
    reading: reading.map((item) => ({ bookId: item.book_id, title: bookTitles.get(item.book_id) || importedTitles.get(item.book_id) || item.book_id, chapterIndex: item.chapter_index, pageIndex: item.page_index, completed: Boolean(item.completed), updatedAt: item.updated_at })),
    answers: answers.map((item) => ({ attemptId: item.attempt_id, bookTitle: item.book_title, chapterTitle: item.chapter_title, question: item.question, answer: item.answer, correct: Boolean(item.correct), feedback: item.feedback, modelSource: item.model_source, createdAt: item.created_at })),
    mistakes: mistakes.map((item) => ({ mistakeId: item.mistake_id, subject: item.subject, question: item.question, cause: item.cause, status: item.status, reviewCount: item.review_count, updatedAt: item.updated_at })),
    memory,
  };
}

export async function getAdminAiData(): Promise<AdminAiData> {
  const database = await databaseOrThrow();
  const now = Date.now();
  const since = now - 24 * 60 * 60 * 1000;
  const today = chinaDayStart(now);
  const [providers, summaryRows, recentRows, reading, scans, reviews, suggestions] = await Promise.all([
    getAdminModelConfigs(),
    database.all<{ service: string; success: number; failed: number; fallback: number; average_duration: number; latest_at: number }>(`SELECT service,
      COALESCE(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END), 0) AS success,
      COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS failed,
      COALESCE(SUM(CASE WHEN status = 'fallback' THEN 1 ELSE 0 END), 0) AS fallback,
      COALESCE(AVG(duration_ms), 0) AS average_duration, MAX(created_at) AS latest_at
      FROM service_health_events WHERE created_at >= ? GROUP BY service ORDER BY latest_at DESC`, [since]),
    database.all<{ event_id: string; service: string; operation: string; provider: string; status: string; duration_ms: number; detail: string; created_at: number }>(`SELECT * FROM service_health_events ORDER BY created_at DESC LIMIT 80`),
    database.first<{ count: number }>("SELECT COUNT(*) AS count FROM chapter_answer_attempts WHERE created_at >= ?", [today]),
    database.first<{ count: number }>("SELECT COUNT(*) AS count FROM user_mistake_analyses WHERE analyzed_at >= ?", [today]),
    database.first<{ count: number }>("SELECT COUNT(*) AS count FROM user_mistake_answer_attempts WHERE created_at >= ?", [today]),
    database.first<{ count: number }>("SELECT COUNT(*) AS count FROM parent_companion_suggestions WHERE generated_at >= ?", [today]),
  ]);
  return {
    providers,
    summary24h: summaryRows.map((item) => ({ service: item.service, success: item.success, failed: item.failed, fallback: item.fallback, averageDurationMs: Math.round(item.average_duration), latestAt: item.latest_at || 0 })),
    recentEvents: recentRows.map((item) => ({ eventId: item.event_id, service: item.service, operation: item.operation, provider: item.provider, status: item.status, durationMs: item.duration_ms, detail: item.detail, createdAt: item.created_at })),
    usageToday: { readingAnswers: reading?.count || 0, mistakeScans: scans?.count || 0, mistakeReviews: reviews?.count || 0, parentSuggestions: suggestions?.count || 0 },
  };
}

export async function getAdminAuditLogs(limit = 100): Promise<AdminAuditRow[]> {
  const database = await databaseOrThrow();
  const rows = await database.all<{ event_id: string; admin_username: string; action: string; target_type: string; target_id: string; summary: string; ip_address: string; created_at: number }>(`SELECT event_id, admin_username, action, target_type, target_id, summary, ip_address, created_at
    FROM admin_audit_logs ORDER BY created_at DESC LIMIT ?`, [Math.min(300, Math.max(1, limit))]);
  return rows.map((row) => ({ eventId: row.event_id, adminUsername: row.admin_username, action: row.action, targetType: row.target_type, targetId: row.target_id, summary: row.summary, ipAddress: row.ip_address, createdAt: row.created_at }));
}

function validateUsername(value: unknown) {
  const username = typeof value === "string" ? value.replace(/\s+/g, "").trim().slice(0, 20) : "";
  if (username.length < 2 || /[<>/\\]/.test(username)) throw new Error("账号名称需要 2～20 个字符");
  return username;
}

function temporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export async function createManagedAccount(adminId: string, type: ManagedAccountType, rawUsername: unknown, linkedStudentId = "", relationship = "家长") {
  const database = await databaseOrThrow();
  const username = validateUsername(rawUsername);
  const table = type === "student" ? "app_users" : "app_parent_users";
  if (await database.first(`SELECT id FROM ${table} WHERE username = ?`, [username])) throw new Error("这个账号已经存在");
  if (type === "parent" && linkedStudentId && !await database.first("SELECT id FROM app_users WHERE id = ?", [linkedStudentId])) throw new Error("绑定的学生不存在");
  const id = `${type}-${crypto.randomUUID()}`;
  const password = temporaryPassword();
  const now = Date.now();
  const statements = [
    { sql: `INSERT INTO ${table} (id, username, password_hash, must_reset_password, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)`, params: [id, username, await passwordHash(password), now, now] },
    { sql: "INSERT INTO account_admin_state (account_type, account_id, status, last_login_at, created_by_admin_id, updated_at) VALUES (?, ?, 'active', 0, ?, ?)", params: [type, id, adminId, now] },
  ];
  if (type === "parent" && linkedStudentId) statements.push({
    sql: "INSERT INTO parent_student_links (parent_id, student_id, relationship, created_at) VALUES (?, ?, ?, ?)",
    params: [id, linkedStudentId, validateRelationship(relationship), now],
  });
  await database.batch(statements);
  return { id, username, temporaryPassword: password };
}

export async function resetManagedAccountPassword(type: ManagedAccountType, accountId: string) {
  const database = await databaseOrThrow();
  const table = type === "student" ? "app_users" : "app_parent_users";
  const sessionTable = type === "student" ? "app_sessions" : "app_parent_sessions";
  const sessionColumn = type === "student" ? "user_id" : "parent_id";
  const account = await database.first<{ username: string }>(`SELECT username FROM ${table} WHERE id = ?`, [accountId]);
  if (!account) throw new Error("账号不存在");
  const password = temporaryPassword();
  const now = Date.now();
  await database.batch([
    { sql: `UPDATE ${table} SET password_hash = ?, must_reset_password = 1, updated_at = ? WHERE id = ?`, params: [await passwordHash(password), now, accountId] },
    { sql: `DELETE FROM ${sessionTable} WHERE ${sessionColumn} = ?`, params: [accountId] },
  ]);
  return { id: accountId, username: account.username, temporaryPassword: password };
}

export async function setManagedAccountStatus(type: ManagedAccountType, accountId: string, status: ManagedAccountStatus) {
  const database = await databaseOrThrow();
  const table = type === "student" ? "app_users" : "app_parent_users";
  const sessionTable = type === "student" ? "app_sessions" : "app_parent_sessions";
  const sessionColumn = type === "student" ? "user_id" : "parent_id";
  if (!await database.first(`SELECT id FROM ${table} WHERE id = ?`, [accountId])) throw new Error("账号不存在");
  await database.batch([
    { sql: `INSERT INTO account_admin_state (account_type, account_id, status, last_login_at, created_by_admin_id, updated_at)
      VALUES (?, ?, ?, 0, NULL, ?) ON CONFLICT(account_type, account_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`, params: [type, accountId, status, Date.now()] },
    ...(status === "disabled" ? [{ sql: `DELETE FROM ${sessionTable} WHERE ${sessionColumn} = ?`, params: [accountId] }] : []),
  ]);
}

function validateRelationship(value: unknown) {
  const relationship = typeof value === "string" ? value.replace(/\s+/g, "").slice(0, 12) : "";
  return relationship || "家长";
}

export async function createParentStudentBinding(parentId: string, studentId: string, relationship: unknown) {
  const database = await databaseOrThrow();
  const [parent, student] = await Promise.all([
    database.first("SELECT id FROM app_parent_users WHERE id = ?", [parentId]),
    database.first("SELECT id FROM app_users WHERE id = ?", [studentId]),
  ]);
  if (!parent || !student) throw new Error("账号不存在");
  await database.run(`INSERT INTO parent_student_links (parent_id, student_id, relationship, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(parent_id, student_id) DO UPDATE SET relationship = excluded.relationship`, [parentId, studentId, validateRelationship(relationship), Date.now()]);
}

export async function removeParentStudentBinding(parentId: string, studentId: string) {
  const database = await databaseOrThrow();
  await database.run("DELETE FROM parent_student_links WHERE parent_id = ? AND student_id = ?", [parentId, studentId]);
}

export async function managedAccountIsActive(type: ManagedAccountType, accountId: string) {
  const database = await readyRuntimeDatabase();
  if (!database) return true;
  const state = await database.first<{ status: string }>("SELECT status FROM account_admin_state WHERE account_type = ? AND account_id = ?", [type, accountId]);
  return state?.status !== "disabled";
}
