/**
 * A stable colour per customer, derived from its id: the same customer is the
 * same colour everywhere (dots in lists, the timer bar, the dashboard). Hues
 * are spread around the wheel; lightness/chroma suit both themes.
 */
export const customerColor = (customerId: string): string => {
  let hash = 0;
  for (let i = 0; i < customerId.length; i += 1) {
    hash = (hash * 31 + customerId.charCodeAt(i)) >>> 0;
  }
  // Golden-angle steps keep neighbouring hashes visually distinct.
  const hue = Math.round((hash * 137.508) % 360);
  return `oklch(0.66 0.13 ${hue})`;
};
