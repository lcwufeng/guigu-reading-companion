import classicBookManifest from "../app/classic-books-manifest.json";

type AssetFetcher = { fetch(request: Request): Promise<Response> };

const classicSlugs = new Set(classicBookManifest.map((book) => book.slug));
const fixedBooks: Record<string, string> = {
  "scarecrow-zh": "scarecrow-zh.md",
  "grimm-zh": "grimms-fairy-tales-zh.md",
  "andersen-zh": "andersens-fairy-tales-zh.md",
};

function bookAssetPath(bookId: string) {
  if (fixedBooks[bookId]) return `/books/${fixedBooks[bookId]}`;
  if (classicSlugs.has(bookId)) return `/books/classics/${bookId}.json`;
  return "";
}

async function cloudflareAssets() {
  try {
    const cloudflareSpecifier = "cloudflare:workers";
    const { env } = await import(/* @vite-ignore */ cloudflareSpecifier) as unknown as {
      env: { ASSETS?: AssetFetcher };
    };
    return env.ASSETS || null;
  } catch {
    return null;
  }
}

async function readLocalAsset(assetPath: string) {
  const [{ readFile }, { join }] = await Promise.all([import("node:fs/promises"), import("node:path")]);
  const relativePath = assetPath.replace(/^\/+/, "");
  const candidates = [
    join(process.cwd(), "public", relativePath),
    join(process.cwd(), "dist", "client", relativePath),
  ];
  for (const filePath of candidates) {
    try {
      return await readFile(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return null;
}

export async function getBundledBookAsset(request: Request, bookId: string) {
  const assetPath = bookAssetPath(bookId);
  if (!assetPath) return null;
  const assets = await cloudflareAssets();
  if (assets) {
    const response = await assets.fetch(new Request(new URL(assetPath, request.url)));
    if (response.ok) return { body: response.body, contentType: response.headers.get("content-type") || "application/octet-stream" };
  }
  const body = await readLocalAsset(assetPath);
  if (!body) return null;
  return {
    body,
    contentType: assetPath.endsWith(".json") ? "application/json; charset=utf-8" : "text/markdown; charset=utf-8",
  };
}
