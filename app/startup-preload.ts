"use client";

import { getBackgroundMusicSources, prepareStartupMusic } from "./sound-system";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const ASSET = `${BASE_PATH}/assets`;
const STARTUP_TIMEOUT_MS = 35_000;
const MINIMUM_VISIBLE_MS = 900;

export const STARTUP_IMAGE_SOURCES = [
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
  `${ASSET}/ui/supplied/nav/home.png`,
  `${ASSET}/ui/supplied/nav/reading-20260714.png`,
  `${ASSET}/ui/supplied/nav/mistakes-20260714.png`,
  `${ASSET}/ui/supplied/nav/chat.png`,
  `${ASSET}/ui/supplied/nav/travel.png`,
  `${ASSET}/ui/supplied/nav/journal-20260714.png`,
  `${ASSET}/objects/fruit_orange.png`,
  `${ASSET}/legacy/travel/travel_ticket.png`,
  `${ASSET}/ui/icons/play-ticket-pixel.png`,
] as const;

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
    const abort = () => {
      image.src = "";
      reject(new DOMException("Startup preload aborted", "AbortError"));
    };
    const cleanup = () => {
      signal.removeEventListener("abort", abort);
      image.onload = null;
      image.onerror = null;
    };
    image.onload = () => {
      const decode = typeof image.decode === "function" ? image.decode().catch(() => undefined) : Promise.resolve();
      void decode.finally(() => {
        cleanup();
        resolve();
      });
    };
    image.onerror = () => {
      cleanup();
      reject(new Error(`Image unavailable: ${source}`));
    };
    signal.addEventListener("abort", abort, { once: true });
    image.decoding = "async";
    image.src = source;
    if (image.complete && image.naturalWidth > 0) image.onload?.(new Event("load"));
  });
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
): Promise<StartupPreloadResult> {
  const musicSources = getBackgroundMusicSources();
  const resources = [
    ...STARTUP_IMAGE_SOURCES.map((source) => ({ source, kind: "image" as const })),
    ...musicSources.map((source) => ({ source, kind: "music" as const })),
    { source: "startup-audio-player", kind: "music" as const },
  ];
  const controller = new AbortController();
  const startedAt = performance.now();
  let completed = 0;
  let failed = 0;
  let timedOut = false;
  let settled = false;

  const notify = (kind: "image" | "music") => {
    const percent = resources.length ? Math.round(completed / resources.length * 100) : 100;
    onProgress({
      completed,
      total: resources.length,
      failed,
      percent,
      kind,
      label: kind === "music" ? "正在准备背景音乐" : "正在布置龟龟的小屋",
    });
  };

  const timeout = window.setTimeout(() => {
    if (settled) return;
    timedOut = true;
    controller.abort();
  }, STARTUP_TIMEOUT_MS);

  const imageTasks = resources
    .filter((resource) => resource.kind === "image")
    .map((resource) => async () => {
      try {
        await waitForImage(resource.source, controller.signal);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) failed += 1;
      } finally {
        completed += 1;
        notify("image");
      }
    });
  const musicTasks = resources
    .filter((resource) => resource.kind === "music" && resource.source !== "startup-audio-player")
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
  musicTasks.push(async () => {
    try {
      const ready = await prepareStartupMusic(controller.signal);
      if (!ready && !controller.signal.aborted) failed += 1;
    } catch {
      if (!controller.signal.aborted) failed += 1;
    } finally {
      completed += 1;
      notify("music");
    }
  });

  notify("image");
  await Promise.all([
    runWithConcurrency(imageTasks, 6),
    runWithConcurrency(musicTasks, 2),
  ]);
  settled = true;
  window.clearTimeout(timeout);
  await delay(Math.max(0, MINIMUM_VISIBLE_MS - (performance.now() - startedAt)));

  return {
    completed: Math.min(completed, resources.length),
    total: resources.length,
    failed,
    timedOut,
  };
}
