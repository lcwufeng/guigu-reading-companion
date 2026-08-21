/* eslint-disable @next/next/no-img-element -- Reuses the project's canonical turtle sprite. */
"use client";

import { Check, ChevronLeft, Eye, Lightbulb, RotateCcw, Search, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { emitSoundEffect } from "./sound-system";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const TURTLE = `${BASE_PATH}/assets/characters/turtle/home/turtle-home-idle-hd.webp`;

type SceneFeature = {
  id: string;
  left: string;
  right: string;
  x: number;
  y: number;
  size?: number;
  different?: boolean;
};

type DifferenceLevel = {
  id: string;
  title: string;
  place: string;
  difficulty: "入门" | "进阶" | "挑战" | "终极";
  theme: "pond" | "picnic" | "forest" | "beach";
  features: SceneFeature[];
};

const levels: DifferenceLevel[] = [
  {
    id: "pond-morning",
    title: "池塘的清晨",
    place: "仔细比较天空、花朵和水里的小伙伴。",
    difficulty: "入门",
    theme: "pond",
    features: [
      { id: "sun", left: "☀️", right: "🌤️", x: 16, y: 14, size: 42, different: true },
      { id: "cloud", left: "☁️", right: "☁️", x: 73, y: 12, size: 38 },
      { id: "bird", left: "🐦", right: "🐦", x: 48, y: 20, size: 27 },
      { id: "flowers", left: "🌸", right: "🌼", x: 20, y: 72, size: 35, different: true },
      { id: "frog", left: "🐸", right: "🐸", x: 72, y: 69, size: 38 },
      { id: "fish", left: "🐟", right: "🐠", x: 53, y: 82, size: 35, different: true },
      { id: "duck", left: "🦆", right: "🦆", x: 84, y: 48, size: 35 },
      { id: "reeds", left: "🌾", right: "🌾", x: 9, y: 48, size: 38 },
    ],
  },
  {
    id: "picnic-day",
    title: "草地野餐",
    place: "野餐垫附近藏着四处变化。",
    difficulty: "进阶",
    theme: "picnic",
    features: [
      { id: "cloud", left: "☁️", right: "☁️", x: 22, y: 12, size: 37 },
      { id: "kite", left: "🪁", right: "🎈", x: 75, y: 17, size: 38, different: true },
      { id: "tree", left: "🌳", right: "🌳", x: 12, y: 50, size: 55 },
      { id: "fruit", left: "🍎", right: "🍎🍎", x: 62, y: 69, size: 31, different: true },
      { id: "basket", left: "🧺", right: "🧺", x: 38, y: 76, size: 40 },
      { id: "butterfly", left: "🦋", right: "🐝", x: 48, y: 30, size: 30, different: true },
      { id: "flower", left: "🍄", right: "🌷", x: 84, y: 73, size: 32, different: true },
      { id: "book", left: "📖", right: "📖", x: 75, y: 47, size: 35 },
      { id: "grass", left: "🌱", right: "🌱", x: 26, y: 65, size: 29 },
    ],
  },
  {
    id: "forest-trail",
    title: "森林小径",
    place: "颜色、数量和方向都可能发生变化。",
    difficulty: "挑战",
    theme: "forest",
    features: [
      { id: "moon", left: "🌤️", right: "☀️", x: 78, y: 12, size: 40, different: true },
      { id: "pine", left: "🌲", right: "🌲", x: 12, y: 43, size: 57 },
      { id: "owl", left: "🦉", right: "🦉", x: 25, y: 28, size: 31 },
      { id: "mushrooms", left: "🍄🍄", right: "🍄", x: 25, y: 76, size: 31, different: true },
      { id: "fox", left: "🦊", right: "🐿️", x: 78, y: 68, size: 37, different: true },
      { id: "leaf", left: "🍁", right: "🍃", x: 53, y: 18, size: 29, different: true },
      { id: "rock", left: "🪨", right: "🪨", x: 64, y: 79, size: 38 },
      { id: "flower", left: "🌻", right: "🌻", x: 89, y: 45, size: 34 },
      { id: "bug", left: "🐞", right: "🦗", x: 43, y: 66, size: 27, different: true },
      { id: "log", left: "🪵", right: "🪵", x: 11, y: 85, size: 40 },
    ],
  },
  {
    id: "seaside-camp",
    title: "海边露营",
    place: "终极关有六处不同，别漏掉角落里的小线索。",
    difficulty: "终极",
    theme: "beach",
    features: [
      { id: "sun", left: "🌞", right: "☀️", x: 14, y: 12, size: 41, different: true },
      { id: "cloud", left: "☁️", right: "☁️", x: 60, y: 11, size: 37 },
      { id: "boat", left: "⛵", right: "🚤", x: 82, y: 35, size: 43, different: true },
      { id: "umbrella", left: "⛱️", right: "⛱️", x: 18, y: 54, size: 49 },
      { id: "shells", left: "🐚🐚", right: "🐚", x: 30, y: 82, size: 29, different: true },
      { id: "crab", left: "🦀", right: "🐙", x: 72, y: 78, size: 36, different: true },
      { id: "ball", left: "⚽", right: "🏐", x: 45, y: 70, size: 34, different: true },
      { id: "flag", left: "🚩", right: "🏁", x: 88, y: 62, size: 33, different: true },
      { id: "coconut", left: "🥥", right: "🥥", x: 29, y: 32, size: 31 },
      { id: "starfish", left: "⭐", right: "⭐", x: 58, y: 87, size: 28 },
      { id: "bird", left: "🕊️", right: "🕊️", x: 44, y: 21, size: 28 },
    ],
  },
];

function Scene({
  level,
  side,
  found,
  hintedId,
  onChoose,
  turtleName,
}: {
  level: DifferenceLevel;
  side: "left" | "right";
  found: Set<string>;
  hintedId: string;
  onChoose: (feature: SceneFeature) => void;
  turtleName: string;
}) {
  return (
    <section className={`difference-scene ${level.theme}`} aria-label={`${side === "left" ? "左边" : "右边"}的${level.title}场景`}>
      <div className="difference-scene-ground" aria-hidden="true" />
      <img className="difference-turtle" src={TURTLE} alt={`${turtleName}在${level.title}里`} />
      {level.features.map((feature) => (
        <button
          type="button"
          className={`difference-feature ${found.has(feature.id) ? "found" : ""} ${hintedId === feature.id ? "hinted" : ""}`}
          key={feature.id}
          style={{ left: `${feature.x}%`, top: `${feature.y}%`, fontSize: `clamp(19px, ${(feature.size || 32) / 10}vw, ${feature.size || 32}px)` }}
          onClick={() => onChoose(feature)}
          aria-label={`检查${feature.id}${found.has(feature.id) ? "，已经找到不同" : ""}`}
        >
          <span>{side === "left" ? feature.left : feature.right}</span>
          {found.has(feature.id) && <Check aria-hidden="true" />}
        </button>
      ))}
    </section>
  );
}

export default function SpotDifferenceGame({
  turtleName,
  onBack,
  onMistake,
  onComplete,
}: {
  turtleName: string;
  onBack: () => void;
  onMistake: () => void;
  onComplete: (detail: string) => void;
}) {
  const [levelIndex, setLevelIndex] = useState(0);
  const [foundIds, setFoundIds] = useState<string[]>([]);
  const [wrongClicks, setWrongClicks] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintedId, setHintedId] = useState("");
  const [feedback, setFeedback] = useState("");
  const [allComplete, setAllComplete] = useState(false);
  const reportedRef = useRef(false);
  const level = levels[levelIndex];
  const differences = level.features.filter((feature) => feature.different);
  const found = new Set(foundIds);
  const levelComplete = foundIds.length >= differences.length;

  const chooseFeature = (feature: SceneFeature) => {
    if (levelComplete || allComplete) return;
    if (!feature.different) {
      onMistake();
      setWrongClicks((current) => current + 1);
      setFeedback("这里左右是一样的，再看看颜色、数量和形状。");
      return;
    }
    if (found.has(feature.id)) {
      setFeedback("这个不同已经找到啦，继续找其他地方。");
      return;
    }
    emitSoundEffect("game-star");
    const nextFound = [...foundIds, feature.id];
    setFoundIds(nextFound);
    setHintedId("");
    setFeedback(nextFound.length === differences.length ? "全部找到了！你的观察非常仔细。" : `找对啦！还剩 ${differences.length - nextFound.length} 处不同。`);
  };

  const useHint = () => {
    const next = differences.find((feature) => !found.has(feature.id));
    if (!next) return;
    setHintedId(next.id);
    setHintsUsed((current) => current + 1);
    setFeedback("龟龟用亮圈标出了一小片区域，仔细看看左右有什么变化。");
  };

  const resetLevel = () => {
    setFoundIds([]);
    setHintedId("");
    setFeedback("");
  };

  const nextLevel = () => {
    if (levelIndex < levels.length - 1) {
      setLevelIndex((current) => current + 1);
      resetLevel();
      return;
    }
    setAllComplete(true);
    if (!reportedRef.current) {
      reportedRef.current = true;
      onComplete(`完成${levels.length}关龟龟找不同，共找出${levels.reduce((total, item) => total + item.features.filter((feature) => feature.different).length, 0)}处变化，误点${wrongClicks}次，使用提示${hintsUsed}次`);
    }
  };

  return (
    <section className="learning-game-panel difference-game-panel">
      <header className="learning-game-heading">
        <div>
          <span><Search aria-hidden="true" /> 龟龟乐园 · 观察挑战</span>
          <h1>龟龟找不同</h1>
        </div>
        <button type="button" onClick={onBack}><ChevronLeft aria-hidden="true" /> 返回乐园</button>
      </header>

      <div className="learning-game-progress" aria-label={`第${levelIndex + 1}关，共${levels.length}关`}>
        {levels.map((item, index) => (
          <span className={index < levelIndex || allComplete ? "done" : index === levelIndex ? "active" : ""} key={item.id}>
            {index < levelIndex || allComplete ? <Check aria-hidden="true" /> : index + 1}
          </span>
        ))}
      </div>

      {!allComplete ? (
        <>
          <section className="difference-task-bar">
            <div><small>{level.difficulty} · 第 {levelIndex + 1}/{levels.length} 关</small><h2>{level.title}</h2><p>{level.place}</p></div>
            <div className="difference-count"><Eye aria-hidden="true" /><span>已找到<strong>{foundIds.length}/{differences.length}</strong></span></div>
          </section>
          <div className="difference-scenes">
            <Scene level={level} side="left" found={found} hintedId={hintedId} onChoose={chooseFeature} turtleName={turtleName} />
            <Scene level={level} side="right" found={found} hintedId={hintedId} onChoose={chooseFeature} turtleName={turtleName} />
          </div>
          <div className="difference-footer">
            <div>{feedback && <div className={`learning-game-feedback ${levelComplete ? "success" : "hint"}`} role="status"><Sparkles aria-hidden="true" /><p>{feedback}</p></div>}</div>
            <div className="difference-actions">
              {!levelComplete ? (
                <>
                  <button type="button" onClick={useHint}><Lightbulb aria-hidden="true" /> 龟龟提示</button>
                  <button type="button" onClick={resetLevel}><RotateCcw aria-hidden="true" /> 重新找</button>
                </>
              ) : (
                <button className="primary" type="button" onClick={nextLevel}>{levelIndex < levels.length - 1 ? "下一幅图" : "完成挑战"}</button>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="learning-game-finish">
          <img src={`${BASE_PATH}/assets/characters/turtle/actions/turtle-companion-celebrating-hd.webp`} alt={`${turtleName}完成找不同`} />
          <div><small>{levels.length} 幅场景全部观察完成</small><h2>{turtleName}找到所有不同啦！</h2><p>你会比较颜色、数量、形状和位置，观察力已经越来越敏锐。</p><button type="button" onClick={onBack}>返回龟龟乐园</button></div>
        </div>
      )}
    </section>
  );
}
