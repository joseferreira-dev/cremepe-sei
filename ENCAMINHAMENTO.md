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
8. [Dicionário de trâmites (`npm run gerar:dicionario`)](#8-dicionário-de-trâmites-npm-run-gerardicionario)
9. [Avaliação (resultados observados)](#9-avaliação-resultados-observados)
10. [Como ajustar (constantes e vocabulário)](#10-como-ajustar-constantes-e-vocabulário)
11. [Limitações e casos em aberto](#11-limitações-e-casos-em-aberto)
12. [Como testar](#12-como-testar)

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
        3. regra de domínio reembolso → SECON (sempre aplicada, por último)
                         ▼
                   resultado (estrategia: "vizinhos" | "tipo" | "regra" | "nenhuma")
```

Fontes de código:

| Arquivo | Papel |
| --- | --- |
| `backend/src/services/encaminhamento.ts` | algoritmo completo (rótulo, TF-IDF, cache, fallback, regra) |
| `backend/src/routes/processes.ts:39` | rota `POST /sugestao-encaminhamento` |
| `backend/scripts/gerar-dicionario-tramites.ts` | gerador do dicionário Excel |
| `frontend/src/components/RoutingSuggestion.tsx` | UI da sugestão (branch `metaTexto` para `regra`) |
| `frontend/src/api.ts` | tipos (`estrategia` inclui `"regra"`) |

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

Ordem na rota (`processes.ts`): k-NN → (fallback por tipo, se preciso) → **regra de reembolso (sempre por último)**.

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

## 8. Dicionário de trâmites (`npm run gerar:dicionario`)

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

> **Leitura**: o dicionário e a sugestão respondem perguntas diferentes — o dicionário diz *o que os setores costumam fazer no início*; a sugestão diz *para onde processos parecidos com ESTA demanda foram parar*. Conferir divergências com os setores (ex.: "Reembolso" inicial aparece como SERECRED 75%, enquanto a regra 7 manda para SECON — ver §11).

## 9. Avaliação (resultados observados)

| Cenário | Resultado |
| --- | --- |
| e-mail pedindo devolução de valores | **SECON 41% › SECOP 28% › SEATE 21%** (regra reponderada) |
| devolução com tipo "2ª via carteira" | SECON **91%** |
| "devolver documentos" (sem dinheiro) | SEATE (regra **não** dispara — falso positivo evitado) |
| formulário/certidão com "devolução do certificado" + "anuidade" (`26.17.000005886-5`, `26.17.000005890-3`) | **SEATE 100%** via vizinhos — regra **não** dispara (falso positivo corrigido: exclusão de documento + janela ±6) |
| ofício/endereçado à presidência (`26.17.000005863-6`, `26.17.000005791-5`, `26.17.000005868-7`) | **PRESI/GABIN ~67%** — antes sugeria PRESIDENTE (remapeamento autoridade→entrada) |
| Habilitação de PJ | DEFIS **50%** (vizinhos, sem regra) |
| texto sem termos de contexto | `nenhuma` (interface: "sem sugestão") |
| requisição vazia | `400` |

Como revalidar: [§12](#12-como-testar).

## 10. Como ajustar (constantes e vocabulário)

| O quê | Onde (`backend/src/services/encaminhamento.ts`) |
| --- | --- |
| nº de vizinhos | `TOP_K = 10` |
| vocabulário descartado | `STOPWORDS` |
| prefixos de reembolso | `PREFIXOS_REEMBOLSO` |
| termos de dinheiro | `TERMOS_VALOR` |
| exclusão "devolução de documento" | `SUBSTANTIVOS_DOCUMENTO` |
| janela de proximidade do termo de dinheiro | `JANELA_VALOR = 6` |
| sigla do destino garantido | `SECON_SIGLA` |
| unidades nunca rotuláveis | `UNIDADES_EXCLUIDAS` |
| autoridade → porta de entrada | `ENTRADA_AUTORIDADE` |
| tamanho do resumo na base | `MAX_RESUMO_CHARS = 1500` |
| TTL do cache | `TTL_MS` |
| mínimo de similaridade | `sim > 0.01` em `sugerirEncaminhamento` |
| nº de sugestões / exemplos | `agregar(...).slice(0, 6)` e `.slice(0, 3)` |
| limites do endpoint | `processes.ts` (20 arquivos, 90.000 chars) |

Depois de mexer: reinicie o backend (cache é em memória) e rode os testes do §12 + `npx tsc --noEmit`.

## 11. Limitações e casos em aberto

1. **CIM/CPM → ADM ou SEATE?** — por **permanência** sai ADM (129 casos); por **1ª unidade** sairia SEATE (79). A regra atual usa permanência → ADM. **Decisão de domínio pendente.**
2. **Denúncia → corregedoria (VICE-CORREGEDOR/DEPRO) ou GABIN?** — o trâmite oficial observado é `PROTOCOLO → GABIN → DEPRO → VICE-CORREGEDOR → SESIND` (88 processos): GABIN é passagem oficial (permanência curta → a base tende a eleger a unidade que retém). **Decisão pendente.**
3. **SECON × SERECRED × SECOP** — o dicionário mostra "Reembolso" inicial = SERECRED 75% (SECON só em 3), enquanto a regra 7 força SECON. Conferir com a Tesouraria/SECON qual é o caminho oficial de entrada.
4. **`estrategia: "regra"` é por construção** — não mede se o SECON está certo; foi fixado em domínio, não aprendido.
5. **Sem OCR** — arquivos só-imagem não geram texto: se nenhum arquivo tiver texto extraível e não houver descrição, a resposta é `422`.
6. **Termos inéditos na base não pesam** — uma demanda inteiramente fora do vocabulário histórico cai no fallback por tipo (ou `nenhuma`).
7. **Descrições vazias** na base (~7%) = processos cujos setores não são unidades internas (CFM/CREMEC/CREMEGO); contam pouco no dicionário.

## 12. Como testar

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

Verificar: `estrategia` esperada (`regra` no caso acima), topo `CREMEPE/TESOURARIA/SECON`, exemplos com trâmites coerentes.

Checagens de regressão recomendadas após qualquer mudança:

- devolução de valores → SECON no topo; "devolver documentos" → **sem** SECON;
- formulário com "devolução do certificado" + "anuidade" (boilerplate) → **sem** SECON (k-NN/SEATE intacto);
- ofício/endereçado à presidência → **PRESI/GABIN** (nunca PRESIDENTE/VICE/CORREGEDOR como topo);
- Habilitação de PJ → DEFIS;
- texto vazio → `400`; texto sem termos da base → `nenhuma`;
- `npx tsc --noEmit` (backend) e `cd frontend && npx tsc --noEmit && npm run build`.
