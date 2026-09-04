import Link from "next/link";
import { auth, signOut } from "@/auth";
import { TranWordmark } from "@/components/tran-wordmark";
import { AdminNav } from "@/components/admin-nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-tran-black">
        <Link
          href="/"
          className="flex items-center border-b border-tran-black px-6 py-6"
        >
          <TranWordmark className="h-7 w-auto" />
        </Link>
        <AdminNav />
        <div className="mt-auto flex flex-col gap-3 border-t border-tran-black px-6 py-5 text-xs text-tran-muted">
          <span className="truncate">{session?.user?.email}</span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="tran-label w-full border border-tran-black px-3 py-1.5 text-left transition-colors hover:border-tran-red hover:text-tran-red"
            >
              Logga ut
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 px-8 py-8">{children}</main>
    </div>
  );
}
