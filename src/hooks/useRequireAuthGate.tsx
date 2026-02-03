import { useState, useCallback, useRef, useEffect } from 'react';
import { useAccount } from '@/hooks/useParticle';

interface UseRequireAuthGateReturn {
  isModalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  /** Wraps an action - if not authenticated, opens modal and queues action for after auth */
  requireAuth: (action: () => void) => void;
  /** Clear any pending action */
  clearPendingAction: () => void;
}

export function useRequireAuthGate(): UseRequireAuthGateReturn {
  const { isConnected } = useAccount();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);
  const wasConnectedRef = useRef(isConnected);

  // When user becomes connected while modal is open, execute pending action
  useEffect(() => {
    if (isConnected && !wasConnectedRef.current && pendingActionRef.current) {
      // User just authenticated, execute the pending action
      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      setIsModalOpen(false);
      // Small delay to ensure modal closes smoothly before action runs
      setTimeout(() => {
        action();
      }, 100);
    }
    wasConnectedRef.current = isConnected;
  }, [isConnected]);

  const openModal = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    pendingActionRef.current = null;
  }, []);

  const requireAuth = useCallback((action: () => void) => {
    if (isConnected) {
      // Already authenticated, run immediately
      action();
    } else {
      // Not authenticated, store action and open modal
      pendingActionRef.current = action;
      setIsModalOpen(true);
    }
  }, [isConnected]);

  const clearPendingAction = useCallback(() => {
    pendingActionRef.current = null;
  }, []);

  return {
    isModalOpen,
    openModal,
    closeModal,
    requireAuth,
    clearPendingAction,
  };
}
