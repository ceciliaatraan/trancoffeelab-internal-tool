/** Visas när order.isTest = true (KUSTOM_ENV var inte "live" när ordern skapades) — så testordrar aldrig kan misstas för riktiga. */
export function TestOrderChip() {
  return (
    <span className="tran-label inline-block border border-tran-red px-2 py-1 text-[11px] text-tran-red">
      Test
    </span>
  );
}
