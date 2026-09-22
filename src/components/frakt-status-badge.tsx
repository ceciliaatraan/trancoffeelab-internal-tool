import type { FraktStatusKind } from "@/lib/orders/fulfillment-status";

const STYLES: Record<FraktStatusKind, string> = {
  ej_skickad: "border border-tran-red text-tran-red",
  under_transport: "border border-tran-amber text-tran-amber",
  levererad: "bg-tran-green text-tran-white",
  avbruten: "border border-tran-hairline-strong text-tran-muted",
};

export function FraktStatusBadge({ kind, label }: { kind: FraktStatusKind; label: string }) {
  return (
    <span className={`tran-label inline-block px-2 py-1 text-[11px] ${STYLES[kind]}`}>
      {label}
    </span>
  );
}
