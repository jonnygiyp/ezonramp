import { Fragment, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, ChevronDown, Copy } from "lucide-react";
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
    created_at: tx.created_at,
    updated_at: tx.updated_at,
    raw: tx,
  };
}

function normalizeStripe(row: any): UnifiedTx {
  return {
    provider: "stripe",
    id: row.stripe_session_id || row.id,
    status: row.status || "—",
    fiat: row.source_amount ? { value: String(row.source_amount), currency: "USD" } : undefined,
    crypto: undefined,
    asset: row.destination_currency || "USDC",
    network: row.destination_network || "solana",
    partner_user_ref: row.user_id,
    user_id: row.user_id,
    wallet_address: row.wallet_address ?? null,
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

export default function CoinbaseTransactions() {
  const { toast } = useToast();
  const [searchRef, setSearchRef] = useState("");
  const [pageSize, setPageSize] = useState("25");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>("all");
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<UnifiedTx[]>([]);
  const [cbNextKey, setCbNextKey] = useState<string | null>(null);
  const [stripeOffset, setStripeOffset] = useState(0);
  const [page, setPage] = useState(1);
  const [cbStack, setCbStack] = useState<(string | null)[]>([null]);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const fetchData = async (opts: { cbKey?: string | null; stripeOff?: number; reset?: boolean }) => {
    setLoading(true);
    try {
      const size = Math.max(1, Math.min(100, parseInt(pageSize) || 25));
      const ref = searchRef.trim() || undefined;
      const tasks: Promise<UnifiedTx[]>[] = [];

      if (providerFilter === "all" || providerFilter === "coinbase") {
        tasks.push(
          (async () => {
            const { data, error } = await supabase.functions.invoke("coinbase-transactions", {
              body: {
                partnerUserRef: ref,
                page_key: opts.cbKey || undefined,
                page_size: String(size),
              },
            });
            if (error) throw error;
            if (data?.error) throw new Error(data.error);
            setCbNextKey(data?.next_page_key ?? null);
            return (Array.isArray(data?.transactions) ? data.transactions : []).map(normalizeCoinbase);
          })()
        );
      } else {
        setCbNextKey(null);
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
            if (ref) q = q.eq("user_id", ref);
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

  const filtered = transactions.filter((t) => matchesStatus(t, statusFilter));
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
          <div className="grid grid-cols-1 md:grid-cols-[1fr_160px_160px_120px_auto] gap-3 items-end">
            <div className="space-y-1">
              <Label htmlFor="puref">Search Ref (Coinbase partnerUserRef / Stripe user_id)</Label>
              <Input
                id="puref"
                value={searchRef}
                onChange={(e) => setSearchRef(e.target.value)}
                placeholder="optional"
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
            <Button onClick={onSearch} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
              Search
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
                    <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
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
                        <TableCell className="font-mono text-xs max-w-[220px] truncate">{tx.id}</TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate" title={tx.email || ""}>
                          {tx.email || "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs max-w-[160px] truncate" title={tx.wallet_address || ""}>
                          {tx.wallet_address
                            ? `${tx.wallet_address.slice(0, 6)}…${tx.wallet_address.slice(-4)}`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-xs">{tx.status}</TableCell>
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
                          <TableCell colSpan={12} className="bg-muted/30">
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
