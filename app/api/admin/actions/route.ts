import { NextResponse } from "next/server";
import { recordAdminAudit, requestIp } from "../../../../db/admin-audit";
import { updateModelConfig, type ModelProviderKey } from "../../../../db/model-config";
import {
  createManagedAccount,
  createParentStudentBinding,
  removeParentStudentBinding,
  resetManagedAccountPassword,
  setManagedAccountStatus,
  type ManagedAccountStatus,
  type ManagedAccountType,
} from "../../../../db/admin-center";
import { getActiveAdmin, validAdminMutationOrigin } from "../../../admin-auth-user";

type AdminActionBody = {
  action?: string;
  accountType?: ManagedAccountType;
  accountId?: string;
  username?: string;
  status?: ManagedAccountStatus;
  parentId?: string;
  studentId?: string;
  relationship?: string;
  providerKey?: ModelProviderKey;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  appId?: string;
};

export async function POST(request: Request) {
  if (!validAdminMutationOrigin(request)) return NextResponse.json({ error: "请求来源无效。" }, { status: 403 });
  const admin = await getActiveAdmin();
  if (!admin) return NextResponse.json({ error: "请先登录管理后台。" }, { status: 401 });
  if (admin.role !== "super_admin" && admin.role !== "operator") return NextResponse.json({ error: "当前管理员没有修改账号的权限。" }, { status: 403 });
  const body = await request.json().catch(() => null) as AdminActionBody | null;
  const ipAddress = requestIp(request);
  try {
    if (body?.action === "update-model-config" && (body.providerKey === "primary" || body.providerKey === "multimodal" || body.providerKey === "speech")) {
      if (admin.role !== "super_admin") return NextResponse.json({ error: "只有超级管理员可以修改模型和密钥。" }, { status: 403 });
      const updated = await updateModelConfig({
        adminId: admin.id, providerKey: body.providerKey, model: body.model, baseUrl: body.baseUrl,
        apiKey: body.apiKey, appId: body.appId,
      });
      await recordAdminAudit({
        adminId: admin.id, adminUsername: admin.displayName, action: "model.config.update",
        targetType: "model_provider", targetId: updated.providerKey,
        summary: `更新${updated.providerKey === "primary" ? "主要模型" : updated.providerKey === "multimodal" ? "多模态模型" : "语音模型"}配置（密钥未写入日志）`, ipAddress,
      });
      return NextResponse.json({ ok: true });
    }
    if (body?.action === "create-account" && (body.accountType === "student" || body.accountType === "parent")) {
      const created = await createManagedAccount(admin.id, body.accountType, body.username, body.studentId, body.relationship);
      await recordAdminAudit({ adminId: admin.id, adminUsername: admin.displayName, action: "account.create", targetType: body.accountType, targetId: created.id, summary: `创建${body.accountType === "student" ? "学生" : "家长"}账号“${created.username}”`, ipAddress });
      return NextResponse.json({ ok: true, credential: created });
    }
    if (body?.action === "reset-password" && (body.accountType === "student" || body.accountType === "parent") && body.accountId) {
      const credential = await resetManagedAccountPassword(body.accountType, body.accountId.slice(0, 80));
      await recordAdminAudit({ adminId: admin.id, adminUsername: admin.displayName, action: "account.password.reset", targetType: body.accountType, targetId: credential.id, summary: `重置账号“${credential.username}”的临时密码并注销旧会话`, ipAddress });
      return NextResponse.json({ ok: true, credential });
    }
    if (body?.action === "set-status" && (body.accountType === "student" || body.accountType === "parent") && body.accountId && (body.status === "active" || body.status === "disabled")) {
      await setManagedAccountStatus(body.accountType, body.accountId.slice(0, 80), body.status);
      await recordAdminAudit({ adminId: admin.id, adminUsername: admin.displayName, action: `account.${body.status}`, targetType: body.accountType, targetId: body.accountId, summary: body.status === "disabled" ? "停用账号并注销全部旧会话" : "重新启用账号", ipAddress });
      return NextResponse.json({ ok: true });
    }
    if (body?.action === "bind" && body.parentId && body.studentId) {
      await createParentStudentBinding(body.parentId.slice(0, 80), body.studentId.slice(0, 80), body.relationship);
      await recordAdminAudit({ adminId: admin.id, adminUsername: admin.displayName, action: "binding.upsert", targetType: "parent_student", targetId: `${body.parentId}:${body.studentId}`, summary: `建立或更新亲子绑定，关系为“${(body.relationship || "家长").slice(0, 12)}”`, ipAddress });
      return NextResponse.json({ ok: true });
    }
    if (body?.action === "unbind" && body.parentId && body.studentId) {
      await removeParentStudentBinding(body.parentId.slice(0, 80), body.studentId.slice(0, 80));
      await recordAdminAudit({ adminId: admin.id, adminUsername: admin.displayName, action: "binding.remove", targetType: "parent_student", targetId: `${body.parentId}:${body.studentId}`, summary: "解除亲子绑定", ipAddress });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "不支持这个后台操作。" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "操作没有完成，请刷新后重试。" }, { status: 400 });
  }
}
