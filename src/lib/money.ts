/**
 * Money is stored everywhere as an integer number of minor units (øre / cents).
 * These helpers convert to/from the major-unit strings shown in the UI.
 */

/** Format minor units as a localized currency string, e.g. 85000 + "DKK" → "850,00 kr." */
export const formatMoney = (minorUnits: number, currency: string): string =>
  new Intl.NumberFormat("da-DK", {
    style: "currency",
    currency,
  }).format(minorUnits / 100);

/** Format minor units as a plain decimal string for inputs, e.g. 85000 → "850,00". */
export const minorToInput = (minorUnits: number): string =>
  (minorUnits / 100).toLocaleString("da-DK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/**
 * Parse a user-typed decimal number, Danish or English style. Returns null when
 * the input isn't a clean number (never guesses).
 *
 * - Both `,` and `.` present: the last one is the decimal separator
 *   (`1.250,50` and `1,250.50` → 1250.5).
 * - Only commas: a single comma is decimal (`12,5`); several are thousands.
 * - Only dots: a dot followed by exactly three digits is thousands (`1.250`),
 *   except after a leading zero (`0.500`); otherwise decimal (`12.5`).
 * - Spaces, currency codes and symbols are ignored (`850 kr.`, `DKK 1 250`).
 */
export const parseDecimal = (input: string, maxDecimals: number): number | null => {
  const cleaned = input.trim().replace(/\s|kr\.?|dkk|eur|sek|nok|usd|[€$£%]/gi, "");
  if (!/^-?[\d.,]+$/.test(cleaned) || !/\d/.test(cleaned)) {
    return null;
  }

  const negative = cleaned.startsWith("-");
  const digits = negative ? cleaned.slice(1) : cleaned;
  const lastComma = digits.lastIndexOf(",");
  const lastDot = digits.lastIndexOf(".");

  let decimalIndex = -1;
  if (lastComma >= 0 && lastDot >= 0) {
    decimalIndex = Math.max(lastComma, lastDot);
  } else if (lastComma >= 0) {
    decimalIndex = digits.indexOf(",") === lastComma ? lastComma : -1;
  } else if (lastDot >= 0 && digits.indexOf(".") === lastDot) {
    const after = digits.slice(lastDot + 1);
    const before = digits.slice(0, lastDot);
    decimalIndex = after.length === 3 && before !== "0" && before !== "" ? -1 : lastDot;
  }

  const integerPart = (decimalIndex >= 0 ? digits.slice(0, decimalIndex) : digits).replace(/[.,]/g, "");
  const fractionPart = decimalIndex >= 0 ? digits.slice(decimalIndex + 1) : "";
  // Trailing zeros don't add precision: "0.500" is fine with two decimals.
  if (/[.,]/.test(fractionPart) || fractionPart.replace(/0+$/, "").length > maxDecimals) {
    return null;
  }
  // Thousands groups must be exactly three digits: "1.25.0" is a typo, not a number.
  const groups = (decimalIndex >= 0 ? digits.slice(0, decimalIndex) : digits).split(/[.,]/);
  if (groups.length > 1 && groups.slice(1).some((group) => group.length !== 3)) {
    return null;
  }

  const value = Number(`${integerPart || "0"}.${fractionPart || "0"}`);
  if (!Number.isFinite(value)) {
    return null;
  }
  return negative ? -value : value;
};

/**
 * Parse a user-typed major-unit amount into integer minor units, e.g.
 * `"1.250,50"` → 125050. Returns null for input that isn't a clean amount.
 */
export const inputToMinor = (input: string): number | null => {
  const value = parseDecimal(input, 2);
  return value === null ? null : Math.round(value * 100);
};

/** Parse a user-typed percentage into basis points, e.g. `"12,5"` → 1250. Null when invalid. */
export const percentToBasisPoints = (input: string): number | null => {
  const value = parseDecimal(input, 2);
  return value === null || value < 0 || value > 100 ? null : Math.round(value * 100);
};

/** Format a tax rate in basis points as a percent string, e.g. 2500 → "25%", 1250 → "12,5%". */
export const formatTaxRate = (basisPoints: number): string =>
  `${(basisPoints / 100).toLocaleString("da-DK", { maximumFractionDigits: 2 })}%`;
