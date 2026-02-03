import { useEffect, useCallback, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useModal, useAccount } from '@/hooks/useParticle';

interface RequireAuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RequireAuthModal({ open, onOpenChange }: RequireAuthModalProps) {
  const { setOpen: setParticleModalOpen } = useModal();
  const { isConnected } = useAccount();
  const [hasTriggeredParticle, setHasTriggeredParticle] = useState(false);

  // Trigger Particle modal when this modal opens
  useEffect(() => {
    if (open && !hasTriggeredParticle) {
      // Small delay to ensure our modal is visible first
      const timer = setTimeout(() => {
        setParticleModalOpen(true);
        setHasTriggeredParticle(true);
      }, 150);
      return () => clearTimeout(timer);
    }
    if (!open) {
      setHasTriggeredParticle(false);
    }
  }, [open, hasTriggeredParticle, setParticleModalOpen]);

  // Auto-close when user becomes connected
  useEffect(() => {
    if (open && isConnected) {
      onOpenChange(false);
    }
  }, [open, isConnected, onOpenChange]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto animate-in fade-in-0 zoom-in-[0.98] duration-200">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            Sign in required
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            You must sign up or sign in to use the onramp
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col items-center justify-center py-6 space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            Please complete sign in using the Particle popup to continue.
          </p>
          <button
            onClick={() => setParticleModalOpen(true)}
            className="text-sm text-primary hover:underline"
          >
            Open sign in again
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
