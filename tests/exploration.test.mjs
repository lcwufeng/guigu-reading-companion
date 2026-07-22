import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const projectRoot = resolve(import.meta.dirname, "..");
const tsx = resolve(projectRoot, "node_modules/.bin/tsx");

function run(command, args, env = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: { ...process.env, DEEPSEEK_API_KEY: "", MIMO_API_KEY: "", ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", rejectRun);
    child.on("close", (code) => {
      if (code === 0) resolveRun({ stdout, stderr });
      else rejectRun(new Error(`command exited ${code}\n${stdout}\n${stderr}`));
    });
  });
}

test("knowledge exploration requires learning evidence, schedules 1/3/7 day review, and isolates students", async () => {
  const root = await mkdtemp(join(tmpdir(), "guigu-exploration-test-"));
  try {
    const databasePath = join(root, "app.sqlite");
    const result = await run(tsx, ["-e", `
      process.env.APP_DATABASE_FILE = ${JSON.stringify(databasePath)};
      (async () => {
        const { readyRuntimeDatabase } = await import("./db/runtime-database.ts");
        const {
          getExplorationOverview,
          submitExplorationProject,
          submitExplorationQuiz,
          submitExplorationReview,
        } = await import("./db/exploration.ts");
        const database = await readyRuntimeDatabase();
        const start = 1_800_000_000_000;
        const day = 86_400_000;
        await database.run("INSERT INTO user_memory_profile (user_id, student_name, updated_at) VALUES ('student-alpha', '安安', ?)", [start]);
        await database.run("INSERT INTO user_memory_facts (user_id, fact_type, fact_value, source_type, created_at, last_used_at, expires_at) VALUES ('student-alpha', 'interest', '我喜欢恐龙和化石', 'test', ?, ?, NULL)", [start, start]);

        const before = await getExplorationOverview('student-alpha', start);
        let lockedError = '';
        try { await submitExplorationQuiz({ userId: 'student-alpha', nodeId: 'nature-fossil-time', selectedOption: 1, now: start }); } catch (error) { lockedError = error.message; }
        const wrongQuiz = await submitExplorationQuiz({ userId: 'student-alpha', nodeId: 'nature-survival', selectedOption: 0, now: start });
        const rightQuiz = await submitExplorationQuiz({ userId: 'student-alpha', nodeId: 'nature-survival', selectedOption: 1, now: start + 1 });
        const weakProject = await submitExplorationProject({ userId: 'student-alpha', nodeId: 'nature-survival', answer: '北极熊很厉害。', now: start + 2 });
        const learnedProject = await submitExplorationProject({
          userId: 'student-alpha', nodeId: 'nature-survival', now: start + 3,
          answer: '我选北极熊。它的白色保护色和厚脂肪适合寒冷的雪地环境，如果积雪减少，白色会更显眼，捕食可能变得困难。'
        });
        const learned = await getExplorationOverview('student-alpha', start + 3);

        let earlyReviewError = '';
        try {
          await submitExplorationReview({ userId: 'student-alpha', nodeId: 'nature-survival', answer: '身体特点要和环境匹配。', now: start + day - 1 });
        } catch (error) { earlyReviewError = error.message; }

        const reviewAnswer = '因为身体特点的作用要和生活环境、地方背景匹配，不同环境改变以后，保护色的隐藏优势也会不同。';
        const review1At = start + 3 + day;
        const review1 = await submitExplorationReview({ userId: 'student-alpha', nodeId: 'nature-survival', answer: reviewAnswer, now: review1At });
        const review2At = review1At + 2 * day;
        const review2 = await submitExplorationReview({ userId: 'student-alpha', nodeId: 'nature-survival', answer: reviewAnswer, now: review2At });
        const review3At = review2At + 4 * day;
        const review3 = await submitExplorationReview({ userId: 'student-alpha', nodeId: 'nature-survival', answer: reviewAnswer, now: review3At });
        const finalOverview = await getExplorationOverview('student-alpha', review3At);
        const otherStudent = await getExplorationOverview('student-beta', review3At);
        const activityCount = await database.first("SELECT COUNT(*) AS count FROM user_activity_log WHERE user_id = 'student-alpha' AND activity = '知识探险'");
        const factCount = await database.first("SELECT COUNT(*) AS count FROM user_memory_facts WHERE user_id = 'student-alpha' AND source_type = 'knowledge-exploration'");
        const attemptCount = await database.first("SELECT COUNT(*) AS count FROM user_exploration_attempts WHERE user_id = 'student-alpha'");
        process.stdout.write(JSON.stringify({
          before, lockedError, wrongQuiz, rightQuiz, weakProject, learnedProject, learned,
          earlyReviewError, review1, review2, review3, finalOverview, otherStudent,
          activityCount, factCount, attemptCount, review1At, review2At,
        }));
      })();
    `]);
    const data = JSON.parse(result.stdout);
    assert.equal(data.before.completedNodeIds.length, 0);
    assert.equal(data.before.availableNodes, 4);
    assert.equal(data.before.recommended[0].domainId, "nature");
    assert.match(data.lockedError, /请先完成前一个学习任务/);
    assert.equal(data.wrongQuiz.correct, false);
    assert.equal(data.rightQuiz.correct, true);
    assert.equal(data.weakProject.correct, false);
    assert.equal(data.learnedProject.correct, true);
    assert.equal(data.learned.nodeProgress["nature-survival"].state, "learned");
    assert.equal(data.learned.nodeProgress["nature-survival"].nextReviewAt, 1_800_000_000_003 + 86_400_000);
    assert.match(data.earlyReviewError, /还没到复习时间/);
    assert.equal(data.review1.correct, true);
    assert.equal(data.review1.overview.nodeProgress["nature-survival"].reviewStreak, 1);
    assert.equal(data.review1.overview.nodeProgress["nature-survival"].nextReviewAt, data.review1At + 2 * 86_400_000);
    assert.equal(data.review2.overview.nodeProgress["nature-survival"].reviewStreak, 2);
    assert.equal(data.review2.overview.nodeProgress["nature-survival"].nextReviewAt, data.review2At + 4 * 86_400_000);
    assert.equal(data.review3.overview.nodeProgress["nature-survival"].state, "mastered");
    assert.equal(data.finalOverview.dueReviewNodeIds.length, 0);
    assert.equal(data.otherStudent.completedNodeIds.length, 0);
    assert.equal(data.activityCount.count, 1);
    assert.equal(data.factCount.count, 1);
    assert.equal(data.attemptCount.count, 7);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
