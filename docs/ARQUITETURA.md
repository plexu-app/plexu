# Arquitetura (MVP)

```
browser ──▶ Next.js (App Router)
              ├─ route handlers  /api/v1/*   ← REST público (OpenAPI)
              ├─ server actions              ← UI interna
              └─ core/
                   ├─ rules      can_enter / can_leave / can_back / can_edit   (CEL)
                   ├─ fields     tipos, validação, sequence, rollup, dynamic_text
                   ├─ cards      create / update / move / link  → sempre via core, nunca SQL direto
                   ├─ events     append-only; todo write do core emite evento
                   └─ automations trigger → condition → steps (mesmos steps das Ações)
                         │
                         ▼
              pg-boss (fila em Postgres) ──▶ worker (src/worker) executa steps assíncronos
                                                                     │
PostgreSQL ◀─────────────────────────────────────────────────────────┘
  props jsonb (digitado) · computed jsonb (calculado) · events (imutável)
```

Invariantes:
1. Nenhum canal (UI, API, import, automação) escreve em `cards` sem passar por `core/cards`.
2. `core/cards` avalia regras **antes** de gravar e emite `events` **na mesma transação**.
3. Rollup/formula/lookup(ref) só existem em `computed`; recálculo é disparado por evento.
4. Automações reagem a `events`; nunca são chamadas diretamente.
