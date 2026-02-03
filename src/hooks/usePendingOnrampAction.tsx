import { useEffect, useRef, useCallback } from 'react';
import { useAccount } from '@/hooks/useParticle';

// Singleton storage for pending action (survives re-renders and component unmounts)
let pendingAction: (() => void) | null = null;

/**
 * Hook to manage pending onramp actions that should execute after auth.
 * Stores a callback that will be invoked once the user authenticates.
 */
export function usePendingOnrampAction() {
  const { isConnected } = useAccount();
  const wasConnected = useRef(isConnected);
  const hasExecuted = useRef(false);

  // When user becomes connected, execute pending action
  useEffect(() => {
    if (isConnected && !wasConnected.current && pendingAction && !hasExecuted.current) {
      hasExecuted.current = true;
      const action = pendingAction;
      pendingAction = null;
      // Execute on next tick to ensure UI is stable
      queueMicrotask(() => {
        action();
      });
    }
    wasConnected.current = isConnected;
  }, [isConnected]);

  const setPendingAction = useCallback((action: () => void) => {
    pendingAction = action;
    hasExecuted.current = false;
  }, []);

  const clearPendingAction = useCallback(() => {
    pendingAction = null;
    hasExecuted.current = false;
  }, []);

  const hasPendingAction = useCallback(() => {
    return pendingAction !== null;
  }, []);

  return {
    setPendingAction,
    clearPendingAction,
    hasPendingAction,
  };
}
