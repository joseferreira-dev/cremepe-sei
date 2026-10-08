# ENCAMINHAMENTO.md — Sugestão de unidade de encaminhamento

> Documentação técnica da funcionalidade **"Sugestão de Encaminhamento"** (nova demanda → unidade destino) e do **dicionário de trâmites** (`dicionario-tramites.xlsx`). Para o restante do sistema, ver [`DOCS.md`](./DOCS.md).

## Sumário

1. [Visão geral](#1-visão-geral)
2. [Endpoint](#2-endpoint)
3. [Base histórica e cache](#3-base-histórica-e-cache)
4. [Rótulo de treino: unidade de maior permanência](#4-rótulo-de-treino-unidade-de-maior-permanência)
5. [Similaridade: TF-IDF + k-NN](#5-similaridade-tf-idf--k-nn)
6. [Fallback por tipo](#6-fallback-por-tipo)
7. [Regra de domínio: devolução/reembolso → SECON](#7-regra-de-domínio-devoluçãoreembolso--secon)
8. [Regra de domínio por conteúdo (cabeçalho)](#8-regra-de-domínio-por-conteúdo-cabeçalho)
9. [Dicionário de trâmites (`npm run gerar:dicionario`)](#9-dicionário-de-trâmites-npm-run-gerardicionario)
10. [Avaliação (resultados observados)](#10-avaliação-resultados-observados)
11. [Como ajustar (constantes e vocabulário)](#11-como-ajustar-constantes-e-vocabulário)
12. [Limitações e casos em aberto](#12-limitações-e-casos-em-aberto)
13. [Como testar](#13-como-testar)

---

## 1. Visão geral

Um operador descreve uma nova demanda (texto livre e/ou arquivos: PDF, DOCX, ODT, planilhas, texto). O sistema devolve **até 6 unidades candidatas** com peso percentual, nº de casos da base e até 3 exemplos de processos semelhantes com seus trâmites.

Pipeline (`backend/src/services/encaminhamento.ts`):

```
texto + arquivos ──► extrairTexto ──► textoCompleto
                                          │
        ┌─────────────────────────────────┤
        ▼                                 ▼
  1. k-NN (TF-IDF, top-10 vizinhos)   2. fallback por `tipo` exato
        │                                 (só se k-NN → "nenhuma")
        └────────────────┬────────────────┘
                         ▼
        3. regra de conteúdo do CABEÇALHO (se texto estruturado: e-mail/documento)
           eleva o destino indicado ao topo e mantém o k-NN como alternativa
                         ▼
        4. regra de domínio reembolso → SECON (sempre aplicada, por último, na rota)
                         ▼
                   resultado (estrategia: "vizinhos" | "tipo" | "regra" | "nenhuma"
                              motivoRegra?: "conteudo" | "reembolso")
```

> Quando o k-NN **já** elegeu o destino da regra, o resultado é devolvido intacto
> (`estrategia` segue `"vizinhos"`): a regra só muda a ordem quando precisa.

Fontes de código:

| Arquivo | Papel |
| --- | --- |
| `backend/src/services/encaminhamento.ts` | algoritmo completo (rótulo, TF-IDF, cache, fallback, regras) |
| `backend/src/routes/processes.ts:39` | rota `POST /sugestao-encaminhamento` |
| `backend/scripts/avaliar-encaminhamento.ts` | avaliação sobre `PROCESSOS/` (`npm run avaliar:encaminhamento`) |
| `backend/scripts/gerar-dicionario-tramites.ts` | gerador do dicionário Excel |
| `frontend/src/components/RoutingSuggestion.tsx` | UI da sugestão (branch `metaTexto` para `regra`) |
| `frontend/src/api.ts` | tipos (`estrategia` inclui `"regra"`, `motivoRegra`) |

## 2. Endpoint

`POST /api/processos/sugestao-encaminhamento` (JWT obrigatório, via `authMiddleware`).

**Entrada** — `multipart/form-data`:

| Campo | Tipo | Obrigatório | Observação |
| --- | --- | --- | --- |
| `descricao` | texto | um dos dois | descrição livre da demanda |
| `tipo` | texto | um dos dois | tipo do SEI (usado no fallback e enriquece a consulta) |
| `files` | arquivo(s) | — | até 20 arquivos, 50 MB cada, texto extraído e concatenado |

O texto final é `tipo + descricao + textos dos arquivos` concatenados com `\n\n` (sem rótulos tipo "Descrição:", para não poluir a consulta).

**Erros**:

| Código | Quando |
| --- | --- |
| `400` | sem `descricao` e sem `files` |
| `413` | texto consolidado > 90.000 caracteres |
| `422` | nenhum texto extraível (ex.: só imagens sem OCR) |
| `401` | sem JWT |
| `500` | erro inesperado (mensagem limpa) |

Arquivos temporários são sempre apagados (`finally`). Cada chamada gera auditoria `sugerir encaminhamento` com o topo da sugestão.

**Resposta** (`ResultadoSugestao`):

```jsonc
{
  "estrategia": "vizinhos",   // "vizinhos" | "tipo" | "regra" | "nenhuma"
  "motivoRegra": "conteudo",  // só quando estrategia = "regra": "conteudo" | "reembolso"
  "totalBase": 3020,          // processos rotulados na base
  "vizinhos": 10,             // nº de vizinhos (ou nº de docs do tipo/fallback)
  "caracteres": 842,          // tamanho do texto consolidado
  "sugestoes": [
    {
      "sigla": "CREMEPE/TESOURARIA/SECON",
      "descricao": "SETOR DE CONTABILIDADE DO CREMEPE",
      "peso": 0.41,
      "casos": 7,
      "exemplos": [
        { "id": "...", "numeroSei": "...", "tipo": "...", "dataAutuacao": "...",
          "trilha": ["PROTOCOLO", "SECON", "SECOP"] }  // prefixo CREMEPE/ removido
      ]
    }
  ]
}
```

`estrategia: "nenhuma"` → `sugestoes: []` (interface exibe "sem sugestão").

## 3. Base histórica e cache

- **Base**: todos os processos do banco SQLite (hoje ~3.020) com `andamentos`, `tipo`, `especificacao`, `assuntos`, `interessados` e `resumoIa`.
- **Cache em memória** (`TTL_MS` = 10 min): reconstruído quando o `process.count()` muda ou o TTL expira. Reconstrução = 1 consulta + vetorização em memória.
- **Datas**: andamentos do SEI vêm **desordenados** (`dd/MM/yyyy HH:mm:ss`) — sempre ordenar (`parseDataHora`) antes de derivar qualquer coisa.
- **Tokenização**: minúsculas → remove acentos → split não-alfanumérico → descarta tokens < 3 chars, stopwords (`STOPWORDS`) e números puros.
- **Resumo IA** truncado a 1.500 chars por processo (`MAX_RESUMO_CHARS`).

## 4. Rótulo de treino: unidade de maior permanência

A base não tem rótulo "destino correto"; ele é derivado do comportamento histórico:

1. `trilhaDeAndamentos` ordena os andamentos por data e monta a trilha de unidades: guarda a **primeira passagem** de cada unidade (idempotente a idas e vindas) e, para cada uma, marca a chegada da próxima unidade da trilha bruta (`fim`) — a última usa o horário do **último andamento** (permanência atual).
2. **`destinoPorPermanencia`**: calcula a permanência em dias de cada unidade (da primeira entrada até a chegada da seguinte, ou até o fim para a última) e devolve a de **maior permanência**.
3. **Exclusões** (`UNIDADES_EXCLUIDAS`): `PROTOCOLO` (entrada oficial) e `ARQUIVO` (arquivo final) nunca podem ser rótulo — nenhuma das duas "resolve" a demanda.
4. **Cadeiras de autoridade → porta de entrada** (`ENTRADA_AUTORIDADE`): se o vencedor é uma autoridade (sigla `CREMEPE/<pessoa>`, sem setor subordinado), o rótulo vira a unidade de entrada da estrutura dela. A autoridade só **assina/decide** no fim e a permanência longa a faria vencer o rótulo — mas ninguém encaminha um processo "para" uma pessoa; encaminha-se para o gabinete/setor que recebe e conduz:

   | Autoridade (rótulos) | Porta de entrada | Evidência na base |
   | --- | --- | --- |
   | PRESIDENTE (134) | PRESI/GABIN | GABIN antes em **124/134 (93%)** |
   | VICE-CORREGEDOR (96) | COR/DEPRO | DEPRO antes em **95/96 (99%)** |
   | 3º VICE-PRESIDENTE (20) | 3º VIP./DEFIS | DEFIS antes em **20/20 (100%)** |
   | SECRETÁRIO GERAL (116) | SECRET. G./SEATE | alimentador imediato 71% |
   | 1º TESOUREIRO (45) | TESOURARIA/SECOP | alimentador imediato 71% (rótulo alternativo 80%) |
   | CORREGEDOR (0) | COR/DEPRO | mesma estrutura da corregedoria |

   Sem entrada clara (mantidos como rótulo): **1º/2º VICE-PRESIDENTE** (alimentadores mistos: SEBIB 48%, CEM 26%, GABIN 12%) e cadeiras com n≈0 (1º SECRETÁRIO, 2º TESOUREIRO).

   Efeito após o remapeamento: `PRESI/GABIN` 174→308, `COR/DEPRO` 59→155, `SEATE` 1391→1507, `SECOP` 151→196, `DEFIS` 275→295; nenhuma autoridade sobra como rótulo.

5. **Setores com entrada única → nunca rótulo** (`ENTRADA_SETOR`): **todo processo antes de ir pro `COR/SESIND` passa pelo `COR/DEPRO`**, então o encaminhamento inicial (rótulo) é o DEPRO e `SESIND` some das sugestões. Confirmado na base: dos **243** processos com SESIND na trilha, **236** passam pelo DEPRO antes; nos 7 restantes SESIND vem precedida de CORREGEDOR/VICE-CORREGEDOR (que já mapeiam para DEPRO) ou chega por caminho externo, e **SESIND nunca é a 1ª unidade após o PROTOCOLO** (0 casos). Efeito: os **141** processos com rótulo SESIND passam a rotular `COR/DEPRO`; no conjunto de avaliação o caso `26.17.000005836-9` deixou de sugerir `COR/SESIND` e passou a `COR/DEPRO` (top-1 29→31/40, MRR 0,815→0,860, sem regressões).

Por que permanência e não "primeira unidade" nem "última unidade":

- **Erros de encaminhamento se corrigem sozinhos**: um salto errado é curto e nunca vence a unidade onde o processo de fato ficou. A regra de domínio `DIAS_CORRECAO`/`UNIDADES_ATENDIMENTO` (anti-erro) foi **abandonada** — causava mais danos do que corrigia.
- **Setores de atendimento (GABIN/SEATE) continuam elegíveis**: quando retêm o processo de verdade, a permanência os elege naturalmente; quando são só passagem (ex.: denúncia → GABIN → DEPRO → corregedoria), ficam com pouco tempo e perdem.
- **SECON tem permanência ~0,1 dia** (apenas verifica e autoriza) — por isso o destino de reembolso é garantido pela **regra de domínio** (seção 7), não pelo aprendizado.
- **Autoridades (PRESIDENTE, VICES, CORREGEDOR…) nunca resolvem sozinhas** — o processo chega pelo setor da estrutura (etapa 4 acima); sem o remapeamento, a assinatura final fazia a sugestão apontar a cadeira errada (casos `26.17.000005863-6`, `26.17.000005791-5` e `26.17.000005868-7` sugeriam PRESIDENTE; agora → `PRESI/GABIN`).

Processos sem rótulo possível (só PROTOCOLO/ARQUIVO, ou sem andamentos) são descartados da base.

## 5. Similaridade: TF-IDF + k-NN

**Vetorização** (por processo da base):

- Contexto = `tipo` (com peso dobrado — campo mais informativo do SEI) + `tipo` + `especificacao` + `assuntos` + `interessados` + `resumoIa` (≤ 1.500 chars).
- TF-IDF: peso = `(1 + log(tf)) * idf`, com `idf = log(1 + N/df)`; vetores normalizados por L2.
- Índice invertido `termo → [(doc, peso normalizado)]` montado na carga do cache.

**Consulta**:

1. Tokeniza a nova demanda; termos **inéditos** na base não contribuem (sem idf).
2. Similaridade por cosseno via índice invertido; descarta `sim ≤ 0,01`.
3. **Top-`TOP_K` = 10** vizinhos votam nos destinos deles (`destinoPorPermanencia`), com peso = similaridade.
4. Agregação: soma de pesos por destino → `peso` percentual; ordena por peso e traz **top 6**, com até **3 exemplos** (vizinhos mais similares de cada destino).

## 6. Fallback por tipo

Se o k-NN retornar `nenhuma` **e** houver `tipo`, agrupa por `tipo` exato do SEI (todos os processos com aquele tipo; pesos uniformes `1/n`). Se ainda assim não houver correspondência → `nenhuma`.

Ordem na rota (`processes.ts`): k-NN → (fallback por tipo, se preciso) → **regra de conteúdo do cabeçalho** (dentro de `sugerirEncaminhamento`) → **regra de reembolso (sempre por último)**.

## 7. Regra de domínio: devolução/reembolso → SECON

**Fluxo oficial confirmado pelo CREMEPE** para devolução/reembolso de valores:

```
SEATE (trâmites com o cidadão) → SECON (recebe, verifica as contas, AUTORIZA o pagamento)
                                              → SECOP (APENAS EXECUTA o pagamento)
```

A base mostra justamente isso: processos de reembolso têm maior permanência no **SECOP** (ele segura até pagar) e quase nenhum no **SECON** (~0,1d) — mas quem *resolve* o processo é o SECON. Como nenhum critério temporal elege o SECON, o destino é garantido por **conteúdo do texto**.

**Detecção** (`eReembolso`, tokens acento-insensíveis):

- prefixos inequívocos: `reembol`, `restitu`, `estorn`, `ressarc` — **ou**
- um token iniciando em `devol` que **não** seja devolução de documento **e** tenha um termo de dinheiro (`TERMOS_VALOR`: valor, pago, paguei, pagamento, pix, taxa, anuidade, tarifa, emolumento, custo, preço…) **na mesma janela de contexto (±6 tokens)**.

Duas proteções contra falso positivo (boilerplate de formulário/certidão):

1. **Exclusão de documento**: se nos 3 tokens seguintes ao `devol` aparecer um substantivo de documento (`certificado`, `certidão`, `documento`, `papel`, `arquivo`, `processo`…), a ocorrência é ignorada — "pena de **devolução do Certificado** de Regularidade" é texto de instrução, não pedido de dinheiro.
2. **Proximidade**: o termo de dinheiro precisa estar perto do `devol` (±6 tokens), não em qualquer ponto do texto consolidado — evita coocorrência fortuita entre "devolução do certificado" (formulário) e "**anuidade** em aberto"/"quite com a **anuidade**" (certidão), que antes disparava a regra em praticamente todo processo com certidão anexada (falsos positivos confirmados: `26.17.000005886-5` e `26.17.000005890-3`, ambos com k-NN corretamente em SEATE 100%).

> `devol` (e não `devolv`) casa "devolu**cão**"; "devo**lv**er documentos" cai na exclusão de documento.

**Aplicação** (`aplicarRegraReembolso`), sobre o resultado já computado, se `eReembolso(texto)`:

- garante `CREMEPE/TESOURARIA/SECON` no topo, com `estrategia: "regra"`:
  - sem sugestões → injeta SECON como única sugestão (peso 1);
  - SECON já no topo → devolve o resultado aprendido (sem "regra");
  - SECON presente mas atrás → repondera: SECON = `max(outros) + 0,02` (teto 0,95), resto renormalizado;
  - SECON ausente → injeta no topo (acima do máximo, teto 0,95) e renormaliza os demais.
- **Exemplos**: processos da base com destino SECON que também batem os prefixos (`preferidos`), senão qualquer processo de destino SECON.

## 8. Regra de domínio por conteúdo (cabeçalho)

O k-NN compara o **texto bruto** do e-mail/documento com o **contexto estruturado** da base
(tipo, assuntos, resumo IA) — quando o vocabulário não bate, ele erra. A pergunta humana
"para onde isto vai?" costuma estar no **assunto/cabeçalho**, então um punhado de padrões
de destino é checado **antes** de confiar só na similaridade.

**Porta de entrada — `ehDocumentoEstruturado(texto)`** (as regras só valem aqui):

- ≥ 4 linhas **e** um sinal de estrutura: linha `protocolo...@` em qualquer lugar,
  prefixo `de:/date:/subject:/assunto:/from:/to:/para/enviado:` nas 8 primeiras linhas,
  `forwarded message`, ou letterhead (`ofício|tribunal|ministério público|poder judiciário|pje|
  procuradoria|comarca|vara cível|prefeitura|conselho federal|carta testemunhal`) nas 8 primeiras.

Sem o gate, descrições curtas/metadados disparam regras em qualquer texto: na avaliação
LOO (400 processos, consulta = o próprio contexto) as regras disparariam 135× com
**19% de precisão** e derrubariam o top-1 de 79,5% para 61%. Com o gate, **nenhuma**
regra dispara no LOO e o 79,5% fica intacto.

**Cabeçalho — `cabecalhoDoTexto(texto)`**: 5 linhas após a linha de protocolo (ou as
5 primeiras de um documento sem cabeçalho de e-mail), normalizadas (`semAcento`:
minúsculas → NFD → sem acentos → espaços colapsados).

**Regras** (`REGRAS_CONTEUDO`, checadas em ordem; `h` = cabeçalho, `b` = texto inteiro):

| # | Destino | Padrão | Evidência (47 casos) |
| --- | --- | --- | --- |
| 1 | `PRESI/GABIN` | `h`: mandado de segurança, `pje.cloud`, processo judicial eletrônico, inquérito civil, polícia federal, `ofício n`, `pr-pe-\d`, convite, "encaminha expediente", estelionato, falsidade ideológica | — |
| 2 | `PRESI/GABIN` **+ 2ª `COR/DEPRO`** | `h`: `denuncia`, notícia de fato, averiguação, sindicância, verificação cadastral, procedimento preparatório — **todo trâmite desses casos começa pelo gabinete** (ciência da diretoria/presidência) e só depois segue ao setor de processos | pendente (§10) |
| 3 | `PRESI/GABIN` **+ 2ª `COR/DEPRO`** | `h`: `ministerio publico` (notificação/procedimento do MPE) | pendente (§10) |
| 4 | `PRESI/GABIN` **+ 2ª `COR/DEPRO`** | `b`: "denuncia encaminhada pelo portal do cremepe" (fallback — o cabeçalho costuma já casar na regra 2) | pendente (§10) |
| 5 | `SECRET. G./SEBIB` | `h`: `parecer`, `consulta` | 6/6 |
| 6 | `SECRET. G./SEATE` | `h`: carteira CIM, carteira do médico | 1/1 |
| 7 | `TESOURARIA/SERECRED` | `h`: pagamento duplicado, gravidade de anuidade | 1/1 |
| 8 | `TESOURARIA/SECON` | `h`: retirada de débito, 2ª via / segunda via | 1/1 |

**Aplicação** (`aplicarRegraDominio` → `elevarParaTopo`, o mesmo helper da regra 7):
a sugestão da regra vai para o topo (`max(outros) + 0,02`, teto 0,95) e o resto é
renormalizado — o k-NN continua visível como 2ª..6ª opção com `estrategia: "regra"` e
`motivoRegra: "conteudo"`. Se o k-NN **já** tinha esse destino no topo, o resultado volta
intacto (`estrategia: "vizinhos"`). Funciona mesmo sem vizinhos (base vazia ou consulta
fora do vocabulário).

Regras com **2ª garantida** (campo `segunda`, regras 2–4): `COR/DEPRO` é injetado logo
abaixo do topo mesmo sem voto do k-NN (peso mantido entre o 1º e o 3º) — reflete o trâmite
real `GABIN → DEPRO`. As percentagens individuais podem somar ligeiramente mais que 100%
nesse caminho (as barras da UI são por sugestão).

**Precedência**: a rota aplica a regra de conteúdo **depois** do k-NN/tipo e a **regra de
reembolso (seção 7) por último** — se os dois dispararem no mesmo texto, o SECON vence.

**Erros conhecidos / fora de escopo**:

- `26.17.000005681-1` — assédio com boletim de ocorrência: com a regra antiga a
  divergência era GABIN × DEPRO (único erro das 34 disparos: 97%); desde 07/10 **toda**
  denúncia manda `PRESI/GABIN` com `COR/DEPRO` em 2º e o caso passa a ser esperado como
  GABIN (atualizar o rótulo na planilha — ver §10).
- Regras de **1 caso** foram deliberadamente **não incluídas** (overfitting): "análise
  ética → SEATE", "falecimento → 3 destinos". Anotadas como pendência na seção 12.

## 9. Dicionário de trâmites (`npm run gerar:dicionario`)

```bash
cd backend
npm run gerar:dicionario
```

Gera **`dicionario-tramites.xlsx`** na **raiz** do repositório. Objetivo: **conferência com os setores** sobre **para onde encaminhar nos primeiros andamentos** (a base só tem valor prática no início do trâmite).

Definições:

- **UNIDADE INICIAL** = 1ª unidade que não é PROTOCOLO.
- **TRÂMITE INICIAL** = trâmite de até **3 unidades** (com PROTOCOLO visível na contagem), para capturar "protocolo → unidade → próxima".
- Datas ordenadas cronologicamente (mesmo cuidado da seção 3).

| Aba | Conteúdo |
| --- | --- |
| `Leia-me` | definições e modo de uso |
| `1. Por situacao` | por **tipo** do SEI: unidade inicial (1º destino) + %, outras opções, trâmite inicial (até 3 un.), exemplo + resumo (~99 linhas) |
| `2. Por setor` | por setor: % dos tipos que chegam como 1º destino e o **próximo passo** usual (~177 linhas) |
| `3. Trâmites iniciais` | todos os trâmites iniciais observados, com ocorrências e tipos associados (~184 distintos) |

Números da base atual: 31 unidades iniciais; ~93% dos processos com descrição (vazias = setores externos CFM/CREMEC/CREMEGO).

> **Leitura**: o dicionário e a sugestão respondem perguntas diferentes — o dicionário diz *o que os setores costumam fazer no início*; a sugestão diz *para onde processos parecidos com ESTA demanda foram parar*. Conferir divergências com os setores (ex.: "Reembolso" inicial aparece como SERECRED 75%, enquanto a regra 7 manda para SECON — ver §12).

## 10. Avaliação (resultados observados)

**Conjunto rotulado** — `PROCESSOS/`: casos `.txt` + `ENCAMINHAMENTOS.xlsx` (aba `Planilha2`,
colunas nº / Sugestão / **Correto**). Rode `npm run avaliar:encaminhamento` (ver §13).

> Hoje a pasta tem **40 dos 47** casos (7 `.txt` ausentes: `5857-1`, `5858-0`, `5872-5`,
> `5848-2`, `5824-5`, `5825-3`, `5827-0` — o script avisa e pula). Métricas atuais:

> **Pendência (07/10/2026)** — as métricas abaixo são **anteriores** à mudança "denúncia
> passa primeiro pelo GABIN" (regras 2–4 com `COR/DEPRO` garantido em 2º). Enquanto a
> pasta `PROCESSOS/` não voltar com os rótulos de denúncia atualizados para
> `PRESI/GABIN`, os ~10 casos de denúncia contarão como erro no top-1 (~22/40) mesmo com
> a sugestão correta; **reExecute o gate após a atualização da planilha**.

| Métrica | Valor (40 casos) |
| --- | --- |
| top-1 | **31/40 (78%)** |
| top-3 / top-5 | 38 / 39 |
| MRR | **0,860** |
| regras de conteúdo | 30 disparos, **29 corretos (97%)** |
| LOO (400 processos, sem regras) | 79,5% top-1 |

Por regra: GABIN 14/15, DEPRO 9/9, SEBIB 4/4, SEATE 1/1, SERECRED 1/1.
Com os 47 casos (medição anterior, antes do remapeamento SESIND→DEPRO): top-1 **34/47**,
MRR 0,821; nos mesmos 40 casos o SESIND→DEPRO levou **29→31** top-1 e **0,815→0,860** MRR
(sem regressão em nenhum caso — todos os casos alterados eram de DEPRO).
Sem as regras de conteúdo (só k-NN, medição com 47): **5/47 (11%)** top-1, MRR 0,394.

Casos observados:

| Cenário | Resultado |
| --- | --- |
| e-mail pedindo devolução de valores | **SECON 41% › SECOP 28% › SEATE 21%** (regra reponderada) |
| devolução com tipo "2ª via carteira" | SECON **91%** |
| "devolver documentos" (sem dinheiro) | SEATE (regra **não** dispara — falso positivo evitado) |
| formulário/certidão com "devolução do certificado" + "anuidade" (`26.17.000005886-5`, `26.17.000005890-3`) | **SEATE 100%** via vizinhos — regra **não** dispara (falso positivo corrigido: exclusão de documento + janela ±6) |
| parecer/consulta | **SEBIB** (regra de conteúdo) |
| formulário de denúncia (`26.17.000005639-0`, `26.17.000005842-3`) | **PRESI/GABIN** no topo, **COR/DEPRO** em 2º (regra de conteúdo, 2ª garantida) |
| ofício/endereçado à presidência (`26.17.000005863-6`, `26.17.000005791-5`, `26.17.000005868-7`) | **PRESI/GABIN ~67%** — antes sugeria PRESIDENTE (remapeamento autoridade→entrada) |
| Habilitação de PJ | DEFIS **50%** (vizinhos, sem regra) |
| descrição curta (1 linha) | regra de conteúdo **não** dispara (porta `ehDocumentoEstruturado`) |
| texto sem termos de contexto | `nenhuma` (interface: "sem sugestão") |
| requisição vazia | `400` |

Como revalidar: [§13](#13-como-testar).

## 11. Como ajustar (constantes e vocabulário)

| O quê | Onde (`backend/src/services/encaminhamento.ts`) |
| --- | --- |
| nº de vizinhos | `TOP_K = 10` |
| vocabulário descartado | `STOPWORDS` |
| prefixos de reembolso | `PREFIXOS_REEMBOLSO` |
| termos de dinheiro | `TERMOS_VALOR` |
| exclusão "devolução de documento" | `SUBSTANTIVOS_DOCUMENTO` |
| janela de proximidade do termo de dinheiro | `JANELA_VALOR = 6` |
| sigla do destino garantido | `SECON_SIGLA` |
| regras por conteúdo | `REGRAS_CONTEUDO` (destino + padrão) |
| janela do cabeçalho | `cabecalhoDoTexto` (`ini + 5` linhas) |
| porta de entrada das regras | `ehDocumentoEstruturado` |
| unidades nunca rotuláveis | `UNIDADES_EXCLUIDAS` |
| autoridade → porta de entrada | `ENTRADA_AUTORIDADE` |
| setor → porta de entrada (SESIND → DEPRO) | `ENTRADA_SETOR` |
| tamanho do resumo na base | `MAX_RESUMO_CHARS = 1500` |
| TTL do cache | `TTL_MS` |
| mínimo de similaridade | `sim > 0.01` em `sugerirEncaminhamento` |
| nº de sugestões / exemplos | `agregar(...).slice(0, 6)` e `.slice(0, 3)` |
| alvo da regra no topo | `elevarParaTopo` (`max(outros) + 0,02`, teto 0,95) |
| limites do endpoint | `processes.ts` (20 arquivos, 90.000 chars) |

Depois de mexer: reinicie o backend (cache é em memória) e rode os testes do §13 + `npx tsc --noEmit`.

## 12. Limitações e casos em aberto

1. **CIM/CPM → ADM ou SEATE?** — por **permanência** sai ADM (129 casos); por **1ª unidade** sairia SEATE (79). A regra atual usa permanência → ADM. **Decisão de domínio pendente.**
2. **Denúncia → corregedoria (VICE-CORREGEDOR/DEPRO) ou GABIN?** — ~~Conferir com a
   corregedoria se GABIN deve ser a passagem padrão~~ **Resolvida (07/10/2026): GABIN é
   a passagem padrão** (trâmite observado `PROTOCOLO → GABIN → DEPRO → VICE-CORREGEDOR →
   SESIND` em 88 processos confirmado). A regra 2 agora manda denúncia/notícia de fato/
   averiguação/sindicância/etc. para `PRESI/GABIN` com `COR/DEPRO` garantido como 2ª
   sugestão; regra nova (3) faz o mesmo para notificações do MPE.
3. **SECON × SERECRED × SECOP** — o dicionário mostra "Reembolso" inicial = SERECRED 75% (SECON só em 3), enquanto a regra 7 força SECON. Conferir com a Tesouraria/SECON qual é o caminho oficial de entrada.
4. **`estrategia: "regra"` é por construção** — não mede se o destino está certo; foi fixado em domínio, não aprendido.
5. **Sem OCR** — arquivos só-imagem não geram texto: se nenhum arquivo tiver texto extraível e não houver descrição, a resposta é `422`.
6. **Termos inéditos na base não pesam** — uma demanda inteiramente fora do vocabulário histórico cai no fallback por tipo (ou `nenhuma`).
7. **Descrições vazias** na base (~7%) = processos cujos setores não são unidades internas (CFM/CREMEC/CREMEGO); contam pouco no dicionário.
8. **Regras de 1 caso não incluídas** (evitar overfitting): "análise ética → SEATE", "falecimento → 3 destinos". Só entram se a evidência crescer.
9. **α da agregação não mexido** — medido: α=0,25 melhora LOO de 79,5%→80,3%; α=0,5→76,8%; α=1 cai para 69,3%. Mantido **α=0 (só similaridade)**; regra de conteúdo cobre o restante sem tocar no k-NN.

## 13. Como testar

**Pelo frontend** (recomendado): login → menu **"Encaminhar"** (`/encaminhar`) → descrição/arquivos → ver pesos, exemplos e trâmites.

**Direto na API**:

```bash
# 1. login (ou use um JWT de sessão existente)
curl -s -X POST http://localhost:8000/api/autenticacao/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@cremepe.org.br","senha":"admin123"}'

# 2. sugestão
curl -s -X POST "http://localhost:8000/api/processos/sugestao-encaminhamento" \
  -H "Authorization: Bearer <TOKEN>" \
  -F "descricao=Solicito devolucao do valor pago a maior na anuidade via pix" \
  -F "tipo=Reembolso"
```

Verificar: `estrategia` esperada (`regra` + `motivoRegra: "reembolso"` no caso acima), topo `CREMEPE/TESOURARIA/SECON`, exemplos com trâmites coerentes.

**Avaliação sobre os 47 casos rotulados** (heurística principal — rode antes e depois de
qualquer mudança no algoritmo):

```bash
cd backend
npm run avaliar:encaminhamento                # top-1/3/5, MRR, precisão por regra
npm run avaliar:encaminhamento -- --detalhe   # linha a linha
npm run avaliar:encaminhamento -- --min=31    # exit 1 se top-1 < 31 (checagem de regressão)
```

Referência atual (40 casos disponíveis): **top-1 31/40, MRR 0,860, regras 29/30 corretas (97%)**
(métricas anteriores à mudança das regras 2–4 — ver pendência da §10).
Se os 7 `.txt` ausentes voltarem, espere ~36/47 e suba o `--min` para 36.

Checagens de regressão recomendadas após qualquer mudança:

- devolução de valores → SECON no topo; "devolver documentos" → **sem** SECON;
- formulário com "devolução do certificado" + "anuidade" (boilerplate) → **sem** SECON (k-NN/SEATE intacto);
- e-mail com assunto "Parecer-Consulta…" → **SEBIB** no topo (`regra`/`conteudo`);
- formulário de denúncia → **PRESI/GABIN** no topo com **COR/DEPRO** em 2º (`regra`/`conteudo`);
- **`COR/SESIND` nunca aparece como sugestão** (rótulo remapeado para `COR/DEPRO` — `ENTRADA_SETOR`);
- descrição curta (1 linha) → regra de conteúdo **não** dispara;
- ofício/endereçado à presidência → **PRESI/GABIN** (nunca PRESIDENTE/VICE/CORREGEDOR como topo);
- Habilitação de PJ → DEFIS;
- texto vazio → `400`; texto sem termos da base → `nenhuma`;
- `npx tsc --noEmit` (backend) e `cd frontend && npx tsc --noEmit && npm run build`.
