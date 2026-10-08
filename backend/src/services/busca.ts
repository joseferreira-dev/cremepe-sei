import { prisma } from "../db/prisma.js";

/**
 * Campos pesquisáveis da listagem (GET /api/processos). A ordem importa:
 * a mesma lista é usada para montar `busca_normalizada` e para as
 * condições de LIKE da consulta.
 */
export const CAMPOS_BUSCA = [
  "numeroSei",
  "especificacao",
  "interessados",
  "assuntos",
  "resumoIa",
] as const;

/** Normaliza texto para busca: minúsculas, sem acentos, espaços colapsados. */
export function normalizarBusca(texto: string | null | undefined): string {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tokens da consulta (≥ 2 caracteres) para a busca em duas fases.
 * Consulta sem tokens válidos (ex.: "a") cai no LIKE cru do texto original.
 */
export function tokenizarBusca(consulta: string | null | undefined): string[] {
  const normalizada = normalizarBusca(consulta);
  if (!normalizada) return [];
  return normalizada.split(" ").filter((t) => t.length >= 2);
}

type CamposPesquisaveis = {
  numeroSei?: string | null;
  especificacao?: string | null;
  interessados?: string | null;
  assuntos?: string | null;
  resumoIa?: string | null;
};

/**
 * Valor de `busca_normalizada` de um processo: concatenação normalizada dos
 * campos pesquisáveis. Usado nos writes (sync, criação, edição, resumo IA)
 * e no backfill de boot.
 */
export function montarBuscaNormalizada(p: CamposPesquisaveis): string {
  return normalizarBusca(
    [p.numeroSei, p.especificacao, p.interessados, p.assuntos, p.resumoIa]
      .filter(Boolean)
      .join(" "),
  );
}

/**
 * Preenche `busca_normalizada` das linhas ainda nulas (banco existente,
 * criadas por caminhos de escrita antigos). Auto-healing: roda no boot e
 * não faz nada quando não há pendências.
 */
export async function backfillBuscaNormalizada(): Promise<number> {
  const pendentes = await prisma.process.count({
    where: { buscaNormalizada: null },
  });
  if (pendentes === 0) return 0;

  const LOTE = 200;
  let preenchidos = 0;
  for (;;) {
    const linhas = await prisma.process.findMany({
      where: { buscaNormalizada: null },
      take: LOTE,
      select: {
        id: true,
        numeroSei: true,
        especificacao: true,
        interessados: true,
        assuntos: true,
        resumoIa: true,
      },
    });
    if (linhas.length === 0) break;
    await Promise.all(
      linhas.map((linha) =>
        prisma.process.update({
          where: { id: linha.id },
          data: { buscaNormalizada: montarBuscaNormalizada(linha) },
        }),
      ),
    );
    preenchidos += linhas.length;
  }
  return preenchidos;
}
