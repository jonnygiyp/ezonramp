import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="fixed bottom-0 left-0 right-0 border-t border-border bg-background/95 backdrop-blur-sm z-50">
      <div className="container mx-auto px-6 py-3">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div>
            <p>&copy; {new Date().getFullYear()} EZOnRamp. All rights reserved.</p>
          </div>
          <div className="flex gap-6">
            <Link to="/terms" className="hover:text-foreground transition-colors">
              Terms of Service
            </Link>
            <Link to="/privacy" className="hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
