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
  game: "turtle-courier" | "weather-outfit" | "lotus-jump" | "spot-difference" | "story-puzzle" | "turtle-sky" | "tortoise-race";
  detail: string;
};

export type GameParkGameId = "fruit-catch" | LearningMiniGameResult["game"];

export const GAME_PARK_ORDER: GameParkGameId[] = [
  "fruit-catch",
  "turtle-courier",
  "weather-outfit",
  "lotus-jump",
  "spot-difference",
  "story-puzzle",
  "turtle-sky",
  "tortoise-race",
];
