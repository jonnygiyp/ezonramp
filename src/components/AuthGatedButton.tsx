import { forwardRef, useState, useCallback, ComponentPropsWithoutRef } from 'react';
import { Button } from './ui/button';
import { useAccount, useModal } from '@/hooks/useParticle';
import { usePendingOnrampAction } from '@/hooks/usePendingOnrampAction';

interface AuthGatedButtonProps extends ComponentPropsWithoutRef<typeof Button> {
  onClick?: () => void;
}

/**
 * A Button wrapper that gates click actions behind Particle authentication.
 * If user is not authenticated, opens Particle auth modal directly (no intermediate modal).
 * After successful auth, the original click action is automatically executed.
 */
export const AuthGatedButton = forwardRef<HTMLButtonElement, AuthGatedButtonProps>(
  ({ onClick, children, disabled, ...props }, ref) => {
    const { isConnected } = useAccount();
    const { setOpen } = useModal();
    const { setPendingAction } = usePendingOnrampAction();
    const [authError, setAuthError] = useState<string | null>(null);

    const handleClick = useCallback(() => {
      // Clear any previous error
      setAuthError(null);

      // If already authenticated, just run the action
      if (isConnected) {
        onClick?.();
        return;
      }

      // Not authenticated - store pending action and open Particle auth directly
      try {
        if (onClick) {
          setPendingAction(onClick);
        }
        setOpen(true);
      } catch (err) {
        console.error('[AuthGatedButton] Failed to open Particle auth:', err);
        setAuthError('You must be signed in to make a purchase.');
      }
    }, [isConnected, onClick, setOpen, setPendingAction]);

    return (
      <>
        <Button
          ref={ref}
          onClick={handleClick}
          disabled={disabled}
          {...props}
        >
          {children}
        </Button>
        {authError && (
          <p className="text-sm text-destructive mt-2">{authError}</p>
        )}
      </>
    );
  }
);

AuthGatedButton.displayName = 'AuthGatedButton';
