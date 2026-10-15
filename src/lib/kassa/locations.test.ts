import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {}, schema: {} }));

const { mergeLocationOrder } = await import("./locations");

describe("mergeLocationOrder", () => {
  const current = ["event", "restaurang", "jul", "kaffe"];

  it("sparar den dragna ordningen", () => {
    expect(mergeLocationOrder(current, ["restaurang", "kaffe", "event", "jul"])).toEqual([
      "restaurang",
      "kaffe",
      "event",
      "jul",
    ]);
  });

  it("ignorerar okända och dubbla id och lägger saknade ställen sist", () => {
    expect(mergeLocationOrder(current, ["jul", "okänd", "jul", "event"])).toEqual([
      "jul",
      "event",
      "restaurang",
      "kaffe",
    ]);
    expect(mergeLocationOrder(current, [])).toEqual(current);
  });
});
