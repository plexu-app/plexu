# PRODUTO.md — v0.1 (2026-09-10)

## 1. Tese
Plataforma open source self-hosted onde um board nasce como Trello e cresce até ERP operacional sem migrar de ferramenta. Regras, relações e automações são do servidor; UI só reflete. Tudo que a API faz, a automação faz. Concorrente real: Pipefy (caro, fechado, regras no front) e NocoBase (genérico demais). Diferencial: processos entre áreas prontos (templates) sobre plataforma genérica, PT-BR primeiro.

## 2. Conceitos do domínio
| Termo | Definição |
|---|---|
| Workspace | Tenant. Contém boards, bases, usuários, papéis. |
| Board | Container de cards. Sem fases = lista/kanban livre. Com fases = pipe. Com datas/dependências = projeto. Mesmo objeto. |
| Base | Board sem fases usado como cadastro (parceiros, centro de custo, cargos). Diferença é só configuração. |
| Fase | Etapa do board. Define visibilidade/obrigatoriedade/edição por campo, responsável, SLA, regras de entrada/saída/retorno. |
| Campo | Definido no board, não na fase. Tipos: texto, número, data, seleção, pessoa, anexo, **relação**, **sequence**, **rollup**, **formula**, statement. |
| Card | Registro. UUID estável; título é campo de exibição. `props jsonb` + `phase_id` + `parent_card_id`. |
| Relação | FK entre cards (1:N ou N:N), bidirecional por construção, com nome nos dois lados. Nunca por título. |
| Regra | Predicado avaliado no servidor: `can_enter`, `can_leave`, `can_back`, `can_edit(field)`, `can_delete`. Olha card, filhos, pais, qualquer board. |
| Ação | Botão no card: condição de visibilidade + permissão + mini-form opcional + passos. |
| Automação | Mesmos passos de Ação, gatilho = evento / tempo / webhook / cron. |
| View | Renderização de um board: kanban, tabela, calendário, timeline/Gantt, formulário, dashboard. Desacoplada do tipo. |
| Template | Board(s) + campos + regras + automações empacotados por área. |
| Evento | Registro imutável de tudo que aconteceu (inclui field_updated). Base de auditoria, webhooks e ledger. |

## 3. Dores do Pipefy → decisão de design
Fonte: chats + sessão. Camada onde a decisão entra: C0 Trello, C1 Pipefy, C2 Monday/Project, C3 ERP, X plataforma.

### Campos e dados
| Dor | Decisão | Camada |
|---|---|---|
| Sem numeração automática (ex.: CT-125/2025, contador com semente inicial) | Campo `sequence` com escopo global/por pai, padrão `{prefix}-{seq}/{ano}`, semente configurável, atômico no servidor | C1 |
| 12 campos fixos para parcelas | Relação 1:N como sub-tabela dentro do card; parcela é card filho | C1 |
| Sem cálculo entre datas / contagem / soma | `formula` (local) e `rollup` (count/sum/min/max sobre relacionados), reavaliados por trigger | C2 |
| Excluir campo apaga valores sem migração; sem update em lote | Campo tem `archived_at`; valores nunca apagados; UI de migração de campo; update em lote nativo (view tabela + API) | X |
| Campos antigos vivos após criar novos; migração não fecha 1:1 | Rename/retipagem de campo com histórico; operação "mesclar campos" com regra de conflito | X |
| Validação de unicidade deixa campo vazio no duplicado | Constraint de unicidade real por campo (bloqueia criação, não limpa) | C1 |
| Sem "ao menos um de N obrigatório" | Regra de obrigatoriedade = expressão (`A or B`), não flag por campo | C1 |
| Statement não aceita required; select vira radio | Tipos de campo com contrato explícito; UI não altera tipo | X |
| Slug troca acento; colisão de slug entre pipes | Identificador do campo = UUID; slug é alias opcional, escopo do board | X |
| required ignorado por API/importer | Obrigatoriedade e regras avaliadas no servidor para todo canal (UI, API, import, automação). Import escolhe fase; regras valem | X |

### Relações
| Dor | Decisão | Camada |
|---|---|---|
| Relação por título; relatório sem ID; títulos duplicados | Relação = FK por UUID. Export/API/view sempre trazem `id` + título. Título pode repetir | C1 |
| Conexão só removível do pai; sem substituir em massa; `parent_relations` sem slug/pipe/paginação | Relação bidirecional; editável dos dois lados; operação em massa; API pagina tudo | C1 |
| Conexão criada por automação não aparece em campo | Não existe "conexão sem campo": toda relação é um campo de relação | C1 |
| Card em fase final some do seletor | Filtro do seletor configurável por relação (fase, status, expressão); padrão = todos | C1 |
| Conector exige ID numérico no prefill | Prefill aceita UUID ou busca por campo único (CNPJ) | C1 |
| Card-gêmeo (compras ↔ contrato) a implementar | Relação + automação `create_related` com mapeamento de campos | C1 |

### Fases e transições
| Dor | Decisão | Camada |
|---|---|---|
| Botão de mover ignora campos de fases anteriores | `can_leave(phase)` avalia obrigatórios de todas as fases anteriores + expressão custom. UI esconde/desabilita conforme resultado | C1 |
| Não pode voltar card / tratar filhos criados | `can_back` por fase: permitir / bloquear / exigir tratamento dos filhos (cancelar, excluir, manter). Campos travados enquanto filhos existirem | C1 |
| Gate de aprovação = comentário (não filtra/mede) | Primitiva `approval`: papel, quórum, decisão, prazo, registrada como evento. Filtrável em view e regra | C1 |
| Responsável condicional por fase não nativo; externo não pode ser assignee | Assignee por fase = expressão (campo pessoa, papel, rota por categoria). Usuário externo = licença leve (só seus cards/forms) | C1 |
| Fase final única obrigatória para gatilho "todos filhos movidos" | Fases marcadas `terminal: true` (N por board); gatilho `all_children(condition)` | C1 |
| Devolução de card por checklist incompleto | Checklist é tipo de campo; regra `all(checklist)` no `can_leave` — sem automação | C1 |

### Automações e ações
| Dor | Decisão | Camada |
|---|---|---|
| Sem botão de ação; checkbox + 2 automações | Primitiva `Ação` (botão + mini-form + passos) | C1 |
| Automação não limpa campo | Passo `set_field` aceita null. Paridade total API ↔ automação | C1 |
| Condição só olha o próprio card; sem "existe outro ativo" | Condição = expressão com acesso a relacionados e query em qualquer board (`exists(board, filter)`) | C2 |
| Sem "não contém"; E/OU limitado | Editor de expressão completo (grupos aninhados, operadores de set, regex) | C1 |
| Corrige só após entrar na fase (dispara cascata) | Regras de entrada bloqueiam antes de mover; automações têm `run_as` e flag para não disparar outras | C1 |
| Webhook não propaga edição de filho ao pai | Todo evento gera webhook; assinatura por board/campo/relação; rollups do pai atualizam e emitem evento | X |
| `createCard` sempre na fase 1 | API cria em qualquer fase (regras valem) | X |
| Automação de teste ativa em produção | Ambientes por automação: rascunho / teste (dry-run com log) / produção | X |
| Cada ação amplifica 2,4× consumo; 429 sem retry perde cards | Sem cota por request (self-hosted). Fila com retry/backoff e dead-letter visível | X |
| Sistema externo sem webhook = polling manual | Conector genérico de polling (GET + diff + mapeamento) configurável na UI | C2 |

### Relatórios, auditoria, API
| Dor | Decisão | Camada |
|---|---|---|
| Audit log sem field_updated; 30 dias | Log de eventos imutável, ilimitado, inclui valor anterior/novo por campo. Export e API | X |
| GraphQL não retorna automações/condicionais/fórmulas | Configuração do board 100% exportável/importável (JSON) — base de templates e versionamento | X |
| Export xlsx desalinhado; coluna 1 ≠ título | Export sempre a partir do modelo (id, título, campos por UUID) | X |
| Mutations mudam de nome; PAT depreciado | API versionada; OpenAPI + SDK gerado; service accounts desde v1 | X |
| Painel de consumo sem recorte | Métricas por board/automação/usuário (Prometheus) | X |
| Painel de saúde do pipe (obrigatórios vazios, pendências, erro automação vs usuário) | View `Saúde` nativa por board | C2 |
| Relatório "o que mudou por pessoa/período" | View sobre o log de eventos | C2 |
| "Lançado" ≠ pago; sem definição formal de status | Campo `status` semântico por template (pago = evento imutável, não fase) | C3 |

### Views e projetos
| Dor | Decisão | Camada |
|---|---|---|
| Pipe sem timeline/Gantt; cronograma mantido à mão em ferramenta separada | Timeline/Gantt sobre qualquer board com campos de data + dependências entre cards | C2 |
| Prazo vive no card ou no dashboard? | Nos dois: `formula` no card + dashboard nativo por board | C2 |
| Form público redireciona para login; sem default values | Forms públicos sem sessão; prefill por URL/UUID; portal com defaults | C1 |
| Apps embutidos (iframe legacy) | Extensões: painel no card via webview + SDK; marketplace depois | X |

## 4. Camadas
- **C0 Trello**: board, cards, checklist, prazo, responsável, comentários, kanban/tabela/calendário.
- **C1 Pipefy+**: fases, campos por fase, regras de transição (frente/trás), relações por ID, sequence, ações, automações, aprovações, forms públicos, bases.
- **C2 Monday/Project**: rollup/formula, timeline/Gantt, dashboards, view saúde, condições cross-board, conectores de polling.
- **C3 ERP**: eventos imutáveis (ledger), status semântico, templates de contratos/parcelas/compras/RH, integrações com ERPs de mercado como conectores.
- **X Plataforma**: eventos/auditoria, API versionada, export/import de configuração, ambientes de automação, fila, métricas, extensões.

## 5. Fora de escopo v1
Whiteboard (embed tldraw), chat completo (comentários + canal por board cobrem), fiscal/NF-e/SPED (integrar), BI próprio (Postgres aberto para BI externo), app mobile nativo.

## 6. Templates candidatos (dos processos reais)
Cadastro único de parceiros (dedup por raiz CNPJ), Gestão contratual + Parcelas, Comercial/Propostas + Revisões, Compras (Solicitação → Cotação → OC), Requisição de pessoas + R&S, Logística/Viagens e adiantamentos, Checklist de integração (onboarding/offboarding).

## 7. Decisões tomadas
1. Filho pode ou não travar o pai: regra configurável pelo usuário (`can_back` aceita condição sobre filhos).
2. `sequence`: contador com escopo configurável — global, por board, por pai (versão do contrato), por dia/mês/ano (reinício); padrão de formatação livre.
3. Versão de contrato = card novo vinculado ao card pai (relação `versao_de`); pai mostra versão atual via rollup.
4. Externo só via form público, sem licença.
5. Base e Board = mesma estrutura. Diferença é `kind: workflow | database` (preset + ícone + defaults: database sem fases, usado como origem de seleção/categorização/usuários). Sem limitação funcional entre os dois.
6. Self-hosted = instalação única por empresa (sem controle nosso). Cloud = multi-tenant por `workspace_id` + RLS. Schema único para os dois.
7. Dois níveis de automação, mesmo motor: **Simples** (gatilho → condição → ação, no-code) e **Fluxo** (grafo de blocos: ações, condicionais com ramos, loops, chamadas externas — estilo n8n). Expressões internas em CEL, escondidas atrás de editor visual.
8. Importador Pipefy: **não é v1**. Fica como serviço pago (open core / cloud). Nota: pesar depois — é também canal de aquisição; pode valer versão básica gratuita + migração assistida paga.

9. Campo calculado é `dynamic_text`: modelo de texto com trechos calculados escolhidos visualmente; somente leitura (gaveta `computed`).
10. Conexão pode ser **exclusiva** (card só selecionável em um card daquela conexão) e pode **travar campos herdados** enquanto existir card à frente na cadeia (solicitação → cotação → OC). Desfaz-se de trás pra frente.
11. Obrigatório/visível: UI oferece **sim/não** e **condicional**; internamente sim/não = expressão constante.
12. Permissão de escrita por campo: `field.write` com sujeito (usuário/grupo/papel) + condição opcional (ex.: só na fase X). Já no schema.
13. Log de eventos cobre **dados** (cards) e **configuração** (campos, regras, automações, permissões). Nada é apagado.
14. `sequence` — regra por board/campo: **formato** (`CT-{n:4}/{ano}`), **escopo** (global | ano | mês | dia | pai), **semente** (início), **zeros à esquerda**, **encadeamento** (`{pai.numero}-v{n}`). Ver exemplos em schema.sql.
15. Contexto das expressões (regras, condições, visibilidade, fórmulas): `card`, `pai`/`pais(conexão)`, `filhos(conexão)` com `todos/algum/contar/soma`, `fase`, `fase_origem`, `fase_destino`, `usuario`, `existe(board, filtro)`. Nomes PT-BR na UI; CEL por baixo.
16. Equipe: 1 dev + colaboradores eventuais → MVP enxuto (seção 10).
17. Exclusão lógica de card **não** remove `card_links`: a ligação fica inativa (`card_links.deleted_at` espelhado) e volta ao restaurar o card. Relação exclusiva, rollups, `filhos()`/`pais()` e cardinalidade ignoram cards com `deleted_at`. Motivo: restaurar um card devolve suas relações sem reconstrução manual, e o índice único parcial da exclusiva continua garantido pelo banco.
18. **Fase de origem** do campo (`fields.config.origin_phase_id`, opcional): antes dela o campo fica oculto; na fase, editável; depois, somente leitura. `field_phase_settings` continua como override, atributo por atributo. Campo sem origem mantém o comportamento de sempre (visível e editável em todas as fases). Em campos calculados, a origem é a fase em que passam a ser exibidos. Obrigatório vale para sair da fase (e para criar nela ou depois dela).

## 8. Referência Pipefy — catálogo de capacidades (doc pública developers.pipefy.com, set/2026)
Índice completo em `https://developers.pipefy.com/llms.txt` (markdown por página; OpenAPI). Usar como checklist de paridade.

**Automação nativa (gatilho → condição → ação)**
- Eventos: `card_created`, `card_moved`, `field_updated` (+ outros não listados na doc; API `automationEvents` retorna todos). Cada evento tem blacklist de ações.
- Ações conhecidas: `create_card`, `create_connected_card`, `update_card_field`, `move_card`, `move_multiple_cards`, `schedule_create_card`, `send_email_template`, `distribute_assignments`, `send_http_request`, `run_a_formula`, `generate_with_ai`, `apply_sla_rules`.
- Suporte: simulação de execução, logs por repo, métricas, export de jobs, "initial values", operações de fórmula automatizada.

**Apps (extensões em iframe)**: superfícies `card-badges`, `card-buttons`, `card-tab`, `pipe-buttons` (dropdown/modal/sidebar), `pipe-view` (substitui o kanban). SDK client: ler dados, chamar API, custom app data (KV por app), UI functions.

**Já cobertos no PRODUTO.md**: campos por fase, conexões, obrigatoriedade, formulários/start form, forms públicos, webhooks (org e pipe/table), importer (cards/records), relatórios por pipe, activities/audit, tags, e-mail por card, SMTP próprio, service accounts.

**Gaps — adicionar às camadas**
| Capacidade Pipefy | Decisão | Camada |
|---|---|---|
| Snapshot / restore / sandbox version do pipe | Versionamento da configuração do board (já previsto o export JSON) + **sandbox**: copiar board, testar, promover. Git-like, com diff | X |
| Tasks por fase/card ("minhas tarefas" na org) | Checklist/tarefa como card filho leve ou campo checklist com responsável+prazo; view "Minhas tarefas" cross-board | C0 |
| Tags com categorias e visibilidade | Tags = base do workspace, com categoria; visibilidade por board | C0 |
| Custom roles + save role permission + groups | RBAC: papéis custom, permissões por board/fase/campo/ação; grupos de usuários como sujeito de permissão e de assignee | C1 |
| Relatórios de organização + busca de cards cross-pipe | View tabela cross-board (union por campos mapeados) + busca global | C2 |
| Field dependencies (onde o campo é usado) | Antes de arquivar campo: listar regras/automações/rollups/views dependentes | X |
| Archive/unarchive field | Já decidido (`archived_at`) | X |
| `distribute_assignments` (round-robin) | Passo de automação `assign`: fixo / round-robin / por carga / por expressão | C1 |
| `schedule_create_card` (recorrência) | Gatilho cron nativo (despesas recorrentes, assinaturas) | C1 |
| `apply_sla_rules` | SLA por fase: prazo, alerta, escalonamento; SLA como campo derivado filtrável | C1 |
| `generate_with_ai` / AI agents / knowledge base | Fora do v1. Depois: passo `llm` na automação com provedor configurável (BYO key) | C3 |
| E-mail inbox por card (receber e-mail no card) | Endereço de e-mail por board/card; e-mail recebido vira comentário/anexo/card | C2 |
| Usage stats (API, automação, integrações) | Métricas por board/automação/usuário (já previsto) | X |
| Tickets de suporte | Não aplicável (self-hosted) | — |
| Pipe-view (substituir kanban por view custom) | Extensão de view: registrar view custom via SDK | X |

## 9. Inspeção de uma instância real (Pipefy Enterprise, set/2026) → decisões
Fonte: levantamento de telas de configuração + metadados via API. Observação: o cadastro de parceiros era um pipe (688 cards) com database-espelho (446 reg.) — sintoma de database limitado demais.

**Evidência quantitativa da tese** — pipe real de gestão contratual: 74 automações (60 ativas), 69 conexões, 73 condicionais, 19 relatórios (um com 186 colunas).
- 12× "Medir parcela NN" + 12× "soma valor global N/12" + 12× "soma pago" + 12× "saldo residual" (inativas) + 1 subtração = **49 automações** que no nosso modelo viram: parcela como card filho + 3 rollups (`valor_global = sum(filhos.valor)`, `valor_pago = sum(filhos.valor where medida)`, `saldo = global − pago`). Zero automações.
- Mesma regra de bloqueio duplicada em 3 fases → 1 regra `can_enter(fase ≥ elaboração) := all(parcelas.data_medicao != null)`.
- Checklist incompleto "bloqueado" movendo o card de volta → `can_enter(fase final)` avalia checklist; card nunca entra.
- Encadeamento Medir → Pago → Saldo → HTTP = 4+ execuções por medição → cota. Rollups são síncronos; webhook único no evento final.
- Condição `(≠10) OU (≠20)` (sempre verdadeira) em produção → **lint de regras**: alertar condição tautológica/contraditória e automações sem condição que copiam valor vazio.

| Achado | Decisão | Camada |
|---|---|---|
| 21 tipos de campo; `cpf`/`cnpj` só via API; sem valor padrão; máscara só implícita; unicidade não exposta na API para pipes | Catálogo de tipos com contrato único UI=API: + `cpf`, `cnpj`, `cep`, `pix`; **valor padrão** (fixo ou expressão) e **máscara** em todo tipo; unicidade em qualquer board | C1 |
| Conexão avançada: filho obrigatório p/ pai finalizar; pai só avança com filhos em fase final; autopreencher do conectado | Já coberto por regras sobre filhos. Autopreencher = campo `lookup` com modo **cópia** (snapshot) ou **referência** (live). Resolve "contratante defasado" | C1 |
| 73 condicionais mostrar/ocultar por campo | Visibilidade de campo = expressão, mesma engine das regras | C1 |
| 10 gatilhos (inclui `card_left_phase`, `sla_based`, `card_inbox_received_email`, `all_children_in_phase`, `http_response_received`, `manually_triggered`) | Adotar todos + `card_deleted`, `relation_changed`, `approval_decided`, `comment_added`, `cron` | C1 |
| Operadores de data (hoje/ontem/semana/mês/ano atual e anterior); texto sem regex; select sem "está em" | Set completo: comparação, `in`, `between`, regex, relativos a hoje (`± N dias/úteis`), funções de data | C1 |
| Ações: update com ADD/REMOVE/REPLACE; fórmula com 10 operações; HTTP c/ OAuth2; SLA c/ feriados; round-robin/random | Adotar. Fórmula vira `formula`/`rollup` (não ação). Feriados/horário comercial = calendário do workspace | C1 |
| Cota de automações/mês (Enterprise 2.000); `premium_action` | Sem cota. Métrica de execuções por board para operação | X |
| iPaaS (Fluxos/Execuções/Conexões/Variáveis; blocos Router/Code/HTTP/CSV/Data Mapper; Sheets/Slack/Gmail/HubSpot); alterações não publicadas | Automação "Fluxo" (decisão 7) com **rascunho/publicado**, conexões (credenciais) e variáveis por workspace. Blocos iniciais: Router, HTTP, Code (sandbox), CSV, Data Mapper, e-mail | C2 |
| **Sem permissão por fase nem por campo** | Confirma diferencial: permissão por board/fase/campo/ação; papéis custom + grupos | C1 |
| Papéis pipe: admin, membro, só meus cards, ler e comentar; "só responsáveis editam"; "só admin exclui" | Presets equivalentes + regra `can_edit`/`can_delete` por expressão (`assignee == user`) | C1 |
| Pipe de contratos aberto p/ toda a org + form público ativo (campos com valores) | Padrão **privado**; alerta na UI quando board com campos moeda/anexo está aberto à org ou com form público | X |
| Fase: final, criar card aqui, responsável automático, SLA, destinos permitidos | Adotar; destinos permitidos = caso especial de `can_enter` | C1 |
| Pipe: expiração, e-mail de entrada cria card, templates, SMTP, dias úteis | Adotar; calendário de dias úteis por workspace | C1 |
| Form público: branding, mensagem pós-envio, reutilizar envio, coleta e-mail, captcha, white label, embed | Adotar; sem paywall de white label | C1 |
| Interfaces/Portal (limite 100): Dados, Formulários, Documento, Texto, Link, Imagem, Vídeo, Embed | **Portal** = página composta de blocos (tabela filtrada, form, texto, embed); visibilidade interna/privada/pública; sem limite | C2 |
| Database: gerenciar tabela × gerenciar registros | Permissões separadas: schema vs dados | C1 |
| Relatórios: colunas, ordenação, fórmula por coluna, filtros E/OU com 11 operadores, export pago | View tabela salva = relatório; agregação por coluna; export sempre | C2 |
| Painéis: métrica × dimensão × tempo; lead time, tempo na fase, movimentações | Dashboard nativo com essas métricas derivadas do log de eventos | C2 |
| Exports: auditoria CSV/JSONL, membros, logs de automação | Adotar | X |

## 10. MVP v0 (1 dev, ~4 meses)
**Objetivo de aceitação**: reconstruir o processo "contratos → parcelas" real com ≤ 10 automações (hoje 74) e zero planilha.

**Entra**
- Tabelas (17): workspaces, users, workspace_members, boards, phases, fields, field_phase_settings, cards, card_links, sequences, card_comments, attachments, rules, actions, automations, automation_runs, events.
- Campos: text, long_text, number, currency, date, boolean, select, multi_select, person, attachment, cpf, cnpj, **relation** (exclusive, lock), **sequence**, **rollup** (count/sum), **dynamic_text**, lookup (modo cópia).
- Regras: can_enter, can_leave, can_back (block/keep), can_edit. Contexto da decisão 15.
- Ações: botão com passos `set_field`, `move`, `create_related`, `http`.
- Automação simples: gatilhos `card_created`, `card_moved`, `field_updated`; mesmos passos; rascunho/publicado; log de execução.
- Views: kanban, tabela (filtro, ordenação, colunas, export CSV). Uma view salva por board no início.
- Permissão: por board (admin/member/reader). Schema completo já existe; UI por fase/campo fica para v1.
- Eventos imutáveis + tela de histórico do card.
- API REST v1 (OpenAPI) com service account. Docker compose. PT-BR.

**Fica para v1**: `can_back` com `on_fail.children` = `cancel`/`delete` (MVP só `block`/`keep`), `restoreCard` exigir a permissão `card.delete` (hoje o core restaura sem checar permissão; a UI ainda não oferece restauração), e2e sobre a imagem Docker de produção (hoje sobre `next dev`), groups/roles/permissions finas, approvals, tags, tasks, forms públicos, portals, webhooks, connections/variables, calendars/SLA, snapshots/sandbox, templates, extensions, calendário/timeline/gantt/dashboard, automação em modo Fluxo, e-mail.

**Stack (decisão)**: TypeScript ponta a ponta. Next.js (App Router) + Drizzle + Postgres; cel-js para expressões; fila em Postgres (pg-boss) — sem Redis no MVP. UI: Tailwind + shadcn + dnd-kit + TanStack Table.
