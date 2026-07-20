/* eslint-disable @next/next/no-img-element -- Local PDF preview images are administrator-provided book pages. */
"use client";

import { BookCheck, BookCopy, Eye, EyeOff, FileCheck2, FileSearch, Image as ImageIcon, LoaderCircle, ScanText, Send, UploadCloud, WandSparkles } from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import type { ImportedBookSummary } from "../../db/book-imports";
import { analyzePdfBook, analyzeStructuredBook, analyzeTextBook, type ImportAnalysis } from "../../lib/book-import-client";
import styles from "./AdminCenter.module.css";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const MAX_FILE_SIZE = 80_000_000;

type Metadata = { title: string; author: string; grade: string; summary: string; knowledge: string; memoryCategory: string };
const blankMetadata: Metadata = { title: "", author: "", grade: "小学经典读物", summary: "", knowledge: "", memoryCategory: "儿童文学" };

function formatSize(bytes: number) {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1_000))} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function fileFormat(file: File) {
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  if (extension === "pdf") return "pdf";
  if (extension === "md" || extension === "markdown") return "markdown";
  if (extension === "txt") return "txt";
  if (extension === "json") return "json";
  return "";
}

export default function BookImportPanel() {
  const [books, setBooks] = useState<ImportedBookSummary[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [bookId, setBookId] = useState("");
  const [metadata, setMetadata] = useState<Metadata>(blankMetadata);
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [progress, setProgress] = useState({ page: 0, total: 0, label: "" });
  const [busy, setBusy] = useState<"analyzing" | "publishing" | "status" | "">("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [expandedChapter, setExpandedChapter] = useState(0);

  async function loadBooks() {
    const response = await fetch(`${BASE_PATH}/api/admin/books`, { cache: "no-store" });
    const data = await response.json() as { books?: ImportedBookSummary[]; error?: string };
    if (!response.ok) throw new Error(data.error || "图书记录读取失败。");
    setBooks(data.books || []);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadBooks().catch((caught) => setError(caught instanceof Error ? caught.message : "图书记录读取失败。")), 0);
    return () => window.clearTimeout(timer);
  }, []);

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] || null;
    setError(""); setMessage(""); setAnalysis(null); setProgress({ page: 0, total: 0, label: "" });
    if (!next) { setFile(null); return; }
    if (!fileFormat(next)) { setError("请选择 PDF、Markdown、TXT 或结构化 JSON 文件。"); event.target.value = ""; return; }
    if (next.size > MAX_FILE_SIZE) { setError("单个文件不能超过 80MB，请拆分后再导入。"); event.target.value = ""; return; }
    setFile(next);
    setBookId(`imported-${crypto.randomUUID()}`);
    const inferredTitle = next.name.replace(/\.(pdf|md|markdown|txt|json)$/i, "").replace(/^\d+[\s._-]*/, "").trim();
    setMetadata((current) => ({ ...current, title: current.title || inferredTitle }));
  }

  async function requestOcr(imageData: string, pageNumber: number) {
    const response = await fetch(`${BASE_PATH}/api/admin/books/ocr`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ imageData, pageNumber }) });
    const data = await response.json() as { text?: string; chapterTitle?: string; frontMatter?: boolean; hasIllustration?: boolean; notice?: string; error?: string };
    if (!response.ok) throw new Error(data.error || `第 ${pageNumber} 页识别失败。`);
    return { text: data.text || "", chapterTitle: data.chapterTitle || "", frontMatter: data.frontMatter === true, hasIllustration: data.hasIllustration === true, notice: data.notice || "" };
  }

  async function analyze(event: FormEvent) {
    event.preventDefault();
    if (!file) { setError("请先选择一本电子书。"); return; }
    setBusy("analyzing"); setError(""); setMessage("");
    try {
      const format = fileFormat(file);
      let result: ImportAnalysis;
      if (format === "pdf") result = await analyzePdfBook(file, { basePath: BASE_PATH, onProgress: setProgress, ocr: requestOcr });
      else {
        setProgress({ page: 1, total: 1, label: "正在整理章节与段落" });
        const text = await file.text();
        result = format === "json" ? analyzeStructuredBook(text) : analyzeTextBook(text, format as "markdown" | "txt");
      }
      if (!result.chapters.length) throw new Error("没有识别到可以发布的正文。");
      setAnalysis(result);
      setExpandedChapter(0);
      setMessage(`分析完成：识别 ${result.chapters.length} 章、${result.chapters.reduce((sum, chapter) => sum + chapter.pages.length, 0)} 个阅读页。请检查后再发布。`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "文件分析失败。"); }
    finally { setBusy(""); }
  }

  const pendingImages = useMemo(() => analysis?.chapters.reduce((sum, chapter) => sum + chapter.pages.filter((page) => page.pendingImageData).length, 0) || 0, [analysis]);

  async function publish() {
    if (!file || !analysis) return;
    if (!metadata.title.trim() || !metadata.summary.trim() || !metadata.knowledge.trim()) { setError("发布前请填写书名、内容简介和章节知识补充。字段不能留空。"); return; }
    if (!window.confirm(`确认把《${metadata.title.trim()}》发布到学生书房吗？`)) return;
    setBusy("publishing"); setError(""); setMessage("");
    try {
      let uploaded = 0;
      const chapters = [];
      for (const chapter of analysis.chapters) {
        const pages = [];
        for (const page of chapter.pages) {
          const images: Array<{ src: string; alt: string }> = [];
          if (page.pendingImageData) {
            setProgress({ page: uploaded + 1, total: pendingImages, label: "正在保存原书插图" });
            const response = await fetch(`${BASE_PATH}/api/admin/books/assets`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bookId, imageData: page.pendingImageData }) });
            const data = await response.json() as { src?: string; error?: string };
            if (!response.ok || !data.src) throw new Error(data.error || "原书插图保存失败。");
            images.push({ src: data.src, alt: `${metadata.title}原书插图` });
            uploaded += 1;
          }
          pages.push({ heading: page.heading, body: page.body, ...(images.length ? { images } : {}) });
        }
        chapters.push({ id: chapter.id, title: chapter.title, pages });
      }
      const response = await fetch(`${BASE_PATH}/api/admin/books`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookId, ...metadata, sourceFilename: file.name, sourceFormat: fileFormat(file), sourceSize: file.size, extractionMode: analysis.extractionMode, qualityReport: analysis.quality, chapters }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "图书发布失败。");
      setMessage(`《${metadata.title.trim()}》已经发布到学生书房。`);
      setFile(null); setAnalysis(null); setMetadata(blankMetadata); setBookId(""); setProgress({ page: 0, total: 0, label: "" });
      await loadBooks();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "图书发布失败。"); }
    finally { setBusy(""); }
  }

  async function toggleStatus(book: ImportedBookSummary) {
    const nextStatus = book.status === "published" ? "hidden" : "published";
    if (!window.confirm(`${nextStatus === "hidden" ? "从学生书房下架" : "重新发布"}《${book.title}》吗？学生的既有阅读进度会保留。`)) return;
    setBusy("status"); setError("");
    try {
      const response = await fetch(`${BASE_PATH}/api/admin/books`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ bookId: book.id, status: nextStatus }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "状态更新失败。");
      setMessage(nextStatus === "hidden" ? `《${book.title}》已从学生书房下架。` : `《${book.title}》已重新发布。`);
      await loadBooks();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "状态更新失败。"); }
    finally { setBusy(""); }
  }

  function updateChapterTitle(index: number, title: string) {
    setAnalysis((current) => current ? { ...current, chapters: current.chapters.map((chapter, chapterIndex) => chapterIndex === index ? { ...chapter, title: title.slice(0, 140), pages: chapter.pages.map((page) => ({ ...page, heading: title.slice(0, 140) })) } : chapter) } : current);
  }

  function removeIllustration(chapterIndex: number, pageIndex: number) {
    setAnalysis((current) => current ? { ...current, chapters: current.chapters.map((chapter, cIndex) => cIndex === chapterIndex ? { ...chapter, pages: chapter.pages.map((page, pIndex) => pIndex === pageIndex ? { ...page, pendingImageData: undefined } : page) } : chapter) } : current);
  }

  function updatePageBody(chapterIndex: number, pageIndex: number, body: string) {
    setAnalysis((current) => current ? { ...current, chapters: current.chapters.map((chapter, cIndex) => cIndex === chapterIndex ? { ...chapter, pages: chapter.pages.map((page, pIndex) => pIndex === pageIndex ? { ...page, body: body.slice(0, 20_000) } : page) } : chapter) } : current);
  }

  function removeChapter(chapterIndex: number) {
    if (!analysis || analysis.chapters.length <= 1) { setError("一本书至少需要保留一个正文章节。"); return; }
    if (!window.confirm(`确定删除“${analysis.chapters[chapterIndex].title}”及其全部阅读页吗？`)) return;
    setAnalysis((current) => current ? { ...current, chapters: current.chapters.filter((_, index) => index !== chapterIndex).map((chapter, index) => ({ ...chapter, id: String(index + 1) })) } : current);
    setExpandedChapter(Math.max(0, chapterIndex - 1));
  }

  return <>
    <div className={styles.title}><span>图书导入</span><h1>电子书整理工作台</h1><p>把过去的本地脚本流程做成后台功能：先分析、再核对，确认后才进入学生书房。</p></div>
    {(error || message) && <div className={error ? styles.errorToast : styles.toast}>{error || message}</div>}

    <section className={styles.importPipeline} aria-label="电子书导入流程">
      {[
        [FileSearch, "1. 文件分析", "检查格式与文字层"], [ScanText, "2. 识别正文", "文字层不足时用 MiMo OCR"],
        [BookCopy, "3. 拆分章节", "去掉目录、前言与序"], [WandSparkles, "4. 修复段落", "合并跨行断句并重新分页"],
        [ImageIcon, "5. 保留插图", "把原书插图放回相关页面"], [BookCheck, "6. 核对发布", "管理员确认后进入书房"],
      ].map(([Icon, title, detail]) => <article key={String(title)}><Icon /><strong>{String(title)}</strong><span>{String(detail)}</span></article>)}
    </section>

    <form className={styles.importForm} onSubmit={analyze}>
      <section className={styles.panel}>
        <h2><UploadCloud /> 选择电子书</h2>
        <label className={styles.fileDrop}><input type="file" accept=".pdf,.md,.markdown,.txt,.json,application/pdf,text/plain,application/json" onChange={chooseFile} disabled={Boolean(busy)} /><UploadCloud /><strong>{file ? file.name : "选择或拖入一本电子书"}</strong><span>{file ? `${fileFormat(file).toUpperCase()} · ${formatSize(file.size)}` : "支持 PDF、Markdown、TXT、JSON；单本不超过 80MB"}</span></label>
        <div className={styles.importNotice}><FileCheck2 /><span>扫描版 PDF 会逐页调用后台配置的 MiMo；处理时间取决于扫描页数量，分析时请保持页面打开。</span></div>
      </section>
      <section className={styles.panel}>
        <h2><BookCheck /> 图书信息</h2>
        <div className={styles.formGrid}>
          <label><span>书名 *</span><input value={metadata.title} onChange={(event) => setMetadata({ ...metadata, title: event.target.value })} maxLength={100} /></label>
          <label><span>作者</span><input value={metadata.author} onChange={(event) => setMetadata({ ...metadata, author: event.target.value })} maxLength={80} placeholder="不详可留空" /></label>
          <label><span>年级 / 分类</span><input value={metadata.grade} onChange={(event) => setMetadata({ ...metadata, grade: event.target.value })} maxLength={40} /></label>
          <label><span>长期记忆类别</span><input value={metadata.memoryCategory} onChange={(event) => setMetadata({ ...metadata, memoryCategory: event.target.value })} maxLength={80} /></label>
          <label className={styles.wideField}><span>内容简介 *</span><textarea value={metadata.summary} onChange={(event) => setMetadata({ ...metadata, summary: event.target.value })} maxLength={600} placeholder="给学生看的全书简介" /></label>
          <label className={styles.wideField}><span>章节知识补充 *</span><textarea value={metadata.knowledge} onChange={(event) => setMetadata({ ...metadata, knowledge: event.target.value })} maxLength={1000} placeholder="目前作为每章专属知识尚未单独设置时的兜底内容" /></label>
        </div>
        <button className={styles.primary} disabled={!file || Boolean(busy)}><FileSearch />{busy === "analyzing" ? "正在分析…" : analysis ? "重新分析文件" : "开始分析"}</button>
        {busy === "analyzing" && progress.total > 0 && <div className={styles.importProgress}><span><LoaderCircle />{progress.label}</span><strong>{progress.page}/{progress.total}</strong><i><b style={{ width: `${Math.min(100, progress.page / progress.total * 100)}%` }} /></i></div>}
      </section>
    </form>

    {analysis && <section className={styles.reviewArea}>
      <header><div><span>发布前检查</span><h2>章节与质量报告</h2></div><button className={styles.publishButton} type="button" onClick={() => void publish()} disabled={Boolean(busy)}><Send />{busy === "publishing" ? "正在保存并发布…" : "确认并发布到书房"}</button></header>
      <div className={styles.qualityGrid}>
        <article><strong>{analysis.chapters.length}</strong><span>正文章节</span></article><article><strong>{analysis.quality.nativeTextPages}</strong><span>文字层页</span></article><article><strong>{analysis.quality.ocrPages}</strong><span>OCR 页</span></article><article><strong>{analysis.quality.skippedFrontMatterPages}</strong><span>已去掉前置页</span></article><article><strong>{pendingImages}</strong><span>待保存插图</span></article><article><strong>{analysis.quality.paragraphCount}</strong><span>整理后段落</span></article>
      </div>
      {analysis.quality.warnings.length > 0 && <div className={styles.importWarnings}><strong>需要人工留意</strong>{analysis.quality.warnings.slice(0, 12).map((warning) => <span key={warning}>{warning}</span>)}</div>}
      <div className={styles.chapterReview}>
        {analysis.chapters.map((chapter, chapterIndex) => <article key={chapter.id} className={expandedChapter === chapterIndex ? styles.expanded : ""}>
          <button type="button" onClick={() => setExpandedChapter(chapterIndex)}><span>{String(chapterIndex + 1).padStart(2, "0")}</span><strong>{chapter.title}</strong><em>{chapter.pages.length} 页</em></button>
          {expandedChapter === chapterIndex && <div><div className={styles.chapterEditHead}><label><span>章节标题</span><input value={chapter.title} onChange={(event) => updateChapterTitle(chapterIndex, event.target.value)} /></label><button type="button" onClick={() => removeChapter(chapterIndex)}>删除误识别章节</button></div><div className={styles.pageEditList}>{chapter.pages.map((page, pageIndex) => <section key={pageIndex}><label><span>第 {pageIndex + 1} 个阅读页正文</span><textarea value={page.body} onChange={(event) => updatePageBody(chapterIndex, pageIndex, event.target.value)} placeholder="这一页只有原书插图" /></label>{page.pendingImageData ? <figure><img src={page.pendingImageData} alt={`第 ${pageIndex + 1} 页待保留插图`} /><figcaption>这一页检测到原书插图 <button type="button" onClick={() => removeIllustration(chapterIndex, pageIndex)}>不保留这张图</button></figcaption></figure> : null}</section>)}</div></div>}
        </article>)}
      </div>
    </section>}

    <section className={styles.panel}>
      <h2><BookCopy /> 后台导入的图书</h2>
      {books.length ? <div className={styles.importedBookList}>{books.map((book) => <article key={book.id}><div className={styles.importedBookMark}>{book.title.slice(0, 1)}</div><div><strong>{book.title}</strong><span>{book.author || "佚名"} · {book.grade}</span><small>{book.chapterCount} 章 · {book.pageCount} 阅读页 · {book.imageCount} 张插图 · {book.extractionMode}</small></div><em className={book.status === "published" ? styles.success : styles.warning}>{book.status === "published" ? "书房可见" : "已下架"}</em><button type="button" onClick={() => void toggleStatus(book)} disabled={Boolean(busy)}>{book.status === "published" ? <EyeOff /> : <Eye />}{book.status === "published" ? "下架" : "重新发布"}</button></article>)}</div> : <div className={styles.empty}><BookCopy /><span>还没有通过后台导入的图书。</span></div>}
    </section>
  </>;
}
