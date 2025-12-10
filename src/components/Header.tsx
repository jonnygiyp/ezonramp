import { Link } from "react-router-dom";
import logo from "@/assets/logo.png";
import CustomConnectButton from './CustomConnectButton';
import { useAuth } from "@/hooks/useAuth";
import { Settings } from "lucide-react";

interface HeaderProps {
  onNavigate: (section: string) => void;
}

const Header = ({ onNavigate }: HeaderProps) => {
  const { isAdmin } = useAuth();

  return (
    <header className="border-b border-border">
      <div className="container mx-auto px-6 py-6">
        <div className="flex items-center justify-between">
          <button
            onClick={() => onNavigate("home")}
            className="flex items-center gap-3 transition-opacity hover:opacity-70"
          >
            <img src={logo} alt="EZ Logo" className="h-12 w-auto" />
            <span className="text-2xl font-semibold">EZOnRamp</span>
          </button>
          
          <div className="flex items-center gap-4">
            {isAdmin && (
              <Link
                to="/admin"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Settings className="h-4 w-4" />
                Admin
              </Link>
            )}
            <CustomConnectButton />
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
