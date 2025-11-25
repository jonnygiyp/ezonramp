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
        <div className="grid grid-cols-3 items-center">
          <button
            onClick={() => onNavigate("home")}
            className="flex items-center gap-3 transition-opacity hover:opacity-70 justify-self-start"
          >
            <img src={logo} alt="EZ Logo" className="h-12 w-auto" />
            <span className="text-2xl font-semibold">EZOnRamp</span>
          </button>
          
          <nav className="flex gap-8 justify-self-center">
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
          
          <div className="justify-self-end"></div>
        </div>
      </div>
    </header>
  );
};

export default Header;
