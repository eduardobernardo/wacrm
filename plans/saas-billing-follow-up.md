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

> **Status:** Plano revisado em 2026-06-23 após sessão de design tree com 29 decisões resolvidas. Substitui a versão anterior. Ver "Decisões" no final desta seção para o racional completo.

**Princípio norteador:** contas com 1 número (Pro, e Business até adicionarem o 2º) não devem perceber mudança na UX. O recurso multi-número aparece organicamente quando relevante. Display e enforcement ficam sempre em sincronia.

#### 1.2.1 Modelo de dados — migration `031_multi_whatsapp.sql`

**Ordem das operações (crítica — o backfill roda antes de dropar o `UNIQUE(account_id)` para garantir join 1:1):**

```sql
-- (1) whatsapp_config: label opcional para identificar o número
ALTER TABLE whatsapp_config ADD COLUMN IF NOT EXISTS label TEXT;

-- (2) conversations: FK para o número que recebeu a mensagem
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS whatsapp_config_id UUID
  REFERENCES whatsapp_config(id) ON DELETE RESTRICT;

-- (3) Backfill conversations.whatsapp_config_id
--     Hoje há exatamente 1 config por conta (UNIQUE(account_id) ainda ativa),
--     então o join é 1:1 e sem ambiguidade.
UPDATE conversations c
  SET whatsapp_config_id = wc.id
  FROM whatsapp_config wc
  WHERE c.account_id = wc.account_id
    AND c.whatsapp_config_id IS NULL;

-- (4) Guard: abortar se houver conversas órfãs (sem config conectada)
--     Contas que nunca conectaram WhatsApp não têm conversas (não recebem inbound).
--     Se houver órfãs (conta conectou, desconectou via hard delete antigo), abortar
--     com mensagem listando os account_ids para resolução manual.
DO $$
DECLARE orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
    FROM conversations WHERE whatsapp_config_id IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION
      'Cannot SET NOT NULL on conversations.whatsapp_config_id — % orphan conversation(s) '
      'have no matching whatsapp_config. Resolve manually (assign a config or delete '
      'the orphan conversations) before re-running migrations.',
      orphan_count;
  END IF;
END $$;

-- (5) SET NOT NULL — toda conversa pertence a um número
ALTER TABLE conversations ALTER COLUMN whatsapp_config_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_whatsapp_config
  ON conversations(whatsapp_config_id);

-- (6) message_templates: waba_id nullable (drafts locais não têm WABA)
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS waba_id TEXT;

-- (7) Backfill message_templates.waba_id (NULL se a conta não tem config)
UPDATE message_templates t
  SET waba_id = (SELECT waba_id FROM whatsapp_config WHERE account_id = t.account_id)
  WHERE t.waba_id IS NULL;

-- (8) Dropar UNIQUE(account_id) — permite múltiplos números por conta
ALTER TABLE whatsapp_config DROP CONSTRAINT IF EXISTS whatsapp_config_account_id_key;

-- (9) Nova unicidade: (account_id, phone_number_id)
--     UNIQUE(phone_number_id) global (migration 013) é MANTIDA —
--     um número continua pertencendo a uma conta só.
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_config_account_phone_key
  ON whatsapp_config(account_id, phone_number_id);

-- (10) message_templates: unique index muda de (user_id, name, language)
--      para (account_id, waba_id, name, language) — permite mesmo nome
--      em WABAs diferentes, proíbe duplicatas na mesma WABA.
DROP INDEX IF EXISTS message_templates_user_name_language_key;
CREATE UNIQUE INDEX IF NOT EXISTS message_templates_account_waba_name_language_key
  ON message_templates(account_id, waba_id, name, language);
```

**Notas:**
- `ON DELETE RESTRICT` em `conversations.whatsapp_config_id`: impede hard delete de config com conversas. O soft delete (decisão 8) nunca dispara DELETE, então o RESTRICT é rede de segurança — explode alto e claro se algo tentar hard-delete uma config com conversas.
- `messages` **não** ganha `whatsapp_config_id` (decisão 9) — inferido via `conversations`. O inbox carrega mensagens por `conversation_id`, e a conversa já tem o número.
- `message_templates.waba_id` é nullable (decisão 27) — drafts locais sem WABA ficam NULL; o filtro do template picker naturalmente os exclui.

#### 1.2.2 Limites customizáveis por env var (decisão 4 + 5)

`src/lib/billing/plans.ts` — override via `NEXT_PUBLIC_*` (cliente e servidor veem o mesmo valor):

```ts
const proMax = parseInt(process.env.NEXT_PUBLIC_PRO_MAX_WHATSAPP_NUMBERS ?? "", 10);
const bizMax = parseInt(process.env.NEXT_PUBLIC_BUSINESS_MAX_WHATSAPP_NUMBERS ?? "", 10);

// PLANS.pro.limits.maxWhatsappNumbers = Number.isFinite(proMax) && proMax >= 0 ? proMax : 1;
// PLANS.business.limits.maxWhatsappNumbers = Number.isFinite(bizMax) && bizMax >= 0 ? bizMax : 3;
```

Defaults: Pro = 1, Business = 3. Atualizar `.env.local.example` com as duas vars.

#### 1.2.3 Soft delete ao desconectar (decisão 8)

"Desconectar" = `UPDATE whatsapp_config SET status='disconnected', access_token=NULL` (limpa o token, mantém a linha). A linha persiste; `conversations.whatsapp_config_id` continua válido; histórico preservado.

- Queries ativas (envio, webhook) filtram `status='connected'`.
- "Reconectar" = update do `status` de volta para `connected` + novo token. Cai no path de update da decisão 6.
- "Remover permanentemente" (hard delete) só permitido se **não houver conversas** — o `ON DELETE RESTRICT` enforce isso no DB.
- UI: lista mostra conectados e desconectados (com badge), opção de reconectar ou remover permanentemente.

#### 1.2.4 Cap conta só números conectados (decisão 17 + 28)

`src/lib/billing/subscription.ts` — `assertCanConnectWhatsapp` filtra `status='connected'` na contagem:

```ts
const { count } = await supabase
  .from("whatsapp_config")
  .select("*", { count: "exact", head: true })
  .eq("account_id", accountId)
  .eq("status", "connected");  // ← adicionado
```

`src/components/settings/billing-panel.tsx:84-86` — mesma mudança (consistência display vs enforcement):

```ts
supabase
  .from("whatsapp_config")
  .select("*", { count: "exact", head: true })
  .eq("account_id", accountId)
  .eq("status", "connected"),  // ← adicionado
```

#### 1.2.5 POST /api/whatsapp/config — add vs update (decisão 6)

`src/app/api/whatsapp/config/route.ts` — distinção por `phone_number_id` no body:

- Busca config por `(account_id, phone_number_id)`.
- Se existe → **update** dessa linha. Gate: `assertWhatsappEntitled` (só entitlement — não conta no cap, é o mesmo número).
- Se não existe → **insert** de nova linha. Gate: `assertCanConnectWhatsapp` (entitlement + contagem de `connected`).
- O check "número reclamado por outra conta" (`config/route.ts:206-211` por `phone_number_id`) continua válido antes da bifurcação.
- **Update path** (`config/route.ts:362-374`): escopar por `id`, não por `account_id` sozinho — senão atualiza todos os números da conta de uma vez.
- **DELETE** (`config/route.ts:455-458`): escopar por `id`, não por `account_id` — senão deleta todos os números. Soft delete: `UPDATE status='disconnected', access_token=NULL` em vez de `DELETE` (decisão 8).
- **Lookup de "existing"** (`config/route.ts:268-272`): buscar por `(account_id, phone_number_id)`, não `.maybeSingle()` por `account_id`.

#### 1.2.6 Webhook inbound (decisão 3 + 22)

`src/app/api/whatsapp/webhook/route.ts`:

- `findOrCreateConversation` (`:963`) passa a receber `whatsapp_config_id` e chavear por `(account_id, contact_id, whatsapp_config_id)` — uma conversa por (contato, número). Mesmo contato falando com Vendas e Suporte = 2 conversas.
- `processMessage` (`:259-270`) passa `config.id` para `findOrCreateConversation`.
- **Guard de número desconectado** (decisão 22): após resolver a config (`:251`), checar `if (config.status !== 'connected') { console.warn(...); continue }` antes do `decrypt(config.access_token)` — mensagens em atraso da Meta para números desconectados são descartadas com log.
- `flagBroadcastReplyIfAny` (`:380`) passa a receber `whatsapp_config_id` da conversa inbound e filtra `broadcast_recipients` por `broadcasts.whatsapp_config_id = :inbound_config_id` (decisão 21) — broadcast de Vendas só é "respondido" se a resposta veio pelo número de Vendas.

#### 1.2.7 Envio outbound — resolução de número (decisão 2 + 20)

**Paths inbound-triggered** (resolvem via conversa — sem mudança de schema além da FK):

- `src/app/api/whatsapp/send/route.ts:170` — já carrega a conversa (`:137-142`) antes de buscar config. Mudar para `conversation.whatsapp_config_id` em vez de `.eq('account_id').single()`.
- `src/app/api/whatsapp/react/route.ts:113` — já busca a conversa (`:87-89`). Resolver config via `conversation.whatsapp_config_id`.
- `src/lib/automations/meta-send.ts:87` — automações inbound-triggered (`new_message_received`, `keyword_match`, `first_inbound_message`) rodam no contexto de uma conversa. Resolver via `conversation.whatsapp_config_id`.
- `src/lib/flows/meta-send.ts:81,190,342` — flows inbound-triggered (`keyword`, `first_inbound_message`) idem.

**Paths proativos** (precisam de `whatsapp_config_id` nullable + fallback):

- `src/app/api/whatsapp/broadcast/route.ts:138` — broadcast. Resolver: usa `broadcast.whatsapp_config_id` se setada; senão, "único se houver só um"; senão, erro.
- `src/lib/automations/meta-send.ts:87` — automações proativas (`time_based`, `tag_added`). Mesma lógica: `automation.whatsapp_config_id` se setada; senão, "único se houver só um"; senão, erro.
- `src/lib/flows/meta-send.ts:81,190,342` — flows proativos (`manual`). Mesma lógica.

**Colunas nullable `whatsapp_config_id`** em `automations`, `flows`, `broadcasts` (decisão 2 + 20):
- NULL = "todos os números" (escopo de trigger inbound) **e** fallback "único se houver só um" (envio proativo).
- Setada = número específico (escopo de trigger inbound **e** número de envio proativo).
- A mesma coluna serve para os dois propósitos.

**Validação na ativação/envio, não no draft (decisão 18):**
- Broadcasts: validar número só em `status='sending'` (igual ao cap de broadcasts hoje, `api/broadcasts/route.ts:25`). Drafts sem número são permitidos.
- Automações: validar na ativação (`is_active=true`), não na criação como draft.
- Flows: validar na ativação (`status='active'`), não em `draft`.

#### 1.2.8 Templates multi-WABA (decisão 11 + 12 + 13)

**Filtro no template picker:** usuário seleciona o número no broadcast → o sistema lê `config.waba_id` daquele número → template picker mostra só templates com `waba_id` correspondente. O usuário nunca vê "WABA".

**Criação de template** (`src/app/api/whatsapp/templates/submit/route.ts`):
- Seletor de número no formulário (oculto se só há 1 WABA entre os números conectados).
- O servidor usa `config.waba_id` do número selecionado para submeter à Meta e grava `waba_id` na row de `message_templates`.
- `src/components/settings/template-manager.tsx:258-272` — enviar `whatsapp_config_id` no body do submit.

**Sync de templates** (`src/app/api/whatsapp/templates/sync/route.ts`):
- Iterar sobre todas as configs conectadas da conta, sincronizando templates de cada WABA.
- Cada template gravado com seu `waba_id`.
- Unique index `(account_id, waba_id, name, language)` permite o mesmo nome em WABAs diferentes.

#### 1.2.9 Diagnóstico de saúde (decisão 14 + 24 + 25)

**`GET /api/whatsapp/config`** — retorna array:
- Sem query param: só dados locais (DB), sem probe Meta. Usado pelo `settings-overview.tsx` (tile "2 de 3 conectados" do `status` local).
- Com `?probe=true`: `Promise.allSettled` de `verifyPhoneNumber` por número. Usado pela página de WhatsApp config. Falha parcial não derruba o batch — cada número retorna seu status independentemente.

**`GET /api/whatsapp/config/verify-registration?config_id=X`** — diagnóstico de um número específico, chamado sob demanda.

**`src/components/settings/settings-overview.tsx:119-131`** — tile mostra `connectedCount` / `totalCount` do `status` local (sem probe Meta).

#### 1.2.10 Inbox multi-número (decisão 10 + 26)

**Seletor de número** (`src/app/(dashboard)/inbox/page.tsx` + `src/components/inbox/conversation-list.tsx`):
- Só aparece se a conta tiver >1 número conectado. Contas de 1 número: UX idêntica a hoje.
- Default = "Todos os números" (conversas de todos os números misturadas).
- Filtro: `.eq('whatsapp_config_id', X)` quando um número é selecionado.
- Segue o padrão do filtro departamental existente (`conversation-list.tsx:99-104`).

**Realtime** (`src/hooks/use-realtime.ts`):
- Subscription continua sem filtro (recebe todos os eventos da conta).
- O handler no `page.tsx` descarta eventos de números não selecionados: `conversations[message.conversation_id].whatsapp_config_id` vs filtro ativo.
- Default "Todos": nenhum descarte, comportamento idêntico a hoje.

#### 1.2.11 Endpoint de mídia (decisão 16)

`src/app/api/whatsapp/media/[mediaId]/route.ts` — receber `?conversation_id=X` query param:
- O client (message-thread) já tem a conversa ativa → passa o param.
- O servidor resolve a config via `conversation.whatsapp_config_id`.
- Correto para multi-WABA sem mudança de schema.

#### 1.2.12 Recursos ativos com número desconectado (decisão 23)

Ao soft-deletear um número, a UI avisa:
- Query rápida: `count` de automações/flows ativos e broadcasts agendados com `whatsapp_config_id = X`.
- Mostra: "Você tem 2 automações e 1 broadcast agendado usando este número. Eles falharão até você reconectar ou trocar o número."
- O usuário decide: reconectar, trocar o número nos recursos, ou ignorar.
- O recurso permanece ativo e falha no envio com mensagem clara se o usuário não agir.

#### 1.2.13 UI de configuração (decisão 19)

`src/components/settings/whatsapp-config.tsx`:
- Lista números + botão "Conectar novo número".
- Cada número mostra: label (se houver) ou número de telefone formatado, badge de status (conectado/desconectado), botões (editar, reconectar, remover permanentemente, verificar registro).
- `label` é opcional (nullable). A UI mostra label se houver, senão o número formatado.

#### 1.2.14 Arquivos a tocar (estimativa ~G+)

**Migration:**
- `supabase/migrations/031_multi_whatsapp.sql` — ver 1.2.1.

**Schema-adjacent (colunas nullable em tabelas proativas):**
- Adicionar `whatsapp_config_id UUID REFERENCES whatsapp_config(id) ON DELETE SET NULL` em `automations`, `flows`, `broadcasts` (nullable, backfill NULL — fallback "único se houver só um").

**Billing:**
- `src/lib/billing/plans.ts` — override via `NEXT_PUBLIC_*` env vars (1.2.2).
- `src/lib/billing/subscription.ts` — `assertCanConnectWhatsapp` filtra `status='connected'` (1.2.4).
- `src/components/settings/billing-panel.tsx` — contagem filtra `status='connected'` (1.2.4).

**API routes:**
- `src/app/api/whatsapp/config/route.ts` — GET retorna array + `?probe=true`; POST branchado por `phone_number_id`; DELETE soft delete por `id` (1.2.5, 1.2.9).
- `src/app/api/whatsapp/config/verify-registration/route.ts` — recebe `?config_id=X` (1.2.9).
- `src/app/api/whatsapp/webhook/route.ts` — `findOrCreateConversation` por (contato, número); guard de desconectado; `flagBroadcastReplyIfAny` escopado (1.2.6).
- `src/app/api/whatsapp/send/route.ts` — resolve config via `conversation.whatsapp_config_id` (1.2.7).
- `src/app/api/whatsapp/react/route.ts` — resolve config via `conversation.whatsapp_config_id` (1.2.7).
- `src/app/api/whatsapp/broadcast/route.ts` — resolve config via `broadcast.whatsapp_config_id` + fallback (1.2.7).
- `src/app/api/whatsapp/media/[mediaId]/route.ts` — recebe `?conversation_id=X` (1.2.11).
- `src/app/api/whatsapp/templates/submit/route.ts` — recebe `whatsapp_config_id` no body; usa `config.waba_id` (1.2.8).
- `src/app/api/whatsapp/templates/sync/route.ts` — itera sobre todas as configs conectadas (1.2.8).
- `src/app/api/whatsapp/templates/[id]/route.ts` — resolve config por `whatsapp_config_id` (não `.single()` por conta).

**Lib:**
- `src/lib/automations/meta-send.ts` — resolve config via `conversation.whatsapp_config_id` (inbound) ou `automation.whatsapp_config_id` + fallback (proativo) (1.2.7).
- `src/lib/flows/meta-send.ts` — idem (3 call sites) (1.2.7).

**UI:**
- `src/components/settings/whatsapp-config.tsx` — lista + "Conectar novo número" + label opcional (1.2.13).
- `src/components/settings/settings-overview.tsx` — tile "X de Y conectados" (1.2.9).
- `src/components/settings/template-manager.tsx` — seletor de número no formulário (oculto se 1 WABA) (1.2.8).
- `src/components/settings/billing-panel.tsx` — contagem `status='connected'` (1.2.4).
- `src/app/(dashboard)/inbox/page.tsx` — seletor de número (só se >1) + filtro realtime no client (1.2.10).
- `src/components/inbox/conversation-list.tsx` — filtro `.eq('whatsapp_config_id', X)` (1.2.10).
- `src/app/(dashboard)/broadcasts/new/page.tsx` — seletor de número (só se >1) (1.2.7).

**Tipos:**
- `src/types/index.ts` — atualizar `WhatsappConfig` (adicionar `label`), `Conversation` (adicionar `whatsapp_config_id`), `Automation`/`Flow`/`Broadcast` (adicionar `whatsapp_config_id` nullable), `MessageTemplate` (adicionar `waba_id`).

**Env:**
- `.env.local.example` — `NEXT_PUBLIC_PRO_MAX_WHATSAPP_NUMBERS`, `NEXT_PUBLIC_BUSINESS_MAX_WHATSAPP_NUMBERS`.

**Testes:**
- `src/lib/billing/plans.test.ts` — testar override via env var.
- `src/lib/billing/subscription.test.ts` — testar `assertCanConnectWhatsapp` com `status='connected'` filter.
- Teste de integração: criar broadcast com `whatsapp_config_id` NULL e conta com 2 números → erro na ativação; com 1 número → OK.

#### 1.2.15 Decisões (racional completo)

| # | Decisão | Escolha | Racional |
|---|---|---|---|
| 1 | "Default" = segurança de migração | Sem coluna `is_default` | "Default" no enunciado = não quebrar configs existentes, não "número padrão para enviar". Garantido pelo backfill. |
| 2 | Envio proativo com múltiplos números | C: `whatsapp_config_id` nullable + fallback "único se houver só um" | Contas de 1 número não veem seletor; persiste a decisão no momento certo (criação); broadcast agendado não quebra se adicionarem 2º número. |
| 3 | Identidade da conversa | B: uma conversa por (contato, número) | Padrão de CRMs multi-linha; path de resposta sem ambiguidade; alinha com separação departamental. |
| 4 | Limite por plano | A: Pro=1, Business=3, customizável | Conservador; cobre caso departamental; deixa espaço para futuro Enterprise. |
| 5 | Override dos limites | A: `NEXT_PUBLIC_*` env vars | Display e enforcement em sincronia; precedente no codebase. |
| 6 | POST config: add vs update | A: distinção por `phone_number_id` | Servidor infere da existência da linha; resolve 3 bugs (update/DELETE escopados, gate branchado). |
| 7 | `conversations.whatsapp_config_id` | A: NOT NULL + backfill | Invariant limpo; backfill trivial hoje; elimina estado zumbi do NULL. |
| 8 | Desconectar número | A: soft delete | Preserva histórico; reusa `status` existente; `ON DELETE RESTRICT` como rede de segurança. |
| 9 | `messages.whatsapp_config_id` | A: não; inferir via `conversations` | Inbox carrega por conversa; sem query que se beneficie da denormalização; YAGNI. |
| 10 | Seletor no inbox | A: só se >1; default "Todos" | Zero mudança para contas de 1 número; recurso aparece organicamente. |
| 11 | Templates multi-WABA | B: `waba_id` em `message_templates` | Permite filtro por número sem duplicar templates da mesma WABA. |
| 12 | Criação de template | A: seletor de número (oculto se 1 WABA) | Usuário vê "número", nunca "WABA"; consistente com broadcast. |
| 13 | Sync de templates | A: global; unique index `(account_id, waba_id, name, language)` | Um botão, sem decisões; permite mesmo nome em WABAs diferentes. |
| 14 | Diagnóstico de saúde | A: GET retorna array; `verify-registration?config_id=X` | Probe sob demanda; evita N chamadas à Meta por mount. |
| 15 | Tile WhatsApp no overview | A: "2 de 3 conectados" | Honesto e compacto; equivalente a hoje para 1 número. |
| 16 | Endpoint de mídia | C: `?conversation_id=X` | Correto para multi-WABA sem schema change; client já tem a conversa. |
| 17 | Cap conta só conectadas | A: `assertCanConnectWhatsapp` filtra `status='connected'` | Soft delete é reversível; não deve consumir vaga permanentemente. |
| 18 | Validação em proativos | C: na ativação/envio, não no draft | Consistente com cap de broadcasts (só em `sending`); drafts sem número são legítimos. |
| 19 | `label` em `whatsapp_config` | A: nullable; UI mostra label ou número | Zero fricção; seletor nunca fica opaco (mostra número formatado). |
| 20 | Escopo de automações/flows | B: `whatsapp_config_id` nullable; NULL = todos | Backward-compatible; mesma coluna serve para escopo de trigger e número de envio. |
| 21 | `flagBroadcastReplyIfAny` | A: escopar por `whatsapp_config_id` | Corrige falso positivo no multi-número; métricas de broadcast corretas. |
| 22 | Webhook para desconectado | A: descartar com log | Número desconectado intencionalmente; mensagens em atraso não criam conversas órfãs. |
| 23 | Recursos com número desconectado | C: avisar na UI, não desativar | Não desativa silenciosamente; erro no envio é rede de segurança. |
| 24 | GET config com múltiplos números | B: probe paralelo (`Promise.allSettled`) na página de config | Cap de 3 números; 3 chamadas paralelas aceitáveis; falha parcial não derruba o batch. |
| 25 | Overview probe | A: status local; config page faz probe | Limita chamadas à Meta ao contexto onde importam. |
| 26 | Realtime com filtro | A: filtrar no client | Realtime filter não lida com `messages` (sem `whatsapp_config_id` direta); descarte é O(1). |
| 27 | `waba_id` em templates | A: nullable | Drafts locais sem WABA são legítimos; filtro naturalmente os exclui. |
| 28 | Contagem no billing panel | A: filtrar `status='connected'` | Consistência display vs enforcement. |
| 29 | Ordem da migration | A: colunas → backfill → NOT NULL → drop constraints → novos indexes, com guard | Backfill antes de dropar `UNIQUE(account_id)` garante join 1:1; guard aborta se há órfãs. |

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
