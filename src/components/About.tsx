import { ArrowLeft } from "lucide-react";

interface AboutProps {
  onNavigate: (section: string) => void;
}

const About = ({ onNavigate }: AboutProps) => {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <button
        onClick={() => onNavigate("home")}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8"
      >
        <ArrowLeft className="h-4 w-4" />
        <span className="text-sm">Back to Onramp</span>
      </button>
      <h1 className="text-4xl font-semibold mb-8">About Us</h1>
      <div className="space-y-4 text-muted-foreground leading-relaxed">
        <p>
          <a 
            href="https://EZOnRamp.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            EZOnRamp.com
          </a>{" "}
          was created for people who want to buy crypto or stablecoins for the first time, but have no clue where to get started.
        </p>
        <p>
          Our mission is to bridge the gap between traditional finance and the
          digital economy, offering a seamless experience that puts security and
          simplicity first.
        </p>
        <p>
          Whether you're new to cryptocurrency or an experienced user, our platform
          is designed to meet your needs with minimal friction and maximum clarity.
        </p>
      </div>
    </div>
  );
};

export default About;
