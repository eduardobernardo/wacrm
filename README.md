# wacrm — CRM Template for WhatsApp

> Self-hostable CRM template for WhatsApp® — shared inbox, contacts,
> sales pipelines, broadcasts, and no-code automations. Fork it, brand
> it, host it.

<p align="center">
  <a href="https://www.hostinger.com/web-apps-hosting">
    <img src="./.github/assets/hostinger-deploy.png" alt="Ship your Node.js app in one click — Deploy to Hostinger" width="900">
  </a>
</p>

[![License: MIT](https://img.shields.io/badge/License-MIT-violet.svg)](./LICENSE)
[![CI](https://github.com/ArnasDon/wacrm/actions/workflows/ci.yml/badge.svg)](https://github.com/ArnasDon/wacrm/actions/workflows/ci.yml)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)](https://nextjs.org)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth-3ecf8e?logo=supabase)](https://supabase.com)
[![Stars](https://img.shields.io/github/stars/ArnasDon/wacrm?style=social)](https://github.com/ArnasDon/wacrm/stargazers)

The marketing site and self-host docs live in a separate repo:
[ArnasDon/wacrm-site](https://github.com/ArnasDon/wacrm-site)
([wacrm.tech](https://wacrm.tech)). This repo is the product —
clone or fork it to run your own CRM.

## What you get out of the box

- **Shared inbox** on the official WhatsApp Business API — multiple
  agents working one number, per-conversation assignment, status, and
  notes.
- **Contacts + tags + custom fields**, CSV import, deduplication.
- **Sales pipelines** (Kanban) with deals linked to conversations.
- **Broadcasts** with Meta-approved templates, delivery + read
  tracking, per-recipient variable substitution.
- **No-code automations** — triggers on inbound messages, new
  contacts, keywords, or schedule; conditional branches, waits,
  tags, webhooks. Visual builder.
- **Real-time dashboard** — response times, daily volume, pipeline
  value, cross-module activity feed.
- **Team accounts** — invite teammates by link, role-based access
  (owner / admin / agent / viewer), ownership transfer. Every install
  is account-scoped, so one shared inbox can be staffed by a whole
  team. Solo use stays single-user with zero setup.
- **Departments** — segment your team into departments (support, sales,
  etc.). Conversations are isolated per department via RLS; agents only
  see what they're assigned to or what belongs to their department.
  Transfer conversations manually in the inbox, route via automations
  or flow handoff nodes, and direct broadcast replies to the right team.
- **Account management** — email, password, avatar, global sign-out.
- **Planos e cobrança (SaaS)** — três planos (Gratuito, Pro R$99, Business R$249).
  Stripe Checkout para assinar, Customer Portal para auto-gestão. Limites por plano
  com enforcement no servidor; WhatsApp exige Pro ou superior. Pronto para
  multi-número e seats avulsos como add-ons futuros.

## Why fork this?

This is a **template**, not a product. Forking means you get:

- **Full ownership** — your code, your Supabase project, your domain,
  your data. No SaaS lock-in, no seat pricing, no trust dance.
- **Full customisation** — add the fields your team needs, remove the
  modules you don't, redesign anything. The stack is boring on
  purpose (Next.js + Supabase + Tailwind) so the learning curve is
  short.
- **Zero ops to start** — [Hostinger](https://www.hostinger.com/web-apps-hosting)
  Managed Node.js deploys a fork in a few clicks. No Docker, no
  Kubernetes, no infra team needed.
  ([See below ↓](#-deploy-on-hostinger-recommended))
- **Real security primitives** — token encryption (AES-256-GCM), RLS
  on every table, HMAC-verified webhooks, CSP, rate limiting, CI
  typecheck/build on every PR.

Not a framework. Not an SDK. A concrete, working CRM you can stand up
in an afternoon and make yours.

## Quick start

```bash
# Fork on GitHub first: https://github.com/ArnasDon/wacrm → Fork
git clone https://github.com/<your-username>/wacrm.git
cd wacrm
npm install
cp .env.local.example .env.local   # fill in Supabase + Meta creds
npm run dev
```

Open <http://localhost:3000>. You'll be redirected to `/login` (or
`/dashboard` if already signed in).

## 🚀 Deploy on Hostinger (recommended)

<p align="center">
  <a href="https://www.hostinger.com/web-apps-hosting">
    <img src="./.github/assets/hostinger-deploy.png" alt="Ship your Node.js app in one click — Deploy to Hostinger" width="1000">
  </a>
</p>
<p align="center">
  <a href="https://wacrm.tech/docs/deployment-hostinger">
    <img src="https://img.shields.io/badge/Step--by--step_guide-wacrm.tech%2Fdocs-111?style=for-the-badge" alt="Step-by-step guide" height="44">
  </a>
</p>

**wacrm is built to run on [Hostinger](https://www.hostinger.com/web-apps-hosting).**
It's the path we test, document, and recommend — and the fastest way
to get a production-grade CRM live without owning a VPS or a
Kubernetes cluster.

### Why Hostinger?

| | |
|---|---|
| **One-click Git deploy** | Connect your fork, push to `main`, Hostinger builds and ships it. No SSH, no Docker, no CI to wire up — this repo's own `main` deploys this way. |
| **Managed Node.js** | Next.js 16 (App Router, server actions, ISR) runs out of the box on [Premium, Business, and Cloud](https://www.hostinger.com/web-apps-hosting) shared plans. You don't manage Node versions, processes, or reverse proxies. |
| **Free SSL + free domain** | Automatic Let's Encrypt on your custom domain (or a free one included with annual plans). HTTPS is on by default — required for the WhatsApp Business webhook. |
| **Global CDN + LiteSpeed** | Static assets cached at the edge, dynamic routes served from LiteSpeed. Snappy dashboards out of the box, no Cloudflare setup required. |
| **Env vars + logs in hPanel** | Set `SUPABASE_*`, `WHATSAPP_*`, and `ENCRYPTION_KEY` from the panel — no `.env` on the server. Live application logs in the same UI. |
| **DDoS protection + daily backups** | Built-in, no add-ons. The webhook endpoint is a public target — having protection at the edge matters. |
| **Cheaper than a VPS** | Plans start at a few dollars a month — order-of-magnitude less than a comparable managed Node.js host, and you don't pay extra for the database (that's Supabase). |
| **24/7 human support** | Live chat support in 20+ languages — useful when your CRM is the thing your team relies on to talk to customers. |

### The 60-second version

1. **Fork** this repo on GitHub.
2. In **hPanel → Websites → Create**, pick **Node.js** and connect
   your fork.
3. Paste your Supabase + Meta env vars into hPanel.
4. Push to `main`. Hostinger builds and serves it. Done.

Full walkthrough with screenshots:
**[wacrm.tech/docs/deployment-hostinger](https://wacrm.tech/docs/deployment-hostinger)**.

> _Note: wacrm is MIT-licensed and runs anywhere Node.js does
> (Vercel, Railway, your own VPS). Hostinger is recommended, not
> required._

## Documentation

Full self-host documentation — Supabase migrations, WhatsApp Business
API config, and production deploy — lives at
**[wacrm.tech/docs](https://wacrm.tech/docs)**
(source: [ArnasDon/wacrm-site](https://github.com/ArnasDon/wacrm-site)).

Key pages:
- [Getting started](https://wacrm.tech/docs/getting-started)
- [Supabase setup](https://wacrm.tech/docs/supabase-setup)
- [WhatsApp setup](https://wacrm.tech/docs/whatsapp-setup)
- [Environment variables](https://wacrm.tech/docs/environment-variables)
- [Deploy on Hostinger](https://wacrm.tech/docs/deployment-hostinger)
- [Architecture](https://wacrm.tech/docs/architecture)
- [Troubleshooting](https://wacrm.tech/docs/troubleshooting)

## ☁️ Billing (Stripe) — modo SaaS

wacrm inclui uma camada de planos e cobrança via Stripe. Contas novas
começam no plano **Gratuito** (não conecta WhatsApp). Para liberar o
produto, o usuário assina **Pro** (R$99/mês) ou **Business** (R$249/mês).

Quem faz self-host **sem cobrar** pode ignorar esta seção: basta editar
os limites do plano `free` em `src/lib/billing/plans.ts` para liberar
todos os recursos sem precisar de Stripe.

### Planos

| | Gratuito | Pro | Business |
|---|---|---|---|
| **Preço** | R$ 0 | R$ 99/mês | R$ 249/mês |
| **WhatsApp** | ❌ | 1 número | 1 número |
| **Membros (base)** | 1 | 5 | 20 |
| **Contatos** | 0 | 10.000 | Ilimitado |
| **Transmissões/mês** | 0 | 20 | Ilimitado |
| **Automações** | 0 | 10 | Ilimitado |
| **Fluxos** | 0 | 10 | Ilimitado |

### Configurar o Stripe

**1. Crie os produtos no Stripe Dashboard**

Acesse [Stripe → Produtos](https://dashboard.stripe.com/products) e crie
dois produtos recorrentes mensais (Pro R$99, Business R$249). Anote os
**Price IDs** (ex.: `price_abc123`).

**2. Configure as variáveis de ambiente**

```bash
STRIPE_SECRET_KEY=sk_live_xxx        # Chave secreta (API keys)
STRIPE_WEBHOOK_SECRET=whsec_xxx     # Segredo do webhook
STRIPE_PRICE_PRO=price_abc123       # Price ID do Pro
STRIPE_PRICE_BUSINESS=price_def456  # Price ID do Business
```

**3. Aplique a migration**

```bash
supabase db push   # ou cole 030_billing.sql no SQL Editor
```

A migration é idempotente. Contas existentes recebem `plan='free'`.

**4. Configure o webhook**

No [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks),
crie um endpoint para `https://seu-dominio.com/api/billing/webhook`
com os eventos:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

Copie o **Signing secret** para `STRIPE_WEBHOOK_SECRET`.

> Para testes locais, use `stripe listen --forward-to localhost:3000/api/billing/webhook`
> e chaves de teste (`sk_test_xxx`). O cartão `4242 4242 4242 4242` simula
> pagamento aprovado.

**5. Ative o Customer Portal**

Em [Stripe → Customer Portal](https://dashboard.stripe.com/settings/billing/portal),
ative o portal e configure os produtos Pro e Business como gerenciáveis.
URL de retorno: `https://seu-dominio.com/settings?tab=billing`.

**6. Verifique**

1. Crie um usuário novo → `SELECT * FROM subscriptions` deve mostrar `plan='free'`.
2. Configurações → WhatsApp → tentar conectar → **bloqueado** (requer upgrade).
3. Configurações → Plano e cobrança → Assinar Pro → completar checkout.
4. Após pagamento (webhook), WhatsApp é liberado.
5. Customer Portal → cancelar → ao fim do período volta a `free`.

### Arquitetura de billing

- **Fonte da verdade:** o webhook do Stripe (`POST /api/billing/webhook`) é o
  único escritor da tabela `subscriptions` (usa service-role, bypassa RLS).
  Membros só leem — não há write policy para usuários.
- **Paywall:** conectar WhatsApp é o gate principal. `free` tem
  `maxWhatsappNumbers: 0` e a rota `POST /api/whatsapp/config` bloqueia antes
  de qualquer chamada à Meta.
- **Limites:** definidos em TypeScript (`src/lib/billing/plans.ts`), não no
  banco — ajuste sem nova migration.
- **Seats extras e múltiplos números:** colunas e helpers já existem para
  evoluções futuras. Detalhes em [`plans/saas-billing-follow-up.md`](plans/saas-billing-follow-up.md).

## Stack

- **App** — Next.js 16 (App Router), React 19, TypeScript, Tailwind v4.
- **Data** — Supabase (Postgres + Auth + Storage + RLS).
- **WhatsApp** — Meta Cloud API (official WhatsApp Business API).

## Contributing

This is a template, not a collaborative product — the expected flow is
fork → customise → deploy, **not** upstream contribution. Bug reports
and security issues are welcome; feature PRs often belong in your fork
rather than here. Details in
[`CONTRIBUTING.md`](./CONTRIBUTING.md) and
[`.github/SECURITY.md`](./.github/SECURITY.md).

## License

[MIT](./LICENSE). Fork it, brand it, host it.
