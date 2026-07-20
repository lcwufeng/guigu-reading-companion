import { readyRuntimeDatabase } from "./runtime-database";

export type ImportedBookImage = { src: string; alt: string };
export type ImportedBookPage = { heading: string; body: string; images?: ImportedBookImage[] };
export type ImportedBookChapter = { id: string; title: string; pages: ImportedBookPage[] };
export type ImportedBookStatus = "published" | "hidden";

export type ImportedBookSummary = {
  id: string;
  slug: string;
  title: string;
  author: string;
  grade: string;
  summary: string;
  knowledge: string;
  memoryCategory: string;
  sourceLabel: string;
  journalArt: string;
  sourceFilename: string;
  sourceFormat: string;
  sourceSize: number;
  extractionMode: string;
  status: ImportedBookStatus;
  chapterCount: number;
  pageCount: number;
  imageCount: number;
  qualityReport: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  publishedAt: number;
};

export type ImportedBookCatalogItem = Pick<ImportedBookSummary,
  "id" | "title" | "author" | "grade" | "summary" | "knowledge" | "memoryCategory" | "sourceLabel" | "journalArt">;

export type BookImportPayload = {
  bookId: string;
  title: string;
  author: string;
  grade: string;
  summary: string;
  knowledge: string;
  memoryCategory: string;
  sourceFilename: string;
  sourceFormat: string;
  sourceSize: number;
  extractionMode: string;
  qualityReport?: Record<string, unknown>;
  chapters: ImportedBookChapter[];
};

const bookIdPattern = /^imported-[0-9a-f-]{36}$/;
const assetPathPattern = /^\/api\/library\/book-asset\?bookId=(imported-[0-9a-f-]{36})&id=([0-9a-f-]{36})$/;

function cleanText(value: unknown, limit: number, preserveLines = false) {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\r/g, "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
  return (preserveLines ? normalized.replace(/[ \t]+\n/g, "\n") : normalized.replace(/\s+/g, " ")).trim().slice(0, limit);
}

function safeJson(value: unknown, fallback: Record<string, unknown> = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const encoded = JSON.stringify(value);
  if (encoded.length > 12_000) return fallback;
  try { return JSON.parse(encoded) as Record<string, unknown>; } catch { return fallback; }
}

function parseQuality(value: string) {
  try { return safeJson(JSON.parse(value)); } catch { return {}; }
}

function mapSummary(row: {
  book_id: string; slug: string; title: string; author: string; grade: string; summary: string; knowledge: string;
  memory_category: string; source_label: string; journal_art_src: string; source_filename: string; source_format: string; source_size: number;
  extraction_mode: string; status: string; chapter_count: number; page_count: number; image_count: number;
  quality_report_json: string; created_at: number; updated_at: number; published_at: number | null;
}): ImportedBookSummary {
  return {
    id: row.book_id, slug: row.slug, title: row.title, author: row.author, grade: row.grade,
    summary: row.summary, knowledge: row.knowledge, memoryCategory: row.memory_category, sourceLabel: row.source_label, journalArt: row.journal_art_src,
    sourceFilename: row.source_filename, sourceFormat: row.source_format, sourceSize: row.source_size,
    extractionMode: row.extraction_mode, status: row.status === "hidden" ? "hidden" : "published",
    chapterCount: row.chapter_count, pageCount: row.page_count, imageCount: row.image_count,
    qualityReport: parseQuality(row.quality_report_json), createdAt: row.created_at, updatedAt: row.updated_at,
    publishedAt: row.published_at || 0,
  };
}

export function normalizeBookImportPayload(value: unknown): BookImportPayload {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const bookId = cleanText(input.bookId, 80);
  if (!bookIdPattern.test(bookId)) throw new Error("图书导入编号无效，请重新分析文件。");
  const title = cleanText(input.title, 100);
  const author = cleanText(input.author, 80) || "佚名";
  const grade = cleanText(input.grade, 40) || "儿童读物";
  const summary = cleanText(input.summary, 600);
  const knowledge = cleanText(input.knowledge, 1_000);
  const memoryCategory = cleanText(input.memoryCategory, 80) || "儿童文学";
  const sourceFilename = cleanText(input.sourceFilename, 180);
  const sourceFormat = cleanText(input.sourceFormat, 20).toLowerCase();
  const sourceSize = Math.max(0, Math.min(100_000_000, Math.floor(Number(input.sourceSize) || 0)));
  const extractionMode = cleanText(input.extractionMode, 80) || "文字整理";
  if (!title || !summary || !knowledge || !sourceFilename) throw new Error("请补全书名、简介、知识补充和源文件信息。");
  if (!["pdf", "markdown", "txt", "json"].includes(sourceFormat)) throw new Error("仅支持 PDF、Markdown、TXT 或结构化 JSON。");
  if (!Array.isArray(input.chapters) || !input.chapters.length || input.chapters.length > 500) throw new Error("没有识别到有效章节，或章节数量超过 500 章。");
  let totalText = 0;
  let pageCount = 0;
  const chapters = input.chapters.map((rawChapter, chapterIndex) => {
    const chapter = rawChapter && typeof rawChapter === "object" && !Array.isArray(rawChapter) ? rawChapter as Record<string, unknown> : {};
    const chapterTitle = cleanText(chapter.title, 140) || `第 ${chapterIndex + 1} 章`;
    if (!Array.isArray(chapter.pages) || !chapter.pages.length || chapter.pages.length > 300) throw new Error(`《${chapterTitle}》没有有效正文，或单章超过 300 页。`);
    const pages = chapter.pages.map((rawPage) => {
      const page = rawPage && typeof rawPage === "object" && !Array.isArray(rawPage) ? rawPage as Record<string, unknown> : {};
      const body = cleanText(page.body, 20_000, true);
      const images = Array.isArray(page.images) ? page.images.slice(0, 6).flatMap((rawImage) => {
        const image = rawImage && typeof rawImage === "object" && !Array.isArray(rawImage) ? rawImage as Record<string, unknown> : {};
        const src = cleanText(image.src, 220);
        const match = src.match(assetPathPattern);
        if (!match || match[1] !== bookId) return [];
        return [{ src, alt: cleanText(image.alt, 100) || "原书插图" }];
      }) : [];
      if (!body && !images.length) throw new Error(`《${chapterTitle}》中存在空白阅读页。`);
      totalText += body.length;
      pageCount += 1;
      return { heading: cleanText(page.heading, 140) || chapterTitle, body, ...(images.length ? { images } : {}) };
    });
    return { id: cleanText(chapter.id, 60) || String(chapterIndex + 1), title: chapterTitle, pages };
  });
  if (pageCount > 5_000 || totalText > 8_000_000) throw new Error("这本书内容过大，请拆分后再导入。");
  return {
    bookId, title, author, grade, summary, knowledge, memoryCategory, sourceFilename, sourceFormat, sourceSize,
    extractionMode, qualityReport: safeJson(input.qualityReport), chapters,
  };
}

async function databaseOrThrow() {
  const database = await readyRuntimeDatabase();
  if (!database) throw new Error("图书数据库暂时不可用。");
  return database;
}

export async function getAdminImportedBooks() {
  const database = await databaseOrThrow();
  const rows = await database.all<Parameters<typeof mapSummary>[0]>("SELECT * FROM imported_books ORDER BY updated_at DESC LIMIT 200");
  return rows.map(mapSummary);
}

export async function createImportedBook(adminId: string, raw: unknown) {
  const database = await databaseOrThrow();
  const book = normalizeBookImportPayload(raw);
  if (await database.first("SELECT book_id FROM imported_books WHERE book_id = ?", [book.bookId])) throw new Error("这次分析已经发布过，请重新选择文件。");
  const assetIds = book.chapters.flatMap((chapter) => chapter.pages.flatMap((page) => (page.images || []).map((image) => image.src.match(assetPathPattern)?.[2] || ""))).filter(Boolean);
  if (assetIds.length) {
    const rows = await database.all<{ asset_id: string }>(`SELECT asset_id FROM imported_book_assets WHERE book_id = ?`, [book.bookId]);
    const known = new Set(rows.map((row) => row.asset_id));
    if (assetIds.some((id) => !known.has(id))) throw new Error("有插图尚未完整保存，请重新上传插图后发布。");
  }
  const slug = book.bookId;
  const now = Date.now();
  const pageCount = book.chapters.reduce((total, chapter) => total + chapter.pages.length, 0);
  const bookStatement = {
    sql: `INSERT INTO imported_books
      (book_id, slug, title, author, grade, summary, knowledge, memory_category, source_label, journal_art_src, source_filename,
       source_format, source_size, extraction_mode, status, chapter_count, page_count, image_count,
       quality_report_json, created_by_admin_id, created_at, updated_at, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'hidden', ?, ?, ?, ?, ?, ?, ?, NULL)`,
    params: [book.bookId, slug, book.title, book.author, book.grade, book.summary, book.knowledge, book.memoryCategory,
      `管理员导入《${book.title}》；章节、段落与插图已经过发布前检查`, assetIds[0] ? `/api/library/book-asset?bookId=${book.bookId}&id=${assetIds[0]}` : "", book.sourceFilename, book.sourceFormat,
      book.sourceSize, book.extractionMode, book.chapters.length, pageCount, assetIds.length,
      JSON.stringify(book.qualityReport || {}), adminId.slice(0, 80), now, now],
  };
  const chapterStatements = book.chapters.map((chapter, chapterIndex) => ({
    sql: "INSERT INTO imported_book_chapters (book_id, chapter_index, chapter_id, title, pages_json) VALUES (?, ?, ?, ?, ?)",
    params: [book.bookId, chapterIndex, chapter.id, chapter.title, JSON.stringify(chapter.pages)],
  }));
  try {
    await database.run(bookStatement.sql, bookStatement.params);
    for (let index = 0; index < chapterStatements.length; index += 40) await database.batch(chapterStatements.slice(index, index + 40));
    await database.run("UPDATE imported_books SET status = 'published', published_at = ?, updated_at = ? WHERE book_id = ?", [now, now, book.bookId]);
  } catch (error) {
    await database.batch([
      { sql: "DELETE FROM imported_book_chapters WHERE book_id = ?", params: [book.bookId] },
      { sql: "DELETE FROM imported_books WHERE book_id = ?", params: [book.bookId] },
    ]).catch(() => undefined);
    throw error;
  }
  return { id: book.bookId, title: book.title };
}

export async function setImportedBookStatus(bookId: string, status: ImportedBookStatus) {
  if (!bookIdPattern.test(bookId) || (status !== "published" && status !== "hidden")) throw new Error("图书状态无效。");
  const database = await databaseOrThrow();
  const existing = await database.first<{ title: string }>("SELECT title FROM imported_books WHERE book_id = ?", [bookId]);
  if (!existing) throw new Error("没有找到这本书。");
  const now = Date.now();
  await database.run("UPDATE imported_books SET status = ?, updated_at = ?, published_at = CASE WHEN ? = 'published' THEN ? ELSE published_at END WHERE book_id = ?", [status, now, status, now, bookId]);
  return { id: bookId, title: existing.title, status };
}

export async function registerImportedBookAsset(bookId: string, assetId: string, contentType: string, sizeBytes: number) {
  if (!bookIdPattern.test(bookId) || !/^[0-9a-f-]{36}$/.test(assetId)) throw new Error("插图编号无效。");
  const database = await databaseOrThrow();
  await database.run("INSERT INTO imported_book_assets (asset_id, book_id, kind, content_type, size_bytes, created_at) VALUES (?, ?, 'illustration', ?, ?, ?)", [assetId, bookId, contentType, sizeBytes, Date.now()]);
}

export async function importedBookAssetInfo(bookId: string, assetId: string) {
  if (!bookIdPattern.test(bookId) || !/^[0-9a-f-]{36}$/.test(assetId)) return null;
  const database = await databaseOrThrow();
  return database.first<{ content_type: string }>(`SELECT a.content_type FROM imported_book_assets a
    JOIN imported_books b ON b.book_id = a.book_id
    WHERE a.book_id = ? AND a.asset_id = ? AND b.status = 'published'`, [bookId, assetId]);
}

export async function getPublishedBookCatalog(): Promise<ImportedBookCatalogItem[]> {
  const database = await databaseOrThrow();
  const rows = await database.all<Parameters<typeof mapSummary>[0]>("SELECT * FROM imported_books WHERE status = 'published' ORDER BY published_at DESC, title ASC");
  return rows.map(mapSummary).map((book) => ({
    id: book.id, title: book.title, author: book.author, grade: book.grade, summary: book.summary,
    knowledge: book.knowledge, memoryCategory: book.memoryCategory, sourceLabel: book.sourceLabel, journalArt: book.journalArt,
  }));
}

export async function getPublishedBookContent(bookId: string) {
  if (!bookIdPattern.test(bookId)) return null;
  const database = await databaseOrThrow();
  const book = await database.first<{ title: string; author: string }>("SELECT title, author FROM imported_books WHERE book_id = ? AND status = 'published'", [bookId]);
  if (!book) return null;
  const rows = await database.all<{ chapter_id: string; title: string; pages_json: string }>("SELECT chapter_id, title, pages_json FROM imported_book_chapters WHERE book_id = ? ORDER BY chapter_index", [bookId]);
  const chapters = rows.flatMap((row) => {
    try {
      const pages = JSON.parse(row.pages_json) as ImportedBookPage[];
      return pages.length ? [{ id: row.chapter_id, title: row.title, pages }] : [];
    } catch { return []; }
  });
  return chapters.length ? { id: bookId, title: book.title, author: book.author, chapters } : null;
}

export async function getImportedBookTitleMap() {
  const database = await databaseOrThrow();
  const rows = await database.all<{ book_id: string; title: string }>("SELECT book_id, title FROM imported_books");
  return new Map(rows.map((row) => [row.book_id, row.title]));
}
