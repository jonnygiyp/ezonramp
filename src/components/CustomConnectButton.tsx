import { useAccount, useModal, useDisconnect } from '@/hooks/useParticle';
import { User, Wallet, LogOut, ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import AccountModal from './AccountModal';

const CustomConnectButton = () => {
  const { isConnected, address, isConnecting } = useAccount();
  const { setOpen } = useModal();
  const { disconnect } = useDisconnect();
  const [isInitializing, setIsInitializing] = useState(true);
  const [accountModalOpen, setAccountModalOpen] = useState(false);

  // Give Particle SDK time to check for existing session
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsInitializing(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  const handleDisconnect = () => {
    disconnect();
  };

  const truncateAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  // Show loading state while checking for existing session
  if (isInitializing || isConnecting) {
    return (
      <Button variant="outline" disabled className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">Checking session...</span>
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
