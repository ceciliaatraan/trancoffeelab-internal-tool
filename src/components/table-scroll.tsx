/**
 * Låter en bred tabell scrolla i sidled inuti sig själv på smala skärmar,
 * i stället för att göra hela sidan bredare än telefonen. På mobil går
 * scrollytan ut till skärmkanten (samma 1rem som <main>s sidomarginal).
 */
export function TableScroll({ children }: { children: React.ReactNode }) {
  return <div className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">{children}</div>;
}
