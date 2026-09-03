const STYLES: Record<string, string> = {
  AUTHORIZED: "border border-tran-blue text-tran-blue",
  PART_CAPTURED: "border border-tran-blue text-tran-blue",
  CAPTURED: "bg-tran-black text-tran-white",
  CLOSED: "bg-tran-black text-tran-white",
  CANCELLED: "border border-tran-red text-tran-red",
  EXPIRED: "border border-tran-red text-tran-red",
};

const LABELS: Record<string, string> = {
  AUTHORIZED: "Godkänd",
  PART_CAPTURED: "Delvis debiterad",
  CAPTURED: "Debiterad",
  CLOSED: "Avslutad",
  CANCELLED: "Avbruten",
  EXPIRED: "Utgången",
};

export function OrderStatusChip({ status }: { status: string }) {
  return (
    <span
      className={`tran-label inline-block px-2 py-1 text-[11px] ${STYLES[status] ?? "border border-tran-hairline-strong text-tran-muted"}`}
    >
      {LABELS[status] ?? status}
    </span>
  );
}
