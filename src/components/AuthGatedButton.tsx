import { forwardRef, useCallback, ComponentPropsWithoutRef } from 'react';
import { Button } from './ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useAccount, useModal } from '@/hooks/useParticle';
import { usePendingOnrampAction } from '@/hooks/usePendingOnrampAction';
import { logAuthDiagnostics } from '@/lib/authDiagnostics';

interface AuthGatedButtonProps extends ComponentPropsWithoutRef<typeof Button> {
  onClick?: () => void;
}

/**
 * Wallet-first gate. The Supabase session is minted automatically by
 * `useSupabaseSession` after the Particle wallet connects (via the
 * `particle-session` edge function). So this button only needs to ensure
 * the wallet is connected — the session will follow shortly after.
 */
export const AuthGatedButton = forwardRef<HTMLButtonElement, AuthGatedButtonProps>(
  ({ onClick, children, disabled, ...props }, ref) => {
    const { session } = useAuth();
    const { isConnected } = useAccount();
    const { setOpen } = useModal();
    const { setPendingAction } = usePendingOnrampAction();

    const handleClick = useCallback(async () => {
      await logAuthDiagnostics('AuthGatedButton.click', {
        hasSupabaseSession: !!session,
        walletConnected: isConnected,
      });

      // Wallet connected — proceed. Session may still be hydrating, but the
      // ramp components themselves wait for `hasSession` before calling APIs.
      if (isConnected) {
        onClick?.();
        return;
      }

      // No wallet → open Particle modal and replay onClick after connect.
      if (onClick) setPendingAction(onClick);
      setOpen(true);
    }, [session, isConnected, onClick, setOpen, setPendingAction]);

    return (
      <Button ref={ref} onClick={handleClick} disabled={disabled} {...props}>
        {children}
      </Button>
    );
  }
);

AuthGatedButton.displayName = 'AuthGatedButton';

