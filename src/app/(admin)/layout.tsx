import Link from "next/link";
import { auth, signOut } from "@/auth";
import { TranWordmark } from "@/components/tran-wordmark";
import { AdminNav } from "@/components/admin-nav";
import { MobileNav } from "@/components/mobile-nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Mobil: smal toppbar med hamburgarmeny — synlig under lg */}
      <div className="flex items-center justify-between border-b border-tran-black px-4 py-3 lg:hidden">
        <Link href="/" className="flex items-center">
          <TranWordmark className="h-6 w-auto" />
        </Link>
        <MobileNav email={session?.user?.email} signOutAction={signOutAction} />
      </div>

      {/* Desktop: fast vänsterkolumn — dold under lg */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-tran-black lg:flex">
        <Link
          href="/"
          className="flex items-center border-b border-tran-black px-6 py-6"
        >
          <TranWordmark className="h-7 w-auto" />
        </Link>
        <AdminNav />
        <div className="mt-auto flex flex-col gap-3 border-t border-tran-black px-6 py-5 text-xs text-tran-muted">
          <span className="truncate">{session?.user?.email}</span>
          <form action={signOutAction}>
            <button
              type="submit"
              className="tran-label w-full border border-tran-black px-3 py-1.5 text-left transition-colors hover:border-tran-red hover:text-tran-red"
            >
              Logga ut
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
