# IDX CRM — CRM para WhatsApp

> CRM completo para WhatsApp® — caixa de entrada compartilhada, contatos,
> pipelines de vendas, disparos em massa e automações no-code. Fork
> por sua conta, personalize e hospede.

[![License: MIT](https://img.shields.io/badge/License-MIT-violet.svg)](./LICENSE)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)](https://nextjs.org)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth-3ecf8e?logo=supabase)](https://supabase.com)

---

## O que você ganha

- **Caixa de entrada compartilhada** na API oficial do WhatsApp Business —
  múltiplos agentes no mesmo número, atribuição por conversa, status e notas.
- **Contatos + tags + campos personalizados**, importação CSV, deduplicação.
- **Pipelines de vendas** (Kanban) com negócios vinculados a conversas.
- **Disparos em massa** com templates aprovados pela Meta, rastreio de entrega
  e leitura, substituição de variáveis por destinatário.
- **Automações no-code** — gatilhos por mensagem recebida, novo contato,
  palavra-chave ou agendamento; branches condicionais, esperas, tags,
  webhooks. Construtor visual.
- **Fluxos visuais** — builder drag-and-drop para criar jornadas complexas
  (estilo n8n/Make).
- **Dashboard em tempo real** — tempo de resposta, volume diário, valor de
  pipeline, feed de atividades.
- **Equipes** — convide colegas por link, controle de acesso por papel
  (proprietário / admin / agente / visualizador).
- **Departamentos** — segmente sua equipe (suporte, vendas etc.), isole
  conversas por RLS, transfira conversas manualmente ou via automações.
- **Planos e cobrança (SaaS)** — Gratuito (R$0), Pro (R$99/mês),
  Business (R$249/mês). Stripe Checkout integrado.

## Stack

- **App** — Next.js 16 (App Router), React 19, TypeScript, Tailwind v4.
- **Dados** — Supabase (Postgres + Auth + Storage + RLS).
- **WhatsApp** — Meta Cloud API (oficial WhatsApp Business API).

## Início rápido

```bash
git clone <seu-fork>
cd idxcrm
npm install
cp .env.local.example .env.local   # preencha Supabase + Meta creds
npm run dev
```

Abra <http://localhost:3000>. Você será redirecionado para `/login`
(ou `/dashboard` se já estiver logado).

## Licença

[MIT](./LICENSE). Fork, personalize, hospede.
