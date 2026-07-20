import type { ImportedBookChapter, ImportedBookPage } from "../db/book-imports";

export type ImportDraftPage = ImportedBookPage & { pendingImageData?: string };
export type ImportDraftChapter = Omit<ImportedBookChapter, "pages"> & { pages: ImportDraftPage[] };
export type ImportQualityReport = {
  sourcePages: number;
  nativeTextPages: number;
  ocrPages: number;
  skippedFrontMatterPages: number;
  illustrationPages: number;
  repeatedHeadersRemoved: number;
  paragraphCount: number;
  warnings: string[];
};
export type ImportAnalysis = {
  chapters: ImportDraftChapter[];
  extractionMode: string;
  quality: ImportQualityReport;
};
export type BookOcrResponse = { text: string; chapterTitle: string; frontMatter: boolean; hasIllustration: boolean; notice: string };

const frontMatterPattern = /^(目录|目次|前言|序|序言|译序|出版说明|作者简介|人物介绍|故事梗概|内容简介|作品简介|编者的话|阅读指导|导读|版权页?|索引|后记)$/;
const chapterPattern = /^(第[一二三四五六七八九十百千万〇零0-9]+[章回节篇卷部集]\s*.*|(?:chapter|part)\s+[ivxlcdm0-9]+\b.*|[一二三四五六七八九十百千万〇零0-9]+[、.．]\s*[^，。！？]{1,40})$/i;
const sentenceEndPattern = /[。！？!?；;：:”’」』）》】…]$/;

function cleanLine(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
}

function isPageNumber(value: string) { return /^(?:第?\s*)?[—–-]?\s*\d{1,4}\s*[—–-]?(?:\s*页)?$/.test(value); }

function chapterTitleFor(line: string) {
  const cleaned = cleanLine(line).replace(/^#+\s*/, "");
  return cleaned.length <= 80 && chapterPattern.test(cleaned) ? cleaned : "";
}

function isFrontMatterTitle(line: string) {
  return frontMatterPattern.test(cleanLine(line).replace(/\s+/g, "").replace(/[：:]/g, ""));
}

function normalizeParagraphs(raw: string) {
  const lines = raw.replace(/\r/g, "").split("\n").map(cleanLine).filter((line) => line && !isPageNumber(line));
  const paragraphs: string[] = [];
  let current = "";
  for (const line of lines) {
    if (!current) { current = line; continue; }
    const separate = sentenceEndPattern.test(current) || chapterTitleFor(line) || /^\s{2,}/.test(line);
    if (separate) {
      paragraphs.push(current);
      current = line;
    } else if (/^[，。！？；：、”’」』）》】]/.test(line) || /[A-Za-z0-9]$/.test(current) && /^[A-Za-z0-9]/.test(line)) {
      current += line;
    } else {
      current += line;
    }
  }
  if (current) paragraphs.push(current);
  return paragraphs.filter((paragraph) => !chapterTitleFor(paragraph));
}

function splitLongParagraph(paragraph: string, limit = 1_350) {
  if (paragraph.length <= limit) return [paragraph];
  const sentences = paragraph.split(/(?<=[。！？!?；;])/).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences.length > 1 ? sentences : paragraph.match(new RegExp(`.{1,${limit}}`, "g")) || [paragraph]) {
    if (current && current.length + sentence.length > limit) { chunks.push(current); current = sentence; }
    else current += sentence;
  }
  if (current) chunks.push(current);
  return chunks;
}

function paginate(title: string, paragraphs: string[], imageData?: string): ImportDraftPage[] {
  const pages: ImportDraftPage[] = [];
  let current: string[] = [];
  let length = 0;
  for (const paragraph of paragraphs.flatMap((item) => splitLongParagraph(item))) {
    if (current.length && length + paragraph.length > 1_450) {
      pages.push({ heading: title, body: current.join("\n\n") });
      current = [];
      length = 0;
    }
    current.push(paragraph);
    length += paragraph.length;
  }
  if (current.length || imageData) pages.push({ heading: title, body: current.join("\n\n"), ...(imageData ? { pendingImageData: imageData } : {}) });
  return pages;
}

function buildChapters(sourcePages: Array<{ text: string; chapterTitle: string; imageData?: string }>) {
  const chapters: ImportDraftChapter[] = [];
  let current: ImportDraftChapter | null = null;
  for (const source of sourcePages) {
    const firstLine = source.text.split("\n").map(cleanLine).find(Boolean) || "";
    const detected = source.chapterTitle || chapterTitleFor(firstLine);
    if (detected || !current) {
      const title = detected || "正文";
      current = { id: String(chapters.length + 1), title, pages: [] };
      chapters.push(current);
    }
    const sourceLines = source.text.split("\n");
    const headingIndex = detected ? sourceLines.slice(0, 5).findIndex((line) => cleanLine(line) === cleanLine(detected)) : -1;
    const textWithoutHeading = headingIndex >= 0 ? sourceLines.filter((_, index) => index !== headingIndex).join("\n") : source.text;
    current.pages.push(...paginate(current.title, normalizeParagraphs(textWithoutHeading), source.imageData));
  }
  return chapters.filter((chapter) => chapter.pages.some((page) => page.body || page.pendingImageData));
}

function baseQuality(): ImportQualityReport {
  return { sourcePages: 0, nativeTextPages: 0, ocrPages: 0, skippedFrontMatterPages: 0, illustrationPages: 0, repeatedHeadersRemoved: 0, paragraphCount: 0, warnings: [] };
}

export function analyzeTextBook(text: string, format: "markdown" | "txt") {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r/g, "");
  const headingMatches = [...normalized.matchAll(/^\s*(?:#{1,3}\s+(.+)|((?:第[一二三四五六七八九十百千万〇零0-9]+[章回节篇卷部集]|[一二三四五六七八九十百千万〇零0-9]+[、.．])[^\n]{0,60}))\s*$/gm)];
  const segments = headingMatches.length ? headingMatches.map((match, index) => ({
    title: cleanLine(match[1] || match[2] || `第 ${index + 1} 章`),
    text: normalized.slice((match.index || 0) + match[0].length, headingMatches[index + 1]?.index ?? normalized.length),
  })) : [{ title: "正文", text: normalized }];
  const lastOpeningMatter = segments.reduce((last, segment, index) => isFrontMatterTitle(segment.title) && !/^(后记|索引)$/.test(segment.title.replace(/\s+/g, "")) ? index : last, -1);
  let skipped = Math.max(0, lastOpeningMatter + 1);
  const chapters = segments.slice(lastOpeningMatter + 1).flatMap((segment, relativeIndex) => {
    const index = relativeIndex + lastOpeningMatter + 1;
    if (isFrontMatterTitle(segment.title)) { skipped += 1; return []; }
    const pages = paginate(segment.title, normalizeParagraphs(segment.text));
    return pages.length ? [{ id: String(index + 1), title: segment.title, pages }] : [];
  });
  const quality = baseQuality();
  quality.sourcePages = chapters.reduce((sum, chapter) => sum + chapter.pages.length, 0);
  quality.nativeTextPages = quality.sourcePages;
  quality.skippedFrontMatterPages = skipped;
  quality.paragraphCount = chapters.reduce((sum, chapter) => sum + chapter.pages.reduce((count, page) => count + page.body.split("\n\n").filter(Boolean).length, 0), 0);
  if (!chapters.length) quality.warnings.push("没有识别到正文，请检查标题格式。");
  return { chapters, extractionMode: format === "markdown" ? "Markdown 标题与段落整理" : "纯文本章节与段落整理", quality } satisfies ImportAnalysis;
}

export function analyzeStructuredBook(raw: string): ImportAnalysis {
  const parsed = JSON.parse(raw) as { chapters?: ImportedBookChapter[] } | ImportedBookChapter[];
  const source = Array.isArray(parsed) ? parsed : parsed.chapters;
  if (!Array.isArray(source)) throw new Error("JSON 中没有 chapters 数组。");
  const chapters = source.slice(0, 500).flatMap((chapter, chapterIndex) => {
    const title = cleanLine(String(chapter?.title || `第 ${chapterIndex + 1} 章`)).slice(0, 140);
    const pages = Array.isArray(chapter?.pages) ? chapter.pages.slice(0, 300).flatMap((page) => {
      const body = typeof page?.body === "string" ? normalizeParagraphs(page.body).join("\n\n") : "";
      return body ? [{ heading: cleanLine(String(page.heading || title)).slice(0, 140), body }] : [];
    }) : [];
    return pages.length ? [{ id: String(chapter?.id || chapterIndex + 1), title, pages }] : [];
  });
  const quality = baseQuality();
  quality.sourcePages = chapters.reduce((sum, chapter) => sum + chapter.pages.length, 0);
  quality.nativeTextPages = quality.sourcePages;
  quality.paragraphCount = chapters.reduce((sum, chapter) => sum + chapter.pages.reduce((count, page) => count + page.body.split("\n\n").length, 0), 0);
  return { chapters, extractionMode: "结构化 JSON 校验与段落整理", quality };
}

type Progress = { page: number; total: number; label: string };

export async function analyzePdfBook(file: File, options: {
  basePath: string;
  onProgress: (progress: Progress) => void;
  ocr: (imageData: string, pageNumber: number) => Promise<BookOcrResponse>;
}): Promise<ImportAnalysis> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `${options.basePath}/vendor/pdf.worker.min.mjs`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const document = await pdfjs.getDocument({ data: bytes }).promise;
  if (document.numPages > 800) throw new Error("单次最多导入 800 页，请拆分文件后再试。");
  const quality = baseQuality();
  quality.sourcePages = document.numPages;
  const nativePages: Array<{ lines: Array<{ text: string; size: number }>; page: Awaited<ReturnType<typeof document.getPage>> }> = [];
  const edgeCounts = new Map<string, number>();
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    options.onProgress({ page: pageNumber, total: document.numPages, label: "正在读取 PDF 文字层" });
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const groups = new Map<number, Array<{ x: number; text: string; size: number }>>();
    for (const rawItem of content.items) {
      const item = rawItem as { str?: string; transform?: number[] };
      if (!item.str || !item.transform) continue;
      const y = Math.round(item.transform[5] / 3) * 3;
      const group = groups.get(y) || [];
      group.push({ x: item.transform[4], text: item.str, size: Math.max(1, Math.hypot(item.transform[2] || 0, item.transform[3] || 0)) });
      groups.set(y, group);
    }
    const lines = [...groups.entries()].sort((a, b) => b[0] - a[0]).map(([, items]) => ({
      text: cleanLine(items.sort((a, b) => a.x - b.x).map((item) => item.text).join("")),
      size: Math.max(...items.map((item) => item.size)),
    })).filter((line) => Boolean(line.text));
    for (const edge of [lines[0]?.text, lines.at(-1)?.text]) if (edge && edge.length <= 45 && !isPageNumber(edge)) edgeCounts.set(edge, (edgeCounts.get(edge) || 0) + 1);
    nativePages.push({ lines, page });
  }
  const repeated = new Set([...edgeCounts].filter(([, count]) => count >= 3 && count / document.numPages >= .18).map(([line]) => line));
  const sourcePages: Array<{ text: string; chapterTitle: string; imageData?: string }> = [];
  let seenRealChapter = false;
  for (let index = 0; index < nativePages.length; index += 1) {
    const pageNumber = index + 1;
    const item = nativePages[index];
    const cleanedLineMeta = item.lines.filter((line) => {
      const remove = repeated.has(line.text) || isPageNumber(line.text);
      if (remove && repeated.has(line.text)) quality.repeatedHeadersRemoved += 1;
      return !remove;
    });
    const cleanedLines = cleanedLineMeta.map((line) => line.text);
    let text = cleanedLines.join("\n");
    const sortedSizes = cleanedLineMeta.map((line) => line.size).sort((a, b) => a - b);
    const bodySize = sortedSizes[Math.floor(sortedSizes.length / 2)] || 0;
    const visualHeading = cleanedLineMeta.slice(0, 5).find((line) => line.text.length >= 2 && line.text.length <= 60
      && line.size >= Math.max(13, bodySize * 1.28) && !sentenceEndPattern.test(line.text) && !isFrontMatterTitle(line.text));
    let chapterTitle = cleanedLines.slice(0, 5).map(chapterTitleFor).find(Boolean) || visualHeading?.text || "";
    let frontMatter = cleanedLines.slice(0, 5).some(isFrontMatterTitle);
    let hasIllustration = false;
    let imageData = "";
    const enoughNativeText = (text.match(/[\u3400-\u9fffA-Za-z0-9]/g) || []).length >= 70;
    if (enoughNativeText) {
      quality.nativeTextPages += 1;
      try {
        const operatorList = await item.page.getOperatorList();
        hasIllustration = operatorList.fnArray.some((operator) => operator === pdfjs.OPS.paintImageXObject || operator === pdfjs.OPS.paintImageMaskXObject || operator === pdfjs.OPS.paintInlineImageXObject);
      } catch { /* Text can still be imported if illustration inspection fails. */ }
    } else {
      options.onProgress({ page: pageNumber, total: document.numPages, label: "文字层不足，正在用 MiMo 识别扫描页" });
      imageData = await renderPdfPage(item.page, 1.55, .86);
      const ocr = await options.ocr(imageData, pageNumber);
      text = ocr.text;
      chapterTitle = ocr.chapterTitle || chapterTitleFor(text.split("\n")[0] || "");
      frontMatter = ocr.frontMatter;
      hasIllustration = ocr.hasIllustration;
      quality.ocrPages += 1;
      if (ocr.notice) quality.warnings.push(`第 ${pageNumber} 页：${ocr.notice}`);
    }
    if (frontMatter) {
      quality.skippedFrontMatterPages += 1;
      const matterName = cleanedLines.slice(0, 5).find(isFrontMatterTitle)?.replace(/\s+/g, "") || "";
      if (!seenRealChapter || !/^(后记|索引)$/.test(matterName)) {
        sourcePages.length = 0;
        seenRealChapter = false;
      }
      continue;
    }
    if (!text && !hasIllustration) { quality.warnings.push(`第 ${pageNumber} 页没有识别到正文。`); continue; }
    if (hasIllustration) {
      if (!imageData) imageData = await renderPdfPage(item.page, 1.35, .82);
      quality.illustrationPages += 1;
    }
    sourcePages.push({ text, chapterTitle, ...(hasIllustration && imageData ? { imageData } : {}) });
    if (chapterTitle) seenRealChapter = true;
  }
  const chapters = buildChapters(sourcePages);
  quality.paragraphCount = chapters.reduce((sum, chapter) => sum + chapter.pages.reduce((count, page) => count + page.body.split("\n\n").filter(Boolean).length, 0), 0);
  if (!chapters.length) throw new Error("没有识别到可阅读正文，请检查 PDF 或多模态模型配置。");
  const mode = quality.ocrPages ? quality.nativeTextPages ? "PDF 文字层 + MiMo OCR 混合整理" : "扫描 PDF + MiMo OCR 整理" : "PDF 文字层整理";
  return { chapters, extractionMode: mode, quality };
}

async function renderPdfPage(page: { getViewport(input: { scale: number }): { width: number; height: number }; render(input: { canvasContext: CanvasRenderingContext2D; viewport: unknown; canvas: HTMLCanvasElement }): { promise: Promise<void> } }, scale: number, quality: number) {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("浏览器无法渲染 PDF 页面。");
  await page.render({ canvasContext: context, viewport, canvas }).promise;
  return canvas.toDataURL("image/jpeg", quality);
}
