import classicBookManifest from "../app/classic-books-manifest.json";
import { chapterPrompts, type ChapterPrompt } from "../app/book-prompts";
import { getPublishedBookChapter } from "../db/book-imports";
import { getBundledBookAsset } from "./bundled-book-assets";

type ReadingChapter = {
  title: string;
  pages: Array<{ body?: unknown }>;
};

export type VerifiedReadingContext = {
  bookId: string;
  chapterTitle: string;
  questionKey: string;
  excerpt: string;
  question: string;
  referenceAnswer: string;
};

const bundledBookIds = new Set([
  "scarecrow-zh",
  "grimm-zh",
  "andersen-zh",
  ...classicBookManifest.map((book) => book.slug),
]);
const importedBookIdPattern = /^imported-[0-9a-f-]{36}$/;
const bundledChapterCache = new Map<string, Map<string, string>>();

function clean(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function fallbackPrompt(title: string): ChapterPrompt {
  const seed = [...title].reduce((total, character) => total + (character.codePointAt(0) || 0), 0) % 4;
  return [
    {
      question: `读完《${title}》，哪一个人物、行动或变化最值得留意？它怎样推动了这一章的内容？`,
      guide: "",
      referenceAnswer: "这是开放性问题。答案只要准确引用本章中的人物、行动或变化，并说明它对后续内容的影响，就应判为正确；不要要求唯一表述。",
    },
    {
      question: `《${title}》里，哪个细节最能帮助你理解这一章？请用原文内容说说理由。`,
      guide: "",
      referenceAnswer: "这是开放性问题。答案只要选取本章真实存在的细节，并作出与原文相符的解释，就应判为正确；允许学生有自己的感受。",
    },
    {
      question: `如果请你给《${title}》再取一个小标题，你会取什么？为什么这个标题符合原文？`,
      guide: "",
      referenceAnswer: "这是开放性问题。新标题不必唯一，只要能够概括本章核心内容，并有至少一个与原文相符的理由，就应判为正确。",
    },
    {
      question: `读《${title}》时，你发现人物、事情或观察结果前后有什么变化？请结合原文说明。`,
      guide: "",
      referenceAnswer: "这是开放性问题。答案只要指出本章前后真实存在的变化或认识过程，并用原文细节解释，就应判为正确。",
    },
  ][seed];
}

function markdownChapters(source: string) {
  const normalized = source.replace(/\r/g, "");
  const firstDivider = normalized.search(/^---\s*$/m);
  const body = firstDivider >= 0 ? normalized.slice(firstDivider).replace(/^---\s*$/m, "") : normalized;
  const headings = [...body.matchAll(/^#\s+(.+)\s*$/gm)];
  return headings.map((heading, index) => {
    const start = (heading.index || 0) + heading[0].length;
    const end = headings[index + 1]?.index ?? body.length;
    return {
      title: heading[1].trim(),
      excerpt: body.slice(start, end).replace(/^---\s*$/gm, "").trim(),
    };
  });
}

function rememberBundledChapters(bookId: string, chapters: Array<{ title: string; excerpt: string }>) {
  if (bundledChapterCache.size >= 6 && !bundledChapterCache.has(bookId)) {
    const oldest = bundledChapterCache.keys().next().value as string | undefined;
    if (oldest) bundledChapterCache.delete(oldest);
  }
  const mapped = new Map(chapters.map((chapter) => [chapter.title, chapter.excerpt]));
  bundledChapterCache.set(bookId, mapped);
  return mapped;
}

async function bundledChapterExcerpt(request: Request, bookId: string, chapterTitle: string) {
  const cached = bundledChapterCache.get(bookId);
  if (cached) return cached.get(chapterTitle) || "";
  const asset = await getBundledBookAsset(request, bookId);
  if (!asset) return "";
  const source = await new Response(asset.body).text();
  if (asset.contentType.includes("application/json")) {
    const payload = JSON.parse(source) as { chapters?: ReadingChapter[] };
    const chapters = Array.isArray(payload.chapters) ? payload.chapters : [];
    return rememberBundledChapters(bookId, chapters.map((chapter) => ({
      title: clean(chapter.title, 180),
      excerpt: Array.isArray(chapter.pages)
        ? chapter.pages.map((page) => clean(page?.body, 20_000)).filter(Boolean).join("\n\n")
        : "",
    }))).get(chapterTitle) || "";
  }
  return rememberBundledChapters(bookId, markdownChapters(source)).get(chapterTitle) || "";
}

export async function verifyReadingContext(request: Request, body: {
  bookId?: unknown;
  chapterTitle?: unknown;
  questionKey?: unknown;
}): Promise<VerifiedReadingContext | null> {
  const bookId = clean(body.bookId, 80);
  const chapterTitle = clean(body.chapterTitle, 180);
  const questionKey = clean(body.questionKey, 300);
  if (!bookId || !chapterTitle || questionKey !== `chapter:${bookId}:${chapterTitle}`) return null;

  let excerpt = "";
  if (bundledBookIds.has(bookId)) {
    excerpt = await bundledChapterExcerpt(request, bookId, chapterTitle);
  } else if (importedBookIdPattern.test(bookId)) {
    const chapter = await getPublishedBookChapter(bookId, chapterTitle);
    excerpt = chapter?.pages.map((page) => clean(page.body, 20_000)).filter(Boolean).join("\n\n") || "";
  }
  if (!excerpt) return null;
  const prompt = chapterPrompts[bookId]?.[chapterTitle] || fallbackPrompt(chapterTitle);
  return {
    bookId,
    chapterTitle,
    questionKey,
    excerpt: excerpt.slice(0, 16_000),
    question: prompt.question,
    referenceAnswer: prompt.referenceAnswer,
  };
}
