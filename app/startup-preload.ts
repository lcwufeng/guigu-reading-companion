"use client";

import { getBackgroundMusicSources, prepareStartupMusic } from "./sound-system";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const ASSET = `${BASE_PATH}/assets`;
const STARTUP_TIMEOUT_MS = 180_000;
const MINIMUM_VISIBLE_MS = 900;
const IMAGE_RETRY_COUNT = 2;
const IMAGE_CONCURRENCY = 8;
const STARTUP_ASSET_MANIFEST = `${ASSET}/startup-assets-manifest.json`;

export const FALLBACK_STARTUP_IMAGE_SOURCES = [
  `${ASSET}/optimized/backgrounds/main_home.webp`,
  `${ASSET}/ui/supplied/brand/logo-20260715.png`,
  `${ASSET}/characters/turtle/turtle_idle_front.png`,
  `${ASSET}/characters/turtle/turtle_idle_standing.png`,
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

export type StartupPreloadProgress = {
  completed: number;
  total: number;
  failed: number;
  percent: number;
  kind: "image" | "music";
  label: string;
};

export type StartupPreloadResult = {
  completed: number;
  total: number;
  failed: number;
  timedOut: boolean;
};

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
    image.onerror = () => {
      finish(new Error(`Image unavailable: ${source}`));
    };
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
      if (signal.aborted || error instanceof DOMException && error.name === "AbortError") throw error;
      if (attempt < IMAGE_RETRY_COUNT) await delay(250 * (attempt + 1));
    }
  }
  throw lastError;
}

async function getAllStartupImageSources(signal: AbortSignal) {
  const response = await fetch(STARTUP_ASSET_MANIFEST, { cache: "no-cache", signal });
  if (!response.ok) throw new Error(`Startup asset manifest unavailable: ${response.status}`);
  const manifest = await response.json() as StartupAssetManifest;
  if (
    manifest.version !== 1
    || !Array.isArray(manifest.images)
    || manifest.imageCount !== manifest.images.length
    || !manifest.images.length
  ) {
    throw new Error("Startup asset manifest is invalid");
  }
  const images = manifest.images
    .filter((path): path is string => typeof path === "string" && !path.startsWith("/") && !path.includes(".."))
    .map((path) => `${ASSET}/${path}`);
  if (images.length !== manifest.images.length) throw new Error("Startup asset manifest contains unsafe paths");
  return [...new Set([...FALLBACK_STARTUP_IMAGE_SOURCES, ...images])];
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

export async function preloadStartupAssets(
  onProgress: (progress: StartupPreloadProgress) => void,
  externalSignal?: AbortSignal,
): Promise<StartupPreloadResult> {
  const controller = new AbortController();
  const abortFromOutside = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener("abort", abortFromOutside, { once: true });
  const startedAt = performance.now();
  let completed = 0;
  let failed = 0;
  let timedOut = false;
  let settled = false;
  const timeout = window.setTimeout(() => {
    if (settled) return;
    timedOut = true;
    controller.abort();
  }, STARTUP_TIMEOUT_MS);
  let imageSources: string[];
  try {
    imageSources = await getAllStartupImageSources(controller.signal);
  } catch (error) {
    settled = true;
    window.clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromOutside);
    throw error;
  }
  const musicSources = getBackgroundMusicSources();
  const resources = [
    ...imageSources.map((source) => ({ source, kind: "image" as const })),
    ...musicSources.map((source) => ({ source, kind: "music" as const })),
  ];

  const notify = (kind: "image" | "music") => {
    const percent = resources.length ? Math.round(completed / resources.length * 100) : 100;
    onProgress({
      completed,
      total: resources.length,
      failed,
      percent,
      kind,
      label: kind === "music" ? "正在准备全部背景音乐" : "正在加载并解码全部图片",
    });
  };

  const imageTasks = resources
    .filter((resource) => resource.kind === "image")
    .map((resource) => async () => {
      try {
        await waitForImageWithRetry(resource.source, controller.signal);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) failed += 1;
      } finally {
        completed += 1;
        notify("image");
      }
    });
  const musicTasks = resources
    .filter((resource) => resource.kind === "music")
    .map((resource) => async () => {
      try {
        await fullyFetchMusic(resource.source, controller.signal);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) failed += 1;
      } finally {
        completed += 1;
        notify("music");
      }
    });

  notify("image");
  await Promise.all([
    runWithConcurrency(imageTasks, IMAGE_CONCURRENCY),
    runWithConcurrency(musicTasks, 2),
    prepareStartupMusic(controller.signal).catch(() => false),
  ]);
  settled = true;
  window.clearTimeout(timeout);
  externalSignal?.removeEventListener("abort", abortFromOutside);
  await delay(Math.max(0, MINIMUM_VISIBLE_MS - (performance.now() - startedAt)));

  return {
    completed: Math.min(completed, resources.length),
    total: resources.length,
    failed,
    timedOut,
  };
}
