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
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", rejectRun);
    child.on("close", (code) => code === 0 ? resolveRun({ stdout, stderr }) : rejectRun(new Error(`${stdout}\n${stderr}`)));
  });
}

test("admin accounts are isolated, audited, disableable and never expose raw chat", async () => {
  const root = await mkdtemp(join(tmpdir(), "guigu-admin-center-"));
  const databasePath = join(root, "app.sqlite");
  try {
    const execution = await run(["-e", `
      process.env.APP_DATABASE_FILE = ${JSON.stringify(databasePath)};
      process.env.ADMIN_INITIAL_USERNAME = "admin";
      process.env.ADMIN_INITIAL_PASSWORD = "InitialAdmin2026";
      process.env.MIMO_API_KEY = "configured";
      (async () => {
        const { authenticateAdmin, createAdminSession, getAdminSessionUser } = await import("./db/admin-auth.ts");
        const { authenticateUser } = await import("./db/auth.ts");
        const { createManagedAccount, resetManagedAccountPassword, setManagedAccountStatus, createParentStudentBinding, getAdminAccounts, getAdminLearning, getAdminOverview, getAdminAiData } = await import("./db/admin-center.ts");
        const { recordAdminAudit } = await import("./db/admin-audit.ts");
        const { recordServiceHealthEvent } = await import("./db/service-health.ts");
        const { readyRuntimeDatabase } = await import("./db/runtime-database.ts");
        const admin = await authenticateAdmin("admin", "InitialAdmin2026");
        const token = await createAdminSession(admin.id);
        const session = await getAdminSessionUser(token);
        const student = await createManagedAccount(admin.id, "student", "后台测试学生");
        const parent = await createManagedAccount(admin.id, "parent", "后台测试家长", student.id, "母亲");
        const reset = await resetManagedAccountPassword("student", student.id);
        const database = await readyRuntimeDatabase();
        const now = Date.now();
        await database.run("INSERT INTO user_chat_messages (user_id, message_id, role, message_text, created_at, expires_at) VALUES (?, ?, 'user', ?, ?, ?)", [student.id, "private-chat", "秘密聊天原文-后台不可见", now, now + 100000]);
        await recordAdminAudit({ adminId: admin.id, adminUsername: admin.username, action: "account.create", targetType: "student", targetId: student.id, summary: "创建测试学生" });
        await recordServiceHealthEvent({ service: "reading-ai", operation: "test", provider: "mimo", status: "success", durationMs: 321 });
        await setManagedAccountStatus("student", student.id, "disabled");
        const disabledLogin = await authenticateUser(student.username, reset.temporaryPassword);
        await setManagedAccountStatus("student", student.id, "active");
        const activeLogin = await authenticateUser(student.username, reset.temporaryPassword);
        await createParentStudentBinding(parent.id, student.id, "监护人");
        const accounts = await getAdminAccounts("后台测试");
        const learning = await getAdminLearning(student.id, 14);
        const overview = await getAdminOverview();
        const ai = await getAdminAiData();
        process.stdout.write(JSON.stringify({
          admin: { username: admin.username, role: admin.role, mustResetPassword: admin.mustResetPassword }, session: Boolean(session),
          student, parent, reset, disabledLogin: Boolean(disabledLogin), activeMustReset: activeLogin?.mustResetPassword,
          accounts, learning, overview, ai,
        }));
      })();
    `]);
    const output = JSON.parse(execution.stdout);
    assert.deepEqual(output.admin, { username: "admin", role: "super_admin", mustResetPassword: true });
    assert.equal(output.session, true);
    assert.equal(output.disabledLogin, false);
    assert.equal(output.activeMustReset, true);
    assert.equal(output.accounts.students[0].username, "后台测试学生");
    assert.equal(output.accounts.parents[0].children[0].relationship, "监护人");
    assert.equal(JSON.stringify(output.learning).includes("秘密聊天原文-后台不可见"), false);
    assert.ok(output.overview.counts.students >= 8);
    assert.equal(output.ai.providers.find((provider) => provider.key === "mimo").configured, true);
    assert.equal(output.ai.summary24h[0].averageDurationMs, 321);
    assert.equal(JSON.stringify(output.overview.recentAudits).includes(output.reset.temporaryPassword), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
