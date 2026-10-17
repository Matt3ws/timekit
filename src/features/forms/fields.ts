/**
 * Shared zod field schemas for TimeKit forms. Inputs are the raw strings typed
 * by the user; outputs are the stored representations (minor units, basis
 * points, minutes, null for "unset"). Parsing always goes through the lib
 * helpers, so the forms accept exactly what the rest of the app accepts.
 *
 * @module
 */
import { z } from "zod";
import { inputToMinor, parseDecimal, percentToBasisPoints } from "@/lib/money";

/** Message for an amount that doesn't parse. */
export const AMOUNT_MESSAGE = "Enter an amount like 300 or 1.250,50";

/** Message for a percentage that doesn't parse. */
export const PERCENT_MESSAGE = "Enter a percentage between 0 and 100";

/** Message for a duration that doesn't parse. */
export const DURATION_MESSAGE = "Enter a duration like 1:30, 1,5 or 45m";

/** Parse a typed amount into non-negative minor units; null when invalid or negative. */
export const parseAmount = (input: string): number | null => {
  const minor = inputToMinor(input);
  return minor === null || minor < 0 ? null : minor;
};

/** A required text field: trimmed, must not be empty. */
export const requiredText = (message: string): z.ZodString => z.string().trim().min(1, message);

/** Optional free text: trimmed, empty becomes null. */
export const optionalText = z
  .string()
  .trim()
  .transform((value) => value || null);

/** Optional money amount (major units typed, minor units out); empty becomes null. */
export const optionalAmount = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (!value) {
      return null;
    }
    const minor = parseAmount(value);
    if (minor === null) {
      ctx.addIssue({ code: "custom", message: AMOUNT_MESSAGE });
      return z.NEVER;
    }
    return minor;
  });

/** Money amount where an empty field means 0. */
export const amountOrZero = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const minor = parseAmount(value || "0");
    if (minor === null) {
      ctx.addIssue({ code: "custom", message: AMOUNT_MESSAGE });
      return z.NEVER;
    }
    return minor;
  });

/** Percentage 0–100 into basis points; an empty field means 0. */
export const percentOrZero = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const basisPoints = percentToBasisPoints(value || "0");
    if (basisPoints === null) {
      ctx.addIssue({ code: "custom", message: PERCENT_MESSAGE });
      return z.NEVER;
    }
    return basisPoints;
  });

/** Optional estimate typed in hours (`40`, `2,5`) into whole minutes; empty becomes null. */
export const optionalHoursAsMinutes = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (!value) {
      return null;
    }
    const hours = parseDecimal(value, 2);
    if (hours === null || hours < 0) {
      ctx.addIssue({ code: "custom", message: "Enter the estimate in hours, like 40 or 2,5" });
      return z.NEVER;
    }
    return Math.round(hours * 60);
  });

/** Optional ISO currency code (`dkk` → `DKK`); empty becomes null. */
export const optionalCurrency = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (!value) {
      return null;
    }
    if (!/^[a-z]{3}$/i.test(value)) {
      ctx.addIssue({ code: "custom", message: "Use a 3-letter code like DKK or EUR" });
      return z.NEVER;
    }
    return value.toUpperCase();
  });

/** Optional email address; empty becomes null. */
export const optionalEmail = z
  .string()
  .trim()
  .refine((value) => !value || z.email().safeParse(value).success, "Enter a valid email address")
  .transform((value) => value || null);
