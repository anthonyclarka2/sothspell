/**
 * Identifiers that become URL segments or directory names. A decoded `%2F` or
 * `..` must never survive into a path join, so every consumer validates against
 * this boring shape instead of trusting the route layer.
 */

export const TOUR_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export function isSafeTourId(value: string): boolean {
  return TOUR_ID_PATTERN.test(value);
}

export function assertSafeTourId(value: string): string {
  if (!isSafeTourId(value)) {
    throw new Error(`unsafe tour id: ${value}`);
  }
  return value;
}

/** BCP-47-ish locale segments: `en`, `en-US`, `zh-Hant-TW`. */
export const LOCALE_SEGMENT_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

export function isSafeLocaleSegment(value: string): boolean {
  return LOCALE_SEGMENT_PATTERN.test(value);
}
