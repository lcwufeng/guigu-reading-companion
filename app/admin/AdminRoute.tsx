import { getAuthenticatedAdmin } from "../admin-auth-user";
import AdminCenter, { type AdminSection } from "./AdminCenter";
import AdminLoginPanel from "./AdminLoginPanel";

export default async function AdminRoute({ section }: { section: AdminSection }) {
  const admin = await getAuthenticatedAdmin();
  if (!admin) return <AdminLoginPanel mode="login" />;
  if (admin.mustResetPassword) return <AdminLoginPanel mode="reset" displayName={admin.displayName} />;
  return <AdminCenter initialSection={section} />;
}
