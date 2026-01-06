import { useAccount, useModal, useDisconnect } from '@particle-network/connectkit';
import { User, LogOut, ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const CustomConnectButton = () => {
  const { isConnected, address, isConnecting } = useAccount();
  const { setOpen } = useModal();
  const { disconnect } = useDisconnect();
  const [isInitializing, setIsInitializing] = useState(true);

  // Give Particle SDK time to check for existing session
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsInitializing(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="flex items-center gap-1 md:gap-2 px-2 md:px-4">
            <User className="h-3 w-3 md:h-4 md:w-4" />
            <span className="text-xs md:text-sm">{truncateAddress(address)}</span>
            <ChevronDown className="h-2 w-2 md:h-3 md:w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setOpen(true)}>
            <User className="mr-2 h-4 w-4" />
            Account
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => disconnect()}>
            <LogOut className="mr-2 h-4 w-4" />
            Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="flex gap-2" data-tutorial="particle-connect">
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="px-4 py-2 text-sm"
      >
        Sign In
      </Button>
      <Button
        variant="default"
        onClick={() => setOpen(true)}
        className="px-4 py-2 text-sm"
      >
        Sign Up
      </Button>
    </div>
  );
};

export default CustomConnectButton;
