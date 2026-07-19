import classicBookManifest from "../app/classic-books-manifest.json";
import {
  claimDailyParentCompanionRefresh,
  getStoredParentCompanionSuggestion,
  saveParentCompanionSuggestion,
} from "../db/parent-companion";
import { getParentChildren } from "../db/parent-center";
import { buildParentReport } from "../db/parent-reports";
import { generateParentCompanionSuggestion, type ParentCompanionAiInput } from "./parent-companion-ai";

const bookTitles = new Map<string, string>([
  ["scarecrow-zh", "稻草人"],
  ["grimm-zh", "格林童话"],
  ["andersen-zh", "安徒生童话"],
  ...classicBookManifest.map((book) => [book.slug, book.title] as [string, string]),
]);

function fallbackSuggestion(input: ParentCompanionAiInput) {
  if (input.recentBooks.length) {
    return `看到${input.childName}最近在读《${input.recentBooks[0]}》。今晚可以留十分钟，请孩子挑一个最有意思的片段讲给你听，再问一句：“你为什么记住了这里？”`;
  }
  if (input.interests.length) {
    return `看到${input.childName}对${input.interests[0]}有兴趣。今天可以留十分钟一起找一个相关的小故事，让孩子决定先看什么，再问：“你最想知道哪一点？”`;
  }
  return `今天可以和${input.childName}一起选一篇短故事，安静共读十分钟。把选择权交给孩子，读完只问一句：“哪个地方让你最想讲给我听？”`;
}

async function inputFor(studentId: string, childName: string): Promise<ParentCompanionAiInput | null> {
  const now = Date.now();
  const report = await buildParentReport(studentId, { from: now - 14 * 24 * 60 * 60 * 1000, to: now });
  if (!report) return null;
  return {
    childName,
    activeDays: report.dailyTasks.activeDays,
    completedTaskDays: report.dailyTasks.fullyCompletedDays,
    recentBooks: report.reading.books.slice(0, 6).map((book) => bookTitles.get(book.bookId) || book.bookId),
    chapterAnswers: report.reading.answerAttempts,
    mistakeCounts: report.mistakes.currentByStatus,
    mistakePhotoAnswers: report.mistakes.photoAnswerAttempts,
    learned: report.learned.slice(0, 8),
    interests: report.interests.slice(0, 6),
    recentActivities: report.recentActivities.slice(0, 8).map((item) => item.detail ? `${item.activity}（${item.detail}）` : item.activity),
  };
}

export type ParentCompanionRefreshResult = {
  refreshed: number;
  reusedToday: number;
  retainedPrevious: number;
};

export async function refreshParentCompanionSuggestions(parentId: string): Promise<ParentCompanionRefreshResult> {
  const result: ParentCompanionRefreshResult = { refreshed: 0, reusedToday: 0, retainedPrevious: 0 };
  const children = await getParentChildren(parentId);
  for (const child of children) {
    const claimed = await claimDailyParentCompanionRefresh(parentId, child.id);
    if (!claimed) {
      result.reusedToday += 1;
      continue;
    }
    const input = await inputFor(child.id, child.displayName);
    if (!input) {
      result.retainedPrevious += 1;
      continue;
    }
    try {
      const generated = await generateParentCompanionSuggestion(input);
      await saveParentCompanionSuggestion(parentId, child.id, {
        text: generated.text,
        modelSource: generated.modelSource,
        generatedAt: Date.now(),
      });
      result.refreshed += 1;
    } catch {
      const previous = await getStoredParentCompanionSuggestion(child.id);
      if (!previous) {
        await saveParentCompanionSuggestion(parentId, child.id, {
          text: fallbackSuggestion(input),
          modelSource: "local-fallback",
          generatedAt: Date.now(),
        });
      }
      result.retainedPrevious += 1;
    }
  }
  return result;
}
