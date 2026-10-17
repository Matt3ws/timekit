import { describe, expect, it } from "vitest";
import { formatTaxRate, inputToMinor, parseDecimal, percentToBasisPoints } from "@/lib/money";

describe("inputToMinor", () => {
  it.each([
    ["850", 85000],
    ["850,50", 85050],
    ["850.50", 85050],
    ["1.250,50", 125050],
    ["1,250.50", 125050],
    ["1.250", 125000],
    ["1.250.000", 125000000],
    ["0.500", 50],
    ["0,5", 50],
    ["850 kr.", 85000],
    ["DKK 1 250", 125000],
    ["  300  ", 30000],
  ])("%s → %i øre", (input, expected) => {
    expect(inputToMinor(input)).toBe(expected);
  });

  it.each(["", "abc", "12,505", "1.25.0", "1,2,3.4.5", "--5", "12,5,"])("rejects %j", (input) => {
    expect(inputToMinor(input)).toBeNull();
  });
});

describe("percentToBasisPoints", () => {
  it.each([
    ["25", 2500],
    ["12,5", 1250],
    ["12.5", 1250],
    ["0", 0],
    ["25 %", 2500],
  ])("%s → %i bp", (input, expected) => {
    expect(percentToBasisPoints(input)).toBe(expected);
  });

  it.each(["101", "-1", "x"])("rejects %j", (input) => {
    expect(percentToBasisPoints(input)).toBeNull();
  });
});

describe("parseDecimal", () => {
  it("respects the decimals limit", () => {
    expect(parseDecimal("1,255", 3)).toBe(1.255);
    expect(parseDecimal("1,255", 2)).toBeNull();
  });
});

describe("formatTaxRate", () => {
  it("formats basis points as a Danish percent", () => {
    expect(formatTaxRate(2500)).toBe("25%");
    expect(formatTaxRate(1250)).toBe("12,5%");
  });
});
