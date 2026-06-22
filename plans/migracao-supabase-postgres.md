# Plano de Migração: Supabase → Postgres convencional (self-hosted / Neon)

**Projeto:** wacrm (Self-hostable WhatsApp CRM)
**Stack:** Next.js 16 (App Router) + React 19 + Supabase
**Gerado em:** 2026-06-21
**Objetivo:** Eliminar a dependência da assinatura do Supabase Cloud, avaliando substituição por Postgres convencional (self-hosted ou Neon).

---

## 1. Resumo Executivo

O wacrm **não usa o Supabase apenas como banco de dados**. Ele usa **quatro produtos** distintos da plataforma Supabase, todos acessados via HTTP/WebSocket (não há driver Postgres direto — não existe `pg`, `drizzle`, `prisma` etc. nas dependências):

| Superfície Supabase | O que faz | Onde é usado |
|---|---|---|
| **Auth (GoTrue)** | Login, signup, reset de senha, sessões via cookie SSR, `auth.users` | `middleware.ts`, `use-auth.tsx`, todas as rotas `/api`, páginas `(auth)` |
| **Database (PostgREST)** | Query builder `.from()` sobre REST + `.rpc()` | **89 arquivos**, ~370 chamadas `.from()` |
| **Storage** | Buckets `avatars`, `flow-media`, `chat-media` com RLS | `upload-media.ts`, `profile-form.tsx` |
| **Realtime** | Subscriptions `postgres_changes` em `messages` e `conversations` | `use-realtime.ts`, `use-total-unread.ts`, `message-thread.tsx` |

**O ponto crítico:** Neon ou um Postgres "puro" entregam **apenas o motor Postgres**. Eles **não** fornecem PostgREST, GoTrue, Realtime nem Storage. Toda a camada de autorização do app é baseada em **RLS** (125 políticas, 101 usos de `auth.uid()`), que depende do schema `auth` e do JWT que o GoTrue emite.

Portanto, "trocar Supabase por Neon" **não é uma migração de banco** — é uma decisão de arquitetura entre dois caminhos muito diferentes:

- **Caminho A — Self-hostar a stack OSS do Supabase** (GoTrue + PostgREST + Realtime + Storage + Kong via Docker), apontando para um Postgres próprio. **Zero alteração de código de aplicação.** Elimina a assinatura, mantém a stack.
- **Caminho B — Reescrita "de-Supabase"** para Postgres puro + Neon: trocar Auth, trocar acesso a dados, reimplementar RLS na aplicação, trocar Realtime e Storage. **Esforço de semanas.**

> ⚠️ **Recomendação:** Comece pelo **Caminho A**. Ele resolve o objetivo declarado (não depender da assinatura) com risco mínimo. O Caminho B só compensa se o objetivo real for *serverless puro / zero containers* ou remover a marca Supabase por completo.

---

## 2. Inventário detalhado do uso de Supabase

### 2.1 Banco de dados (PostgREST)

- **27 tabelas** (migração `001` + incrementais até `023`):
  `profiles, contacts, tags, contact_tags, custom_fields, contact_custom_values, contact_notes, conversations, messages, whatsapp_config, message_templates, pipelines, pipeline_stages, deals, broadcasts, broadcast_recipients, automations, automation_steps, automation_logs, automation_pending_executions, message_reactions, flows, flow_nodes, flow_runs, flow_run_events, accounts, account_invitations`
- **~370 chamadas `.from()`** distribuídas em 89 arquivos (tabelas mais acessadas: `contacts` 35x, `whatsapp_config` 25x, `message_templates` 17x, `messages`/`conversations`/`contact_tags` 16x cada).
- **7 chamadas `.rpc()`** para funções server-side:
  `transfer_account_ownership`, `set_member_role`, `remove_account_member`, `redeem_invitation`, `peek_invitation`, `increment_automation_execution_count`, `increment_flow_execution_count`.
- **17 funções/triggers PL/pgSQL** definidas nas migrações (incluindo `handle_new_user()` ligada a `auth.users`, agregações de broadcast, dedupe de contatos, `is_account_member()`).
- **Dois modos de acesso:**
  - **Cliente anon/authenticated** (respeitando RLS) — `lib/supabase/client.ts` (browser) e `server.ts` (SSR com cookies).
  - **Service role** (bypassa RLS) — `lib/automations/admin-client.ts`, `lib/flows/admin-client.ts`, e o webhook (`api/whatsapp/webhook/route.ts`). Usado em jobs/cron e no webhook que não tem sessão de usuário.

### 2.2 Autenticação (GoTrue)

- Métodos usados: `signUp`, `signInWithPassword`, `resetPasswordForEmail`, `updateUser` (email/senha), `signOut` (inclusive `scope: 'global'`), `getUser`, `getSession`, `onAuthStateChange`.
- **Sessão via cookie SSR** (`@supabase/ssr`) — o `middleware.ts` valida `getUser()` em cada request para proteger rotas e API.
- **`auth.users` é a fonte de verdade do usuário.** A tabela `profiles` referencia `user_id` e é populada pelo trigger `handle_new_user()` no signup.
- Padrão recorrente: páginas client chamam `getSession()` só para extrair o `access_token` e repassá-lo a rotas internas `/api` (ex.: `inbox/page.tsx`, `pipelines/page.tsx`, `contact-form.tsx`).

### 2.3 Storage

- **3 buckets** criados via migração, todos com RLS:
  - `avatars` (migração 008) — fotos de perfil, escopo por usuário.
  - `flow-media` (migração 016/020) — mídia dos Flows, escopo `account-<uuid>/...`.
  - `chat-media` (migração 023) — anexos do inbox, mesmo padrão de path.
- Helper central `lib/storage/upload-media.ts` (`buildMediaPath`, `uploadAccountMedia`, `deleteAccountMedia`) — usa `supabase.storage.from(bucket).upload/remove/getPublicUrl`.
- O path (`account-<id>/...`) é o que as policies RLS do bucket validam na escrita.

### 2.4 Realtime

- `use-realtime.ts`: canal `postgres_changes` em `messages` e `conversations` (eventos `*`).
- `use-total-unread.ts` e `message-thread.tsx` consomem para atualizar UI ao vivo.
- Depende de logical replication + da feature Realtime do Supabase.

### 2.5 Segurança (RLS)

- **125 políticas `CREATE POLICY`**, **9 arquivos** com RLS, **101 usos de `auth.uid()`** e `is_account_member()`.
- Modelo multi-tenant: tudo é escopado por `account_id`; RLS garante que um tenant não veja dados de outro. **Esta é a peça que mais custa para reimplementar fora do Supabase.**

---

## 3. Por que "só trocar para Neon" não funciona direto

```
Hoje:
  Browser ──HTTP──► PostgREST ──► Postgres (RLS via auth.uid())
  Browser ──HTTP──► GoTrue (auth.users, JWT)
  Browser ──WS────► Realtime (postgres_changes)
  Browser ──HTTP──► Storage (buckets + RLS)

Neon / Postgres puro entrega:
  └─► Postgres (apenas o motor SQL)
```

Os clientes `@supabase/supabase-js` e `@supabase/ssr` **falam com as APIs do Supabase**, não com a porta 5432. Apontar para o Neon exige reconstruir cada uma dessas APIs ou substituir as chamadas no código.

---

## 4. Caminho A — Self-host da stack OSS do Supabase (RECOMENDADO)

**Ideia:** Rodar os componentes open-source do Supabase você mesmo (Docker), com Postgres próprio. O app **não muda uma linha**. Você deixa de pagar o Supabase Cloud.

### 4.1 Componentes (todos Apache-2.0 / MIT)
- **Postgres** (imagem `supabase/postgres`, com extensões `pgcrypto`, `pgjwt`, roles `anon`/`authenticated`/`service_role`).
- **GoTrue** (auth), **PostgREST** (REST), **Realtime**, **Storage API**, **Kong** (gateway), **Studio** (admin opcional).

### 4.2 Passos
1. Clonar o `docker-compose.yml` oficial do Supabase (`supabase/docker`).
2. Gerar segredos: `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, senha do Postgres.
3. Aplicar as 23 migrações de `supabase/migrations/` no Postgres do compose (via `supabase db push` ou `psql` em ordem). As migrações já criam roles, buckets e RLS — funcionam tal qual.
4. Trocar no `.env.local` do app:
   - `NEXT_PUBLIC_SUPABASE_URL` → URL do seu Kong (ex.: `https://supabase.seudominio.com`).
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` → as chaves geradas.
5. Configurar SMTP no GoTrue (reset de senha / confirmação de email).
6. Apontar Storage para disco local ou um backend S3 (R2/MinIO).

### 4.3 Onde o Neon entra (opcional)
Você **pode** usar o Neon como o Postgres por trás dessa stack, mas é trabalhoso: o Supabase exige roles/superuser e um replication slot (para o Realtime) que o Neon restringe. **Na prática, para o Caminho A, use o Postgres do próprio compose** (em um VPS) — é o caminho suportado. Neon brilha mais no Caminho B.

### 4.4 Custos / trade-offs
- ✅ **Zero alteração de código.** Migração em **dias**, não semanas.
- ✅ Elimina a assinatura: custo passa a ser um VPS (~US$ 5–20/mês).
- ✅ Mantém Realtime, Storage, RLS e Auth idênticos.
- ⚠️ Você passa a **operar ~6 containers** (updates, backups, monitoração).
- ⚠️ Hostinger Managed Node.js (deploy atual) não roda Docker — precisaria de um VPS para a stack Supabase.

---

## 5. Caminho B — Reescrita "de-Supabase" para Postgres puro + Neon

**Ideia:** Remover totalmente os clientes Supabase e falar direto com Postgres (Neon) via driver + ORM, com auth e storage próprios. Maior liberdade, **muito** mais esforço.

### 5.1 Sub-projeto B1 — Acesso a dados
- Adotar **Drizzle** (recomendado, leve, type-safe) ou Prisma + driver `postgres`/`@neondatabase/serverless`.
- Modelar as 27 tabelas no ORM (pode-se introspectar do schema existente).
- **Reescrever ~370 chamadas `.from()`** e as 7 `.rpc()`. As funções PL/pgSQL podem permanecer no banco (Neon suporta) e serem chamadas via SQL.
- Centralizar conexão (pooling — Neon usa pooler serverless; cuidado com conexões em Edge/Serverless).

### 5.2 Sub-projeto B2 — Autorização (substituir RLS) — **o maior risco**
RLS via `auth.uid()` deixa de funcionar com uma única role de aplicação. Duas opções:
- **B2a (recomendado):** Manter RLS no Postgres e, a cada transação, setar o contexto:
  `SET LOCAL request.jwt.claims = '{"sub":"<user_id>","role":"authenticated"}'` (ou `SET LOCAL app.user_id = ...` com policies adaptadas). Preserva as 125 políticas com ajuste no `auth.uid()` → função wrapper que lê o GUC. **Neon suporta RLS.**
- **B2b:** Mover toda autorização para a aplicação (camada de service/repository). Mais código, mais risco de furos multi-tenant. Evitar.

### 5.3 Sub-projeto B3 — Autenticação
- Substituir GoTrue por **Auth.js (NextAuth)** com Credentials/Email provider, ou **Lucia**, ou JWT próprio.
- Criar tabela `users` própria; migrar `auth.users` → `users` (emails + hashes — exportáveis do Supabase).
- Reescrever `signUp/signIn/reset/updateUser/signOut`, o `middleware.ts` e o `use-auth.tsx` para o novo provedor.
- Reimplementar `handle_new_user()` como código de aplicação (criar `profiles`+`accounts` no signup).
- Configurar SMTP para reset/confirmação.

### 5.4 Sub-projeto B4 — Realtime
- Substituir `postgres_changes` por:
  - **SSE/WebSocket** próprio alimentado por `LISTEN/NOTIFY` do Postgres (Neon suporta), **ou**
  - **Polling** leve no inbox (mais simples, custo de latência).
- Reescrever `use-realtime.ts`, `use-total-unread.ts`, `message-thread.tsx`.

### 5.5 Sub-projeto B5 — Storage
- Substituir buckets Supabase por **S3/R2/MinIO** + URLs assinadas.
- Reescrever `upload-media.ts` (e `profile-form.tsx`) para o SDK do S3.
- Migrar objetos existentes (avatars, flow-media, chat-media) e atualizar URLs persistidas no banco.

### 5.6 Esforço / trade-offs
- ⚠️ **Semanas de trabalho** + risco de regressão em segurança multi-tenant.
- ⚠️ Requer suíte de testes robusta antes de cortar (hoje há testes apenas em `roles`, `invitations`, `upload-media`).
- ✅ Resultado: stack 100% serverless-friendly (Neon + Vercel/Hostinger), sem containers, sem marca Supabase.

---

## 6. Comparação dos caminhos

| Critério | A — Self-host Supabase | B — Reescrita p/ Neon |
|---|---|---|
| Alteração de código | **Nenhuma** | Massiva (~89 arquivos) |
| Esforço | Dias | Semanas |
| Elimina assinatura | ✅ | ✅ |
| Mantém Realtime/Storage/RLS | ✅ idêntico | Reimplementar tudo |
| Operação | ~6 containers (VPS) | App + Neon (serverless) |
| Risco de segurança | Baixo | Alto (RLS → app) |
| Compatível c/ Hostinger atual | ❌ (precisa VPS p/ stack) | ✅ (Neon + Node managed) |
| Custo recorrente | VPS ~US$5–20/mês | Neon free/low + host |

---

## 7. Recomendação e roteiro sugerido

1. **Curto prazo (resolver o objetivo já):** Executar o **Caminho A** num VPS. Tira você do Supabase Cloud sem tocar no código. Ganho imediato, risco baixo.
2. **Médio prazo (se quiser serverless/Neon):** Tratar o **Caminho B** como projeto faseado, na ordem de menor risco:
   - Fase 1: B1 (dados, com RLS preservada via B2a) — validar com Neon mantendo Auth Supabase temporariamente? *Não dá* (auth e dados estão acoplados por RLS). Então: fazer B1+B2 juntos atrás de um feature flag por ambiente.
   - Fase 2: B3 (Auth próprio).
   - Fase 3: B5 (Storage) — relativamente isolado.
   - Fase 4: B4 (Realtime) — pode começar como polling.
3. **Pré-requisito para o Caminho B:** ampliar a cobertura de testes (hoje mínima) cobrindo isolamento multi-tenant antes de remover a RLS gerenciada.

---

## 8. Checklist de validação pós-migração (qualquer caminho)

- [ ] Login / signup / reset de senha / troca de email / logout global
- [ ] Proteção de rotas no `middleware.ts` (logado vs deslogado)
- [ ] Isolamento multi-tenant: usuário do tenant A não lê dados do tenant B
- [ ] Convites: `peek_invitation` / `redeem_invitation` / aceitar via `/join/[token]`
- [ ] Membros: trocar papel, remover membro, transferir propriedade
- [ ] Webhook WhatsApp grava mensagens (caminho service-role, sem sessão)
- [ ] Inbox ao vivo (Realtime/polling) atualiza ao chegar mensagem
- [ ] Upload/preview/delete de mídia (avatar, flow-media, chat-media)
- [ ] Broadcasts e contadores incrementais (`recompute_broadcast_counts`)
- [ ] Automations e Flows: cron, contadores, pending executions
- [ ] Backups do Postgres configurados e testados (restore)

---

## 9. Arquivos-chave para a migração

| Área | Arquivos |
|---|---|
| Clientes Supabase | `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts` |
| Service role | `src/lib/automations/admin-client.ts`, `src/lib/flows/admin-client.ts`, `src/app/api/whatsapp/webhook/route.ts` |
| Auth | `src/middleware.ts`, `src/hooks/use-auth.tsx`, `src/app/(auth)/*` |
| Storage | `src/lib/storage/upload-media.ts`, `src/components/settings/profile-form.tsx` |
| Realtime | `src/hooks/use-realtime.ts`, `src/hooks/use-total-unread.ts`, `src/components/inbox/message-thread.tsx` |
| Schema / RLS / RPC | `supabase/migrations/001_initial_schema.sql` … `023_chat_media.sql` |
| Env | `.env.local.example` |
</content>
</invoke>
