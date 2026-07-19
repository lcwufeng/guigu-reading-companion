import { readyRuntimeDatabase, type RuntimeDatabase, type SqlStatement } from "./runtime-database";

export type StudentBookMemory = {
  title: string;
  category: string;
  chapter: string;
  lastReadAt: number;
};

export type StudentActivityMemory = {
  activity: string;
  detail: string;
  at: number;
};

export type StudentMemory = {
  studentName: string;
  books: StudentBookMemory[];
  learned: string[];
  interests: string[];
  recentActivities: StudentActivityMemory[];
  updatedAt: number;
};

export type StudentMemoryEvent = {
  type?: "reading" | "learning" | "activity" | "chat";
  title?: string;
  category?: string;
  chapter?: string;
  detail?: string;
  activity?: string;
  message?: string;
};

type LocalMemoryStore = Record<string, StudentMemory>;

const emptyMemory = (): StudentMemory => ({
  studentName: "",
  books: [],
  learned: [],
  interests: [],
  recentActivities: [],
  updatedAt: Date.now(),
});

let localStoreQueue = Promise.resolve();

function cleanText(value: unknown, limit: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : "";
}

function safeMemory(value: unknown): StudentMemory {
  const memory = value && typeof value === "object" ? value as Partial<StudentMemory> : {};
  return {
    studentName: cleanText(memory.studentName, 8),
    books: Array.isArray(memory.books) ? memory.books.slice(-12).map((book) => ({
      title: cleanText(book?.title, 60),
      category: cleanText(book?.category, 60),
      chapter: cleanText(book?.chapter, 80),
      lastReadAt: Math.max(0, Number(book?.lastReadAt) || 0),
    })).filter((book) => book.title) : [],
    learned: Array.isArray(memory.learned) ? memory.learned.slice(-16).map((item) => cleanText(item, 140)).filter(Boolean) : [],
    interests: Array.isArray(memory.interests) ? memory.interests.slice(-10).map((item) => cleanText(item, 120)).filter(Boolean) : [],
    recentActivities: Array.isArray(memory.recentActivities) ? memory.recentActivities.slice(-20).map((item) => ({
      activity: cleanText(item?.activity, 24),
      detail: cleanText(item?.detail, 120),
      at: Math.max(0, Number(item?.at) || 0),
    })).filter((item) => item.activity) : [],
    updatedAt: Math.max(0, Number(memory.updatedAt) || Date.now()),
  };
}

function addUnique(items: string[], value: string, limit: number) {
  if (!value) return items;
  return [...items.filter((item) => item !== value), value].slice(-limit);
}

function extractStudentName(message: string) {
  const match = message.match(/(?:^|[，。！？!?\s])我(?:叫|的小名是)([\p{L}·]{1,8})(?=[，。！？!?\s]|$)/u);
  const name = cleanText(match?.[1], 8).replace(/[^\p{L}·]/gu, "");
  if (!name || /^(学生|小朋友|孩子|本人)$/.test(name)) return "";
  return name;
}

function extractInterest(message: string) {
  const patterns = [
    /(?:我)?(?:最喜欢|喜欢|最爱|爱看|想学|想知道)(?:的是)?([^，。！？!?]{1,48})/,
    /(?:我)?对([^，。！？!?]{1,48})(?:感兴趣|很好奇|好奇)/,
    /(?:我)?想去([^，。！？!?]{1,48})/,
    /(?:我)?好奇(?:的是)?([^，。！？!?]{1,48})/,
  ];
  for (const pattern of patterns) {
    const topic = cleanText(message.match(pattern)?.[1], 48)
      .replace(/^(?:看|学|了解|知道|去)\s*/, "")
      .replace(/\s*(?:的事情|的故事)$/, "");
    if (topic) return topic;
  }
  return "";
}

function mergeEvent(current: StudentMemory, rawEvent: StudentMemoryEvent): StudentMemory {
  const memory = safeMemory(current);
  const now = Date.now();
  const type = rawEvent.type;
  if (type === "reading") {
    const title = cleanText(rawEvent.title, 60);
    if (!title) return memory;
    const book: StudentBookMemory = {
      title,
      category: cleanText(rawEvent.category, 60),
      chapter: cleanText(rawEvent.chapter, 80),
      lastReadAt: now,
    };
    memory.books = [...memory.books.filter((item) => item.title !== title), book].slice(-12);
    memory.recentActivities = [...memory.recentActivities, {
      activity: "读书",
      detail: book.chapter ? `阅读《${title}》的《${book.chapter}》` : `阅读《${title}》`,
      at: now,
    }].slice(-20);
  } else if (type === "learning") {
    const detail = cleanText(rawEvent.detail, 140);
    memory.learned = addUnique(memory.learned, detail, 16);
    if (detail) memory.recentActivities = [...memory.recentActivities, { activity: "学习", detail, at: now }].slice(-20);
  } else if (type === "activity") {
    const activity = cleanText(rawEvent.activity, 24);
    if (activity) memory.recentActivities = [...memory.recentActivities, {
      activity,
      detail: cleanText(rawEvent.detail, 120),
      at: now,
    }].slice(-20);
  } else if (type === "chat") {
    const message = cleanText(rawEvent.message, 500);
    const studentName = extractStudentName(message);
    if (studentName) memory.studentName = studentName;
    memory.interests = addUnique(memory.interests, extractInterest(message), 10);
  }
  memory.updatedAt = now;
  return memory;
}

async function readyDatabase() {
  return readyRuntimeDatabase();
}

async function readNormalizedMemory(database: RuntimeDatabase, userId: string): Promise<StudentMemory | null> {
  const profile = await database.first<{ student_name: string; updated_at: number }>(
    "SELECT student_name, updated_at FROM user_memory_profile WHERE user_id = ?",
    [userId],
  );
  if (!profile) return null;
  const [books, learned, interests, activities] = await Promise.all([
    database.all<{ title: string; category: string; chapter: string; last_read_at: number }>(`SELECT title, category, chapter, last_read_at
      FROM (SELECT title, category, chapter, last_read_at FROM user_memory_books WHERE user_id = ? ORDER BY last_read_at DESC LIMIT 12)
      ORDER BY last_read_at ASC`, [userId]),
    database.all<{ fact_value: string }>(`SELECT fact_value FROM (
      SELECT fact_value, last_used_at FROM user_memory_facts WHERE user_id = ? AND fact_type = 'learned' ORDER BY last_used_at DESC LIMIT 16
    ) ORDER BY last_used_at ASC`, [userId]),
    database.all<{ fact_value: string }>(`SELECT fact_value FROM (
      SELECT fact_value, last_used_at FROM user_memory_facts WHERE user_id = ? AND fact_type = 'interest' ORDER BY last_used_at DESC LIMIT 10
    ) ORDER BY last_used_at ASC`, [userId]),
    database.all<{ activity: string; detail: string; happened_at: number }>(`SELECT activity, detail, happened_at FROM (
      SELECT activity, detail, happened_at FROM user_activity_log WHERE user_id = ? ORDER BY happened_at DESC LIMIT 20
    ) ORDER BY happened_at ASC`, [userId]),
  ]);
  return safeMemory({
    studentName: profile.student_name,
    books: books.map((book) => ({ title: book.title, category: book.category, chapter: book.chapter, lastReadAt: book.last_read_at })),
    learned: learned.map((fact) => fact.fact_value),
    interests: interests.map((fact) => fact.fact_value),
    recentActivities: activities.map((activity) => ({ activity: activity.activity, detail: activity.detail, at: activity.happened_at })),
    updatedAt: profile.updated_at,
  });
}

function memoryStatements(userId: string, memory: StudentMemory, sourceType: string, includeActivities: boolean): SqlStatement[] {
  const statements: SqlStatement[] = [{
    sql: `INSERT INTO user_memory_profile (user_id, student_name, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET student_name = excluded.student_name, updated_at = excluded.updated_at`,
    params: [userId, memory.studentName, memory.updatedAt],
  }];
  for (const book of memory.books) statements.push({
    sql: `INSERT INTO user_memory_books (user_id, title, category, chapter, last_read_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, title) DO UPDATE SET category = excluded.category, chapter = excluded.chapter, last_read_at = excluded.last_read_at`,
    params: [userId, book.title, book.category, book.chapter, book.lastReadAt],
  });
  for (const [factType, facts] of [["learned", memory.learned], ["interest", memory.interests]] as const) {
    for (const fact of facts) statements.push({
      sql: `INSERT INTO user_memory_facts (user_id, fact_type, fact_value, source_type, created_at, last_used_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT(user_id, fact_type, fact_value) DO UPDATE SET last_used_at = excluded.last_used_at`,
      params: [userId, factType, fact, sourceType, memory.updatedAt, memory.updatedAt],
    });
  }
  if (includeActivities) memory.recentActivities.forEach((activity, index) => statements.push({
    sql: "INSERT OR IGNORE INTO user_activity_log (activity_id, user_id, activity, detail, happened_at) VALUES (?, ?, ?, ?, ?)",
    params: [`legacy:${userId}:${activity.at}:${index}`, userId, activity.activity, activity.detail, activity.at],
  }));
  return statements;
}

async function withLocalStore<T>(update: (store: LocalMemoryStore) => { result: T; changed: boolean }): Promise<T> {
  const filePath = process.env.STUDENT_MEMORY_FILE?.trim();
  if (!filePath) throw new Error("student memory storage unavailable");
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
    let store: LocalMemoryStore = {};
    try {
      const parsed = JSON.parse(await readFile(filePath, "utf8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) store = parsed as LocalMemoryStore;
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

export async function getStudentMemory(userId: string): Promise<StudentMemory> {
  const database = await readyDatabase();
  if (database) {
    const normalized = await readNormalizedMemory(database, userId);
    if (normalized) return normalized;
    const row = await database.first<{ memory_json: string }>("SELECT memory_json FROM user_student_memory WHERE user_id = ?", [userId]);
    if (!row?.memory_json) return emptyMemory();
    try {
      const memory = safeMemory(JSON.parse(row.memory_json));
      await database.batch(memoryStatements(userId, memory, "legacy-d1", true));
      return memory;
    } catch {
      return emptyMemory();
    }
  }
  return withLocalStore((store) => ({ result: safeMemory(store[userId]), changed: false }));
}

export async function rememberStudentEvent(userId: string, event: StudentMemoryEvent): Promise<StudentMemory> {
  const database = await readyDatabase();
  if (database) {
    const current = await getStudentMemory(userId);
    const memory = mergeEvent(current, event);
    const statements = memoryStatements(userId, memory, event.type || "derived", false);
    const latest = memory.recentActivities.at(-1);
    const previousLatest = current.recentActivities.at(-1);
    if (latest && (latest.at !== previousLatest?.at || latest.detail !== previousLatest?.detail || latest.activity !== previousLatest?.activity)) {
      statements.push({
        sql: "INSERT INTO user_activity_log (activity_id, user_id, activity, detail, happened_at) VALUES (?, ?, ?, ?, ?)",
        params: [crypto.randomUUID(), userId, latest.activity, latest.detail, latest.at],
      });
    }
    await database.batch(statements);
    return memory;
  }
  return withLocalStore((store) => {
    const memory = mergeEvent(safeMemory(store[userId]), event);
    store[userId] = memory;
    return { result: memory, changed: true };
  });
}
