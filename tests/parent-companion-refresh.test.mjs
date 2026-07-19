import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const projectRoot = resolve(import.meta.dirname, "..");
const tsx = resolve(projectRoot, "node_modules/.bin/tsx");

function run(args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(tsx, args, { cwd: projectRoot, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", rejectRun);
    child.on("close", (code) => code === 0 ? resolveRun({ stdout, stderr }) : rejectRun(new Error(`${stdout}\n${stderr}`)));
  });
}

test("parent login refresh data is AI-generated at most once per China day and excludes raw chat", async () => {
  const root = await mkdtemp(join(tmpdir(), "guigu-parent-suggestion-"));
  const databasePath = join(root, "app.sqlite");
  try {
    const execution = await run(["-e", `
      process.env.APP_DATABASE_FILE = ${JSON.stringify(databasePath)};
      process.env.MIMO_API_KEY = "test-mimo-key";
      delete process.env.DEEPSEEK_API_KEY;
      (async () => {
        const { authenticateParent } = await import("./db/parent-auth.ts");
        const { readyRuntimeDatabase } = await import("./db/runtime-database.ts");
        const { refreshParentCompanionSuggestions } = await import("./lib/parent-companion-refresh.ts");
        const { getParentDashboard } = await import("./db/parent-center.ts");
        const { saveParentCompanionSuggestion, parentCompanionDateKey, claimDailyParentCompanionRefresh } = await import("./db/parent-companion.ts");
        const database = await readyRuntimeDatabase();
        const now = Date.now();
        await database.run("INSERT INTO user_reading_metrics (user_id, book_id, first_read_at, last_read_at, completed_at) VALUES (?, ?, ?, ?, NULL)", ["student-demo-1", "scarecrow-zh", now, now]);
        await database.run("INSERT INTO user_memory_facts (user_id, fact_type, fact_value, source_type, created_at, last_used_at, expires_at) VALUES (?, 'interest', '恐龙', 'chat-summary', ?, ?, NULL)", ["student-demo-1", now, now]);
        await database.run("INSERT INTO user_chat_messages (message_id, user_id, role, message_text, created_at, expires_at) VALUES (?, ?, 'user', ?, ?, ?)", ["raw-chat", "student-demo-1", "秘密聊天原文-不可发送", now, now + 100000]);

        const calls = [];
        globalThis.fetch = async (_url, init) => {
          calls.push(JSON.parse(String(init.body)));
          return new Response(JSON.stringify({ choices: [{ message: { content: "看到同学一最近在读《稻草人》。今晚留十分钟，请她挑一个最有意思的片段讲给你听，再问：这个人物为什么这样做？" } }] }), { status: 200 });
        };
        const parent = await authenticateParent("同学一家长", "123456");
        const first = await refreshParentCompanionSuggestions(parent.id);
        const second = await refreshParentCompanionSuggestions(parent.id);
        const dashboard = await getParentDashboard(parent.id, parent.username, "student-demo-1", 7);

        const demoTwo = await authenticateParent("同学二家长", "123456");
        await saveParentCompanionSuggestion(demoTwo.id, "student-demo-2", { text: "保留的上一条建议", modelSource: "mimo-v2.5", generatedAt: now - 86400000 });
        globalThis.fetch = async () => new Response("provider error", { status: 500 });
        const failed = await refreshParentCompanionSuggestions(demoTwo.id);
        const demoTwoDashboard = await getParentDashboard(demoTwo.id, demoTwo.username, "student-demo-2", 7);

        const today = parentCompanionDateKey(now);
        const tomorrow = parentCompanionDateKey(now + 86400000);
        const tomorrowFirstClaim = await claimDailyParentCompanionRefresh(parent.id, "student-demo-1", now + 86400000);
        const tomorrowSecondClaim = await claimDailyParentCompanionRefresh(parent.id, "student-demo-1", now + 86400000);
        process.stdout.write(JSON.stringify({ calls, first, second, failed, suggestion: dashboard.companionSuggestion, demoTwoSuggestion: demoTwoDashboard.companionSuggestion, today, tomorrow, tomorrowFirstClaim, tomorrowSecondClaim }));
      })();
    `]);
    const output = JSON.parse(execution.stdout);
    assert.equal(output.calls.length, 1);
    const prompt = JSON.stringify(output.calls[0]);
    assert.match(prompt, /稻草人/);
    assert.match(prompt, /恐龙/);
    assert.doesNotMatch(prompt, /秘密聊天原文-不可发送/);
    assert.equal(output.first.refreshed, 1);
    assert.equal(output.second.reusedToday, 1);
    assert.match(output.suggestion.text, /最近在读《稻草人》/);
    assert.equal(output.failed.retainedPrevious, 1);
    assert.equal(output.demoTwoSuggestion.text, "保留的上一条建议");
    assert.notEqual(output.today, output.tomorrow);
    assert.equal(output.tomorrowFirstClaim, true);
    assert.equal(output.tomorrowSecondClaim, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
