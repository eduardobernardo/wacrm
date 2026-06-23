# Plano de Follow-up: SaaS Billing — itens pendentes e melhorias

**Projeto:** wacrm (Self-hostable WhatsApp CRM)
**Stack:** Next.js 16 (App Router) + React 19 + Supabase + Stripe
**Branch de origem:** `feat/billing`
**Implementado em:** 2026-06-23
**Status:** Proposta / aguardando sprint

---

## Contexto (o que já foi feito)

O MVP de billing foi implementado na branch `feat/billing`:

- **Migração `030_billing.sql`** — tabela `subscriptions` (1:1 `accounts`), enums `plan_tier_enum` (`free`/`pro`/`business`), `subscription_status_enum`, coluna `extra_seats`. RLS: SELECT para membros; **nenhuma policy de write para usuários** (Stripe webhook usa service-role). Trigger `AFTER INSERT ON accounts` bootstraps `free` em toda conta nova.
- **`src/lib/billing/plans.ts`** — definição dos planos, limites e preços (Pro R$99, Business R$249). `free` tem `maxWhatsappNumbers: 0` — não conecta WhatsApp. Funções puras `effectiveTier`/`effectiveMaxMembers`/`ENTITLED_STATUSES` para cliente e servidor.
- **`src/lib/billing/subscription.ts`** — `getSubscription`, `assertWithinLimit` (recursos: members, contacts, automations, flows, broadcasts), `assertWhatsappEntitled` (paywall principal), `assertCanConnectWhatsapp` (para multi-número futuro). Reusa `ForbiddenError` de `src/lib/auth/account.ts`.
- **`src/lib/billing/stripe.ts`** + **`src/lib/billing/admin-client.ts`** — cliente Stripe lazy, resolução de Price IDs via env vars, cliente service-role Supabase.
- **Enforcement** — `api/whatsapp/config` POST: `assertWhatsappEntitled` antes de qualquer chamada Meta; `api/automations/route.ts` POST: `assertWithinLimit("automations")`; `api/flows/route.ts` POST: `assertWithinLimit("flows")`; `api/account/invitations/route.ts` POST: `assertWithinLimit("members")` (seats).
- **Rotas Stripe** — `POST /api/billing/checkout` (owner-only, cria customer + Checkout Session), `POST /api/billing/portal` (owner-only, Customer Portal), `POST /api/billing/webhook` (service-role, assinatura HMAC, raw body via `request.text()` conforme Next 16). Webhook processa `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
- **UI** — `src/components/settings/billing-panel.tsx` (consumo, botões assinar/gerenciar, comparação de planos). Registrado na rail de settings como "Plano e cobrança" (`settings-sections.ts` + `page.tsx`). Strings pt-BR.
- **Testes** — `plans.test.ts` + `subscription.test.ts` (22 testes, Vitest).
- **`npm i stripe@^22`** adicionado ao `package.json`.
- **`.env.local.example`** atualizado com `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS`.

---

## 1. Itens pendentes (não implementados, arquitetados)

### 1.1 Cap de transmissões mensais (`monthlyBroadcasts`)

**Problema:** a tabela `broadcasts` é populada por um `insert` direto no client (`src/app/(dashboard)/broadcasts/new/page.tsx:102`). O broadcast não tem rota de servidor própria que crie a linha — o `POST /api/whatsapp/broadcast` **envia** os destinatários mas não insere/metadados no broadcast pai. Logo não há onde chamar `assertWithinLimit("broadcasts")`.

**Abordagem recomendada:** criar `POST /api/broadcasts` como rota de criação, movendo o `insert` do client para o servidor. O client passa a fazer `fetch()` + redirect em vez de `supabase.from().insert()`. Dentro do handler, adicionar `await assertWithinLimit(ctx, "broadcasts")`.

**Arquivos a tocar (estimativa ~M):**
- `src/app/api/broadcasts/route.ts` — nova rota `POST`, com `requireRole('agent')` e `assertWithinLimit`.
- `src/app/(dashboard)/broadcasts/new/page.tsx` — trocar `supabase.from('broadcasts').insert()` por `fetch('/api/broadcasts', { method: 'POST', body })`.
- Testes de integração manual: criar broadcast no free → 403; criar no pro dentro do limite → OK; estourar limite → 403.

### 1.2 Múltiplos números de WhatsApp no plano Business

**Contexto:** hoje `whatsapp_config` tem `UNIQUE(account_id)`, ou seja, **um número por conta**. Para o plano Business suportar múltiplos números, é preciso:

1. **Remover a `UNIQUE(account_id)`** de `whatsapp_config` e substituir por uma `UNIQUE(account_id, phone_number_id)`.
2. **Atualizar todas as queries** que usam `.eq('account_id').single()` e assumem um único número — especialmente:
   - `src/app/api/whatsapp/webhook/route.ts` — hoje faz `.eq('phone_number_id').single()` para resolver a config e `account_id` do webhook. Com múltiplos números, essa query já funciona (phone_number_id é único globalmente). O que muda é que o webhook precisa saber **qual** dos números da conta recebeu a mensagem e potencialmente rotear para o inbox correto.
   - `src/app/api/whatsapp/config/route.ts` GET — hoje resolve por `account_id` e retorna uma única config. Passa a retornar lista.
   - `src/components/settings/whatsapp-config.tsx` — UI de configuração mostra formulário único. Passa a listar números + "Adicionar número".
3. **Adicionar coluna `label` ou `display_name`** em `whatsapp_config` para identificar cada número (ex.: "Suporte", "Vendas").
4. **Inbox multi-número:** filtro/seletor de número no inbox; mensagens inbound precisam de `whatsapp_config_id` na tabela `messages` ou `conversations` para saber a qual número pertencem.
5. **Substituir** `assertWhatsappEntitled` por `assertCanConnectWhatsapp` no handler de POST da config (o helper count-based já existe e está pronto).

**Restrições do modelo de dados atual a considerar:**
- `conversations` não tem coluna `whatsapp_config_id` — inbound messages sabem o `phone_number_id` pelo webhook, mas a conversa hoje é linkada só por `contact_id`. O número que recebeu a mensagem **não** é persistido. Para multi-número, é preciso adicionar `whatsapp_config_id` em `conversations` e `messages`.
- `message_templates` são por `whatsapp_config_id` (cada número tem seus próprios templates no Meta) — o modelo disso já existe.

**Arquivos a tocar (estimativa ~G):**
- Nova migration `031_multi_whatsapp.sql`:
  - `ALTER TABLE whatsapp_config DROP CONSTRAINT IF EXISTS whatsapp_config_account_id_key;` + criar `UNIQUE(account_id, phone_number_id)`.
  - `ALTER TABLE whatsapp_config ADD COLUMN IF NOT EXISTS label TEXT;`
  - `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS whatsapp_config_id UUID REFERENCES whatsapp_config(id) ON DELETE SET NULL;`
  - `ALTER TABLE messages ADD COLUMN IF NOT EXISTS whatsapp_config_id UUID REFERENCES whatsapp_config(id) ON DELETE SET NULL;` (ou inferir via join com conversations — preferir FK direta para performance do inbox).
  - Índices correspondentes.
  - Backfill de `conversations.whatsapp_config_id` / `messages.whatsapp_config_id` via a `whatsapp_config` existente (onde `account_id` casa).
- `src/app/api/whatsapp/webhook/route.ts` — persistir `whatsapp_config_id` em `processMessage`; passar para `findOrCreateConversation`.
- `src/app/api/whatsapp/config/route.ts` — GET retorna array; POST troca `assertWhatsappEntitled` por `assertCanConnectWhatsapp` (já existente).
- `src/components/settings/whatsapp-config.tsx` — lista + botão "Conectar novo número".
- `src/components/inbox/` — seletor de número (se houver > 1), filtrar conversas por `whatsapp_config_id`.
- `src/types/index.ts` — atualizar tipos `WhatsappConfig`, `Conversation`, `Message`.

### 1.3 Seats avulsos (extra seats add-on)

**Contexto:** a coluna `subscriptions.extra_seats` já existe e `effectiveMaxMembers` já computa `base + extraSeats`. A lógica de enforcement em `assertWithinLimit("members")` já usa `effectiveMaxMembers`. O que falta é o **fluxo de compra**: o usuário precisa conseguir comprar seats extras e o Stripe precisa cobrar por eles.

**Abordagem recomendada:**
1. No Stripe Dashboard, criar um **Product** "Seat extra" com **Price** recorrente (ex.: R$30/seat/mês).
2. No Customer Portal, configurar para permitir **quantity-based adjustments** nesse price (o usuário ajusta a quantidade de seats).
3. Alternativa mais simples para MVP: seats extras são comprados **fora da assinatura recorrente** — um `POST /api/billing/checkout` com parâmetro `mode: 'payment'` (one-time) para N seats. Mas isso não é recorrente, o que quebra o modelo. **Recomendado usar Stripe's "per-seat" pricing no próprio Checkout** com `quantity` ajustável — mas isso exige refazer o fluxo de upgrade para incluir seats como line item.

**Abordagem mais enxuta (MVP rápido):**
- Não integrar seats avulsos ao Stripe ainda. Deixar a coluna `extra_seats` e o cálculo no código prontos.
- Oferecer seats como **ajuste manual** (admin do SaaS seta na mão via Supabase Dashboard, ou uma rota admin-only).
- Quando houver volume para justificar o esforço de integração, implementar o fluxo completo.

**Arquivos a tocar (estimativa ~M, só com fluxo manual; ~G com integração Stripe):**
- Se manual: `PATCH /api/billing/seats` (owner-only, incrementa/decrementa `extra_seats`, validando contra o plano).
- Se integrado ao Stripe: refatorar Checkout para incluir seats como line item; webhook lê quantity e atualiza `extra_seats`; Customer Portal config.
- UI: seção "Seats extras" no `billing-panel.tsx` mostrando quantidade atual e botão "Comprar mais seats".

---

## 2. Itens de hardening (qualidade e DX)

### 2.1 Rate limiting nas rotas de checkout/portal

As rotas `POST /api/billing/checkout` e `POST /api/billing/portal` não têm rate limit. Adicionar `checkRateLimit` (seguindo o padrão de `src/app/api/account/invitations/route.ts`) para evitar abuso.

### 2.2 Teste de integração do webhook

Hoje os testes cobrem a lógica pura (planos, limites). Falta um teste de integração que:
1. Simula um payload de webhook do Stripe (`checkout.session.completed`).
2. Verifica que a linha `subscriptions` foi atualizada corretamente (plan pro, status active, stripe_subscription_id preenchido).

O Stripe SDK oferece `stripe.webhooks.generateTestHeaderString` para gerar assinaturas de teste. Pode-se fazer um teste que usa o service-role client do Supabase local + um payload fixo com assinatura mockada.

### 2.3 Tela de preços pública (landing)

O billing panel em Settings é para usuários logados. Uma landing page pública em `/pricing` (ou integrada ao site em `wacrm-site`) mostrando os planos para não-clientes. Fora do escopo do MVP mas importante para aquisição.

### 2.4 Logs de billing

Adicionar uma tabela `billing_events` (opcional) para registrar eventos de webhook processados, checkouts iniciados, etc. Útil para suporte ("por que o cliente X caiu para free?").

---

## 3. Instruções para colocar no ar (go-live)

Estas instruções também estão no `README.md` (seção Billing).

### 3.1 Pré-requisitos

- Conta no [Stripe](https://stripe.com/br) com cobrança em BRL ativada.
- Node.js ≥ 20, acesso ao terminal e ao Supabase Dashboard.

### 3.2 Criar produtos e preços no Stripe

1. Acesse [Stripe Dashboard → Produtos](https://dashboard.stripe.com/products).
2. Crie dois produtos recorrentes (mensais):
   - **Pro** — R$ 99,00/mês
   - **Business** — R$ 249,00/mês
3. Anote os **Price IDs** (ex.: `price_abc123`, `price_def456`).

### 3.3 Configurar variáveis de ambiente

No `.env.local` (ou no painel do seu host), adicione:

```bash
STRIPE_SECRET_KEY=sk_live_xxx        # Chave secreta (Stripe → API keys)
STRIPE_WEBHOOK_SECRET=whsec_xxx     # Segredo de assinatura do webhook
STRIPE_PRICE_PRO=price_abc123       # Price ID do plano Pro
STRIPE_PRICE_BUSINESS=price_def456  # Price ID do plano Business
```

> Para testes locais, use `sk_test_xxx` e gere o webhook secret com `stripe listen --forward-to localhost:3000/api/billing/webhook`.

### 3.4 Aplicar a migration

```bash
# Com Supabase CLI:
supabase db push

# Ou diretamente no SQL Editor do Supabase Dashboard:
# cole o conteúdo de supabase/migrations/030_billing.sql
```

A migration é idempotente — pode rodar múltiplas vezes. Contas existentes recebem `plan='free'` automaticamente.

### 3.5 Configurar o webhook no Stripe

1. Acesse [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks).
2. Crie um endpoint apontando para `https://seu-dominio.com/api/billing/webhook`.
3. Selecione os eventos:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Copie o **Signing secret** e cole em `STRIPE_WEBHOOK_SECRET`.

> O webhook é a **fonte da verdade** do estado pago — sem ele, assinaturas nunca saem de `free`.

### 3.6 Configurar o Customer Portal

1. Acesse [Stripe Dashboard → Customer Portal](https://dashboard.stripe.com/settings/billing/portal).
2. Ative o portal e configure:
   - **Produtos e preços** que o cliente pode gerenciar (Pro, Business).
   - **Permitir upgrade/downgrade** entre planos.
   - URL de retorno: `https://seu-dominio.com/settings?tab=billing`.

### 3.7 Verificação end-to-end

1. Crie um usuário novo no CRM → verifique no Supabase (`SELECT * FROM subscriptions`) que a linha foi criada com `plan='free'`.
2. Vá em Configurações → WhatsApp → tente conectar → **deve bloquear** com mensagem de upgrade.
3. Vá em Configurações → Plano e cobrança → clique em "Assinar Pro".
4. Complete o checkout com um cartão de teste (`4242 4242 4242 4242`).
5. Após pagamento, o webhook atualiza `subscriptions` para `pro`/`active`.
6. Volte para Configurações → WhatsApp → agora **deve permitir** conectar.
7. Cancele pelo Customer Portal → webhook marca `cancel_at_period_end`. Ao fim do período, volta para `free` e o WhatsApp é desabilitado.

---

## 4. Sequenciamento recomendado

```
Go-live (MVP atual) ─► hardening (rate-limit, logs) ─► cap broadcasts (1.1)
                                                     └─► seats manuais (1.3 via PATCH)
                                                     └─► multi-número (1.2) — maior esforço
```

O **cap de broadcasts** (1.1) e **seats** (1.3) são independentes e pequenos — podem sair na mesma sprint. O **multi-número** (1.2) é o item de maior risco e esforço; recomendo planejar com calma após o MVP estar em produção e gerando receita.

---

## 5. Mapa de arquivos relevantes

| Arquivo | O que faz |
|---|---|
| `supabase/migrations/030_billing.sql` | Tabela `subscriptions`, types, RLS, trigger de bootstrap |
| `src/lib/billing/plans.ts` | Planos, limites, preços; `ENTITLED_STATUSES`, `effectiveTier`, `effectiveMaxMembers` (puro, seguro p/ cliente) |
| `src/lib/billing/subscription.ts` | `getSubscription`, `assertWithinLimit`, `assertWhatsappEntitled`, `assertCanConnectWhatsapp`, `enforceLimit` (server-only) |
| `src/lib/billing/stripe.ts` | Cliente Stripe, `getStripePriceId`, `tierFromPriceId` |
| `src/lib/billing/admin-client.ts` | Service-role client para writes do webhook |
| `src/app/api/billing/checkout/route.ts` | `POST` — cria Stripe Checkout Session (owner) |
| `src/app/api/billing/portal/route.ts` | `POST` — cria Customer Portal session (owner) |
| `src/app/api/billing/webhook/route.ts` | `POST` — webhook do Stripe (service-role) |
| `src/app/api/whatsapp/config/route.ts` | Paywall: `assertWhatsappEntitled` no POST |
| `src/app/api/automations/route.ts` | Enforcement: `assertWithinLimit("automations")` |
| `src/app/api/flows/route.ts` | Enforcement: `assertWithinLimit("flows")` |
| `src/app/api/account/invitations/route.ts` | Enforcement: `assertWithinLimit("members")` |
| `src/components/settings/billing-panel.tsx` | UI do plano (cliente, importa só `plans.ts`) |
| `src/components/settings/settings-sections.ts` | Registro da seção "Plano e cobrança" |
| `src/app/(dashboard)/settings/page.tsx` | Roteamento da aba billing |
| `.env.local.example` | Variáveis de ambiente Stripe |
| `src/lib/billing/plans.test.ts` | Testes de planos e limites |
| `src/lib/billing/subscription.test.ts` | Testes de enforcement com fake Supabase client |
