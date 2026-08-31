import { env } from "../config/env.js";

/**
 * Interface de saída do consultarProcedimento.
 * Mapeamento conforme SEI-WebServices-v3.1.pdf (RetornoConsultaProcedimento):
 *
 * Campos oficiais do v3.1:
 *   IdProcedimento, ProcedimentoFormatado, Especificacao, DataAutuacao,
 *   LinkAcesso, TipoProcedimento{IdTipoProcedimento, Nome},
 *   AndamentoGeracao{Descricao, DataHora, Unidade, Usuario},
 *   UltimoAndamento{...}, UnidadesProcedimentoAberto[],
 *   Assuntos[{CodigoEstruturado, Descricao}],
 *   Interessados[{Sigla, Nome}], Observacoes[{Descricao, Unidade}],
 *   ProcedimentosRelacionados[], ProcedimentosAnexados[]
 *
 * Extensão CFM (não padrão v3.1, mas presente em respostas reais):
 *   UnidadeAtual{IdUnidade, Sigla, Descricao}
 *   NivelAcesso (apenas em retornos de algumas instâncias)
 */
export interface SeiProcesso {
  IdProcedimento: string;
  ProcedimentoFormatado: string; // Número do processo visível ao usuário
  Especificacao: string;
  DataAutuacao: string;
  LinkAcesso: string;
  TipoProcedimento: { IdTipoProcedimento: string; Nome: string } | null;
  AndamentoGeracao: {
    Descricao: string;
    DataHora: string;
    Unidade: { IdUnidade: string; Sigla: string; Descricao: string } | null;
    Usuario: { Sigla: string; Nome: string } | null;
  } | null;
  UltimoAndamento: {
    Descricao: string;
    DataHora: string;
    Unidade: { IdUnidade: string; Sigla: string; Descricao: string } | null;
    Usuario: { Sigla: string; Nome: string } | null;
  } | null;
  UnidadesProcedimentoAberto: {
    Unidade: { IdUnidade: string; Sigla: string; Descricao: string };
  }[];
  Assuntos: { CodigoEstruturado: string; Descricao: string }[];
  Interessados: { Sigla: string; Nome: string }[];
  Observacoes: any[];
  ProcedimentosRelacionados: any[];
  ProcedimentosAnexados: any[];
  // Extensão CFM: não documentada no v3.1 mas presente em respostas reais
  UnidadeAtual: { IdUnidade: string; Sigla: string; Descricao: string } | null;
}

export interface Unidade {
  IdUnidade: string;
  Sigla: string;
  Descricao: string;
}

const NS_RE = "(?:[\\w.-]*:)?";

function buildSoapEnvelope(numeroProcesso: string, idUnidade: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                  xmlns:sei="Sei">
  <soapenv:Header/>
  <soapenv:Body>
    <sei:consultarProcedimento soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
      <SiglaSistema>${env.SEI_SIGLA_SISTEMA}</SiglaSistema>
      <IdentificacaoServico>${env.SEI_IDENTIFICACAO_SERVICO}</IdentificacaoServico>
      <IdUnidade>${idUnidade}</IdUnidade>
      <ProtocoloProcedimento>${numeroProcesso}</ProtocoloProcedimento>
      <SinRetornarAssuntos xsi:type="xsd:string">S</SinRetornarAssuntos>
      <SinRetornarInteressados xsi:type="xsd:string">S</SinRetornarInteressados>
      <SinRetornarObservacoes xsi:type="xsd:string">S</SinRetornarObservacoes>
      <SinRetornarAndamentoGeracao xsi:type="xsd:string">S</SinRetornarAndamentoGeracao>
      <SinRetornarAndamentoConclusao xsi:type="xsd:string">S</SinRetornarAndamentoConclusao>
      <SinRetornarUltimoAndamento xsi:type="xsd:string">S</SinRetornarUltimoAndamento>
      <SinRetornarUnidadesProcedimentoAberto xsi:type="xsd:string">S</SinRetornarUnidadesProcedimentoAberto>
      <SinRetornarProcedimentosRelacionados xsi:type="xsd:string">S</SinRetornarProcedimentosRelacionados>
      <SinRetornarProcedimentosAnexados xsi:type="xsd:string">S</SinRetornarProcedimentosAnexados>
    </sei:consultarProcedimento>
  </soapenv:Body>
</soapenv:Envelope>`;
}

/** Envelope SOAP simples para listarUnidades (apenas credenciais). */
function buildListarUnidadesEnvelope(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                  xmlns:sei="Sei">
  <soapenv:Header/>
  <soapenv:Body>
    <sei:listarUnidades soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
      <SiglaSistema>${env.SEI_SIGLA_SISTEMA}</SiglaSistema>
      <IdentificacaoServico>${env.SEI_IDENTIFICACAO_SERVICO}</IdentificacaoServico>
    </sei:listarUnidades>
  </soapenv:Body>
</soapenv:Envelope>`;
}

/** Executa uma chamada SOAP ao SEI e devolve o XML da resposta. */
async function fetchSoap(soapBody: string, soapAction: string): Promise<string> {
  const response = await fetch(env.SEI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: soapAction,
    },
    body: soapBody,
    signal: AbortSignal.timeout(12000),
  });

  const xml = await response.text();

  if (!response.ok && !xml.includes("<faultstring>")) {
    throw new Error(
      `Erro HTTP ao consultar SEI: ${response.status} ${response.statusText}` +
      (xml ? ` - ${xml.substring(0, 500)}` : "")
    );
  }

  return xml;
}

/** Parseia as unidades do retorno de listarUnidades (formato NuSOAP: <item>). */
function parseUnidades(xml: string): Unidade[] {
  const unidades: Unidade[] = [];
  const returnMatch = xml.match(/<(?:\w[\w.-]*:)?return\s*>([\s\S]*?)<\/(?:\w[\w.-]*:)?return\s*>/);
  const body = returnMatch ? returnMatch[1] : xml;

  const itemRe = new RegExp(`<${NS_RE}item\\b[^>]*>([\\s\\S]*?)<\\/${NS_RE}item>`, "g");
  let im;
  while ((im = itemRe.exec(body)) !== null) {
    const inner = im[1];
    const uaBlock = inner.match(new RegExp(`<${NS_RE}Unidade\\b[^>]*>([\\s\\S]*?)<\\/${NS_RE}Unidade>`));
    const bloco = uaBlock ? uaBlock[1] : inner;
    const get = (t: string) => {
      const m = bloco.match(new RegExp(`<${NS_RE}${t}\\b[^>]*>([^<]*)<\\/${NS_RE}${t}>`));
      return m ? m[1].trim() : "";
    };
    unidades.push({
      IdUnidade: get("IdUnidade"),
      Sigla: get("Sigla"),
      Descricao: get("Descricao"),
    });
  }

  // Fallback: se não houver wrapper <Unidade>, tenta ler elementos diretos
  if (unidades.length === 0 && body.includes("<IdUnidade>")) {
    const unidadeRe = new RegExp(`<${NS_RE}Unidade\\b[^>]*>([\\s\\S]*?)<\\/${NS_RE}Unidade>`, "g");
    let um: RegExpExecArray | null;
    while ((um = unidadeRe.exec(body)) !== null) {
      const blocoInner = um[1];
      const get = (t: string) => {
        const m = blocoInner.match(new RegExp(`<${NS_RE}${t}\\b[^>]*>([^<]*)<\\/${NS_RE}${t}>`));
        return m ? m[1].trim() : "";
      };
      unidades.push({ IdUnidade: get("IdUnidade"), Sigla: get("Sigla"), Descricao: get("Descricao") });
    }
  }

  return unidades;
}

let unidadesCache: Unidade[] | null = null;
let unidadesCacheAt = 0;
const UNIDADES_TTL = 5 * 60 * 1000;

/**
 * Lista as unidades acessíveis ao serviço e retorna apenas aquelas cuja sigla
 * começa com "CREMEPE". O resultado é cacheado por alguns minutos para evitar
 * chamadas excessivas ao WebService.
 */
export async function listarUnidades(force = false): Promise<Unidade[]> {
  if (!force && unidadesCache && Date.now() - unidadesCacheAt < UNIDADES_TTL) {
    return unidadesCache;
  }

  const xml = await fetchSoap(buildListarUnidadesEnvelope(), "Sei#listarUnidades");

  if (xml.includes("<faultstring>")) {
    const m = xml.match(/<faultstring>([\s\S]*?)<\/faultstring>/);
    throw new Error(`Erro SEI ao listar unidades: ${m ? m[1].trim() : "erro desconhecido"}`);
  }

  const todas = parseUnidades(xml);
  unidadesCache = todas.filter((u) => u.Sigla.toUpperCase().startsWith("CREMEPE"));
  unidadesCacheAt = Date.now();
  return unidadesCache;
}

/** Extract a single leaf text element from a string, namespace-agnostic */
function getTag(xml: string, tag: string): string {
  const re = new RegExp(
    `<${NS_RE}${tag}\\b[^>]*>([\\s\\S]*?)<\\/${NS_RE}${tag}>`
  );
  const m = xml.match(re);
  return m ? m[1].trim() : "";
}

/** Extract the body content from a SOAP response, trying multiple wrapper formats */
function extractBody(xml: string): string {
  // 1. Try standard NuSOAP response: <consultarProcedimentoResponse><return>...</return>
  const returnMatch = xml.match(
    /<(?:\w[\w.-]*:)?consultarProcedimentoResponse(?:\s[^>]*)?>\s*<(?:\w[\w.-]*:)?return\s*>([\s\S]*?)<\/(?:\w[\w.-]*:)?return\s*>/
  );
  if (returnMatch) return returnMatch[1];

  // 2. Try SOAP body fallback: look for <Body>...</Body>
  const bodyMatch = xml.match(
    /<(?:\w[\w.-]*:)?Body(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w[\w.-]*:)?Body\s*>/
  );
  if (bodyMatch) return bodyMatch[1];

  // 3. Fall back to entire XML (for simple responses)
  return xml;
}

/** Parse Andamento v3.1: Descricao, DataHora, Unidade{IdUnidade,Sigla,Descricao}, Usuario{Sigla,Nome} */
function parseAndamento(xml: string, tag: string): any {
  const blockRe = new RegExp(
    `<${NS_RE}${tag}\\b[^>]*>([\\s\\S]*?)<\\/${NS_RE}${tag}>`
  );
  const blockMatch = xml.match(blockRe);
  if (!blockMatch) return null;
  const inner = blockMatch[1];

  const get = (t: string) => {
    const m = inner.match(
      new RegExp(`<${NS_RE}${t}\\b[^>]*>([^<]*)<\\/${NS_RE}${t}>`)
    );
    return m ? m[1].trim() : "";
  };

  // Parse nested Unidade structure (v3.1: IdUnidade, Sigla, Descricao)
  const unidadeBlock = inner.match(
    new RegExp(`<${NS_RE}Unidade\\b[^>]*>([\\s\\S]*?)<\\/${NS_RE}Unidade>`)
  );
  let unidade = null;
  if (unidadeBlock) {
    const ui = unidadeBlock[1];
    const uidM = ui.match(new RegExp(`<${NS_RE}IdUnidade\\b[^>]*>([^<]*)<\\/${NS_RE}IdUnidade>`));
    const sigM = ui.match(new RegExp(`<${NS_RE}Sigla\\b[^>]*>([^<]*)<\\/${NS_RE}Sigla>`));
    const descM = ui.match(new RegExp(`<${NS_RE}Descricao\\b[^>]*>([^<]*)<\\/${NS_RE}Descricao>`));
    unidade = {
      IdUnidade: uidM ? uidM[1].trim() : "",
      Sigla: sigM ? sigM[1].trim() : "",
      Descricao: descM ? descM[1].trim() : "",
    };
  }

  // Parse nested Usuario structure (v3.1: Sigla, Nome)
  const usuarioBlock = inner.match(
    new RegExp(`<${NS_RE}Usuario\\b[^>]*>([\\s\\S]*?)<\\/${NS_RE}Usuario>`)
  );
  let usuario = null;
  if (usuarioBlock) {
    const ui = usuarioBlock[1];
    const sigM = ui.match(new RegExp(`<${NS_RE}Sigla\\b[^>]*>([^<]*)<\\/${NS_RE}Sigla>`));
    const nomM = ui.match(new RegExp(`<${NS_RE}Nome\\b[^>]*>([^<]*)<\\/${NS_RE}Nome>`));
    usuario = {
      Sigla: sigM ? sigM[1].trim() : "",
      Nome: nomM ? nomM[1].trim() : "",
    };
  }

  // Fallback: flat SiglaUnidade / NomeUsuario (some SEI instances)
  const siglaUnidade = unidade?.Sigla || get("SiglaUnidade") || "";
  const nomeUnidade = unidade?.Descricao || get("NomeUnidade") || "";
  const nomeUsuario = usuario?.Nome || get("NomeUsuario") || "";

  return {
    Descricao: get("Descricao"),
    DataHora: get("DataHora"),
    Unidade: unidade || (siglaUnidade ? {
      IdUnidade: "",
      Sigla: siglaUnidade,
      Descricao: nomeUnidade,
    } : null),
    Usuario: usuario || (nomeUsuario ? { Sigla: "", Nome: nomeUsuario } : null),
  };
}

function parseSoapResponse(xml: string): SeiProcesso {
  // Check for SOAP fault
  const faultMatch = xml.match(/<faultstring>([\s\S]*?)<\/faultstring>/);
  if (faultMatch) {
    throw new Error(`Erro SEI: ${faultMatch[1].trim()}`);
  }

  const body = extractBody(xml);

  // Parse Assuntos v3.1: {CodigoEstruturado, Descricao}
  const assuntos: SeiProcesso["Assuntos"] = [];
  const assuntoRe = new RegExp(`<${NS_RE}Assunto\\b[^>]*>([\\s\\S]*?)<\\/${NS_RE}Assunto>`, "g");
  let am;
  while ((am = assuntoRe.exec(body)) !== null) {
    const inner = am[1];
    const codigo = inner.match(new RegExp(`<${NS_RE}CodigoEstruturado\\b[^>]*>([^<]*)<\\/${NS_RE}CodigoEstruturado>`));
    const desc = inner.match(new RegExp(`<${NS_RE}Descricao\\b[^>]*>([^<]*)<\\/${NS_RE}Descricao>`));
    assuntos.push({
      CodigoEstruturado: codigo ? codigo[1].trim() : "",
      Descricao: desc ? desc[1].trim() : "",
    });
  }

  // Parse Interessados v3.1: {Sigla, Nome}
  const interessados: SeiProcesso["Interessados"] = [];
  const intRe = new RegExp(`<${NS_RE}Interessado\\b[^>]*>([\\s\\S]*?)<\\/${NS_RE}Interessado>`, "g");
  let im;
  while ((im = intRe.exec(body)) !== null) {
    const inner = im[1];
    const sigla = inner.match(new RegExp(`<${NS_RE}Sigla\\b[^>]*>([^<]*)<\\/${NS_RE}Sigla>`));
    const nome = inner.match(new RegExp(`<${NS_RE}Nome\\b[^>]*>([^<]*)<\\/${NS_RE}Nome>`));
    // Fallback to `np` (some SEI instances)
    const np = inner.match(new RegExp(`<${NS_RE}np\\b[^>]*>([^<]*)<\\/${NS_RE}np>`));
    interessados.push({
      Sigla: sigla ? sigla[1].trim() : (np ? np[1].trim() : ""),
      Nome: nome ? nome[1].trim() : "",
    });
  }

  // Parse TipoProcedimento v3.1: nested {IdTipoProcedimento, Nome}
  let tipoProcedimento: SeiProcesso["TipoProcedimento"] = null;
  const tipoBlock = body.match(
    new RegExp(`<${NS_RE}TipoProcedimento\\b[^>]*>([\\s\\S]*?)<\\/${NS_RE}TipoProcedimento>`)
  );
  if (tipoBlock) {
    const ti = tipoBlock[1];
    const idMatch = ti.match(new RegExp(`<${NS_RE}IdTipoProcedimento\\b[^>]*>([^<]*)<\\/${NS_RE}IdTipoProcedimento>`));
    const nomeMatch = ti.match(new RegExp(`<${NS_RE}Nome\\b[^>]*>([^<]*)<\\/${NS_RE}Nome>`));
    tipoProcedimento = {
      IdTipoProcedimento: idMatch ? idMatch[1].trim() : "",
      Nome: nomeMatch ? nomeMatch[1].trim() : "",
    };
  }
  // Fallback: flat TipoProcedimentoSigla / TipoProcedimentoNome (some SEI instances)
  if (!tipoProcedimento) {
    const sigla = getTag(body, "TipoProcedimentoSigla");
    const nome = getTag(body, "TipoProcedimentoNome");
    if (sigla || nome) {
      tipoProcedimento = { IdTipoProcedimento: sigla, Nome: nome };
    }
  }

  // Parse UnidadeAtual (CFM extension, not in v3.1 spec)
  let unidadeAtual: SeiProcesso["UnidadeAtual"] = null;
  const uaBlock = body.match(
    new RegExp(`<${NS_RE}UnidadeAtual\\b[^>]*>([\\s\\S]*?)<\\/${NS_RE}UnidadeAtual>`)
  );
  if (uaBlock) {
    const ui = uaBlock[1];
    const idM = ui.match(new RegExp(`<${NS_RE}IdUnidade\\b[^>]*>([^<]*)<\\/${NS_RE}IdUnidade>`));
    const sigM = ui.match(new RegExp(`<${NS_RE}Sigla\\b[^>]*>([^<]*)<\\/${NS_RE}Sigla>`));
    const descM = ui.match(new RegExp(`<${NS_RE}Descricao\\b[^>]*>([^<]*)<\\/${NS_RE}Descricao>`));
    unidadeAtual = {
      IdUnidade: idM ? idM[1].trim() : "",
      Sigla: sigM ? sigM[1].trim() : "",
      Descricao: descM ? descM[1].trim() : "",
    };
  }

  return {
    IdProcedimento: getTag(body, "IdProcedimento"),
    ProcedimentoFormatado:
      getTag(body, "ProcedimentoFormatado") || getTag(body, "ProtocoloProcedimento"),
    Especificacao: getTag(body, "Especificacao"),
    DataAutuacao: getTag(body, "DataAutuacao"),
    LinkAcesso: getTag(body, "LinkAcesso"),
    TipoProcedimento: tipoProcedimento,
    AndamentoGeracao: parseAndamento(body, "AndamentoGeracao"),
    UltimoAndamento: parseAndamento(body, "UltimoAndamento"),
    UnidadesProcedimentoAberto: [], // parsed below
    Assuntos: assuntos,
    Interessados: interessados,
    Observacoes: [],
    ProcedimentosRelacionados: [],
    ProcedimentosAnexados: [],
    UnidadeAtual: unidadeAtual,
  };
}

export async function consultarProcedimento(
  numeroProcesso: string
): Promise<SeiProcesso> {
  // Define as unidades nas quais a busca será feita. Sem unidade padrão:
  // busca em todas as unidades CREMEPE retornadas por listarUnidades.
  // Se SEI_ID_UNIDADE estiver preenchido, restringe a essa unidade.
  let unidades: Unidade[];
  if (env.SEI_ID_UNIDADE) {
    unidades = [{ IdUnidade: env.SEI_ID_UNIDADE, Sigla: env.SEI_ID_UNIDADE, Descricao: "" }];
  } else {
    try {
      unidades = await listarUnidades();
    } catch (err: any) {
      // Se não for possível listar unidades, nem há unidade padrão, não há
      // como consultar o SEI.
      throw new Error(`Não foi possível obter as unidades do SEI: ${err.message}`);
    }
  }

  if (unidades.length === 0) {
    throw new Error("Nenhuma unidade CREMEPE disponível para consulta no SEI.");
  }

  let lastError: Error | null = null;

  for (const unidade of unidades) {
    // Envia para cada unidade e interrompe assim que encontrar o processo
    // (parseSoapResponse lança erro quando o processo não existe na unidade).
    try {
      const soapBody = buildSoapEnvelope(numeroProcesso, unidade.IdUnidade);
      const xml = await fetchSoap(soapBody, "Sei#consultarProcedimento");
      return parseSoapResponse(xml);
    } catch (err: any) {
      lastError = err;
      // Continua tentando nas demais unidades.
    }
  }

  throw lastError || new Error("Processo não encontrado no SEI.");
}
