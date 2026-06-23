# DeepSeek V4 Flash — Estimativa de Custos para AI Agent

**Data:** 2026-06-23
**Fonte:** [api-docs.deepseek.com/quick_start/pricing](https://api-docs.deepseek.com/quick_start/pricing)

---

## 1. Preços Oficiais (DeepSeek V4 Flash)

| Métrica | Preço (USD) | Preço (~BRL) |
|---|---|---|
| **1M input tokens (cache miss)** | $0.14 | ~R$0.78 |
| **1M input tokens (cache hit)** | $0.0028 | ~R$0.016 |
| **1M output tokens** | $0.28 | ~R$1.56 |
| Contexto máximo | 1M tokens | — |
| Tool calling | ✅ Suportado | — |
| Concorrência | 2.500 requests simultâneos | — |

> **Cache hit** se aplica quando o system prompt e histórico recente já estão no contexto do modelo. Em conversas contínuas, ~50-70% dos tokens de input batem cache.

---

## 2. Cenário Típico: Uma Conversa de WhatsApp com IA

Premissas por conversa (média de 4 mensagens trocadas):

| Componente | Tokens |
|---|---|
| System prompt (~400 tokens, cache hit após 1ª msg) | 400 |
| Histórico de conversa (~300 tokens) | 300 |
| Mensagens do usuário (~50 tokens cada × 4) | 200 |
| Tool calls e resultados (~200 tokens) | 200 |
| **Total input tokens** | **~1.100** |
| Respostas da IA (~150 tokens cada × 4) | 600 |
| Tool call JSON (~150 tokens) | 150 |
| **Total output tokens** | **~750** |

### Cálculo por conversa:

| | Input | Output | Custo |
|---|---|---|---|
| Cache hit (70%) | 770 × $0.0028/M | — | $0.000002 |
| Cache miss (30%) | 330 × $0.14/M | — | $0.000046 |
| Output | — | 750 × $0.28/M | $0.000210 |
| **Total por conversa** | | | **~$0.00026** |

> **R$0.0014 por conversa.** Menos de **1 centavo de real**.

---

## 3. Projeção de Custos Mensais (DeepSeek V4 Flash)

| Clientes | Conversas AI/dia | Conversas/mês | Custo mensal (USD) | Custo mensal (BRL) |
|---|---|---|---|---|
| 10 | 50 | 1.500 | $0.39 | **~R$2** |
| 50 | 250 | 7.500 | $1.95 | **~R$11** |
| 100 | 500 | 15.000 | $3.90 | **~R$22** |
| 200 | 1.000 | 30.000 | $7.80 | **~R$43** |
| 500 | 2.500 | 75.000 | $19.50 | **~R$108** |
| 1.000 | 5.000 | 150.000 | $39.00 | **~R$217** |
| 5.000 | 25.000 | 750.000 | $195.00 | **~R$1.085** |

> Premissa: 50% das conversas passam pelo agente de IA. Média de 4 mensagens por conversa. Cache hit de 70% nos inputs.

---

## 4. Comparação com Outros Providers

| Provider | Modelo | Input (1M) | Output (1M) | Custo p/ 1K conversas |
|---|---|---|---|---|
| **DeepSeek** | **V4 Flash** | **$0.14** | **$0.28** | **~$0.26** |
| OpenAI | GPT-4o-mini | $0.15 | $0.60 | ~$0.50 |
| OpenAI | GPT-4o | $2.50 | $10.00 | ~$9.00 |
| Anthropic | Claude Haiku 4 | $0.80 | $4.00 | ~$3.50 |
| Google | Gemini 2.0 Flash | $0.10 | $0.40 | ~$0.30 |

> **DeepSeek V4 Flash é o mais barato para este caso de uso**, com custo similar ao Gemini Flash mas com cache hit pricing agressivo ($0.0028/M).

---

## 5. Custo por Plano (se você absorver o custo da IA)

| Plano | Clientes estimados | Custo IA/mês por cliente | % da receita |
|---|---|---|---|
| Starter (R$79) | 100 | ~R$0.22 | 0,3% |
| Pro (R$179) | 100 | ~R$0.22 | 0,1% |
| Business (R$349) | 100 | ~R$0.22 | 0,06% |

> **O custo da IA é essencialmente zero** comparado ao valor da assinatura. Não faz sentido cobrar como add-on — embuta no preço e use como diferencial de marketing.

---

## 6. Recomendação

- **Provider:** DeepSeek V4 Flash (não-thinking mode para respostas, thinking mode opcional para casos complexos)
- **Modelo de cobrança:** Incluso em todos os planos (custo irrisório)
- **Precaução:** Implementar limite de tokens por conta para evitar abuso (ex: 500 conversas AI/dia no Starter, 2.000 no Pro, ilimitado no Business)
- **Fallback:** Se a API do DeepSeek cair, fallback automático para flow manual (sem IA)
