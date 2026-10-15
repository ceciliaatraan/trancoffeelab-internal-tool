import Link from "next/link";
import { auth, signOut } from "@/auth";
import { TranWordmark } from "@/components/tran-wordmark";
import { SubmitButton } from "@/components/submit-button";

/**
 * Egen, enkel ram för kassan - utan adminens meny, så kassabiträden
 * (rollen cashier) bara ser kassan. Ägare/personal får en länk tillbaka.
 */
export default async function KassaLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const isCashier = session?.user?.role === "cashier";

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-tran-black px-4 py-3 lg:px-8">
        <div className="flex items-center gap-4">
          <TranWordmark className="h-6 w-auto" />
          <span className="tran-label text-xs">Kassa</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-tran-muted">
          {!isCashier ? (
            <Link href="/" className="tran-label hover:text-tran-red">
              Till admin
            </Link>
          ) : null}
          <span className="hidden truncate sm:inline">{session?.user?.email}</span>
          <form action={signOutAction}>
            <SubmitButton className="tran-label border border-tran-black px-3 py-1.5 transition-colors hover:border-tran-red hover:text-tran-red">
              Logga ut
            </SubmitButton>
          </form>
        </div>
      </header>
      <main className="min-w-0 flex-1 px-4 py-6 lg:px-8">{children}</main>
    </div>
  );
}
