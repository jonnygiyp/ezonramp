interface NavigationProps {
  activeSection: string;
  onNavigate: (section: string) => void;
}

const Navigation = ({ activeSection, onNavigate }: NavigationProps) => {
  const navItems = ["HOME", "ABOUT", "FAQ", "CONTACT"];

  return (
    <nav className="fixed top-[64px] left-0 right-0 z-40 bg-background border-b border-border">
      <div className="container mx-auto px-6 py-2">
        <div className="flex gap-8 justify-center items-center">
          {navItems.map((item) => (
            <button
              key={item}
              data-tutorial={`nav-${item.toLowerCase()}`}
              onClick={() => onNavigate(item.toLowerCase())}
              className={`text-sm font-medium tracking-wide transition-colors leading-none ${
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
