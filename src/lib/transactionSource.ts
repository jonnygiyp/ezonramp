export type TransactionSource = "homepage" | "express";

const EXPRESS_PATH_PATTERN = /^\/express(?:\/|$)/i;

export function normalizeTransactionSource(value?: string | null): TransactionSource | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "express") return "express";
  if (normalized === "homepage" || normalized === "home") return "homepage";
  return null;
}

export function resolveTransactionSource(
  explicitSource?: string | null,
  pathname = typeof window !== "undefined" ? window.location.pathname : "",
): TransactionSource {
  const explicit = normalizeTransactionSource(explicitSource);
  if (explicit) return explicit;
  return EXPRESS_PATH_PATTERN.test(pathname) ? "express" : "homepage";
}

export function formatTransactionDomain(source?: string | null): string {
  const normalized = normalizeTransactionSource(source);
  if (normalized === "express") return "Express";
  if (normalized === "homepage") return "Homepage";
  return "Unknown";
}