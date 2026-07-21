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
      env: { ...process.env, ...env },
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

test("knowledge exploration stores sequenced progress and learning memory per student", async () => {
  const root = await mkdtemp(join(tmpdir(), "guigu-exploration-test-"));
  try {
    const databasePath = join(root, "app.sqlite");
    const result = await run(tsx, ["-e", `
      process.env.APP_DATABASE_FILE = ${JSON.stringify(databasePath)};
      (async () => {
        const { readyRuntimeDatabase } = await import("./db/runtime-database.ts");
        const { completeExplorationNode, getExplorationOverview } = await import("./db/exploration.ts");
        const database = await readyRuntimeDatabase();
        const now = Date.now();
        await database.run("INSERT INTO user_memory_profile (user_id, student_name, updated_at) VALUES ('student-alpha', '安安', ?)", [now]);
        await database.run("INSERT INTO user_memory_facts (user_id, fact_type, fact_value, source_type, created_at, last_used_at, expires_at) VALUES ('student-alpha', 'interest', '我喜欢恐龙和化石', 'test', ?, ?, NULL)", [now, now]);
        await database.run("INSERT INTO user_activity_log (activity_id, user_id, activity, detail, happened_at) VALUES ('private-activity', 'student-alpha', '聊天', '一段不应出现在推荐中的秘密原文', ?)", [now]);

        const before = await getExplorationOverview('student-alpha');
        let lockedError = '';
        try { await completeExplorationNode('student-alpha', 'nature-fossil-time'); } catch (error) { lockedError = error.message; }
        await completeExplorationNode('student-alpha', 'nature-survival');
        await completeExplorationNode('student-alpha', 'nature-survival');
        const after = await completeExplorationNode('student-alpha', 'nature-forest-layers');
        const otherStudent = await getExplorationOverview('student-beta');
        const activityCount = await database.first("SELECT COUNT(*) AS count FROM user_activity_log WHERE user_id = 'student-alpha' AND activity = '知识探险'");
        const progressCount = await database.first("SELECT COUNT(*) AS count FROM user_exploration_progress WHERE user_id = 'student-alpha'");
        const factCount = await database.first("SELECT COUNT(*) AS count FROM user_memory_facts WHERE user_id = 'student-alpha' AND source_type = 'knowledge-exploration'");
        process.stdout.write(JSON.stringify({ before, after, otherStudent, lockedError, activityCount, progressCount, factCount }));
      })();
    `]);
    const data = JSON.parse(result.stdout);
    assert.equal(data.before.completedNodeIds.length, 0);
    assert.equal(data.before.recommended.length, 3);
    assert.equal(data.before.recommended[0].domainId, "nature");
    assert.match(data.lockedError, /请先完成前一个知识点/);
    assert.deepEqual(data.after.completedNodeIds, ["nature-survival", "nature-forest-layers"]);
    assert.equal(data.progressCount.count, 2);
    assert.equal(data.activityCount.count, 2);
    assert.equal(data.factCount.count, 2);
    assert.equal(data.otherStudent.completedNodeIds.length, 0);
    assert.doesNotMatch(JSON.stringify(data.before.recommended), /秘密原文/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
