// Installs global error listeners as early as possible (before React renders)
// so production-only module init failures are still captured.

export type ErrorLog = {
  timestamp: string;
  type: 'error' | 'unhandledrejection';
  message: string;
  stack?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  componentStack?: string;
  url?: string;
  userAgent?: string;
};

declare global {
  interface Window {
    __earlyErrorLoggerInstalled?: boolean;
    __globalErrorLogsRuntime?: ErrorLog[];
    __persistClientErrorLog?: (log: ErrorLog) => void;
  }
}

const PERSIST_KEY = 'global_error_logs_persisted';
const WINDOW_NAME_PREFIX = '__lovable_error_logs__:';
const MAX_LOGS = 50;

function safeReadLocalStorage(key: string): ErrorLog[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ErrorLog[]) : [];
  } catch {
    return [];
  }
}

function safeWriteLocalStorage(key: string, logs: ErrorLog[]) {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(key, JSON.stringify(logs.slice(-MAX_LOGS)));
    return true;
  } catch {
    return false;
  }
}

function safeReadWindowName(): ErrorLog[] {
  try {
    if (typeof window === 'undefined') return [];
    const name = window.name || '';
    if (!name.startsWith(WINDOW_NAME_PREFIX)) return [];

    const raw = decodeURIComponent(name.slice(WINDOW_NAME_PREFIX.length));
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ErrorLog[]) : [];
  } catch {
    return [];
  }
}

function safeWriteWindowName(logs: ErrorLog[]) {
  try {
    if (typeof window === 'undefined') return false;
    window.name = WINDOW_NAME_PREFIX + encodeURIComponent(JSON.stringify(logs.slice(-MAX_LOGS)));
    return true;
  } catch {
    return false;
  }
}

function persist(log: ErrorLog) {
  if (typeof window === 'undefined') return;

  // Always keep an in-memory runtime buffer (works even when storage is blocked, e.g. sandbox iframes)
  const currentRuntime = Array.isArray(window.__globalErrorLogsRuntime) ? window.__globalErrorLogsRuntime : [];
  window.__globalErrorLogsRuntime = [...currentRuntime, log].slice(-MAX_LOGS);

  // Best-effort persistence
  const existing = safeReadLocalStorage(PERSIST_KEY);
  const ok = safeWriteLocalStorage(PERSIST_KEY, [...existing, log]);
  if (!ok) {
    const existingName = safeReadWindowName();
    safeWriteWindowName([...existingName, log]);
  }
}

export function installEarlyErrorLogger() {
  if (typeof window === 'undefined') return;

  if (window.__earlyErrorLoggerInstalled) return;
  window.__earlyErrorLoggerInstalled = true;

  // Expose a single persister so other parts of the app can log even if
  // storage is blocked (they can fall back to window.name/runtime buffer).
  window.__persistClientErrorLog = persist;

  window.addEventListener(
    'error',
    (event) => {
      const log: ErrorLog = {
        timestamp: new Date().toISOString(),
        type: 'error',
        message: event.message || 'Unknown error',
        stack: (event as ErrorEvent).error?.stack,
        filename: (event as ErrorEvent).filename,
        lineno: (event as ErrorEvent).lineno,
        colno: (event as ErrorEvent).colno,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      };

      // Keep console output for debugging
      // eslint-disable-next-line no-console
      console.error('[EarlyErrorLogger] error:', log);
      persist(log);
    },
    true,
  );

  window.addEventListener(
    'unhandledrejection',
    (event) => {
      const reason = (event as PromiseRejectionEvent).reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack : undefined;

      const log: ErrorLog = {
        timestamp: new Date().toISOString(),
        type: 'unhandledrejection',
        message,
        stack,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      };

      // eslint-disable-next-line no-console
      console.error('[EarlyErrorLogger] unhandledrejection:', log);
      persist(log);
    },
    true,
  );
}

// Auto-install on import
installEarlyErrorLogger();
