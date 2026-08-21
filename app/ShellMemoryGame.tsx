/* eslint-disable @next/next/no-img-element -- Reuses the project's canonical turtle sprite. */
"use client";

import { Check, ChevronLeft, Clock3, RotateCcw, Shell, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { emitSoundEffect } from "./sound-system";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const TURTLE = `${BASE_PATH}/assets/characters/turtle/home/turtle-home-idle-hd.webp`;

type ShellSymbol = { key: string; emoji: string; label: string };
type ShellLevel = {
  id: string;
  title: string;
  difficulty: "入门" | "进阶" | "挑战";
  previewMs: number;
  columns: number;
  symbols: ShellSymbol[];
};
type ShellCard = ShellSymbol & { id: string };

const symbols: ShellSymbol[] = [
  { key: "star", emoji: "⭐", label: "海星" },
  { key: "fish", emoji: "🐟", label: "小鱼" },
  { key: "crab", emoji: "🦀", label: "螃蟹" },
  { key: "pearl", emoji: "⚪", label: "珍珠" },
  { key: "coral", emoji: "🪸", label: "珊瑚" },
  { key: "octopus", emoji: "🐙", label: "章鱼" },
  { key: "whale", emoji: "🐳", label: "鲸鱼" },
  { key: "turtle", emoji: "🐢", label: "海龟" },
  { key: "boat", emoji: "⛵", label: "帆船" },
  { key: "island", emoji: "🏝️", label: "小岛" },
];

export const shellLevels: ShellLevel[] = [
  { id: "three-pairs", title: "浅滩热身", difficulty: "入门", previewMs: 4_500, columns: 3, symbols: symbols.slice(0, 3) },
  { id: "four-pairs", title: "珍珠小湾", difficulty: "入门", previewMs: 4_000, columns: 4, symbols: symbols.slice(0, 4) },
  { id: "six-pairs", title: "珊瑚迷宫", difficulty: "进阶", previewMs: 3_300, columns: 4, symbols: symbols.slice(0, 6) },
  { id: "eight-pairs", title: "深海记忆", difficulty: "进阶", previewMs: 2_600, columns: 4, symbols: symbols.slice(0, 8) },
  { id: "ten-pairs", title: "月光贝壳滩", difficulty: "挑战", previewMs: 1_900, columns: 5, symbols },
];

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function makeDeck(level: ShellLevel) {
  return shuffle(level.symbols.flatMap((symbol) => [
    { ...symbol, id: `${level.id}-${symbol.key}-a` },
    { ...symbol, id: `${level.id}-${symbol.key}-b` },
  ]));
}

export default function ShellMemoryGame({
  turtleName,
  onBack,
  onComplete,
}: {
  turtleName: string;
  onBack: () => void;
  onComplete: (detail: string) => void;
}) {
  const [levelIndex, setLevelIndex] = useState(0);
  const [deck, setDeck] = useState<ShellCard[]>(() => makeDeck(shellLevels[0]));
  const [previewing, setPreviewing] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [matched, setMatched] = useState<string[]>([]);
  const [resolving, setResolving] = useState(false);
  const [moves, setMoves] = useState(0);
  const [wrongMatches, setWrongMatches] = useState(0);
  const [feedback, setFeedback] = useState("先记住图案的位置，贝壳合上后再开始配对。");
  const [allComplete, setAllComplete] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const reportedRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const startedAtRef = useRef(0);
  const level = shellLevels[levelIndex];
  const levelComplete = matched.length === level.symbols.length;

  useEffect(() => {
    startedAtRef.current = Date.now();
    const interval = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1_000)), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPreviewing(false);
      setFeedback("贝壳合上啦！每次翻开两个，找出相同图案。");
    }, level.previewMs);
    return () => window.clearTimeout(timer);
  }, [deck, level.previewMs]);

  useEffect(() => () => timersRef.current.forEach((timer) => window.clearTimeout(timer)), []);

  const matchedSet = useMemo(() => new Set(matched), [matched]);

  const flipCard = (card: ShellCard) => {
    if (previewing || resolving || levelComplete || selected.includes(card.id) || matchedSet.has(card.key)) return;
    emitSoundEffect("page-turn");
    const nextSelected = [...selected, card.id];
    setSelected(nextSelected);
    if (nextSelected.length < 2) {
      setFeedback("再翻开一个贝壳，看看图案是不是一样。");
      return;
    }
    setMoves((current) => current + 1);
    setResolving(true);
    const first = deck.find((item) => item.id === nextSelected[0]);
    const isMatch = first?.key === card.key;
    const timer = window.setTimeout(() => {
      if (isMatch) {
        emitSoundEffect("game-star");
        const nextMatched = [...matched, card.key];
        setMatched(nextMatched);
        setFeedback(nextMatched.length === level.symbols.length ? "这一关的贝壳全部配对成功！" : `找到一对“${card.label}”！继续找下一对。`);
      } else {
        setWrongMatches((current) => current + 1);
        setFeedback("这两个图案不一样，不过翻错不扣爱心。记住它们的位置再试一次。");
      }
      setSelected([]);
      setResolving(false);
    }, 680);
    timersRef.current.push(timer);
  };

  const resetLevel = () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
    setDeck(makeDeck(level));
    setPreviewing(true);
    setFeedback(`有 ${Math.round(level.previewMs / 100) / 10} 秒观察时间，记住每个图案的位置。`);
    setSelected([]);
    setMatched([]);
    setResolving(false);
  };

  const nextLevel = () => {
    if (levelIndex < shellLevels.length - 1) {
      const nextIndex = levelIndex + 1;
      setLevelIndex(nextIndex);
      setDeck(makeDeck(shellLevels[nextIndex]));
      setPreviewing(true);
      setFeedback(`有 ${Math.round(shellLevels[nextIndex].previewMs / 100) / 10} 秒观察时间，记住每个图案的位置。`);
      setSelected([]);
      setMatched([]);
      setResolving(false);
      return;
    }
    setAllComplete(true);
    if (!reportedRef.current) {
      reportedRef.current = true;
      onComplete(`完成贝壳翻翻乐5关，共尝试${moves}次配对，错误${wrongMatches}次，用时${elapsedSeconds}秒`);
    }
  };

  return (
    <section className="learning-game-panel shell-memory-panel">
      <header className="learning-game-heading">
        <div><span><Shell aria-hidden="true" /> 龟龟乐园 · 观察与记忆</span><h1>贝壳翻翻乐</h1></div>
        <button type="button" onClick={onBack}><ChevronLeft aria-hidden="true" /> 返回乐园</button>
      </header>

      <div className="learning-game-progress" aria-label={`第${levelIndex + 1}关，共5关`}>
        {shellLevels.map((item, index) => <span className={index < levelIndex || allComplete ? "done" : index === levelIndex ? "active" : ""} key={item.id}>{index < levelIndex || allComplete ? <Check aria-hidden="true" /> : index + 1}</span>)}
      </div>

      {!allComplete ? (
        <div className="shell-memory-layout">
          <section className="shell-memory-board" aria-label="贝壳翻翻乐游戏区域">
            <div className="shell-sea-decoration" aria-hidden="true"><i /><i /><i /><span>⋆｡𖦹°‧🐚</span></div>
            <div className="shell-card-grid" style={{ gridTemplateColumns: `repeat(${level.columns}, minmax(0, 1fr))` }}>
              {deck.map((card) => {
                const revealed = previewing || selected.includes(card.id) || matchedSet.has(card.key);
                return (
                  <button
                    type="button"
                    className={`shell-memory-card ${revealed ? "revealed" : ""} ${matchedSet.has(card.key) ? "matched" : ""}`}
                    key={card.id}
                    onClick={() => flipCard(card)}
                    disabled={previewing || resolving || matchedSet.has(card.key)}
                    aria-label={revealed ? `${card.label}${matchedSet.has(card.key) ? "，已经配对" : ""}` : "未翻开的贝壳"}
                  >
                    <span className="shell-card-inner"><span className="shell-card-back">🐚</span><span className="shell-card-front"><b>{card.emoji}</b><small>{card.label}</small></span></span>
                  </button>
                );
              })}
            </div>
            <img className="shell-memory-turtle" src={TURTLE} alt="" />
          </section>

          <aside className="shell-memory-task">
            <small>{level.difficulty} · 第 {levelIndex + 1}/5 关</small>
            <h2>{level.title}</h2>
            <p>{level.symbols.length} 对图案 · 观察时间 {Math.round(level.previewMs / 100) / 10} 秒</p>
            <div className="shell-memory-stats"><span>找到<strong>{matched.length}/{level.symbols.length}</strong></span><span>尝试<strong>{moves}</strong></span><span><Clock3 />{elapsedSeconds}秒</span></div>
            <div className={`learning-game-feedback ${levelComplete ? "success" : "hint"}`} role="status"><Sparkles aria-hidden="true" /><p>{feedback}</p></div>
            <div className="shell-memory-actions">
              {levelComplete ? <button className="primary" type="button" onClick={nextLevel}>{levelIndex < 4 ? "前往下一关" : "完成挑战"}</button> : <button type="button" onClick={resetLevel}><RotateCcw aria-hidden="true" /> 重新摆放</button>}
            </div>
          </aside>
        </div>
      ) : (
        <div className="learning-game-finish"><img src={`${BASE_PATH}/assets/characters/turtle/actions/turtle-companion-celebrating-hd.webp`} alt={`${turtleName}完成贝壳翻翻乐`} /><div><small>五片贝壳滩全部通过</small><h2>{turtleName}和你成为记忆小达人啦！</h2><p>从三对到十对图案，你会观察位置、记住线索，也会在翻错后调整方法。</p><button type="button" onClick={onBack}>返回龟龟乐园</button></div></div>
      )}
    </section>
  );
}
