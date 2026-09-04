"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="tran-label flex flex-col text-xs">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`border-b border-tran-hairline px-6 py-4 transition-colors ${
              active
                ? "bg-tran-black text-tran-white"
                : "text-tran-black hover:bg-tran-hairline/10 hover:text-tran-red"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
