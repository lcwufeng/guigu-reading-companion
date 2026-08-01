/* eslint-disable @next/next/no-img-element -- Reuses the project's canonical turtle sprite. */
"use client";

import { Check, ChevronLeft, Cloud, Lightbulb, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { emitSoundEffect } from "./sound-system";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

type PairSide = { emoji: string; label: string };
type CloudPair = { key: string; left: PairSide; right: PairSide };
type CloudLevel = {
  id: string;
  title: string;
  difficulty: "入门" | "进阶" | "挑战";
  instruction: string;
  hint: string;
  pairs: CloudPair[];
};

export const cloudLevels: CloudLevel[] = [
  {
    id: "weather-tools",
    title: "天气小帮手",
    difficulty: "入门",
    instruction: "把天气和最合适的随身物品配在一起。",
    hint: "下雨要挡雨，阳光很强要保护眼睛。",
    pairs: [
      { key: "sun", left: { emoji: "☀️", label: "大太阳" }, right: { emoji: "🕶️", label: "太阳镜" } },
      { key: "rain", left: { emoji: "🌧️", label: "下雨" }, right: { emoji: "☂️", label: "雨伞" } },
      { key: "snow", left: { emoji: "❄️", label: "下雪" }, right: { emoji: "🧤", label: "保暖手套" } },
    ],
  },
  {
    id: "animal-homes",
    title: "动物回家",
    difficulty: "入门",
    instruction: "把小动物送回它最熟悉的家。",
    hint: "想一想它平时在哪里生活、休息或筑巢。",
    pairs: [
      { key: "bird", left: { emoji: "🐦", label: "小鸟" }, right: { emoji: "🪺", label: "鸟巢" } },
      { key: "bee", left: { emoji: "🐝", label: "蜜蜂" }, right: { emoji: "🍯", label: "蜂巢" } },
      { key: "fish", left: { emoji: "🐟", label: "小鱼" }, right: { emoji: "🌊", label: "水里" } },
      { key: "rabbit", left: { emoji: "🐇", label: "兔子" }, right: { emoji: "🕳️", label: "洞穴" } },
    ],
  },
  {
    id: "things-and-uses",
    title: "它能做什么",
    difficulty: "进阶",
    instruction: "根据物品的用途，找到与它有关联的目标。",
    hint: "不要只看颜色，要想一想每样物品是用来做什么的。",
    pairs: [
      { key: "key", left: { emoji: "🔑", label: "钥匙" }, right: { emoji: "🔒", label: "打开门锁" } },
      { key: "pencil", left: { emoji: "✏️", label: "铅笔" }, right: { emoji: "📝", label: "写字记录" } },
      { key: "watering", left: { emoji: "🚿", label: "浇水壶" }, right: { emoji: "🌱", label: "照顾幼苗" } },
      { key: "compass", left: { emoji: "🧭", label: "指南针" }, right: { emoji: "🗺️", label: "辨认方向" } },
    ],
  },
  {
    id: "measure-world",
    title: "测量小侦探",
    difficulty: "进阶",
    instruction: "选择能测量或说明左边内容的工具。",
    hint: "时间、长度、温度、重量和方向，需要不同的工具。",
    pairs: [
      { key: "time", left: { emoji: "⏰", label: "时间" }, right: { emoji: "⌚", label: "钟表" } },
      { key: "length", left: { emoji: "↔️", label: "长度" }, right: { emoji: "📏", label: "直尺" } },
      { key: "temperature", left: { emoji: "🌡️", label: "温度" }, right: { emoji: "🌡️", label: "温度计" } },
      { key: "weight", left: { emoji: "📦", label: "重量" }, right: { emoji: "⚖️", label: "秤" } },
      { key: "direction", left: { emoji: "🧭", label: "方向" }, right: { emoji: "🗺️", label: "地图" } },
    ],
  },
  {
    id: "cause-and-result",
    title: "因果云朵阵",
    difficulty: "挑战",
    instruction: "左边是发生的事情，右边是最可能出现的结果。",
    hint: "先在心里说一句“因为……所以……”，再寻找答案。",
    pairs: [
      { key: "seed", left: { emoji: "🌰", label: "种子得到阳光和水" }, right: { emoji: "🌱", label: "慢慢发芽" } },
      { key: "dark-cloud", left: { emoji: "🌑", label: "乌云越来越厚" }, right: { emoji: "🌧️", label: "可能快下雨" } },
      { key: "ice", left: { emoji: "🧊", label: "冰块放在阳光下" }, right: { emoji: "💧", label: "逐渐融化" } },
      { key: "practice", left: { emoji: "🎹", label: "每天认真练习" }, right: { emoji: "🎵", label: "演奏更熟练" } },
      { key: "read", left: { emoji: "📖", label: "带着问题阅读" }, right: { emoji: "💡", label: "理解得更深入" } },
      { key: "share", left: { emoji: "🤝", label: "主动分享与倾听" }, right: { emoji: "😊", label: "合作更愉快" } },
    ],
  },
];

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export default function CloudPairGame({
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
  const [leftCards, setLeftCards] = useState(() => shuffle(cloudLevels[0].pairs));
  const [rightCards, setRightCards] = useState(() => shuffle(cloudLevels[0].pairs));
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [selectedRight, setSelectedRight] = useState<string | null>(null);
  const [matched, setMatched] = useState<string[]>([]);
  const [resolving, setResolving] = useState(false);
  const [wrongPairs, setWrongPairs] = useState(0);
  const [feedback, setFeedback] = useState("先从左边选一朵云，再到右边找和它有关联的云朵。");
  const [hintedKey, setHintedKey] = useState<string | null>(null);
  const [allComplete, setAllComplete] = useState(false);
  const reportedRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const level = cloudLevels[levelIndex];
  const levelComplete = matched.length === level.pairs.length;
  const matchedSet = useMemo(() => new Set(matched), [matched]);

  useEffect(() => () => timersRef.current.forEach((timer) => window.clearTimeout(timer)), []);

  const resolvePair = (leftKey: string, rightKey: string) => {
    setResolving(true);
    const correct = leftKey === rightKey;
    const timer = window.setTimeout(() => {
      if (correct) {
        emitSoundEffect("game-star");
        const nextMatched = [...matched, leftKey];
        setMatched(nextMatched);
        const pair = level.pairs.find((item) => item.key === leftKey);
        setFeedback(nextMatched.length === level.pairs.length ? "这一关的关联全部找对啦！" : `配对成功：${pair?.left.label}和${pair?.right.label}。`);
      } else {
        onMistake();
        setWrongPairs((current) => current + 1);
        setFeedback("这两朵云的关系不够紧密，换一种思路再试试。");
      }
      setSelectedLeft(null);
      setSelectedRight(null);
      setResolving(false);
    }, 560);
    timersRef.current.push(timer);
  };

  const chooseLeft = (key: string) => {
    if (resolving || levelComplete || matchedSet.has(key)) return;
    emitSoundEffect("game-jump");
    setSelectedLeft(key);
    setFeedback("现在到右边选择和它最有关联的云朵。");
    if (selectedRight) resolvePair(key, selectedRight);
  };

  const chooseRight = (key: string) => {
    if (resolving || levelComplete || matchedSet.has(key)) return;
    emitSoundEffect("game-jump");
    setSelectedRight(key);
    setFeedback(selectedLeft ? "龟龟正在检查这组关系……" : "还要先从左边选一朵云。你也可以先记住这张卡。");
    if (selectedLeft) resolvePair(selectedLeft, key);
  };

  const showHint = () => {
    const next = level.pairs.find((pair) => !matchedSet.has(pair.key));
    if (!next) return;
    setHintedKey(next.key);
    setFeedback(`提示：试着把“${next.left.label}”和“${next.right.label}”联系起来。`);
    const timer = window.setTimeout(() => setHintedKey(null), 2_000);
    timersRef.current.push(timer);
  };

  const resetLevel = (targetLevel = levelIndex) => {
    const nextLevel = cloudLevels[targetLevel];
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
    setLeftCards(shuffle(nextLevel.pairs));
    setRightCards(shuffle(nextLevel.pairs));
    setSelectedLeft(null);
    setSelectedRight(null);
    setMatched([]);
    setResolving(false);
    setHintedKey(null);
    setFeedback("先从左边选一朵云，再到右边找和它有关联的云朵。");
  };

  const nextLevel = () => {
    if (levelIndex < cloudLevels.length - 1) {
      const nextIndex = levelIndex + 1;
      setLevelIndex(nextIndex);
      resetLevel(nextIndex);
      return;
    }
    setAllComplete(true);
    if (!reportedRef.current) {
      reportedRef.current = true;
      onComplete(`完成云朵配对5关，理解天气、动物住所、物品用途、测量工具和因果关系，错误配对${wrongPairs}次`);
    }
  };

  return (
    <section className="learning-game-panel cloud-pair-panel">
      <header className="learning-game-heading">
        <div><span><Cloud aria-hidden="true" /> 龟龟乐园 · 联想与逻辑</span><h1>云朵配对</h1></div>
        <button type="button" onClick={onBack}><ChevronLeft aria-hidden="true" /> 返回乐园</button>
      </header>

      <div className="learning-game-progress" aria-label={`第${levelIndex + 1}关，共5关`}>
        {cloudLevels.map((item, index) => <span className={index < levelIndex || allComplete ? "done" : index === levelIndex ? "active" : ""} key={item.id}>{index < levelIndex || allComplete ? <Check aria-hidden="true" /> : index + 1}</span>)}
      </div>

      {!allComplete ? (
        <div className="cloud-pair-layout">
          <section className="cloud-pair-board" aria-label="云朵配对游戏区域">
            <div className="cloud-pair-column">
              <h3>从这里选择</h3>
              {leftCards.map((pair) => <button type="button" className={`${selectedLeft === pair.key ? "selected" : ""} ${matchedSet.has(pair.key) ? "matched" : ""} ${hintedKey === pair.key ? "hinted" : ""}`} key={`left-${pair.key}`} disabled={resolving || matchedSet.has(pair.key)} onClick={() => chooseLeft(pair.key)}><b>{pair.left.emoji}</b><span>{pair.left.label}</span>{matchedSet.has(pair.key) && <Check />}</button>)}
            </div>
            <div className="cloud-pair-path" aria-hidden="true"><Cloud /><span>⇄</span><img src={`${BASE_PATH}/assets/characters/turtle/turtle_excited.png`} alt="" /></div>
            <div className="cloud-pair-column">
              <h3>找到关联</h3>
              {rightCards.map((pair) => <button type="button" className={`${selectedRight === pair.key ? "selected" : ""} ${matchedSet.has(pair.key) ? "matched" : ""} ${hintedKey === pair.key ? "hinted" : ""}`} key={`right-${pair.key}`} disabled={resolving || matchedSet.has(pair.key)} onClick={() => chooseRight(pair.key)}><b>{pair.right.emoji}</b><span>{pair.right.label}</span>{matchedSet.has(pair.key) && <Check />}</button>)}
            </div>
          </section>

          <aside className="cloud-pair-task">
            <small>{level.difficulty} · 第 {levelIndex + 1}/5 关</small>
            <h2>{level.title}</h2>
            <p>{level.instruction}</p>
            <div className="cloud-pair-stats"><span>完成<strong>{matched.length}/{level.pairs.length}</strong></span><span>错误<strong>{wrongPairs}</strong></span></div>
            <div className={`learning-game-feedback ${levelComplete ? "success" : "hint"}`} role="status"><Sparkles aria-hidden="true" /><p>{feedback}</p></div>
            <div className="cloud-pair-actions">
              {!levelComplete ? <><button type="button" onClick={showHint}><Lightbulb /> 龟龟提示</button><button type="button" onClick={() => resetLevel()}><RotateCcw /> 重新排列</button></> : <button className="primary" type="button" onClick={nextLevel}>{levelIndex < 4 ? "前往下一关" : "完成挑战"}</button>}
            </div>
          </aside>
        </div>
      ) : (
        <div className="learning-game-finish"><img src={`${BASE_PATH}/assets/characters/turtle/turtle_happy_hearts.png`} alt={`${turtleName}完成云朵配对`} /><div><small>五片联想天空全部通过</small><h2>{turtleName}和你成为逻辑配对大师啦！</h2><p>你已经会从外形线索走向用途、测量和因果关系，能说清楚两件事为什么有关联。</p><button type="button" onClick={onBack}>返回龟龟乐园</button></div></div>
      )}
    </section>
  );
}
