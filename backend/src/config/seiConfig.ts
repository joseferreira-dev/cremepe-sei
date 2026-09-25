import { env } from "./env.js";
import { prisma } from "../db/prisma.js";

export interface SeiConfigEfetiva {
  url: string;
  siglaSistema: string;
  identificacaoServico: string;
  idUnidade: string;
}

/** Chaves da tabela `configurations` que sobrescrevem o `.env`. */
export const SEI_CONFIG_KEYS = {
  url: "seiUrl",
  siglaSistema: "seiSiglaSistema",
  identificacaoServico: "seiIdentificacaoServico",
  idUnidade: "seiIdUnidade",
} as const;

/**
 * Configuração efetiva do SEI, lida de forma síncrona pelos builders SOAP.
 * Inicializa com os valores do `.env` e é atualizada por `carregarSeiConfig()`
 * (no startup e após salvar as configurações na administração).
 * Regra: valor vazio/não presente no banco → mantém o do `.env`.
 */
export const seiConfig: SeiConfigEfetiva = {
  url: env.SEI_URL,
  siglaSistema: env.SEI_SIGLA_SISTEMA,
  identificacaoServico: env.SEI_IDENTIFICACAO_SERVICO,
  idUnidade: env.SEI_ID_UNIDADE,
};

export async function carregarSeiConfig(): Promise<void> {
  try {
    const linhas = await prisma.configuration.findMany({
      where: { key: { in: Object.values(SEI_CONFIG_KEYS) } },
    });
    const valores = new Map(linhas.map((l) => [l.key, l.value.trim()]));

    const url = valores.get(SEI_CONFIG_KEYS.url);
    const sigla = valores.get(SEI_CONFIG_KEYS.siglaSistema);
    const ident = valores.get(SEI_CONFIG_KEYS.identificacaoServico);
    const idUnidade = valores.get(SEI_CONFIG_KEYS.idUnidade);

    seiConfig.url = url ? url : env.SEI_URL;
    seiConfig.siglaSistema = sigla ? sigla : env.SEI_SIGLA_SISTEMA;
    seiConfig.identificacaoServico = ident ? ident : env.SEI_IDENTIFICACAO_SERVICO;
    seiConfig.idUnidade = idUnidade ? idUnidade : env.SEI_ID_UNIDADE;
  } catch (e) {
    console.warn("[SEI-CONFIG] Falha ao ler configurações do banco; mantendo valores do .env.", e);
  }
}
