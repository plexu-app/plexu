# Redesign PR 2 — paridade estrutural com a referência de mercado (kanban, card, configurações, automações, lista)

Leia `CLAUDE.md`, `docs/DESIGN.md` e `docs/design/mockups.html` antes de começar.

**Regra deste PR:** a *estrutura, as medidas e o comportamento* abaixo foram medidos na ferramenta líder de mercado e devem ser replicados. A *pele* (fontes Archivo/Plex Mono, tokens de cor, tema claro/escuro, linhas 1px) continua a do `DESIGN.md`. Não copie nomes, textos, ícones ou assets de terceiros. Nenhum dado real entra no repo.

Branch: `feat/paridade-ux`. Pode virar 3 PRs (A: shell+kanban+lista, B: card, C: config+automações) — abra cada uma ao terminar, sem esperar CI.

---

## A. Shell, kanban e lista

### A1. Cabeçalho em 3 faixas (substitui o header atual da página do board)
| Faixa | Altura | Conteúdo |
|---|---|---|
| Global | 56px, padding 0 24px | ícone do board + nome (clique = info), à direita notificações/ajuda/avatar |
| Contexto | 48px | navegação do board: **Fluxo** · **Automações** · **Conexões ▾** (boards relacionados) ; à direita **Compartilhar formulário** e **Configurar** |
| Visões | 48px, abas com gap 12px, aba 40px de altura, padding 12px 16px | **Kanban · Lista · Formulário · Relatórios** ; à direita busca (232px, pill) + filtro + recolher cabeçalho (^) |

- Aba ativa = texto `--accent` + sublinhado 2px.
- Botão "recolher cabeçalho" esconde as faixas 2 e 3 (ganha espaço vertical). Persistir em localStorage.
- A sidebar lateral do PR 1 continua, mas **começa recolhida** quando a tela < 1600px.

### A2. Kanban (medidas exatas)
- Área das fases: fundo `--bg`, borda superior 1px, padding-left 24px, scroll horizontal.
- Fase: largura **280px**, margem-top 16px; cards ocupam **256px** (12px de respiro lateral).
- Cabeçalho da fase: 40px, `--paper`, borda 1px `--line`, raio 4px, **faixa de 3px no topo na cor da fase** (box-shadow inset), nome 13–14px 600 com ellipsis, contador mono ao lado. Ícones (engrenagem → configurar fase, ⋯) aparecem **só no hover**.
- **"+" no cabeçalho** apenas nas fases com `allow_create` (abre formulário inicial).
- Fase vazia: mostra a **descrição da fase** em texto `--ink-3` centralizado (campo `phases.settings.description`; criar no editor de fase).
- Fase terminal: ícone de "arquivo/check" antes do nome.
- **Paginação por fase (crítico para velocidade):** carregar **15 cards por fase** e o resto por scroll infinito dentro da coluna (IntersectionObserver). Contador da fase vem de `count(*)` separado. Hoje carregamos tudo — com milhares de cards isso trava.
- Botão flutuante "+ Criar novo card" (pill, 40px, canto inferior esquerdo) quando a primeira fase permitir criação.

### A3. Card no kanban
- Fundo `--paper`, raio 4px, sem sombra, margin-bottom 8px, padding **12px 12px 12px 8px**.
- Etiquetas (labels): pill 16px de altura, 10px 600, padding 2px 6px, cor sólida da etiqueta.
- Título: 14px 600, line-height 20px, até 4 linhas, padding-right 20px (ícone de "abrir conexões" no canto).
- Campos resumidos (configuráveis por board, **até 8**, padrão 6): cada um = **ícone do tipo 16px + label 10px uppercase `--ink-3` + valor 12px** em linha abaixo. Seleção/rádio aparece como chip cinza.
- Rodapé (margem-top 6px): estatísticas 10px 600 com ícone — **tempo total no fluxo**, **tempo na fase atual**, **tempo desde a última atualização** (ex.: `214d`, `19h`). Antes delas, contadores de comentários e anexos quando > 0, e e-mail se houver.
  - Cor do "tempo na fase": `--ink-3` normal; laranja se passou do SLA da fase; vermelho se passou do prazo do card.
- **Sub-rodapé de conexões**: separado por linha 1px, padding 8px 12px 12px; para cada relação N:1 marcada "mostrar no card": nome do board relacionado (10px uppercase, com ícone) + título do card relacionado em **chip na cor do board** com ellipsis.
- Configuração dos campos exibidos: em Configurar → aba Fluxo → "Campos no card" (checkbox + ordem).

### A4. Lista (nova visão)
- Tabela com header sticky; colunas de sistema: **Fase atual · Título · Vencimento · Responsáveis · Etiquetas · Tempo na fase · Tempo no fluxo · Última atualização**, seguidas dos campos do board.
- Botão **Colunas** (escolher/ordenar, salvo na view), filtro e busca compartilhados com o kanban.
- Seleção múltipla (checkbox) para ações em massa (mover, atribuir) — se ficar grande, deixar só a seleção e abrir issue.
- Paginação no servidor (50 por página) com virtualização de linhas.

---

## B. Card aberto

### B1. Formato
- **Modal centrado**, não gaveta: overlay `rgba(ink, .6)`, margem 8px do viewport, **largura máx 1440px**, altura total, **raio 12px**, fundo `--paper`.
- Rota própria `/w/[ws]/c/[cardId]` (abre por cima do board com intercepting route do Next; link direto abre a página do card). Fechar = X, Esc ou clique no overlay.
- Ações no topo direito (32px, redondos): ⋯ (copiar link, duplicar, excluir, imprimir) e X.

### B2. Três colunas
| Coluna | Largura | Scroll | Conteúdo |
|---|---|---|---|
| Esquerda | 564px, padding 24px 24px 24px 0 (+32px à esquerda do modal) | **própria** | título, etiquetas, abas, conexões, histórico |
| Centro | 564px, padding 24px, borda esquerda 1px | **própria** | fase atual |
| Direita | 276px, borda esquerda 1px | fixa | mover, responsável, prazo |

As duas primeiras colunas rolam **independentes** (é assim na referência também). A direita não rola.

**Esquerda:**
1. Título 20px 700 (editável inline se o board permitir) + etiquetas.
2. Linha de **abas em pill** (24px, padding 4px 8px, gap 8px): **Formulário** (ativa por padrão, fundo `--bg`) · **Atividades** · **Anexos** · **Comentários** · **E-mail**. Trocar a aba troca o conteúdo abaixo, mantendo título.
3. **"Este card está conectado a"**: lista de cards relacionados (pais e filhos) como **mini-cards** com borda 1px, raio 4px: título 14px 600, depois grade 2 colunas de até 4 campos (board de origem com ícone, fase atual com cor, campos marcados "mostrar no card"). Menu ⋯ (abrir, desconectar). "Mostrar mais" após 3.
4. **Histórico por fase**: seção "Formulário inicial" (com "Criado por X · há N dias") e depois uma seção por fase já percorrida, na ordem. Cada campo: **ícone do tipo + label 14px** e valor abaixo (indentado 24px); **lápis no hover** para editar ali mesmo (respeitando `can_edit` / `editable_everywhere`). Relação aparece como mini-card. Campos vazios: omitir, com "mostrar campos vazios" no fim da seção.

**Centro:**
- Cabeçalho: "Fase atual" + chip com nome da fase na cor da fase + ícone de config (só admin) + "Compartilhar" à direita.
- Campos da fase em **uma coluna** (não 2): label 14px, input 40px, raio 4px, borda 1px. Obrigatórios com `*`. Autosave on blur (já existe).
- Campos `dynamic_text` renderizam como bloco de texto.

**Direita — "Mover card para fase":**
- **Só aparecem os destinos permitidos** (resolve `can_leave`/`can_enter` no servidor antes de renderizar). Nada de lista de "destinos permitidos" em vermelho.
- Cada destino: **pill 34px, largura total, padding 8px 12px, borda 1px, texto e fundo derivados da cor da fase** (fundo = cor a 10%, borda = cor a 35%, texto = cor escurecida; no escuro inverter luminância), seta → à direita.
- Fase anterior (se `can_back`): pill neutra com seta ← .
- Se um destino é permitido pela transição mas bloqueado por regra (campo obrigatório vazio), mostrar a pill desabilitada com o **motivo em 12px abaixo dela** — uma vez, não repetido.
- Link "Configurar movimentação" (só admin) abre as transições da fase.
- Abaixo: Responsável, Prazo, Ações (botões de `actions`), Copiar link, Excluir.

### B3. Abas
- **Atividades**: timeline dos `events` do card (quem, quando, o quê; movimentos com cor da fase; diffs de campo "de → para").
- **Comentários**: lista + caixa de envio com menção (@) — menção pode ficar para depois se não existir.
- **Anexos**: todos os anexos do card agrupados por campo.
- **E-mail**: placeholder "em breve" se não houver envio implementado.

---

## C. Configurações e automações

### C1. Configurações do board (modal grande, raio 12px, 1440px)
- Abas: **Formulário inicial · Fases · Pessoas · E-mail · Configurações do fluxo**.
- Em Formulário inicial e Fases:
  - Topo: **seletor da fase** (dropdown com cor) + à direita "Condicionais em campos" e "Opções avançadas" (permissões da fase, SLA, descrição, `allow_create`, terminal).
  - Esquerda (≈270px, scroll próprio): **paleta "Tipos de campo"** — botões 32px com ícone, clique adiciona ao fim, arrastar insere na posição. Depois seção "Campos de relação" (relação com fluxo / com base).
  - Centro: **pré-visualização do formulário** sobre fundo com a cor da fase a 10%, cartão branco de 520px com "Fase atual / nome da fase" no topo; campos com alça de arraste (⠿), lápis e ⋯ no hover. Filtro "Campos: ativos / arquivados".
- **Editor de campo** (modal 760px, 2 colunas): esquerda = nome, descrição (toggle), texto de ajuda (toggle), opções específicas do tipo, obrigatório, editável em outras fases; direita = **pré-visualização ao vivo** ("Esta é uma prévia do seu campo"). Rodapé: **"Dependências do campo"** (lista onde o campo é usado: regras, automações, condicionais, expressões, relações) + Cancelar/Salvar.
- **Condicionais em campos** (modal 520px): busca, filtro por campo, lista ordenada (ordem importa; arrastar). Editor: nome (+ "sugerir nome" gerado da condição), **condições** (campo · operador · valor, "+ condição", "+ grupo" com E/OU), **"Quando verdadeiro"** → ações, **"Quando falso"** → ações. Ações: Exibir, Ocultar, **Tornar obrigatório**, **Tornar opcional**, **Bloquear edição** (as três últimas a referência não tem — é diferencial nosso; gera `visible_expr`/`required_expr`/override por fase).

### C2. Automações
- Página própria no nível do board (aba "Automações" da faixa de contexto), com sub-abas **Automações · Logs**.
- Lista em **cards largos** (max 1100px centralizado): nome + toggle ligado/desligado + ⋯; grade 4 colunas: **Evento** (ícone + frase), **Ação** (ícone + frase), **Atualizado em**, **Atualizado por**. Contador "Mostrando N automações", busca, filtros (evento, ação, status), ordenação, alternar card/linha compacta, "+ Nova automação".
- **Editor**: título editável + "Ver logs"; **dois painéis lado a lado ligados por conector**: Evento (com "e também siga estas condições" + adicionar condição) → Ação; botão "Salvar automação" largura total abaixo da ação. Para `mode=flow`, os passos empilham à direita em sequência numerada (já temos), mantendo o mesmo visual de painel.
- **Logs**: tabela de `automation_runs` (quando, automação, card, status com cor, duração, erro expandível) com filtro por status e automação.

---

## Lacunas funcionais identificadas (implementar neste ciclo)
1. Estatísticas de tempo por card (fluxo / fase / última atualização) — precisam de `phase_entered_at` (já existe) e `created_at`/`updated_at`.
2. Contadores de comentários e anexos no card do kanban (query agregada por página).
3. Descrição da fase (mostrada na fase vazia e no topo do formulário da fase).
4. "Dependências do campo".
5. Logs de automação navegáveis.
6. Visão Lista.
7. Paginação por fase no kanban.

## Desempenho (meta, medir no PR)
- Medir em `docker compose` (produção), não em `pnpm dev`.
- Seed de carga opcional `corepack pnpm db:seed --carga` (5.000 cards genéricos num board) só para medir.
- Metas: board com 5.000 cards abre < 1s (TTFB+render, 15/fase); abrir card < 400ms; mover card < 300ms (otimista na UI).
- Abrir card: prefetch no hover do card no kanban.

## Verificação
- typecheck, lint (incl. check de design), vitest.
- e2e: abrir card via kanban e via URL; mover só para destino permitido; editar campo no histórico; scroll infinito numa fase com 40 cards; lista com escolha de colunas; editor de condicional gera a expressão certa.
- Screenshots claro/escuro de: kanban, card aberto, config de fase, editor de campo, lista de automações, editor de automação. No PR.
- Nada de dados reais nem termos de empresa no diff (rodar o scan de termos).
