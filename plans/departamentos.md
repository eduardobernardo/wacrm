# Plano de Implementação: Feature de Departamentos de Atendimento

**Projeto:** wacrm (Self-hostable WhatsApp CRM)
**Stack:** Next.js 16 (App Router) + React 19 + Supabase (Auth + PostgREST + Realtime + Storage)
**Gerado em:** 2026-06-21
**Status:** Proposta / aguardando aprovação

---

## 1. Resumo Executivo

Hoje o wacrm é um **shared inbox de conta**: qualquer membro da conta enxerga **todas** as conversas. Isso é imposto exclusivamente por **RLS** via a função `is_account_member(account_id, min_role)` — não há nenhum filtro por usuário ou por equipe. A coluna `conversations.assigned_agent_id` já existe, mas é puramente informativa: **a RLS a ignora**.

A feature de Departamentos transforma esse modelo em **caixas de entrada segmentadas**, com isolamento real:

- Departamentos com N membros (e 1 usuário em N departamentos).
- Isolamento: um departamento não vê conversas de outro; um usuário não vê conversas de outro usuário (salvo transferência).
- Roteamento/transbordo de conversas para departamento (distribuição **automática** ou **sequencial/round-robin**), para departamento **com usuário específico**, ou para **usuário específico** — disponível em três superfícies:
  1. Nós de **Flows** (`flow_nodes`) e passos de **Automations** (`automation_steps`);
  2. **Transferência manual** no Inbox;
  3. **Roteamento de respostas de Broadcast**.

> ⚠️ **O coração da feature é a reescrita da RLS de `conversations` e `messages`.** Tudo o mais (UI, nós, transferência) é orquestração em cima dessa nova fronteira de visibilidade. Errar a RLS = vazamento de dados entre equipes. Esta é a task de maior risco e deve ser revisada e testada com prioridade máxima.

**Esforço estimado:** ~Médio-Alto. 1 migração nova (`024`), 1 serviço de distribuição compartilhado, extensão de 2 motores (flows/automations), 1 rota de API nova, e telas de gestão + diálogos de transferência.

---

## 2. Arquitetura Atual Relevante (o que já existe)

### 2.1 Multi-tenancy e papéis

- **`accounts`** (1 por owner) + **`profiles.account_id`** + **`profiles.account_role`** (`owner > admin > agent > viewer`). Design travado: **uma conta por usuário** (`idx_accounts_one_per_owner`).
- **`is_account_member(target_account_id, min_role)`** — `SECURITY DEFINER`, `STABLE`. Base de **todas** as policies. Compara o rank do papel do `auth.uid()` com o mínimo exigido. (`017_account_sharing.sql:136`)
- Helpers TS espelham os ranks: `src/lib/auth/roles.ts` (`hasMinRole`, `canSendMessages`, etc.) e `src/lib/auth/account.ts` (`requireRole`, `getCurrentAccount` → `AccountContext`).

### 2.2 Modelo de conversa/mensagem

- **`conversations`**: `account_id` (tenancy), `user_id` (criador/audit), `contact_id`, `status` (`open|pending|closed`), `assigned_agent_id` (UUID, **sem FK, ignorado pela RLS hoje**), contadores.
- **RLS atual (a ser reescrita):** `conversations_select USING (is_account_member(account_id))` — **todo membro vê tudo**. `messages` segue por join na `conversations`. (`017_account_sharing.sql:362-368, 458-468`)
- Inbox (`src/app/(dashboard)/inbox/page.tsx`) busca conversas com o **client RLS-scoped** e passa via props para `conversation-list.tsx`. **Não há filtro no front** — quem decide o que aparece é a RLS. *(Consequência: ao apertar a RLS, o inbox automaticamente passa a mostrar só o permitido — sem mudança de query obrigatória.)*

### 2.3 Atribuição já existente (pontos de extensão)

- **Flow node `handoff`** (`src/lib/flows/engine.ts:433` `executeHandoff`): já aceita `config.assign_to` (user_id) → seta `conversations.assigned_agent_id` e `status='pending'`. Tipos em `src/lib/flows/types.ts:100` (`HandoffNodeConfig`).
- **Automation step `assign_conversation`** (`src/lib/automations/engine.ts:423`): `mode: 'specific' | 'round_robin'`. O `round_robin` é um **placeholder** que só pega o primeiro membro da conta (`profiles ... limit(1)`). Tipos em `src/types/index.ts:432` (`AssignConversationStepConfig`).

### 2.4 Webhook e broadcasts

- **Webhook** (`src/app/api/whatsapp/webhook/route.ts`): usa **service role** (bypassa RLS). `findOrCreateConversation` cria conversa **sem departamento e sem responsável**. Dispara flows (`dispatchInboundToFlows`) e automations.
- **`flagBroadcastReplyIfAny`** (linha 389): ao receber inbound, encontra o `broadcast_recipients` mais recente do contato e marca `replied`. **Não roteia** a conversa — é só contabilização.
- **`broadcasts`**: `audience_filter JSONB`, contadores. **Sem** configuração de roteamento de resposta hoje.

### 2.5 Convenções de migração

- Migrations idempotentes, numeradas (`001`…`023`). **A próxima é `024`**. Padrão: `IF NOT EXISTS` para tabelas/colunas/índices; `DROP POLICY IF EXISTS` antes de `CREATE POLICY`; helpers `SECURITY DEFINER` com `OWNER TO postgres` + `GRANT EXECUTE`.

---

## 3. Decisões de Design (com defaults recomendados)

Estas decisões já estão refletidas nas tasks abaixo. Marcadas como **[DEFAULT]** podem ser revistas antes de iniciar.

1. **Membership N:N → tabela própria `department_members`.** Não cabe em `profiles` (que é 1:1 com a conta). Cada linha = (department_id, user_id).
2. **Admins/Owners furam o isolamento (veem tudo).** **[DEFAULT]** — necessário para supervisão e para não “perder” conversas órfãs. Agents/viewers ficam restritos.
3. **Conversa sem departamento e sem responsável (“pool geral / não roteada”)** → visível **apenas para admin+**. **[DEFAULT]** Garante isolamento estrito (requisito) sem perder conversas: o admin distribui. *(Alternativa: pool visível a todos os agents — rejeitada por violar “isolamento estrito”.)*
4. **Conversa com departamento mas sem responsável (pool do departamento)** → visível a **todos os membros daquele departamento** (e admin+). Permite o modelo “fila da equipe”.
5. **Conversa com responsável** → visível ao **responsável** + admin+ (independente de departamento). É o que cumpre “só vê se foi transferida para você”.
6. **Estratégias de distribuição:** `auto` (balanceamento por carga — menos conversas abertas; empate → aleatório) e `sequential` (round-robin com cursor por departamento). **[DEFAULT]**
7. **Reuso do nó `handoff` (flows) e do passo `assign_conversation` (automations)**, estendendo o config em vez de criar tipos novos — mantém retrocompatibilidade (`assign_to` / `mode:'specific'` continuam válidos). **[DEFAULT]**
8. **Serviço de distribuição único** (`src/lib/departments/distribute.ts`) reusado pelas 4 superfícies (flow, automation, inbox, broadcast) — uma só fonte de verdade da lógica de roteamento.
9. **Gestão de departamentos = settings-class (admin+).** Criar/editar/excluir departamento e gerir membros exige `admin`. Transferir conversa exige `agent` (operacional).

### Decisões em aberto (não bloqueiam o início; confirmar durante a Fase 1)
- (A) Viewers devem ver as conversas do(s) seu(s) departamento(s) em modo leitura, ou nada? **Sugestão:** mesma visibilidade dos agents do departamento, porém read-only (RLS de SELECT). 
- (B) Um usuário pode pertencer a quantos departamentos sem limite? **Sugestão:** sem limite.
- (C) Migração de dados: as conversas **existentes** (hoje compartilhadas) devem virar “pool geral” (só admin) ou ser atribuídas a um “Departamento Geral” com todos os membros? **Sugestão:** criar um **“Departamento Geral”** por conta com todos os membros atuais e vincular as conversas existentes a ele — evita que agents “percam” acesso no dia da migração. Ver Task 2.6.

---

## 4. Modelo de Dados — Migração `024_departments.sql`

### 4.1 Novas tabelas

```sql
-- departments
id              UUID PK
account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE
name            TEXT NOT NULL
description     TEXT
-- cursor do round-robin (sequential). Aponta o último user_id atribuído.
last_assigned_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
created_at / updated_at  TIMESTAMPTZ
UNIQUE(account_id, name)        -- nomes únicos por conta

-- department_members (N:N)
id              UUID PK
account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE  -- denormalizado p/ RLS barata
department_id   UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE
user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
created_at      TIMESTAMPTZ
UNIQUE(department_id, user_id)
```

### 4.2 Alterações em `conversations`

```sql
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_department ON conversations(department_id);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned_agent ON conversations(assigned_agent_id);
```
> `ON DELETE SET NULL`: excluir um departamento devolve suas conversas ao pool geral (admin), nunca apaga a conversa.

### 4.3 Alterações em `broadcasts` (roteamento de resposta)

```sql
ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS reply_routing JSONB;  -- null = comportamento atual (sem roteamento)
```
Formato do `reply_routing` (espelha o tipo `RouteTarget` da §5.1):
```jsonc
// departamento, distribuição automática/sequencial:
{ "kind": "department", "department_id": "...", "strategy": "auto" | "sequential" }
// departamento com usuário fixo:
{ "kind": "department_user", "department_id": "...", "user_id": "..." }
// usuário específico:
{ "kind": "user", "user_id": "..." }
```

### 4.4 Tabela de auditoria (opcional, recomendada)

```sql
-- conversation_transfers — trilha de quem transferiu o quê, para onde.
id, account_id, conversation_id, from_agent_id, to_agent_id,
to_department_id, strategy, transferred_by_user_id, source TEXT  -- 'inbox'|'flow'|'automation'|'broadcast'
created_at
```
Usada pela timeline da conversa e para depuração de roteamento. Pode ser cortada do MVP.

### 4.5 Helpers SQL (`SECURITY DEFINER`)

```sql
-- is_department_member(dept_id) — auth.uid() pertence ao departamento?
CREATE FUNCTION is_department_member(target_department_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM department_members dm
    WHERE dm.department_id = target_department_id AND dm.user_id = auth.uid()
  );
$$;
-- OWNER TO postgres; GRANT EXECUTE ... TO authenticated, service_role;
```

### 4.6 Reescrita da RLS — `conversations` (a fronteira de segurança)

```sql
DROP POLICY IF EXISTS conversations_select ON conversations;
CREATE POLICY conversations_select ON conversations FOR SELECT USING (
  is_account_member(account_id, 'admin')                 -- (2) admin+ vê tudo
  OR assigned_agent_id = auth.uid()                       -- (5) atribuída a mim
  OR (department_id IS NOT NULL AND is_department_member(department_id))  -- (4) pool do meu dept
);
-- INSERT/UPDATE/DELETE: manter is_account_member(account_id,'agent') para escrita
-- (a escrita continua account-scoped; quem dispara é o webhook/service-role ou
--  ação operacional. O isolamento de LEITURA é o requisito central.)
```
E `messages` por join (mesma lógica, via `conversations`):
```sql
DROP POLICY IF EXISTS messages_select ON messages;
CREATE POLICY messages_select ON messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND (
    is_account_member(c.account_id, 'admin')
    OR c.assigned_agent_id = auth.uid()
    OR (c.department_id IS NOT NULL AND is_department_member(c.department_id))
  ))
);
```
> **Atenção (Realtime):** o canal `postgres_changes` de `messages`/`conversations` (migrações 001/010) respeita RLS de SELECT — logo o isolamento vale também para eventos em tempo real, sem código extra. **Validar** que o token usado pelo Realtime é o do usuário (e não anon), senão eventos podem vazar. Cobrir em teste manual.

### 4.7 RLS das novas tabelas

- `departments`: SELECT = `is_account_member(account_id)`; INSERT/UPDATE/DELETE = `is_account_member(account_id,'admin')`.
- `department_members`: SELECT = `is_account_member(account_id)`; modify = `is_account_member(account_id,'admin')`.
- `conversation_transfers` (se criada): SELECT pela mesma regra de visibilidade da conversa-pai; INSERT por service-role/agent.

### 4.8 Backfill / migração de dados
Ver Task 2.6 (Departamento Geral + vínculo das conversas existentes).

---

## 5. Serviço de Distribuição Compartilhado

### 5.1 `src/lib/departments/types.ts`
```ts
export type RouteStrategy = 'auto' | 'sequential';
export type RouteTarget =
  | { kind: 'department'; department_id: string; strategy: RouteStrategy }
  | { kind: 'department_user'; department_id: string; user_id: string }
  | { kind: 'user'; user_id: string };
```

### 5.2 `src/lib/departments/distribute.ts`
```ts
// resolveAssignment(db, accountId, target): Promise<{ userId: string|null; departmentId: string|null }>
//  - kind 'user'            → { userId, departmentId: null }
//  - kind 'department_user' → { userId, departmentId } (valida que user ∈ dept)
//  - kind 'department' + 'auto'       → membro do dept com menos conversas 'open'/'pending'
//  - kind 'department' + 'sequential' → próximo membro após departments.last_assigned_user_id
//                                       (atualiza o cursor)
// applyRouting(db, conversationId, target, opts): resolve + UPDATE conversations
//  (department_id, assigned_agent_id, status?) + INSERT conversation_transfers
```
- `db` = `AdminClient` (service-role) para uso no webhook/engines; nas rotas API usa o client RLS-scoped do `AccountContext`.
- **Concorrência do sequential:** envolver leitura+update do cursor em `SELECT ... FOR UPDATE` ou usar `UPDATE ... RETURNING` atômico para evitar dois inbounds simultâneos pegarem o mesmo membro.
- Reusa os padrões de `admin-client.ts` já existentes em `lib/flows` e `lib/automations`.

---

## 6. Tasks Detalhadas

> Legenda de tamanho: **P** (pequeno, < ½ dia), **M** (médio, ~1 dia), **G** (grande, > 1 dia).
> Cada task lista arquivos-alvo. Marque `[x]` ao concluir.

### Fase 0 — Fundação de dados e segurança (bloqueia todo o resto)

- [ ] **0.1 (G) — Migração `024_departments.sql`.** Criar `departments`, `department_members`, coluna `conversations.department_id` (+ índices), coluna `broadcasts.reply_routing`, tabela `conversation_transfers` (opcional), helper `is_department_member`, e RLS de TODAS as tabelas novas. **Não** reescrever ainda a RLS de `conversations`/`messages` aqui — fazer na 0.2 para isolar o risco em diff próprio. Idempotente (seguir padrão das migrações 017/023).
  - Arquivo: `supabase/migrations/024_departments.sql`
- [ ] **0.2 (M) — Reescrita da RLS de visibilidade.** Reescrever `conversations_select` e `messages_select` conforme §4.6. Manter policies de INSERT/UPDATE/DELETE account-scoped. Pode ser a 2ª metade da `024` ou uma `025` separada (recomendado separar p/ revisão focada).
  - Arquivo: `supabase/migrations/024_departments.sql` (parte 2) ou `025_conversation_visibility.sql`
- [ ] **0.3 (P) — Validar isolamento via testes SQL/manuais.** Cenários: (a) agent do dept A não lê conversa do dept B; (b) agent não lê conversa atribuída a outro; (c) agent lê conversa atribuída a ele mesmo (mesmo de outro dept); (d) admin lê tudo; (e) conversa órfã só p/ admin; (f) **Realtime** respeita a RLS (abrir 2 sessões). Documentar resultados.

### Fase 1 — Backend de gestão de departamentos

- [ ] **1.1 (P) — Tipos TS.** `Department`, `DepartmentMember`, `RouteTarget`, `RouteStrategy`; estender `Conversation` com `department_id?`. 
  - Arquivos: `src/types/index.ts`, `src/lib/departments/types.ts`
- [ ] **1.2 (P) — Predicado de papel.** `canManageDepartments(role)` (= admin+) em `roles.ts` para gates de UI/API.
  - Arquivo: `src/lib/auth/roles.ts` (+ teste em `roles.test.ts`)
- [ ] **1.3 (M) — Serviço de distribuição.** Implementar `distribute.ts` (§5.2) com testes unitários (auto, sequential com cursor, validações de membership, empates).
  - Arquivos: `src/lib/departments/distribute.ts`, `distribute.test.ts`
- [ ] **1.4 (M) — API REST de departamentos.** CRUD + membros, espelhando o padrão de `src/app/api/account/members`. Tudo via `requireRole('admin')` (exceto GET = membro).
  - `GET/POST /api/departments` (listar/criar)
  - `GET/PATCH/DELETE /api/departments/[id]` (detalhe/editar/excluir)
  - `POST/DELETE /api/departments/[id]/members` (add/remover membro)
  - Arquivos: `src/app/api/departments/route.ts`, `.../[id]/route.ts`, `.../[id]/members/route.ts`

### Fase 2 — UI de gestão (Settings)

- [ ] **2.1 (M) — Aba/painel “Departamentos” em Settings.** Lista de departamentos, criar/editar/excluir. Espelhar `members-tab.tsx`/`settings-sections.ts`. Gate `canManageDepartments`.
  - Arquivos: `src/components/settings/departments-tab.tsx`, registrar em `settings-sections.ts`/`settings-rail.tsx`
- [ ] **2.2 (M) — Diálogo de gestão de membros do departamento.** Selecionar membros da conta (multi-select) para o departamento; mostrar estratégia padrão (auto/sequential). 
  - Arquivo: `src/components/settings/department-members-dialog.tsx`
- [ ] **2.6 (M) — Migração de dados (Departamento Geral).** Script/migração que, por conta, cria um “Departamento Geral”, adiciona todos os membros atuais e seta `conversations.department_id` das conversas existentes (decisão C, §3). Idempotente. **Confirmar a decisão C antes de codar.**
  - Arquivo: parte de `024`/`025` ou `026_departments_backfill.sql`

### Fase 3 — Transferência no Inbox

- [ ] **3.1 (M) — Rota de transferência.** `POST /api/conversations/[id]/transfer` (`requireRole('agent')`). Body = `RouteTarget`. Valida que o caller pode ver a conversa (RLS), chama `applyRouting`, retorna conversa atualizada.
  - Arquivo: `src/app/api/conversations/[id]/transfer/route.ts`
- [ ] **3.2 (M) — Botão + diálogo de transferência no thread.** Ação “Transferir” no header da conversa (`message-thread.tsx`): escolher **departamento** (auto / escolher usuário) ou **usuário**. Após sucesso, se o usuário perdeu acesso (não é mais o responsável e não é do dept), remover a conversa da lista/fechar o thread.
  - Arquivos: `src/components/inbox/message-thread.tsx`, novo `src/components/inbox/transfer-dialog.tsx`
- [ ] **3.3 (P) — Filtro de departamento no inbox (UX).** Como a RLS já restringe, adicionar um seletor opcional “Departamento / Atribuídas a mim / Não atribuídas” para admins (que veem tudo) refinarem a lista. Para agents, mostrar agrupamento por dept se pertencerem a vários.
  - Arquivos: `src/app/(dashboard)/inbox/page.tsx`, `conversation-list.tsx`
- [ ] **3.4 (P) — Indicadores visuais.** Badge de departamento + avatar do responsável no item da lista e no header. 
  - Arquivos: `conversation-list.tsx`, `message-thread.tsx`, `contact-sidebar.tsx`

### Fase 4 — Nó de Flow (transbordo)

- [ ] **4.1 (P) — Estender `HandoffNodeConfig`.** Adicionar campo `target?: RouteTarget` (mantendo `assign_to` legado para retrocompat: se só `assign_to` presente, tratar como `{kind:'user'}`).
  - Arquivo: `src/lib/flows/types.ts`
- [ ] **4.2 (M) — Atualizar `executeHandoff`.** Se `target` presente, chamar `applyRouting(db, conversationId, target)` (service-role) em vez do set direto de `assigned_agent_id`. Manter logging em `flow_run_events`.
  - Arquivo: `src/lib/flows/engine.ts:433`
- [ ] **4.3 (M) — Validação do nó.** Estender `validate.ts` para validar `target` (dept existe? user ∈ dept p/ `department_user`?). Atualizar `edges.ts` se necessário (handoff é terminal — provavelmente sem edges novos).
  - Arquivos: `src/lib/flows/validate.ts` (+ `validate.test.ts`)
- [ ] **4.4 (M) — Form do builder.** UI do nó handoff para escolher destino (dept auto/sequential, dept+usuário, ou usuário).
  - Arquivos: `src/components/flows/forms/` (form do handoff)

### Fase 5 — Passo de Automation (transbordo)

- [ ] **5.1 (P) — Estender `AssignConversationStepConfig`.** Adicionar `mode: 'department' | 'department_user'` e campos `department_id`, `strategy`, `user_id`. Manter `'specific'`/`'round_robin'` legados.
  - Arquivo: `src/types/index.ts:432`
- [ ] **5.2 (M) — Atualizar engine.** No `case 'assign_conversation'`, montar `RouteTarget` e chamar `applyRouting`. **Substituir o placeholder de `round_robin`** (que hoje pega o 1º membro) pela distribuição real quando houver dept.
  - Arquivo: `src/lib/automations/engine.ts:423`
- [ ] **5.3 (P) — Validação + form.** `validate.ts` para o novo config; form do passo no builder de automations.
  - Arquivos: `src/lib/automations/validate.ts` (+ test), form correspondente em `src/components/automations/`

### Fase 6 — Roteamento de respostas de Broadcast

- [ ] **6.1 (M) — UI de roteamento no broadcast.** No criar/editar broadcast, seção “Quando o cliente responder, encaminhar para…”: departamento (auto/usuário) ou usuário. Persistir em `broadcasts.reply_routing`.
  - Arquivos: `src/app/(dashboard)/broadcasts/new/page.tsx`, `.../[id]/`, componentes em `src/components/broadcasts/`
- [ ] **6.2 (M) — Roteamento no webhook.** Em `flagBroadcastReplyIfAny`, ao encontrar o `broadcast_recipients`, carregar `broadcasts.reply_routing` e, se presente, chamar `applyRouting(adminDb, conversationId, routing)`. Cuidado: só rotear na **primeira** resposta (idempotência — não re-rotear se já marcado `replied`/já atribuído).
  - Arquivo: `src/app/api/whatsapp/webhook/route.ts:389` + `:637`
- [ ] **6.3 (P) — Carregar conversation_id no fluxo do webhook.** `flagBroadcastReplyIfAny` hoje recebe `(accountId, contactId)`. Passar também `conversationId` (já disponível em `processMessage`) para permitir o roteamento.

### Fase 7 — Testes, documentação e hardening

- [ ] **7.1 (M) — Testes de RLS automatizados** (se houver harness pgTAP/SQL) ou roteiro manual versionado cobrindo a matriz da Task 0.3 + transferências.
- [ ] **7.2 (M) — Testes unitários** do `distribute.ts`, engines (flow/automation) e validações.
- [ ] **7.3 (P) — `typecheck` + `lint` + `vitest`** verdes (`bun run typecheck && bun run lint && bun run test`).
- [ ] **7.4 (P) — Docs.** Atualizar `README.md`/`CHANGELOG.md` e adicionar nota de migração (rodar `024`/`025`/`026` em produção; efeito no inbox compartilhado existente).

---

## 7. Mapa Requisito → Task

| Requisito do usuário | Onde é atendido |
|---|---|
| Criação de departamentos + adição de membros | 0.1, 1.4, 2.1, 2.2 |
| 1 membro em N departamentos | `department_members` N:N (0.1), 2.2 |
| Nó em automações/flows: transbordo p/ dept (auto/sequencial), dept+usuário, ou usuário | 4.x (flows), 5.x (automations) + serviço 1.3 |
| Departamento não vê atendimento de outro | RLS 0.2 (`is_department_member`) |
| Usuário não vê atendimento de outro (salvo transferência) | RLS 0.2 (`assigned_agent_id = auth.uid()`) + 3.x |
| Transferência no inbox p/ dept (auto/usuário) ou usuário | 3.1, 3.2 |
| Respostas de broadcast direcionadas a dept/usuário (auto/específico) | 6.1, 6.2, 6.3 |

---

## 8. Riscos e Pontos de Atenção

1. **Regressão de visibilidade (CRÍTICO).** Hoje todos veem tudo; depois, agents veem menos. No “dia 1” da migração, sem a Task 2.6 (Departamento Geral), agents podem **perder acesso a conversas existentes**. → Executar 2.6 junto com a 0.2. Comunicar a mudança.
2. **Realtime e RLS.** Confirmar que subscriptions usam o JWT do usuário; senão eventos vazam entre departamentos mesmo com SELECT correto (Task 0.3 cobre).
3. **Service-role bypassa RLS.** Webhook e engines escrevem com service-role — a lógica de roteamento (não a RLS) é quem decide a quem atribuir. Garantir que `applyRouting` valida membership em `department_user`.
4. **Concorrência no `sequential`.** Dois inbounds simultâneos podem pegar o mesmo membro se o cursor não for atualizado atomicamente (§5.2).
5. **Retrocompat de configs.** Flows/automations já salvos com `assign_to`/`mode:'specific'` devem continuar funcionando (Tasks 4.1, 5.1).
6. **`assigned_agent_id` sem FK.** Permanece UUID livre (compat com o código atual). Considerar adicionar FK p/ `auth.users` numa limpeza futura — fora do escopo.
7. **Performance.** Novos índices em `conversations(department_id)` e `(assigned_agent_id)` cobrem os predicados da RLS. `is_department_member` é `STABLE`/`SECURITY DEFINER` (cacheável por statement), igual a `is_account_member`.

---

## 9. Sequenciamento Recomendado

```
Fase 0 (dados + RLS)  ─►  Fase 1 (backend + serviço)  ─►  Fase 2 (UI gestão + backfill 2.6)
                                                   └─►  Fase 3 (inbox transfer)
                                                   └─►  Fase 4 (flows)
                                                   └─►  Fase 5 (automations)
                                                   └─►  Fase 6 (broadcasts)
                                            Fase 7 (testes/docs) — contínua
```
Fases 3–6 são **independentes entre si** após a Fase 1 e podem ser paralelizadas/entregues incrementalmente. **Fase 0 é pré-requisito absoluto.**

---

## 10. Critérios de Aceite (Definition of Done)

- [ ] Admin cria departamentos e gerencia membros (N:N) pela UI.
- [ ] Agent de um departamento **não** consegue ler (nem via API nem via Realtime) conversas de outro departamento nem de outro usuário.
- [ ] Agent lê conversa transferida para ele, mesmo vinda de outro departamento.
- [ ] Admin/Owner continuam vendo todas as conversas da conta.
- [ ] Nó de Flow e passo de Automation transferem para: dept (auto), dept (sequencial), dept+usuário, e usuário — verificado em execução real.
- [ ] Transferência manual no inbox cobre os mesmos 4 destinos; quem perde acesso some da lista.
- [ ] Resposta a um broadcast com `reply_routing` cria/roteia a conversa para o destino configurado, só na 1ª resposta.
- [ ] Conversas existentes pré-migração permanecem acessíveis conforme decisão C.
- [ ] `typecheck`, `lint` e `vitest` verdes.
```
