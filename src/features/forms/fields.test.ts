import { describe, expect, it } from "vitest";
import {
  AMOUNT_MESSAGE,
  amountOrZero,
  optionalAmount,
  optionalCurrency,
  optionalEmail,
  optionalHoursAsMinutes,
  optionalText,
  percentOrZero,
} from "./fields";

describe("form field schemas", () => {
  it("parses amounts into minor units", () => {
    expect(optionalAmount.parse("1.250,50")).toBe(125050);
    expect(optionalAmount.parse("  ")).toBeNull();
    expect(amountOrZero.parse("")).toBe(0);
  });

  it("rejects bad or negative amounts with the amount message", () => {
    const result = optionalAmount.safeParse("12,345,6");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(AMOUNT_MESSAGE);
    expect(amountOrZero.safeParse("-5").success).toBe(false);
  });

  it("parses percentages into basis points", () => {
    expect(percentOrZero.parse("12,5")).toBe(1250);
    expect(percentOrZero.parse("")).toBe(0);
    expect(percentOrZero.safeParse("120").success).toBe(false);
  });

  it("turns an hour estimate into minutes", () => {
    expect(optionalHoursAsMinutes.parse("2,5")).toBe(150);
    expect(optionalHoursAsMinutes.parse("")).toBeNull();
    expect(optionalHoursAsMinutes.safeParse("abc").success).toBe(false);
  });

  it("normalizes optional text, email and currency", () => {
    expect(optionalText.parse("  hi ")).toBe("hi");
    expect(optionalText.parse("   ")).toBeNull();
    expect(optionalEmail.parse("")).toBeNull();
    expect(optionalEmail.safeParse("not-an-email").success).toBe(false);
    expect(optionalCurrency.parse("eur")).toBe("EUR");
    expect(optionalCurrency.safeParse("euro").success).toBe(false);
  });
});
