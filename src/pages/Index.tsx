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

  const showBackButton = activeSection === "about" || activeSection === "faq" || activeSection === "contact";

  return (
    <div className="min-h-screen flex flex-col pt-[96px] pb-16">
      <Header onNavigate={handleNavigate} />
      <Navigation activeSection={activeSection} onNavigate={handleNavigate} />
      
      <main className="flex-1">
        {/* Static back button for sub-pages */}
        {showBackButton && (
          <div className="w-full max-w-2xl mx-auto px-6 pt-4 md:pt-6">
            <button
              onClick={() => handleNavigate("home")}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground/70 hover:text-primary transition-colors group"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="group-hover:-translate-x-0.5 transition-transform"
              >
                <path d="m12 19-7-7 7-7" />
                <path d="M19 12H5" />
              </svg>
              <span>Back to Onramp</span>
            </button>
          </div>
        )}
        
        <div
          key={activeSection}
          className={isAnimating ? "slide-in-right" : ""}
        >
          {renderContent()}
        </div>
      </main>

      <Footer />
      {activeSection === "home" && <OnboardingTutorial selectedProvider={selectedProvider} />}
    </div>
  );
};

export default Index;
