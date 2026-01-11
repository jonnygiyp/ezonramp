import { useEffect } from 'react';
import { toast } from 'sonner';

interface ErrorLog {
  timestamp: string;
  type: 'error' | 'unhandledrejection';
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

      // If early logger is installed, it already persisted the error.
      const alreadyInstalled = (window as unknown as { __earlyErrorLoggerInstalled?: boolean })
        .__earlyErrorLoggerInstalled;
      if (alreadyInstalled) return;

      try {
        const logs = JSON.parse(sessionStorage.getItem('global_error_logs') || '[]');
        logs.push(log);
        sessionStorage.setItem('global_error_logs', JSON.stringify(logs.slice(-20)));
      } catch (e) {
        console.error('[GlobalErrorLogger] Failed to store log:', e);
      }
    };

    const handleError = (event: ErrorEvent) => {
      const log: ErrorLog = {
        timestamp: new Date().toISOString(),
        type: 'error',
        message: event.message,
        stack: event.error?.stack,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      };
      
      logError(log);
      
      // Show toast for critical errors (like the Particle OTP issue)
      if (event.message.includes('Class extends value undefined')) {
        toast.error('Authentication Error', {
          description: 'A compatibility issue occurred. Check /diagnostics for details.',
          duration: 8000,
        });
      } else if (event.message.includes('undefined is not a constructor')) {
        toast.error('Runtime Error', {
          description: 'A module loading issue occurred. Try refreshing the page.',
          duration: 5000,
        });
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason);
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
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);
}
