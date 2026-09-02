import Link from "next/link";
import { auth, signOut } from "@/auth";
import { TranWordmark } from "@/components/tran-wordmark";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/orders", label: "Ordrar" },
  { href: "/products", label: "Produkter" },
  { href: "/inventory", label: "Lager" },
  { href: "/discounts", label: "Rabatter" },
  { href: "/customers", label: "Kunder" },
  { href: "/settings", label: "Inställningar" },
  { href: "/logs", label: "Loggar" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center gap-6 border-b border-tran-hairline px-6 py-4">
        <Link href="/" className="shrink-0">
          <TranWordmark className="h-8 w-auto" />
        </Link>
        <div className="h-8 w-px bg-tran-hairline" aria-hidden />
        <nav className="tran-label flex flex-1 flex-wrap gap-x-6 gap-y-2 text-xs">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-tran-black transition-colors hover:text-tran-red"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-4 text-xs text-tran-muted">
          <span>{session?.user?.email}</span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="tran-label border border-tran-black px-3 py-1.5 transition-colors hover:border-tran-red hover:text-tran-red"
            >
              Logga ut
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
