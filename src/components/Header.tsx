import logo from "@/assets/logo.png";

interface HeaderProps {
  activeSection: string;
  onNavigate: (section: string) => void;
}

const Header = ({ activeSection, onNavigate }: HeaderProps) => {
  const navItems = ["ABOUT", "FAQ", "CONTACT"];

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
          
          <nav className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-8">
            {navItems.map((item) => (
              <button
                key={item}
                onClick={() => onNavigate(item.toLowerCase())}
                className={`text-sm font-medium tracking-wide transition-colors ${
                  activeSection === item.toLowerCase()
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item}
              </button>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Header;
