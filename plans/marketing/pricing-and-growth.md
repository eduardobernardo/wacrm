# Estratégia de Precificação e Projeção de Crescimento

**Data:** 2026-06-23
**Status:** Proposta
**Baseado em:** Análise competitiva de 8 plataformas (RD Station, PipeRun, Digisac, Zenvia, Blip, WATI, ManyChat, Leadlovers)

---

## 1. Posicionamento Competitivo

### Gap de mercado

Ninguém oferece **WhatsApp API oficial + CRM + inbox multi-atendente + pipeline Kanban + flow builder por R$179/mês para 5 pessoas**.

| Feature | wacrm Pro (proposto R$179) | RD Station (R$325) | Leadlovers (R$297) | ManyChat Pro (R$149) |
|---|---|---|---|---|
| WhatsApp API oficial | ✅ | ❌ (extensão Web) | ✅ | ✅ |
| Inbox multi-atendente | ✅ (5 membros) | ✅ (4-∞ users) | ⚠️ (admin users) | ❌ (3 seats) |
| Pipeline Kanban | ✅ | ✅ | ❌ | ❌ |
| Flow builder visual | ✅ | ❌ | ✅ (sequências) | ✅ |
| Departamentos + round-robin | ✅ | ❌ | ❌ | ❌ |
| Preço p/ 5 pessoas | **R$179** | **R$325** | **R$297** | **R$149** |

### Teto competitivo

O wacrm entrega mais features que concorrentes de R$297-325. Há espaço para subir até ~R$199 sem perder competitividade. O sweet spot é R$179: margem confortável sem assustar o pequeno empresário.

---

## 2. Planos Propostos (3 tiers, sem free, trial com cartão)

| | Starter | **Pro ⭐** | Business |
|---|---|---|---|
| **Preço mensal** | R$79 | **R$179** | R$349 |
| **Preço anual** (p/ mês) | R$69 | **R$149** | R$299 |
| **WhatsApp** | 1 número | 1 número | 3 números |
| **Membros** | 2 | 5 | 20 |
| **Contatos** | 2.000 | 10.000 | Ilimitado |
| **Automações** | 3 | 10 | Ilimitado |
| **Fluxos** | 3 | 10 | Ilimitado |
| **Broadcasts/mês** | 5 | 20 | Ilimitado |
| **Pipeline** | ✅ | ✅ | ✅ |
| **Inbox compartilhado** | ✅ | ✅ | ✅ |
| **Flow builder** | ✅ | ✅ | ✅ |
| **Departamentos** | ❌ | ✅ | ✅ |
| **Suporte** | Email (48h) | Chat (24h) | Prioritário |

### Trial: 14 dias no plano Pro — cartão de crédito obrigatório

Sem cartão, sem acesso. Elimina curiosos. Cobrança automática ao fim do trial, cancelável a qualquer momento.

### Lógica dos 3 tiers

- **Starter (R$79):** Porta de entrada. MEI, autônomo. Baixo risco de testar.
- **Pro (R$179):** Carro-chefe. Time de até 5. O que a maioria compra.
- **Business (R$349):** Empresa estabelecida, múltiplos atendentes. Margem gorda financia aquisição dos tiers menores.

---

## 3. Comparação: Pricing Atual vs Proposto

| Plano | Atual | Proposto | Variação |
|---|---|---|---|
| Free | R$0 (inútil, 0 WhatsApp) | ❌ Removido | — |
| Starter | — | **R$79** | Novo |
| Pro | R$99 | **R$179** | +80% |
| Business | R$249 | **R$349** | +40% |
| Trial | Não existe | **14d Pro c/ cartão** | Novo |

---

## 4. Margem para Aquisição de Clientes

| Plano | Receita/mês (pós-Stripe) | Margem bruta | CAC sustentável (payback 3 meses) |
|---|---|---|---|
| Starter | ~R$77 | R$77 | R$231 |
| **Pro** | **~R$174** | **R$174** | **R$522** |
| Business | ~R$339 | R$339 | R$1.017 |

Com Pro a R$179, pode gastar **R$50-80 por cliente em anúncios** e ter payback em menos de 1 mês.

---

## 5. Projeção de 6 Meses (Jul–Dez 2026)

### Cenário Realista (marketing moderado, ~R$1.000/mês em ads a partir de outubro)

| Mês | Novos | Acumulado | Receita mensal* | CAC (Google Ads) |
|---|---|---|---|---|
| Jul | 5-10 | **5-10** | R$895-1.790 | — (rede pessoal) |
| Ago | 8-12 | **13-22** | R$2.327-3.938 | — (indicações) |
| Set | 12-20 | **25-42** | R$4.475-7.518 | — (parcerias) |
| Out | 20-30 | **45-72** | R$8.055-12.888 | R$50-80 |
| Nov | 30-45 | **75-117** | R$13.425-20.943 | R$40-60 |
| Dez | 35-50 | **110-167** | R$19.690-29.893 | R$35-50 |

*\* Receita estimada com mix de 60% Pro, 25% Starter, 15% Business*

**Resultado em 6 meses: 110-167 clientes, ~R$20-30K/mês de receita recorrente.**

### Cenário Conservador (orgânico, sem tráfego pago)

| Mês | Clientes | Receita |
|---|---|---|
| Dez | 90-130 | R$16-23K/mês |

### Cenário Agressivo (ads desde mês 2, R$2-5K/mês)

| Mês | Clientes | Receita |
|---|---|---|
| Dez | 250-380 | R$45-68K/mês |

---

## 6. Custo da Plataforma (por faixa de clientes)

| Clientes | Custo Infra/mês | Custo Stripe/mês | Custo Total | % da receita |
|---|---|---|---|---|
| 10 | R$247 (~$45) | ~R$5 | ~R$252 | ~14% |
| 50 | R$247 | ~R$25 | ~R$272 | ~3% |
| 170 | R$247 | ~R$85 | ~R$332 | ~1,3% |
| 500 | R$302 | ~R$250 | ~R$552 | ~0,6% |
| 1.000 | R$302 | ~R$500 | ~R$802 | ~0,4% |
| 5.000 | R$577 | ~R$2.500 | ~R$3.077 | ~0,3% |

> Infraestrutura: Vercel Pro ($20) + Supabase Pro ($25) = $45 fixo até ~200 contas. Upgrade de compute a cada degrau. WhatsApp é pago por cada cliente diretamente à Meta.

---

## 7. Estratégia de Mercado — Mato Grosso do Sul

### Vantagens de começar no MS

- **CAC baixíssimo:** "CRM WhatsApp Campo Grande" no Google Ads custa centavos vs dezenas de reais em SP
- **Boca a boca rápido:** empresariado local se conhece, CDL e ACE têm alcance direto
- **Menos concorrência:** provavelmente o primeiro a oferecer WhatsApp API com CRM na região
- **Mercado total:** ~445K CNPJs no MS, comércio e serviços dominam

### Canais de aquisição (em ordem de acionamento)

| Mês | Canal | Investimento | Retorno esperado |
|---|---|---|---|
| Jul | Rede pessoal + WhatsApp groups | R$0 | 5-10 clientes |
| Jul | CDL / ACE local (apresentação) | R$0 | 2-5 clientes |
| Ago | Depoimentos + Instagram orgânico | R$0 | 3-5 clientes |
| Ago | Google Meu Negócio | R$0 | 2-3 clientes |
| Set | Parceria com contadores (comissão 20%) | Comissão | 5-10 clientes |
| Out | Conteúdo (blog, YouTube Shorts) | Tempo | 5-10 clientes |
| Out | Google Ads segmentado | R$500-1.000/mês | 10-20 clientes |
| Nov | Remarketing + Black Friday | R$1.000-2.000/mês | 15-25 clientes |
| Dez | Anual com desconto + indicações | R$1.000/mês | 20-35 clientes |

### Roadmap de expansão geográfica

1. **Mês 1-6:** Domine MS (Campo Grande, Dourados, Três Lagoas, Corumbá)
2. **Mês 6-12:** Expanda para estados vizinhos (MT, GO, PR) — mesma estratégia de baixo CAC
3. **Ano 2:** Entre em SP com case consolidado e orçamento de ads mais robusto

---

## 8. Pré-requisitos para o Cenário Realista

### Julho (mês 1)
- [ ] Landing page no ar com os 3 planos e trial de 14 dias
- [ ] Stripe configurado com webhooks em produção
- [ ] 5-10 clientes pagantes via rede pessoal
- [ ] 3 depoimentos em vídeo
- [ ] Onboarding documentado (vídeo de 2 min: como conectar WABA)

### Agosto (mês 2)
- [ ] Instagram com 2-3 posts/semana
- [ ] Google Meu Negócio verificado
- [ ] 1 caso de uso real publicado
- [ ] Primeiros clientes por indicação (não rede pessoal)

### Setembro (mês 3)
- [ ] 2-3 parceiros (contadores, agências) com comissão
- [ ] 1 webinar/live com associação comercial
- [ ] Churn abaixo de 5%

### Outubro (mês 4)
- [ ] Blog com 4-6 artigos sobre WhatsApp para negócios
- [ ] Google Ads ativo (R$500-1.000/mês)
- [ ] CAC conhecido e LTV > 3x CAC

### Novembro (mês 5)
- [ ] Campanha de Black Friday (30% off anual)
- [ ] Remarketing otimizado
- [ ] 100+ clientes ativos

### Dezembro (mês 6)
- [ ] 110+ clientes
- [ ] NPS > 50
- [ ] Funcionalidades Q1 2027 definidas com base em feedback

---

## 9. Oportunidade de Timing: BRL Billing da Meta

A Meta ativou cobrança da WhatsApp Business API em **BRL a partir de 1º de julho de 2026**, com migração obrigatória para empresas brasileiras até 30 de junho de 2027.

Isso reduz a barreira para pequenas empresas adotarem a API oficial. Antes pagavam em USD com IOF e variação cambial. O wacrm está pronto exatamente quando esse movimento começa — a plataforma depende da API oficial e se beneficia diretamente da adoção acelerada.

---

## 10. Notas sobre a Concorrência

### Forças dos concorrentes que o wacrm não tem
- IA generativa (Zenvia, Digisac)
- Multicanal — Instagram, Facebook, Telegram, Email (Digisac, Blip)
- Email marketing integrado (Leadlovers, RD Station)
- Marca estabelecida (RD Station: 20K+ clientes)
- BSP oficial da Meta (Zenvia, Blip)

### Fraquezas dos concorrentes que o wacrm explora
- Preços altos por features básicas (RD Station R$325 para 5 pessoas sem API oficial)
- Complexidade excessiva para o pequeno empresário (Zenvia, Blip)
- Falta de CRM de verdade (ManyChat, Leadlovers)
- Precificação por usuário (penaliza times)

### Recomendação: não competir em features que eles têm
Não persiga IA, multicanal ou email marketing no curto prazo. Seus clientes-alvo (pequenas empresas do interior) não pedem isso. Eles pedem simplicidade, preço baixo, e que funcione. Você já entrega isso melhor que ninguém.
