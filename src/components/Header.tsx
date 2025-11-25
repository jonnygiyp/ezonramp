import logo from "@/assets/logo.png";

interface HeaderProps {
  onNavigate: (section: string) => void;
}

const Header = ({ onNavigate }: HeaderProps) => {
  return (
    <header className="border-b border-border">
      <div className="container mx-auto px-6 py-6">
        <button
          onClick={() => onNavigate("home")}
          className="flex items-center gap-3 transition-opacity hover:opacity-70 mx-auto w-fit"
        >
          <img src={logo} alt="EZ Logo" className="h-12 w-auto" />
          <span className="text-2xl font-semibold">EZOnRamp</span>
        </button>
      </div>
    </header>
  );
};

export default Header;
