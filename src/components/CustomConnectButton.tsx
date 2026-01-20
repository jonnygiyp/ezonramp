import { useAccount, useModal, useDisconnect } from '@/hooks/useParticle';
import { User, Wallet, LogOut, ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect, useRef } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import AccountModal from './AccountModal';
import { useAuth } from '@/hooks/useAuth';

const CustomConnectButton = () => {
  const { isConnected, address, isConnecting } = useAccount();
  const { setOpen } = useModal();
  const { disconnect } = useDisconnect();
  const { syncWalletAuth, session, signOut } = useAuth();
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSyncingAuth, setIsSyncingAuth] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const syncAttempted = useRef(false);

  // Give Particle SDK time to check for existing session
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsInitializing(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  // Sync wallet authentication with Supabase when wallet connects
  useEffect(() => {
    const syncAuth = async () => {
      // Only sync if connected with address, not already syncing, and haven't attempted yet
      if (!isConnected || !address || isSyncingAuth || syncAttempted.current) {
        return;
      }
      
      // If already have a session, check if it matches this wallet
      if (session) {
        const walletEmail = `${address.toLowerCase()}@wallet.ezonramp.local`;
        if (session.user?.email === walletEmail) {
          console.log('[CustomConnectButton] Already have matching session');
          return;
        }
      }
      
      syncAttempted.current = true;
      setIsSyncingAuth(true);
      console.log('[CustomConnectButton] Syncing wallet auth for:', address.slice(0, 8));
      
      try {
        const success = await syncWalletAuth(address);
        if (success) {
          console.log('[CustomConnectButton] Wallet auth synced successfully');
        } else {
          console.warn('[CustomConnectButton] Wallet auth sync failed');
        }
      } catch (err) {
        console.error('[CustomConnectButton] Wallet auth sync error:', err);
      } finally {
        setIsSyncingAuth(false);
      }
    };
    
    syncAuth();
  }, [isConnected, address, session, syncWalletAuth, isSyncingAuth]);

  // Reset sync flag when wallet disconnects
  useEffect(() => {
    if (!isConnected) {
      syncAttempted.current = false;
    }
  }, [isConnected]);

  const handleDisconnect = async () => {
    // Sign out of Supabase when disconnecting wallet
    await signOut();
    disconnect();
    syncAttempted.current = false;
  };

  const truncateAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  // Show loading state while checking for existing session or syncing auth
  if (isInitializing || isConnecting || isSyncingAuth) {
    return (
      <Button variant="outline" disabled className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">
          {isSyncingAuth ? 'Authenticating...' : 'Checking session...'}
        </span>
      </Button>
    );
  }

  if (isConnected && address) {
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="flex items-center gap-1 md:gap-2 px-2 md:px-4">
              <User className="h-3 w-3 md:h-4 md:w-4" />
              <span className="text-xs md:text-sm">My Account</span>
              <ChevronDown className="h-2 w-2 md:h-3 md:w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setAccountModalOpen(true)}>
              <Wallet className="mr-2 h-4 w-4" />
              Wallet
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDisconnect}>
              <LogOut className="mr-2 h-4 w-4" />
              Disconnect
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <AccountModal open={accountModalOpen} onOpenChange={setAccountModalOpen} />
      </>
    );
  }

  return (
    <div className="flex gap-1 md:gap-2" data-tutorial="particle-connect">
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="px-2 md:px-4 py-1 md:py-2 text-xs md:text-sm h-auto"
      >
        Sign In
      </Button>
      <Button
        variant="default"
        onClick={() => setOpen(true)}
        className="px-2 md:px-4 py-1 md:py-2 text-xs md:text-sm h-auto"
      >
        Sign Up
      </Button>
    </div>
  );
};

export default CustomConnectButton;
