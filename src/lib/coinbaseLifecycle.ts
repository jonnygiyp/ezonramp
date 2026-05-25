/**
 * Shared Coinbase Global lifecycle types + failure-reason normalization.
 * Used by the frontend state machine, the webhook edge function, and the
 * admin transactions panel.
 */

export type CoinbaseLifecycleState =
  | "idle"
  | "initializing"
  | "waiting_coinbase"
  | "waiting_card_auth"
  | "waiting_verification"
  | "processing"
  | "complete"
  | "incomplete"
  | "card_declined"
  | "verification_failed"
  | "failed"
  | "unknown_failure";

export type CoinbaseFailureCode =
  | "card_declined"
  | "verification_failed"
  | "abandoned"
  | "popup_closed"
  | "timeout"
  | "unknown";

export type CoinbaseStatusSource =
  | "webhook"
  | "polling"
  | "popup-closed"
  | "timeout"
  | "abandoned"
  | "resumed-session"
  | "sdk-callback";

export interface LifecycleCopy {
  label: string;
  description: string;
  tone: "info" | "success" | "warning" | "error";
  showSpinner: boolean;
  showRetry: boolean;
}

export const LIFECYCLE_COPY: Record<CoinbaseLifecycleState, LifecycleCopy> = {
  idle: {
    label: "Ready",
    description: "Enter an amount to get started.",
    tone: "info",
    showSpinner: false,
    showRetry: false,
  },
  initializing: {
    label: "Initializing Transaction",
    description: "Preparing your secure purchase session.",
    tone: "info",
    showSpinner: true,
    showRetry: false,
  },
  waiting_coinbase: {
    label: "Waiting For Coinbase",
    description: "Complete the next steps in the Coinbase window.",
    tone: "info",
    showSpinner: true,
    showRetry: false,
  },
  waiting_card_auth: {
    label: "Waiting For Card Authorization",
    description: "Approve the charge with your bank if prompted.",
    tone: "info",
    showSpinner: true,
    showRetry: false,
  },
  waiting_verification: {
    label: "Waiting For Verification",
    description: "Identity or payment verification is in progress.",
    tone: "info",
    showSpinner: true,
    showRetry: false,
  },
  processing: {
    label: "Processing Purchase",
    description: "Coinbase is finalizing your transaction.",
    tone: "info",
    showSpinner: true,
    showRetry: false,
  },
  complete: {
    label: "Purchase Complete",
    description: "Your USDC has been delivered.",
    tone: "success",
    showSpinner: false,
    showRetry: false,
  },
  incomplete: {
    label: "Transaction Incomplete",
    description: "This transaction was not completed. You may safely try again.",
    tone: "warning",
    showSpinner: false,
    showRetry: true,
  },
  card_declined: {
    label: "Card Declined",
    description:
      "Your bank declined the transaction. Debit cards are more likely to succeed.",
    tone: "error",
    showSpinner: false,
    showRetry: true,
  },
  verification_failed: {
    label: "Verification Failed",
    description: "Identity or payment verification was not completed.",
    tone: "error",
    showSpinner: false,
    showRetry: true,
  },
  failed: {
    label: "Transaction Failed",
    description: "Coinbase reported a failure for this purchase.",
    tone: "error",
    showSpinner: false,
    showRetry: true,
  },
  unknown_failure: {
    label: "Unknown Failure",
    description:
      "We could not determine why this transaction failed. Please try again or use another payment method.",
    tone: "error",
    showSpinner: false,
    showRetry: true,
  },
};

// Terminal states cannot be downgraded.
const TERMINAL: ReadonlySet<CoinbaseLifecycleState> = new Set([
  "complete",
  "incomplete",
  "card_declined",
  "verification_failed",
  "failed",
  "unknown_failure",
]);

const ORDER: CoinbaseLifecycleState[] = [
  "idle",
  "initializing",
  "waiting_coinbase",
  "waiting_card_auth",
  "waiting_verification",
  "processing",
];

export function isTerminal(state: CoinbaseLifecycleState): boolean {
  return TERMINAL.has(state);
}

export function canTransition(
  current: CoinbaseLifecycleState,
  next: CoinbaseLifecycleState,
): boolean {
  if (current === next) return false;
  // Success terminal is sticky.
  if (current === "complete") return false;
  // Other terminals can only move to complete (positive update).
  if (TERMINAL.has(current) && next !== "complete") return false;
  // Forward-only inside the non-terminal lane.
  if (!TERMINAL.has(next)) {
    return ORDER.indexOf(next) >= ORDER.indexOf(current);
  }
  return true;
}

/**
 * Normalize Coinbase's verbose failure strings into a small enum the UI
 * and admin panel can act on.
 */
export function normalizeFailureReason(
  rawReason: unknown,
  rawErrorCode: unknown,
): CoinbaseFailureCode {
  const reason = typeof rawReason === "string" ? rawReason.toUpperCase() : "";
  const code = typeof rawErrorCode === "string" ? rawErrorCode.toUpperCase() : "";

  if (code.includes("CARD_DECLINED") || code.includes("DECLINE")) return "card_declined";
  if (reason.includes("KYC") || reason.includes("IDENTITY") || reason.includes("VERIFICATION")) {
    return "verification_failed";
  }
  if (reason.includes("USER_CANCELED") || reason.includes("USER_CANCELLED")) return "abandoned";
  if (reason.includes("TIMEOUT")) return "timeout";
  if (reason.includes("BUY_FAILED")) {
    if (code === "ERROR_CODE_UNSPECIFIED" || code === "") return "unknown";
  }
  return "unknown";
}

/** Map a failure code to the lifecycle state shown to the user. */
export function failureCodeToLifecycle(code: CoinbaseFailureCode): CoinbaseLifecycleState {
  switch (code) {
    case "card_declined":
      return "card_declined";
    case "verification_failed":
      return "verification_failed";
    case "abandoned":
    case "popup_closed":
      return "incomplete";
    case "timeout":
      return "incomplete";
    case "unknown":
    default:
      return "unknown_failure";
  }
}

/** Map a normalized Coinbase status string to a lifecycle state. */
export function coinbaseStatusToLifecycle(
  status: string | null | undefined,
): CoinbaseLifecycleState | null {
  if (!status) return null;
  const s = status.toUpperCase();
  if (s.includes("SUCCESS") || s === "COMPLETED" || s === "FULFILLED") return "complete";
  if (s.includes("FAILED") || s === "CANCELED" || s === "CANCELLED" || s === "EXPIRED") {
    return "failed";
  }
  if (s.includes("IN_PROGRESS") || s === "PROCESSING" || s.includes("PENDING")) return "processing";
  if (s === "INITIALIZED" || s === "IDLE") return "initializing";
  if (s === "INCOMPLETE") return "incomplete";
  return null;
}
