import { describe, it, expect } from "vitest";
import {
  kronorToOre,
  percentToHundredths,
  oreToKronorInput,
  hundredthsToPercentInput,
} from "./money-input";

describe("kronorToOre", () => {
  it("converts whole kronor", () => {
    expect(kronorToOre("179")).toBe(17900);
  });

  it("converts decimal kronor with a dot", () => {
    expect(kronorToOre("179.50")).toBe(17950);
  });

  it("converts decimal kronor with a Swedish comma", () => {
    expect(kronorToOre("179,50")).toBe(17950);
  });

  it("returns NaN for empty or invalid input", () => {
    expect(kronorToOre("")).toBeNaN();
    expect(kronorToOre(null)).toBeNaN();
    expect(kronorToOre(undefined)).toBeNaN();
    expect(kronorToOre("abc")).toBeNaN();
  });

  it("rounds to the nearest öre for values with more than 2 decimals", () => {
    expect(kronorToOre("1.017")).toBe(102);
  });
});

describe("percentToHundredths", () => {
  it("converts whole percent", () => {
    expect(percentToHundredths("25")).toBe(2500);
  });

  it("converts a blended decimal rate", () => {
    expect(percentToHundredths("10,75")).toBe(1075);
  });

  it("returns NaN for empty or invalid input", () => {
    expect(percentToHundredths("")).toBeNaN();
    expect(percentToHundredths("nope")).toBeNaN();
  });
});

describe("oreToKronorInput / hundredthsToPercentInput", () => {
  it("round-trips with kronorToOre / percentToHundredths", () => {
    expect(kronorToOre(oreToKronorInput(17900))).toBe(17900);
    expect(percentToHundredths(hundredthsToPercentInput(2500))).toBe(2500);
  });

  it("formats as a plain decimal string, not currency", () => {
    expect(oreToKronorInput(17900)).toBe("179");
    expect(hundredthsToPercentInput(2500)).toBe("25");
  });
});
