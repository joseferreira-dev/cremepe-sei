import { prisma } from "../db/prisma.js";

/**
 * Sugestão de unidade de encaminhamento para uma nova demanda.
 *
 * Abordagem (k-NN sobre a base histórica):
 * 1. Para cada processo da base, extrai a **trilha de unidades** dos andamentos
 *    (ordenados por data/hora — no SEI eles não vêm cronológicos) e deriva o
 *    **destino aprendido**: a unidade de **maior permanência** (a que efetivamente
 *    tratou o processo), ignorando PROTOCOLO (entrada oficial) e ARQUIVO (arquivo
 *    final). Encaminhamentos iniciais errados são curtos e nunca vencem; setores
 *    de atendimento (GABIN/SEATE) são elegíveis e vencem quando retêm o processo.
 * 2. Vetoriza o contexto de cada processo (tipo, especificação, assuntos,
 *    interessados, resumo IA) em TF-IDF.
 * 3. A nova demanda (texto + arquivos extraídos) é vetorizada da mesma forma;
 *    os top-k vizinhos por cosseno votam nos destinos deles, ponderados pela
 *    similaridade.
 * 4. Fallback: se nenhum vizinho tiver similaridade, agrupa por `tipo` exato.
 */

export interface ExemploSugestao {
  id: string;
  numeroSei: string;
  tipo: string | null;
  dataAutuacao: string | null;
  trilha: string[];
}

export interface SugestaoUnidade {
  sigla: string;
  descricao: string | null;
  peso: number;
  casos: number;
  exemplos: ExemploSugestao[];
}

export interface ResultadoSugestao {
  estrategia: "vizinhos" | "tipo" | "nenhuma" | "regra";
  totalBase: number;
  vizinhos: number;
  caracteres: number;
  sugestoes: SugestaoUnidade[];
}

const STOPWORDS = new Set([
  "de", "do", "da", "dos", "das", "em", "no", "na", "nos", "nas", "ao", "aos", "à", "às",
  "para", "por", "com", "sem", "sob", "sobre", "entre", "ate", "apos", "per", "cada",
  "que", "qual", "quais", "quando", "onde", "como", "porque", "pois", "mas", "mais",
  "menos", "muito", "muitos", "muitas", "pouco", "todo", "todos", "toda", "todas",
  "este", "esta", "estes", "estas", "esse", "essa", "esses", "essas", "aquele", "aquela",
  "isso", "isto", "aquilo", "ele", "ela", "eles", "elas", "eu", "nos", "voce", "voces",
  "seu", "sua", "seus", "suas", "meu", "minha", "nosso", "nossa",
  "ser", "estar", "ter", "foi", "era", "sao", "era", "esta", "estao", "tem", "tinha",
  "foi", "sera", "seja", "sendo", "tendo", "podem", "pode", "deve", "devem", "vai", "vao",
  "um", "uma", "uns", "umas", "e", "ou", "nem", "la", "aqui", "ai", "ja", "nao", "sim",
  "the", "and", "for", "with", "from",
]);

export function tokenizar(texto: string): string[] {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

function parseDataHora(s: string | null | undefined): number {
  if (!s) return 0;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}`).getTime();
  const d = new Date(s);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

/**
 * Unidades que nunca podem ser rótulo: entrada oficial (PROTOCOLO) e destino
 * final de arquivo (ARQUIVO) — nenhuma delas "resolve" a demanda.
 */
const UNIDADES_EXCLUIDAS = ["PROTOCOLO", "ARQUIVO"];

/**
 * Cadeiras de autoridade (sigla `CREMEPE/<pessoa>`, sem setor subordinado):
 * o processo nunca é encaminhado "para" a autoridade — quem recebe e conduz
 * é a **porta de entrada** da estrutura dela. A autoridade só assina/decide
 * no fim, e a permanência longa nela a faria vencer o rótulo.
 *
 * Mapeamento validado na base histórica (alimentador imediato / "passa por
 * antes de chegar à autoridade"):
 * - PRESIDENTE          <- PRESI/GABIN   (GABIN antes em 124/134 = 93%)
 * - 3º VICE-PRESIDENTE  <- 3º VIP./DEFIS (DEFIS antes em 20/20 = 100%)
 * - VICE-CORREGEDOR     <- COR/DEPRO     (DEPRO antes em 95/96 = 99%)
 * - SECRETÁRIO GERAL    <- SECRET. G./SEATE (alimentador imediato 71%)
 * - 1º TESOUREIRO       <- TESOURARIA/SECOP (alimentador imediato 71%)
 * Sem entrada clara (mantidos como rótulo): 1º/2º VICE-PRESIDENTE (SEBIB 48%,
 * CEM 26%, GABIN 12%), 1º SECRETÁRIO e demais cadeiras com n≈0.
 */
const ENTRADA_AUTORIDADE = new Map<string, string>([
  ["CREMEPE/PRESIDENTE", "CREMEPE/PRESI/GABIN"],
  ["CREMEPE/3º VICE-PRESIDENTE", "CREMEPE/3º VIP./DEFIS"],
  ["CREMEPE/VICE-CORREGEDOR", "CREMEPE/COR/DEPRO"],
  ["CREMEPE/CORREGEDOR", "CREMEPE/COR/DEPRO"],
  ["CREMEPE/SECRETÁRIO GERAL", "CREMEPE/SECRET. G./SEATE"],
  ["CREMEPE/1º TESOUREIRO", "CREMEPE/TESOURARIA/SECOP"],
]);

interface EntradaTrilha {
  sigla: string;
  /** epoch ms da primeira passagem do processo por esta unidade */
  t: number;
}

function trilhaDeAndamentos(andamentosRaw: string): { entradas: EntradaTrilha[]; fim: number } {
  let arr: any[] = [];
  try {
    arr = JSON.parse(andamentosRaw || "[]");
  } catch {
    return { entradas: [], fim: 0 };
  }
  arr = arr.slice().sort((a, b) => parseDataHora(a?.dataHora) - parseDataHora(b?.dataHora));
  const entradas: EntradaTrilha[] = [];
  for (const a of arr) {
    const s = typeof a?.unidade === "string" ? a.unidade.trim() : "";
    if (!s || entradas.some((e) => e.sigla === s)) continue;
    entradas.push({ sigla: s, t: parseDataHora(a?.dataHora) });
  }
  const fim = arr.length ? parseDataHora(arr[arr.length - 1]?.dataHora) : 0;
  return { entradas, fim };
}

function excluidaComoRotulo(sigla: string): boolean {
  const u = sigla.toUpperCase();
  return UNIDADES_EXCLUIDAS.some((x) => u.includes(x));
}

/**
 * Rótulo de treino = unidade de **maior permanência** (a que efetivamente
 * tratou o processo), ignorando PROTOCOLO e ARQUIVO.
 *
 * - Corrige erros de encaminhamento sem regra especial: um salto errado é
 *   curto e nunca vence a unidade onde o processo ficou.
 * - Setores de atendimento (GABIN/SEATE) continuam elegíveis: quando eles
 *   realmente retêm o processo, a permanência os elege naturalmente.
 * - A última unidade usa o tempo até o último andamento (permanência atual).
 * - Se o vencedor é cadeira de autoridade, o rótulo vira a porta de entrada
 *   dela (ENTRADA_AUTORIDADE) — ver comentário do mapa.
 */
function destinoPorPermanencia(bruto: EntradaTrilha[], fimUltimoAndamento: number): string | null {
  const DIA = 86400000;
  let melhor: string | null = null;
  let melhorDias = -1;
  for (let i = 0; i < bruto.length; i++) {
    const e = bruto[i];
    if (excluidaComoRotulo(e.sigla)) continue;
    // Não-terminal: sai quando a próxima unidade recebe o processo; terminal:
    // permanência atual até o último andamento.
    const fim = i + 1 < bruto.length ? bruto[i + 1].t : fimUltimoAndamento;
    const dias = (fim - e.t) / DIA;
    if (dias > melhorDias) {
      melhorDias = dias;
      melhor = e.sigla;
    }
  }
  if (melhor) melhor = ENTRADA_AUTORIDADE.get(melhor) ?? melhor;
  return melhor;
}

interface DocBase {
  id: string;
  numeroSei: string;
  tipo: string | null;
  dataAutuacao: string | null;
  destino: string;
  trilha: string[];
  /** termos únicos do documento (para regras por conteúdo) */
  tokens: string[];
  norma: number;
}

interface BaseCache {
  docs: DocBase[];
  idf: Map<string, number>;
  /** termo → pesos dos documentos já normalizados (1/doc.norma) */
  indice: Map<string, { doc: number; w: number }[]>;
  descricoes: Map<string, string>;
  qtd: number;
  em: number;
}

let cache: BaseCache | null = null;
const TTL_MS = 10 * 60 * 1000;
const MAX_RESUMO_CHARS = 1500;

async function carregarBase(): Promise<BaseCache> {
  const qtd = await prisma.process.count();
  if (cache && cache.qtd === qtd && Date.now() - cache.em < TTL_MS) return cache;

  const procs = await prisma.process.findMany({
    select: {
      id: true,
      numeroSei: true,
      tipo: true,
      dataAutuacao: true,
      especificacao: true,
      assuntos: true,
      interessados: true,
      resumoIa: true,
      andamentos: true,
      unidades: true,
      unidadeAtual: true,
    },
  });

  const docs: DocBase[] = [];
  const descricoes = new Map<string, string>();
  const df = new Map<string, number>();
  const tfs: Map<string, number>[] = [];

  const registraDescricao = (u: any) => {
    if (u?.sigla && u.descricao && !descricoes.has(u.sigla)) descricoes.set(u.sigla, u.descricao);
  };

  for (const p of procs) {
    try {
      (JSON.parse(p.unidades || "[]") || []).forEach(registraDescricao);
    } catch { /* ignore */ }
    if (p.unidadeAtual) {
      try { registraDescricao(JSON.parse(p.unidadeAtual)); } catch { /* ignore */ }
    }

    const { entradas, fim } = trilhaDeAndamentos(p.andamentos);
    const destino = destinoPorPermanencia(entradas, fim);
    const trilha = entradas.map((e) => e.sigla);
    if (!destino) continue;

    // Contexto: tipo com peso dobrado (é o campo mais informativo do SEI)
    const assuntos = (() => { try { return JSON.parse(p.assuntos || "[]").join(" "); } catch { return ""; } })();
    const interessados = (() => { try { return JSON.parse(p.interessados || "[]").join(" "); } catch { return ""; } })();
    const texto = [
      p.tipo || "",
      p.tipo || "",
      p.especificacao || "",
      assuntos,
      interessados,
      (p.resumoIa || "").slice(0, MAX_RESUMO_CHARS),
    ].join(" ");

    const tf = new Map<string, number>();
    for (const t of tokenizar(texto)) tf.set(t, (tf.get(t) || 0) + 1);
    if (tf.size === 0) continue;

    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    docs.push({
      id: p.id,
      numeroSei: p.numeroSei,
      tipo: p.tipo,
      dataAutuacao: p.dataAutuacao,
      destino,
      trilha,
      tokens: Array.from(tf.keys()),
      norma: 0,
    });
    tfs.push(tf);
  }

  const N = docs.length;
  const idf = new Map<string, number>();
  for (const [t, d] of df) idf.set(t, Math.log(1 + N / d));

  const indice = new Map<string, { doc: number; w: number }[]>();
  tfs.forEach((tf, i) => {
    let soma = 0;
    const pesos: { t: string; w: number }[] = [];
    for (const [t, f] of tf) {
      const w = (1 + Math.log(f)) * (idf.get(t) || 0);
      if (w > 0) {
        pesos.push({ t, w });
        soma += w * w;
      }
    }
    const norma = Math.sqrt(soma) || 1;
    docs[i].norma = norma;
    for (const { t, w } of pesos) {
      let lista = indice.get(t);
      if (!lista) {
        lista = [];
        indice.set(t, lista);
      }
      lista.push({ doc: i, w: w / norma });
    }
  });

  cache = { docs, idf, indice, descricoes, qtd, em: Date.now() };
  return cache;
}

function agregar(
  docs: DocBase[],
  pesos: number[],
  descricoes: Map<string, string>,
): SugestaoUnidade[] {
  const porDestino = new Map<string, { casos: number; peso: number; docs: { doc: DocBase; sim: number }[] }>();
  let total = 0;
  docs.forEach((d, i) => {
    const sim = pesos[i];
    total += sim;
    let e = porDestino.get(d.destino);
    if (!e) {
      e = { casos: 0, peso: 0, docs: [] };
      porDestino.set(d.destino, e);
    }
    e.casos += 1;
    e.peso += sim;
    e.docs.push({ doc: d, sim });
  });

  return Array.from(porDestino.entries())
    .map(([sigla, e]) => ({
      sigla,
      descricao: descricoes.get(sigla) || null,
      peso: total > 0 ? Math.round((e.peso / total) * 1000) / 1000 : 0,
      casos: e.casos,
      exemplos: e.docs
        .sort((a, b) => b.sim - a.sim)
        .slice(0, 3)
        .map(({ doc }) => ({
          id: doc.id,
          numeroSei: doc.numeroSei,
          tipo: doc.tipo,
          dataAutuacao: doc.dataAutuacao,
          trilha: doc.trilha.map((s) => s.replace(/^CREMEPE\//, "")),
        })),
    }))
    .sort((a, b) => b.peso - a.peso || b.casos - a.casos)
    .slice(0, 6);
}

const TOP_K = 10;

export async function sugerirEncaminhamento(texto: string): Promise<ResultadoSugestao> {
  const base = await carregarBase();
  const caracteres = (texto || "").length;

  if (base.docs.length === 0) {
    return { estrategia: "nenhuma", totalBase: 0, vizinhos: 0, caracteres, sugestoes: [] };
  }

  const tf = new Map<string, number>();
  for (const t of tokenizar(texto)) tf.set(t, (tf.get(t) || 0) + 1);

  let somaQ = 0;
  const pesosQ: number[] = [];
  const termosQ: string[] = [];
  for (const [t, f] of tf) {
    const idf = base.idf.get(t);
    if (idf === undefined) continue; // termo inédito na base não contribui
    const w = (1 + Math.log(f)) * idf;
    if (w > 0) {
      termosQ.push(t);
      pesosQ.push(w);
      somaQ += w * w;
    }
  }
  const normaQ = Math.sqrt(somaQ) || 1;

  const scores = new Map<number, number>();
  termosQ.forEach((t, i) => {
    const lista = base.indice.get(t);
    if (!lista) return;
    const qw = pesosQ[i] / normaQ;
    for (const { doc, w } of lista) {
      scores.set(doc, (scores.get(doc) || 0) + qw * w);
    }
  });

  const vizinhos = Array.from(scores.entries())
    .filter(([, sim]) => sim > 0.01)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_K);

  if (vizinhos.length > 0) {
    const docs = vizinhos.map(([i]) => base.docs[i]);
    const pesos = vizinhos.map(([, sim]) => sim);
    return {
      estrategia: "vizinhos",
      totalBase: base.docs.length,
      vizinhos: vizinhos.length,
      caracteres,
      sugestoes: agregar(docs, pesos, base.descricoes),
    };
  }

  return { estrategia: "nenhuma", totalBase: base.docs.length, vizinhos: 0, caracteres, sugestoes: [] };
}

/** Fallback por `tipo` exato do SEI, quando nenhum vizinho tem similaridade. */
export async function sugerirPorTipo(tipo: string): Promise<ResultadoSugestao> {
  const base = await carregarBase();
  const alvo = (tipo || "").trim().toLowerCase();
  const caracteres = tipo.length;
  if (!alvo || base.docs.length === 0) {
    return { estrategia: "nenhuma", totalBase: base.docs.length, vizinhos: 0, caracteres, sugestoes: [] };
  }

  const docs = base.docs.filter((d) => (d.tipo || "").trim().toLowerCase() === alvo);
  if (docs.length === 0) {
    return { estrategia: "nenhuma", totalBase: base.docs.length, vizinhos: 0, caracteres, sugestoes: [] };
  }

  return {
    estrategia: "tipo",
    totalBase: base.docs.length,
    vizinhos: docs.length,
    caracteres,
    sugestoes: agregar(docs, docs.map(() => 1 / docs.length), base.descricoes),
  };
}

/* ---------- Regra de domínio: devolução/reembolso de valores → SECON ----------
 * Fluxo oficial: o SECON recebe, verifica as contas e autoriza o pagamento; o
 * SECOP apenas executa o pagamento (por isso fica com a maior permanência) e o
 * SEATE faz só os trâmites com o cidadão. A permanência jamais elege o SECON
 * (permanência ~0,1d), então o destino é garantido por conteúdo do texto.
 */
const PREFIXOS_REEMBOLSO = ["reembol", "restitu", "estorn", "ressarc"];
const TERMOS_VALOR = new Set([
  "valor", "valores", "pago", "paguei", "pagamento", "pagar", "quantia",
  "dinheiro", "pix", "taxa", "taxas", "tarifa", "anuidade", "arrecadacao",
  "custo", "preco", "receita", "emolumento",
]);
const SECON_SIGLA = "CREMEPE/TESOURARIA/SECON";

/**
 * Substantivos de documento: "devolução do certificado/documento" é texto de
 * instrução de formulário/certidão (boilerplate), nunca devolução de dinheiro.
 */
const SUBSTANTIVOS_DOCUMENTO = new Set([
  "certificado", "certificados", "certidao", "certidoes",
  "documento", "documentos", "papel", "papeis",
  "original", "arquivo", "arquivos", "processo", "processos",
]);

/**
 * Tokens de contexto (antes/depois) em que um TERMOS_VALOR precisa aparecer
 * perto do "devol" para valer — evita coocorrência fortuita entre
 * "devolução do certificado" (formulário) e "anuidade" (certidão) distantes
 * no texto consolidado.
 */
const JANELA_VALOR = 6;

export function eReembolso(texto: string): boolean {
  const toks = tokenizar(texto || "");
  // Prefixos de reembolso são inequívocos (reembolso, restituição, estorno...).
  if (toks.some((t) => PREFIXOS_REEMBOLSO.some((p) => t.startsWith(p)))) return true;

  // "devol*" só dispara com termo de dinheiro POR PERTO e nunca quando o que
  // se devolve é um documento (boilerplate de formulário/certidão).
  for (let i = 0; i < toks.length; i++) {
    if (!toks[i].startsWith("devol")) continue;
    if (toks.slice(i + 1, i + 4).some((t) => SUBSTANTIVOS_DOCUMENTO.has(t))) continue;
    const ini = Math.max(0, i - JANELA_VALOR);
    const fim = Math.min(toks.length, i + JANELA_VALOR + 1);
    if (toks.slice(ini, fim).some((t) => TERMOS_VALOR.has(t))) return true;
  }
  return false;
}

export async function aplicarRegraReembolso(
  resultado: ResultadoSugestao,
  texto: string,
): Promise<ResultadoSugestao> {
  if (!eReembolso(texto)) return resultado;
  const base = await carregarBase();

  const docsSecon = base.docs.filter((d) => d.destino === SECON_SIGLA);
  if (docsSecon.length === 0) return resultado;
  const preferidos = docsSecon.filter((d) =>
    d.tokens.some((t) => PREFIXOS_REEMBOLSO.some((p) => t.startsWith(p)) || t.startsWith("devol")),
  );
  const casos = preferidos.length > 0 ? preferidos : docsSecon;
  const exemplos = casos.slice(0, 3).map((doc) => ({
    id: doc.id,
    numeroSei: doc.numeroSei,
    tipo: doc.tipo,
    dataAutuacao: doc.dataAutuacao,
    trilha: doc.trilha.map((s) => s.replace(/^CREMEPE\//, "")),
  }));
  const r3 = (n: number) => Math.round(n * 1000) / 1000;

  if (resultado.sugestoes.length === 0) {
    return {
      ...resultado,
      estrategia: "regra",
      sugestoes: [{
        sigla: SECON_SIGLA,
        descricao: base.descricoes.get(SECON_SIGLA) || null,
        peso: 1,
        casos: casos.length,
        exemplos,
      }],
    };
  }

  const secon = resultado.sugestoes.find((s) => s.sigla === SECON_SIGLA);
  const soma = resultado.sugestoes.reduce((a, s) => a + s.peso, 0) || 1;
  const maxOutro = Math.max(
    0,
    ...resultado.sugestoes.filter((s) => s.sigla !== SECON_SIGLA).map((s) => s.peso),
  );

  if (secon) {
    if (secon.peso >= maxOutro) return resultado; // aprendido como topo, sem regra
    const alvo = r3(Math.min(maxOutro + 0.02, 0.95));
    const resto = soma - secon.peso;
    const f = resto > 0 ? (1 - alvo) / resto : 1;
    const nova = resultado.sugestoes
      .map((s) => (s.sigla === SECON_SIGLA ? { ...s, peso: alvo } : { ...s, peso: r3(s.peso * f) }))
      .sort((a, b) => b.peso - a.peso);
    return { ...resultado, estrategia: "regra", sugestoes: nova };
  }

  const topo = Math.max(0, ...resultado.sugestoes.map((s) => s.peso));
  const alvo = r3(Math.min(topo + 0.02, 0.95));
  const f = (1 - alvo) / soma;
  const injetada: SugestaoUnidade = {
    sigla: SECON_SIGLA,
    descricao: base.descricoes.get(SECON_SIGLA) || null,
    peso: alvo,
    casos: casos.length,
    exemplos,
  };
  return {
    ...resultado,
    estrategia: "regra",
    sugestoes: [injetada, ...resultado.sugestoes.map((s) => ({ ...s, peso: r3(s.peso * f) }))],
  };
}
