import { forwardRef, useCallback, ComponentPropsWithoutRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from './ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useAccount, useModal } from '@/hooks/useParticle';
import { usePendingOnrampAction } from '@/hooks/usePendingOnrampAction';
import { logAuthDiagnostics } from '@/lib/authDiagnostics';

interface AuthGatedButtonProps extends ComponentPropsWithoutRef<typeof Button> {
  onClick?: () => void;
}

/**
 * Button wrapper that ensures BOTH a Supabase session and a connected Particle
 * wallet exist before invoking onClick.
 *
 * - Missing Supabase session → route to /auth (anonymous sign-ins are disabled).
 * - Missing wallet only → open Particle modal and replay onClick post-connect.
 */
export const AuthGatedButton = forwardRef<HTMLButtonElement, AuthGatedButtonProps>(
  ({ onClick, children, disabled, ...props }, ref) => {
    const { session, loading: authLoading } = useAuth();
    const { isConnected } = useAccount();
    const { setOpen } = useModal();
    const { setPendingAction } = usePendingOnrampAction();
    const navigate = useNavigate();
    const location = useLocation();

    const handleClick = useCallback(async () => {
      await logAuthDiagnostics('AuthGatedButton.click', {
        authLoading,
        hasSupabaseSession: !!session,
        walletConnected: isConnected,
      });

      // Both prerequisites satisfied — run the action.
      if (session && isConnected) {
        onClick?.();
        return;
      }

      // No Supabase session → must sign in via Supabase (email/Google),
      // anonymous sign-ins are disabled at the project level.
      if (!session) {
        const next = encodeURIComponent(location.pathname + location.search + location.hash);
        navigate(`/auth?next=${next}`);
        return;
      }

      // Has Supabase session but no wallet → open Particle modal,
      // queue onClick for after connect.
      if (onClick) setPendingAction(onClick);
      setOpen(true);
    }, [session, authLoading, isConnected, onClick, navigate, location, setOpen, setPendingAction]);

    return (
      <Button ref={ref} onClick={handleClick} disabled={disabled} {...props}>
        {children}
      </Button>
    );
  }
);

AuthGatedButton.displayName = 'AuthGatedButton';
