import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/hooks/useParticle";
import { useIsMobile } from "@/hooks/use-mobile";

// ─── Step definition ─────────────────────────────────────────────
interface TutorialStep {
  /** CSS selector for the element to highlight */
  target: string;
  title: string;
  description: string;
  /** Preferred tooltip placement */
  position: "top" | "bottom" | "left" | "right";
  /** If true, step only shows when user is logged OUT */
  loggedOutOnly?: boolean;
  /** If true, step only shows when user is logged IN */
  loggedInOnly?: boolean;
}

interface OnboardingTutorialProps {
  selectedProvider?: string;
}

// ─── Shared steps (identical across all ramps) ──────────────────
const signInStep: TutorialStep = {
  target: "[data-tutorial='particle-connect']",
  title: "Sign In or Sign Up",
  description:
    "Create a free wallet to get started. Click Sign In if you already have an account, or Sign Up to create one.",
  position: "bottom",
  loggedOutOnly: true,
};

const providerTabsStep: TutorialStep = {
  target: "[data-tutorial='provider-tabs']",
  title: "Select an Onramp",
  description:
    "Choose how you'd like to buy crypto. Each onramp offers different payment methods, fees, and regional support.",
  position: "bottom",
};

// ─── Stripe steps ───────────────────────────────────────────────
const stripeSteps: TutorialStep[] = [
  signInStep,
  providerTabsStep,
  {
    target: "[data-tutorial='stripe-sign-in']",
    title: "Sign In to Continue",
    description:
      "You need to sign in before the Stripe checkout will load. Click the Sign In button to open the login flow.",
    position: "top",
    loggedOutOnly: true,
  },
  {
    target: "[data-tutorial='stripe-checkout']",
    title: "Stripe Checkout",
    description:
      "The Stripe checkout loads automatically once you're signed in. Enter your payment details directly in the embedded widget to complete your purchase.",
    position: "top",
    loggedInOnly: true,
  },
  {
    target: "[data-tutorial='stripe-wallet-card']",
    title: "Your Wallet Address",
    description:
      "Your connected wallet address is shown here. This is where your purchased crypto will be sent.",
    position: "top",
    loggedInOnly: true,
  },
];

// ─── Coinbase US (Headless) steps ───────────────────────────────
const coinbaseUSSteps: TutorialStep[] = [
  signInStep,
  providerTabsStep,
  {
    target: "[data-tutorial='verification-method']",
    title: "Choose Verification Method",
    description:
      "First-time buyers: enter your US phone number or email address for identity verification.",
    position: "top",
    loggedInOnly: true,
  },
  {
    target: "[data-tutorial='wallet-input']",
    title: "Wallet Address",
    description:
      "Sign in to automatically populate your wallet address. Your connected wallet will appear here once logged in.",
    position: "top",
    loggedInOnly: true,
  },
  {
    target: "[data-tutorial='send-verification']",
    title: "Send Verification Code",
    description:
      'Click "Continue" to receive a one-time code via SMS or email. Once verified, you can purchase for 60 days without re-verifying.',
    position: "top",
    loggedInOnly: true,
  },
];

// ─── Coinbase Global steps ──────────────────────────────────────
const coinbaseGlobalSteps: TutorialStep[] = [
  signInStep,
  providerTabsStep,
  {
    target: "[data-tutorial='global-amount-input']",
    title: "Enter Amount",
    description: "Enter the USD amount of USDC you would like to purchase.",
    position: "top",
  },
  {
    target: "[data-tutorial='global-wallet-input']",
    title: "Wallet Address",
    description:
      "Sign in to automatically populate your wallet address. Your connected wallet will appear here once logged in.",
    position: "top",
  },
  {
    target: "[data-tutorial='global-buy-button']",
    title: "Continue to Coinbase",
    description:
      'Click "Continue" to open Coinbase in a new window where you can complete your purchase. Identity verification may be required.',
    position: "top",
    loggedInOnly: true,
  },
];

// ─── MoonPay steps ──────────────────────────────────────────────
const moonpaySteps: TutorialStep[] = [
  signInStep,
  providerTabsStep,
  {
    target: "[data-tutorial='moonpay-wallet-input']",
    title: "Wallet Address",
    description:
      "Sign in to automatically populate your Solana wallet address.",
    position: "top",
  },
  {
    target: "[data-tutorial='moonpay-amount-input']",
    title: "Enter Amount",
    description: "Enter the USD amount you'd like to spend on crypto.",
    position: "top",
  },
  {
    target: "[data-tutorial='moonpay-buy-button']",
    title: "Buy with MoonPay",
    description:
      "Click to open the MoonPay widget where you can complete your purchase with card, debit, or bank transfer.",
    position: "top",
    loggedInOnly: true,
  },
];

// ─── Provider → steps map ───────────────────────────────────────
const STEP_MAP: Record<string, TutorialStep[]> = {
  stripe: stripeSteps,
  coinbase: coinbaseUSSteps,
  coinbase_global: coinbaseGlobalSteps,
  moonpay: moonpaySteps,
};

const STORAGE_KEY = "onboarding_completed";
const FIRST_VISIT_KEY = "tutorial_first_visit";

// ─── Main component ────────────────────────────────────────────
export function OnboardingTutorial({
  selectedProvider = "coinbase",
}: OnboardingTutorialProps) {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [showHelpButton, setShowHelpButton] = useState(true);
  const [isFirstVisit, setIsFirstVisit] = useState(false);
  const prevProviderRef = useRef(selectedProvider);

  const { isConnected } = useAccount();
  const isMobile = useIsMobile();

  // First visit glow
  useEffect(() => {
    const hasVisited = localStorage.getItem(FIRST_VISIT_KEY);
    if (!hasVisited) {
      setIsFirstVisit(true);
      localStorage.setItem(FIRST_VISIT_KEY, "true");
    }
  }, []);

  // Close walkthrough if user switches ramps while it's open
  useEffect(() => {
    if (isActive && selectedProvider !== prevProviderRef.current) {
      setIsActive(false);
      setCurrentStep(0);
    }
    prevProviderRef.current = selectedProvider;
  }, [selectedProvider, isActive]);

  // Build filtered steps based on auth state + provider
  const activeSteps = useMemo(() => {
    const base = STEP_MAP[selectedProvider] || coinbaseUSSteps;
    return base.filter((step) => {
      if (step.loggedOutOnly && isConnected) return false;
      if (step.loggedInOnly && !isConnected) return false;
      return true;
    });
  }, [selectedProvider, isConnected]);

  const currentTutorialStep = activeSteps[currentStep];

  // ─── Position tracking ──────────────────────────────────────
  const updateTargetPosition = useCallback(() => {
    if (!isActive || !currentTutorialStep) return;

    requestAnimationFrame(() => {
      const el = document.querySelector(currentTutorialStep.target);
      if (el) {
        const rect = el.getBoundingClientRect();
        // Only update if the element is visible
        if (rect.width > 0 && rect.height > 0) {
          setTargetRect(rect);
        } else {
          setTargetRect(null);
        }
      } else {
        setTargetRect(null);
      }
    });
  }, [isActive, currentTutorialStep]);

  useEffect(() => {
    updateTargetPosition();

    // Re-check after a short delay for elements that render asynchronously
    const delayTimer = setTimeout(updateTargetPosition, 200);

    window.addEventListener("resize", updateTargetPosition);
    window.addEventListener("scroll", updateTargetPosition);

    return () => {
      clearTimeout(delayTimer);
      window.removeEventListener("resize", updateTargetPosition);
      window.removeEventListener("scroll", updateTargetPosition);
    };
  }, [updateTargetPosition]);

  // ─── Navigation ─────────────────────────────────────────────
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

  // ─── Tooltip positioning ────────────────────────────────────
  const getTooltipStyle = (): React.CSSProperties => {
    const tooltipW = isMobile ? 280 : 320;
    const pad = 16;

    // Fallback: center on screen
    if (!targetRect) {
      return {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: tooltipW,
      };
    }

    const pos = currentTutorialStep?.position ?? "bottom";

    let top: number;
    let left: number;

    switch (pos) {
      case "bottom":
        top = targetRect.bottom + pad;
        left = targetRect.left + targetRect.width / 2 - tooltipW / 2;
        break;
      case "top":
        top = targetRect.top - pad - 180; // approximate tooltip height
        left = targetRect.left + targetRect.width / 2 - tooltipW / 2;
        break;
      case "left":
        top = targetRect.top + targetRect.height / 2 - 90;
        left = targetRect.left - tooltipW - pad;
        break;
      case "right":
        top = targetRect.top + targetRect.height / 2 - 90;
        left = targetRect.right + pad;
        break;
      default:
        top = targetRect.bottom + pad;
        left = targetRect.left + targetRect.width / 2 - tooltipW / 2;
    }

    // Clamp to viewport
    left = Math.max(pad, Math.min(left, window.innerWidth - tooltipW - pad));
    top = Math.max(pad, Math.min(top, window.innerHeight - 200));

    return { top, left, width: tooltipW };
  };

  // ─── Arrow style ────────────────────────────────────────────
  const getArrowStyle = (): React.CSSProperties => {
    if (!targetRect || !currentTutorialStep) return { display: "none" };

    const sz = 10;
    const pos = currentTutorialStep.position;

    switch (pos) {
      case "bottom":
        return {
          top: -sz,
          left: "50%",
          marginLeft: -sz,
          borderLeft: `${sz}px solid transparent`,
          borderRight: `${sz}px solid transparent`,
          borderBottom: `${sz}px solid hsl(var(--card))`,
        };
      case "top":
        return {
          bottom: -sz,
          left: "50%",
          marginLeft: -sz,
          borderLeft: `${sz}px solid transparent`,
          borderRight: `${sz}px solid transparent`,
          borderTop: `${sz}px solid hsl(var(--card))`,
        };
      case "left":
        return {
          right: -sz,
          top: "50%",
          marginTop: -sz,
          borderTop: `${sz}px solid transparent`,
          borderBottom: `${sz}px solid transparent`,
          borderLeft: `${sz}px solid hsl(var(--card))`,
        };
      case "right":
        return {
          left: -sz,
          top: "50%",
          marginTop: -sz,
          borderTop: `${sz}px solid transparent`,
          borderBottom: `${sz}px solid transparent`,
          borderRight: `${sz}px solid hsl(var(--card))`,
        };
      default:
        return { display: "none" };
    }
  };

  // ─── Help button (inactive state) ──────────────────────────
  if (!isActive && showHelpButton) {
    return (
      <Button
        onClick={startTutorial}
        variant="outline"
        className={`fixed bottom-16 right-4 z-50 rounded-full shadow-lg hover:shadow-xl transition-shadow h-[45px] w-[45px] p-0 ${
          isFirstVisit
            ? "animate-pulse ring-2 ring-primary ring-offset-2 ring-offset-background"
            : ""
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

  // ─── Active walkthrough overlay ────────────────────────────
  return (
    <>
      {/* Dark overlay with spotlight cutout */}
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
        className="fixed z-[10000] bg-card border border-border rounded-xl shadow-2xl p-4"
        style={getTooltipStyle()}
      >
        {/* Arrow */}
        <div className="absolute w-0 h-0" style={getArrowStyle()} />

        {/* Close */}
        <button
          onClick={handleSkip}
          className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close tutorial"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Content */}
        <div className="pr-6">
          <h3 className="text-base md:text-lg font-semibold text-foreground mb-2">
            {currentTutorialStep?.title}
          </h3>
          <p className="text-xs md:text-sm text-muted-foreground mb-4">
            {currentTutorialStep?.description}
          </p>

          {/* Fallback notice when target element not found */}
          {!targetRect && currentTutorialStep && (
            <p className="text-xs text-muted-foreground/60 italic mb-2">
              This element may not be visible in the current view.
            </p>
          )}
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
