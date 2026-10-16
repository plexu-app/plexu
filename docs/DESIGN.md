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
| `--veu` | `rgb(21 23 28 / .6)` | `rgb(0 0 0 / .6)` | véu do card aberto e das configurações (`--ink` a 60%; no escuro, preto) |

### No Tailwind

O projeto usa Tailwind v4, sem `tailwind.config`: o mapeamento fica no bloco `@theme inline` de `src/app/globals.css`. Cada token vira cor utilitária com o mesmo nome:

- `bg-bg`, `bg-paper`, `text-ink`, `text-ink-2`, `text-ink-3`, `border-line`, `border-line-2`
- `bg-accent`, `text-accent-ink`, `bg-accent-soft`, `text-accent`
- `text-ok`, `bg-ok-soft`, `text-warn`, `bg-warn-soft`, `text-err`, `bg-err-soft`, `text-err-ink`, `text-on-cor`, `bg-scrim`, `bg-veu`
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

A estrutura das telas segue `docs/design/prompt-redesign-pr2.md` (paridade com a referência de mercado); a pele (fontes, tokens, linhas de 1px) é a deste documento. Os e2e `paridade-a`, `card` e `paridade-c` conferem as medidas com `getBoundingClientRect`.

- **Sidebar:**
  - 232px de largura (56px recolhida), fundo `--bg`, borda direita. Sem escolha salva, começa recolhida em telas com menos de 1600px.
  - Logo do tema: `brand/plexu-logo-light.svg` ou `brand/plexu-logo-dark.svg`; recolhida, a marca (branca no escuro).
  - Grupos "Fluxos" e "Bases" com `.rotulo`. Itens de 32px com o marcador de cor do board.
  - Item ativo: fundo `--paper`, borda, peso 600.
  - Rodapé: usuário, workspace e tema.
- **Cabeçalho do board, em três faixas:**
  - Global, 56px, padding 0 24px: ícone do board na cor dele, nome (clique = informações), ajuda e conta.
  - Contexto, 48px: Fluxo · Automações · Conexões ▾ e, à direita, Configurar.
  - Visões, 48px: abas de 40px (padding 12px 16px, 12px entre elas; ativa em `--accent` com sublinhado de 2px), busca em pill de 232px, filtro e recolher. Recolher esconde contexto e visões (persistido, aplicado antes da pintura).
- **Controles:** inputs, selects e botões com 32px de altura (`h-8`), borda `--line` e foco com borda `--accent`. No card aberto, inputs de 40px.
- **Menu suspenso** (`ui/menu.tsx`): fecha ao escolher um item, no clique fora e no Esc (o Esc não fecha o modal em volta).
- **Kanban:**
  - Área em `--bg`, borda superior de 1px, padding-left 24px.
  - Fase de 280px com margem superior de 16px; cards de 256px (12px de respiro de cada lado).
  - Cabeçalho da fase com 40px, `--paper`, borda `--line`, barra de 3px na cor da fase (borda, não sombra), "01. Nome" em 13.5px/600 com reticências, contador mono; configurar e ⋯ só no hover; "+" na primeira fase e nas com `allow_create`; ícone de arquivo na fase final.
  - 15 cards por fase e o resto ao rolar; o contador vem de `count(*)`.
  - Fase vazia: a descrição da fase (ou "Nenhum cartão nesta fase.") em caixa tracejada.
  - Botão flutuante "Criar novo cartão": pill de 40px no canto inferior esquerdo.
- **Cartão:**
  - Fundo `--paper`, borda 1px `--line`, raio 4px, padding 12px 12px 12px 8px, 8px entre cartões.
  - Título em 14px/600, altura de linha 20px, até 4 linhas.
  - Até 8 campos (padrão 6): ícone do tipo de 16px, rótulo de 10px em caixa-alta `--ink-3` e valor de 12px abaixo; seleções em chip cinza.
  - Rodapé em 10px/600: avatar, prazo relativo, comentários e anexos (se houver) e os tempos no fluxo, na fase (laranja passado o SLA, vermelho passado o prazo) e desde a atualização.
  - Sub-rodapé: relações N:1 marcadas "mostrar no card", com o nome do board e o card em chip na cor do board.
- **Arrastar:** o cartão arrastado ganha borda `--accent` e a coluna-alvo fica em `--paper`. A fase bloqueada por regra mostra contorno tracejado e o motivo, em tooltip e nota. Sem rotação nem escala.
- **Lista:** cabeçalho fixo, linhas de 40px virtualizadas, páginas de 50; colunas escolhidas e ordenadas no botão Colunas.
- **Card aberto:** modal centrado a 8px do viewport, até 1440px, raio 12px, véu `--veu`. Colunas de 564px (rolagem própria, 32px à esquerda), 564px (rolagem própria, borda esquerda) e 276px (fixa, borda esquerda). Abas em pill de 24px (padding 4px 8px). "Mover card para fase" em pills de 34px na cor da fase (fundo a 10%, borda a 35%, texto misturado com `--ink`). Ações do topo redondas de 32px.
- **Configurações do board:** modal até 1440px, raio 12px; paleta de tipos com 270px e botões de 32px; prévia do formulário num cartão de 520px sobre a cor da fase a 10%; editor de campo de 760px; condicionais em campos em modal de 520px.
- **Automações:** lista em cards até 1100px com grade de 4 colunas (evento, ação, atualizado em, atualizado por); editor com os painéis Evento → Ação lado a lado, ligados por um conector, e "Salvar automação" na largura do painel de ação.

### Onde o app difere da referência (decidido)

- Etiquetas (labels) não existem no modelo: o cartão e a lista não as mostram.
- Notificações, "Compartilhar formulário" e as visões Formulário e Relatórios não existem no produto e não aparecem no cabeçalho.
- O fundo do board é `--bg` e a faixa da fase é borda (não `box-shadow`): sem sombras.
- Ainda não existem no app: busca global na sidebar (⌘K), visão Calendário, permissões por fase, envio de e-mail pelo card.

## Conferir

- `pnpm lint`: inclui a checagem de design.
- `CAPTURAS=1 E2E_PORT=3300 pnpm e2e visual`: grava as capturas de kanban, lista, card aberto, configurações e automações, em claro e escuro, em `e2e/__screenshots__/pr2/`.
- `e2e/tema.spec.ts`: o tema segue o sistema, a escolha persiste depois de recarregar e o `<body>` já nasce com o tema certo.
