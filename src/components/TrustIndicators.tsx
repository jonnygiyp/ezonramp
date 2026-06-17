import { Check } from "lucide-react";

const ITEMS = [
  "Funds are sent directly to your wallet",
  "EZOnRamp never holds your crypto",
  "Secure checkout powered by industry-leading providers",
];

interface TrustIndicatorsProps {
  /** desktop: inline horizontal row, mobile: stacked. */
  layout?: "auto" | "stacked";
  className?: string;
}

export function TrustIndicators({ layout = "auto", className = "" }: TrustIndicatorsProps) {
  const isAuto = layout === "auto";
  return (
    <ul
      className={[
        "text-[11px] md:text-xs text-muted-foreground",
        isAuto
          ? "flex flex-col md:flex-row md:flex-wrap md:items-center md:justify-center gap-1.5 md:gap-x-4 md:gap-y-1"
          : "flex flex-col gap-1.5",
        className,
      ].join(" ")}
    >
      {ITEMS.map((text) => (
        <li key={text} className="flex items-start gap-1.5 leading-tight">
          <Check className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
}
