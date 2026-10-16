/**
 * Regressão das regras de domínio do encaminhamento: denúncias reais da base
 * local (processos cadastrados com fonte textual) + casos sintéticos por regra
 * + negativos (gate de descrição curta e "ressarcimento" fora do reembolso).
 *
 * Uso: cd backend && npm run testar:encaminhamento
 * Exige prisma/dev.db com as fontes textuais.
 */
import { DatabaseSync } from "node:sqlite";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import {
  sugerirEncaminhamento,
  aplicarRegraReembolso,
  eReembolso,
  regraDeConteudo,
} from "../src/services/encaminhamento.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(resolve(__dirname, "../prisma/dev.db"));
let pass = 0;
let fail = 0;

function ok(cond: boolean, nome: string, extra = "") {
  if (cond) {
    pass++;
    console.log(`OK  ${nome}`);
  } else {
    fail++;
    console.log(`ERR ${nome}${extra ? " -> " + extra : ""}`);
  }
}

function fonte(num: string): string | null {
  const p = db.prepare("SELECT id FROM processes WHERE numero_sei=?").get(num) as { id: string } | undefined;
  if (!p) return null;
  const f = db.prepare("SELECT texto FROM process_resumo_fonte WHERE process_id=?").get(p.id) as
    | { texto: string }
    | undefined;
  return f ? f.texto : null;
}

async function top(texto: string) {
  const r = await aplicarRegraReembolso(await sugerirEncaminhamento(texto), texto);
  const t = r.sugestoes[0];
  const s = r.sugestoes[1];
  return {
    estrategia: r.estrategia,
    motivo: r.motivoRegra,
    top: t ? t.sigla : "",
    seg: s ? s.sigla : "",
  };
}

// ---- Denúncias reais (fontes da base): GABIN em cima, DEPRO logo abaixo ----
const DENUNCIAS = [
  "26.17.000005394-4",
  "26.17.000005368-3",
  "26.17.000005407-1",
  "26.17.000005429-1",
  "26.17.000005431-3",
  "26.17.000005453-2",
];
for (const num of DENUNCIAS) {
  const t = fonte(num);
  if (!t) {
    console.log(`SKIP denuncia ${num} (ausente na base local)`);
    continue;
  }
  const r = await top(t);
  ok(
    r.top === "CREMEPE/PRESI/GABIN" && r.seg === "CREMEPE/COR/DEPRO" && r.motivo === "conteudo",
    `denuncia ${num} -> GABIN > DEPRO`,
    `${r.top} > ${r.seg} (${r.estrategia}/${r.motivo})`,
  );
}

// ---- Dobra de plantão (fontes reais): GABIN ----
const NAO_DOBRA = ["26.17.000005279-4", "26.17.000005297-2"];
for (const num of NAO_DOBRA) {
  const t = fonte(num);
  if (!t) {
    console.log(`SKIP nao-dobra ${num} (ausente na base local)`);
    continue;
  }
  const r = await top(t);
  ok(
    r.top === "CREMEPE/PRESI/GABIN" && r.motivo === "conteudo",
    `nao-dobra ${num} -> GABIN`,
    `${r.top} (${r.estrategia}/${r.motivo})`,
  );
}

// ---- Sintéticos: uma regra por caso (gate sempre verdadeiro: e-mail estruturado) ----
const EMAIL = (assunto: string, corpo: string) =>
  `Setor de Protocolo e Arquivo SEPROA <protocolo@cremepe.org.br>\n${assunto}\n1 mensagem\nJoao Silva\nPara: "protocolo@cremepe.org.br" <protocolo@cremepe.org.br>\n\n${corpo}`;

{
  const r = await top(EMAIL("Consulta sobre parecer", "Segue consulta para análise do colegiado."));
  ok(r.top === "CREMEPE/SECRET. G./SEBIB", "parecer/consulta -> SEBIB", r.top);
}
{
  const r = await top(EMAIL("Renovação carteira CIM", "Solicito renovação da carteira CIM do médico."));
  ok(r.top === "CREMEPE/SECRET. G./SEATE", "carteira CIM -> SEATE", r.top);
}
{
  const r = await top(EMAIL("Pagamento duplo da anuidade", "Houve pagamento duplo da anuidade no ano."));
  ok(r.top === "CREMEPE/TESOURARIA/SERECRED", "pagamento duplo -> SERECRED", r.top);
}
{
  const r = await top(EMAIL("Segunda via de certidão", "Preciso da segunda via da certidão."));
  ok(r.top === "CREMEPE/TESOURARIA/SECON", "segunda via -> SECON", r.top);
}
{
  const r = await top(EMAIL("Exclusão de débito", "Solicito exclusão de débito em aberto no sistema."));
  ok(r.top === "CREMEPE/TESOURARIA/SECON", "exclusão de débito -> SECON", r.top);
}
{
  const r = await top(
    EMAIL("Devolução de valores", "Solicito o reembolso do valor pago a mais na anuidade, com pix."),
  );
  ok(
    r.top === "CREMEPE/TESOURARIA/SECON" && r.motivo === "reembolso",
    "reembolso explícito -> SECON",
    `${r.top} (${r.motivo})`,
  );
}
{
  const r = await top(EMAIL("Denúncia de conduta", "Vem denúncia de conduta irregular de médico."));
  ok(r.top === "CREMEPE/PRESI/GABIN" && r.seg === "CREMEPE/COR/DEPRO", "denúncia sintética -> GABIN > DEPRO", `${r.top} > ${r.seg}`);
}
{
  const r = await top(
    EMAIL("Comunicação ao portal do CREMEPE", "Denúncia encaminhada pelo portal do CREMEPE pelo cidadão."),
  );
  ok(r.top === "CREMEPE/PRESI/GABIN", "denúncia pelo portal -> GABIN", r.top);
}
{
  const r = await top(EMAIL("Eleição Comitê de Ética Médica", "Convocação para eleição do Comitê de Ética Médica."));
  ok(r.top === "CREMEPE/VIP/CP/CEM", "comitê de ética -> CEM", r.top);
}
{
  const r = await top(
    EMAIL(
      "Requerimento de Autorização para Cessão Temporária de Útero",
      "Requerimento com fundamento na Res. CFM 2.320/2022.",
    ),
  );
  ok(r.top === "CREMEPE/SECRET. G./SEBIB", "cessão temporária de útero -> SEBIB", r.top);
}
{
  const r = await top(
    `REPÚBLICA FEDERATIVA DO BRASIL\nCADASTRO NACIONAL DA PESSOA JURÍDICA\nNÚMERO DE INSCRIÇÃO\n60.786.690/0001-88\nCOMPROVANTE DE INSCRIÇÃO E DE SITUAÇÃO CADASTRAL\nSITUAÇÃO CADASTRAL\nATIVA`,
  );
  ok(r.top === "CREMEPE/SECRET. G./SEATE", "CNPJ/cadastro -> SEATE", r.top);
}
{
  const r = await top(EMAIL("MPPE - Ofício de requisição", "Encaminho ofício do MPPE para conhecimento."));
  ok(r.top === "CREMEPE/PRESI/GABIN", "MPPE -> GABIN", r.top);
}
{
  const r = await top(EMAIL("TRAMITAR PARA O GABIN", "Seguem documentos para ciência da diretoria."));
  ok(r.top === "CREMEPE/PRESI/GABIN", "tramitar para o GABIN -> GABIN", r.top);
}
{
  const r = await top(
    EMAIL(
      "Declaração de não dobra",
      "Segue em anexo declaração para não dobrar plantão no Hospital X.",
    ),
  );
  ok(r.top === "CREMEPE/PRESI/GABIN", "não dobra de plantão -> GABIN", r.top);
}

// ---- Negativos: gate, ressarc e falso positivo interno ----
{
  const r = await top("Pedido de carteira");
  ok(r.estrategia !== "regra" || r.motivo !== "conteudo", "descrição curta não dispara regra", `${r.estrategia}/${r.motivo}`);
}
{
  const r = eReembolso("solicito o ressarcimento proporcional dos valores já pagos pela empresa");
  ok(r === false, "ressarcimento avulso NÃO é reembolso", String(r));
}
{
  // "Delegacia Regional" é unidade INTERNA do CREMEPE — não pode casar a regra
  // de expediente externo (regressão do 26.17.000005295-6).
  const r = regraDeConteudo(
    EMAIL(
      "CIM/CPM - 0041722 - PE LAURA ALMEIDA SOUZA DE OLIVEIRA",
      "Olá! Solicito o envio da doc de:\n0041722 - PE LAURA ALMEIDA SOUZA DE OLIVEIRA",
    ).replace(
      "Joao Silva",
      "Delegacia Regional Caruaru <regionalcaruaru@cremepe.org.br>",
    ),
  );
  ok(r !== "CREMEPE/PRESI/GABIN", "Delegacia Regional (unidade interna) NÃO dispara GABIN", String(r));
}

console.log(`\n${pass}/${pass + fail} testes passaram`);
if (fail > 0) process.exit(1);
