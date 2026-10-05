# Design

Referência visual: [`docs/design/plexu-mockups.html`](design/plexu-mockups.html) (abra no navegador; o botão no topo alterna o tema). As telas do app seguem o mockup: mesmas fontes, cores, espaçamentos e densidade. Estilo novo entra primeiro no mockup ou neste documento, não direto num componente.

## Conceito: arquivo técnico

- Separação por linha de 1px (`--line`), **nunca por sombra**.
- Cantos de 4px (`--r`) em tudo: cartão, input, botão, modal.
- Ritmo denso: controles de 32px, texto base de 14px, rótulos mono de 11px.
- Uma cor por fase (`--f1`…`--f5`), usada na barra do cabeçalho da coluna e nos marcadores.
- Acento azul (`--accent`) só onde há decisão (ação primária, foco, seleção): no máximo ~10% da tela.

## Fontes

| Fonte | Uso | Classe |
|---|---|---|
| Archivo (400–700) | títulos e corpo | `font-sans` (padrão) |
| IBM Plex Mono (400, 500) | rótulos em caixa-alta de 11px, IDs, números, contadores | `font-mono`; rótulo pronto: `.rotulo` |

Carregadas por `next/font/google` em `src/app/layout.tsx` (variáveis `--font-archivo` e `--font-plex-mono`), expostas como `--font` e `--mono`. O rótulo `.rotulo` (`src/app/globals.css`) é mono 11px, `letter-spacing: .08em`, caixa-alta, `--ink-3`.

## Tokens

Definidos só em `src/styles/tokens.css`, copiados do mockup. Os nomes são os mesmos do mockup.

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--bg` | `#f4f3ef` | `#141518` | fundo do app, sidebar, área do board |
| `--paper` | `#fbfaf7` | `#1b1c21` | cartões, cabeçalhos, modais, inputs, item ativo |
| `--ink` | `#15171c` | `#ecebe6` | texto principal |
| `--ink-2` | `#4b4f58` | `#b3b2ab` | texto secundário |
| `--ink-3` | `#858a95` | `#7c7d84` | rótulos, metadados, ícones |
| `--line` | `#dcdad3` | `#2d2f36` | bordas |
| `--line-2` | `#ebe9e3` | `#24262c` | divisórias internas (rodapé do cartão, linhas de tabela) |
| `--accent` | `#3b5bff` | `#7c93ff` | ação primária, foco, seleção |
| `--accent-ink` | `#fff` | `#0f1523` | texto sobre `--accent` |
| `--accent-soft` | `#e9edff` | `#232a4a` | etiquetas, fundo de seleção |
| `--ok` / `--ok-soft` | `#1f7a4d` / `#e3f3ea` | `#1f7a4d` / `#163026` | sucesso |
| `--warn` / `--warn-soft` | `#9a5b00` / `#fff1dc` | `#9a5b00` / `#3a2a10` | aviso |
| `--err` / `--err-soft` | `#b42318` / `#fde8e6` | `#b42318` / `#3b1a17` | erro, prazo vencido |
| `--f1` … `--f5` | `#3b5bff` `#0f9d8a` `#c2410c` `#7c3aed` `#6b7280` | iguais | cores de fase (`--f5`: bases) |
| `--r` | `4px` | `4px` | raio de tudo |

Derivados (fora do mockup, necessários ao app):

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--err-ink` | `#fff` | `#fff` | texto sobre `--err` (botão destrutivo) |
| `--on-cor` | `#fff` | `#fff` | texto sobre cor de fase (avatar) |
| `--scrim` | `rgb(21 23 28 / .32)` | `rgb(0 0 0 / .55)` | véu atrás de modais |

### No Tailwind

O projeto usa Tailwind v4, sem `tailwind.config`: o mapeamento fica no bloco `@theme inline` de `src/app/globals.css`. Cada token vira cor utilitária com o mesmo nome:

- `bg-bg`, `bg-paper`, `text-ink`, `text-ink-2`, `text-ink-3`, `border-line`, `border-line-2`
- `bg-accent`, `text-accent-ink`, `bg-accent-soft`, `text-accent`
- `text-ok`, `bg-ok-soft`, `text-warn`, `bg-warn-soft`, `text-err`, `bg-err-soft`, `text-err-ink`, `text-on-cor`, `bg-scrim`
- `bg-f1` … `bg-f5`

Todos os `rounded-*` resolvem para `var(--r)`. Os nomes legados do shadcn/ui (`bg-background`, `text-muted-foreground`, `border-input`, `bg-primary`…) apontam para os tokens, para que telas antigas acompanhem o tema. Código novo usa os nomes dos tokens.

## Tema claro e escuro

- O tema é o atributo `data-theme` (`light` | `dark`) no `<html>`.
- Um script inline no `<head>` (`SCRIPT_TEMA`, `src/components/tema.tsx`) aplica o tema antes da pintura, sem piscar. Ordem: `localStorage["plexu-theme"]`, depois `prefers-color-scheme`.
- Não há cookie nem estado no servidor.
- Alternador "Claro / Escuro" (`AlternarTema`): fica no rodapé da sidebar (ícone quando ela está recolhida) e no topo das telas sem a sidebar (login, primeiro acesso, arquivados).
- A variante `dark:` do Tailwind segue o `data-theme`, não a media query. Ela só é necessária para trocar recursos, como os dois arquivos do logo. Cores trocam sozinhas pelos tokens.
- Com JS desligado, o tema segue o sistema (bloco `prefers-color-scheme` de `tokens.css`).

## Regras

1. **Nenhuma cor literal em componente.** Cores existem só em `src/styles/tokens.css`. `pnpm lint` roda `scripts/lint-design.mjs` sobre `src/**/*.{ts,tsx}` (testes de fora) e falha com:
   - hex (`#rgb`, `#rrggbb`);
   - classe de sombra (`shadow-*`);
   - cor da paleta do Tailwind (`bg-red-500`, `text-white`, `bg-black/30`…).

   A cor de fase escolhida pelo usuário (`#rrggbb` em `phases.color`) é dado, vem do banco e não passa pelo lint. As cores-padrão de fase são as chaves `f1`…`f5`, convertidas em `var(--fN)` por `corDaFase`.
2. **Sem sombra.** Para destacar, use `border border-line`, ou `border-accent` no caso de foco ou arraste.
3. **Todo componente novo funciona nos dois temas.** Use só tokens e confira alternando o tema antes do PR.
4. **Foco:** use borda ou outline em `--accent`. Não use o `ring` do Tailwind.

## Medidas das peças

- **Sidebar:**
  - 232px de largura (56px recolhida), fundo `--bg`, borda direita.
  - Logo do tema: `brand/plexu-logo-light.svg` ou `brand/plexu-logo-dark.svg`.
  - Grupos "Fluxos" e "Bases" com `.rotulo`. Itens de 32px com o marcador de cor do board.
  - Item ativo: fundo `--paper`, borda, peso 600.
  - Rodapé: usuário, workspace e tema.
- **Cabeçalho do board:**
  - 56px de altura, fundo `--paper`, borda inferior.
  - Nome em 18px/600, seguido do contador mono ("8 cartões").
  - Abas de visualização (a ativa em `--ink` sobre `--paper`), busca de 240px, "Configurar" (ghost) e "+ Novo cartão" (primário, 32px).
- **Controles:** inputs, selects e botões com 32px de altura (`h-8`), borda `--line` e foco com borda `--accent`.
- **Kanban:**
  - Colunas de 300px com 12px entre elas, sem borda.
  - Cabeçalho da coluna em `--paper`: barra de 3px na cor da fase, "01. Nome" em 13.5px/600, contador mono, ✓ na fase final e "+".
  - Coluna vazia: caixa tracejada.
- **Cartão:**
  - Fundo `--paper`, borda 1px `--line`, padding 10px 12px 8px, 8px entre linhas.
  - Seleções viram etiqueta (mono 10px, `--accent-soft`).
  - Título em 14px/600.
  - Até 3 campos em grade de rótulo (mono 10px) e valor (13px).
  - Rodapé com borda `--line-2`: avatar de 20px, prazo relativo ("vence em 5d"; em `--err` se vencido; "concluído" na fase final) e tempo na fase.
- **Arrastar:** o cartão arrastado ganha borda `--accent` e a coluna-alvo fica em `--paper`. A fase bloqueada por regra (`can_enter`) mostra borda tracejada e o motivo, em tooltip e nota. Sem rotação nem escala.

### Onde o app difere do mockup (decidido)

- O cartão mostra até 3 campos, não 4. O limite vem da configuração do cartão do board.
- O fundo do board é `--bg`, não `--paper`, para que a coluna-alvo em `--paper` se destaque durante o arraste.
- O contador de cartões fica no cabeçalho do board.
- Ainda não existem no app:
  - busca global na sidebar (⌘K);
  - visão Calendário;
  - linha de conexões no cartão;
  - rótulo do botão por board ("Nova entrega"). O app usa "Novo cartão".

## Conferir

- `pnpm lint`: inclui a checagem de design.
- `CAPTURAS=1 pnpm e2e visual`: grava as capturas em `e2e/__screenshots__/` (kanban claro e escuro, sidebar recolhida, modal) para comparar com o mockup.
- `e2e/tema.spec.ts`: o tema segue o sistema, a escolha persiste depois de recarregar e o `<body>` já nasce com o tema certo.
