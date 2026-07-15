export type BookAudioPageTiming = {
  startMs: number;
  endMs: number;
};

export type BookAudioMetadata = {
  bookId: string;
  chapterIndex: number;
  chapterTitle: string;
  audioFile: string;
  pageTimings: BookAudioPageTiming[];
  voiceType: string;
  voiceLabel: string;
  generatedAt: string;
  textDigest: string;
};

type R2ObjectLike = {
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
};

type R2BucketLike = {
  get(key: string): Promise<R2ObjectLike | null>;
};

const bookPattern = /^[a-z0-9-]{2,40}$/;

function chapterStem(chapterIndex: number) {
  return `chapter-${String(chapterIndex + 1).padStart(3, "0")}`;
}

function metadataKey(bookId: string, chapterIndex: number) {
  return `book-audio/${bookId}/${chapterStem(chapterIndex)}.json`;
}

async function readyBucket(): Promise<R2BucketLike | null> {
  try {
    const { env } = await import("cloudflare:workers");
    return (env.UPLOADS as unknown as R2BucketLike | undefined) || null;
  } catch {
    return null;
  }
}

function validateAddress(bookId: string, chapterIndex: number) {
  return bookPattern.test(bookId) && Number.isInteger(chapterIndex) && chapterIndex >= 0 && chapterIndex <= 1000;
}

function parseMetadata(value: string, bookId: string, chapterIndex: number): BookAudioMetadata | null {
  try {
    const parsed = JSON.parse(value) as Partial<BookAudioMetadata>;
    if (parsed.bookId !== bookId || parsed.chapterIndex !== chapterIndex) return null;
    if (!parsed.audioFile || !/^[a-z0-9._-]+\.mp3$/i.test(parsed.audioFile)) return null;
    if (!Array.isArray(parsed.pageTimings) || !parsed.pageTimings.length) return null;
    if (!parsed.pageTimings.every((timing) => Number.isFinite(timing.startMs)
      && Number.isFinite(timing.endMs)
      && timing.startMs >= 0
      && timing.endMs > timing.startMs)) return null;
    if (!parsed.chapterTitle || !parsed.voiceType || !parsed.voiceLabel || !parsed.generatedAt || !parsed.textDigest) return null;
    return parsed as BookAudioMetadata;
  } catch {
    return null;
  }
}

export async function getBookAudioMetadata(bookId: string, chapterIndex: number) {
  if (!validateAddress(bookId, chapterIndex)) return null;
  const key = metadataKey(bookId, chapterIndex);
  const bucket = await readyBucket();
  if (bucket) {
    const object = await bucket.get(key);
    return object ? parseMetadata(await object.text(), bookId, chapterIndex) : null;
  }

  const root = process.env.BOOK_AUDIO_DIR?.trim();
  if (!root) return null;
  try {
    const [{ readFile }, { join }] = await Promise.all([
      import("node:fs/promises"),
      import("node:path"),
    ]);
    return parseMetadata(await readFile(join(root, bookId, `${chapterStem(chapterIndex)}.json`), "utf8"), bookId, chapterIndex);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function getBookAudioBytes(metadata: BookAudioMetadata) {
  const key = `book-audio/${metadata.bookId}/${metadata.audioFile}`;
  const bucket = await readyBucket();
  if (bucket) {
    const object = await bucket.get(key);
    return object ? new Uint8Array(await object.arrayBuffer()) : null;
  }

  const root = process.env.BOOK_AUDIO_DIR?.trim();
  if (!root) return null;
  try {
    const [{ readFile }, { join }] = await Promise.all([
      import("node:fs/promises"),
      import("node:path"),
    ]);
    return new Uint8Array(await readFile(join(root, metadata.bookId, metadata.audioFile)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
