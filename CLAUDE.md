# CLAUDE.md

Plexu: gestão de trabalho open source e self-hosted que cresce de kanban a ERP operacional. PT-BR primeiro.

## Stack

TypeScript ponta a ponta · Next.js 15 (App Router) · Drizzle ORM + PostgreSQL 16 (dados, fila pg-boss e eventos) · Tailwind · vitest. Expressões em CEL via `@marcbachmann/cel-js` (versão fixada; ver `docs/EXPRESSOES.md`). UI: Tailwind, componentes no padrão shadcn/ui, dnd-kit, **TanStack Table v9** (versão fixada; API diferente da v8: `useTable` + `tableFeatures`, sem `useReactTable`/`getCoreRowModel`; guias em `node_modules/@tanstack/react-table/skills`), Playwright para e2e. pnpm 10, Node ≥ 20.

## Antes de codar

Leia `docs/` antes de qualquer mudança:
- `docs/PRODUTO.md`: tese, decisões numeradas e escopo do MVP.
- `docs/ARQUITETURA.md`: invariantes e decisões do `src/core`.
- `docs/schema.sql`: modelo completo (a migração em `src/db/migrations` é o subconjunto do MVP).
- `docs/EXPRESSOES.md`: linguagem de regras, condições e fórmulas.

## Regras

- **Nunca escreva em `cards` ou `card_links` fora de `src/core`.** Use `createCard`, `updateFields`, `moveCard`, `linkCards`, `unlinkCards`, `deleteCard` e `restoreCard`. Um teste (`src/core/__tests__/invariantes.test.ts`) falha se isso for violado.
- Regras são avaliadas antes da escrita e eventos são emitidos na mesma transação (invariante 2).
- Schema muda só por nova migração em `src/db/migrations`, espelhada em `src/db/schema.ts` e `docs/schema.sql`.
- `pnpm typecheck`, `pnpm lint` e `pnpm test` verdes são obrigatórios antes de commitar. Os testes de integração precisam do Postgres no ar (`docker compose up db -d`); o banco `plexu_test` é preparado automaticamente.
- Commits pequenos, mensagens em português.
- Toda mudança entra por PR para `main`, nunca por push direto.
- **Três bancos, no mesmo Postgres (porta 5433), cada um com um só uso:**
  - `plexu`: demo do usuário (`docker compose`, `pnpm dev`, `pnpm db:seed`). Nunca é usado por testes, manuais ou automáticos.
  - `plexu_test`: vitest (`pnpm test`). Criado e migrado sozinho pelo setup global (`src/test/global-setup.ts`); `TEST_DATABASE_URL` sobrescreve.
  - `plexu_e2e`: Playwright (`pnpm e2e`) e testes manuais no navegador. Preparar com `DATABASE_URL=postgres://plexu:plexu@localhost:5433/plexu_e2e pnpm db:migrate && pnpm db:seed` (o migrate cria o banco se faltar); `E2E_DATABASE_URL` sobrescreve. Servidor de teste em outra porta: `E2E_PORT=3200 pnpm e2e`, ou `next dev -p 3100` com esse `DATABASE_URL`. Para zerar: `drop database plexu_e2e` e preparar de novo.
- **Problema de segurança não vira pendência.** Ao apontar um (segredo exposto, permissão frouxa, dado vazando), corrija no mesmo PR ou abra um PR imediatamente. Nunca apenas liste como pendência no resumo.
- **Não encerre o turno esperando CI.** Enquanto o CI roda, avance em outra tarefa (próximo item, revisão do diff) e consulte o status com `gh pr checks <n>` a cada tarefa concluída. Nada de loops `until`/`sleep` em segundo plano. Pare só quando o PR estiver mesclado ou houver uma decisão pendente do usuário.
