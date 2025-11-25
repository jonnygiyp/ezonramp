import { useState } from "react";
import Header from "@/components/Header";
import About from "@/components/About";
import FAQ from "@/components/FAQ";
import Contact from "@/components/Contact";
import ApiIntegration from "@/components/ApiIntegration";

const Index = () => {
  const [activeSection, setActiveSection] = useState("home");
  const [isAnimating, setIsAnimating] = useState(false);

  // Configure your API integrations here
  const apiConfigs = [
    {
      id: "coinbase",
      name: "Coinbase Onramp",
      embedUrl: "https://pay.coinbase.com/buy/select-asset", // Replace with actual Coinbase onramp URL
    },
    // Add more APIs as needed:
    // {
    //   id: "another-provider",
    //   name: "Another Provider",
    //   embedUrl: "https://example.com/onramp",
    // },
  ];

  const handleNavigate = (section: string) => {
    if (section === activeSection || isAnimating) return;

    setIsAnimating(true);
    setActiveSection(section);

    // Reset animation state after transition
    setTimeout(() => {
      setIsAnimating(false);
    }, 400);
  };

  const renderContent = () => {
    switch (activeSection) {
      case "about":
        return <About />;
      case "faq":
        return <FAQ />;
      case "contact":
        return <Contact />;
      default:
        return <ApiIntegration apis={apiConfigs} />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header activeSection={activeSection} onNavigate={handleNavigate} />
      
      <main className="flex-1">
        <div
          key={activeSection}
          className={isAnimating ? "slide-in-right" : ""}
        >
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default Index;
