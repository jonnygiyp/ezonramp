/**
 * Region-aware ramp selection helpers.
 *
 * Default routing rules:
 *   - US visitors  -> Stripe (US)        [provider name: "stripe"]
 *   - Non-US       -> Coinbase (Global)  [provider name: "coinbase_global"]
 *   - Unknown / geo failure -> Coinbase (Global) (safest broad fallback)
 *
 * Manual overrides are persisted per-browser in localStorage and take priority
 * over the geo default on subsequent loads. Geolocation is informational only;
 * it never blocks the user from switching providers.
 */

const MANUAL_RAMP_STORAGE_KEY = "ezonramp:manual-ramp-choice";

export type RampName = string;

export interface RampSelectionInput {
  isUs: boolean;
  /** Provider names that are currently enabled for this surface. */
  available: RampName[];
}

const PREFERRED_US_ORDER: RampName[] = ["coinbase", "stripe", "coinbase_global"];
const PREFERRED_NON_US_ORDER: RampName[] = ["coinbase_global", "stripe", "coinbase"];

/**
 * Pick the ramp the user should land on when no manual choice exists.
 * Always returns something present in `available` (or null if empty).
 */
export function pickDefaultRamp({ isUs, available }: RampSelectionInput): RampName | null {
  if (!available.length) return null;
  const order = isUs ? PREFERRED_US_ORDER : PREFERRED_NON_US_ORDER;
  for (const name of order) {
    if (available.includes(name)) return name;
  }
  // Anything unexpected — just take the first available so the UI never blanks.
  return available[0];
}

/**
 * Resolve the ramp to display, honoring (in order):
 *   1. A previously stored manual choice (if still available)
 *   2. The geo-derived default
 *   3. First available provider
 */
export function resolveInitialRamp(input: RampSelectionInput): RampName | null {
  const manual = readManualRamp();
  if (manual && input.available.includes(manual)) {
    return manual;
  }
  return pickDefaultRamp(input);
}

export function readManualRamp(): RampName | null {
  try {
    return localStorage.getItem(MANUAL_RAMP_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeManualRamp(name: RampName): void {
  try {
    localStorage.setItem(MANUAL_RAMP_STORAGE_KEY, name);
  } catch {
    /* ignore quota / privacy mode */
  }
}

export function clearManualRamp(): void {
  try {
    localStorage.removeItem(MANUAL_RAMP_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
