/* eslint-disable @next/next/no-img-element -- Reuses the project's canonical turtle sprite. */
"use client";

import { Check, ChevronLeft, Lightbulb, RotateCcw, Sparkles, Waves } from "lucide-react";
import { useRef, useState } from "react";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const TURTLE = `${BASE_PATH}/assets/characters/turtle/turtle_idle_standing.png`;

type Pad = {
  id: string;
  label: string;
  x: number;
  y: number;
  order?: number;
};

type LotusLevel = {
  id: string;
  title: string;
  difficulty: "入门" | "进阶" | "挑战";
  instruction: string;
  hint: string;
  pads: Pad[];
  stepCount: number;
};

const levels: LotusLevel[] = [
  {
    id: "count-1-4",
    title: "小池塘热身",
    difficulty: "入门",
    instruction: "从 1 开始，按照 1、2、3、4 的顺序跳。",
    hint: "每次找比上一片大 1 的荷叶。",
    stepCount: 4,
    pads: [
      { id: "a1", label: "1", x: 18, y: 68, order: 1 },
      { id: "a4", label: "4", x: 78, y: 28, order: 4 },
      { id: "ad1", label: "6", x: 42, y: 78 },
      { id: "a2", label: "2", x: 36, y: 48, order: 2 },
      { id: "ad2", label: "0", x: 68, y: 72 },
      { id: "a3", label: "3", x: 58, y: 36, order: 3 },
    ],
  },
  {
    id: "even-2-8",
    title: "偶数荷叶桥",
    difficulty: "入门",
    instruction: "只跳偶数，按从小到大的顺序跳到 8。",
    hint: "偶数可以被 2 平均分开。",
    stepCount: 4,
    pads: [
      { id: "b2", label: "2", x: 17, y: 35, order: 1 },
      { id: "bd1", label: "5", x: 33, y: 73 },
      { id: "b4", label: "4", x: 39, y: 45, order: 2 },
      { id: "bd2", label: "7", x: 58, y: 70 },
      { id: "b6", label: "6", x: 62, y: 33, order: 3 },
      { id: "b8", label: "8", x: 84, y: 52, order: 4 },
    ],
  },
  {
    id: "odd-plus-two",
    title: "每次多两格",
    difficulty: "进阶",
    instruction: "从 3 开始，每次加 2：找到通往 11 的路线。",
    hint: "正确路线是 3、5、7、9、11。",
    stepCount: 5,
    pads: [
      { id: "c3", label: "3", x: 14, y: 66, order: 1 },
      { id: "cd1", label: "4", x: 27, y: 28 },
      { id: "c5", label: "5", x: 34, y: 55, order: 2 },
      { id: "cd2", label: "8", x: 48, y: 80 },
      { id: "c7", label: "7", x: 53, y: 38, order: 3 },
      { id: "c9", label: "9", x: 69, y: 58, order: 4 },
      { id: "cd3", label: "10", x: 83, y: 25 },
      { id: "c11", label: "11", x: 87, y: 70, order: 5 },
    ],
  },
  {
    id: "multiples-three",
    title: "三的秘密",
    difficulty: "进阶",
    instruction: "只跳 3 的倍数，从 3 一直跳到 15。",
    hint: "每一步都在上一个数的基础上加 3。",
    stepCount: 5,
    pads: [
      { id: "d3", label: "3", x: 14, y: 38, order: 1 },
      { id: "dd1", label: "5", x: 26, y: 74 },
      { id: "d6", label: "6", x: 34, y: 47, order: 2 },
      { id: "dd2", label: "8", x: 49, y: 22 },
      { id: "d9", label: "9", x: 52, y: 65, order: 3 },
      { id: "d12", label: "12", x: 70, y: 39, order: 4 },
      { id: "dd3", label: "14", x: 80, y: 77 },
      { id: "d15", label: "15", x: 87, y: 24, order: 5 },
    ],
  },
  {
    id: "expression-results",
    title: "算式荷叶",
    difficulty: "挑战",
    instruction: "先算一算，再按结果 4、6、8、10、12 的顺序跳。",
    hint: "不要只看算式里的数字，要先得到计算结果。",
    stepCount: 5,
    pads: [
      { id: "e4", label: "2+2", x: 14, y: 67, order: 1 },
      { id: "ed1", label: "3+4", x: 27, y: 29 },
      { id: "e6", label: "3+3", x: 33, y: 53, order: 2 },
      { id: "ed2", label: "5+4", x: 47, y: 79 },
      { id: "e8", label: "4+4", x: 52, y: 36, order: 3 },
      { id: "e10", label: "6+4", x: 69, y: 58, order: 4 },
      { id: "ed3", label: "6+5", x: 82, y: 25 },
      { id: "e12", label: "7+5", x: 86, y: 70, order: 5 },
    ],
  },
  {
    id: "growing-pattern",
    title: "金色规律池",
    difficulty: "挑战",
    instruction: "观察规律：2、3、5、8……每个数都是前两个数相加。",
    hint: "5 后面是 3+5，接着是 5+8。",
    stepCount: 6,
    pads: [
      { id: "f2", label: "2", x: 11, y: 55, order: 1 },
      { id: "f3", label: "3", x: 25, y: 29, order: 2 },
      { id: "fd1", label: "4", x: 29, y: 75 },
      { id: "f5", label: "5", x: 42, y: 50, order: 3 },
      { id: "fd2", label: "7", x: 54, y: 22 },
      { id: "f8", label: "8", x: 58, y: 72, order: 4 },
      { id: "f13", label: "13", x: 72, y: 39, order: 5 },
      { id: "fd3", label: "18", x: 82, y: 76 },
      { id: "f21", label: "21", x: 89, y: 23, order: 6 },
    ],
  },
];

export default function LotusJumpGame({
  turtleName,
  onBack,
  onComplete,
}: {
  turtleName: string;
  onBack: () => void;
  onComplete: (detail: string) => void;
}) {
  const [levelIndex, setLevelIndex] = useState(0);
  const [step, setStep] = useState(0);
  const [wrongJumps, setWrongJumps] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [showHint, setShowHint] = useState(false);
  const [allComplete, setAllComplete] = useState(false);
  const reportedRef = useRef(false);
  const level = levels[levelIndex];
  const completed = step >= level.stepCount;
  const currentPad = step > 0 ? level.pads.find((pad) => pad.order === step) : null;

  const choosePad = (pad: Pad) => {
    if (completed || allComplete) return;
    const expectedOrder = step + 1;
    if (pad.order !== expectedOrder) {
      setWrongJumps((current) => current + 1);
      setFeedback("这片荷叶还不是下一步。看看规律，再选一次。");
      return;
    }
    setStep(expectedOrder);
    setFeedback(expectedOrder === level.stepCount ? "顺利到岸！这条规律路线完全正确。" : `跳对啦！继续寻找第 ${expectedOrder + 1} 片荷叶。`);
    setShowHint(false);
  };

  const resetLevel = () => {
    setStep(0);
    setFeedback("");
    setShowHint(false);
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
      onComplete(`完成${levels.length}关荷叶跳跳，理解了数字顺序、倍数、算式和递推规律，误跳${wrongJumps}次`);
    }
  };

  return (
    <section className="learning-game-panel lotus-game-panel">
      <header className="learning-game-heading">
        <div>
          <span><Waves aria-hidden="true" /> 龟龟乐园 · 数字规律</span>
          <h1>荷叶跳跳</h1>
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
        <div className="lotus-game-layout">
          <section className="lotus-pond" aria-label="荷叶跳跳游戏区域">
            <div className="lotus-water-ripples" aria-hidden="true"><i /><i /><i /><i /></div>
            <div
              className={`lotus-turtle ${currentPad ? "on-pad" : "at-shore"}`}
              style={currentPad ? { left: `${currentPad.x}%`, top: `${currentPad.y}%` } : undefined}
              aria-hidden="true"
            >
              <img src={TURTLE} alt="" />
            </div>
            {level.pads.map((pad) => {
              const passed = Boolean(pad.order && pad.order <= step);
              const next = pad.order === step + 1;
              return (
                <button
                  type="button"
                  className={`lotus-pad ${passed ? "passed" : ""} ${showHint && next ? "hinted" : ""}`}
                  key={pad.id}
                  style={{ left: `${pad.x}%`, top: `${pad.y}%` }}
                  onClick={() => choosePad(pad)}
                  aria-label={`荷叶 ${pad.label}${passed ? "，已经跳过" : ""}`}
                >
                  <span>{pad.label}</span>
                  {passed && <Check aria-hidden="true" />}
                </button>
              );
            })}
            <div className="lotus-finish-shore" aria-hidden="true"><Sparkles /><span>终点</span></div>
          </section>

          <aside className="lotus-task-card">
            <small>{level.difficulty} · 第 {levelIndex + 1}/{levels.length} 关</small>
            <h2>{level.title}</h2>
            <p>{level.instruction}</p>
            <div className="lotus-step-count"><span>已经跳过<strong>{step}/{level.stepCount}</strong></span><span>误跳<strong>{wrongJumps}</strong></span></div>
            {showHint && <div className="learning-game-feedback hint"><Lightbulb aria-hidden="true" /><p>{level.hint}</p></div>}
            {feedback && <div className={`learning-game-feedback ${completed ? "success" : "hint"}`} role="status"><Sparkles aria-hidden="true" /><p>{feedback}</p></div>}
            <div className="lotus-actions">
              {!completed ? (
                <>
                  <button type="button" onClick={() => setShowHint(true)}><Lightbulb aria-hidden="true" /> 龟龟提示</button>
                  <button type="button" onClick={resetLevel}><RotateCcw aria-hidden="true" /> 重新跳</button>
                </>
              ) : (
                <button className="primary" type="button" onClick={nextLevel}>{levelIndex < levels.length - 1 ? "去下一片池塘" : "完成挑战"}</button>
              )}
            </div>
          </aside>
        </div>
      ) : (
        <div className="learning-game-finish">
          <img src={`${BASE_PATH}/assets/characters/turtle/turtle_happy_hearts.png`} alt={`${turtleName}完成荷叶跳跳`} />
          <div><small>{levels.length} 片规律池全部通过</small><h2>{turtleName}成为荷叶规律小达人啦！</h2><p>你会先观察数字，再按规律选择下一步，难题也能一步一步解决。</p><button type="button" onClick={onBack}>返回龟龟乐园</button></div>
        </div>
      )}
    </section>
  );
}
