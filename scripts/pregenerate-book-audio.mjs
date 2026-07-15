import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const SUBMIT_ENDPOINT = "https://openspeech.bytedance.com/api/v1/tts_async/submit";
const QUERY_ENDPOINT = "https://openspeech.bytedance.com/api/v1/tts_async/query";
const VOICE_TYPE = "BV104_streaming";
const VOICE_LABEL = "温柔女声（温柔淑女）";
const SPEECH_RATE = 0.92;
const PAGE_MAX_CHARS = 1450;

const books = [
  { id: "scarecrow-zh", file: "public/books/scarecrow-zh.md" },
  { id: "grimm-zh", file: "public/books/grimms-fairy-tales-zh.md" },
  { id: "andersen-zh", file: "public/books/andersens-fairy-tales-zh.md" },
];

const args = process.argv.slice(2);
function argument(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

const outputRoot = resolve(argument("--output") || process.env.BOOK_AUDIO_DIR || "public/generated/book-audio");
const onlyBook = argument("--book");
const onlyChapterArgument = argument("--chapter");
const onlyChapter = onlyChapterArgument === undefined ? null : Number(onlyChapterArgument);
const pollOnce = args.includes("--once");
const pollIntervalMs = Math.max(5_000, Number(process.env.VOLC_TTS_POLL_INTERVAL_MS) || 20_000);
const maxWaitMs = Math.max(10 * 60_000, Number(process.env.VOLC_TTS_MAX_WAIT_MS) || 4 * 60 * 60_000);

const appId = process.env.VOLC_TTS_APP_ID || process.env.VOLC_SPEECH_APP_ID;
const accessToken = process.env.VOLC_TTS_ACCESS_TOKEN || process.env.VOLC_SPEECH_ACCESS_TOKEN;
const resourceId = process.env.VOLC_TTS_RESOURCE_ID || "volc.tts_async.default";

if (!appId || !accessToken) {
  throw new Error("缺少 VOLC_TTS_APP_ID / VOLC_TTS_ACCESS_TOKEN，无法提前生成朗读音频");
}
if (onlyChapter !== null && (!Number.isInteger(onlyChapter) || onlyChapter < 0)) {
  throw new Error("--chapter 必须是从 0 开始的章节序号");
}

const sleep = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
const exists = (path) => access(path).then(() => true).catch(() => false);

function digest(text) {
  return createHash("sha256").update(`${VOICE_TYPE}:${SPEECH_RATE}:${text}`).digest("hex");
}

function paginateChapter(title, paragraphs) {
  const pages = [];
  let current = "";
  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length > PAGE_MAX_CHARS && current) {
      pages.push({ heading: title, body: current });
      current = paragraph;
    } else {
      current = next;
    }
  }
  if (current) pages.push({ heading: title, body: current });
  return pages;
}

function parseMarkdownBook(text) {
  const normalized = text.replace(/\r/g, "");
  const firstDivider = normalized.search(/^---\s*$/m);
  const body = firstDivider >= 0 ? normalized.slice(firstDivider).replace(/^---\s*$/m, "") : normalized;
  const headings = [...body.matchAll(/^#\s+(.+)\s*$/gm)];
  return headings.flatMap((heading, index) => {
    const title = heading[1].trim();
    const start = (heading.index || 0) + heading[0].length;
    const end = headings[index + 1]?.index ?? body.length;
    const paragraphs = body
      .slice(start, end)
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.replace(/^---\s*$/gm, "").trim())
      .filter(Boolean);
    return paragraphs.length ? [{ title, pages: paginateChapter(title, paragraphs) }] : [];
  });
}

function prepareChapter(chapter) {
  const pageParagraphs = chapter.pages.map((page) => page.body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean));
  pageParagraphs[0] = [`${chapter.title}。`, ...pageParagraphs[0]];
  return {
    text: pageParagraphs.flat().join("\n"),
    pageParagraphCounts: pageParagraphs.map((paragraphs) => paragraphs.length),
    pageWeights: pageParagraphs.map((paragraphs) => paragraphs.join("").length),
  };
}

function buildPageTimings(sentences, counts, weights) {
  const totalEnd = Math.max(1, ...sentences.map((sentence) => Number(sentence.end_time) || 0));
  const totalWeight = Math.max(1, weights.reduce((sum, weight) => sum + weight, 0));
  let paragraphCursor = 1;
  let weightCursor = 0;
  return counts.map((count, index) => {
    const firstParagraph = paragraphCursor;
    const lastParagraph = paragraphCursor + count - 1;
    const matched = sentences.filter((sentence) => {
      const paragraph = Number(sentence.paragraph_no);
      return paragraph >= firstParagraph && paragraph <= lastParagraph;
    });
    const fallbackStart = Math.round(totalEnd * (weightCursor / totalWeight));
    weightCursor += weights[index];
    const fallbackEnd = Math.round(totalEnd * (weightCursor / totalWeight));
    paragraphCursor += count;
    return {
      startMs: matched.length ? Math.max(0, Math.min(...matched.map((sentence) => Number(sentence.begin_time) || 0))) : fallbackStart,
      endMs: matched.length ? Math.max(...matched.map((sentence) => Number(sentence.end_time) || 0)) : Math.max(fallbackStart + 500, fallbackEnd),
    };
  });
}

function headers() {
  return {
    Authorization: `Bearer;${accessToken}`,
    "Content-Type": "application/json",
    "Resource-Id": resourceId,
  };
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJsonAtomically(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

async function responseJson(response) {
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`火山语音接口返回了无效数据（HTTP ${response.status}）`);
  }
  if (!response.ok || parsed.code) throw new Error(parsed.message || `火山语音接口请求失败（HTTP ${response.status}）`);
  return parsed;
}

async function submitChapter(chapter) {
  const response = await fetch(SUBMIT_ENDPOINT, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      appid: appId,
      reqid: randomUUID(),
      text: chapter.text,
      format: "mp3",
      voice_type: VOICE_TYPE,
      language: "zh",
      sample_rate: 24000,
      volume: 1.05,
      speed: SPEECH_RATE,
      pitch: 1,
      sentence_interval: 380,
      enable_subtitle: 1,
    }),
  });
  return responseJson(response);
}

async function queryTask(taskId) {
  const url = new URL(QUERY_ENDPOINT);
  url.searchParams.set("appid", appId);
  url.searchParams.set("task_id", taskId);
  return responseJson(await fetch(url, { headers: headers() }));
}

async function downloadAudio(url, destination) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`音频下载失败（HTTP ${response.status}）`);
  const temporary = `${destination}.${process.pid}.tmp`;
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(temporary, new Uint8Array(await response.arrayBuffer()), { mode: 0o644 });
  await rename(temporary, destination);
}

const jobsPath = join(outputRoot, ".generation-jobs.json");
const jobs = await readJson(jobsPath, {});
const pending = [];
let skipped = 0;

for (const book of books.filter((item) => !onlyBook || item.id === onlyBook)) {
  const chapters = parseMarkdownBook(await readFile(resolve(book.file), "utf8"));
  for (const [chapterIndex, chapter] of chapters.entries()) {
    if (onlyChapter !== null && chapterIndex !== onlyChapter) continue;
    const prepared = prepareChapter(chapter);
    const textDigest = digest(prepared.text);
    const stem = `chapter-${String(chapterIndex + 1).padStart(3, "0")}`;
    const directory = join(outputRoot, book.id);
    const metadataPath = join(directory, `${stem}.json`);
    const audioPath = join(directory, `${stem}.mp3`);
    const metadata = await readJson(metadataPath, null);
    if (metadata?.textDigest === textDigest && metadata.voiceType === VOICE_TYPE && await exists(audioPath)) {
      skipped += 1;
      continue;
    }

    const key = `${book.id}:${chapterIndex}`;
    let job = jobs[key];
    if (!job || job.textDigest !== textDigest || job.voiceType !== VOICE_TYPE || job.failed) {
      const submitted = await submitChapter(prepared);
      job = jobs[key] = {
        taskId: submitted.task_id,
        bookId: book.id,
        chapterIndex,
        chapterTitle: chapter.title,
        textDigest,
        voiceType: VOICE_TYPE,
        submittedAt: new Date().toISOString(),
      };
      await writeJsonAtomically(jobsPath, jobs);
      await sleep(350);
    }
    pending.push({ ...job, prepared, metadataPath, audioPath, stem });
  }
}

console.log(`温柔女声预生成：已存在 ${skipped} 章，等待生成 ${pending.length} 章`);
const startedAt = Date.now();
let remaining = pending;
while (remaining.length) {
  const next = [];
  for (const job of remaining) {
    try {
      const result = await queryTask(job.taskId);
      if (result.task_status === 0) {
        next.push(job);
      } else if (result.task_status === 1 && result.audio_url) {
        await downloadAudio(result.audio_url, job.audioPath);
        const pageTimings = buildPageTimings(result.sentences || [], job.prepared.pageParagraphCounts, job.prepared.pageWeights);
        await writeJsonAtomically(job.metadataPath, {
          bookId: job.bookId,
          chapterIndex: job.chapterIndex,
          chapterTitle: job.chapterTitle,
          audioFile: `${job.stem}.mp3`,
          pageTimings,
          voiceType: VOICE_TYPE,
          voiceLabel: VOICE_LABEL,
          generatedAt: new Date().toISOString(),
          textDigest: job.textDigest,
        });
        delete jobs[`${job.bookId}:${job.chapterIndex}`];
        await writeJsonAtomically(jobsPath, jobs);
        console.log(`已生成：${job.bookId} · ${job.chapterTitle}`);
      } else {
        jobs[`${job.bookId}:${job.chapterIndex}`] = { ...jobs[`${job.bookId}:${job.chapterIndex}`], failed: true };
        await writeJsonAtomically(jobsPath, jobs);
        console.error(`生成失败：${job.bookId} · ${job.chapterTitle}`);
      }
    } catch (error) {
      console.error(`查询失败：${job.bookId} · ${job.chapterTitle} · ${error.message}`);
      next.push(job);
    }
    await sleep(250);
  }
  remaining = next;
  if (!remaining.length || pollOnce) break;
  if (Date.now() - startedAt > maxWaitMs) throw new Error("等待预生成音频超时，请稍后重新运行脚本继续查询");
  await sleep(pollIntervalMs);
}

console.log(remaining.length ? `仍有 ${remaining.length} 章在生成队列中` : "三本书的温柔女声朗读音频已全部准备好");
