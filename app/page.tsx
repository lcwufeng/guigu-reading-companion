import LoginPanel from "./LoginPanel";
import ReadingApp from "./ReadingApp";
import { getAuthenticatedStudent } from "./auth-user";

export const dynamic = "force-dynamic";

export default async function Page() {
  const student = await getAuthenticatedStudent();
  if (!student) return <LoginPanel mode="login" />;
  if (student.mustResetPassword) return <LoginPanel mode="reset" displayName={student.displayName} />;
  return <ReadingApp student={{ displayName: student.displayName }} />;
}
