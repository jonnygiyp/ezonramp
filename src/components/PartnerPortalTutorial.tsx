import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { X, ChevronLeft, ChevronRight, HelpCircle, Lightbulb } from "lucide-react";
import { useAccount } from "@/hooks/useParticle";
import { useIsMobile } from "@/hooks/use-mobile";

interface Step {
  target: string;
  title: string;
  description: string;
  position: "top" | "bottom";
  loggedOutOnly?: boolean;
  loggedInOnly?: boolean;
}

interface Props {
  selectedProvider?: string;
}

const intro: Step = {
  target: "[data-pp-tut='headline']",
  title: "Welcome to EZOnRamp Express",
  description:
    "A streamlined checkout to add USDC to your Solana wallet. We'll walk you through the page in a few quick steps.",
  position: "bottom",
};

const tabs: Step = {
  target: "[data-pp-tut='tabs']",
  title: "Pick your onramp",
  description:
    "Switch between providers here. Your region is auto-detected, but you can override the choice at any time.",
  position: "bottom",
};

const debitTip: Step = {
  target: "[data-pp-tut='debit-tip']",
  title: "Use a debit card",
  description:
    "Debit cards have the highest approval rate. Credit cards often get blocked by your bank for crypto purchases.",
  position: "bottom",
};

const widget: Step = {
  target: "[data-pp-tut='widget']",
  title: "Complete your purchase",
  description:
    "Enter an amount, confirm your wallet address, and follow the prompts from the selected provider. Funds go straight to your wallet.",
  position: "top",
};

const widgetCoinbaseUS: Step = {
  ...widget,
  description:
    "Verify with a US phone or email, confirm your wallet, then pay with debit. Verification lasts 60 days.",
};

const widgetCoinbaseGlobal: Step = {
  ...widget,
  description:
    "Enter an amount and continue. A Coinbase window opens to finish the purchase — a Coinbase account and KYC may be required.",
};

const widgetStripe: Step = {
  ...widget,
  description:
    "Sign in first, then enter your payment details directly in the embedded Stripe checkout.",
};

const account: Step = {
  target: "[data-pp-tut='account']",
  title: "Your account",
  description:
    "View your wallet balance, copy your address, or sign out from here.",
  position: "bottom",
  loggedInOnly: true,
};

const help: Step = {
  target: "[data-pp-tut='help']",
  title: "Need a hand?",
  description:
    "Open Help & FAQ any time for answers about fees, timing, and supported regions.",
  position: "bottom",
};

const buildSteps = (provider: string): Step[] => {
  let widgetStep = widget;
  if (provider === "coinbase") widgetStep = widgetCoinbaseUS;
  else if (provider === "coinbase_global") widgetStep = widgetCoinbaseGlobal;
  else if (provider === "stripe") widgetStep = widgetStripe;
  return [intro, tabs, debitTip, widgetStep, account, help];
};

const STORAGE_KEY = "pp_tutorial_completed";
const FIRST_VISIT_KEY = "pp_tutorial_first_visit";

export function PartnerPortalTutorial({ selectedProvider = "coinbase" }: Props) {
  const [isActive, setIsActive] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [isFirstVisit, setIsFirstVisit] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const prevProvider = useRef(selectedProvider);
  const { isConnected } = useAccount();
  const isMobile = useIsMobile();

  useEffect(() => {
    const visited = localStorage.getItem(FIRST_VISIT_KEY);
    const completed = localStorage.getItem(STORAGE_KEY);
    if (!visited) {
      setIsFirstVisit(true);
      localStorage.setItem(FIRST_VISIT_KEY, "true");
    }
    if (completed) setHasInteracted(true);
  }, []);

  // Close if provider changes mid-tour
  useEffect(() => {
    if (isActive && selectedProvider !== prevProvider.current) {
      setIsActive(false);
      setStepIdx(0);
    }
    prevProvider.current = selectedProvider;
  }, [selectedProvider, isActive]);

  const activeSteps = useMemo(() => {
    return buildSteps(selectedProvider).filter((s) => {
      if (s.loggedOutOnly && isConnected) return false;
      if (s.loggedInOnly && !isConnected) return false;
      return true;
    });
  }, [selectedProvider, isConnected]);

  const current = activeSteps[stepIdx];

  const updateRect = useCallback(() => {
    if (!isActive || !current) return;
    requestAnimationFrame(() => {
      const el = document.querySelector(current.target);
      if (el) {
        const r = el.getBoundingClientRect();
        setRect(r.width > 0 && r.height > 0 ? r : null);
      } else {
        setRect(null);
      }
    });
  }, [isActive, current]);

  useEffect(() => {
    updateRect();
    const t = setTimeout(updateRect, 200);
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [updateRect]);

  const finish = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setHasInteracted(true);
    setIsFirstVisit(false);
    setIsActive(false);
    setStepIdx(0);
  };

  const start = () => {
    setStepIdx(0);
    setIsActive(true);
    setIsFirstVisit(false);
  };

  const next = () => {
    if (stepIdx < activeSteps.length - 1) setStepIdx((i) => i + 1);
    else finish();
  };
  const prev = () => stepIdx > 0 && setStepIdx((i) => i - 1);

  // Tooltip placement
  const tooltipStyle = (): React.CSSProperties => {
    const w = isMobile ? Math.min(320, window.innerWidth - 24) : 320;
    const pad = 14;
    if (!rect) {
      return { top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: w };
    }
    const pos = current?.position ?? "bottom";
    let top: number;
    let left = rect.left + rect.width / 2 - w / 2;
    if (pos === "bottom") top = rect.bottom + pad;
    else top = rect.top - pad - 170;
    left = Math.max(pad, Math.min(left, window.innerWidth - w - pad));
    top = Math.max(pad, Math.min(top, window.innerHeight - 200));
    return { top, left, width: w };
  };

  // Idle launcher button
  if (!isActive) {
    const showFirstStyle = isFirstVisit && !hasInteracted;
    return (
      <button
        onClick={start}
        className={`pp-tut-btn ${showFirstStyle ? "pp-tut-btn-large pp-tut-btn-first" : hasInteracted ? "pp-tut-btn-small" : "pp-tut-btn-large"}`}
        aria-label="Open page tour"
        title="Page tour"
      >
        {hasInteracted ? (
          <Lightbulb className="h-3.5 w-3.5" />
        ) : (
          <HelpCircle className={showFirstStyle ? "h-5 w-5" : "h-4 w-4"} />
        )}
      </button>
    );
  }

  return (
    <>
      <div className="pp-tut-overlay" />
      {rect && (
        <div
          className="pp-tut-ring"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
          }}
        />
      )}
      <div className="pp-tut-tooltip" style={tooltipStyle()}>
        <button onClick={finish} className="pp-tut-close" aria-label="Close tour">
          <X className="h-4 w-4" />
        </button>
        <h4>{current?.title}</h4>
        <p>{current?.description}</p>
        {!rect && current && (
          <p style={{ fontStyle: "italic", opacity: 0.7, marginTop: -8 }}>
            This element isn't visible right now — try scrolling or switching tabs.
          </p>
        )}
        <div className="pp-tut-actions">
          <span className="pp-tut-counter">
            {stepIdx + 1} of {activeSteps.length}
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              className="pp-tut-btn-action"
              onClick={prev}
              disabled={stepIdx === 0}
            >
              <ChevronLeft className="h-3 w-3 inline -mt-px mr-0.5" />
              Back
            </button>
            <button
              className="pp-tut-btn-action pp-tut-btn-action-primary"
              onClick={next}
            >
              {stepIdx === activeSteps.length - 1 ? "Finish" : "Next"}
              {stepIdx < activeSteps.length - 1 && (
                <ChevronRight className="h-3 w-3 inline -mt-px ml-0.5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default PartnerPortalTutorial;
