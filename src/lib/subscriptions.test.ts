import { describe, expect, it } from "vitest";
import {
  dueMonths,
  monthKeyOf,
  monthLabel,
  monthRange,
  nextInvoiceMonth,
  nextMonth,
  subscriptionInvoiceLines,
} from "@/lib/subscriptions";

const at = (year: number, month1: number, day: number): number => new Date(year, month1 - 1, day, 12).getTime();

describe("month keys", () => {
  it("rolls over the year", () => {
    expect(nextMonth("2026-12")).toBe("2027-01");
    expect(monthKeyOf(at(2026, 10, 5))).toBe("2026-10");
  });

  it("covers the whole month", () => {
    const { start, end } = monthRange("2026-02");
    expect(new Date(start).getDate()).toBe(1);
    expect(new Date(end).getMonth()).toBe(1);
    expect(new Date(end + 1).getMonth()).toBe(2);
  });
});

describe("dueMonths", () => {
  it("bills the current month from its 1st", () => {
    expect(dueMonths({ startMonth: "2026-10", endMonth: null, billedThrough: null, now: at(2026, 10, 1) })).toEqual(["2026-10"]);
  });

  it("is empty once the month is billed", () => {
    expect(dueMonths({ startMonth: "2026-10", endMonth: null, billedThrough: "2026-10", now: at(2026, 10, 20) })).toEqual([]);
  });

  it("catches up on every missed month", () => {
    expect(dueMonths({ startMonth: "2026-10", endMonth: null, billedThrough: "2026-10", now: at(2027, 1, 3) })).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
    ]);
  });

  it("waits for a future start month", () => {
    expect(dueMonths({ startMonth: "2026-12", endMonth: null, billedThrough: null, now: at(2026, 10, 5) })).toEqual([]);
  });

  it("stops at the end month", () => {
    expect(dueMonths({ startMonth: "2026-10", endMonth: "2026-11", billedThrough: null, now: at(2027, 3, 1) })).toEqual([
      "2026-10",
      "2026-11",
    ]);
  });
});

describe("monthLabel", () => {
  it("speaks the customer's language", () => {
    expect(monthLabel("2026-10", "da")).toBe("oktober 2026");
    expect(monthLabel("2026-10", "en")).toBe("October 2026");
  });
});

describe("nextInvoiceMonth", () => {
  it("starts at the first month, then follows the last billed one", () => {
    expect(nextInvoiceMonth({ startMonth: "2026-10", endMonth: null, billedThrough: null })).toBe("2026-10");
    expect(nextInvoiceMonth({ startMonth: "2026-10", endMonth: null, billedThrough: "2026-12" })).toBe("2027-01");
  });

  it("is null once the end month is billed", () => {
    expect(nextInvoiceMonth({ startMonth: "2026-10", endMonth: "2026-11", billedThrough: "2026-11" })).toBeNull();
  });
});

describe("subscriptionInvoiceLines", () => {
  it("makes one line per month with the description underneath", () => {
    const lines = subscriptionInvoiceLines({
      id: "s1",
      description: "Hosting",
      details: "Server for the Finicc app",
      amount: 7000,
      months: ["2026-10", "2026-11"],
      language: "da",
    });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      key: "sub:s1:2026-10",
      subscriptionId: "s1",
      description: "Hosting · oktober 2026\nServer for the Finicc app",
      amount: 7000,
    });
  });
});
