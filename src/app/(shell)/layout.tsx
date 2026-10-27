import { TopBar } from "@/components/TopBar";
import { getSession } from "@/lib/auth";

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <>
      <TopBar loggedIn={Boolean(session)} />
      {children}
    </>
  );
}
