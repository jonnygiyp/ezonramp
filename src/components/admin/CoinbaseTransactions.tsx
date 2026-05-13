import { Fragment, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, ChevronDown, Copy, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type StatusFilter = "all" | "success" | "failed";
type ProviderFilter = "all" | "coinbase" | "stripe";

interface UnifiedTx {
  provider: "coinbase" | "stripe";
  id: string;
  status: string;
  fiat?: { value?: string; currency?: string };
  crypto?: { value?: string; currency?: string };
  asset?: string;
  network?: string;
  partner_user_ref?: string;
  user_id?: string;
  wallet_address?: string | null;
  email?: string | null;
  created_at?: string;
  updated_at?: string;
  raw: Record<string, unknown>;
}

const COINBASE_SUCCESS = "ONRAMP_TRANSACTION_STATUS_SUCCESS";
const COINBASE_FAILED = "ONRAMP_TRANSACTION_STATUS_FAILED";
const STRIPE_SUCCESS = "fulfillment_complete";
const STRIPE_FAILED_SET = new Set(["rejected", "expired", "failed"]);

function normalizeCoinbase(tx: any): UnifiedTx {
  return {
    provider: "coinbase",
    id: tx.transaction_id || tx.id || "—",
    status: tx.status || "—",
    fiat: tx.payment_total || tx.source_amount || tx.purchase_amount,
    crypto: tx.destination_amount || tx.purchase_amount,
    asset: tx.asset || tx.purchase_currency || tx.destination_amount?.currency,
    network: tx.network || tx.purchase_network,
    partner_user_ref: tx.partner_user_ref,
    wallet_address: tx.wallet_address ?? null,
    created_at: tx.created_at,
    updated_at: tx.updated_at,
    raw: tx,
  };
}

// Normalize a row from the persistent `coinbase_transactions` table
function normalizeCoinbaseDb(row: any): UnifiedTx {
  return {
    provider: "coinbase",
    id: row.transaction_id || row.id || "—",
    status: row.status || "—",
    fiat:
      row.fiat_value != null
        ? { value: String(row.fiat_value), currency: row.fiat_currency || "USD" }
        : undefined,
    crypto:
      row.crypto_value != null
        ? { value: String(row.crypto_value), currency: row.crypto_currency || "USDC" }
        : undefined,
    asset: row.asset || row.crypto_currency || undefined,
    network: row.network || undefined,
    partner_user_ref: row.partner_user_ref || undefined,
    user_id: row.user_id || undefined,
    wallet_address: row.wallet_address || null,
    created_at: row.tx_created_at || row.created_at,
    updated_at: row.tx_updated_at || row.updated_at,
    raw: row.payload || row,
  };
}

function normalizeStripe(row: any): UnifiedTx {
  const cb = (row.callback_data || {}) as any;
  const td = (cb.transaction_details || {}) as any;
  const fiatValue =
    cb.source_total_amount ??
    td.source_amount ??
    (row.source_amount != null ? String(row.source_amount) : undefined);
  const fiatCurrency = (td.source_currency || "USD").toString().toUpperCase();
  const cryptoValue = td.destination_amount
    ? String(parseFloat(td.destination_amount))
    : undefined;
  const cryptoCurrency = (td.destination_currency || row.destination_currency || "USDC")
    .toString()
    .toUpperCase();
  return {
    provider: "stripe",
    id: row.stripe_session_id || row.id,
    status: row.status || "—",
    fiat: fiatValue != null ? { value: String(fiatValue), currency: fiatCurrency } : undefined,
    crypto: cryptoValue ? { value: cryptoValue, currency: cryptoCurrency } : undefined,
    asset: td.destination_currency?.toString().toUpperCase() || row.destination_currency || "USDC",
    network: td.destination_network || row.destination_network || "solana",
    partner_user_ref: row.user_id,
    user_id: row.user_id,
    wallet_address: td.wallet_address || row.wallet_address || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    raw: row,
  };
}

function matchesStatus(tx: UnifiedTx, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (tx.provider === "coinbase") {
    if (filter === "success") return tx.status === COINBASE_SUCCESS;
    return tx.status === COINBASE_FAILED;
  }
  if (filter === "success") return tx.status === STRIPE_SUCCESS;
  return STRIPE_FAILED_SET.has(tx.status);
}

function shortStatus(tx: UnifiedTx): string {
  const s = tx.status || "";
  if (tx.provider === "coinbase") {
    if (s === COINBASE_SUCCESS) return "Success";
    if (s === COINBASE_FAILED) return "Failed";
    // ONRAMP_TRANSACTION_STATUS_IN_PROGRESS / _CREATED → take last token
    const parts = s.split("_");
    const tail = parts[parts.length - 1] || s;
    return tail.charAt(0) + tail.slice(1).toLowerCase();
  }
  if (s === STRIPE_SUCCESS) return "Success";
  if (STRIPE_FAILED_SET.has(s)) return "Failed";
  if (s.startsWith("fulfillment_")) return "Pending";
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "—";
}

export default function CoinbaseTransactions() {
  const { toast } = useToast();
  const [searchRef, setSearchRef] = useState("");
  const [pageSize, setPageSize] = useState("25");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<UnifiedTx[]>([]);
  const [cbOffset, setCbOffset] = useState(0);
  const [stripeOffset, setStripeOffset] = useState(0);
  const [page, setPage] = useState(1);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const fromTs = fromDate ? new Date(fromDate + "T00:00:00").getTime() : null;
  const toTs = toDate ? new Date(toDate + "T23:59:59.999").getTime() : null;

  const fetchData = async (opts: { cbOff?: number; stripeOff?: number; reset?: boolean }) => {
    setLoading(true);
    try {
      const size = Math.max(1, Math.min(100, parseInt(pageSize) || 25));
      const rawRef = searchRef.trim();
      // Heuristic: UUIDs contain dashes; otherwise treat as wallet address lookup
      const isWalletSearch = !!rawRef && !rawRef.includes("-");
      let cbRefsForSearch: string[] = [];
      let stripeUserIdsForSearch: string[] = [];
      let directRef: string | undefined = undefined;

      if (rawRef) {
        if (isWalletSearch) {
          try {
            const { data: lookup } = await supabase.functions.invoke("admin-user-lookup", {
              body: { wallet_search: rawRef },
            });
            cbRefsForSearch = lookup?.wallet_search?.partner_user_refs || [];
            stripeUserIdsForSearch = lookup?.wallet_search?.user_ids || [];
          } catch (err) {
            console.warn("[ADMIN-TX] wallet search lookup failed", err);
          }
          if (cbRefsForSearch.length === 0 && stripeUserIdsForSearch.length === 0) {
            toast({ title: "No matches", description: "No transactions found for that wallet." });
            setTransactions([]);
            setCbNextKey(null);
            setLoading(false);
            return;
          }
        } else {
          directRef = rawRef;
        }
      }

      const tasks: Promise<UnifiedTx[]>[] = [];

      if (providerFilter === "all" || providerFilter === "coinbase") {
        tasks.push(
          (async () => {
            // Fire-and-forget sync: refresh the last 30 days of Coinbase data into the DB.
            // We don't await for big payloads — only awaited when wallet search needs the freshest data.
            const refsToSync = isWalletSearch ? cbRefsForSearch : [directRef];
            for (const r of refsToSync) {
              try {
                await supabase.functions.invoke("coinbase-transactions", {
                  body: {
                    partnerUserRef: r || undefined,
                    page_size: "100",
                  },
                });
              } catch (syncErr) {
                console.warn("[ADMIN-TX] coinbase live sync failed (continuing with DB)", syncErr);
              }
            }

            const offset = opts.cbOff ?? 0;
            let q = supabase
              .from("coinbase_transactions")
              .select("*")
              .order("tx_created_at", { ascending: false, nullsFirst: false })
              .range(offset, offset + size - 1);
            if (isWalletSearch) {
              const orParts: string[] = [];
              if (cbRefsForSearch.length > 0)
                orParts.push(`partner_user_ref.in.(${cbRefsForSearch.map((s) => `"${s}"`).join(",")})`);
              orParts.push(`wallet_address.eq.${rawRef}`);
              q = q.or(orParts.join(","));
            } else if (directRef) {
              q = q.eq("partner_user_ref", directRef);
            }
            if (fromDate) q = q.gte("tx_created_at", new Date(fromDate + "T00:00:00").toISOString());
            if (toDate) q = q.lte("tx_created_at", new Date(toDate + "T23:59:59.999").toISOString());
            const { data, error } = await q;
            if (error) throw error;
            return (data ?? []).map(normalizeCoinbaseDb);
          })()
        );
      }

      if (providerFilter === "all" || providerFilter === "stripe") {
        tasks.push(
          (async () => {
            const offset = opts.stripeOff ?? 0;
            let q = supabase
              .from("stripe_onramp_sessions")
              .select("*")
              .order("created_at", { ascending: false })
              .range(offset, offset + size - 1);
            if (isWalletSearch) {
              if (stripeUserIdsForSearch.length === 0) return [];
              q = q.in("user_id", stripeUserIdsForSearch);
            } else if (directRef) {
              q = q.eq("user_id", directRef);
            }
            if (fromDate) q = q.gte("created_at", new Date(fromDate + "T00:00:00").toISOString());
            if (toDate) q = q.lte("created_at", new Date(toDate + "T23:59:59.999").toISOString());
            const { data, error } = await q;
            if (error) throw error;
            return (data ?? []).map(normalizeStripe);
          })()
        );
      }

      const results = await Promise.all(tasks);
      const merged = results.flat().sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      });

      // Enrich with email + wallet
      const cbRefs = merged
        .filter((t) => t.provider === "coinbase" && t.partner_user_ref)
        .map((t) => t.partner_user_ref as string);
      const stripeUserIds = merged
        .filter((t) => t.provider === "stripe" && t.user_id)
        .map((t) => t.user_id as string);
      if (cbRefs.length || stripeUserIds.length) {
        try {
          const { data: lookup } = await supabase.functions.invoke("admin-user-lookup", {
            body: { user_ids: stripeUserIds, partner_user_refs: cbRefs },
          });
          const refMap = (lookup?.partner_user_refs || {}) as Record<string, { user_id: string; wallet_address: string | null }>;
          const userMap = (lookup?.users || {}) as Record<string, { email: string | null; wallet_address: string | null }>;
          for (const t of merged) {
            if (t.provider === "coinbase" && t.partner_user_ref && refMap[t.partner_user_ref]) {
              t.user_id = refMap[t.partner_user_ref].user_id;
              t.wallet_address = refMap[t.partner_user_ref].wallet_address;
            }
            if (t.user_id && userMap[t.user_id]) {
              t.email = userMap[t.user_id].email;
              if (!t.wallet_address) t.wallet_address = userMap[t.user_id].wallet_address;
            }
          }
        } catch (lookupErr) {
          console.warn("[ADMIN-TX] user lookup failed", lookupErr);
        }
      }

      setTransactions(merged);
      if (opts.reset) {
        setCbStack([null]);
        setStripeOffset(0);
        setPage(1);
      }
    } catch (e: any) {
      console.error("[ADMIN-TX] fetch failed", e);
      toast({
        title: "Lookup failed",
        description: e?.message || "Could not load transactions",
        variant: "destructive",
      });
      setTransactions([]);
      setCbNextKey(null);
    } finally {
      setLoading(false);
    }
  };

  const onSearch = () => {
    setExpandedIdx(null);
    fetchData({ cbKey: null, stripeOff: 0, reset: true });
  };

  const onNext = () => {
    const size = Math.max(1, Math.min(100, parseInt(pageSize) || 25));
    const newStripeOff = stripeOffset + size;
    setExpandedIdx(null);
    if (providerFilter === "stripe") {
      setStripeOffset(newStripeOff);
      setPage((p) => p + 1);
      fetchData({ stripeOff: newStripeOff });
    } else {
      if (!cbNextKey && providerFilter === "coinbase") return;
      setCbStack((s) => [...s, cbNextKey]);
      if (providerFilter === "all") setStripeOffset(newStripeOff);
      setPage((p) => p + 1);
      fetchData({ cbKey: cbNextKey, stripeOff: providerFilter === "all" ? newStripeOff : undefined });
    }
  };

  const onPrev = () => {
    if (page <= 1) return;
    const size = Math.max(1, Math.min(100, parseInt(pageSize) || 25));
    setExpandedIdx(null);
    if (providerFilter === "stripe") {
      const newOff = Math.max(0, stripeOffset - size);
      setStripeOffset(newOff);
      setPage((p) => p - 1);
      fetchData({ stripeOff: newOff });
    } else {
      const newStack = cbStack.slice(0, -1);
      const prevKey = newStack[newStack.length - 1];
      setCbStack(newStack);
      const newOff = Math.max(0, stripeOffset - size);
      if (providerFilter === "all") setStripeOffset(newOff);
      setPage((p) => p - 1);
      fetchData({ cbKey: prevKey, stripeOff: providerFilter === "all" ? newOff : undefined });
    }
  };

  const filtered = transactions.filter((t) => {
    if (!matchesStatus(t, statusFilter)) return false;
    if (fromTs || toTs) {
      const ts = t.created_at ? new Date(t.created_at).getTime() : 0;
      if (fromTs && ts < fromTs) return false;
      if (toTs && ts > toTs) return false;
    }
    return true;
  });

  const [exporting, setExporting] = useState(false);

  const fetchAllForExport = async (): Promise<UnifiedTx[]> => {
    const PAGE = 100;
    const rawRef = searchRef.trim();
    const isWalletSearch = !!rawRef && !rawRef.includes("-");
    let cbRefsForSearch: string[] = [];
    let stripeUserIdsForSearch: string[] = [];
    let directRef: string | undefined = undefined;

    if (rawRef) {
      if (isWalletSearch) {
        const { data: lookup } = await supabase.functions.invoke("admin-user-lookup", {
          body: { wallet_search: rawRef },
        });
        cbRefsForSearch = lookup?.wallet_search?.partner_user_refs || [];
        stripeUserIdsForSearch = lookup?.wallet_search?.user_ids || [];
        if (cbRefsForSearch.length === 0 && stripeUserIdsForSearch.length === 0) return [];
      } else {
        directRef = rawRef;
      }
    }

    const all: UnifiedTx[] = [];

    if (providerFilter === "all" || providerFilter === "coinbase") {
      const refsToQuery = isWalletSearch ? cbRefsForSearch : [directRef];
      for (const r of refsToQuery) {
        let pageKey: string | undefined = undefined;
        // Safety cap to avoid infinite loops
        for (let i = 0; i < 200; i++) {
          const { data, error } = await supabase.functions.invoke("coinbase-transactions", {
            body: {
              partnerUserRef: r || undefined,
              page_key: pageKey,
              page_size: String(PAGE),
            },
          });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          if (Array.isArray(data?.transactions)) all.push(...data.transactions.map(normalizeCoinbase));
          if (data?.next_page_key) pageKey = data.next_page_key;
          else break;
        }
      }
    }

    if (providerFilter === "all" || providerFilter === "stripe") {
      let offset = 0;
      for (let i = 0; i < 200; i++) {
        let q = supabase
          .from("stripe_onramp_sessions")
          .select("*")
          .order("created_at", { ascending: false })
          .range(offset, offset + PAGE - 1);
        if (isWalletSearch) {
          if (stripeUserIdsForSearch.length === 0) break;
          q = q.in("user_id", stripeUserIdsForSearch);
        } else if (directRef) {
          q = q.eq("user_id", directRef);
        }
        if (fromDate) q = q.gte("created_at", new Date(fromDate + "T00:00:00").toISOString());
        if (toDate) q = q.lte("created_at", new Date(toDate + "T23:59:59.999").toISOString());
        const { data, error } = await q;
        if (error) throw error;
        const batch = (data ?? []).map(normalizeStripe);
        all.push(...batch);
        if (batch.length < PAGE) break;
        offset += PAGE;
      }
    }

    // Enrich with email + wallet
    const cbRefs = all
      .filter((t) => t.provider === "coinbase" && t.partner_user_ref)
      .map((t) => t.partner_user_ref as string);
    const stripeUserIds = all
      .filter((t) => t.provider === "stripe" && t.user_id)
      .map((t) => t.user_id as string);
    if (cbRefs.length || stripeUserIds.length) {
      try {
        const { data: lookup } = await supabase.functions.invoke("admin-user-lookup", {
          body: { user_ids: stripeUserIds, partner_user_refs: cbRefs },
        });
        const refMap = (lookup?.partner_user_refs || {}) as Record<string, { user_id: string; wallet_address: string | null }>;
        const userMap = (lookup?.users || {}) as Record<string, { email: string | null; wallet_address: string | null }>;
        for (const t of all) {
          if (t.provider === "coinbase" && t.partner_user_ref && refMap[t.partner_user_ref]) {
            t.user_id = refMap[t.partner_user_ref].user_id;
            t.wallet_address = refMap[t.partner_user_ref].wallet_address;
          }
          if (t.user_id && userMap[t.user_id]) {
            t.email = userMap[t.user_id].email;
            if (!t.wallet_address) t.wallet_address = userMap[t.user_id].wallet_address;
          }
        }
      } catch (lookupErr) {
        console.warn("[ADMIN-TX] export user lookup failed", lookupErr);
      }
    }

    return all
      .filter((t) => {
        if (!matchesStatus(t, statusFilter)) return false;
        if (fromTs || toTs) {
          const ts = t.created_at ? new Date(t.created_at).getTime() : 0;
          if (fromTs && ts < fromTs) return false;
          if (toTs && ts > toTs) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      });
  };

  const exportCsv = async () => {
    const headers = [
      "provider",
      "id",
      "status",
      "wallet_address",
      "user_id",
      "partner_user_ref",
      "email",
      "fiat_value",
      "fiat_currency",
      "crypto_value",
      "crypto_currency",
      "asset",
      "network",
      "created_at",
      "updated_at",
    ];
    const escape = (v: unknown) => {
      if (v == null) return "";
      const s = String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    setExporting(true);
    let rowsData: UnifiedTx[] = [];
    try {
      rowsData = await fetchAllForExport();
    } catch (e: any) {
      console.error("[ADMIN-TX] export failed", e);
      toast({
        title: "Export failed",
        description: e?.message || "Could not export transactions",
        variant: "destructive",
      });
      setExporting(false);
      return;
    }
    if (rowsData.length === 0) {
      toast({ title: "Nothing to export", description: "No transactions match the current filters." });
      setExporting(false);
      return;
    }
    const rows = rowsData.map((t) =>
      [
        t.provider,
        t.id,
        shortStatus(t),
        t.wallet_address,
        t.user_id,
        t.partner_user_ref,
        t.email,
        t.fiat?.value,
        t.fiat?.currency,
        t.crypto?.value,
        t.crypto?.currency,
        t.asset,
        t.network,
        t.created_at,
        t.updated_at,
      ]
        .map(escape)
        .join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setExporting(false);
    toast({ title: "Export complete", description: `Exported ${rowsData.length} transaction${rowsData.length === 1 ? "" : "s"}.` });
  };
  const hasNext =
    providerFilter === "stripe"
      ? transactions.filter((t) => t.provider === "stripe").length >=
        Math.max(1, Math.min(100, parseInt(pageSize) || 25))
      : !!cbNextKey || providerFilter === "all";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Onramp Transactions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_160px_160px_120px] gap-3 items-end">
            <div className="space-y-1">
              <Label htmlFor="puref">Search (wallet address, Coinbase partnerUserRef, or Stripe user_id)</Label>
              <Input
                id="puref"
                value={searchRef}
                onChange={(e) => setSearchRef(e.target.value)}
                placeholder="wallet address or user ref (optional)"
                onKeyDown={(e) => e.key === "Enter" && onSearch()}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="provider">Provider</Label>
              <Select value={providerFilter} onValueChange={(v) => setProviderFilter(v as ProviderFilter)}>
                <SelectTrigger id="provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Both</SelectItem>
                  <SelectItem value="coinbase">Coinbase</SelectItem>
                  <SelectItem value="stripe">Stripe</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="status">Status</Label>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="psize">Page size</Label>
              <Input
                id="psize"
                type="number"
                min={1}
                max={100}
                value={pageSize}
                onChange={(e) => setPageSize(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[160px_160px_auto_auto] gap-3 items-end">
            <div className="space-y-1">
              <Label htmlFor="from-date">From</Label>
              <Input
                id="from-date"
                type="date"
                value={fromDate}
                max={toDate || undefined}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to-date">To</Label>
              <Input
                id="to-date"
                type="date"
                value={toDate}
                min={fromDate || undefined}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
            {(fromDate || toDate) && (
              <Button
                variant="ghost"
                onClick={() => {
                  setFromDate("");
                  setToDate("");
                  onSearch();
                }}
              >
                Clear dates
              </Button>
            )}
            <Button onClick={onSearch} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
              Search
            </Button>
            <Button
              variant="outline"
              onClick={exportCsv}
              disabled={exporting || loading}
            >
              {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              {exporting ? "Exporting..." : "Export CSV"}
            </Button>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Wallet</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Fiat</TableHead>
                  <TableHead>Crypto</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead>Network</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && !loading ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                      No transactions to display.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((tx, idx) => (
                    <Fragment key={`${tx.provider}-${tx.id}-${idx}`}>
                      <TableRow>
                        <TableCell>
                          <Badge variant={tx.provider === "coinbase" ? "default" : "secondary"}>
                            {tx.provider}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {tx.id && tx.id !== "—" ? (
                            <div className="flex items-center gap-1">
                              <span className="max-w-[120px] truncate" title={tx.id}>
                                {tx.id.length > 14 ? `${tx.id.slice(0, 8)}…${tx.id.slice(-4)}` : tx.id}
                              </span>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(tx.id);
                                    toast({ title: "Copied", description: "Transaction ID copied" });
                                  } catch {
                                    toast({ title: "Copy failed", variant: "destructive" });
                                  }
                                }}
                                aria-label="Copy transaction ID"
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {tx.wallet_address ? (
                            <div className="flex items-center gap-1">
                              <span className="max-w-[140px] truncate" title={tx.wallet_address}>
                                {`${tx.wallet_address.slice(0, 6)}…${tx.wallet_address.slice(-4)}`}
                              </span>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(tx.wallet_address!);
                                    toast({ title: "Copied", description: "Wallet address copied" });
                                  } catch {
                                    toast({ title: "Copy failed", variant: "destructive" });
                                  }
                                }}
                                aria-label="Copy wallet address"
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-xs" title={tx.status}>{shortStatus(tx)}</TableCell>
                        <TableCell>
                          {tx.fiat?.value ? `${tx.fiat.value} ${tx.fiat.currency || ""}` : "—"}
                        </TableCell>
                        <TableCell>
                          {tx.crypto?.value ? `${tx.crypto.value} ${tx.crypto.currency || ""}` : "—"}
                        </TableCell>
                        <TableCell>{tx.asset || "—"}</TableCell>
                        <TableCell>{tx.network || "—"}</TableCell>
                        <TableCell className="text-xs">
                          {tx.created_at ? new Date(tx.created_at).toLocaleString() : "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {tx.updated_at ? new Date(tx.updated_at).toLocaleString() : "—"}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                          >
                            <ChevronDown
                              className={`h-4 w-4 transition-transform ${expandedIdx === idx ? "rotate-180" : ""}`}
                            />
                          </Button>
                        </TableCell>
                      </TableRow>
                      {expandedIdx === idx && (
                        <TableRow>
                          <TableCell colSpan={11} className="bg-muted/30">
                            <pre className="text-xs overflow-auto max-h-96 p-2">
                              {JSON.stringify(tx.raw, null, 2)}
                            </pre>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={onPrev} disabled={loading || page <= 1}>
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">Page {page}</span>
            <Button variant="outline" onClick={onNext} disabled={loading || !hasNext}>
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
