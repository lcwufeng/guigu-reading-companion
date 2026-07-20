type StoredBookAsset = { body: BodyInit; contentType: string };

const bookIdPattern = /^imported-[0-9a-f-]{36}$/;
const assetIdPattern = /^[0-9a-f-]{36}$/;

async function getBucket() {
  try {
    const { env } = await import("cloudflare:workers");
    return (env as unknown as { UPLOADS?: R2Bucket }).UPLOADS || null;
  } catch { return null; }
}

function validate(bookId: string, assetId: string) {
  if (!bookIdPattern.test(bookId) || !assetIdPattern.test(assetId)) throw new Error("invalid book asset id");
}

function objectKey(bookId: string, assetId: string) {
  validate(bookId, assetId);
  return `books/imported/${bookId}/${assetId}`;
}

async function localRoot() {
  const explicit = process.env.BOOK_ASSET_DIR?.trim();
  if (explicit) return explicit;
  const mistakeRoot = process.env.MISTAKE_IMAGE_DIR?.trim();
  if (!mistakeRoot) throw new Error("book asset storage unavailable");
  const { join } = await import("node:path");
  return join(mistakeRoot, "book-assets");
}

export async function saveImportedBookAsset(bookId: string, bytes: Uint8Array, contentType: string) {
  const assetId = crypto.randomUUID();
  const key = objectKey(bookId, assetId);
  const bucket = await getBucket();
  if (bucket) {
    await bucket.put(key, bytes, { httpMetadata: { contentType } });
    return assetId;
  }
  const [{ mkdir, writeFile }, { join }] = await Promise.all([import("node:fs/promises"), import("node:path")]);
  const directory = join(await localRoot(), bookId);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, assetId), bytes, { mode: 0o600 });
  await writeFile(join(directory, `${assetId}.type`), contentType, { encoding: "utf8", mode: 0o600 });
  return assetId;
}

export async function getImportedBookAsset(bookId: string, assetId: string): Promise<StoredBookAsset | null> {
  const key = objectKey(bookId, assetId);
  const bucket = await getBucket();
  if (bucket) {
    const object = await bucket.get(key);
    if (!object) return null;
    return { body: object.body as unknown as BodyInit, contentType: object.httpMetadata?.contentType || "image/jpeg" };
  }
  const [{ readFile }, { join }] = await Promise.all([import("node:fs/promises"), import("node:path")]);
  try {
    const directory = join(await localRoot(), bookId);
    const [body, contentType] = await Promise.all([readFile(join(directory, assetId)), readFile(join(directory, `${assetId}.type`), "utf8")]);
    return { body, contentType: contentType.trim() || "image/jpeg" };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
