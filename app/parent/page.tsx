import ParentRoute from "./ParentRoute";

export const dynamic = "force-dynamic";

export default function Page() {
  return <ParentRoute section="overview" />;
}
