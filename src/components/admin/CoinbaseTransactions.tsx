import { Fragment, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, ChevronDown } from "lucide-react";

type StatusFilter = "all" | "ONRAMP_TRANSACTION_STATUS_SUCCESS" | "ONRAMP_TRANSACTION_STATUS_FAILED";
import { useToast } from "@/hooks/use-toast";

interface CbTx {
  transaction_id?: string;
  status?: string;
  purchase_amount?: { value?: string; currency?: string };
  purchase_currency?: string;
  purchase_network?: string;
  payment_total?: { value?: string; currency?: string };
  source_amount?: { value?: string; currency?: string };
  destination_amount?: { value?: string; currency?: string };
  asset?: string;
  network?: string;
  partner_user_ref?: string;
  created_at?: string;
  updated_at?: string;
  [k: string]: unknown;
}

export default function CoinbaseTransactions() {
  const { toast } = useToast();
  const [partnerUserRef, setPartnerUserRef] = useState("");
  const [pageSize, setPageSize] = useState("25");
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<CbTx[]>([]);
  const [nextPageKey, setNextPageKey] = useState<string | null>(null);
  const [pageStack, setPageStack] = useState<(string | null)[]>([null]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const fetchPage = async (pageKey: string | null, opts?: { reset?: boolean }) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("coinbase-transactions", {
        body: {
          partnerUserRef: partnerUserRef.trim() || undefined,
          page_key: pageKey || undefined,
          page_size: pageSize || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setTransactions(Array.isArray(data?.transactions) ? data.transactions : []);
      setNextPageKey(data?.next_page_key ?? null);
      setTotalCount(typeof data?.total_count === "number" ? data.total_count : null);
      if (opts?.reset) setPageStack([null]);
    } catch (e: any) {
      console.error("[ADMIN-CB-TX] fetch failed", e);
      toast({
        title: "Lookup failed",
        description: e?.message || "Could not reach Coinbase",
        variant: "destructive",
      });
      setTransactions([]);
      setNextPageKey(null);
    } finally {
      setLoading(false);
    }
  };

  const onSearch = () => {
    setExpandedIdx(null);
    fetchPage(null, { reset: true });
  };

  const onNext = () => {
    if (!nextPageKey) return;
    setPageStack((s) => [...s, nextPageKey]);
    setExpandedIdx(null);
    fetchPage(nextPageKey);
  };

  const onPrev = () => {
    if (pageStack.length <= 1) return;
    const newStack = pageStack.slice(0, -1);
    const prevKey = newStack[newStack.length - 1];
    setPageStack(newStack);
    setExpandedIdx(null);
    fetchPage(prevKey);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Coinbase Transactions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_120px_auto] gap-3 items-end">
            <div className="space-y-1">
              <Label htmlFor="puref">Partner User Ref</Label>
              <Input
                id="puref"
                value={partnerUserRef}
                onChange={(e) => setPartnerUserRef(e.target.value)}
                placeholder="u12345678_a... (optional)"
                onKeyDown={(e) => e.key === "Enter" && onSearch()}
              />
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

          {totalCount !== null && (
            <p className="text-sm text-muted-foreground">Total: {totalCount}</p>
          )}

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transaction ID</TableHead>
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
                {transactions.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      No transactions to display.
                    </TableCell>
                  </TableRow>
                )}
                {transactions.map((tx, idx) => {
                  const fiat = tx.payment_total || tx.source_amount || tx.purchase_amount;
                  const crypto = tx.destination_amount || tx.purchase_amount;
                  const asset = (tx.asset as string) || tx.purchase_currency || crypto?.currency || "";
                  const network = (tx.network as string) || tx.purchase_network || "";
                  const txId = (tx.transaction_id as string) || (tx as any).id || "—";
                  return (
                    <Fragment key={`${txId}-${idx}`}>
                      <TableRow key={`${txId}-${idx}`}>
                        <TableCell className="font-mono text-xs">{txId}</TableCell>
                        <TableCell>{tx.status || "—"}</TableCell>
                        <TableCell>
                          {fiat?.value ? `${fiat.value} ${fiat.currency || ""}` : "—"}
                        </TableCell>
                        <TableCell>
                          {crypto?.value ? `${crypto.value} ${crypto.currency || ""}` : "—"}
                        </TableCell>
                        <TableCell>{asset || "—"}</TableCell>
                        <TableCell>{network || "—"}</TableCell>
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
                        <TableRow key={`${txId}-${idx}-raw`}>
                          <TableCell colSpan={9} className="bg-muted/30">
                            <pre className="text-xs overflow-auto max-h-96 p-2">
                              {JSON.stringify(tx, null, 2)}
                            </pre>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={onPrev} disabled={loading || pageStack.length <= 1}>
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {pageStack.length}
            </span>
            <Button variant="outline" onClick={onNext} disabled={loading || !nextPageKey}>
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
