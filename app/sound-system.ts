"use client";

export type SoundScene = "home" | "library" | "park" | "travel";

export type SoundEffectId =
  | "ui-tap"
  | "reward-star"
  | "reward-ticket"
  | "fruit-pick"
  | "fruit-catch"
  | "feed-bite"
  | "water-splash"
  | "hide-found"
  | "sleep-yawn"
  | "page-turn"
  | "answer-correct"
  | "answer-retry"
  | "travel-depart"
  | "travel-arrive"
  | "card-unlock"
  | "game-jump"
  | "game-hit"
  | "game-win"
  | "game-star"
  | "new-record";

export type SoundSettings = {
  enabled: boolean;
  musicEnabled: boolean;
  effectsEnabled: boolean;
  musicVolume: number;
  effectsVolume: number;
};

export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  enabled: true,
  musicEnabled: true,
  effectsEnabled: true,
  musicVolume: 0.32,
  effectsVolume: 0.72,
};

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const SOUND_PACK_VERSION = "20260729-provided";
const audioSource = (path: string) => `${BASE_PATH}${path}?v=${SOUND_PACK_VERSION}`;

type MusicTrack = { src: string; gain: number };

const musicByScene: Record<SoundScene, MusicTrack[]> = {
  home: [
    { src: audioSource("/audio/music/provided/main.mp3"), gain: 1 },
  ],
  library: [
    { src: audioSource("/audio/music/provided/library-1.mp3"), gain: 0.38 },
    { src: audioSource("/audio/music/provided/library-2.mp3"), gain: 0.4 },
    { src: audioSource("/audio/music/provided/library-3.mp3"), gain: 0.32 },
  ],
  park: [
    { src: audioSource("/audio/music/provided/park-1.mp3"), gain: 1 },
    { src: audioSource("/audio/music/provided/park-2.mp3"), gain: 1 },
  ],
  travel: [
    { src: audioSource("/audio/music/provided/travel-1.mp3"), gain: 0.39 },
  ],
};

export function getBackgroundMusicSources() {
  return [...new Set(Object.values(musicByScene).flatMap((tracks) => tracks.map((track) => track.src)))];
}

const effectSources: Record<SoundEffectId, string> = {
  "ui-tap": audioSource("/audio/sfx/ui-tap.mp3"),
  "reward-star": audioSource("/audio/sfx/reward-star.mp3"),
  "reward-ticket": audioSource("/audio/sfx/reward-ticket.mp3"),
  "fruit-pick": audioSource("/audio/sfx/fruit-pick.mp3"),
  "fruit-catch": audioSource("/audio/sfx/fruit-catch.mp3"),
  "feed-bite": audioSource("/audio/sfx/feed-bite.mp3"),
  "water-splash": audioSource("/audio/sfx/water-splash.mp3"),
  "hide-found": audioSource("/audio/sfx/hide-found.mp3"),
  "sleep-yawn": audioSource("/audio/sfx/sleep-yawn.mp3"),
  "page-turn": audioSource("/audio/sfx/page-turn.mp3"),
  "answer-correct": audioSource("/audio/sfx/answer-correct.mp3"),
  "answer-retry": audioSource("/audio/sfx/answer-retry.mp3"),
  "travel-depart": audioSource("/audio/sfx/travel-depart.mp3"),
  "travel-arrive": audioSource("/audio/sfx/travel-arrive.mp3"),
  "card-unlock": audioSource("/audio/sfx/card-unlock.mp3"),
  "game-jump": audioSource("/audio/sfx/game-jump.mp3"),
  "game-hit": audioSource("/audio/sfx/game-hit.mp3"),
  "game-win": audioSource("/audio/sfx/game-win.mp3"),
  "game-star": audioSource("/audio/sfx/game-star.mp3"),
  "new-record": audioSource("/audio/sfx/new-record.mp3"),
};

const minimumEffectInterval: Partial<Record<SoundEffectId, number>> = {
  "ui-tap": 90,
  "fruit-catch": 80,
  "game-hit": 100,
  "game-jump": 80,
  "game-star": 80,
};

function clampedVolume(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : fallback;
}

export function normalizeSoundSettings(value: unknown): SoundSettings {
  const parsed = value && typeof value === "object" && !Array.isArray(value)
    ? value as Partial<SoundSettings>
    : {};
  return {
    enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_SOUND_SETTINGS.enabled,
    musicEnabled: typeof parsed.musicEnabled === "boolean" ? parsed.musicEnabled : DEFAULT_SOUND_SETTINGS.musicEnabled,
    effectsEnabled: typeof parsed.effectsEnabled === "boolean" ? parsed.effectsEnabled : DEFAULT_SOUND_SETTINGS.effectsEnabled,
    musicVolume: clampedVolume(parsed.musicVolume, DEFAULT_SOUND_SETTINGS.musicVolume),
    effectsVolume: clampedVolume(parsed.effectsVolume, DEFAULT_SOUND_SETTINGS.effectsVolume),
  };
}

class SoundEngine {
  private music: HTMLAudioElement | null = null;
  private effectPools = new Map<SoundEffectId, HTMLAudioElement[]>();
  private lastPlayed = new Map<SoundEffectId, number>();
  private scene: SoundScene = "home";
  private track: MusicTrack = musicByScene.home[0];
  private settings = DEFAULT_SOUND_SETTINGS;
  private unlocked = false;
  private suppressed = false;
  private quiet = false;
  private syncVersion = 0;

  constructor() {
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) this.music?.pause();
        else void this.syncMusic();
      });
    }
  }

  update(settings: SoundSettings) {
    this.settings = normalizeSoundSettings(settings);
    if (this.music) this.music.volume = this.musicVolume();
    void this.syncMusic();
  }

  configure(settings: SoundSettings, scene: SoundScene, quiet: boolean, suppressed: boolean) {
    const sceneChanged = this.scene !== scene;
    this.settings = normalizeSoundSettings(settings);
    this.scene = scene;
    if (sceneChanged) this.track = this.pickTrack(scene);
    this.quiet = quiet;
    this.suppressed = suppressed;
    if (this.music) this.music.volume = this.musicVolume();
    void this.syncMusic(sceneChanged);
  }

  unlock(settings: SoundSettings, scene: SoundScene) {
    this.unlocked = true;
    if (this.scene !== scene) this.track = this.pickTrack(scene);
    this.scene = scene;
    this.settings = normalizeSoundSettings(settings);
    return this.syncMusic();
  }

  setScene(scene: SoundScene) {
    if (this.scene === scene) return;
    this.scene = scene;
    this.track = this.pickTrack(scene);
    void this.syncMusic(true);
  }

  setSuppressed(suppressed: boolean) {
    this.suppressed = suppressed;
    void this.syncMusic();
  }

  setQuiet(quiet: boolean) {
    this.quiet = quiet;
    if (this.music) this.music.volume = this.musicVolume();
  }

  playEffect(effect: SoundEffectId) {
    if (!this.unlocked || !this.settings.enabled || !this.settings.effectsEnabled || typeof Audio === "undefined") return;
    const now = performance.now();
    const minimumInterval = minimumEffectInterval[effect] || 0;
    if (now - (this.lastPlayed.get(effect) || 0) < minimumInterval) return;
    this.lastPlayed.set(effect, now);

    const pool = this.effectPools.get(effect) || [];
    let audio = pool.find((item) => item.paused || item.ended);
    if (!audio) {
      audio = new Audio(effectSources[effect]);
      audio.preload = "auto";
      pool.push(audio);
      if (pool.length > 4) pool.shift();
      this.effectPools.set(effect, pool);
    }
    audio.volume = this.settings.effectsVolume;
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }

  private musicVolume() {
    return this.settings.musicVolume * this.track.gain * (this.quiet ? 0.42 : 1);
  }

  private pickTrack(scene: SoundScene) {
    const pool = musicByScene[scene];
    return pool[Math.floor(Math.random() * pool.length)] || pool[0];
  }

  private ensureMusic(forceSource = false) {
    if (typeof Audio === "undefined") return null;
    if (!this.music) {
      this.music = new Audio();
      this.music.loop = true;
      this.music.preload = "auto";
    }
    const expectedSource = this.track.src;
    if (forceSource || !this.music.src.endsWith(expectedSource)) {
      this.music.pause();
      this.music.src = expectedSource;
      this.music.load();
    }
    return this.music;
  }

  async prepare(scene: SoundScene, signal?: AbortSignal) {
    if (this.scene !== scene) {
      this.scene = scene;
      this.track = this.pickTrack(scene);
    }
    const audio = this.ensureMusic();
    if (!audio || signal?.aborted) return false;
    audio.preload = "auto";
    if (audio.readyState >= 3) return true;
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (ready: boolean) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        audio.removeEventListener("canplay", handleReady);
        audio.removeEventListener("error", handleError);
        signal?.removeEventListener("abort", handleAbort);
        resolve(ready);
      };
      const handleReady = () => finish(true);
      const handleError = () => finish(false);
      const handleAbort = () => finish(false);
      const timer = window.setTimeout(() => finish(audio.readyState >= 3), 6_000);
      audio.addEventListener("canplay", handleReady, { once: true });
      audio.addEventListener("error", handleError, { once: true });
      signal?.addEventListener("abort", handleAbort, { once: true });
    });
  }

  private async syncMusic(forceSource = false) {
    const audio = this.ensureMusic(forceSource);
    if (!audio) return false;
    const version = ++this.syncVersion;
    audio.volume = this.musicVolume();
    if (
      !this.unlocked
      || !this.settings.enabled
      || !this.settings.musicEnabled
      || this.suppressed
      || document.hidden
    ) {
      audio.pause();
      return false;
    }
    try {
      await audio.play();
      return version === this.syncVersion || !audio.paused;
    } catch {
      return false;
    }
  }
}

type SoundEngineGlobal = typeof globalThis & { __guiguReadingSoundEngine?: SoundEngine };

export function getSoundEngine() {
  const shared = globalThis as SoundEngineGlobal;
  if (!shared.__guiguReadingSoundEngine) shared.__guiguReadingSoundEngine = new SoundEngine();
  return shared.__guiguReadingSoundEngine;
}

export function prepareStartupMusic(signal?: AbortSignal) {
  return getSoundEngine().prepare("home", signal);
}

export function emitSoundEffect(effect: SoundEffectId) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<SoundEffectId>("guigu-sound-effect", { detail: effect }));
}
