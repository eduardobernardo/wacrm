# AI Agent — Agente de IA por Número de WhatsApp

**Data:** 2026-06-23
**Status:** Proposta / Pré-viabilidade
**Dependências:** Vercel AI SDK, provider de LLM (DeepSeek, OpenAI, ou Anthropic)

---

## 1. Visão Geral

Adicionar um agente de IA configurável por número de WhatsApp. O agente:
- Responde mensagens automaticamente com contexto
- Tem acesso a tools nativas do sistema (handoff para humano, CRM, pipeline)
- Opera como uma camada antes dos flows manuais
- Se não souber responder, faz fallback para flow manual ou handoff humano

---

## 2. O que já existe (base de integração)

| Componente | Status | Detalhe |
|---|---|---|
| WhatsApp webhook | ✅ | `src/app/api/whatsapp/webhook/route.ts` — entrada única de mensagens |
| Flow engine | ✅ | `src/lib/flows/engine.ts` — `dispatchInboundToFlows()` é o ponto de interceptação |
| Handoff para humano | ✅ | `executeHandoff()` com departments, round-robin, user assignment |
| Pipeline CRM | ✅ | Kanban, negócios, estágios |
| Contatos | ✅ | Busca, tags, deduplicação |
| Variáveis de estado | ✅ | `flow_runs.vars` (JSONB) para armazenar contexto |
| Automações | ✅ | Motor paralelo que pode disparar ações |
| AI/LLM | ❌ | Nada existe — zero referências |

---

## 3. Arquitetura Proposta

```
WhatsApp → webhook → dispatchInboundToFlows()
                         │
                         ├─ Número tem agente de IA configurado?
                         │   │
                         │   ├─ SIM → LLM (AI SDK) processa mensagem
                         │   │          │
                         │   │          ├─ Resposta direta → envia WhatsApp
                         │   │          ├─ Tool call (handoff) → executeHandoff()
                         │   │          ├─ Tool call (CRM) → pipeline/contacts
                         │   │          └─ Tool call (template) → sendTemplate()
                         │   │
                         │   └─ NÃO → flow manual existente (comportamento atual)
                         │
                         └─ Automações rodam em paralelo (como hoje)
```

---

## 4. O que Construir

### Fase 1: Fundação (Semanas 1-2)

**Banco de dados — novas tabelas:**
- `ai_agent_configs`: system prompt, modelo, temperatura, tools habilitadas, por `whatsapp_config_id`
- `ai_conversation_memory`: histórico de mensagens com controle de contexto (últimas N mensagens)

**Pacotes novos:**
- `ai` (Vercel AI SDK)
- Provider específico (ex: `@ai-sdk/openai`, `@ai-sdk/anthropic`, ou `@ai-sdk/deepseek`)

**Código novo:**
- `src/lib/ai/agent.ts` — função principal que recebe mensagem + config e retorna resposta
- `src/lib/ai/tools/` — definição das tools (function calling)
- Interceptação no `dispatchInboundToFlows()` — antes do flow manual
- UI de configuração: página em Settings para definir o agente por número

### Fase 2: Tools (Semanas 3-4)

| Tool | O que faz | Complexidade |
|---|---|---|
| `handoff_to_human` | Transfere conversa para atendente/departamento | Baixa (reusa `executeHandoff`) |
| `send_message` | Envia resposta de texto pelo WhatsApp | Baixa (reusa `meta-send.ts`) |
| `search_contacts` | Busca contatos por nome/telefone | Baixa (queries existentes) |
| `get_contact_info` | Retorna dados de um contato específico | Baixa |
| `create_deal` | Cria negócio no pipeline | Média |
| `update_deal_stage` | Move negócio entre estágios | Média |
| `send_template` | Dispara template de WhatsApp | Baixa (reusa `meta-send.ts`) |
| `add_contact_tag` | Adiciona tag a um contato | Baixa |

### Fase 3: Refinamento (Semanas 5-6)

- Fallback policies (quando IA não sabe → handoff ou flow manual)
- Controle de custo: tracking de tokens, limite por conta
- UI no flow builder? (opcional — MVP não precisa)
- Prompt templates por setor (e-commerce, saúde, serviços)
- Testes e documentação

---

## 5. Estimativa de Esforço

| Fase | Duração | Entregável |
|---|---|---|
| Fundação | 2 semanas | Agente funcional, responde mensagens |
| Tools | 2 semanas | Handoff, CRM, contatos via function calling |
| Refinamento | 2 semanas | Fallback, custos, UI, testes |
| **Total** | **4-6 semanas** | **MVP pronto para produção** |

Para produção polida (UI bonita, testes completos, documentação): **8-10 semanas**.

---

## 6. Custos de Infraestrutura (estimados com DeepSeek V4 Flash)

> Ver detalhamento completo em `pricing-deepseek.md` nesta mesma pasta.

| Cenário | Conversas/dia | Custo mensal estimado (DeepSeek) |
|---|---|---|
| 50 clientes (média 10 conversas/dia cada) | 500 | ~R$15-30/mês |
| 200 clientes | 2.000 | ~R$60-120/mês |
| 1.000 clientes | 10.000 | ~R$300-600/mês |

---

## 7. O que NÃO Fazer Agora

- ❌ Nó de IA no flow builder visual (3x mais complexo, mesmo resultado)
- ❌ RAG / base de conhecimento (semanas extras, ROI baixo pro cliente típico)
- ❌ Multi-modelo (escolhe um provider e mantém)
- ❌ Streaming de respostas (WhatsApp não suporta bem, usar async)
- ❌ Voz/áudio com IA (infra pesada, nicho)

---

## 8. Decisões Pendentes

- [ ] Provider: DeepSeek V4 Flash (~R$0,07/M tokens input, ~R$1,10/M output) vs OpenAI vs Anthropic
- [ ] Cobrar como add-on (R$49-99/mês extra) ou incluir no Business (R$349)?
- [ ] Quem configura o agente? O cliente (system prompt) ou templates prontos?
- [ ] Limite de conversas por mês por plano?
