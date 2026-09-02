const STYLES: Record<string, string> = {
  draft: "border border-tran-hairline-strong text-tran-muted",
  published: "bg-tran-black text-tran-white",
  archived: "border border-tran-red text-tran-red",
};

const LABELS: Record<string, string> = {
  draft: "Utkast",
  published: "Publicerad",
  archived: "Arkiverad",
};

export function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={`tran-label inline-block px-2 py-1 text-[11px] ${STYLES[status] ?? STYLES.draft}`}
    >
      {LABELS[status] ?? status}
    </span>
  );
}
