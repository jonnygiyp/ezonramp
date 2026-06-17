import { useState } from "react";
import { Copy, Check, ChevronDown, ChevronUp, Wallet as WalletIcon } from "lucide-react";
import { Button } from "./ui/button";

interface ConnectedWalletCardProps {
  address: string;
  label?: string;
  onChange?: () => void;
}

function truncate(addr: string) {
  if (!addr) return "";
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-5)}`;
}

/**
 * Compact connected-wallet display used across all ramp providers.
 * Reduces visual weight versus a full-width address row, while keeping
 * full address verification one tap away (copy + reveal).
 */
export function ConnectedWalletCard({
  address,
  label = "Receive USDC At",
  onChange,
}: ConnectedWalletCardProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground/80">
            {label}
          </p>
          <p className="font-mono text-sm truncate">
            {expanded ? address : truncate(address)}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleCopy}
            aria-label="Copy wallet address"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Hide full address" : "View full address"}
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-[11px] text-primary">
          <WalletIcon className="h-3 w-3" />
          Connected Wallet
        </span>
        {onChange && (
          <button
            type="button"
            onClick={onChange}
            className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            Change Wallet
          </button>
        )}
      </div>
    </div>
  );
}
