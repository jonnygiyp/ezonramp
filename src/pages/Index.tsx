import { useState } from "react";
import Header from "@/components/Header";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import About from "@/components/About";
import FAQ from "@/components/FAQ";
import Contact from "@/components/Contact";
import ApiIntegration from "@/components/ApiIntegration";
import { OnboardingTutorial } from "@/components/OnboardingTutorial";

const Index = () => {
  const [activeSection, setActiveSection] = useState("home");
  const [isAnimating, setIsAnimating] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState("coinbase");

  // Configure your API integrations here
  const apiConfigs = [
    {
      id: "coinbase",
      name: "Coinbase Onramp",
      appId: "95ad3c47-1682-4b32-894f-46acf29c3778",
    },
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
        return <About onNavigate={handleNavigate} />;
      case "faq":
        return <FAQ onNavigate={handleNavigate} />;
      case "contact":
        return <Contact onNavigate={handleNavigate} />;
      default:
        return <ApiIntegration apis={apiConfigs} onProviderChange={setSelectedProvider} />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col pt-[140px]">
      <Header onNavigate={handleNavigate} />
      <Navigation activeSection={activeSection} onNavigate={handleNavigate} />
      
      <main className="flex-1">
        <div
          key={activeSection}
          className={isAnimating ? "slide-in-right" : ""}
        >
          {renderContent()}
        </div>
      </main>

      <Footer />
      <OnboardingTutorial selectedProvider={selectedProvider} />
    </div>
  );
};

export default Index;
