import { describe, expect, it } from "vitest";
import { containsPattern, escapeLike, searchTerms } from "./order-search";

describe("searchTerms", () => {
  it("delar på blanksteg och ignorerar tomma", () => {
    expect(searchTerms("  Huy   Nguyen ")).toEqual(["Huy", "Nguyen"]);
    expect(searchTerms("")).toEqual([]);
  });
  it("tar högst 6 ord", () => {
    expect(searchTerms("a b c d e f g h")).toHaveLength(6);
  });
});

describe("escapeLike", () => {
  it("gör jokertecken bokstavliga", () => {
    expect(escapeLike("50%_rabatt\\")).toBe("50\\%\\_rabatt\\\\");
    expect(containsPattern("Rättgatan 5")).toBe("%Rättgatan 5%");
  });
});
