import { describe, expect, it } from "vitest";
import type { Project, Settings } from "@/db/schema";
import {
  applyLineEdits,
  billableHours,
  computeTotals,
  netAmount,
  nextRegistrationRenewal,
  sellerForInvoice,
  formatInvoiceNumber,
  lineItemForTask,
  suggestInvoiceCode,
  unbilledAmount,
} from "@/lib/billing";

const project = { id: "p1", hourlyRate: null, currency: null, billingType: "hourly" } as Project;
const settings = { defaultHourlyRate: 30000, currency: "DKK" } as Settings;

describe("billableHours", () => {
  it.each([
    [1, 0.25],
    [900, 0.25],
    [901, 0.5],
    [3840, 1.25],
    [0, 0],
  ])("%i s → %d h (always rounds up to 15 min)", (seconds, hours) => {
    expect(billableHours(seconds)).toBe(hours);
  });
});

describe("unbilledAmount", () => {
  it("rounds each task on its own, like an invoice does", () => {
    // 4 tasks × 1 minute = 4 quarter hours at 300 kr = 300 kr (not 75 kr for 4 minutes rounded once).
    expect(unbilledAmount([60, 60, 60, 60], 30000)).toBe(30000);
  });

  it("matches the invoice lines exactly", () => {
    const seconds = [5400, 600, 3601];
    const lines = seconds.map((trackedSeconds, i) =>
      lineItemForTask({ project, settings, task: { id: `t${i}`, title: "x", description: null, trackedSeconds } }),
    );
    expect(unbilledAmount(seconds, 30000)).toBe(lines.reduce((sum, line) => sum + line.amount, 0));
  });
});

describe("computeTotals (rates include moms)", () => {
  it("extracts 25% moms from the total", () => {
    // Your July invoice: 12h × 300 kr = 3.600 kr, of which 720 kr moms.
    const totals = computeTotals([{ amount: 360000 }], 2500);
    expect(totals).toEqual({ total: 360000, subtotal: 288000, taxAmount: 72000 });
  });
});

describe("formatInvoiceNumber", () => {
  it("joins prefix, customer code and the zero-padded sequence", () => {
    expect(formatInvoiceNumber("Cc-", "FIN", 1)).toBe("Cc-FIN-00001");
    expect(formatInvoiceNumber("", "KAN", 123456)).toBe("KAN-123456");
  });
});

describe("suggestInvoiceCode", () => {
  it.each([
    ["Finicc ApS", "FIN"],
    ["Kandii Emballage", "KAN"],
    ["Øko A/S", "OKO"],
    ["Ål", "AAL"],
    ["X", "XXX"],
    ["!!!", "CUS"],
  ])("%s → %s", (name, code) => {
    expect(suggestInvoiceCode(name, [])).toBe(code);
  });

  it("appends a digit while the code is taken", () => {
    expect(suggestInvoiceCode("Finicc", ["FIN"])).toBe("FIN2");
    expect(suggestInvoiceCode("Finicc", ["fin", "FIN2"])).toBe("FIN3");
  });
});

describe("per-line moms", () => {
  it("nets add up to the subtotal exactly", () => {
    // Three odd amounts whose nets don't round evenly.
    const lines = [{ amount: 33333 }, { amount: 12501 }, { amount: 7 }];
    const totals = computeTotals(lines, 2500);
    expect(totals.subtotal).toBe(lines.reduce((sum, line) => sum + netAmount(line.amount, 2500), 0));
    expect(totals.subtotal + totals.taxAmount).toBe(totals.total);
  });

  it("handles credit notes (negative amounts)", () => {
    expect(computeTotals([{ amount: -360000 }], 2500)).toEqual({ total: -360000, subtotal: -288000, taxAmount: -72000 });
  });
});

describe("applyLineEdits", () => {
  const base = [
    { key: "task:a", projectId: "p", taskId: "a", description: "Peak WMS", quantity: 2.25, unitPrice: 30000, amount: 67500 },
  ];

  it("recomputes the amount from an edited quantity and keeps the rate", () => {
    const [line] = applyLineEdits(base, { "task:a": { quantity: 2, description: "Peak WMS integration" } }, []);
    expect(line).toMatchObject({ description: "Peak WMS integration", quantity: 2, amount: 60000, unitPrice: 30000 });
  });

  it("ignores a blank description edit", () => {
    expect(applyLineEdits(base, { "task:a": { description: "  " } }, [])[0]?.description).toBe("Peak WMS");
  });

  it("appends hand-added lines like a hosting fee and drops empty ones", () => {
    const lines = applyLineEdits(base, {}, [
      { description: "Hosting oktober", quantity: 1, unitPrice: 6900 },
      { description: "", quantity: 1, unitPrice: 0 },
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatchObject({ key: "extra:0", description: "Hosting oktober", amount: 6900, taskId: null });
  });
});

describe("nextRegistrationRenewal", () => {
  const registered = new Date(2026, 9, 4).getTime();

  it("is three years after registration", () => {
    expect(new Date(nextRegistrationRenewal(registered, new Date(2027, 0, 1).getTime())).getFullYear()).toBe(2029);
  });

  it("moves to the next 3-year period once a renewal date has passed", () => {
    expect(new Date(nextRegistrationRenewal(registered, new Date(2029, 11, 1).getTime())).getFullYear()).toBe(2032);
  });
});

describe("sellerForInvoice", () => {
  const current = { companyName: "New ApS", vatNumber: "222" } as Settings;

  it("prefers the snapshot taken at issue time", () => {
    expect(sellerForInvoice(JSON.stringify({ companyName: "Old ApS", vatNumber: "111" }), current)).toMatchObject({
      companyName: "Old ApS",
      vatNumber: "111",
    });
  });

  it("falls back to current settings for older invoices", () => {
    expect(sellerForInvoice(null, current).companyName).toBe("New ApS");
  });
});
