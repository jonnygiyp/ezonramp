import { useEffect } from 'react';
import { toast } from 'sonner';

interface ErrorLog {
  timestamp: string;
  type: 'error' | 'unhandledrejection' | 'resourceerror';
  message: string;
  stack?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
}

export function useGlobalErrorLogger() {
  useEffect(() => {
    const logError = (log: ErrorLog) => {
      console.error(`[GlobalErrorLogger] ${log.type}:`, log);

      // Prefer the early logger's persister (handles storage-blocked environments via fallbacks).
      try {
        const persist = (window as any).__persistClientErrorLog as undefined | ((l: any) => void);
        if (persist) {
          persist(log);
          return;
        }
      } catch {
        // ignore
      }

      try {
        const logs = JSON.parse(sessionStorage.getItem('global_error_logs') || '[]');
        logs.push(log);
        sessionStorage.setItem('global_error_logs', JSON.stringify(logs.slice(-20)));
      } catch (e) {
        console.error('[GlobalErrorLogger] Failed to store log:', e);
      }
    };

    const toSafeString = (value: unknown) => {
      if (value == null) return '';
      if (typeof value === 'string') return value;
      if (value instanceof Error) return value.message;
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    };

    const handleError = (event: ErrorEvent) => {
      const derivedMessage =
        event.message ||
        (event.error instanceof Error ? event.error.message : toSafeString(event.error)) ||
        'Unknown error';

      const log: ErrorLog = {
        timestamp: new Date().toISOString(),
        type: 'error',
        message: derivedMessage,
        stack: event.error instanceof Error ? event.error.stack : undefined,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      };

      logError(log);

      // Show toast for critical errors (like the Particle OTP issue)
      if (derivedMessage.includes('Class extends value undefined')) {
        toast.error('Authentication Error', {
          description: 'A compatibility issue occurred. Check /diagnostics for details.',
          duration: 8000,
        });
      } else if (derivedMessage.includes('undefined is not a constructor')) {
        toast.error('Runtime Error', {
          description: 'A module loading issue occurred. Try refreshing the page.',
          duration: 5000,
        });
      }
    };

    // Resource errors (script chunk 404s, blocked loads, etc.) are only visible in capture phase.
    const handleResourceError = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const isScript = target instanceof HTMLScriptElement;
      const isLink = target instanceof HTMLLinkElement;
      const isImg = target instanceof HTMLImageElement;
      if (!isScript && !isLink && !isImg) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const url = (target as any).src || (target as any).href;

      const log: ErrorLog = {
        timestamp: new Date().toISOString(),
        type: 'resourceerror',
        message: `Failed to load resource: ${url || '(unknown url)'}`,
        filename: url,
      };

      logError(log);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : toSafeString(reason) || 'Unknown rejection';
      const stack = reason instanceof Error ? reason.stack : undefined;

      const log: ErrorLog = {
        timestamp: new Date().toISOString(),
        type: 'unhandledrejection',
        message,
        stack,
      };

      logError(log);

      // Show toast for network/API errors
      if (message.includes('fetch') || message.includes('network')) {
        toast.error('Network Error', {
          description: 'Failed to connect. Please check your internet connection.',
          duration: 5000,
        });
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('error', handleResourceError, true);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('error', handleResourceError, true);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);
}
