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
    if (/(?:喜欢|最爱|感兴趣|想学|爱看|想去|想知道|好奇)/.test(message)) {
      memory.interests = addUnique(memory.interests, message.slice(0, 120), 10);
    }
  }
  memory.updatedAt = now;
  return memory;
}

async function readyDatabase() {
  let database: D1Database | undefined;
  try {
    const { env } = await import("cloudflare:workers");
    database = env.DB;
  } catch {
    return null;
  }
  if (!database) return null;
  await database.prepare(`CREATE TABLE IF NOT EXISTS student_memory (
    device_id TEXT PRIMARY KEY NOT NULL,
    memory_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`).run();
  return database;
}

async function withLocalStore<T>(update: (store: LocalMemoryStore) => { result: T; changed: boolean }): Promise<T> {
  const filePath = process.env.STUDENT_MEMORY_FILE?.trim();
  if (!filePath) throw new Error("student memory storage unavailable");
  let releaseQueue = () => undefined;
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

export async function getStudentMemory(deviceId: string): Promise<StudentMemory> {
  const database = await readyDatabase();
  if (database) {
    const row = await database.prepare("SELECT memory_json FROM student_memory WHERE device_id = ?")
      .bind(deviceId)
      .first<{ memory_json: string }>();
    if (!row?.memory_json) return emptyMemory();
    try {
      return safeMemory(JSON.parse(row.memory_json));
    } catch {
      return emptyMemory();
    }
  }
  return withLocalStore((store) => ({ result: safeMemory(store[deviceId]), changed: false }));
}

export async function rememberStudentEvent(deviceId: string, event: StudentMemoryEvent): Promise<StudentMemory> {
  const database = await readyDatabase();
  if (database) {
    const current = await getStudentMemory(deviceId);
    const memory = mergeEvent(current, event);
    await database.prepare(`INSERT INTO student_memory (device_id, memory_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(device_id) DO UPDATE SET memory_json = excluded.memory_json, updated_at = excluded.updated_at`)
      .bind(deviceId, JSON.stringify(memory), memory.updatedAt)
      .run();
    return memory;
  }
  return withLocalStore((store) => {
    const memory = mergeEvent(safeMemory(store[deviceId]), event);
    store[deviceId] = memory;
    return { result: memory, changed: true };
  });
}
