interface NavigationProps {
  activeSection: string;
  onNavigate: (section: string) => void;
}

const Navigation = ({ activeSection, onNavigate }: NavigationProps) => {
  const navItems = ["HOME", "ABOUT", "FAQ", "CONTACT"];

  return (
    <nav className="border-b border-border">
      <div className="container mx-auto px-6 pt-6 pb-2">
        <div className="flex gap-8 justify-center">
          {navItems.map((item) => (
            <button
              key={item}
              data-tutorial={`nav-${item.toLowerCase()}`}
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
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
