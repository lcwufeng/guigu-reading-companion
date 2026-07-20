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

export type StudentFactMemory = {
  value: string;
  sourceType: string;
  firstRecordedAt: number;
  lastRecordedAt: number;
};

export type StudentMemory = {
  studentName: string;
  books: StudentBookMemory[];
  learned: string[];
  interests: string[];
  learnedDetails: StudentFactMemory[];
  interestDetails: StudentFactMemory[];
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
  learnedDetails: [],
  interestDetails: [],
  recentActivities: [],
  updatedAt: Date.now(),
});

let localStoreQueue = Promise.resolve();

function cleanText(value: unknown, limit: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : "";
}

const genericInterestTopics = new Set([
  "这个", "那个", "这些", "那些", "它", "东西", "事情", "内容", "问题", "什么", "不知道", "没什么",
]);

function normalizeInterestCandidate(value: string) {
  const raw = cleanText(value, 60);
  if (!raw
    || /[？?]/.test(raw)
    || /(?:吗|呢|吧|么)[。！!…]*$/.test(raw)
    || /(?:什么|为什么|怎么|怎样|哪里|哪儿|谁|是否)/.test(raw)
    || /(?:这个|那个|这些|那些|我叫你|我们来|咱们来|聊点)/.test(raw)) return "";
  const topic = raw
    .replace(/^[“”"'‘’《》]+|[“”"'‘’《》]+$/g, "")
    .split(/(?:但是|不过|因为|所以|然后|而且|可是|只是|，|。|！|？)/, 1)[0]
    .replace(/^(?:最近|现在|目前|特别|非常|真的|比较|很|最|也|还|关于|有关)\s*/, "")
    .replace(/^对\s*/, "")
    .replace(/^(?:看|读|学|学习|了解|知道|研究|探索|玩|去玩|去看|做)\s*/, "")
    .replace(/(?:很|特别|非常|比较)?(?:感兴趣|好奇|喜欢)$/, "")
    .replace(/(?:是什么|怎么样|怎么回事|的事情|的内容|的知识|相关内容|这些东西|这个主题)$/, "")
    .replace(/^[“”"'‘’《》]+|[“”"'‘’《》]+$/g, "")
    .replace(/[，。！!…]+$/g, "")
    .trim();
  if (/^(?:你|龟龟|他|她|别人)/.test(topic)) return "";
  if (topic.length < 2 || topic.length > 20 || genericInterestTopics.has(topic)) return "";
  if (/^(?:不|没|无|讨厌|不喜欢|不感兴趣)/.test(topic)) return "";
  if (/(?:喜欢|感兴趣|好奇)/.test(topic)) return "";
  return topic;
}

export function normalizeInterestTopics(value: unknown) {
  const text = cleanText(value, 120);
  if (!text) return [];
  const pieces = text.split(/(?:、|以及|还有|和|与)/).slice(0, 3);
  return [...new Set(pieces.map(normalizeInterestCandidate).filter(Boolean))].slice(0, 3);
}

export function extractInterestTopics(message: string) {
  const text = cleanText(message, 500);
  if (!text || /我(?:不|不太|不怎么|没有那么)(?:喜欢|感兴趣|好奇)/.test(text)) return [];
  const patterns = [
    /(?:^|[，。！？!?\s])我(?:最近|现在)?(?:特别|非常|真的|很|最|也|还)?(?:喜欢|喜爱|爱看|爱读|爱玩|爱学)(?:的是)?([^，。！？!?]{1,60})/,
    /(?:^|[，。！？!?\s])我对([^，。！？!?]{1,60}?)(?:特别|非常|真的|很|比较)?(?:感兴趣|好奇)/,
  ];
  for (const pattern of patterns) {
    const matched = text.match(pattern)?.[1] || "";
    const topics = normalizeInterestTopics(matched);
    if (topics.length) return topics;
  }
  return [];
}

function safeFactDetails(value: unknown, kind: "learned" | "interest") {
  if (!Array.isArray(value)) return [];
  const details: StudentFactMemory[] = [];
  for (const raw of value.slice(-24)) {
    const sourceType = cleanText(raw?.sourceType, 30) || "derived";
    const firstRecordedAt = Math.max(0, Number(raw?.firstRecordedAt) || 0);
    const lastRecordedAt = Math.max(firstRecordedAt, Number(raw?.lastRecordedAt) || 0);
    const values = kind === "interest" ? normalizeInterestTopics(raw?.value) : [cleanText(raw?.value, 140)].filter(Boolean);
    for (const factValue of values) {
      const existing = details.find((item) => item.value === factValue);
      if (existing) {
        existing.firstRecordedAt = Math.min(existing.firstRecordedAt || firstRecordedAt, firstRecordedAt || existing.firstRecordedAt);
        existing.lastRecordedAt = Math.max(existing.lastRecordedAt, lastRecordedAt);
        if (sourceType === "parent") existing.sourceType = "parent";
      } else details.push({ value: factValue, sourceType, firstRecordedAt, lastRecordedAt });
    }
  }
  return details.slice(-16);
}

function safeMemory(value: unknown): StudentMemory {
  const memory = value && typeof value === "object" ? value as Partial<StudentMemory> : {};
  const learnedDetails = safeFactDetails(memory.learnedDetails, "learned");
  const interestDetails = safeFactDetails(memory.interestDetails, "interest");
  const learned = Array.isArray(memory.learned) ? memory.learned.slice(-16).map((item) => cleanText(item, 140)).filter(Boolean) : [];
  const interests = Array.isArray(memory.interests) ? memory.interests.flatMap(normalizeInterestTopics).slice(-10) : [];
  return {
    studentName: cleanText(memory.studentName, 8),
    books: Array.isArray(memory.books) ? memory.books.slice(-12).map((book) => ({
      title: cleanText(book?.title, 60),
      category: cleanText(book?.category, 60),
      chapter: cleanText(book?.chapter, 80),
      lastReadAt: Math.max(0, Number(book?.lastReadAt) || 0),
    })).filter((book) => book.title) : [],
    learned: [...new Set([...learned, ...learnedDetails.map((item) => item.value)])].slice(-16),
    interests: [...new Set([...interests, ...interestDetails.map((item) => item.value)])].slice(-10),
    learnedDetails: learnedDetails.length ? learnedDetails : learned.map((item) => ({ value: item, sourceType: "derived", firstRecordedAt: 0, lastRecordedAt: 0 })),
    interestDetails: interestDetails.length ? interestDetails : interests.map((item) => ({ value: item, sourceType: "derived", firstRecordedAt: 0, lastRecordedAt: 0 })),
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
  const patterns = [
    /(?:^|[，。！？!?\s])我叫([\p{L}·]{1,8})(?=[，。！？!?\s]|$)/u,
    /(?:^|[，。！？!?\s])我的小名(?:是|叫)([\p{L}·]{1,8})(?=[，。！？!?\s]|$)/u,
    /(?:^|[，。！？!?\s])(?:你|龟龟)?(?:可以)?叫我([\p{L}·]{1,8})(?=[吧呀哦，。！？!?\s]|$)/u,
    /(?:^|[，。！？!?\s])我喜欢别人叫我([\p{L}·]{1,8})(?=[吧呀哦，。！？!?\s]|$)/u,
  ];
  const matched = patterns.map((pattern) => message.match(pattern)?.[1]).find(Boolean);
  const name = cleanText(matched, 8).replace(/[吧呀哦]$/u, "").replace(/[^\p{L}·]/gu, "");
  if (!name || /^(学生|小朋友|孩子|本人)$/.test(name)) return "";
  return name;
}

function mergeEvent(current: StudentMemory, rawEvent: StudentMemoryEvent, allowInterestAnalysis = true): StudentMemory {
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
    if (allowInterestAnalysis) {
      for (const interest of extractInterestTopics(message)) memory.interests = addUnique(memory.interests, interest, 10);
    }
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
    database.all<{ fact_value: string; source_type: string; created_at: number; last_used_at: number }>(`SELECT fact_value, source_type, created_at, last_used_at FROM (
      SELECT fact_value, source_type, created_at, last_used_at FROM user_memory_facts WHERE user_id = ? AND fact_type = 'learned' ORDER BY last_used_at DESC LIMIT 16
    ) ORDER BY last_used_at ASC`, [userId]),
    database.all<{ fact_value: string; source_type: string; created_at: number; last_used_at: number }>(`SELECT fact_value, source_type, created_at, last_used_at FROM (
      SELECT fact_value, source_type, created_at, last_used_at FROM user_memory_facts WHERE user_id = ? AND fact_type = 'interest' ORDER BY last_used_at DESC LIMIT 40
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
    learnedDetails: learned.map((fact) => ({ value: fact.fact_value, sourceType: fact.source_type, firstRecordedAt: fact.created_at, lastRecordedAt: fact.last_used_at })),
    interestDetails: interests.map((fact) => ({ value: fact.fact_value, sourceType: fact.source_type, firstRecordedAt: fact.created_at, lastRecordedAt: fact.last_used_at })),
    recentActivities: activities.map((activity) => ({ activity: activity.activity, detail: activity.detail, at: activity.happened_at })),
    updatedAt: profile.updated_at,
  });
}

function memoryStatements(userId: string, memory: StudentMemory, sourceType: string, includeActivities: boolean, includeFacts: boolean): SqlStatement[] {
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
  if (includeFacts) for (const [factType, facts] of [["learned", memory.learned], ["interest", memory.interests]] as const) {
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
      await database.batch(memoryStatements(userId, memory, "legacy-d1", true, true));
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
    let allowInterestAnalysis = true;
    if (event.type === "chat") {
      const controls = await database.first<{ chat_memory_enabled: number; interest_analysis_enabled: number }>(
        "SELECT chat_memory_enabled, interest_analysis_enabled FROM user_parent_controls WHERE user_id = ?",
        [userId],
      );
      if (controls && !controls.chat_memory_enabled) return current;
      allowInterestAnalysis = !controls || Boolean(controls.interest_analysis_enabled);
    }
    const memory = mergeEvent(current, event, allowInterestAnalysis);
    const statements = memoryStatements(userId, memory, event.type || "derived", false, false);
    if (event.type === "learning") {
      const fact = cleanText(event.detail, 140);
      if (fact) statements.push({
        sql: `INSERT INTO user_memory_facts (user_id, fact_type, fact_value, source_type, created_at, last_used_at, expires_at)
          VALUES (?, 'learned', ?, 'learning-activity', ?, ?, NULL)
          ON CONFLICT(user_id, fact_type, fact_value) DO UPDATE SET last_used_at = excluded.last_used_at`,
        params: [userId, fact, memory.updatedAt, memory.updatedAt],
      });
    }
    if (event.type === "chat" && allowInterestAnalysis) {
      for (const topic of extractInterestTopics(cleanText(event.message, 500))) statements.push({
        sql: `INSERT INTO user_memory_facts (user_id, fact_type, fact_value, source_type, created_at, last_used_at, expires_at)
          VALUES (?, 'interest', ?, 'chat-explicit', ?, ?, NULL)
          ON CONFLICT(user_id, fact_type, fact_value) DO UPDATE SET last_used_at = excluded.last_used_at`,
        params: [userId, topic, memory.updatedAt, memory.updatedAt],
      });
    }
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
