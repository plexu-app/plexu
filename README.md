<p align="center"><img src="brand/plexu-logo-light.svg#gh-light-mode-only" width="320"><img src="brand/plexu-logo-dark.svg#gh-dark-mode-only" width="320"></p>

<p align="center"><b>Gestão de trabalho open source, self-hosted, que nasce como um kanban e cresce até um ERP operacional — sem trocar de ferramenta.</b></p>

---

## Por quê

Ferramentas de processo (Pipefy, Monday, ClickUp…) param na metade do caminho: quando o processo vira operação — contratos que geram parcelas, compras que viram ordens, aprovações com rito — a regra mora no botão, a relação é por título, o financeiro volta para a planilha.

Plexu inverte isso:

- **Regras no servidor, não no botão.** O card não entra numa fase se não pode; nada de "mover de volta" por automação.
- **Relações por ID, bidirecionais, exclusivas quando preciso.** Solicitação → cotação → ordem de compra sem perder o fio.
- **Campos calculados de verdade.** Contadores com escopo (por ano, por pai), rollups sobre filhos, texto dinâmico.
- **Tudo que a API faz, a automação faz.** Um motor só; botão, evento, cron e webhook são apenas gatilhos.
- **Histórico imutável.** Cada edição de campo, movimento, aprovação e mudança de configuração fica registrada para sempre.
- **Permissão por board, fase, campo e ação.**

O mesmo `board` serve como lista, kanban, pipe com fases, cadastro (database) ou projeto com cronograma. Não existe migração entre "tipos".

## Estado

Pré-alpha. O que existe hoje: modelo de dados, migração inicial, esqueleto do app. Roadmap e decisões em [`docs/PRODUTO.md`](docs/PRODUTO.md); modelo completo em [`docs/schema.sql`](docs/schema.sql); linguagem de expressões (regras, condições, fórmulas) em [`docs/EXPRESSOES.md`](docs/EXPRESSOES.md).

## Rodar

```bash
cp .env.example .env
docker compose up          # Postgres + app em http://localhost:3000
```

Desenvolvimento:

```bash
pnpm install
docker compose up db -d   # expõe em localhost:5433
pnpm db:migrate
pnpm dev
```

Checagens (obrigatórias antes de PR; os testes de integração usam o Postgres acima):

```bash
pnpm typecheck && pnpm lint && pnpm test
```

**`pnpm build` no Windows**: a saída `standalone` do Next cria symlinks, e o Windows recusa sem permissão (`EPERM: operation not permitted, symlink`). Ative o *Modo de desenvolvedor* (Configurações → Sistema → Para desenvolvedores) ou rode o build via Docker (`docker compose build app`). O CI (Linux) não tem essa restrição.

## Stack

TypeScript ponta a ponta · Next.js · Drizzle · PostgreSQL (dados, filas e eventos) · Tailwind. Sem Redis, sem serviços externos. Uma instalação = um `docker compose up`.

## Contribuir

Issues e PRs abertos. Antes de propor feature, leia `docs/PRODUTO.md` — a seção "Dores → decisão" explica por que cada coisa é do jeito que é.

## Licença

[AGPL-3.0](LICENSE). Uso comercial e self-hosting livres; modificações servidas em rede devem ser publicadas.

---

<details><summary>English</summary>

Open source, self-hosted work management that starts as a kanban board and grows into an operational ERP without switching tools. Rules are enforced server-side (a card can't enter a phase it isn't allowed to), relations are by ID and can be exclusive, computed fields (scoped counters, rollups, dynamic text) are first-class, every write is an immutable event, and permissions go down to phase, field and action. Pre-alpha. See `docs/PRODUTO.md` (Portuguese).
</details>
