/** Visas i /orders-listan när order.containsPreorder = true — så det syns direkt vilka ordrar väntar på att skickas. */
export function PreorderChip() {
  return (
    <span className="tran-label inline-block border border-tran-blue px-2 py-1 text-[11px] text-tran-blue">
      Förbeställning
    </span>
  );
}
