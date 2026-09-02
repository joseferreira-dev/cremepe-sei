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
  NivelAcesso: string;
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
  ProcedimentosRelacionados: ProcedimentoResumido[];
  ProcedimentosAnexados: ProcedimentoResumido[];
  // Extensão CFM: não documentada no v3.1 mas presente em respostas reais
  UnidadeAtual: { IdUnidade: string; Sigla: string; Descricao: string } | null;
}

export interface Unidade {
  IdUnidade: string;
  Sigla: string;
  Descricao: string;
}

export interface ProcedimentoResumido {
  IdProcedimento: string;
  ProcedimentoFormatado: string;
  TipoProcedimento: { IdTipoProcedimento: string; Nome: string } | null;
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

function buildConsultarDocumentoEnvelope(protocoloDocumento: string, idUnidade: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                  xmlns:sei="Sei">
  <soapenv:Header/>
  <soapenv:Body>
    <sei:consultarDocumento soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
      <SiglaSistema>${env.SEI_SIGLA_SISTEMA}</SiglaSistema>
      <IdentificacaoServico>${env.SEI_IDENTIFICACAO_SERVICO}</IdentificacaoServico>
      <IdUnidade>${idUnidade}</IdUnidade>
      <ProtocoloDocumento>${protocoloDocumento}</ProtocoloDocumento>
      <SinRetornarAssinaturas xsi:type="xsd:string">N</SinRetornarAssinaturas>
      <SinRetornarPublicacao xsi:type="xsd:string">N</SinRetornarPublicacao>
      <SinRetornarDetalhes xsi:type="xsd:string">S</SinRetornarDetalhes>
    </sei:consultarDocumento>
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
 * Monta a lista de unidades para busca de andamentos/documentos.
 * Prioridade: unidadeSincronizacao > abertas > todas.
 */
export function montarUnidadesParaBusca(
  unidadeSincronizacao: string | null | undefined,
  unidadesAbertas: { id: string; sigla: string; descricao: string }[],
  todasUnidades: Unidade[],
): { IdUnidade: string; Sigla: string; Descricao: string }[] {
  const resultado: { IdUnidade: string; Sigla: string; Descricao: string }[] = [];
  const vistos = new Set<string>();

  const adicionar = (u: { IdUnidade: string; Sigla: string; Descricao: string }) => {
    if (!vistos.has(u.IdUnidade)) {
      vistos.add(u.IdUnidade);
      resultado.push(u);
    }
  };

  // 1. Unidade que funcionou na última sincronização
  if (unidadeSincronizacao) {
    try {
      const anteriores: { id: string }[] = JSON.parse(unidadeSincronizacao);
      for (const u of anteriores) {
        adicionar({ IdUnidade: u.id, Sigla: "CREMEPE", Descricao: "" });
      }
    } catch {
      adicionar({ IdUnidade: unidadeSincronizacao, Sigla: "CREMEPE", Descricao: "" });
    }
  }

  // 2. Unidades abertas no SEI
  for (const u of unidadesAbertas) {
    adicionar({ IdUnidade: u.id, Sigla: u.sigla, Descricao: u.descricao });
  }

  // 3. Todas as unidades CREMEPE
  for (const u of todasUnidades) {
    adicionar({ IdUnidade: u.IdUnidade, Sigla: u.Sigla, Descricao: u.Descricao });
  }

  return resultado;
}

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

export interface UsuarioSei {
  IdUsuario: string;
  Sigla: string;
  Nome: string;
}

function buildListarUsuariosEnvelope(idUnidade: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                  xmlns:sei="Sei">
  <soapenv:Header/>
  <soapenv:Body>
    <sei:listarUsuarios soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
      <SiglaSistema>${env.SEI_SIGLA_SISTEMA}</SiglaSistema>
      <IdentificacaoServico>${env.SEI_IDENTIFICACAO_SERVICO}</IdentificacaoServico>
      <IdUnidade>${idUnidade}</IdUnidade>
    </sei:listarUsuarios>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function parseUsuarios(xml: string): UsuarioSei[] {
  const usuarios: UsuarioSei[] = [];
  const returnMatch = xml.match(/<(?:\w[\w.-]*:)?return\s*>([\s\S]*?)<\/(?:\w[\w.-]*:)?return\s*>/);
  const body = returnMatch ? returnMatch[1] : xml;

  const itemRe = new RegExp(`<${NS_RE}item\\b[^>]*>([\\s\\S]*?)<\\/${NS_RE}item>`, "g");
  let im;
  while ((im = itemRe.exec(body)) !== null) {
    const inner = im[1];
    const get = (t: string) => {
      const m = inner.match(new RegExp(`<${NS_RE}${t}\\b[^>]*>([^<]*)<\\/${NS_RE}${t}>`));
      return m ? m[1].trim() : "";
    };
    const sigla = get("Sigla");
    if (sigla) {
      usuarios.push({
        IdUsuario: get("IdUsuario"),
        Sigla: sigla,
        Nome: get("Nome"),
      });
    }
  }

  if (usuarios.length === 0 && body.includes("<Sigla>")) {
    const userRe = new RegExp(`<${NS_RE}Usuario\\b[^>]*>([\\s\\S]*?)<\\/${NS_RE}Usuario>`, "g");
    let um: RegExpExecArray | null;
    while ((um = userRe.exec(body)) !== null) {
      const inner = um[1];
      const get = (t: string) => {
        const m = inner.match(new RegExp(`<${NS_RE}${t}\\b[^>]*>([^<]*)<\\/${NS_RE}${t}>`));
        return m ? m[1].trim() : "";
      };
      const sigla = get("Sigla");
      if (sigla) {
        usuarios.push({ IdUsuario: get("IdUsuario"), Sigla: sigla, Nome: get("Nome") });
      }
    }
  }

  return usuarios;
}

export async function listarUsuariosPorUnidade(idUnidade: string): Promise<UsuarioSei[]> {
  const xml = await fetchSoap(buildListarUsuariosEnvelope(idUnidade), "Sei#listarUsuarios");

  if (xml.includes("<faultstring>")) {
    const m = xml.match(/<faultstring>([\s\S]*?)<\/faultstring>/);
    throw new Error(`Erro SEI ao listar usuários: ${m ? m[1].trim() : "erro desconhecido"}`);
  }

  return parseUsuarios(xml);
}

export async function buscarUnidadesDoUsuario(siglaUsuario: string): Promise<Unidade[]> {
  const unidades = await listarUnidades();
  const unidadesDoUsuario: Unidade[] = [];

  for (const unidade of unidades) {
    try {
      const usuarios = await listarUsuariosPorUnidade(unidade.IdUnidade);
      const encontrado = usuarios.some(
        (u) => u.Sigla.toUpperCase() === siglaUsuario.toUpperCase()
      );
      if (encontrado) {
        unidadesDoUsuario.push(unidade);
      }
    } catch {
      // Unidade sem acesso, ignora
    }
  }

  return unidadesDoUsuario;
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

/** Parseia lista de ProcedimentoResumido (usado em ProcedimentosRelacionados e Anexados) */
function parseProcedimentosResumidos(body: string, tag: string): ProcedimentoResumido[] {
  const result: ProcedimentoResumido[] = [];
  const sectionRe = new RegExp(`<${NS_RE}${tag}\\b[^>]*>([\\s\\S]*?)<\\/${NS_RE}${tag}>`);
  const sectionMatch = body.match(sectionRe);
  if (!sectionMatch) return result;

  const inner = sectionMatch[1];
  const itemRe = new RegExp(`<${NS_RE}item\\b[^>]*>([\\s\\S]*?)<\\/${NS_RE}item>`, "g");
  let im;
  while ((im = itemRe.exec(inner)) !== null) {
    const item = im[1];
    const get = (t: string) => {
      const m = item.match(new RegExp(`<${NS_RE}${t}\\b[^>]*>([^<]*)<\\/${NS_RE}${t}>`));
      return m ? m[1].trim() : "";
    };

    // TipoProcedimento pode ser nested
    let tipo: ProcedimentoResumido["TipoProcedimento"] = null;
    const tipoBlock = item.match(new RegExp(`<${NS_RE}TipoProcedimento\\b[^>]*>([\\s\\S]*?)<\\/${NS_RE}TipoProcedimento>`));
    if (tipoBlock) {
      const ti = tipoBlock[1];
      const idM = ti.match(new RegExp(`<${NS_RE}IdTipoProcedimento\\b[^>]*>([^<]*)<\\/${NS_RE}IdTipoProcedimento>`));
      const nomeM = ti.match(new RegExp(`<${NS_RE}Nome\\b[^>]*>([^<]*)<\\/${NS_RE}Nome>`));
      tipo = {
        IdTipoProcedimento: idM ? idM[1].trim() : "",
        Nome: nomeM ? nomeM[1].trim() : "",
      };
    }

    result.push({
      IdProcedimento: get("IdProcedimento"),
      ProcedimentoFormatado: get("ProcedimentoFormatado"),
      TipoProcedimento: tipo,
    });
  }
  return result;
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

  // Parse UnidadesProcedimentoAberto: lista de unidades onde o processo está aberto
  const unidadesAbertas: SeiProcesso["UnidadesProcedimentoAberto"] = [];
  const uaListRe = new RegExp(`<${NS_RE}UnidadesProcedimentoAberto\\b[^>]*>([\\s\\S]*?)<\\/${NS_RE}UnidadesProcedimentoAberto>`);
  const uaListMatch = body.match(uaListRe);
  if (uaListMatch) {
    const uaBody = uaListMatch[1];
    const itemRe = new RegExp(`<${NS_RE}item\\b[^>]*>([\\s\\S]*?)<\\/${NS_RE}item>`, "g");
    let uim;
    while ((uim = itemRe.exec(uaBody)) !== null) {
      const inner = uim[1];
      const unidadeBlock = inner.match(new RegExp(`<${NS_RE}Unidade\\b[^>]*>([\\s\\S]*?)<\\/${NS_RE}Unidade>`));
      const bloco = unidadeBlock ? unidadeBlock[1] : inner;
      const get = (t: string) => {
        const m = bloco.match(new RegExp(`<${NS_RE}${t}\\b[^>]*>([^<]*)<\\/${NS_RE}${t}>`));
        return m ? m[1].trim() : "";
      };
      unidadesAbertas.push({
        Unidade: {
          IdUnidade: get("IdUnidade"),
          Sigla: get("Sigla"),
          Descricao: get("Descricao"),
        },
      });
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
    LinkAcesso: getTag(body, "LinkAcesso").replace(/&amp;/g, "&"),
    NivelAcesso: formatNivelAcesso(getTag(body, "NivelAcessoLocal"), getTag(body, "NivelAcessoGlobal")),
    TipoProcedimento: tipoProcedimento,
    AndamentoGeracao: parseAndamento(body, "AndamentoGeracao"),
    UltimoAndamento: parseAndamento(body, "UltimoAndamento"),
    UnidadesProcedimentoAberto: unidadesAbertas,
    Assuntos: assuntos,
    Interessados: interessados,
    Observacoes: [],
    ProcedimentosRelacionados: parseProcedimentosResumidos(body, "ProcedimentosRelacionados"),
    ProcedimentosAnexados: parseProcedimentosResumidos(body, "ProcedimentosAnexados"),
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

export interface Andamento {
  IdAndamento: string;
  Descricao: string;
  DataHora: string;
  Usuario: { Sigla: string; Nome: string } | null;
  Unidade: { IdUnidade: string; Sigla: string; Descricao: string } | null;
}

function buildListarAndamentosEnvelope(
  idUnidade: string,
  protocoloProcedimento: string
): string {
  // IDs de tarefas internas do SEI (reservadas < 1000). Envia um amplo
  // conjunto para obter todos os tipos de andamento.
  const tarefas = Array.from({ length: 50 }, (_, i) => i + 1);
  const tarefasXml = tarefas
    .map((t) => `<item xsi:type="xsd:string">${t}</item>`)
    .join("\n        ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                  xmlns:sei="Sei">
  <soapenv:Header/>
  <soapenv:Body>
    <sei:listarAndamentos soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
      <SiglaSistema>${env.SEI_SIGLA_SISTEMA}</SiglaSistema>
      <IdentificacaoServico>${env.SEI_IDENTIFICACAO_SERVICO}</IdentificacaoServico>
      <IdUnidade>${idUnidade}</IdUnidade>
      <ProtocoloProcedimento>${protocoloProcedimento}</ProtocoloProcedimento>
      <Tarefas xsi:type="sei:ArrayOfTarefas">
        ${tarefasXml}
      </Tarefas>
      <SinRetornarAtributos xsi:type="xsd:string">N</SinRetornarAtributos>
    </sei:listarAndamentos>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function parseAndamentos(xml: string): Andamento[] {
  const andamentos: Andamento[] = [];

  // Tenta múltiplos wrappers: <return>, <parametros>, ou o corpo inteiro
  const returnMatch = xml.match(/<(?:\w[\w.-]*:)?return\s*>([\s\S]*?)<\/(?:\w[\w.-]*:)?return\s*>/);
  const paramMatch = xml.match(/<(?:\w[\w.-]*:)?parametros[^>]*>([\s\S]*?)<\/(?:\w[\w.-]*:)?parametros\s*>/);
  const body = returnMatch ? returnMatch[1] : paramMatch ? paramMatch[1] : xml;

  const itemRe = new RegExp(`<${NS_RE}item\\b[^>]*>([\\s\\S]*?)<\\/${NS_RE}item>`, "g");
  let im;
  while ((im = itemRe.exec(body)) !== null) {
    const inner = im[1];
    const get = (t: string) => {
      const m = inner.match(new RegExp(`<${NS_RE}${t}\\b[^>]*>([^<]*)<\\/${NS_RE}${t}>`));
      return m ? m[1].trim() : "";
    };

    const unidadeBlock = inner.match(new RegExp(`<${NS_RE}Unidade\\b[^>]*>([\\s\\S]*?)<\\/${NS_RE}Unidade>`));
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

    const usuarioBlock = inner.match(new RegExp(`<${NS_RE}Usuario\\b[^>]*>([\\s\\S]*?)<\\/${NS_RE}Usuario>`));
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

    andamentos.push({
      IdAndamento: get("IdAndamento"),
      Descricao: stripHtml(get("Descricao")),
      DataHora: get("DataHora"),
      Usuario: usuario,
      Unidade: unidade,
    });
  }

  return andamentos;
}

/**
 * Lista todos os andamentos de um processo, buscando em todas as unidades
 * onde ele está aberto. Retorna a lista consolidada e ordenada por data.
 */
export async function listarAndamentos(
  numeroProcesso: string,
  unidades: Unidade[]
): Promise<Andamento[]> {
  const allAndamentos: Andamento[] = [];

  for (const unidade of unidades) {
    try {
      const soapBody = buildListarAndamentosEnvelope(unidade.IdUnidade, numeroProcesso);
      const xml = await fetchSoap(soapBody, "Sei#listarAndamentos");

      if (xml.includes("<faultstring>")) {
        continue; // Unidade não tem acesso, ignora
      }

      const andamentos = parseAndamentos(xml);
      allAndamentos.push(...andamentos);
    } catch {
      // Falha ao buscar andamentos desta unidade, ignora
    }
  }

  // Remove duplicatas por IdAndamento e ordena por data (mais recente primeiro)
  const seen = new Set<string>();
  const unique = allAndamentos.filter((a) => {
    if (seen.has(a.IdAndamento)) return false;
    seen.add(a.IdAndamento);
    return true;
  });

  unique.sort((a, b) => {
    const da = parseSEIDate(a.DataHora);
    const db = parseSEIDate(b.DataHora);
    return db - da;
  });

  return unique;
}

/** Converte data SEI "DD/MM/AAAA HH:mm:ss" para timestamp numérico */
function parseSEIDate(s: string): number {
  if (!s) return 0;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const [, d, mo, y, hh, mm, ss] = m;
    return new Date(`${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}T${hh.padStart(2, "0")}:${mm}:${ss || "00"}`).getTime();
  }
  return new Date(s).getTime() || 0;
}

/** Decodifica entidades HTML comuns (&lt; &gt; &amp; &quot; &apos;) */
function decodeHtmlEntities(s: string): string {
  if (!s) return s;
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

/** Remove tags HTML de uma string, preservando só o texto */
function stripHtml(s: string): string {
  if (!s) return s;
  return decodeHtmlEntities(s).replace(/<[^>]*>/g, "").trim();
}

/**
 * Determina se um processo está concluído.
 *
 * Regras:
 * 1. Se tem unidades abertas → NÃO está concluído
 * 2. Se o último andamento contém "Conclusão do processo na unidade" → CONCLUÍDO
 * 3. Se está anexado a processos pai:
 *    - Se TODOS os pais são concluídos → CONCLUÍDO (filho deixa de ser administrado)
 *    - Se algum pai NÃO é concluído → NÃO está concluído
 */
export function isProcessoConcluido(
  unidades: { id: string; sigla: string; descricao: string }[],
  ultimoAndamento: { descricao: string } | null,
  procedimentosRelacionados: { id: string; numero: string; tipo: string }[],
  procedimentosAnexados: { id: string; numero: string; tipo: string }[],
  parentStatus?: Map<string, string>
): boolean {
  // Critério 1: se ainda tem unidades, não está concluído
  if (unidades.length > 0) return false;

  // Critério 2: último andamento menciona conclusão
  const desc = (ultimoAndamento?.descricao || "").toLowerCase();
  const temConclusao = desc.includes("conclusão do processo na unidade")
    || desc.includes("conclusao do processo na unidade");
  if (temConclusao) return true;

  // Critério 3: se está anexado a processos pai
  const anexadosNumeros = new Set(procedimentosAnexados.map((p) => p.numero));
  const pais = procedimentosRelacionados.filter((p) => !anexadosNumeros.has(p.numero));

  if (pais.length > 0 && parentStatus && parentStatus.size > 0) {
    // Se TODOS os pais são concluídos → o filho também é
    const todosPaisConcluidos = pais.every((p) => {
      const st = parentStatus.get(p.numero);
      return st === "finalizado";
    });
    if (todosPaisConcluidos) return true;
  }

  return false;
}

/** Converte código numérico de nível de acesso SEI em texto legível */
function formatNivelAcesso(local: string, global_: string): string {
  // NivelAcessoGlobal é o campo decisório:
  //   0 = Público (acesso irrestrito)
  //   1 = Restrito (acesso controlado)
  const code = global_ || local;
  const map: Record<string, string> = {
    "0": "Público",
    "1": "Restrito",
  };
  return map[code] || `Código ${code}`;
}

export interface SeiDocumento {
  IdDocumento: string;
  DocumentoFormatado: string;
  NomeSerie: string;
  DataDocumento: string;
  Descricao: string;
  LinkAcesso: string;
  Unidade: { IdUnidade: string; Sigla: string; Descricao: string } | null;
}

function parseSoapDocumento(xml: string): SeiDocumento {
  const returnMatch = xml.match(/<(?:\w[\w.-]*:)?return\s*>([\s\S]*?)<\/(?:\w[\w.-]*:)?return\s*>/);
  const body = returnMatch ? returnMatch[1] : xml;

  if (body.includes("<faultstring>")) {
    const faultMatch = body.match(/<faultstring>([\s\S]*?)<\/faultstring>/);
    throw new Error(faultMatch ? faultMatch[1].trim() : "Erro SOAP desconhecido");
  }

  if (!body.includes("IdDocumento")) {
    throw new Error("Documento não encontrado no SEI.");
  }

  const serieMatch = body.match(new RegExp(`<${NS_RE}Serie\\b[^>]*>[\\s\\S]*?<${NS_RE}Nome\\b[^>]*>([^<]*)<\\/${NS_RE}Nome>[\\s\\S]*?<\\/${NS_RE}Serie>`));
  const nomeArvore = getTag(body, "NomeArvore");
  const data = getTag(body, "Data");

  const descNilMatch = body.match(new RegExp(`<${NS_RE}Descricao\\b[^>]*xsi:nil="true"[^>]*/>`));
  const descricaoRaw = getTag(body, "Descricao");
  const descricao = descNilMatch ? "" : (descricaoRaw.includes("<") ? "" : descricaoRaw);

  return {
    IdDocumento: getTag(body, "IdDocumento"),
    DocumentoFormatado: getTag(body, "DocumentoFormatado"),
    NomeSerie: serieMatch ? serieMatch[1].trim() : "",
    DataDocumento: data,
    Descricao: descricao || nomeArvore,
    LinkAcesso: getTag(body, "LinkAcesso").replace(/&amp;/g, "&"),
    Unidade: (() => {
      const uaMatch = body.match(new RegExp(`<${NS_RE}UnidadeElaboradora\\b[^>]*>[\\s\\S]*?<\\/${NS_RE}UnidadeElaboradora>`));
      if (uaMatch) {
        const idM = uaMatch[0].match(new RegExp(`<${NS_RE}IdUnidade\\b[^>]*>([^<]*)<\\/${NS_RE}IdUnidade>`));
        const sigM = uaMatch[0].match(new RegExp(`<${NS_RE}Sigla\\b[^>]*>([^<]*)<\\/${NS_RE}Sigla>`));
        const descM = uaMatch[0].match(new RegExp(`<${NS_RE}Descricao\\b[^>]*>([^<]*)<\\/${NS_RE}Descricao>`));
        if (idM) {
          return { IdUnidade: idM[1].trim(), Sigla: sigM?.[1]?.trim() || "", Descricao: descM?.[1]?.trim() || "" };
        }
      }
      return null;
    })(),
  };
}

export async function consultarDocumento(
  protocoloDocumento: string,
  idUnidade: string
): Promise<SeiDocumento> {
  const soapBody = buildConsultarDocumentoEnvelope(protocoloDocumento, idUnidade);
  const xml = await fetchSoap(soapBody, "Sei#consultarDocumento");
  return parseSoapDocumento(xml);
}

export async function obterLinkDocumento(
  protocoloDocumento: string
): Promise<string | null> {
  let unidades: Unidade[];
  if (env.SEI_ID_UNIDADE) {
    unidades = [{ IdUnidade: env.SEI_ID_UNIDADE, Sigla: env.SEI_ID_UNIDADE, Descricao: "" }];
  } else {
    try {
      unidades = await listarUnidades();
    } catch {
      return null;
    }
  }

  const cremepeUnidades = unidades.filter((u) => u.Sigla.startsWith("CREMEPE"));

  for (const unidade of cremepeUnidades) {
    try {
      const doc = await consultarDocumento(protocoloDocumento, unidade.IdUnidade);
      return doc.LinkAcesso;
    } catch {
      // Unidade não tem acesso, tenta a próxima
    }
  }

  return null;
}

export async function consultarDocumentoFromLink(
  linkAcesso: string
): Promise<ArrayBuffer> {
  const url = linkAcesso.startsWith("http") ? linkAcesso : `${env.SEI_URL.replace(/\/ws\/.*$/, "")}${linkAcesso}`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    throw new Error(`Erro ao baixar documento: ${response.status} ${response.statusText}`);
  }
  return response.arrayBuffer();
}

export interface DocumentoFromAndamento {
  idDocumento: string;
  tipo: string;
  descricao: string;
}

export function extrairDocumentos(andamentos: Andamento[]): DocumentoFromAndamento[] {
  const docs = new Map<string, DocumentoFromAndamento>();

  const patterns: { regex: RegExp; tipo: string; extractor: (m: RegExpMatchArray) => { id: string; desc: string } }[] = [
    {
      regex: /Documento\s+(\d+)\s+\(([^)]+)\)\s+inserido/i,
      tipo: "inserido",
      extractor: (m) => ({ id: m[1], desc: m[2] }),
    },
    {
      regex: /Exclus[aã]o do documento\s+(\d+)/i,
      tipo: "excluido",
      extractor: (m) => ({ id: m[1], desc: "Documento excluído" }),
    },
    {
      regex: /Gerado documento\s+(p[uú]blico|restrito)?\s*(\d+)/i,
      tipo: "gerado",
      extractor: (m) => ({ id: m[2], desc: `Documento ${m[1] || "gerado"}` }),
    },
    {
      regex: /Registro de documento\s+(externo|interno)?\s*(p[uú]blico|restrito)?\s*(\d+)\s*\(([^)]*)\)/i,
      tipo: "registrado",
      extractor: (m) => ({ id: m[3], desc: m[4] }),
    },
    {
      regex: /Documento\s+(\d+)\s+\(([^)]+)\)/i,
      tipo: "referenciado",
      extractor: (m) => ({ id: m[1], desc: m[2] }),
    },
  ];

  for (const andamento of andamentos) {
    for (const { regex, tipo, extractor } of patterns) {
      const matches = andamento.Descricao.matchAll(new RegExp(regex.source, "gi"));
      for (const match of matches) {
        const { id, desc } = extractor(match as any);
        if (!docs.has(id)) {
          docs.set(id, { idDocumento: id, tipo, descricao: desc });
        }
      }
    }
  }

  return Array.from(docs.values());
}
