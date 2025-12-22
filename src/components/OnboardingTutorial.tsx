import { useState, useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TutorialStep {
  target: string;
  title: string;
  description: string;
  position: "top" | "bottom" | "left" | "right";
}

const tutorialSteps: TutorialStep[] = [
  {
    target: "[data-tutorial='particle-connect']",
    title: "Create Your Wallet",
    description: "Sign up for a free wallet through Particle Network to get started!",
    position: "bottom",
  },
  {
    target: "[data-tutorial='provider-tabs']",
    title: "Select An Onramp",
    description: "Select an onramp to buy crypto. Each has different features, processing times and fees.",
    position: "bottom",
  },
  {
    target: "[data-tutorial='wallet-input']",
    title: "Wallet Address",
    description: "Paste your Solana wallet address where you want to receive the crypto.",
    position: "top",
  },
  {
    target: "[data-tutorial='amount-input']",
    title: "Enter Amount",
    description: "Type the amount you want to spend in USD to purchase crypto.",
    position: "top",
  },
];

const STORAGE_KEY = "onboarding_completed";

export function OnboardingTutorial() {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [showHelpButton, setShowHelpButton] = useState(true);

  const currentTutorialStep = tutorialSteps[currentStep];

  const updateTargetPosition = useCallback(() => {
    if (!isActive || !currentTutorialStep) return;

    const element = document.querySelector(currentTutorialStep.target);
    if (element) {
      const rect = element.getBoundingClientRect();
      setTargetRect(rect);
    } else {
      setTargetRect(null);
    }
  }, [isActive, currentTutorialStep]);

  useEffect(() => {
    const hasCompleted = localStorage.getItem(STORAGE_KEY);
    if (!hasCompleted) {
      // Small delay to let the page render
      setTimeout(() => {
        setIsActive(true);
      }, 500);
    }
  }, []);

  useEffect(() => {
    updateTargetPosition();
    window.addEventListener("resize", updateTargetPosition);
    window.addEventListener("scroll", updateTargetPosition);

    return () => {
      window.removeEventListener("resize", updateTargetPosition);
      window.removeEventListener("scroll", updateTargetPosition);
    };
  }, [updateTargetPosition]);

  const handleNext = () => {
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleComplete = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setIsActive(false);
    setCurrentStep(0);
  };

  const handleSkip = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setIsActive(false);
  };

  const startTutorial = () => {
    setCurrentStep(0);
    setIsActive(true);
  };

  const getTooltipPosition = () => {
    if (!targetRect) return { top: "50%", left: "50%" };

    const padding = 16;
    const tooltipWidth = 320;
    const tooltipHeight = 160;

    switch (currentTutorialStep.position) {
      case "bottom":
        return {
          top: `${targetRect.bottom + padding}px`,
          left: `${Math.max(padding, Math.min(targetRect.left + targetRect.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - padding))}px`,
        };
      case "top":
        return {
          top: `${targetRect.top - tooltipHeight - padding}px`,
          left: `${Math.max(padding, Math.min(targetRect.left + targetRect.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - padding))}px`,
        };
      case "left":
        return {
          top: `${targetRect.top + targetRect.height / 2 - tooltipHeight / 2}px`,
          left: `${targetRect.left - tooltipWidth - padding}px`,
        };
      case "right":
        return {
          top: `${targetRect.top + targetRect.height / 2 - tooltipHeight / 2}px`,
          left: `${targetRect.right + padding}px`,
        };
      default:
        return { top: "50%", left: "50%" };
    }
  };

  const getArrowStyle = () => {
    if (!targetRect) return {};

    const arrowSize = 12;

    switch (currentTutorialStep.position) {
      case "bottom":
        return {
          top: `-${arrowSize}px`,
          left: `${Math.min(Math.max(targetRect.left + targetRect.width / 2 - parseInt(getTooltipPosition().left) - arrowSize / 2, 20), 280)}px`,
          borderLeft: `${arrowSize}px solid transparent`,
          borderRight: `${arrowSize}px solid transparent`,
          borderBottom: `${arrowSize}px solid hsl(var(--card))`,
        };
      case "top":
        return {
          bottom: `-${arrowSize}px`,
          left: `${Math.min(Math.max(targetRect.left + targetRect.width / 2 - parseInt(getTooltipPosition().left) - arrowSize / 2, 20), 280)}px`,
          borderLeft: `${arrowSize}px solid transparent`,
          borderRight: `${arrowSize}px solid transparent`,
          borderTop: `${arrowSize}px solid hsl(var(--card))`,
        };
      case "left":
        return {
          right: `-${arrowSize}px`,
          top: "50%",
          transform: "translateY(-50%)",
          borderTop: `${arrowSize}px solid transparent`,
          borderBottom: `${arrowSize}px solid transparent`,
          borderLeft: `${arrowSize}px solid hsl(var(--card))`,
        };
      case "right":
        return {
          left: `-${arrowSize}px`,
          top: "50%",
          transform: "translateY(-50%)",
          borderTop: `${arrowSize}px solid transparent`,
          borderBottom: `${arrowSize}px solid transparent`,
          borderRight: `${arrowSize}px solid hsl(var(--card))`,
        };
      default:
        return {};
    }
  };

  if (!isActive && showHelpButton) {
    return (
      <Button
        onClick={startTutorial}
        variant="outline"
        size="icon"
        className="fixed bottom-4 right-4 z-50 rounded-full shadow-lg hover:shadow-xl transition-shadow"
        aria-label="Start tutorial"
      >
        <HelpCircle className="h-5 w-5" />
      </Button>
    );
  }

  if (!isActive) return null;

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-[9998] pointer-events-none">
        <svg className="w-full h-full">
          <defs>
            <mask id="spotlight-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {targetRect && (
                <rect
                  x={targetRect.left - 8}
                  y={targetRect.top - 8}
                  width={targetRect.width + 16}
                  height={targetRect.height + 16}
                  rx="8"
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="rgba(0,0,0,0.75)"
            mask="url(#spotlight-mask)"
          />
        </svg>
      </div>

      {/* Highlight ring */}
      {targetRect && (
        <div
          className="fixed z-[9999] pointer-events-none rounded-lg ring-4 ring-primary ring-offset-2 ring-offset-background animate-pulse"
          style={{
            top: targetRect.top - 8,
            left: targetRect.left - 8,
            width: targetRect.width + 16,
            height: targetRect.height + 16,
          }}
        />
      )}

      {/* Tooltip */}
      <div
        className="fixed z-[10000] w-80 bg-card border border-border rounded-xl shadow-2xl p-4"
        style={getTooltipPosition()}
      >
        {/* Arrow */}
        <div className="absolute w-0 h-0" style={getArrowStyle()} />

        {/* Close button */}
        <button
          onClick={handleSkip}
          className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close tutorial"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Content */}
        <div className="pr-6">
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {currentTutorialStep.title}
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            {currentTutorialStep.description}
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <span className="text-xs text-muted-foreground">
            {currentStep + 1} of {tutorialSteps.length}
          </span>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrevious}
              disabled={currentStep === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <Button size="sm" onClick={handleNext}>
              {currentStep === tutorialSteps.length - 1 ? "Finish" : "Next"}
              {currentStep < tutorialSteps.length - 1 && (
                <ChevronRight className="h-4 w-4 ml-1" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
