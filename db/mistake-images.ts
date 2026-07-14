type StoredImage = {
  body: BodyInit;
  contentType: string;
};

const imageIdPattern = /^[0-9a-f-]{36}$/;

async function getBucket() {
  try {
    const { env } = await import("cloudflare:workers");
    return (env as unknown as { UPLOADS?: R2Bucket }).UPLOADS || null;
  } catch {
    return null;
  }
}

function imageKey(userId: string, imageId: string) {
  if (!imageIdPattern.test(imageId)) throw new Error("invalid image id");
  return `mistakes/${userId}/${imageId}`;
}

export async function saveMistakeImage(userId: string, bytes: Uint8Array, contentType: string) {
  const imageId = crypto.randomUUID();
  const key = imageKey(userId, imageId);
  const bucket = await getBucket();
  if (bucket) {
    await bucket.put(key, bytes, { httpMetadata: { contentType } });
    return imageId;
  }
  const root = process.env.MISTAKE_IMAGE_DIR?.trim();
  if (!root) throw new Error("mistake image storage unavailable");
  const [{ mkdir, writeFile }, { join }] = await Promise.all([import("node:fs/promises"), import("node:path")]);
  const directory = join(root, userId);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, imageId), bytes, { mode: 0o600 });
  await writeFile(join(directory, `${imageId}.type`), contentType, { encoding: "utf8", mode: 0o600 });
  return imageId;
}

export async function getMistakeImage(userId: string, imageId: string): Promise<StoredImage | null> {
  const key = imageKey(userId, imageId);
  const bucket = await getBucket();
  if (bucket) {
    const object = await bucket.get(key);
    if (!object) return null;
    return { body: object.body as unknown as BodyInit, contentType: object.httpMetadata?.contentType || "image/jpeg" };
  }
  const root = process.env.MISTAKE_IMAGE_DIR?.trim();
  if (!root) throw new Error("mistake image storage unavailable");
  const [{ readFile }, { join }] = await Promise.all([import("node:fs/promises"), import("node:path")]);
  try {
    const directory = join(root, userId);
    const [bytes, contentType] = await Promise.all([
      readFile(join(directory, imageId)),
      readFile(join(directory, `${imageId}.type`), "utf8"),
    ]);
    return { body: bytes, contentType: contentType.trim() || "image/jpeg" };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function deleteMistakeImage(userId: string, imageId: string) {
  const key = imageKey(userId, imageId);
  const bucket = await getBucket();
  if (bucket) {
    await bucket.delete(key);
    return;
  }
  const root = process.env.MISTAKE_IMAGE_DIR?.trim();
  if (!root) throw new Error("mistake image storage unavailable");
  const [{ rm }, { join }] = await Promise.all([import("node:fs/promises"), import("node:path")]);
  const directory = join(root, userId);
  await Promise.all([
    rm(join(directory, imageId), { force: true }),
    rm(join(directory, `${imageId}.type`), { force: true }),
  ]);
}
