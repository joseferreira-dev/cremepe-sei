import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../config/env.js";

const genAI = new GoogleGenerativeAI(env.LLM_API_KEY);

const RESUMO_PROMPT = `Você é um assistente especializado em processos administrativos do Conselho Regional de Medicina de Pernambuco (CREMEPE).

Analise os documentos abaixo de um processo administrativo e gere um resumo executivo em UM ÚNICO PARÁGRAFO corrido, em texto simples e objetivo (sem Markdown, sem títulos, sem listas, sem negrito, sem asteriscos, sem quebras de linha).

O parágrafo deve permitir que um servidor entenda rapidamente do que trata o processo (assunto principal, partes envolvidas/interessados, tipo de demanda, andamentos e pendências relevantes, setor sugerido para encaminhamento). Use frases curtas e claras. Se alguma informação não for identificável, não invente — simplesmente não a mencione.

Responda APENAS com o parágrafo, sem texto adicional.

Documentos do processo:
`;

// Lista padrão de modelos em ordem de preferência, usada como fallback quando
// o modelo configurado falha (removido, indisponível ou com limite de uso).
const MODELOS_PADRAO = [
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3-flash",
  "gemini-2.5-flash",
];

export async function gerarResumo(textoDocumentos: string): Promise<string> {
  const prompt = RESUMO_PROMPT + "\n\n" + textoDocumentos;

  // Mescla a lista do .env (por ordem de preferência) com a lista padrão,
  // garantindo que nunca fiquemos presos a um único modelo removido.
  const modelos = Array.from(
    new Set([
      ...(env.LLM_MODEL || "")
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean),
      ...MODELOS_PADRAO,
    ])
  );

  let lastError: unknown = null;

  // Tenta cada modelo em sequência. Se um falhar (limite de uso, modelo
  // removido, indisponibilidade), passa para o próximo da lista.
  for (const modelo of modelos) {
    try {
      const model = genAI.getGenerativeModel({ model: modelo });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const texto = response.text();
      if (texto) return texto;
      lastError = new Error(`Modelo ${modelo} retornou resposta vazia.`);
    } catch (err: any) {
      console.warn(`[GEMINI] Modelo "${modelo}" falhou: ${err?.message || err}`);
      lastError = err;
    }
  }

  throw new Error(
    `Falha ao gerar resumo com todos os modelos disponíveis. ` +
    `Último erro: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}
