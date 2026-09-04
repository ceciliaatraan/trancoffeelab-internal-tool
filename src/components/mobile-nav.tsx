"use client";

import { useState } from "react";
import { AdminNav } from "./admin-nav";

export function MobileNav({
  email,
  signOutAction,
}: {
  email?: string | null;
  signOutAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Öppna meny"
        className="flex h-9 w-9 flex-col items-center justify-center gap-1.5 border border-tran-black"
      >
        <span className="h-0.5 w-5 bg-tran-black" aria-hidden />
        <span className="h-0.5 w-5 bg-tran-black" aria-hidden />
        <span className="h-0.5 w-5 bg-tran-black" aria-hidden />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-tran-white">
          <div className="flex items-center justify-between border-b border-tran-black px-4 py-3">
            <span className="tran-label text-xs text-tran-muted">Meny</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Stäng meny"
              className="flex h-9 w-9 items-center justify-center border border-tran-black text-lg leading-none"
            >
              ×
            </button>
          </div>
          <div onClick={() => setOpen(false)} className="flex flex-1 flex-col overflow-y-auto">
            <AdminNav />
          </div>
          <div className="mt-auto flex flex-col gap-3 border-t border-tran-black px-6 py-5 text-xs text-tran-muted">
            <span className="truncate">{email}</span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="tran-label w-full border border-tran-black px-3 py-1.5 text-left transition-colors hover:border-tran-red hover:text-tran-red"
              >
                Logga ut
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
