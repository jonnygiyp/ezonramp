import { useState, useEffect, useCallback, useMemo } from "react";
import { X, ChevronLeft, ChevronRight, HelpCircle, ShieldCheck, ArrowRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccount } from "@/hooks/useParticle";

interface TutorialStep {
  target: string;
  title: string;
  description: string;
  position: "top" | "bottom" | "left" | "right";
  mock?: 'verification-code' | 'verified-state' | 'global-buy-button';
}

interface OnboardingTutorialProps {
  selectedProvider?: string;
}

// Coinbase US tutorial steps
const coinbaseUSSteps: TutorialStep[] = [
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
    target: "[data-tutorial='verification-method']",
    title: "Verification Method",
    description: "If you're a first time buyer, enter US phone number or your email address for verification purposes.",
    position: "bottom",
  },
  {
    target: "[data-tutorial='wallet-input']",
    title: "Wallet Address",
    description: "Sign in to automatically populate your wallet address. Your connected wallet address will appear here once you're logged in.",
    position: "bottom",
  },
  {
    target: "[data-tutorial='send-verification']",
    title: "Send Verification Code",
    description: "Click \"Send Verification Code\" and proceed to the next step where you will enter the code you receive.",
    position: "bottom",
  },
  {
    target: "[data-tutorial='mock-verification-code']",
    title: "Enter Verification Code",
    description: "After receiving your code via SMS or email, enter it here to verify your identity.",
    position: "top",
    mock: 'verification-code',
  },
  {
    target: "[data-tutorial='mock-verified-state']",
    title: "Verified User Experience",
    description: "Once verified, you'll see your verification status and can proceed directly to purchasing. Your verification is valid for 60 days!",
    position: "top",
    mock: 'verified-state',
  },
];

// Coinbase Global tutorial steps
const coinbaseGlobalSteps: TutorialStep[] = [
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
    target: "[data-tutorial='global-amount-input']",
    title: "Enter Amount",
    description: "Enter the amount of USDC you would like to purchase.",
    position: "bottom",
  },
  {
    target: "[data-tutorial='global-wallet-input']",
    title: "Receiving Wallet Address",
    description: "Sign in to automatically populate your wallet address. Your connected wallet address will appear here once you're logged in.",
    position: "bottom",
  },
  {
    target: "[data-tutorial='mock-global-buy-button']",
    title: "Complete Purchase",
    description: "Clicking this button will open Coinbase in a new window so you can complete your purchase. You may be required to verify your identity to purchase. Once complete, your funds will be available in the wallet you provided in the previous step.",
    position: "bottom",
    mock: 'global-buy-button',
  },
];

// Stripe tutorial steps
const stripeSteps: TutorialStep[] = [
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
    target: "[data-tutorial='stripe-wallet-input']",
    title: "Receiving Wallet Address",
    description: "Sign in to automatically populate your wallet address. Your connected Solana wallet address will appear here once you're logged in.",
    position: "bottom",
  },
  {
    target: "[data-tutorial='stripe-buy-button']",
    title: "Complete Your Purchase With Stripe",
    description: "Follow the instructions for verification and then enter your payment information to complete your purchase with Stripe.",
    position: "bottom",
  },
];

// MoonPay tutorial steps
const moonpaySteps: TutorialStep[] = [
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
    target: "[data-tutorial='moonpay-wallet-input']",
    title: "Receiving Wallet Address",
    description: "Sign in to automatically populate your wallet address. Your connected Solana wallet address will appear here once you're logged in.",
    position: "top",
  },
  {
    target: "[data-tutorial='moonpay-amount-input']",
    title: "Enter Amount",
    description: "Enter the amount in USD that you would like to spend on crypto.",
    position: "top",
  },
  {
    target: "[data-tutorial='moonpay-buy-button']",
    title: "Complete Your Purchase With MoonPay",
    description: "Click the button to open the MoonPay widget where you can complete your purchase with credit card, debit card, or bank transfer.",
    position: "top",
  },
];

const STORAGE_KEY = "onboarding_completed";
const FIRST_VISIT_KEY = "tutorial_first_visit";

// Mock component for verification code entry
function MockVerificationCode() {
  return (
    <div 
      data-tutorial="mock-verification-code"
      className="fixed bottom-32 left-1/2 -translate-x-1/2 z-[9997] w-[90%] max-w-md bg-card border border-border rounded-xl p-6 shadow-2xl"
    >
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold">Enter Verification Code</h2>
          <p className="text-sm text-muted-foreground">
            We sent a code to (415) 555-1234
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="mock-code">Verification Code</Label>
          <Input
            id="mock-code"
            type="text"
            placeholder="Enter 6-digit code"
            value="123456"
            readOnly
            className="text-center text-lg tracking-widest font-mono"
          />
        </div>

        <Button size="lg" className="w-full" disabled>
          Verify Code
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Didn't receive a code? <span className="text-primary">Resend</span>
        </p>
      </div>
    </div>
  );
}

// Mock component for verified user state
function MockVerifiedState() {
  return (
    <div 
      data-tutorial="mock-verified-state"
      className="fixed bottom-32 left-1/2 -translate-x-1/2 z-[9997] w-[90%] max-w-md bg-card border border-border rounded-xl p-6 shadow-2xl"
    >
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold">Ready to Purchase</h2>
          <p className="text-sm text-muted-foreground">
            Your identity is verified. You can now buy crypto!
          </p>
        </div>

        {/* Verified badge */}
        <div className="flex items-center justify-center gap-3 p-4 bg-primary/10 border border-primary/20 rounded-lg">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <div className="text-left">
            <p className="font-medium text-sm">Verified Account</p>
            <p className="text-xs text-muted-foreground">+1 (415) 555-1234 • 59 days remaining</p>
          </div>
        </div>

        {/* Amount input preview */}
        <div className="space-y-2">
          <Label>Purchase Amount (USD)</Label>
          <Input
            type="text"
            value="$100.00"
            readOnly
            className="text-lg font-semibold"
          />
        </div>

        <Button size="lg" className="w-full" disabled>
          Get Quote
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// Mock component for global buy button
function MockGlobalBuyButton() {
  return (
    <div 
      data-tutorial="mock-global-buy-button"
      className="fixed bottom-32 left-1/2 -translate-x-1/2 z-[9997] w-[90%] max-w-md bg-card border border-border rounded-xl p-6 shadow-2xl"
    >
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold">Ready to Purchase</h2>
          <p className="text-sm text-muted-foreground">
            Click the button below to open Coinbase and complete your purchase.
          </p>
        </div>

        <Button size="lg" className="w-full" disabled>
          Buy USDC with Coinbase
          <ExternalLink className="ml-2 h-4 w-4" />
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          A Coinbase window will open to complete your purchase.
        </p>
      </div>
    </div>
  );
}

export function OnboardingTutorial({ selectedProvider = 'coinbase' }: OnboardingTutorialProps) {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [showHelpButton, setShowHelpButton] = useState(true);
  const [isFirstVisit, setIsFirstVisit] = useState(false);
  
  const { isConnected } = useAccount();
  
  // Check if this is the user's first visit
  useEffect(() => {
    const hasVisited = localStorage.getItem(FIRST_VISIT_KEY);
    if (!hasVisited) {
      setIsFirstVisit(true);
      localStorage.setItem(FIRST_VISIT_KEY, "true");
    }
  }, []);
  
  // Get the appropriate tutorial steps based on selected provider
  const baseTutorialSteps = useMemo(() => {
    if (selectedProvider === 'coinbase_global') {
      return coinbaseGlobalSteps;
    }
    if (selectedProvider === 'stripe') {
      return stripeSteps;
    }
    if (selectedProvider === 'moonpay') {
      return moonpaySteps;
    }
    return coinbaseUSSteps;
  }, [selectedProvider]);
  
  // Filter out step 1 (wallet creation) if user is already connected
  const activeSteps = useMemo(() => {
    if (isConnected) {
      return baseTutorialSteps.slice(1); // Skip first step
    }
    return baseTutorialSteps;
  }, [isConnected, baseTutorialSteps]);

  const currentTutorialStep = activeSteps[currentStep];
  const currentMock = currentTutorialStep?.mock;

  const updateTargetPosition = useCallback(() => {
    if (!isActive || !currentTutorialStep) return;

    // Small delay to let mock components render
    setTimeout(() => {
      const element = document.querySelector(currentTutorialStep.target);
      if (element) {
        const rect = element.getBoundingClientRect();
        setTargetRect(rect);
      } else {
        setTargetRect(null);
      }
    }, 50);
  }, [isActive, currentTutorialStep]);


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
    if (currentStep < activeSteps.length - 1) {
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
    // For "top" position, use auto positioning with bottom anchor instead of calculating top
    // This ensures the tooltip appears above the element regardless of its height

    switch (currentTutorialStep.position) {
      case "bottom":
        return {
          top: `${targetRect.bottom + padding}px`,
          left: `${Math.max(padding, Math.min(targetRect.left + targetRect.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - padding))}px`,
        };
      case "top":
        // Position using bottom anchor - tooltip will appear above the target
        return {
          bottom: `${window.innerHeight - targetRect.top + padding}px`,
          left: `${Math.max(padding, Math.min(targetRect.left + targetRect.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - padding))}px`,
        };
      case "left":
        return {
          top: `${targetRect.top + targetRect.height / 2}px`,
          transform: "translateY(-50%)",
          left: `${targetRect.left - tooltipWidth - padding}px`,
        };
      case "right":
        return {
          top: `${targetRect.top + targetRect.height / 2}px`,
          transform: "translateY(-50%)",
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
          bottom: `-12px`,
          left: `${Math.min(Math.max(targetRect.left + targetRect.width / 2 - parseInt(getTooltipPosition().left || "0") - 6, 20), 280)}px`,
          borderLeft: `12px solid transparent`,
          borderRight: `12px solid transparent`,
          borderTop: `12px solid hsl(var(--card))`,
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
        className={`fixed bottom-16 right-4 z-50 rounded-full shadow-lg hover:shadow-xl transition-shadow h-[45px] w-[45px] p-0 ${
          isFirstVisit ? "animate-pulse ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
        }`}
        aria-label="Start tutorial"
      >
        <span
          aria-hidden="true"
          className="text-primary font-semibold leading-none select-none"
          style={{ fontSize: 38, lineHeight: 1 }}
        >
          ?
        </span>
      </Button>
    );
  }

  if (!isActive) return null;

  return (
    <>
      {/* Mock displays for tutorial steps */}
      {currentMock === 'verification-code' && <MockVerificationCode />}
      {currentMock === 'verified-state' && <MockVerifiedState />}
      {currentMock === 'global-buy-button' && <MockGlobalBuyButton />}

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
            {currentStep + 1} of {activeSteps.length}
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
              {currentStep === activeSteps.length - 1 ? "Finish" : "Next"}
              {currentStep < activeSteps.length - 1 && (
                <ChevronRight className="h-4 w-4 ml-1" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}