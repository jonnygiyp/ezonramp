import { useState } from "react";
import { Link } from "react-router-dom";
import logo from "@/assets/logo.png";
import CustomConnectButton from './CustomConnectButton';
import { useAuth } from "@/hooks/useAuth";
import { Settings, LogIn, LogOut, User, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import AuthModal from "./AuthModal";

interface HeaderProps {
  onNavigate: (section: string) => void;
}

const Header = ({ onNavigate }: HeaderProps) => {
  const { isAdmin, user, loading, signOut } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background">
        <div className="container mx-auto px-6 py-2">
          <div className="flex items-center justify-between">
            <button
              onClick={() => onNavigate("home")}
              className="flex items-center gap-3 transition-opacity hover:opacity-70"
            >
              <img src={logo} alt="EZ Logo" className="h-12 w-auto" />
              <span className="text-xl md:text-2xl font-semibold">EZOnRamp</span>
            </button>
            
            <div className="flex items-center gap-2 md:gap-4">
              {/* Supabase Auth Status */}
              {loading ? (
                <Button variant="ghost" size="sm" disabled>
                  <Loader2 className="h-4 w-4 animate-spin" />
                </Button>
              ) : user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="flex items-center gap-1">
                      <User className="h-4 w-4" />
                      <span className="hidden md:inline text-xs max-w-[120px] truncate">
                        {user.email}
                      </span>
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                      {user.email}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {isAdmin && (
                      <>
                        <DropdownMenuItem asChild>
                          <Link to="/admin" className="flex items-center gap-2">
                            <Settings className="h-4 w-4" />
                            Admin Panel
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem onClick={handleSignOut}>
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setAuthModalOpen(true)}
                  className="flex items-center gap-1"
                >
                  <LogIn className="h-4 w-4" />
                  <span className="hidden md:inline">Sign In</span>
                </Button>
              )}

              {/* Wallet Connection */}
              <CustomConnectButton />
            </div>
          </div>
        </div>
      </header>

      <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} />
    </>
  );
};

export default Header;
