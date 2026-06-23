"use client";

// ============================================================
// Billing panel — current plan, usage vs. limits, and the
// subscribe / manage actions.
//
// Reads `subscriptions` (member SELECT is allowed by RLS) and a few
// usage counts directly with the browser client. Mutations go
// through the owner-only API routes (/api/billing/checkout,
// /api/billing/portal) — never written from the client, since the
// table has no user write policy.
//
// Imports ONLY from `@/lib/billing/plans` (pure). `subscription.ts`
// is server-only (it pulls in next/headers via account.ts) and must
// not be imported here.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, Sparkles } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PLANS, PLAN_TIERS, ENTITLED_STATUSES, effectiveMaxMembers, effectiveTier, formatLimit, type PlanTier, type SubscriptionStatus } from "@/lib/billing/plans";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SettingsPanelHead } from "./settings-panel-head";

interface SubRow {
  plan: PlanTier;
  status: SubscriptionStatus;
  stripe_customer_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  extra_seats: number;
}

interface Usage {
  whatsapp: number;
  members: number;
  automations: number;
  flows: number;
}

export function BillingPanel() {
  const supabase = createClient();
  const { accountId, isOwner } = useAuth();
  const searchParams = useSearchParams();

  const [sub, setSub] = useState<SubRow | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  // Surface the checkout return state once.
  useEffect(() => {
    const r = searchParams.get("checkout");
    if (r === "success") toast.success("Assinatura ativada. Bem-vindo!");
    else if (r === "cancel") toast.info("Checkout cancelado.");
  }, [searchParams]);

  const load = useCallback(async () => {
    if (!accountId) return;
    // try/await/finally — same shape as MembersTab.loadEverything so
    // every setState runs after the first await (react-hooks/
    // set-state-in-effect). `loading` starts true; cleared in finally.
    try {
      const [{ data: subRow }, wa, mem, au, fl] = await Promise.all([
        supabase
          .from("subscriptions")
          .select(
            "plan, status, stripe_customer_id, current_period_end, cancel_at_period_end, extra_seats",
          )
          .eq("account_id", accountId)
          .maybeSingle(),
        supabase
          .from("whatsapp_config")
          .select("*", { count: "exact", head: true })
          .eq("account_id", accountId)
          .eq("status", "connected"),
        supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .eq("account_id", accountId),
        supabase
          .from("automations")
          .select("*", { count: "exact", head: true })
          .eq("account_id", accountId),
        supabase
          .from("flows")
          .select("*", { count: "exact", head: true })
          .eq("account_id", accountId),
      ]);

      setSub(
        (subRow as SubRow | null) ?? {
          plan: "free",
          status: "active",
          stripe_customer_id: null,
          current_period_end: null,
          cancel_at_period_end: false,
          extra_seats: 0,
        },
      );
      setUsage({
        whatsapp: wa.count ?? 0,
        members: mem.count ?? 0,
        automations: au.count ?? 0,
        flows: fl.count ?? 0,
      });
    } catch (err) {
      console.error("[BillingPanel] load error:", err);
      toast.error("Não foi possível carregar seu plano.");
    } finally {
      setLoading(false);
    }
  }, [accountId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(path: string, body?: unknown): Promise<void> {
    setActing(true);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) {
        toast.error(json.error ?? "Não foi possível continuar. Tente novamente.");
        setActing(false);
        return;
      }
      window.location.href = json.url as string;
    } catch {
      toast.error("Falha de rede. Tente novamente.");
      setActing(false);
    }
  }

  if (loading || !sub || !usage) {
    return (
      <section className="max-w-3xl">
        <SettingsPanelHead
          title="Plano e cobrança"
          description="Gerencie sua assinatura e veja o uso do plano."
        />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Carregando...
        </div>
      </section>
    );
  }

  const entitled = ENTITLED_STATUSES.has(sub.status);
  const subInfo = { plan: sub.plan, status: sub.status, extraSeats: sub.extra_seats };
  const activeTier: PlanTier = effectiveTier(subInfo);
  const limits = PLANS[activeTier].limits;
  const seatLimit = effectiveMaxMembers(subInfo);
  const hasCustomer = Boolean(sub.stripe_customer_id);

  const rows: { label: string; used: number; limit: number }[] = [
    { label: "Números de WhatsApp", used: usage.whatsapp, limit: limits.maxWhatsappNumbers },
    { label: "Membros da equipe", used: usage.members, limit: seatLimit },
    { label: "Automações", used: usage.automations, limit: limits.maxAutomations },
    { label: "Fluxos", used: usage.flows, limit: limits.maxFlows },
  ];

  return (
    <section className="max-w-3xl animate-in fade-in-50 duration-200 space-y-6">
      <SettingsPanelHead
        title="Plano e cobrança"
        description="Gerencie sua assinatura e veja o uso do plano."
      />

      {/* Current plan + actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Sparkles className="size-4 text-primary" />
            Plano {PLANS[activeTier].name}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {activeTier === "free"
              ? "Faça upgrade para Pro ou Business para conectar o WhatsApp e liberar o produto."
              : sub.cancel_at_period_end
                ? "Sua assinatura será cancelada ao fim do período atual."
                : "Assinatura ativa."}
            {sub.current_period_end && entitled && (
              <>
                {" "}
                Próxima renovação:{" "}
                {new Date(sub.current_period_end).toLocaleDateString("pt-BR")}.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isOwner && (
            <p className="text-xs text-muted-foreground">
              Somente o proprietário da conta pode gerenciar a cobrança.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {hasCustomer && (
              <Button
                onClick={() => post("/api/billing/portal")}
                disabled={!isOwner || acting}
                variant="outline"
              >
                {acting ? <Loader2 className="size-4 animate-spin" /> : null}
                Gerenciar assinatura
              </Button>
            )}
            {activeTier !== "pro" && (
              <Button
                onClick={() => post("/api/billing/checkout", { tier: "pro" })}
                disabled={!isOwner || acting}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {acting ? <Loader2 className="size-4 animate-spin" /> : null}
                {activeTier === "free" ? "Assinar Pro" : "Mudar para Pro"}
              </Button>
            )}
            {activeTier !== "business" && (
              <Button
                onClick={() => post("/api/billing/checkout", { tier: "business" })}
                disabled={!isOwner || acting}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {acting ? <Loader2 className="size-4 animate-spin" /> : null}
                {activeTier === "free" ? "Assinar Business" : "Mudar para Business"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Usage */}
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Uso do plano</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li
                key={r.label}
                className="flex items-center justify-between py-2.5 text-sm"
              >
                <span className="text-muted-foreground">{r.label}</span>
                <span className="font-medium text-foreground">
                  {r.used} / {formatLimit(r.limit)}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Plan comparison */}
      <div className="grid gap-4 sm:grid-cols-3">
        {PLAN_TIERS.map((tier) => {
          const p = PLANS[tier];
          const current = tier === activeTier;
          return (
            <Card key={tier} className={current ? "border-primary" : undefined}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-foreground">
                  {p.name}
                  {current && <Check className="size-4 text-primary" />}
                </CardTitle>
                <CardDescription>
                  {p.priceMonthlyBRL === 0
                    ? "Grátis"
                    : `R$ ${p.priceMonthlyBRL}/mês`}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-1">
                <div>
                  WhatsApp: {formatLimit(p.limits.maxWhatsappNumbers)}
                </div>
                <div>Membros: {formatLimit(p.limits.maxMembers)}</div>
                <div>Transmissões/mês: {formatLimit(p.limits.monthlyBroadcasts)}</div>
                <div>Automações: {formatLimit(p.limits.maxAutomations)}</div>
                <div>Fluxos: {formatLimit(p.limits.maxFlows)}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
