# Fluxos do Sistema CREMEPE SEI

Este documento descreve **detalhadamente todos os fluxos** do sistema em seu estado atual (conforme código-fonte). Ele substitui o antigo `fluxo-importacao-sincronizacao.md`, que cobria apenas importação e sincronização.

## Sumário

1. [Visão geral e arquitetura](#1-visão-geral-e-arquitetura)
2. [Convenções da API](#2-convenções-da-api)
3. [Autenticação e sessão](#3-autenticação-e-sessão)
4. [Permissões e controle de acesso](#4-permissões-e-controle-de-acesso)
5. [Cadastro e importação de processos](#5-cadastro-e-importação-de-processos)
6. [Sincronização com o SEI](#6-sincronização-com-o-sei)
7. [Integração SEI (SOAP)](#7-integração-sei-soap)
8. [Status, conclusão e herança](#8-status-conclusão-e-herança)
9. [Processos parados](#9-processos-parados)
10. [Resumo com IA](#10-resumo-com-ia)
11. [Anotações](#11-anotações)
12. [Tags (etiquetas)](#12-tags-etiquetas)
13. [Listagem, busca e filtros de processos](#13-listagem-busca-e-filtros-de-processos)
14. [Dashboard](#14-dashboard)
15. [Relatórios e exportações](#15-relatórios-e-exportações)
16. [Administração](#16-administração)
17. [Perfil e unidades do usuário](#17-perfil-e-unidades-do-usuário)
18. [Segurança, erros e limites](#18-segurança-erros-e-limites)
19. [Mapa de rotas do frontend](#19-mapa-de-rotas-do-frontend)
20. [Tabela completa de endpoints](#20-tabela-completa-de-endpoints)
21. [Pontos de atenção e dívidas técnicas](#21-pontos-de-atenção-e-dívidas-técnicas)

---

## 1. Visão geral e arquitetura

```mermaid
flowchart LR
    U["Usuário (navegador)"]
    F["Frontend SPA\nReact + Vite + Tailwind\nporta 8443"]
    B["Backend REST\nExpress + Prisma\nporta 8000"]
    DB[("SQLite\nbackend/prisma/dev.db")]
    SEI["SEI WebService (SOAP)\nconsultarProcedimento,\nlistarAndamentos,\nlistarUnidades,\nlistarUsuarios"]
    LLM["Google Gemini\n(geração de resumo)"]
    AD["Active Directory\n(LDAP)"]

    U --> F
    F -- "REST + JSON\n(Bearer JWT)" --> B
    B --> DB
    B -- "XML/SOAP" --> SEI
    B -- "prompt + texto" --> LLM
    B -- "bind de teste" --> AD
```

- **Frontend**: SPA React (`frontend/`), servida em dev pelo Vite na porta `8443`.
- **Backend**: API Express (`backend/`), porta `8000`, banco **SQLite** via Prisma.
- **Integrações externas**: SEI (SOAP), Google Gemini (resumos), Active Directory (autenticação LDAP, opcional).
- **Importante**: a API do SEI **não permite listar processos** — só consulta individual por número. Por isso todo fluxo parte de números informados pelo usuário (cadastro/importação) e é atualizado sob demanda (sincronização).

---

## 2. Convenções da API

| Item         | Convenção                                                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base URL     | `VITE_API_URL` ou `http://127.0.0.1:8000/api` (`frontend/src/api.ts`)                                                                                                     |
| Autenticação | Header`Authorization: Bearer <JWT>` em todas as rotas (exceto `/login`)                                                                                                   |
| Erros        | JSON`{ "error": "<mensagem>" }` com status HTTP adequado (400/401/403/404/409/413/422/500)                                                                                |
| Idioma       | **Rotas de API, subrotas e parâmetros de URL da navegação em português**; _query params_ de filtro em inglês (`page`, `limit`, `search`, `status`, `unit`, `dateFrom`...) |
| Sessão       | Token + usuário no`localStorage` (`cremepe_token`, `cremepe_user`); **não há endpoint de logout** (o logout é apenas cliente)                                             |

Montagem das rotas no backend (`backend/src/index.ts`):

| Prefixo              | Router                | Assunto                                              |
| -------------------- | --------------------- | ---------------------------------------------------- |
| `/api/autenticacao`  | `routes/auth.ts`      | Login, perfil, unidades do usuário                   |
| `/api/processos`     | `routes/processes.ts` | Processos, sincronização, resumo, anotações          |
| `/api/etiquetas`     | `routes/tags.ts`      | Tags                                                 |
| `/api/administracao` | `routes/admin.ts`     | Usuários, registros e configurações (**admin only**) |
| `/api/sei`           | `routes/sei.ts`       | Unidades CREMEPE do SEI                              |
| `/api/saude`         | `index.ts`            | Health check (`{ status: "ok" }`)                    |

---

## 3. Autenticação e sessão

### 3.1 Tela de login

- `frontend/src/components/Login.tsx`: campo **Usuário** — informe seu **username** (para AD, o sAMAccountName; ex.: `meduarda`; nunca o prefixo do e-mail por convenção) + **Senha**; checkbox "Lembrar-me" (apenas visual — o token sempre vai para o `localStorage`).
- Texto de apoio: "Entre com sua senha do Active Directory".

### 3.2 `POST /api/autenticacao/login` — login por username (local × AD)

```mermaid
flowchart TD
    L["POST /autenticacao/login\n{ email: username informado, password }"] --> LOOK["Localiza a conta:\n1) username (quando sem @)\n2) e-mail (quando digitado com @)"]
    LOOK --> U{"Usuário existe\nno banco?"}
    U -->|"authSource = ad"| LDAP["ldapBind(username da conta)\nA SENHA vem do AD"]
    U -->|"authSource = local"| BC["bcrypt.compare\nA senha está no sistema"]
    U -->|"não existe"| LDAP2["ldapBind(username informado)"]
    LDAP -->|"falhou"| E401["401 Credenciais inválidas\n(auditoria registra o idAd usado)"]
    BC -->|"senha errada"| E401
    LDAP2 -->|"falhou"| E401
    LDAP --> AC{"active?"}
    BC --> AC
    AC -->|"inativo"| E403["403 Conta desativada"]
    LDAP2 -->|"ok"| NEW["Cria usuário:\nusername=informado, authSource=ad,\nemail = atributo mail do AD\nrole=assistente + unidades SEI"]
    LDAP -->|"ok, nome mudou"| UPD["Atualiza name com displayName"]
    AC -->|"ok"| JWT["sign JWT\n{ userId, email, role }\nexpira em JWT_EXPIRES_IN (24h)"]
    NEW --> JWT
    UPD --> JWT
    JWT --> OK["Resposta { token, user }\nFrontend: setToken + storeUser"]
```

Detalhes:

- **`User.username` — identificador único de login para TODOS os usuários** (sem `@`): locais e do AD. **O login é feito por ele**; o e-mail é aceito apenas como **alias de consulta** (se digitado com `@`, a conta é localizada pelo e-mail e o bind usa o `username` armazenado — resolve e-mails incompatíveis, ex.: `meduarda` com e-mail `mmduda@gmail.com` loga como `meduarda`).
- **A diferença entre as fontes é só onde a senha é validada**: `local` → `bcrypt.compare` no sistema; `ad` → `ldapBind(username)` no Active Directory.
- **Preenchimento do username**: cadastro na administração (campo **Username**, derivado do prefixo do e-mail se vazio) e 1º login AD (username digitado). Backfill: AD → sAMAccountName atual; locais → prefixo do e-mail.
- **Busca de unidades** (`buscarUnidadesDoUsuario`) usa `user.username` — no 1º login e em "sincronizar unidades" (perfil e administração).
- **E-mail no 1º login** vem do atributo `mail` do AD; fallback `username@cremepe.org.br` (com guarda de colisão de e-mail único).
- **LDAP opcional**: se `LDAP_URL`, `LDAP_BASE_DN` ou `LDAP_DOMAIN` não estiverem no `.env`, `ldapBind` retorna `null` e o login AD falha (só logins locais funcionam).
- **Primeiro login AD**: usuário é criado com `role: "assistente"` e, em seguida, suas unidades são buscadas no SEI (`buscarUnidadesDoUsuario`) — falha nessa etapa não impede o login (apenas aviso no log).
- **Caminho local**: `passwordHash` comparado com bcrypt (custo 12 no seed/admin).

### 3.3 Sessão no frontend (`App.tsx` + `api.ts`)

1. `login()` grava token e usuário; `App` renderiza `<Login>` enquanto `user === null`.
2. Qualquer `request()` que receba **401** dispara `clearSession()` + evento `cremepe-unauthorized` → `App` volta para o login (token expirado = saída automática).
3. Ao voltar a focar a aba (`visibilitychange`), `fetchMe()` (`GET /autenticacao/usuario-atual`) revalida e atualiza o usuário.
4. **Logout** = `POST /autenticacao/logout` (registra na auditoria) + `clearSession()` + `setUser(null)` — o JWT só deixa de valer ao expirar (não há blacklist).

### 3.4 Demais rotas de autenticação

| Rota                                      | Descrição                                                                                                               |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `GET /autenticacao/usuario-atual`         | Dados do usuário do token (usado no refresh)                                                                            |
| `GET /autenticacao/perfil`                | Perfil completo**+ unidades vinculadas** (`user_units`) + `unitsSyncedAt` + `username`                                  |
| `PUT /autenticacao/perfil`                | Altera `name` **ou** troca a senha (`currentPassword`/`newPassword`) — **bloqueado** para usuários AD (`authSource: ad`) |
| `POST /autenticacao/sincronizar-unidades` | Refaz as unidades do usuário:**admin → todas as unidades CREMEPE**; demais → `buscarUnidadesDoUsuario(username)`       |

---

## 4. Permissões e controle de acesso

### 4.1 Papéis

O banco usa `role` como string. Na prática, o código só trata **três papéis**:

| Papel        | Origem                                | Comportamento                                                                                                                   |
| ------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `admin`      | seed / criado pelo admin              | Acesso total (ver, sincronizar e excluir finalizados; administração)                                                            |
| `analista`   | seed / atribuído pelo admin           | **Visibilidade total igual à do admin** (lista, detalhes e processos Restritos **sem máscara**); as ações exclusivas de admin continuam negadas (exclusão, painel, sincronizar finalizado) |
| `assistente` | criado automaticamente no 1º login AD | Vê**apenas** processos de suas unidades vinculadas                                                                              |

> Os papéis efetivos são **admin, analista e assistente** — `protocolo`/`gestor` não existem (comentário do schema removido; nenhum usuário os usa). O rótulo no menu (`roleLabels`) conhece admin/assistente/analista.

### 4.2 Unidades do usuário

- Tabela `user_units` (unidade SEI: `unitId`, sigla, descrição).
- Preenchida no 1º login AD, ou por `POST /autenticacao/sincronizar-unidades` (perfil), ou por `POST /administracao/usuarios/:id/sincronizar-unidades` (admin).
- Admin recebe **todas** as unidades CREMEPE; demais recebem as unidades cuja lista de usuários do SEI contém a sigla (`listarUsuariosPorUnidade`).

### 4.3 Regras por ação (funções `verificarAcessoProcesso` / `permissaoDeAcesso`)

| Ação                                              | admin | assistente                                                                                 | analista                                                               |
| ------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Listar (`GET /processos`)                         | tudo  | intersecta com suas unidades (sem unidades → lista vazia)                                  | tudo, **sem mascaramento** (igual admin) |
| Ver detalhe, anotar, resumir, editar, sincronizar | ok    | 403 se processo fora de suas unidades                                                      | liberado em **qualquer processo** (sem restrição de unidade/nível; sincronizar finalizado → 403, só admin) |
| Cadastrar processo | ok | precisa que **alguma unidade aberta** do processo esteja entre as suas (403 caso contrário) | idem assistente |
| Sincronizar processo**finalizado**                | ok    | **403** ("Somente administradores...")                                                     | **403**                                                                |
| Excluir processo                                  | ok    | 403                                                                                        | 403                                                                    |
| Administração (`/api/administracao/*`)            | ok    | 403 (`adminOnly`)                                                                          | 403                                                                    |

- Siglas consideradas do processo = siglas de `unidades` + sigla de `unidadeAtual`.
- A comparação de unidade em filtros/listagens é feita por _contains_ no JSON (`"sigla":"X"`).

---

## 5. Cadastro e importação de processos

### 5.1 Fluxo da tela `/novo-processo` (frontend)

1. Usuário cola um texto livre; o frontend extrai números com regex `\d{2}\.\d{1,2}\.\d{9}-\d` (deduplicados).
2. Botão **Importar N Processo(s)** percorre os números **um a um (sequencial)** chamando `POST /api/processos` (`createProcess`).
3. Chips coloridos acompanham o progresso (azul = processando, verde = OK, amarelo = já cadastrado, vermelho = erro); painel lateral mostra resumo (Total / Importados / Já Cadastrados / Erros) e o motivo de cada falha.
4. Ao final: "Nova Importação" ou "Ver todos os processos" (`/processos`).

### 5.2 Backend `POST /api/processos` (etapas por número)

1. Valida `numeroSei`; `findUnique` → **409** "Processo já cadastrado".
2. `consultarProcedimento(numero)` no SEI (falha → **422**).
3. Extrai **unidades abertas** (`UnidadesProcedimentoAberto`); se não-admin e nenhuma unidade aberta for do usuário → **403**.
4. Busca **andamentos**: pelas unidades abertas; se o processo não tem unidades abertas (ex.: finalizado), usa a cascata completa (`montarUnidadesParaBusca(null, [], todas CREMEPE)`). Falha ao buscar andamentos **não impede** o cadastro.
5. Calcula conclusão (`isProcessoConcluido`) e **herança reversa** (se algum processo **já finalizado no banco** anexa este número → também finalizado).
6. `process.create` com todos os campos serializados em JSON (assuntos, interessados, unidades, andamentos, relacionados, anexados, último andamento) + `sincronizadoEm`.
7. Registra `SyncLog` (`tipo: "manual"`, mensagem de sucesso).
8. Responde `201` com o processo.

### 5.3 Importação em lote — `POST /api/processos/importar` (**removido**)

- O endpoint de importação em lote (concorrência = 5) foi **removido por não ter interface** (código morto).
- A tela `/novo-processo` continua cadastrando números sequencialmente via `POST /processos`; se precisar do lote no futuro, recuperar do histórico do git.

---

## 6. Sincronização com o SEI

### 6.1 Núcleo: `syncProcesso(id)` (`routes/processes.ts`)

```mermaid
flowchart TD
    A["process.findUnique"] --> B["consultarProcedimento\n(numero, unidadeAtualId)"]
    B --> C{"Último andamento mudou\nou lista de andamentos vazia?"}
    C -->|"sim"| D["listarUnidades (cache 5min)"]
    D --> E["montarUnidadesParaBusca\n(unidadeSincronizacao → abertas → todas)"]
    E --> F["listarAndamentos por unidade"]
    F --> G["unidadesComDados = unidades que\nretornaram andamentos"]
    C -->|"não"| H["andamentos ficam os do banco"]
    G --> I["parentStatusMap (relacionados no banco)\n+ varredura de anexados finalizados"]
    I --> J["isProcessoConcluido(...)"]
    J --> K{"Nada mudou?\n(sem andamento novo, sem pai finalizado,\nsem andamentos novos e status idêntico)"}
    K -->|"sim"| L["Atualiza só sincronizadoEm\n→ 'Sincronizado. Sem alterações.'"]
    K -->|"não"| M["process.update completo:\ntipo, especificação, nível, link, status,\nassuntos, interessados, unidadeAtual, unidades,\nandamentos, unidadeSincronizacao, relacionados,\nanexados, último andamento, sincronizadoEm"]
```

- **`statusSistema` nunca volta de `finalizado` para `em_andamento`** (a não ser que já não fosse finalizado): `finalizado` se concluído ou pai finalizado; senão `em_andamento` (ou mantém `finalizado`).
- `unidadeSincronizacao` guarda as unidades que **efetivamente retornaram andamentos** — são a primeira opção da cascata na próxima sincronização.

### 6.2 `POST /api/processos/:id/sincronizar` (individual)

1. Permissão de acesso (403 se negado).
2. Se `finalizado` e usuário não é admin → **403**.
3. Executa `syncProcesso`; registra `SyncLog` (`tipo: "manual"`, sucesso/erro).
4. Erro do SEI → **422**; sucesso → devolve o processo completo (JSON parseado) + tags.

### 6.3 `POST /api/processos/sincronizar-lote` (lote)

- Recebe `{ ids: [...] }`; **concorrência = 5**.
- Por processo: não encontrado → `error`; `finalizado` e não-admin → `skipped`; sem permissão → `skipped`; senão `syncProcesso`.
- **Não grava SyncLog** por item; responde `{ results, total }`.

### 6.4 Tela `/sincronizacao` (SyncPage)

- Filtros: busca, status (padrão **em andamento**), unidades (multi), tipo (multi), nível de acesso, período, "sem andamentos"; contadores de em-andamento/finalizados com os mesmos filtros.
- **Sincronizar todos**: pagina `GET /processos` com `limit: 500` (demais filtros aplicados) até acabar; envia os IDs em **sub-lotes de 5** (`syncBatch`), com barra de progresso (feito/total); ao final, diálogo de resultado e recarga da lista.
- **Sincronizar** (linha): `POST /processos/:id/sincronizar` individual.
- Clique no número navega para `/processo/:id`.

### 6.5 Onde mais se sincroniza

- Botão **"Sincronizar com SEI"** na tela de detalhes (`/processo/:id`).

---

## 7. Integração SEI (SOAP)

Serviço em `backend/src/services/sei.ts` — monta envelopes XML e envia `POST` para `SEI_URL` (`fetchSoap`), interpretando _SOAP faults_ (o SEI responde HTTP 500) como erro limpo.

| Serviço SEI                     | Uso                                                                                                                                                               | Observações                                                                                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `consultarProcedimento`         | Dados do processo (tipo, especificação, autuação, nível, assuntos, interessados, unidade atual, unidades abertas, relacionados, anexados, último andamento, link) | Tenta primeiro a`unidadeAtualId` salva; depois **cada unidade CREMEPE** até encontrar; se `SEI_ID_UNIDADE` estiver definido, restringe a ela |
| `listarAndamentos`              | Histórico de movimentações por unidade                                                                                                                            | Para cada unidade, envia tarefas 1..50 (cobertura de tipos de andamento)                                                                     |
| `listarUnidades`                | Unidades acessíveis ao serviço                                                                                                                                    | **Cache em memória de 5 min**; filtra siglas que começam com `CREMEPE`                                                                       |
| `listarUsuarios`                | Usuários de uma unidade                                                                                                                                           | Usado para descobrir as unidades de um usuário AD                                                                                            |

### Cascata de unidades (`montarUnidadesParaBusca`)

Prioridade (sem duplicatas):

1. **`unidadeSincronizacao`** — unidades que retornaram dados na última sincronização (salvas no banco).
2. **Unidades abertas** — `UnidadesProcedimentoAberto` do SEI.
3. **Todas CREMEPE** — fallback com `listarUnidades()`.

### Descoberta de unidades de um usuário (`buscarUnidadesDoUsuario`)

`listarUnidades()` → para cada unidade, `listarUsuariosPorUnidade()` → se a **sigla** (parte local do e-mail) constar, a unidade pertence ao usuário. Otimização de custo: admin pula e recebe todas.

---

## 8. Status, conclusão e herança

### 8.1 Valores de `statusSistema`

- `em_andamento` — padrão de processos ativos (**o banco também pode conter `em_analise`, legado**: o filtro `status=em_andamento` aceita os dois).
- `finalizado` — concluído (critérios abaixo) ou herdado de pai finalizado.
- O frontend normaliza `em_analise`/`em_andamento` → `em_andamento` (`mapStatus`). Os status _Pendente_ e _Sobrestado_ foram **removidos por completo** (tipo, mapStatus, rótulos e cores); o backend rejeita status inválidos com **400**.

### 8.2 Critérios de conclusão (`isProcessoConcluido`)

Um processo é **finalizado** quando:

1. **Herança**: tem processos pai (relacionados que **não** são seus anexados) e **todos** estão `finalizado` no banco (critério usado com `parentStatusMap`); **ou**
2. Não tem unidades abertas **e** o último andamento menciona **"conclusão do processo na unidade"**.

Ou seja: apenas "não ter unidades abertas" **não basta** — precisa do indício textual de conclusão (a não ser pela herança).

### 8.3 Herança reversa (pai finalizado → filho)

Antes de gravar (cadastro e sincronização), o sistema varre processos **já finalizados no banco** e verifica se algum deles **anexa** o número atual (`procedimentosAnexados`). Se sim, o filho também nasce/vira `finalizado`.

---

## 9. Processos parados

**`GET /api/processos/parados`** — usado pelo KPI do Dashboard e pela tela `/parados`.

1. Base: apenas `statusSistema = "em_andamento"`; assistente vê só suas unidades.
2. Carrega todos os processos e monta o conjunto de **filhos** (números que constam como anexados de outros processos) — **filhos são excluídos**, pois os andamentos costumam acontecer no pai.
3. Para cada processo: pega a **data/hora mais recente** entre seus andamentos (parse aceita `DD/MM/YYYY [HH:mm:ss]` e ISO); calcula `diasParado` em dias; **sem andamentos → excluído** (`diasParado: null`).
4. Ordena do mais parado para o menos; devolve número, especificação, unidade, tags, último andamento, `diasParado` e `ultimaAtividade`.

A tela `/parados` (StalledProcesses) usa esse endpoint com filtro de unidades (multi) e navega para o detalhe do processo.

---

## 10. Resumo com IA

### 10.1 Pipeline (tela de detalhes → `POST /api/processos/:id/resumo`)

```mermaid
flowchart LR
    UI["Tela 'Gerar Resumo com IA'\narquivos (até 20) e/ou texto manual"] --> MP["multer\nmáx. 50 MB/arquivo\nextensões permitidas"]
    MP --> EX["extrairTexto por arquivo"]
    EX --> CAT["Concatena:\n'--- Arquivo: nome ---' + texto"]
    CAT --> LIM{"Texto > 90.000 chars?"}
    LIM -->|"sim"| E413["413 Texto excessivo"]
    LIM -->|"não"| G["gerarResumo (Gemini)\nmodelos de LLM_MODEL em sequência"]
    G --> P["{ resumo } (preview — nada é salvo ainda)"]
    P --> SAVE["Usuário clica Salvar\nPOST /:id/resumo/save"]
    SAVE --> DB["process.resumoIa + resumoGeradoEm"]
    MP -.->|"finally"| DEL["Arquivos temporários\nsão apagados"]
```

- **Extração por formato** (`services/fileExtractor.ts`):
  - `.pdf` → `pdf-parse`; `.docx` → `mammoth`; `.doc` → tenta mammoth, depois `xlsx`, senão marcador "converta para .docx";
  - `.txt`/`.csv` → texto puro; `.xls`/`.xlsx` → `xlsx` (aba a aba em CSV); `.odt` → `jszip` + `content.xml`;
  - **imagens** (jpg/png/...) → marcador `[Imagem — OCR não disponível]` (**não há OCR**);
  - falha de extração de um arquivo não derruba o processo (entra um marcador de falha).
- **Prompt** (`services/gemini.ts`): resumo executivo em **um único parágrafo corrido**, sem Markdown, sem inventar informações — voltado a processos administrativos do CREMEPE.
- **Modelos**: `LLM_MODEL` é uma **lista separada por vírgula** (ex.: `gemini-3.8-flash,gemini-3.7-flash,...`) — tenta em sequência até funcionar (fallback por cota/indisponibilidade).
- **Salvamento é separado**: `POST /:id/resumo` só retorna o preview; `POST /:id/resumo/save` grava `{ resumo }` no banco. Há também `GET /:id/resumo` (retorna `resumoIa`/`resumoGeradoEm`).
- O usuário pode **editar manualmente** o resumo antes/depóis de salvar (mesmo endpoint de save).

### 10.2 Onde o resumo aparece

- Detalhe do processo (seção **Resumo**, com data/hora de geração).
- Filtro `resumo=0|1` na listagem; rota especial `/processos/sem-resumo`.
- KPIs do Dashboard (Com/Sem Resumo) e gráficos de **Cobertura do Resumo IA** nos Relatórios.

---

## 11. Anotações

Rotas sob `/api/processos/:id/anotacoes`:

| Ação                             | Regra                                                             |
| -------------------------------- | ----------------------------------------------------------------- |
| `POST`                           | Qualquer usuário com acesso ao processo; grava`userId`/`userName` |
| `GET`                            | Lista (mais recente primeiro) — exibidas no detalhe               |
| `PUT /:id/anotacoes/:anotacaoId` | **Somente o autor** pode editar                                   |
| `DELETE`                         | Autor**ou admin**                                                 |

O detalhe do processo traz limite inicial de anotações visíveis com "Mostrar todas (N)".

---

## 12. Tags (etiquetas)

- CRUD global em `/api/etiquetas` (qualquer usuário autenticado): `GET` lista; `POST` cria (409 se nome duplicado); `PUT /:id`; `DELETE /:id` (remoção em cascata dos vínculos).
- Associação a processos é feita **pelo detalhe do processo**: `PUT /api/processos/:id` com `tagIds: [...]` — o backend **substitui** todos os vínculos (`deleteMany` + `createMany`).
- Seed cria 7 tags padrão (Urgente, Análise Jurídica, Recurso, CFM, Denúncia, Ético-Disciplinar, Registro).

---

## 13. Listagem, busca e filtros de processos

**`GET /api/processos`** (`ProcessList`, `SyncPage`, `Reports`, `Dashboard`):

| Parâmetro             | Efeito                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------- |
| `page`, `limit`       | Paginação (`limit` máx. **500**)                                                            |
| `search`              | `numeroSei`, `especificacao`, `interessados`, `assuntos`, `resumoIa` (contains)             |
| `status`              | `em_andamento` (inclui legado `em_analise`) ou `finalizado`                                 |
| `unit`                | Uma sigla ou lista`SIGLA1,SIGLA2` — casa com `unidadeAtual` **ou** `unidades`               |
| `resumo`              | `1` = com resumo, `0` = sem                                                                 |
| `andamentos=0`        | Só processos sem andamentos (`andamentos = "[]"`)                                           |
| `documentos=0`        | Só processos cujos andamentos não citam "Documento"                                         |
| `tipo`, `nivelAcesso` | Igualdade exata                                                                             |
| `dateFrom`, `dateTo`  | Filtro sobre`dataAutuacao` (formato `DD/MM/AAAA` convertido para comparar com `YYYY-MM-DD`) |
| `sort`, `dir`         | `numeroSei`, `especificacao`, `dataAutuacao`, `createdAt`                                   |

Aplicação de permissão na listagem: assistente intersecta com suas unidades (sem unidades → `"__NO_ACCESS__"`); **analista e admin recebem os mesmos objetos completos** — o mascaramento (`acessoRestrito`) foi **removido do sistema**.

Rotas de listagem especiais no frontend:

- `/processos` — listagem completa com filtros + paginação + exclusão (admin).
- `/processos/sem-resumo` — mesma listagem com `resumo=0` pré-aplicado.

---

## 14. Dashboard

**Tela `/`** (`Dashboard.tsx`):

1. **Período**: `dateFrom` inicia em **`daysAgo(182)` (últimos 6 meses)**; presets (hoje, 30/90/365 dias, ano atual), datas manuais e **"Limpar"** (volta ao default de 6 meses). `dateTo` vazio = até hoje.
2. **Dados**: `fetchAll()` pagina `GET /processos` com `limit: 500` até o fim (respeitando o período) — KPIs e gráficos são calculados **no cliente**; recarrega ao voltar o foco da aba.
3. **KPIs** (com links): Total (`/processos`), Em Andamento, Finalizados, Com Resumo, Sem Resumo (`/processos/sem-resumo`), **Processos Parados** (`/parados`, contagem via `GET /processos/parados`; se falhar, exibe "—").
4. **Gráficos**:
   - **Evolução** (linha, `#29ABE2` Autuações por `dataAutuacao` × `#009C60` Finalizados por data do último andamento, quando `status = finalizado`); dias com **zero** nas duas séries são descartados; ticks **semanais**; formato `mai/26`, `jan/26`, `jun`, `15`...
   - **Últimos Processos** — tabela clicável (`/processo/:id`).
   - **Processos por Unidade** (em andamento; conta cada unidade do processo; top 10).
   - **Top Tipos** (barras horizontais; rótulos podem quebrar em 2 linhas).

---

## 15. Relatórios e exportações

**Tela `/relatorios`** (`Reports.tsx`): filtros em `draft` (rascunho) aplicados por **Gerar relatório** (`generate(filters)` → `applied`), com preset "ano atual"/períodos.

1. **Consulta**: `GET /processos` paginado com `limit: 500` (mesmos filtros da tela).
2. **Seções**:
   - **Distribuição por Status** (pizza + legenda) e **Processos por Unidade** (barras) — altura 420.
   - Linha de 4 colunas: **Cobertura do Resumo IA** (barras %), **Nível de Acesso** (barras %) e tabela **Resumo por Status**.
   - **Evolução de Autuações** (linha, por dia de autuação).
   - **Top Tipos de Processo** (barras horizontais, os 10 mais frequentes do recorte).
   - **Lista de processos** (tabela paginada com navegação ao detalhe).
3. **Filtros disponíveis**: busca, período, unidades (multi), tipos (multi), nível de acesso, status (Todos / Em Andamento / Finalizado), resumo (todos/com/sem).
4. **Exportações**:
   - **CSV da listagem** — separador `;`, BOM UTF-8, nome `relatorio-processos-AAAA-MM-DD.csv`;
   - **PDF da listagem** — jsPDF paisagem + `jspdf-autotable`, com cabeçalho/filtros/período;
   - **Resumo em PDF** — jsPDF retrato (seções com filtros aplicados);
   - **Resumo em XLSX** — ExcelJS (import dinâmico), planilha formatada com banner verde e seções.

---

## 16. Administração

**Tela `/administracao`** — item de menu visível **somente para `admin`**; backend reforça com `authMiddleware + adminOnly` em todo `/api/administracao/*`. A tela tem 5 abas e um painel de KPIs (ativos/inativos/AD/locais).

| Seção | Endpoints | Ações |
| ----- | --------- | ----- |
| **Usuários** | `GET/POST /administracao/usuarios`, `PUT/DELETE /administracao/usuarios/:id` | Busca por nome/e-mail e filtros por perfil/status; criar (local: senha obrigatória **mín. 8 caracteres**, hash bcrypt 12; AD: sem senha), editar papel/ativo/senha, excluir (remove `user_units` em cascata). **Proteções de auto-bloqueio** (front + back): o admin não pode desativar/excluir a si mesmo nem remover o próprio papel `admin` (403). Nome/e-mail de usuários **AD são bloqueados** e a **senha de usuários AD não pode ser criada nem alterada** (403 — é controlada pelo Active Directory). O cadastro/edição (todos os perfis) inclui o campo **"Username"** (sem `@`; identificador de login; derivado do e-mail se vazio; único no banco). Coluna **Unidades (n)** abre o `MultiSelectDialog` para atribuição manual |
| Unidades de um usuário | `POST /administracao/usuarios/:id/sincronizar-unidades`, `POST /administracao/usuarios/:id/unidades` | Sincronizar via SEI (admin → todas; demais → busca por sigla) **ou** atribuir manualmente (substitui o conjunto atual; catálogo de `GET /sei/unidades`) |
| **Configurações SEI** | `GET/PUT /administracao/configuracoes`, `POST /administracao/testar-conexao` | Carrega os valores salvos; **banco sobrescreve o `.env` quando não vazio** (`seiConfig` em memória, sem reiniciar); chave de acesso **mascarada** no GET (`********`) e nunca regravada; **"Testar Conexão" é real** — chama o SEI (`listarUnidades`) com os valores do formulário, mesmo ainda não salvos |
| **Logs de Sincronização** | `GET /administracao/registros` | Filtros (tipo, status, busca por nº/mensagem, período), paginação, **export CSV**, detalhe em diálogo, coluna **Usuário responsável** (`SyncLog.userId`) e link para o processo |
| **Auditoria** | `GET /administracao/auditoria` | **Todas as ações do sistema exceto as sincronizações de processo** (essas ficam nos logs), gravadas em `audit_logs`: **login** (sucesso/falha, local/AD, primeiro acesso) e **logout**, cadastro/importação/atualização/**exclusão de processos**, **geração/salvamento de resumos**, **anotações** (criar/editar/excluir), **exportações/downloads** (PDF panorama e relatórios CSV/PDF/XLSX), gestão de usuários e unidades, salvar configurações — com usuário, ação, alvo, detalhe; busca + paginação |
| **Sistema** | `GET /administracao/sistema` (+ teste de conexão) | Saúde da API, versão do Node, tamanho do SQLite, contagens (usuários/processos/logs/auditoria) e **configuração SEI efetiva** (URL, sigla, unidade, chave definida e sua origem `.env`/configurações) |

---

## 17. Perfil e unidades do usuário

**Tela `/perfil`** (`Profile.tsx`) — mesmo padrão da Administração: **KPIs no topo + barra de abas** (Dados Pessoais | Unidades SEI | Atividades | Preferências), largura total.

1. **Aba Dados Pessoais** — grid de 2 colunas: card **Perfil** (avatar, nome, e-mail, perfil, autenticação + **"Editar nome"** via `PUT /autenticacao/perfil`, somente locais; AD exibe "controlado pelo AD" + **expiração da sessão** decodificando o `exp` do JWT no cliente) **ao lado** do card **"O que eu posso acessar"** (descrição do que o papel atual pode fazer). Abaixo, card **Segurança** com botão **"Alterar senha"**.
2. **Troca de senha em dialog** — o botão abre um **modal** (senha atual/nova/confirmação) que chama `PUT /autenticacao/perfil` com `currentPassword`/`newPassword`: valida a **senha atual** (bcrypt), **mínimo de 8 caracteres** e a confirmação; grava **"alterar senha"** na auditoria (sem valores). **AD**: botão oculto na UI e **403** no backend.
3. **KPIs** — `GET /autenticacao/estatisticas`:
   - **Processos que tenho acesso** — os que o usuário consegue **visualizar** (admin/analista: todos, **inclusive os restritos**; assistente: somente os das suas unidades — mesma regra da listagem);
   - **Processos das minhas unidades** — todos os processos **disponíveis para as unidades do usuário** (`unidades`/`unidadeAtual` intersectando suas siglas), qualquer papel;
   - **Minhas anotações**.
4. **Aba Unidades SEI** — contador + **"sincronizadas em …"** (`User.unitsSyncedAt`, preenchido em qualquer sincronização/atribuição de unidades), **busca por sigla/descrição**, grade responsiva (1/2/3 colunas) com scroll e botão **Sincronizar** (`POST /autenticacao/sincronizar-unidades`, admin → todas CREMEPE; demais → busca por sigla no SEI).
5. **Aba Atividades** — `GET /autenticacao/atividades` → **as mesmas entradas da auditoria** (`audit_logs`) filtradas pelo usuário logado (últimas 20: ação, alvo, detalhe, data/hora).
6. **Aba Preferências** — **Tema do Sistema** (Claro/Escuro) salvo em `localStorage` (`cremepe_tema`, via `utils/preferences.ts`). O **tema escuro ainda não foi implementado**: a UI avisa que a preferência fica salva e será aplicada quando o modo escuro estiver disponível.

---

## 18. Segurança, erros e limites

- **JWT** (segredo `JWT_EXPIRES_IN`, default 24h) verificado em `authMiddleware`; rotas de admin com `adminOnly` adicional.
- **Senhas**: bcrypt custo 12; usuários AD guardam `passwordHash: ""` (autenticação só no LDAP). Política: **mínimo de 8 caracteres** na criação/redefinição pela administração **e na troca pelo próprio usuário** (perfil), validado no front e no back.
- **401 global**: dispara a saída automática da sessão no frontend; **403** devolve `{ error }` com a mensagem de acesso.
- **CORS**: apenas `localhost/127.0.0.1` nas portas `5173` e `8443` (com credenciais).
- **Uploads**: `multer` em `backend/uploads/`, máx. 50 MB/arquivo, 20 arquivos, lista branca de extensões; arquivos apagados após a geração (`finally`).
- **Limites de resumo**: texto agregado ≤ 90.000 caracteres (413).
- **Concorrência**: sincronização em lote = 5 simultâneos (protege o SEI e a API).
- **Caches**: unidades CREMEPE (5 min) e unidades por usuário consultadas sob demanda.

---

## 19. Mapa de rotas do frontend

Rotas do _browser_ (React Router, `App.tsx`) — todas em português; URL desconhecida redireciona para `/`:

| Rota                    | Tela                       | Menu                         |
| ----------------------- | -------------------------- | ---------------------------- |
| `/`                     | Dashboard                  | Dashboard                    |
| `/processos`            | Lista de processos         | Processos                    |
| `/processos/sem-resumo` | Lista só sem resumo        | Sem Resumo                   |
| `/processo/:id`         | Detalhes do processo       | (clicando num processo)      |
| `/novo-processo`        | Cadastrar/importar números | Cadastrar Processo           |
| `/etiquetas`            | Gerenciar tags             | Tags                         |
| `/relatorios`           | Relatórios e exports       | Relatórios                   |
| `/sincronizacao`        | Sincronização em lote      | Sincronização                |
| `/parados`              | Processos parados          | Processos Parados            |
| `/administracao`        | Administração (admin)      | Administração                |
| `/perfil`               | Meu perfil                 | clicando no usuário (rodapé) |

Validação extra: regex `/^\/processo\/[a-f0-9-]+$/` é aceita como detalhe; demais URLs caem no `*` → `/`.

---

## 20. Tabela completa de endpoints

### `/api/autenticacao`

| Método | Rota                    | Descrição                 |
| ------ | ----------------------- | ------------------------- |
| POST   | `/login`                | Login (local ou AD) → JWT |
| POST   | `/logout`               | Registra o encerramento da sessão (auditoria; o JWT segue válido até expirar) |
| GET    | `/usuario-atual`        | Usuário do token          |
| GET    | `/perfil`               | Perfil + unidades + `unitsSyncedAt` |
| PUT    | `/perfil`               | Atualiza nome **ou** troca senha (`currentPassword`/`newPassword`, mín. 8, locais; AD → 403) |
| GET    | `/estatisticas`         | Estatísticas pessoais (processos que tenho acesso, das minhas unidades, minhas anotações) |
| GET    | `/atividades`           | Últimas 20 ações do usuário na auditoria (mesmo conteúdo do log) |
| POST   | `/sincronizar-unidades` | Refaz minhas unidades (grava `unitsSyncedAt`) |

### `/api/processos`

| Método     | Rota                         | Descrição                                                |
| ---------- | ---------------------------- | -------------------------------------------------------- |
| GET        | `/`                          | Lista paginada com filtros                               |
| GET        | `/parados`                   | Processos parados                                        |
| POST       | `/`                          | Cadastra processo (consulta SEI)                         |
| POST       | `/sincronizar-lote`          | Sincronização em lote (conc. 5)                          |
| GET        | `/:id`                       | Detalhes                                                 |
| PUT        | `/:id`                       | Atualiza status e/ou`tagIds`                             |
| DELETE     | `/:id`                       | Exclui (admin)                                           |
| POST       | `/:id/sincronizar`           | Sincroniza com SEI                                       |
| GET        | `/:id/andamentos`            | Andamentos**ao vivo** do SEI                             |
| GET        | `/:id/pais`                  | Processos que anexam este (busca reversa)                |
| POST       | `/:id/resumo`                | Gera resumo (multipart:`files`, `textoManual`) — preview |
| POST       | `/:id/resumo/save`           | Salva`{ resumo }`                                        |
| GET        | `/:id/resumo`                | Resumo salvo                                             |
| GET/POST   | `/:id/anotacoes`             | Lista / cria anotação                                    |
| PUT/DELETE | `/:id/anotacoes/:anotacaoId` | Editar (autor) / excluir (autor ou admin)                |
| POST       | `/exportacoes`               | Registra download/exportação na auditoria (panorama ou relatório) |

### `/api/etiquetas`

| Método     | Rota   | Descrição             |
| ---------- | ------ | --------------------- |
| GET/POST   | `/`    | Lista / cria tag      |
| PUT/DELETE | `/:id` | Atualiza / exclui tag |

### `/api/administracao` (somente admin)

| Método     | Rota                                 | Descrição                                      |
| ---------- | ------------------------------------ | ---------------------------------------------- |
| GET/POST   | `/usuarios`                          | Lista (com unidades vinculadas) / cria usuário |
| PUT/DELETE | `/usuarios/:id`                      | Atualiza / exclui (com guards de auto-bloqueio) |
| POST       | `/usuarios/:id/sincronizar-unidades` | Refaz unidades de um usuário via SEI           |
| POST       | `/usuarios/:id/unidades`             | Atribui unidades manualmente                   |
| GET        | `/registros`                         | Logs de sincronização (filtros + paginação + responsável) |
| GET        | `/auditoria`                         | Ações de administração                         |
| GET/PUT    | `/configuracoes`                     | Configurações SEI (chave mascarada)            |
| POST       | `/testar-conexao`                    | Teste real no SEI (aceita overrides do formulário) |
| GET        | `/sistema`                           | Visão operacional (saúde, contagens, config efetiva) |

### `/api/sei` e utilitários

| Método | Rota            | Descrição                      |
| ------ | --------------- | ------------------------------ |
| GET    | `/sei/unidades` | Unidades CREMEPE (cache 5 min) |
| GET    | `/saude`        | Health check                   |

---

## 21. Pontos de atenção e dívidas técnicas

Itens conhecidos do estado atual (úteis para manutenção):

1. **`POST /processos/importar` removido** — o endpoint de importação em lote não tinha interface (código morto) e foi eliminado; a tela `/novo-processo` continua cadastrando sequencialmente via `POST /processos`. Recuperar do histórico do git se necessário.
2. **`generateSummaryFromDocs` removido** — era código morto (chamava `/processos/:id/resumo-documentos`, rota inexistente no backend); a função foi eliminada junto com `batchImport`, `getSummary` e `listAndamentos` (exports sem uso no `api.ts`).
3. **Configurações SEI (regra de sobreposição)** — agora funcionais: a UI lê/salva via `GET/PUT /configuracoes`, o serviço SEI usa a configuração **efetiva** (`seiConfig` = `.env` sobrescrito pelo banco quando o valor não é vazio, recarregada no startup e ao salvar) e o teste de conexão é real. **Valores vazios no banco mantêm os do `.env`** (para "limpar" uma chave, apague a linha); a chave de acesso só é **troca** (nunca sai em claro nem volta mascarada para o banco). Salvar tem efeito imediato, sem reiniciar o servidor.
4. **Papéis `protocolo`/`gestor` removidos** — só existiam no comentário do schema (removido); nenhum usuário os utiliza.
5. **Sem sincronização automática** — não há job cron; tudo é sob demanda (página de sincronização, botões individuais).
6. **Sem OCR** — imagens entram no resumo como marcador textual.
7. **Filtro por unidade** usa _contains_ em JSON (`"sigla":"X"`), sensível a grafias exatas.
8. **Documentos do SEI — funções removidas** — `consultarDocumento`, `obterLinkDocumento` e `extrairDocumentos` eram código morto (sem endpoint/UI); foram eliminadas do `sei.ts`. Reintroduzir apenas com caso de uso real.
9. **`docs` desatualizados removidos** — `fluxo-importacao-sincronizacao.md` (substituído por este arquivo) e `frontend/src/imports/ESPECIFICACAO.md` (especificação de planejamento antiga, que contradizia a implementação) foram **removidos**; histórico preservado no git.
10. **Tema escuro pendente** — a preferência já é coletada e salva no Perfil (`localStorage` `cremepe_tema`), mas a aplicação do modo escuro **ainda não foi implementada** (próxima etapa).
12. **Depreciação `package.json#prisma`** — a config de seed no `package.json` (usada por `pnpm prisma db seed`) será removida no Prisma 7; migrar para `prisma.config.ts` quando atualizar a versão.
11. **`username` legado (backfill)** — na migration `user_username`, contas AD receberam `username` = sAMAccountName (campo anterior) e locais receberam o **prefixo do e-mail**; se algum não seguir a convenção, corrija no modal de usuários da administração (campo "Username") — ele também é usado na busca de unidades no SEI.

> Mantenha este documento sincronizado ao alterar rotas, permissões ou fluxos principais.
