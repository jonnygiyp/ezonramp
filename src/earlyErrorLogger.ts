// Installs global error listeners as early as possible (before React renders)
// so production-only module init failures are still captured.

export type ErrorLog = {
  timestamp: string;
  type: 'error' | 'unhandledrejection' | 'resourceerror' | 'console';
  message: string;
  stack?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  componentStack?: string;
  url?: string;
  userAgent?: string;
  rawError?: string;
};

declare global {
  interface Window {
    __earlyErrorLoggerInstalled?: boolean;
    __lovableWorkerPatchInstalled?: boolean;
    __lovableConsolePatchInstalled?: boolean;
    __globalErrorLogsRuntime?: ErrorLog[];
    __persistClientErrorLog?: (log: ErrorLog) => void;
  }
}

const PERSIST_KEY = 'global_error_logs_persisted';
const WINDOW_NAME_PREFIX = '__lovable_error_logs__:';
const MAX_LOGS = 50;

function safeStringify(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Error) {
    return `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ''}`;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function extractErrorMessage(event: ErrorEvent): string {
  // Try multiple sources for the error message
  if (event.message && event.message !== 'Script error.' && event.message !== 'Script error') {
    return event.message;
  }
  
  if (event.error) {
    if (event.error instanceof Error) {
      return `${event.error.name}: ${event.error.message}`;
    }
    const stringified = safeStringify(event.error);
    if (stringified && stringified !== '{}') {
      return stringified;
    }
  }
  
  // Try to get info from filename
  if (event.filename) {
    return `Error in ${event.filename}${event.lineno ? `:${event.lineno}` : ''}`;
  }
  
  return 'Unknown error (no details available)';
}

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

function patchWorkersForLogging() {
  if (typeof window === 'undefined') return;

  try {
    if (window.__lovableWorkerPatchInstalled) return;
    window.__lovableWorkerPatchInstalled = true;

    const NativeWorker = (window as any).Worker as typeof Worker | undefined;
    if (typeof NativeWorker !== 'function') return;

    const WorkerProxy = function (this: any, scriptURL: string | URL, options?: WorkerOptions) {
      const worker: Worker = new (NativeWorker as any)(scriptURL as any, options);

      try {
        worker.addEventListener(
          'error',
          (event: ErrorEvent) => {
            const log: ErrorLog = {
              timestamp: new Date().toISOString(),
              type: 'error',
              message: `[Worker] ${extractErrorMessage(event)}`,
              stack: (event as any).error?.stack,
              filename: (event as any).filename,
              lineno: (event as any).lineno,
              colno: (event as any).colno,
              url: typeof window !== 'undefined' ? window.location.href : undefined,
              userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
            };

            // eslint-disable-next-line no-console
            console.error('[EarlyErrorLogger] worker error:', log);
            persist(log);
          },
          true,
        );
      } catch {
        // ignore
      }

      return worker;
    } as any;

    // Preserve instanceof behavior
    WorkerProxy.prototype = NativeWorker.prototype;
    try {
      Object.setPrototypeOf(WorkerProxy, NativeWorker);
    } catch {
      // ignore
    }

    (window as any).Worker = WorkerProxy;
  } catch {
    // ignore
  }
}

function patchConsoleForLogging() {
  if (typeof window === 'undefined') return;

  try {
    if (window.__lovableConsolePatchInstalled) return;
    window.__lovableConsolePatchInstalled = true;

    const originalError = console.error.bind(console);
    const originalWarn = console.warn.bind(console);

    const wrap = (level: 'error' | 'warn', original: (...args: any[]) => void) =>
      (...args: any[]) => {
        try {
          const firstError = args.find((a) => a instanceof Error) as Error | undefined;
          const message = args.map(safeStringify).join(' ');

          persist({
            timestamp: new Date().toISOString(),
            type: 'console',
            message: `[console.${level}] ${message}`,
            stack: firstError?.stack,
            url: typeof window !== 'undefined' ? window.location.href : undefined,
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
          });
        } catch {
          // ignore
        }

        original(...args);
      };

    console.error = wrap('error', originalError) as any;
    console.warn = wrap('warn', originalWarn) as any;
  } catch {
    // ignore
  }
}

export function installEarlyErrorLogger() {
  if (typeof window === 'undefined') return;

  if (window.__earlyErrorLoggerInstalled) return;
  window.__earlyErrorLoggerInstalled = true;

  // Expose a single persister so other parts of the app can log even if
  // storage is blocked (they can fall back to window.name/runtime buffer).
  window.__persistClientErrorLog = persist;

  // Capture errors thrown inside WebWorkers (many crypto SDKs run in workers).
  patchWorkersForLogging();

  // Capture SDK errors that are caught internally but still logged to the console.
  patchConsoleForLogging();

  // Capture resource load errors (script 404s, blocked chunks, etc.)
  window.addEventListener(
    'error',
    (event) => {
      const target = event.target as HTMLElement | null;
      
      // Check if this is a resource loading error (script, link, img)
      if (target && (target instanceof HTMLScriptElement || target instanceof HTMLLinkElement || target instanceof HTMLImageElement)) {
        const url = (target as any).src || (target as any).href || 'unknown';
        const tagName = target.tagName?.toLowerCase() || 'unknown';
        
        const log: ErrorLog = {
          timestamp: new Date().toISOString(),
          type: 'resourceerror',
          message: `Failed to load ${tagName}: ${url}`,
          filename: url,
          url: typeof window !== 'undefined' ? window.location.href : undefined,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        };

        // eslint-disable-next-line no-console
        console.error('[EarlyErrorLogger] resource error:', log);
        persist(log);
        return;
      }

      // Regular JS error
      const errorEvent = event as ErrorEvent;
      const message = extractErrorMessage(errorEvent);
      
      // Try to serialize the raw error for debugging
      let rawError: string | undefined;
      try {
        if (errorEvent.error) {
          rawError = safeStringify({
            name: errorEvent.error?.name,
            message: errorEvent.error?.message,
            stack: errorEvent.error?.stack,
            constructor: errorEvent.error?.constructor?.name,
          });
        }
      } catch {
        // ignore
      }

      const log: ErrorLog = {
        timestamp: new Date().toISOString(),
        type: 'error',
        message,
        stack: errorEvent.error?.stack,
        filename: errorEvent.filename,
        lineno: errorEvent.lineno,
        colno: errorEvent.colno,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        rawError,
      };

      // Keep console output for debugging
      // eslint-disable-next-line no-console
      console.error('[EarlyErrorLogger] error:', log);
      persist(log);
    },
    true, // Capture phase to catch resource errors
  );

  window.addEventListener(
    'unhandledrejection',
    (event) => {
      const reason = (event as PromiseRejectionEvent).reason;
      let message: string;
      let stack: string | undefined;
      let rawError: string | undefined;

      if (reason instanceof Error) {
        message = `${reason.name}: ${reason.message}`;
        stack = reason.stack;
      } else {
        message = safeStringify(reason) || 'Unknown rejection';
        try {
          rawError = safeStringify(reason);
        } catch {
          // ignore
        }
      }

      const log: ErrorLog = {
        timestamp: new Date().toISOString(),
        type: 'unhandledrejection',
        message,
        stack,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        rawError,
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
