"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/**
 * En <tr> som navigerar vid klick var som helst på raden (inte bara på
 * en enskild länk-cell). Om en cell innehåller en egen <Link> funkar den
 * fortfarande som vanligt (öppna i ny flik, etc.) - klicket bubblar bara
 * upp och triggar samma navigering en gång till, till samma URL.
 */
export function TableRowLink({
  href,
  className = "",
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();

  return (
    <tr
      onClick={() => router.push(href)}
      className={`cursor-pointer ${className}`}
    >
      {children}
    </tr>
  );
}
