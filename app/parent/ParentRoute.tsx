import { getAuthenticatedParent } from "../parent-auth-user";
import ParentCenter, { type ParentSection } from "./ParentCenter";
import ParentLoginPanel from "./ParentLoginPanel";

export default async function ParentRoute({ section }: { section: ParentSection }) {
  const parent = await getAuthenticatedParent();
  if (!parent) return <ParentLoginPanel mode="login" />;
  if (parent.mustResetPassword) return <ParentLoginPanel mode="reset" displayName={parent.displayName} />;
  return <ParentCenter initialSection={section} />;
}
