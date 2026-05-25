/**
 * Safe diagnostic logger for the Coinbase Global flow.
 * Never logs raw Coinbase payloads or PII — only IDs, lifecycle state, and timing.
 */

const PREFIX = "[CB-GLOBAL]";

type DiagPayload = Record<string, string | number | boolean | null | undefined>;

function safeLog(level: "debug" | "info" | "warn", event: string, data?: DiagPayload) {
  const entry = { event, at: new Date().toISOString(), ...(data || {}) };
  // eslint-disable-next-line no-console
  console[level](PREFIX, entry);
}

export const cbDiag = {
  popupOpen: (attemptId: string) => safeLog("info", "popup_open", { attemptId }),
  popupClose: (attemptId: string, currentState: string) =>
    safeLog("info", "popup_close", { attemptId, currentState }),
  visibility: (attemptId: string, hidden: boolean) =>
    safeLog("debug", "visibility_change", { attemptId, hidden }),
  sdkCallback: (attemptId: string, eventName: string) =>
    safeLog("info", "sdk_callback", { attemptId, eventName }),
  webhookSeen: (attemptId: string, status: string) =>
    safeLog("info", "webhook_received", { attemptId, status }),
  pollUpdate: (attemptId: string, status: string) =>
    safeLog("debug", "poll_update", { attemptId, status }),
  timeout: (attemptId: string, currentState: string) =>
    safeLog("warn", "timeout_reached", { attemptId, currentState }),
  stateTransition: (attemptId: string | null, from: string, to: string, source: string) =>
    safeLog("debug", "state_transition", { attemptId, from, to, source }),
  resolved: (attemptId: string | null, finalState: string, source: string) =>
    safeLog("info", "resolution", { attemptId, finalState, source }),
  startAgain: (attemptId: string | null) => safeLog("info", "start_again", { attemptId }),
};
