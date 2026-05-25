import { CheckCircle2, Loader2, AlertTriangle, XCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  LIFECYCLE_COPY,
  type CoinbaseLifecycleState,
} from "@/lib/coinbaseLifecycle";
import { cn } from "@/lib/utils";

interface Props {
  state: CoinbaseLifecycleState;
  transactionId?: string | null;
  onStartAgain?: () => void;
  className?: string;
}

/**
 * Granular lifecycle banner for the Coinbase Global onramp flow.
 * Renders a contextual icon + label + sub-copy, and a "Start Again"
 * action on any terminal failure state.
 */
export function CoinbaseLifecycleBanner({
  state,
  transactionId,
  onStartAgain,
  className,
}: Props) {
  const copy = LIFECYCLE_COPY[state];

  const toneClasses: Record<typeof copy.tone, string> = {
    info: "bg-muted/40 border-border",
    success: "bg-primary/10 border-primary/30",
    warning: "bg-accent border-accent",
    error: "bg-destructive/10 border-destructive/30",
  };

  const iconToneClasses: Record<typeof copy.tone, string> = {
    info: "text-primary",
    success: "text-primary",
    warning: "text-accent-foreground",
    error: "text-destructive",
  };

  let Icon = Loader2;
  if (copy.tone === "success") Icon = CheckCircle2;
  else if (copy.tone === "error") Icon = XCircle;
  else if (copy.tone === "warning") Icon = AlertTriangle;
  else if (!copy.showSpinner) Icon = CheckCircle2;

  return (
    <div
      className={cn(
        "rounded-xl border p-5 text-center space-y-4",
        toneClasses[copy.tone],
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-background/60">
        <Icon
          className={cn(
            "h-7 w-7",
            iconToneClasses[copy.tone],
            copy.showSpinner && "animate-spin",
          )}
        />
      </div>
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">{copy.label}</h3>
        <p className="text-sm text-muted-foreground">{copy.description}</p>
      </div>
      {transactionId && (
        <div className="p-2 bg-background/60 rounded-md mx-auto max-w-full">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">
            Transaction ID
          </p>
          <p className="font-mono text-xs truncate">{transactionId}</p>
        </div>
      )}
      {copy.showRetry && onStartAgain && (
        <Button
          onClick={onStartAgain}
          variant={copy.tone === "error" ? "destructive" : "default"}
          className="w-full gap-2"
        >
          <RotateCcw className="h-4 w-4" />
          Start Again
        </Button>
      )}
    </div>
  );
}
