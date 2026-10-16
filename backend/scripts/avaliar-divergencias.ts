/**
 * Avalia a sugestão sobre o conjunto de divergências rotulado:
 * `processos.xlsx` na raiz do repositório (LOCAL — não versionado; aba
 * `Planilha3`, colunas Listagem / Sugestão / Correto). Para cada caso, lê a
 * FONTE TEXTUAL do processo cadastrado na base (`process_resumo_fonte`) e
 * compara a sugestão atual com o setor correto.
 *
 * Uso: cd backend && npm run avaliar:divergencias
 */
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";
import {
  sugerirEncaminhamento,
  regraDeConteudo,
  aplicarRegraReembolso,
} from "../src/services/encaminhamento.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLANILHA = resolve(__dirname, "../../processos.xlsx");
if (!existsSync(PLANILHA)) {
  console.error(`Planilha não encontrada: ${PLANILHA} (conjunto local, não versionado)`);
  process.exit(1);
}

const db = new DatabaseSync(resolve(__dirname, "../prisma/dev.db"));
const wb = XLSX.readFile(PLANILHA);
const linhas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["Planilha3"], { header: 1, blankrows: false }).slice(1);

const semPrefixo = (s: string) => (s || "").replace(/^CREMEPE\//, "").trim();
function acerta(sugestao: string, correto: string): boolean {
  const a = semPrefixo(sugestao);
  const b = (correto || "").trim();
  return a === b || b.includes(a) || a.includes(b);
}

let acertosAntes = 0;
let acertosAgora = 0;

for (const row of linhas) {
  const [num, sugPlanilha, corr] = row as [string, string, string];
  const p = db.prepare("SELECT id FROM processes WHERE numero_sei=?").get(num) as { id: string } | undefined;
  if (!p) {
    console.log(`${num} | SEM PROCESSO NO BANCO`);
    continue;
  }
  const f = db.prepare("SELECT texto FROM process_resumo_fonte WHERE process_id=?").get(p.id) as
    | { texto: string }
    | undefined;
  const t = f ? f.texto : "";
  if (!t) {
    console.log(`${num} | SEM FONTE | corr=${corr}`);
    continue;
  }
  if (acerta(sugPlanilha, corr)) acertosAntes++;
  const regra = regraDeConteudo(t);
  let res = await sugerirEncaminhamento(t);
  res = await aplicarRegraReembolso(res, t);
  const top = (s: string | undefined) => semPrefixo(s || "-");
  const t1 = res.sugestoes[0];
  const ok = acerta(t1 ? t1.sigla : "", corr);
  if (ok) acertosAgora++;
  const top3 = res.sugestoes
    .slice(0, 3)
    .map((s) => `${top(s.sigla)}(${Math.round(s.peso * 100)}%)`)
    .join(" > ");
  const flag = ok ? "OK " : "ERR";
  console.log(
    `${flag} ${num} | corr=${corr.padEnd(20)} | atual=${top(t1 && t1.sigla).padEnd(20)} | planilhaAntiga=${top(sugPlanilha).padEnd(20)} | regra=${top(regra).padEnd(16)} est=${res.estrategia} | ${top3}`,
  );
}
console.log(`\nplanilha (sugestao antiga) acerta ${acertosAntes}/${linhas.length} | sistema ATUAL acerta ${acertosAgora}/${linhas.length}`);
