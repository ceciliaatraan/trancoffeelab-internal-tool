import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {}, schema: {} }));

const { reorderIds } = await import("./locations");

describe("reorderIds", () => {
  const ids = ["event", "restaurang", "jul", "kaffe"];

  it("flyttar ett ställe uppåt och nedåt", () => {
    expect(reorderIds(ids, "restaurang", 1)).toEqual(["restaurang", "event", "jul", "kaffe"]);
    expect(reorderIds(ids, "event", 3)).toEqual(["restaurang", "jul", "event", "kaffe"]);
    expect(reorderIds(ids, "event", 4)).toEqual(["restaurang", "jul", "kaffe", "event"]);
  });

  it("klämmer orimliga positioner och ignorerar okända id", () => {
    expect(reorderIds(ids, "kaffe", 0)).toEqual(["kaffe", "event", "restaurang", "jul"]);
    expect(reorderIds(ids, "kaffe", 99)).toEqual(ids);
    expect(reorderIds(ids, "okänd", 1)).toEqual(ids);
  });
});
