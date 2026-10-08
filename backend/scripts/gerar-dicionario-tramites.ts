/**
 * Gera o dicionário de trâmites INICIAIS em Excel (dicionario-tramites.xlsx,
 * na raiz do repositório) — foco: para onde encaminhar o processo NOS
 * PRIMEIROS ANDAMENTOS.
 *
 *  - Aba "1. Por situacao": para cada tipo do SEI, a unidade inicial (1º destino
 *    após o PROTOCOLO), suas variações e o trâmite inicial (até 3 unidades).
 *  - Aba "2. Por setor": para cada setor, quais situações chegam até ele como
 *    1º destino e para onde costumam seguir.
 *  - Aba "3. Trâmites iniciais": todos os trâmites iniciais (até 3 unidades)
 *    observados na base, com ocorrências e tipos associados.
 *
 * Uso: npm run gerar:dicionario
 */
import "../src/config/env.js";
import { prisma } from "../src/db/prisma.js";
import * as XLSX from "xlsx";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAIDA = resolve(__dirname, "../../dicionario-tramites.xlsx");
const ATÉ_UNIDADES = 3; // tamanho do "trâmite inicial"

function parseDataHora(s: string | null | undefined): number {
  if (!s) return 0;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}`).getTime();
  const d = new Date(s);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

const curto = (s: string) => s.replace(/^CREMEPE\//, "");
const fmtTrail = (uni: string[]) => uni.map(curto).join(" → ");
const ehProtocolo = (s: string) => s.toUpperCase().includes("PROTOCOLO");

/** 1º destino: primeira unidade que não é de protocolo (entrada oficial). */
function primeiroDestino(uni: string[]): string | null {
  for (const u of uni) if (!ehProtocolo(u)) return u;
  return null;
}

interface Grupo {
  n: number;
  /** 1º destino (sem PROTOCOLO) → nº de processos */
  iniciais: Map<string, number>;
  /** trâmite inicial (até ATÉ_UNIDADES unidades, com PROTOCOLO) → nº */
  trails3: Map<string, number>;
  /** 2ª unidade do trâmite → nº (usado para "próximo passo") */
  segs: Map<string, number>;
  exemplo: string;
}

function novoGrupo(): Grupo {
  return { n: 0, iniciais: new Map(), trails3: new Map(), segs: new Map(), exemplo: "" };
}

function bump(m: Map<string, number>, k: string, v = 1) {
  m.set(k, (m.get(k) || 0) + v);
}

function addProcesso(g: Grupo, inicial: string, trail3: string, seg: string | null, exemplo: string) {
  g.n += 1;
  bump(g.iniciais, inicial);
  bump(g.trails3, trail3);
  if (seg) bump(g.segs, seg);
  if (!g.exemplo) g.exemplo = exemplo;
}

/** modal de um mapa com percentual sobre o total do grupo */
function modal(m: Map<string, number>, total: number): { chave: string; n: number; pct: number } | null {
  const ord = Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  if (ord.length === 0) return null;
  return { chave: ord[0][0], n: ord[0][1], pct: total > 0 ? Math.round((ord[0][1] / total) * 100) : 0 };
}

function listaOps(m: Map<string, number>, exceto: string): string {
  return Array.from(m.entries())
    .filter(([k]) => k !== exceto)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${curto(k)} (${v})`)
    .join(", ");
}

function top(mapa: Map<string, number>, limite: number): string {
  return Array.from(mapa.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limite)
    .map(([k, v]) => `${curto(k)} (${v})`)
    .join(", ");
}

/** modal restrito aos trâmites cujo 1º destino é `inicial` (chaves do mapa são
 * siglas abreviadas, por isso a comparação também em forma abreviada) */
function modalDesde(trails3: Map<string, number>, inicial: string, total: number) {
  const alvo = curto(inicial);
  const filtrado = new Map<string, number>();
  for (const [k, v] of trails3) {
    const dest = primeiroDestino(k.split(" → "));
    if (dest && curto(dest) === alvo) filtrado.set(k, v);
  }
  return modal(filtrado, total);
}

async function main() {
  const procs = await prisma.process.findMany({
    select: {
      numeroSei: true,
      tipo: true,
      resumoIa: true,
      andamentos: true,
      unidades: true,
      unidadeAtual: true,
    },
  });

  const descricoes = new Map<string, string>();

  // Descrições vindas do SEI (tabela de unidades dos usuários), com chave
  // completa e abreviada.
  const unidadesUsuario = await prisma.userUnit.findMany({
    select: { unitSigla: true, unitDesc: true },
  });
  for (const u of unidadesUsuario) {
    const d = (u.unitDesc || "").trim();
    if (!u.unitSigla || !d) continue;
    if (!descricoes.has(u.unitSigla)) descricoes.set(u.unitSigla, d);
    const c = curto(u.unitSigla);
    if (!descricoes.has(c)) descricoes.set(c, d);
  }

  const reg = (u: any) => {
    if (u?.sigla && u.descricao && !descricoes.has(u.sigla)) descricoes.set(u.sigla, u.descricao);
  };

  const porTipo = new Map<string, Grupo & { resumo: string }>();
  const porSetor = new Map<string, Map<string, Grupo>>();
  const porTrilha3 = new Map<string, { n: number; tipos: Map<string, number>; exemplo: string }>();
  let semDestino = 0;

  for (const p of procs) {
    try { (JSON.parse(p.unidades || "[]") || []).forEach(reg); } catch { /* ignore */ }
    try { reg(JSON.parse(p.unidadeAtual || "null")); } catch { /* ignore */ }

    let arr: any[] = [];
    try { arr = JSON.parse(p.andamentos || "[]"); } catch { continue; }
    arr = arr
      .filter((a) => a?.dataHora && typeof a.unidade === "string" && a.unidade.trim())
      .sort((a, b) => parseDataHora(a.dataHora) - parseDataHora(b.dataHora));
    if (arr.length === 0) continue;

    // Trâmite completo: cronológico, com repetições consecutivas consolidadas.
    const uni: string[] = [];
    for (const a of arr) {
      const s = a.unidade.trim();
      if (uni[uni.length - 1] !== s) uni.push(s);
    }
    if (uni.length === 0) continue;

    const inicial = primeiroDestino(uni);
    if (!inicial) { semDestino += 1; continue; }

    const tipo = (p.tipo || "").trim() || "(sem tipo)";
    const trail3 = fmtTrail(uni.slice(0, ATÉ_UNIDADES));
    // Próximo passo: unidade seguinte à chegada no 1º destino (pulando um
    // eventual protocolo intermediário).
    const idx = uni.indexOf(inicial);
    let seg: string | null = null;
    for (let j = idx + 1; j < uni.length && j <= idx + 2; j++) {
      if (!ehProtocolo(uni[j])) { seg = uni[j]; break; }
    }

    // 1) Por situação (tipo)
    if (!porTipo.has(tipo)) porTipo.set(tipo, { ...novoGrupo(), resumo: "" });
    const gTipo = porTipo.get(tipo)!;
    addProcesso(gTipo, inicial, trail3, seg, p.numeroSei);
    if (!gTipo.resumo && p.resumoIa) gTipo.resumo = p.resumoIa.replace(/\s+/g, " ").slice(0, 400);

    // 2) Por setor inicial
    let doSetor = porSetor.get(inicial);
    if (!doSetor) { doSetor = new Map(); porSetor.set(inicial, doSetor); }
    let gs = doSetor.get(tipo);
    if (!gs) { gs = novoGrupo(); doSetor.set(tipo, gs); }
    addProcesso(gs, inicial, trail3, seg, p.numeroSei);

    // 3) Trâmites iniciais distintos
    let pt = porTrilha3.get(trail3);
    if (!pt) { pt = { n: 0, tipos: new Map(), exemplo: "" }; porTrilha3.set(trail3, pt); }
    pt.n += 1;
    bump(pt.tipos, tipo);
    if (!pt.exemplo) pt.exemplo = p.numeroSei;
  }

  const agora = new Date().toLocaleString("pt-BR");
  const wb = XLSX.utils.book_new();

  // ---- Aba Leia-me ----
  const leia: (string | number)[][] = [
    ["Dicionário de trâmites INICIAIS — CREMEPE"],
    ["Gerado em", agora],
    ["Processos analisados", procs.length],
    ["Tipos de situação", porTipo.size],
    ["Setores usados como 1º destino", porSetor.size],
    ["Trâmites iniciais distintos", porTrilha3.size],
    ["Processos sem destino inicial identificável", semDestino],
    [],
    ["Aba", "Conteúdo"],
    ["1. Por situacao", "Para cada situação (tipo do SEI): para onde encaminhar o processo inicialmente."],
    ["2. Por setor", "Para cada setor: quais situações chegam como 1º destino e para onde seguem."],
    ["3. Trâmites iniciais", "Todos os trâmites iniciais observados (até 3 unidades), para conferência."],
    [],
    ["Observações"],
    ["UNIDADE INICIAL", "Primeira unidade que recebe o processo depois do PROTOCOLO (ou a primeira unidade, quando a autuação é direta)."],
    ["TRÂMITE INICIAL", `Primeiras unidades do processo, até ${ATÉ_UNIDADES} (${uniExemplo()}).`],
    ["%", "Frequência dentro do grupo (tipo ou setor)."],
    ["PRÓXIMO PASSO", "Unidade para onde o processo costuma seguir depois de chegar ao setor."],
    ["OUTRAS OPÇÕES", "Demais unidades iniciais observadas para a situação, com nº de processos."],
  ];
  function uniExemplo() { return "ex.: PROTOCOLO → SEATE → ADM"; }
  const ws0 = XLSX.utils.aoa_to_sheet(leia);
  ws0["!cols"] = [{ wch: 42 }, { wch: 110 }];
  XLSX.utils.book_append_sheet(wb, ws0, "Leia-me");

  // ---- Aba 1. Por situação ----
  const tiposOrd = Array.from(porTipo.keys()).sort((a, b) => porTipo.get(b)!.n - porTipo.get(a)!.n);
  const linhas1: (string | number)[][] = [
    ["TIPO / SITUAÇÃO", "PROCESSOS", "UNIDADE INICIAL", "%", "OUTRAS OPÇÕES INICIAIS", "TRÂMITE INICIAL", "%", "EXEMPLO SEI", "RESUMO (EXEMPLO)"],
  ];
  for (const tipo of tiposOrd) {
    const g = porTipo.get(tipo)!;
    const mIni = modal(g.iniciais, g.n);
    const mTrail = mIni ? modalDesde(g.trails3, mIni.chave, g.n) : null;
    linhas1.push([
      tipo,
      g.n,
      mIni ? curto(mIni.chave) : "",
      mIni?.pct ?? "",
      mIni ? listaOps(g.iniciais, mIni.chave) : "",
      mTrail?.chave || "",
      mTrail?.pct ?? "",
      g.exemplo,
      g.resumo,
    ]);
  }
  const ws1 = XLSX.utils.aoa_to_sheet(linhas1);
  ws1["!cols"] = [{ wch: 58 }, { wch: 11 }, { wch: 34 }, { wch: 6 }, { wch: 52 }, { wch: 62 }, { wch: 6 }, { wch: 22 }, { wch: 90 }];
  ws1["!autofilter"] = { ref: ws1["!ref"]! };
  XLSX.utils.book_append_sheet(wb, ws1, "1. Por situacao");

  // ---- Aba 2. Por setor ----
  const setoresOrd = Array.from(porSetor.keys()).sort((a, b) => {
    const na = Array.from(porSetor.get(a)!.values()).reduce((s, g) => s + g.n, 0);
    const nb = Array.from(porSetor.get(b)!.values()).reduce((s, g) => s + g.n, 0);
    return nb - na;
  });
  const linhas2: (string | number)[][] = [
    ["SETOR (1º DESTINO)", "DESCRIÇÃO DO SETOR", "TIPO / SITUAÇÃO", "PROCESSOS", "% DO TIPO", "PRÓXIMO PASSO", "%", "EXEMPLO SEI"],
  ];
  for (const setor of setoresOrd) {
    const doSetor = porSetor.get(setor)!;
    const tiposDoSetor = Array.from(doSetor.entries()).sort((a, b) => b[1].n - a[1].n);
    for (const [tipo, g] of tiposDoSetor) {
      const totalTipo = porTipo.get(tipo)?.n || g.n;
      const mSeg = modal(g.segs, g.n);
      linhas2.push([
        curto(setor),
        descricoes.get(setor) || descricoes.get(curto(setor)) || "",
        tipo,
        g.n,
        Math.round((g.n / totalTipo) * 100),
        mSeg ? curto(mSeg.chave) : "",
        mSeg?.pct ?? "",
        g.exemplo,
      ]);
    }
  }
  const ws2 = XLSX.utils.aoa_to_sheet(linhas2);
  ws2["!cols"] = [{ wch: 34 }, { wch: 46 }, { wch: 58 }, { wch: 11 }, { wch: 10 }, { wch: 34 }, { wch: 6 }, { wch: 22 }];
  ws2["!autofilter"] = { ref: ws2["!ref"]! };
  XLSX.utils.book_append_sheet(wb, ws2, "2. Por setor");

  // ---- Aba 3. Trâmites iniciais ----
  const trilhasOrd = Array.from(porTrilha3.entries()).sort((a, b) => b[1].n - a[1].n);
  const linhas3: (string | number)[][] = [
    ["Nº", "TRÂMITE INICIAL", "1º DESTINO", "PROCESSOS", "TIPOS PRINCIPAIS", "EXEMPLO SEI"],
  ];
  trilhasOrd.forEach(([chave, pt], i) => {
    const dest = primeiroDestino(chave.split(" → "));
    linhas3.push([i + 1, chave, dest ? curto(dest) : "", pt.n, top(pt.tipos, 4), pt.exemplo]);
  });
  const ws3 = XLSX.utils.aoa_to_sheet(linhas3);
  ws3["!cols"] = [{ wch: 6 }, { wch: 66 }, { wch: 34 }, { wch: 11 }, { wch: 70 }, { wch: 22 }];
  ws3["!autofilter"] = { ref: ws3["!ref"]! };
  XLSX.utils.book_append_sheet(wb, ws3, "3. Trâmites iniciais");

  XLSX.writeFile(wb, SAIDA);

  console.log(`Arquivo gerado: ${SAIDA}`);
  console.log(`- ${procs.length} processos | ${porTipo.size} tipos | ${porSetor.size} setores iniciais | ${porTrilha3.size} trâmites iniciais distintos`);
  console.log(`- Aba 1 (por situação): ${linhas1.length - 1} linhas`);
  console.log(`- Aba 2 (por setor): ${linhas2.length - 1} linhas`);
  console.log(`- Aba 3 (trâmites iniciais): ${linhas3.length - 1} linhas`);

  await prisma.$disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
