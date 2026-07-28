"use client";

export type SoundScene = "home" | "library" | "park" | "explore";

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

const musicByScene: Record<SoundScene, string> = {
  home: `${BASE_PATH}/audio/music/home-garden.mp3`,
  library: `${BASE_PATH}/audio/music/quiet-library.mp3`,
  park: `${BASE_PATH}/audio/music/turtle-park.mp3`,
  explore: `${BASE_PATH}/audio/music/knowledge-adventure.mp3`,
};

const effectSources: Record<SoundEffectId, string> = {
  "ui-tap": `${BASE_PATH}/audio/sfx/ui-tap.mp3`,
  "reward-star": `${BASE_PATH}/audio/sfx/reward-star.mp3`,
  "reward-ticket": `${BASE_PATH}/audio/sfx/reward-ticket.mp3`,
  "fruit-pick": `${BASE_PATH}/audio/sfx/fruit-pick.mp3`,
  "fruit-catch": `${BASE_PATH}/audio/sfx/fruit-catch.mp3`,
  "feed-bite": `${BASE_PATH}/audio/sfx/feed-bite.mp3`,
  "water-splash": `${BASE_PATH}/audio/sfx/water-splash.mp3`,
  "hide-found": `${BASE_PATH}/audio/sfx/hide-found.mp3`,
  "sleep-yawn": `${BASE_PATH}/audio/sfx/sleep-yawn.mp3`,
  "page-turn": `${BASE_PATH}/audio/sfx/page-turn.mp3`,
  "answer-correct": `${BASE_PATH}/audio/sfx/answer-correct.mp3`,
  "answer-retry": `${BASE_PATH}/audio/sfx/answer-retry.mp3`,
  "travel-depart": `${BASE_PATH}/audio/sfx/travel-depart.mp3`,
  "travel-arrive": `${BASE_PATH}/audio/sfx/travel-arrive.mp3`,
  "card-unlock": `${BASE_PATH}/audio/sfx/card-unlock.mp3`,
  "game-jump": `${BASE_PATH}/audio/sfx/game-jump.mp3`,
  "game-hit": `${BASE_PATH}/audio/sfx/game-hit.mp3`,
  "game-win": `${BASE_PATH}/audio/sfx/game-win.mp3`,
  "game-star": `${BASE_PATH}/audio/sfx/game-star.mp3`,
  "new-record": `${BASE_PATH}/audio/sfx/new-record.mp3`,
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
    this.quiet = quiet;
    this.suppressed = suppressed;
    if (this.music) this.music.volume = this.musicVolume();
    void this.syncMusic(sceneChanged);
  }

  unlock(settings: SoundSettings, scene: SoundScene) {
    this.unlocked = true;
    this.scene = scene;
    this.settings = normalizeSoundSettings(settings);
    void this.syncMusic();
  }

  setScene(scene: SoundScene) {
    if (this.scene === scene) return;
    this.scene = scene;
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
    return this.settings.musicVolume * (this.quiet ? 0.42 : 1);
  }

  private async syncMusic(forceSource = false) {
    if (typeof Audio === "undefined") return;
    const version = ++this.syncVersion;
    if (!this.music) {
      this.music = new Audio();
      this.music.loop = true;
      this.music.preload = "metadata";
    }
    const expectedSource = musicByScene[this.scene];
    if (forceSource || !this.music.src.endsWith(expectedSource)) {
      this.music.pause();
      this.music.src = expectedSource;
      this.music.load();
    }
    this.music.volume = this.musicVolume();
    if (
      !this.unlocked
      || !this.settings.enabled
      || !this.settings.musicEnabled
      || this.suppressed
      || document.hidden
    ) {
      this.music.pause();
      return;
    }
    await this.music.play().catch(() => undefined);
    if (version !== this.syncVersion && this.music.src.endsWith(expectedSource)) return;
  }
}

type SoundEngineGlobal = typeof globalThis & { __guiguReadingSoundEngine?: SoundEngine };

export function getSoundEngine() {
  const shared = globalThis as SoundEngineGlobal;
  if (!shared.__guiguReadingSoundEngine) shared.__guiguReadingSoundEngine = new SoundEngine();
  return shared.__guiguReadingSoundEngine;
}

export function emitSoundEffect(effect: SoundEffectId) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<SoundEffectId>("guigu-sound-effect", { detail: effect }));
}
