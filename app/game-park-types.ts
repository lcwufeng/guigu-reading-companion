import { MINI_GAME_ORDER, type MiniGameId, type MiniGameRankingRule } from "../lib/minigame-config";

export type FruitCatchDailyState = {
  dateKey: string;
  plays: number;
  rewarded: boolean;
  bestScore: number;
  totalCaught: number;
};

export type FruitCatchResult = {
  score: number;
  caught: number;
  missed: number;
  bestCombo: number;
  success: boolean;
};

export type LearningMiniGameResult = {
  game: "turtle-courier" | "weather-outfit" | "lotus-jump" | "spot-difference" | "story-puzzle" | "turtle-sky" | "tortoise-race" | "shell-memory" | "cloud-pairs";
  detail: string;
  score?: number;
  secondaryScore?: number;
};

export type GameParkGameId = MiniGameId;

export const GAME_PARK_ORDER: GameParkGameId[] = [...MINI_GAME_ORDER];

export type MiniGameLeaderboardEntry = {
  rank: number;
  name: string;
  primaryValue: number;
  secondaryValue: number;
  durationMs: number;
  displayValue: string;
  secondaryDisplay: string | null;
};

export type MiniGameLeaderboard = {
  gameId: GameParkGameId;
  rule: MiniGameRankingRule;
  entries: MiniGameLeaderboardEntry[];
  me: MiniGameLeaderboardEntry | null;
  participantCount: number;
};

export type MiniGameLeaderboards = Record<GameParkGameId, MiniGameLeaderboard>;
