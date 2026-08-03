"use client";

import { getBackgroundMusicSources, getHomeMusicSources, prepareStartupMusic } from "./sound-system";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const ASSET = `${BASE_PATH}/assets`;
const STARTUP_TIMEOUT_MS = 300_000;
const MINIMUM_VISIBLE_MS = 900;
const IMAGE_RETRY_COUNT = 2;
const IMAGE_CONCURRENCY = 8;
const STARTUP_ASSET_MANIFEST = `${ASSET}/startup-assets-manifest.json`;

// These are the assets visible immediately after the student enters: the
// learning house, its status bar, the action icons, navigation and main turtle.
// The remaining rooms are warmed in the background after this first screen opens.
export const FIRST_SCREEN_IMAGE_SOURCES = [
  `${ASSET}/optimized/backgrounds/main_home.webp`,
  `${ASSET}/ui/supplied/brand/logo-20260715.png`,
  `${ASSET}/characters/turtle/turtle_idle_front.png`,
  `${ASSET}/characters/turtle/turtle_idle_standing.png`,
  `${ASSET}/characters/turtle/turtle_hungry.png`,
  `${ASSET}/characters/turtle/turtle_dirty.png`,
  `${ASSET}/characters/turtle/turtle_bored_sitting.png`,
  `${ASSET}/characters/turtle/turtle_low_mood.png`,
  `${ASSET}/characters/turtle/turtle_thinking.png`,
  `${ASSET}/characters/turtle/turtle_waving.png`,
  `${ASSET}/ui/home-refresh/frames/top-frame.png`,
  `${ASSET}/ui/home-refresh/status/panel.png`,
  `${ASSET}/ui/home-refresh/status/turtle-head.png`,
  `${ASSET}/ui/home-refresh/status/hunger.png`,
  `${ASSET}/ui/home-refresh/status/cleanliness.png`,
  `${ASSET}/ui/home-refresh/status/fun.png`,
  `${ASSET}/ui/home-refresh/status/mood.png`,
  `${ASSET}/ui/home-refresh/actions/swim.png`,
  `${ASSET}/ui/home-refresh/actions/feed.png`,
  `${ASSET}/ui/home-refresh/actions/hide.png`,
  `${ASSET}/ui/home-refresh/actions/sleep.png`,
  `${ASSET}/ui/daily-tasks/panel.png`,
  `${ASSET}/ui/daily-tasks/title.png`,
  `${ASSET}/ui/daily-tasks/reward-star.png`,
  `${ASSET}/ui/nav-v2/learning-house.png`,
  `${ASSET}/ui/nav-v2/library.png`,
  `${ASSET}/ui/nav-v2/mistakes.png`,
  `${ASSET}/ui/nav-v2/chat.png`,
  `${ASSET}/ui/nav-v2/travel.png`,
  `${ASSET}/ui/nav-v2/journal.png`,
  `${ASSET}/objects/fruit_orange.png`,
  `${ASSET}/legacy/travel/travel_ticket.png`,
  `${ASSET}/ui/icons/play-ticket-pixel.png`,
] as const;

type StartupAssetManifest = {
  version: number;
  imageCount: number;
  totalBytes: number;
  images: string[];
};

type StartupResource = {
  source: string;
  kind: "image" | "music";
};

type PreloadPhase = "initial" | "background";

export type StartupPreloadProgress = {
  completed: number;
  total: number;
  failed: number;
  percent: number;
  kind: "image" | "music";
  phase: PreloadPhase;
  label: string;
};

export type StartupPreloadResult = {
  completed: number;
  total: number;
  failed: number;
  timedOut: boolean;
  ready: boolean;
};

type PreloadSummary = Pick<StartupPreloadResult, "completed" | "total" | "failed">;

function waitForImage(source: string, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Startup preload aborted", "AbortError"));
      return;
    }
    const image = new Image();
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const abort = () => {
      image.src = "";
      finish(new DOMException("Startup preload aborted", "AbortError"));
    };
    const cleanup = () => {
      signal.removeEventListener("abort", abort);
      image.onload = null;
      image.onerror = null;
    };
    image.onload = async () => {
      try {
        if (typeof image.decode === "function") await image.decode();
        if (!image.naturalWidth || !image.naturalHeight) throw new Error(`Image has no display size: ${source}`);
        finish();
      } catch {
        finish(new Error(`Image could not be decoded: ${source}`));
      }
    };
    image.onerror = () => finish(new Error(`Image unavailable: ${source}`));
    signal.addEventListener("abort", abort, { once: true });
    image.decoding = "async";
    image.src = source;
    if (image.complete && image.naturalWidth > 0) void image.onload?.(new Event("load"));
  });
}

async function waitForImageWithRetry(source: string, signal: AbortSignal) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= IMAGE_RETRY_COUNT; attempt += 1) {
    try {
      await waitForImage(source, signal);
      return;
    } catch (error) {
      lastError = error;
      if (signal.aborted || isAbortError(error)) throw error;
      if (attempt < IMAGE_RETRY_COUNT) await delay(250 * (attempt + 1));
    }
  }
  throw lastError;
}

async function getPrimaryInterfaceImageSources(signal: AbortSignal) {
  const response = await fetch(STARTUP_ASSET_MANIFEST, { cache: "no-cache", signal });
  if (!response.ok) throw new Error(`Startup asset manifest unavailable: ${response.status}`);
  const manifest = await response.json() as StartupAssetManifest;
  if (
    manifest.version !== 1
    || !Array.isArray(manifest.images)
    || manifest.imageCount !== manifest.images.length
    || !manifest.images.length
  ) {
    throw new Error("Primary interface asset manifest is invalid");
  }
  const images = manifest.images
    .filter((path): path is string => typeof path === "string" && !path.startsWith("/") && !path.includes(".."))
    .map((path) => `${ASSET}/${path}`);
  if (images.length !== manifest.images.length) throw new Error("Primary interface asset manifest contains unsafe paths");
  return [...new Set(images)];
}

async function fullyFetchMusic(source: string, signal: AbortSignal) {
  const response = await fetch(source, { cache: "force-cache", signal });
  if (!response.ok) throw new Error(`Music unavailable: ${source}`);
  if (!response.body) {
    await response.arrayBuffer();
    return;
  }
  const reader = response.body.getReader();
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) return;
  }
}

async function runWithConcurrency(tasks: Array<() => Promise<void>>, concurrency: number) {
  let nextTask = 0;
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (nextTask < tasks.length) {
      const task = tasks[nextTask];
      nextTask += 1;
      await task();
    }
  });
  await Promise.all(workers);
}

function delay(duration: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, duration));
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function calculateResourcePercent(completed: number, total: number) {
  if (total <= 0) return 0;
  if (completed >= total) return 100;
  return Math.min(99, Math.floor(completed / total * 100));
}

function labelFor(phase: PreloadPhase, kind: "image" | "music") {
  if (phase === "initial") return kind === "music" ? "正在准备学习屋首页音乐" : "正在加载学习屋首页";
  return kind === "music" ? "正在后台准备其他场景音乐" : "正在后台加载其他界面图片";
}

async function preloadResources(
  resources: StartupResource[],
  phase: PreloadPhase,
  onProgress: (progress: StartupPreloadProgress) => void,
  signal: AbortSignal,
  prepareHomeMusic = false,
): Promise<PreloadSummary> {
  let completed = 0;
  let failed = 0;
  const notify = (kind: "image" | "music") => {
    onProgress({
      completed,
      total: resources.length,
      failed,
      percent: calculateResourcePercent(completed, resources.length),
      kind,
      phase,
      label: labelFor(phase, kind),
    });
  };
  const finish = (kind: "image" | "music", success: boolean) => {
    // A timeout freezes the displayed first-screen progress. Aborted work is
    // deliberately not counted as loaded, so it can never jump to 100%.
    if (signal.aborted) return;
    if (success) completed += 1;
    else failed += 1;
    notify(kind);
  };

  const imageTasks = resources
    .filter((resource) => resource.kind === "image")
    .map((resource) => async () => {
      try {
        await waitForImageWithRetry(resource.source, signal);
        finish("image", true);
      } catch (error) {
        if (!isAbortError(error)) finish("image", false);
      }
    });
  const musicTasks = resources
    .filter((resource) => resource.kind === "music")
    .map((resource) => async () => {
      try {
        const [, prepared] = await Promise.all([
          fullyFetchMusic(resource.source, signal),
          prepareHomeMusic ? prepareStartupMusic(signal) : Promise.resolve(true),
        ]);
        if (!prepared) throw new Error("Home music could not be prepared");
        finish("music", true);
      } catch (error) {
        if (!isAbortError(error)) finish("music", false);
      }
    });

  notify("image");
  await Promise.all([
    runWithConcurrency(imageTasks, IMAGE_CONCURRENCY),
    runWithConcurrency(musicTasks, 2),
  ]);
  return { completed, total: resources.length, failed };
}

async function preloadBackgroundAssets(
  firstScreenSources: readonly string[],
  firstScreenMusic: readonly string[],
  onProgress: (progress: StartupPreloadProgress) => void,
  externalSignal?: AbortSignal,
) {
  const controller = new AbortController();
  const abortFromOutside = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener("abort", abortFromOutside, { once: true });
  try {
    const [allImages, allMusic] = await Promise.all([
      getPrimaryInterfaceImageSources(controller.signal),
      Promise.resolve(getBackgroundMusicSources()),
    ]);
    if (controller.signal.aborted) return;
    const firstScreenSet = new Set(firstScreenSources);
    const firstMusicSet = new Set(firstScreenMusic);
    const resources: StartupResource[] = [
      ...allImages.filter((source) => !firstScreenSet.has(source)).map((source) => ({ source, kind: "image" as const })),
      ...allMusic.filter((source) => !firstMusicSet.has(source)).map((source) => ({ source, kind: "music" as const })),
    ];
    await preloadResources(resources, "background", onProgress, controller.signal);
  } catch {
    // Background warming is opportunistic: the current screen is already ready.
  } finally {
    externalSignal?.removeEventListener("abort", abortFromOutside);
  }
}

export async function preloadStartupAssets(
  onProgress: (progress: StartupPreloadProgress) => void,
  externalSignal?: AbortSignal,
): Promise<StartupPreloadResult> {
  const controller = new AbortController();
  const abortFromOutside = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener("abort", abortFromOutside, { once: true });
  const startedAt = performance.now();
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, STARTUP_TIMEOUT_MS);

  const firstScreenSources = [...new Set(FIRST_SCREEN_IMAGE_SOURCES)];
  const firstScreenMusic = getHomeMusicSources();
  const resources: StartupResource[] = [
    ...firstScreenSources.map((source) => ({ source, kind: "image" as const })),
    ...firstScreenMusic.map((source) => ({ source, kind: "music" as const })),
  ];

  try {
    const summary = await preloadResources(resources, "initial", onProgress, controller.signal, true);
    const ready = !timedOut && !controller.signal.aborted && summary.completed === summary.total && summary.failed === 0;
    if (ready) {
      // Do not hold the student on the loading screen for rooms they have not
      // opened yet. Their images and music keep warming after entry.
      window.setTimeout(() => {
        if (!externalSignal?.aborted) void preloadBackgroundAssets(firstScreenSources, firstScreenMusic, onProgress, externalSignal);
      }, 0);
    }
    await delay(Math.max(0, MINIMUM_VISIBLE_MS - (performance.now() - startedAt)));
    return { ...summary, timedOut, ready };
  } finally {
    window.clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromOutside);
  }
}
