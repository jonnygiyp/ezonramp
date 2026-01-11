// Installs global error listeners as early as possible (before React renders)
// so production-only module init failures are still captured.

type ErrorLog = {
  timestamp: string;
  type: 'error' | 'unhandledrejection';
  message: string;
  stack?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
};

const PERSIST_KEY = 'global_error_logs_persisted';
const MAX_LOGS = 50;

function safeRead(key: string): ErrorLog[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ErrorLog[]) : [];
  } catch {
    return [];
  }
}

function safeWrite(key: string, logs: ErrorLog[]) {
  try {
    localStorage.setItem(key, JSON.stringify(logs.slice(-MAX_LOGS)));
  } catch {
    // ignore storage errors (private mode, quota, etc.)
  }
}

function persist(log: ErrorLog) {
  if (typeof window === 'undefined') return;
  if (typeof localStorage === 'undefined') return;

  const logs = safeRead(PERSIST_KEY);
  logs.push(log);
  safeWrite(PERSIST_KEY, logs);
}

export function installEarlyErrorLogger() {
  if (typeof window === 'undefined') return;

  const w = window as unknown as { __earlyErrorLoggerInstalled?: boolean };
  if (w.__earlyErrorLoggerInstalled) return;
  w.__earlyErrorLoggerInstalled = true;

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
