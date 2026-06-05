import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Plus, Copy, ArrowLeft, Download, Archive, RefreshCw, Trash2, Eye, LogIn, Wallet, ShoppingCart, DollarSign, UserCheck, Target } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

const PUBLIC_BASE = "https://ezonramp.com";

interface CampaignStat {
  id: string;
  tracking_code: string;
  campaign_name: string;
  destination_path: string;
  is_active: boolean;
  created_at: string;
  visits: number;
  sign_ins: number;
  wallets: number;
  purchases: number;
  volume: number;
  sign_in_rate: number;
  purchase_rate: number;
}

interface SessionRow {
  id: string;
  first_seen_at: string;
  last_seen_at: string;
  session_duration_seconds: number;
  landing_path: string | null;
  full_landing_url: string | null;
  referrer_url: string | null;
  signed_in_user_id: string | null;
  wallet_address: string | null;
  country: string | null;
}

interface AttributionRow {
  id: string;
  session_id: string | null;
  onramp_provider: string;
  transaction_id: string;
  purchase_status: string | null;
  fiat_amount: number | null;
  fiat_currency: string | null;
  crypto_amount: number | null;
  crypto_currency: string | null;
  created_at: string;
  wallet_address: string | null;
  user_id: string | null;
}

function genCode(len = 8): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => alphabet[b % alphabet.length]).join("");
}

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function downloadCsv(filename: string, rows: (string | number | null)[][]) {
  const blob = new Blob([rows.map((r) => r.map(csvEscape).join(",")).join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function HeaderIcon({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex justify-end w-full cursor-help" aria-label={label}>{icon}</span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export default function InboundTracking() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<CampaignStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [openCreate, setOpenCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Create form
  const [name, setName] = useState("");
  const [destination, setDestination] = useState<"/" | "/express">("/");
  const [notes, setNotes] = useState("");

  async function loadCampaigns() {
    setLoading(true);
    const { data, error } = await supabase
      .from("inbound_campaign_stats" as never)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Failed to load campaigns", description: error.message, variant: "destructive" });
    } else {
      setCampaigns((data as unknown as CampaignStat[]) || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadCampaigns();
  }, []);

  async function handleCreate() {
    if (!name.trim() || !user) return;
    setCreating(true);
    let lastErr: string | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = genCode(8);
      const { error } = await supabase
        .from("inbound_tracking_campaigns")
        .insert({
          tracking_code: code,
          campaign_name: name.trim(),
          destination_path: destination,
          notes: notes.trim() || null,
          created_by: user.id,
        });
      if (!error) {
        toast({ title: "Campaign created", description: `${PUBLIC_BASE}${destination}?ref=${code}` });
        setName("");
        setNotes("");
        setDestination("/");
        setOpenCreate(false);
        await loadCampaigns();
        setCreating(false);
        return;
      }
      lastErr = error.message;
      if (!/duplicate|unique/i.test(error.message)) break;
    }
    setCreating(false);
    toast({ title: "Failed to create campaign", description: lastErr ?? "Unknown error", variant: "destructive" });
  }

  async function deleteCampaign(c: CampaignStat) {
    const { error } = await supabase
      .from("inbound_tracking_campaigns")
      .delete()
      .eq("id", c.id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Campaign deleted", description: c.campaign_name });
      await loadCampaigns();
    }
  }

  async function toggleActive(c: CampaignStat) {
    const { error } = await supabase
      .from("inbound_tracking_campaigns")
      .update({ is_active: !c.is_active })
      .eq("id", c.id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    } else {
      await loadCampaigns();
    }
  }

  function copyUrl(c: CampaignStat) {
    const url = `${PUBLIC_BASE}${c.destination_path}?ref=${c.tracking_code}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Copied", description: url });
  }

  function exportCampaignsCsv() {
    downloadCsv("inbound-campaigns.csv", [
      ["Campaign", "Destination", "Tracking URL", "Visits", "Sign-ins", "Wallets", "Purchases", "Volume", "Sign-in %", "Purchase %", "Status", "Created"],
      ...campaigns.map((c) => [
        c.campaign_name,
        c.destination_path,
        `${PUBLIC_BASE}${c.destination_path}?ref=${c.tracking_code}`,
        c.visits,
        c.sign_ins,
        c.wallets,
        c.purchases,
        c.volume,
        c.sign_in_rate,
        c.purchase_rate,
        c.is_active ? "Active" : "Archived",
        c.created_at,
      ]),
    ]);
  }

  if (selectedId) {
    const campaign = campaigns.find((c) => c.id === selectedId);
    return <CampaignDetail campaign={campaign} onBack={() => setSelectedId(null)} />;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Tracking Links</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadCampaigns}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCampaignsCsv} disabled={!campaigns.length}>
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
          <Dialog open={openCreate} onOpenChange={setOpenCreate}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New Campaign</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New tracking campaign</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="cn">Campaign name</Label>
                  <Input id="cn" value={name} onChange={(e) => setName(e.target.value)} placeholder="Spring Twitter Push" />
                </div>
                <div>
                  <Label>Destination</Label>
                  <RadioGroup value={destination} onValueChange={(v) => setDestination(v as "/" | "/express")} className="mt-2 flex gap-6">
                    <div className="flex items-center gap-2"><RadioGroupItem value="/" id="d1" /><Label htmlFor="d1">Homepage (/)</Label></div>
                    <div className="flex items-center gap-2"><RadioGroupItem value="/express" id="d2" /><Label htmlFor="d2">Express (/express)</Label></div>
                  </RadioGroup>
                </div>
                <div>
                  <Label htmlFor="nt">Notes (optional)</Label>
                  <Textarea id="nt" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenCreate(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={!name.trim() || creating}>
                  {creating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading campaigns…
          </div>
        ) : campaigns.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No campaigns yet. Create one to start generating tracked links.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Tracking URL</TableHead>
                <TableHead className="text-right"><HeaderIcon icon={<Eye className="h-4 w-4" />} label="Visits" /></TableHead>
                <TableHead className="text-right"><HeaderIcon icon={<LogIn className="h-4 w-4" />} label="Sign-ins" /></TableHead>
                <TableHead className="text-right"><HeaderIcon icon={<Wallet className="h-4 w-4" />} label="Wallets" /></TableHead>
                <TableHead className="text-right"><HeaderIcon icon={<ShoppingCart className="h-4 w-4" />} label="Purchases" /></TableHead>
                <TableHead className="text-right"><HeaderIcon icon={<DollarSign className="h-4 w-4" />} label="Volume" /></TableHead>
                <TableHead className="text-right"><HeaderIcon icon={<UserCheck className="h-4 w-4" />} label="Sign-in %" /></TableHead>
                <TableHead className="text-right"><HeaderIcon icon={<Target className="h-4 w-4" />} label="Purchase %" /></TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c) => {
                const url = `${PUBLIC_BASE}${c.destination_path}?ref=${c.tracking_code}`;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.campaign_name}</TableCell>
                    <TableCell><code className="text-xs">{c.destination_path}</code></TableCell>
                    <TableCell className="max-w-[260px]">
                      <div className="flex items-center gap-1">
                        <code className="truncate text-xs">{url}</code>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copyUrl(c)}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{c.visits}</TableCell>
                    <TableCell className="text-right">{c.sign_ins}</TableCell>
                    <TableCell className="text-right">{c.wallets}</TableCell>
                    <TableCell className="text-right">{c.purchases}</TableCell>
                    <TableCell className="text-right">${Number(c.volume || 0).toFixed(2)}</TableCell>
                    <TableCell className="text-right">{c.sign_in_rate}%</TableCell>
                    <TableCell className="text-right">{c.purchase_rate}%</TableCell>
                    <TableCell>
                      <Badge variant={c.is_active ? "default" : "secondary"}>
                        {c.is_active ? "Active" : "Archived"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => setSelectedId(c.id)}>View</Button>
                        <Button size="sm" variant="ghost" onClick={() => toggleActive(c)} title={c.is_active ? "Archive" : "Activate"}>
                          <Archive className="h-4 w-4" />
                        </Button>
                        {!c.is_active && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="ghost" title="Delete archived campaign" className="text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this campaign?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This permanently deletes "{c.campaign_name}" and all of its tracked sessions, events, and attributions. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteCampaign(c)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ============= Detail view =============

function CampaignDetail({ campaign, onBack }: { campaign?: CampaignStat; onBack: () => void }) {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [attributions, setAttributions] = useState<AttributionRow[]>([]);
  const [loading, setLoading] = useState(true);

  // filters
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [signedInOnly, setSignedInOnly] = useState(false);
  const [purchasedOnly, setPurchasedOnly] = useState(false);
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    if (!campaign) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [sRes, aRes] = await Promise.all([
        supabase
          .from("inbound_tracking_sessions")
          .select("id, first_seen_at, last_seen_at, session_duration_seconds, landing_path, full_landing_url, referrer_url, signed_in_user_id, wallet_address, country")
          .eq("campaign_id", campaign.id)
          .order("first_seen_at", { ascending: false })
          .limit(1000),
        supabase
          .from("inbound_tracking_attributions")
          .select("id, session_id, onramp_provider, transaction_id, purchase_status, fiat_amount, fiat_currency, crypto_amount, crypto_currency, created_at, wallet_address, user_id")
          .eq("campaign_id", campaign.id)
          .order("created_at", { ascending: false })
          .limit(1000),
      ]);
      if (cancelled) return;
      if (sRes.error) toast({ title: "Failed to load sessions", description: sRes.error.message, variant: "destructive" });
      if (aRes.error) toast({ title: "Failed to load attributions", description: aRes.error.message, variant: "destructive" });
      setSessions((sRes.data as SessionRow[]) || []);
      setAttributions((aRes.data as AttributionRow[]) || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [campaign?.id]);

  const attrBySession = useMemo(() => {
    const m = new Map<string, AttributionRow[]>();
    for (const a of attributions) {
      if (!a.session_id) continue;
      if (!m.has(a.session_id)) m.set(a.session_id, []);
      m.get(a.session_id)!.push(a);
    }
    return m;
  }, [attributions]);

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      if (from && new Date(s.first_seen_at) < new Date(from)) return false;
      if (to && new Date(s.first_seen_at) > new Date(to)) return false;
      if (signedInOnly && !s.signed_in_user_id) return false;
      const attrs = attrBySession.get(s.id) || [];
      if (purchasedOnly && attrs.length === 0) return false;
      if (providerFilter !== "all" && !attrs.some((a) => a.onramp_provider === providerFilter)) return false;
      if (statusFilter !== "all" && !attrs.some((a) => (a.purchase_status || "").toLowerCase().includes(statusFilter))) return false;
      return true;
    });
  }, [sessions, attrBySession, from, to, signedInOnly, purchasedOnly, providerFilter, statusFilter]);

  function exportDetailCsv() {
    if (!campaign) return;
    const rows: (string | number | null)[][] = [[
      "First seen", "Last seen", "Duration (s)", "Country", "Landing", "Referrer",
      "User ID", "Wallet", "Provider", "Tx ID", "Status", "Fiat", "Currency", "Crypto", "Asset",
    ]];
    for (const s of filtered) {
      const attrs = attrBySession.get(s.id) || [];
      if (attrs.length === 0) {
        rows.push([s.first_seen_at, s.last_seen_at, s.session_duration_seconds, s.country, s.landing_path, s.referrer_url, s.signed_in_user_id, s.wallet_address, "", "", "", "", "", "", ""]);
      } else {
        for (const a of attrs) {
          rows.push([s.first_seen_at, s.last_seen_at, s.session_duration_seconds, s.country, s.landing_path, s.referrer_url, s.signed_in_user_id, s.wallet_address, a.onramp_provider, a.transaction_id, a.purchase_status, a.fiat_amount, a.fiat_currency, a.crypto_amount, a.crypto_currency]);
        }
      }
    }
    downloadCsv(`campaign-${campaign.tracking_code}.csv`, rows);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
          <CardTitle>{campaign?.campaign_name ?? "Campaign"}</CardTitle>
          {campaign && <Badge variant="outline"><code className="text-xs">{PUBLIC_BASE}{campaign.destination_path}?ref={campaign.tracking_code}</code></Badge>}
        </div>
        <Button size="sm" variant="outline" onClick={exportDetailCsv} disabled={!filtered.length}>
          <Download className="h-4 w-4 mr-1" /> Export CSV
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Provider</Label>
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="coinbase">Coinbase</SelectItem>
                <SelectItem value="stripe">Stripe</SelectItem>
                
                <SelectItem value="coinflow">Coinflow</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="complet">Completed</SelectItem>
                <SelectItem value="fail">Failed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={signedInOnly} onChange={(e) => setSignedInOnly(e.target.checked)} />
              Signed-in only
            </label>
          </div>
          <div className="flex items-end gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={purchasedOnly} onChange={(e) => setPurchasedOnly(e.target.checked)} />
              Purchased only
            </label>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading sessions…
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No sessions match the current filters.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>First seen</TableHead>
                <TableHead>Last seen</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Landing</TableHead>
                <TableHead>Referrer</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Wallet</TableHead>
                <TableHead>Purchases</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => {
                const attrs = attrBySession.get(s.id) || [];
                const dur = s.session_duration_seconds || 0;
                const durLabel = dur > 60 ? `${Math.floor(dur / 60)}m ${dur % 60}s` : `${dur}s`;
                return (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs">{new Date(s.first_seen_at).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{new Date(s.last_seen_at).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{durLabel}</TableCell>
                    <TableCell className="text-xs">{s.country || "—"}</TableCell>
                    <TableCell className="text-xs max-w-[160px] truncate" title={s.full_landing_url || ""}>{s.landing_path || "—"}</TableCell>
                    <TableCell className="text-xs max-w-[160px] truncate" title={s.referrer_url || ""}>{s.referrer_url ? new URL(s.referrer_url).hostname : "—"}</TableCell>
                    <TableCell className="text-xs">{s.signed_in_user_id ? s.signed_in_user_id.slice(0, 8) + "…" : "—"}</TableCell>
                    <TableCell className="text-xs">{s.wallet_address ? s.wallet_address.slice(0, 6) + "…" + s.wallet_address.slice(-4) : "—"}</TableCell>
                    <TableCell>
                      {attrs.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          {attrs.map((a) => (
                            <div key={a.id} className="text-xs">
                              <Badge variant="outline" className="mr-1">{a.onramp_provider}</Badge>
                              {a.purchase_status || "?"} · ${Number(a.fiat_amount || 0).toFixed(2)}
                            </div>
                          ))}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
