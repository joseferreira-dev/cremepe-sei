import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import { regraDeConteudo, sugerirEncaminhamento } from "../src/services/encaminhamento.js";
import { prisma } from "../src/db/prisma.js";

/**
 * Avaliação da sugestão de encaminhamento sobre os casos rotulados em
 * `PROCESSOS/` (47 `.txt` + `ENCAMINHAMENTOS.xlsx` com a coluna "Correto").
 *
 *   cd backend && npm run avaliar:encaminhamento [-- --detalhe] [-- --min=30]
 *
 * `--detalhe` imprime caso a caso; `--min=N` sai com código 1 se o top-1 < N
 * (útil como checagem de regressão após mudanças no algoritmo).
 */

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = path.join(RAIZ, "PROCESSOS");
const PLANILHA = path.join(DIR, "ENCAMINHAMENTOS.xlsx");

const detalhe = process.argv.includes("--detalhe");
const argMin = process.argv.find((a) => a.startsWith("--min="));
const minimo = argMin ? Number(argMin.split("=")[1]) : 0;

interface Caso {
  num: string;
  corr: string;
}

function lerCasos(): Caso[] {
  const wb = XLSX.readFile(PLANILHA);
  const ws = wb.Sheets["Planilha2"] ?? wb.Sheets[wb.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });
  return linhas
    .filter((l) => Array.isArray(l) && l[0] && String(l[0]).startsWith("26.17"))
    .map((l) => ({ num: String(l[0]).trim(), corr: String(l[2] ?? "").trim() }));
}

const semPrefixo = (s: string) => (s || "").replace(/^CREMEPE\//, "").trim();

function acerta(sugestao: string, correto: string): boolean {
  const a = semPrefixo(sugestao);
  const b = (correto || "").trim();
  return a === b || b.includes(a) || a.includes(b);
}

(async () => {
  try {
    const casos = lerCasos();
    if (casos.length === 0) throw new Error(`Nenhum caso lido de ${PLANILHA}`);

    let top1 = 0;
    let top3 = 0;
    let top5 = 0;
    let rr = 0;
    let base = 0;
    let pulados = 0;
    const faltantes: string[] = [];
    const porRegra = new Map<string, { n: number; ok: number }>();
    const linhas: string[] = [];

    for (const c of casos) {
      const arquivo = path.join(DIR, `${c.num}.txt`);
      if (!fs.existsSync(arquivo)) {
        pulados++;
        faltantes.push(c.num);
        continue;
      }
      const texto = fs.readFileSync(arquivo, "utf-8");
      const regra = regraDeConteudo(texto);
      const res = await sugerirEncaminhamento(texto);
      base = res.totalBase;
      const rank = res.sugestoes.findIndex((s) => acerta(s.sigla, c.corr));
      if (rank === 0) top1++;
      if (rank >= 0 && rank < 3) top3++;
      if (rank >= 0 && rank < 5) top5++;
      if (rank >= 0) rr += 1 / (rank + 1);
      if (regra) {
        const e = porRegra.get(regra) || { n: 0, ok: 0 };
        e.n++;
        if (acerta(regra, c.corr)) e.ok++;
        porRegra.set(regra, e);
      }
      linhas.push(
        `${c.num}  ${(c.corr || "-").padEnd(28)} rank=${rank >= 0 ? rank + 1 : "-"}  ` +
          `regra=${semPrefixo(regra || "-").padEnd(20)} top1=${semPrefixo(res.sugestoes[0]?.sigla || "-")}`,
      );
    }

    const avaliados = casos.length - pulados;
    if (avaliados === 0) throw new Error("Nenhum caso com arquivo .txt em PROCESSOS/");
    const pct = (n: number) => `${((100 * n) / avaliados).toFixed(0)}%`;
    console.log(`base: ${base} processos | casos: ${avaliados}/${casos.length}`);
    if (pulados > 0) console.log(`AVISO: ${pulados} caso(s) sem .txt em PROCESSOS/: ${faltantes.join(", ")}`);
    console.log(`top-1 ${top1}/${avaliados} (${pct(top1)})  top-3 ${top3}  top-5 ${top5}  MRR ${(rr / avaliados).toFixed(3)}`);
    const regraN = [...porRegra.values()].reduce((a, b) => a + b.n, 0);
    const regraOk = [...porRegra.values()].reduce((a, b) => a + b.ok, 0);
    console.log(`regras de conteúdo: ${regraN} disparos, ${regraOk} corretos (${regraN ? ((100 * regraOk) / regraN).toFixed(0) : 0}%)`);
    for (const [sigla, e] of [...porRegra.entries()].sort((a, b) => b[1].n - a[1].n)) {
      console.log(`  ${semPrefixo(sigla).padEnd(24)} ${e.ok}/${e.n}`);
    }
    if (detalhe) console.log("\n" + linhas.join("\n"));

    if (minimo > 0 && top1 < minimo) {
      console.error(`\nFALHOU: top-1 ${top1} < mínimo exigido ${minimo}`);
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
